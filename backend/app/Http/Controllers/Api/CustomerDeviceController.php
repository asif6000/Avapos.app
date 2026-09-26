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
    public function __construct(
        private readonly DeviceCommandService $commands,
        private readonly \App\Services\Customer\PlanService $plans,
    ) {}

    // -----------------------------------------------------------------------
    // Reading this phone
    //
    // All four routes resolve the device from the session. None of them accepts a
    // device id, a customer id or a contract id, so there is nothing in a request
    // for a modified client to point somewhere else.
    // -----------------------------------------------------------------------

    /**
     * `GET /customer/devices/me`
     *
     * Which phone this account is about.
     *
     * 404 when there is none, rather than a device-shaped null. "This account has no
     * phone on a plan" and "this phone is on a plan" are different answers, and the
     * app shows a different screen for each.
     */
    public function show(Request $request): JsonResponse
    {
        $customer = $request->user();
        $device = $customer->device()->first();

        if ($device === null) {
            return response()->json(['status' => 'error', 'message' => 'Not Found'], 404);
        }

        return response()->json($device->present($customer->agreement()->first()));
    }

    /**
     * `GET /customer/devices/me/status`
     *
     * The authoritative device state.
     *
     * `deviceState` is read from the row and nowhere else. It is written by staff and
     * by a verified payment, and the app is forbidden from inferring it — a missing or
     * stale value surfaces as `null` in the app rather than being guessed at, because
     * a wrong guess here is a customer being told their phone is restricted, or worse,
     * that it is not.
     */
    public function status(Request $request): JsonResponse
    {
        $customer = $request->user();
        $device = $customer->device()->first();

        if ($device === null) {
            return response()->json(['status' => 'error', 'message' => 'Not Found'], 404);
        }

        $installments = $customer->installments()->get();
        $next = $this->plans->nextInstallment($installments);

        return response()->json([
            'deviceState' => $device->state,
            'enrollmentStatus' => $device->enrollment_status,
            'managementStatus' => $device->management_status,
            'lastSyncedAt' => optional($device->last_sync_time)->toIso8601String(),
            // The server's own clock, so the app can tell "your lease expired" from
            // "your phone's clock is wrong".
            'serverTime' => now()->toIso8601String(),
            'outstandingAmount' => $this->plans->outstanding($installments),
            'dueDate' => $next?->due_date?->toDateString(),
            'restrictionReason' => null,
            'unlockAuthorizedAt' => null,
        ]);
    }

    /**
     * `POST /customer/devices/me/enroll`
     *
     * Records the signed agreement against the contract.
     *
     * This is the *first* step of the chain, and it happens before any enrollment is
     * attempted. What it does not do is enroll anything: Android grants device-owner
     * status only to an app an enterprise DPC provisioned, so the most this route can
     * honestly do is write down that the customer agreed and let the phone report what
     * Android said.
     */
    public function enroll(Request $request): JsonResponse
    {
        $customer = $request->user();

        $data = $request->validate([
            'agreementVersion' => ['required', 'string', 'max:32'],
            'signatureName' => ['required', 'string', 'min:2', 'max:120'],
            'acceptedAt' => ['required', 'date'],
            'report' => ['sometimes', 'array'],
            'report.androidId' => ['sometimes', 'nullable', 'string', 'max:128'],
            'report.manufacturer' => ['sometimes', 'nullable', 'string', 'max:80'],
            'report.model' => ['sometimes', 'nullable', 'string', 'max:120'],
            'report.androidVersion' => ['sometimes', 'nullable', 'string', 'max:32'],
            'report.sdkInt' => ['sometimes', 'nullable', 'integer'],
            'report.managed' => ['sometimes', 'boolean'],
            'report.managementStatus' => ['sometimes', 'string', 'max:40'],
            'report.enrollmentStatus' => ['sometimes', 'string', 'max:40'],
        ]);

        $device = $customer->device()->first();

        if ($device === null) {
            return response()->json(
                ['status' => 'error', 'message' => 'No phone is linked to this account.'],
                404
            );
        }

        $customer->agreement()->updateOrCreate(
            ['customer_key' => $customer->getKey()],
            [
                'contract_id' => $device->contract_id,
                'agreement_version' => $data['agreementVersion'],
                'signature_name' => trim($data['signatureName']),
                'device_name' => $device->device_name,
                'accepted_at' => $data['acceptedAt'],
            ]
        );

        $this->recordReport($device, $data['report'] ?? []);

        return response()->json($device->fresh()->present($customer->agreement()->first()));
    }

    /**
     * `POST /customer/devices/me/sync`
     *
     * The phone says what Android says about it; the server answers with the
     * authoritative state afterwards.
     *
     * THE ORDER IS THE POINT. The phone speaks first and the server answers second,
     * so a response is never the phone grading itself. A handset claiming
     * `MANAGED_BY_ENTERPRISE` changes what the panel displays about what the phone
     * said; it does not change what this server will allow, and it cannot write
     * `state` — that column is not in the fillable set of {@see Device} and is not
     * reachable from any route in this controller.
     */
    public function sync(Request $request): JsonResponse
    {
        $customer = $request->user();

        $data = $request->validate([
            'report' => ['sometimes', 'array'],
            'report.androidId' => ['sometimes', 'nullable', 'string', 'max:128'],
            'report.manufacturer' => ['sometimes', 'nullable', 'string', 'max:80'],
            'report.model' => ['sometimes', 'nullable', 'string', 'max:120'],
            'report.androidVersion' => ['sometimes', 'nullable', 'string', 'max:32'],
            'report.sdkInt' => ['sometimes', 'nullable', 'integer'],
            'report.managed' => ['sometimes', 'boolean'],
            'report.managementStatus' => ['sometimes', 'string', 'max:40'],
            'report.enrollmentStatus' => ['sometimes', 'string', 'max:40'],
        ]);

        $device = $customer->device()->first();

        if ($device === null) {
            return response()->json(
                ['status' => 'error', 'message' => 'No phone is linked to this account.'],
                404
            );
        }

        $this->recordReport($device, $data['report'] ?? []);

        // Re-read rather than return the row we just wrote, so the answer is the
        // server's state and not the phone's account of it.
        return response()->json($this->status($request));
    }

    /**
     * Stores what the phone reported, and nothing it decided.
     *
     * The protection against a phone granting itself access is **this list**, not the
     * model's `$fillable`: `state` has to stay fillable because the admin panel writes
     * it through `update()`, and it is absent here because a handset has no business
     * saying it is paid up, unlocked or restricted. `contract_id` is absent for the
     * same reason — the phone does not get to say which contract it is on.
     *
     * `source` flips to `PHONE` the first time a real handset reports in, so a panel
     * showing a seeded row beside a real one can tell which is which.
     *
     * @param  array<string, mixed>  $report
     */
    private function recordReport(Device $device, array $report): void
    {
        if ($report === []) {
            return;
        }

        $device->fill([
            'android_id' => $report['androidId'] ?? $device->android_id,
            'manufacturer' => $report['manufacturer'] ?? $device->manufacturer,
            'model' => $report['model'] ?? $device->model,
            'android_version' => $report['androidVersion'] ?? $device->android_version,
            'android_sdk' => $report['sdkInt'] ?? $device->android_sdk,
            'is_managed' => (bool) ($report['managed'] ?? $device->is_managed),
            'management_status' => $report['managementStatus'] ?? $device->management_status,
            'enrollment_status' => $report['enrollmentStatus'] ?? $device->enrollment_status,
            'last_sync_time' => now(),
            'reported_at' => now(),
            'reported_by' => 'APP',
            'source' => 'PHONE',
        ])->save();
    }

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
