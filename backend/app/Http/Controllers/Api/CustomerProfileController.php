<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Profile setup for a just-verified address, and profile editing.
 *
 * Note there is no route here that accepts a customer id: the acting customer
 * always comes from the bearer token, so a client cannot act as someone else.
 */
class CustomerProfileController extends Controller
{
    public function show(): JsonResponse
    {
        $customer = request()->user();

        return response()->json([
            'id' => $customer->getKey(),
            'fullName' => (string) $customer->full_name,
            'email' => (string) $customer->email,
            'phone' => $customer->phone_number,
            'language' => $customer->language ?? 'en',
            'verifiedAt' => $customer->created_at?->toIso8601String(),
        ]);
    }

    /**
     * PATCH /customer/profile
     *
     * Accepts `fullName` (used by the finish-setup screen), and optionally
     * `email`, `language` and `phone`.
     */
    public function update(Request $request): JsonResponse
    {
        $customer = request()->user();

        $data = $request->validate([
            'fullName' => ['sometimes', 'required', 'string', 'min:3', 'max:120'],
            'email' => ['sometimes', 'nullable', 'string', 'email:filter', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'language' => ['sometimes', 'nullable', 'in:en,bn'],
            'deviceName' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

        if (array_key_exists('email', $data) && $data['email'] !== null) {
            $normalized = Customer::normalizeEmail($data['email']);
            // A change of address would need re-verification; out of scope here.
            $data['email'] = $normalized;
        }

        if (array_key_exists('fullName', $data)) {
            $data['full_name'] = trim($data['fullName']);
            unset($data['fullName']);
        }

        if (array_key_exists('phone', $data)) {
            $data['phone_number'] = $data['phone'];
            unset($data['phone']);
        }

        // `deviceName` belongs to the device record, not the profile. It is
        // accepted here for the finish-setup screen and handled once the device
        // sync endpoint exists; ignoring it is deliberate rather than storing it
        // in the wrong table.
        unset($data['deviceName']);

        $customer->forceFill($data)->save();

        return response()->json([
            'fullName' => (string) $customer->full_name,
            'email' => (string) $customer->email,
            'phone' => $customer->phone_number,
            'language' => $customer->language ?? 'en',
        ]);
    }
}
