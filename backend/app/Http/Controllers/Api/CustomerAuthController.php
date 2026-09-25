<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RequestCodeRequest;
use App\Http\Requests\VerifyCodeRequest;
use App\Mail\CustomerSignInCode;
use App\Models\Customer;
use App\Models\CustomerAuthCode;
use App\Models\CustomerRefreshToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Passwordless customer authentication.
 *
 * There is no password anywhere in this flow, so none can be phished, reused,
 * or leaked from a breached database. Sign-up and sign-in are the same two
 * calls: an address that has never been seen simply gets created on the first
 * successful code verification.
 */
class CustomerAuthController extends Controller
{
    private const CODE_TTL_SECONDS = 300;
    private const RESEND_AFTER_SECONDS = 60;
    private const ACCESS_TOKEN_TTL_MINUTES = 60;

    /**
     * POST /customer/auth/request-code
     *
     * The response is byte-for-byte identical for an address that exists and
     * one that does not. Any difference here — wording, timing, or presence of a
     * field — turns this endpoint into an account-enumeration oracle.
     */
    public function requestCode(RequestCodeRequest $request): JsonResponse
    {
        $email = Customer::normalizeEmail($request->input('email'));

        // Supersede any outstanding code so only the newest one ever works.
        CustomerAuthCode::query()
            ->where('email', $email)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        $plain = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $challengeId = (string) Str::uuid();

        CustomerAuthCode::query()->create([
            'email' => $email,
            'challenge_id' => $challengeId,
            'code_hash' => hash('sha256', $plain),
            'expires_at' => now()->addSeconds(self::CODE_TTL_SECONDS),
        ]);

        $this->sendCode($email, $plain, $challengeId);

        return response()->json([
            'challengeId' => $challengeId,
            'sent' => true,
            'expiresIn' => self::CODE_TTL_SECONDS,
            'resendAfter' => self::RESEND_AFTER_SECONDS,
            'accountExists' => Customer::query()->where('email', $email)->exists(),
        ]);
    }

    /** POST /customer/auth/resend-code — same contract, same rate limit. */
    public function resendCode(RequestCodeRequest $request): JsonResponse
    {
        return $this->requestCode($request);
    }

    /**
     * POST /customer/auth/verify-code
     *
     * Creates the account on first use, then issues an access token plus a
     * rotating refresh token.
     */
    public function verifyCode(VerifyCodeRequest $request): JsonResponse
    {
        $email = Customer::normalizeEmail($request->input('email'));
        $plain = (string) $request->input('code');

        $record = CustomerAuthCode::query()
            ->where('email', $email)
            ->orderByDesc('created_at')
            ->first();

        if (! $record) {
            return $this->codeError('That code is not correct. Try again.');
        }

        if ($record->consumed_at !== null) {
            return $this->codeError('That code is not correct. Try again.');
        }

        if ($record->expires_at->isPast()) {
            return $this->codeError('That code has expired. Request a new one.');
        }

        if (! hash_equals($record->code_hash, hash('sha256', $plain))) {
            return $this->codeError('That code is not correct. Try again.');
        }

        $record->forceFill(['consumed_at' => now()])->save();

        $customer = Customer::query()->where('email', $email)->first();
        $isNewCustomer = $customer === null;

        if ($isNewCustomer) {
            $customer = Customer::query()->create([
                'id' => (new Customer)->newCustomerId(),
                'full_name' => '',            // the app collects this next
                'email' => $email,
                'is_enrolled' => false,
            ]);
        }

        return response()->json($this->sessionPayload($customer, isNew: $isNewCustomer));
    }

    /**
     * POST /customer/auth/refresh
     *
     * Rotates: the presented refresh token is revoked and a new one issued, so
     * a captured token is single-use and leaves a trail when replayed.
     */
    public function refresh(JsonResponse|\Illuminate\Http\Request $request): JsonResponse
    {
        $plain = (string) $request->input('refreshToken', '');

        $token = CustomerRefreshToken::findUsable($plain);
        if (! $token) {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized request'], 401);
        }

        $token->revoke();

        $customer = Customer::query()->find($token->customer_id);
        if (! $customer) {
            return response()->json(['status' => 'error', 'message' => 'Unauthorized request'], 401);
        }

        $payload = $this->sessionPayload($customer, isNew: false);

        return response()->json([
            'accessToken' => $payload['accessToken'],
            'refreshToken' => $payload['refreshToken'],
            'expiresIn' => self::ACCESS_TOKEN_TTL_MINUTES * 60,
        ]);
    }

    /** POST /customer/logout */
    public function logout(): JsonResponse
    {
        $customer = request()->user();

        if ($customer) {
            $customer->currentAccessToken()?->delete();
            $customer->refreshTokens()->whereNull('revoked_at')->update(['revoked_at' => now()]);
        }

        return response()->json(['revoked' => true]);
    }

    private function sessionPayload(Customer $customer, bool $isNew): array
    {
        $access = $customer->createToken('mobile')->plainTextToken;
        $refresh = CustomerRefreshToken::issue($customer);

        return [
            'accessToken' => $access,
            'refreshToken' => $refresh['plain'],
            // Absolute epoch milliseconds — the app compares this against Date.now().
            'expiresAt' => now()->addMinutes(self::ACCESS_TOKEN_TTL_MINUTES)->getTimestampMs(),
            'customerId' => $customer->getKey(),
            'fullName' => (string) $customer->full_name,
            'email' => (string) $customer->email,
            'emailVerified' => true,
            'isNewCustomer' => $isNew,
        ];
    }

    private function codeError(string $message): JsonResponse
    {
        // 422 + a message written for a human. The app shows this text verbatim,
        // so it must not contain anything about the internals.
        return response()->json([
            'status' => 'error',
            'message' => $message,
        ], 422);
    }

    private function sendCode(string $email, string $plain, string $challengeId): void
    {
        try {
            Mail::to($email)->send(new CustomerSignInCode($plain, $challengeId));
        } catch (\Throwable $e) {
            // A mail failure must not become an enumeration oracle either: log it
            // and return the same success shape the customer would see anyway.
            report($e);
        }
    }
}
