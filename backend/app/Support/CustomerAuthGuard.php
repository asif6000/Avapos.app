<?php

namespace App\Support;

use App\Models\Customer;
use Illuminate\Auth\Guard;

/**
 * Sanctum guard for the mobile app, so `auth:customer` resolves the acting
 * customer from the bearer token rather than the admin session cookie.
 *
 * Register it in bootstrap/app.php:
 *
 *   ->withMiddleware(function (Middleware $middleware) {
 *       $middleware->authenticate('customer', function ($request, array $guards) {
 *           return response()->json(['status' => 'error', 'message' => 'Unauthorized request'], 401);
 *       });
 *   })
 */
class CustomerAuthGuard
{
    public function __construct(private readonly Guard $sanctum) {}

    public function user(): ?Customer
    {
        $token = $this->sanctum->user();

        return $token instanceof Customer ? $token : null;
    }

    public function check(): bool
    {
        return $this->user() !== null;
    }

    public function id(): ?string
    {
        return $this->user()?->getKey();
    }

    public function validate(array $credentials = []): bool
    {
        return $this->check();
    }

    public function setUser(Customer $user): void
    {
        // no-op: the token is the source of truth
    }
}
