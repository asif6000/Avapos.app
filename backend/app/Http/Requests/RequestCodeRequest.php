<?php

namespace App\Http\Requests;

use App\Models\Customer;
use Illuminate\Foundation\Http\FormRequest;

class RequestCodeRequest extends FormRequest
{
    /**
     * NOTE: deliberately no `unique` rule.
     *
     * Rejecting an address that already has an account would return 422 for
     * known addresses and 200 for unknown ones — which is precisely the
     * enumeration oracle this endpoint must not be. Both cases are valid input
     * and get the same response.
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email:filter', 'max:255'],
        ];
    }

    public function messages(): array
    {
        // Identical wording regardless of cause, so a malformed address and an
        // unknown one are indistinguishable in the error text too.
        return [
            'email.email' => 'Enter a valid email address.',
            'email.required' => 'Enter a valid email address.',
            'email.max' => 'Enter a valid email address.',
            'email.string' => 'Enter a valid email address.',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('email')) {
            $this->merge([
                'email' => Customer::normalizeEmail((string) $this->input('email')),
            ]);
        }
    }
}
