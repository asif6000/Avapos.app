<?php

namespace App\Http\Requests;

use App\Models\Customer;
use Illuminate\Foundation\Http\FormRequest;

class VerifyCodeRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email:filter', 'max:255'],
            'code' => ['required', 'string', 'regex:/^\d{6}$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.email' => 'Enter a valid email address.',
            'code.regex' => 'That code is not correct. Try again.',
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
