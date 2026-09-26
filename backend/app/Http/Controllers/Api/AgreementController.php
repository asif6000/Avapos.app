<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerAgreement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The device-management agreement, and the enrollment that follows it.
 *
 * THE ORDER IS THE WHOLE DESIGN
 *
 *   app installed → agreement accepted → store provisions the phone as an
 *   Android Enterprise device owner → Android's own authorisation prompt →
 *   backend binds the device to the contract
 *
 * `accept` records the agreement **before** any enrollment is attempted, and
 * nothing in this controller enrolls a phone by itself. Android grants
 * device-owner status only to an app an enterprise DPC has provisioned as such;
 * a store-installed app cannot and must not try. What this server can do is
 * record what the customer agreed to, and then report what Android actually did,
 * which is usually "nothing yet".
 *
 * So the enrollment screen *reports* rather than asserts. A shop phone that was
 * never provisioned must never come back looking enrolled, and an unconfirmed
 * binding is reported as waiting.
 */
class AgreementController extends Controller
{
    /**
     * The agreement this customer has already signed, or null.
     *
     * Null is a normal answer and not an error: most customers have not reached
     * this step, and the app shows the consent screen rather than a failure.
     */
    public function current(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $agreement = $customer->agreement()->first();

        if ($agreement === null) {
            return response()->json(['status' => 'error', 'message' => 'Not Found'], 404);
        }

        return response()->json($agreement->present());
    }

    /**
     * Records the signed agreement.
     *
     * SECURITY: the body carries the version, the typed name and the timestamp.
     * It does not carry a device state, and nothing in it is trusted beyond being
     * recorded — accepting an agreement does not enrol a phone, unlock a phone,
     * or alter a payment. The customer's name is stored as typed because a
     * signature is evidence of what a person wrote, not of what a database
     * normalised.
     */
    public function accept(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $data = $request->validate([
            'agreementVersion' => ['required', 'string', 'max:32'],
            'accepted' => ['required', 'in:true,1,yes'],
            'acceptedAt' => ['required', 'date'],
            'signatureName' => ['required', 'string', 'min:2', 'max:120'],
            'deviceName' => ['sometimes', 'string', 'max:120'],
        ]);

        $device = $customer->device()->first();

        $agreement = CustomerAgreement::query()->updateOrCreate(
            ['customer_key' => $customer->getKey()],
            [
                'contract_id' => $device?->contract_id,
                'agreement_version' => $data['agreementVersion'],
                'signature_name' => trim($data['signatureName']),
                'device_name' => $data['deviceName'] ?? $device?->device_name,
                'accepted_at' => $data['acceptedAt'],
            ]
        );

        return response()->json($agreement->present());
    }

    /**
     * Whether the phone is bound to a contract, and what Android reports.
     *
     * Split from `current` because the enrollment screen asks two independent
     * questions: *did the customer agree* (server) and *did the store provision
     * the phone* (Android). Answering them together would let a phone's own
     * report stand in for the customer's consent, or the other way round.
     */
    public function enrollmentStatus(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $device = $customer->device()->first();
        $agreement = $customer->agreement()->first();

        return response()->json([
            'agreed' => $agreement !== null,
            'agreementVersion' => $agreement?->agreement_version,
            'acceptedAt' => $agreement?->accepted_at?->toIso8601String(),
            'deviceBound' => $device !== null,
            'enrollmentStatus' => $device?->enrollment_status ?? 'NOT_ENROLLED',
            'managementStatus' => $device?->management_status ?? 'NOT_ENROLLED',
            'deviceState' => $device?->state,
            'lastSyncedAt' => optional($device?->last_sync_time)->toIso8601String(),
        ]);
    }
}
