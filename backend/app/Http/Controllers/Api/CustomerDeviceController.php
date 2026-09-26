<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Services\Devices\DeviceCommandService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The device's side of device management.
 *
 * Two routes, and together they are the only path by which a command issued in the
 * admin panel ever gets carried out. Nothing here decides anything: the phone asks
 * what it has been told to do, does it or refuses, and says which.
 *
 * ## Why these routes exist at all
 *
 * Before them, the panel could record that staff had asked a phone to lock, unlock,
 * release or hand itself back — and then nothing would ever happen, because
 * `DeviceCommandService::reportOutcome()` had no caller. Every command would sit at
 * `REQUESTED` for ever, and "locked" in the panel would be a thing somebody in an
 * office decided rather than a thing that happened. These routes are the missing
 * half: the phone asking, and the phone answering.
 *
 * ## The four properties that matter
 *
 * 1. **No client-supplied identity.** Neither route accepts a customer id, a device
 *    id, or a contract id. The device is resolved from the session by
 *    `VerifySupabaseJwt`, exactly as everywhere else. A modified request cannot ask
 *    what somebody else's phone has been told to do, and `reportOutcome()` re-checks
 *    that the command belongs to this device — so a valid customer cannot post an
 *    outcome onto a command aimed at another handset and make the panel claim that
 *    phone was released.
 * 2. **Only the phone may write an outcome.** The admin API has no route for it, by
 *    design, for the same reason there is no "mark this payment paid".
 * 3. **A lock arrives with its expiry.** `leaseExpiresAt` is the expiry staff
 *    requested, read from the row. The phone enforces its own ceiling on top, and
 *    refuses a `LOCK` that carries no expiry at all.
 * 4. **A failed report is a failed report.** If the phone cannot apply a command, or
 *    cannot reach this server, it says so and the command stays `REQUESTED`. A
 *    command that has genuinely been carried out is never reported twice, so a
 *    retried check-in cannot overwrite a real answer with a different one.
 */
class CustomerDeviceController extends Controller
{
    public function __construct(private readonly DeviceCommandService $commands) {}

    /**
     * `GET /customer/device/commands`
     *
     * What this phone has been asked to do and has not yet answered.
     *
     * 404 rather than an empty list when the customer has no device on a contract:
     * "you have no phone on a plan" and "your phone has nothing to do" are different
     * answers, and returning an empty array for both would let a panel mistake a
     * mis-linked customer for a quiet one.
     */
    public function commands(Request $request): JsonResponse
    {
        $device = $this->deviceFor($request);

        if ($device === null) {
            return response()->json([
                'status' => 'error',
                'message' => 'No phone is linked to this account.',
            ], 404);
        }

        return response()->json([
            'deviceId' => $device->getKey(),
            'commands' => $this->commands->pendingFor($device),
        ]);
    }

    /**
     * `POST /customer/device/commands/{id}/outcome`
     *
     * What the phone did.
     *
     * The note is required, and it is the phone's own words. `APPLIED` with an
     * explanation is what an operator reads when a customer phones to say "it locked
     * while I was at work"; `FAILED` with an explanation is what stops them pressing
     * the button again for a phone that was never provisioned.
     */
    public function commandOutcome(Request $request, string $id): JsonResponse
    {
        $device = $this->deviceFor($request);

        if ($device === null) {
            return response()->json([
                'status' => 'error',
                'message' => 'No phone is linked to this account.',
            ], 404);
        }

        $data = $request->validate([
            // `REQUESTED` is absent on purpose: a phone cannot re-request a command,
            // and the server never accepts a request from a phone at all.
            'outcome' => ['required', Rule::in(['APPLIED', 'FAILED', 'REFUSED'])],
            'note' => ['required', 'string', 'min:2', 'max:600'],
        ]);

        $recorded = $this->commands->reportOutcome(
            $device,
            $id,
            $data['outcome'],
            $data['note'],
            // The device names itself. It cannot be set from the request, so a phone
            // cannot file a report under another phone's name.
            (string) $device->getKey(),
        );

        if (! $recorded) {
            // Either there is no such command for this device, or it has already been
            // answered. Both are refusals rather than errors: the phone's second
            // attempt at a command it already reported is not a failure of anything.
            return response()->json([
                'status' => 'refused',
                'message' => 'That command is not waiting to be answered by this phone.',
            ], 409);
        }

        return response()->json([
            'status' => 'ok',
            'reported' => true,
            'command' => $id,
            'outcome' => $data['outcome'],
        ]);
    }

    /**
     * The phone behind this session, or null.
     *
     * The customer comes from `VerifySupabaseJwt`'s user resolver, which already
     * refused any session not linked to a real customer row. There is deliberately
     * no fallback to a device id in the request: that is the one route in this
     * controller where such a shortcut would be most tempting and most damaging.
     */
    private function deviceFor(Request $request): ?Device
    {
        $customer = $request->user();

        if ($customer === null) {
            return null;
        }

        return Device::query()
            ->where('customer_key', $customer->getKey())
            ->orderBy('id')
            ->first();
    }
}
