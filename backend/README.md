# Customer auth — install notes

Passwordless email sign-in for the mobile app, written against the API contract
in `docs/api-contract.md`. Sign-up and sign-in are the same two calls: an
address that has never been seen is created on first successful verification.

## What you need to change before it runs

I could not see your schema, only the deployed `profiles` table. Check these:

1. **`Customer::$table` is `profiles`** — the table that actually exists, with
   columns `id, full_name, phone_number, email, is_enrolled, language,
   created_at, updated_at`. If your canonical customer table is named something
   else, point `$table` at it and adjust the fillable columns. Nothing else
   assumes a specific identifier format — `id` is a text key like `CUST-23839`,
   not a uuid.
2. **`Customer` extends `Illuminate\Foundation\Auth\User`** and uses Sanctum's
   `HasApiTokens`. If your app already has a customer model, reuse it and just
   add the `normalizeEmail()` / `findByEmail()` helpers.
3. **`CustomerAuthController::newCustomerId()`** mints `CUST-#####`. Match
   whatever your existing scheme uses.
4. **The mail template** `resources/views/emails/sign-in-code.blade.php` is
   included. Add the `App\Mail\CustomerSignInCode` notification to your
   `MAIL_FROM_ADDRESS` whitelist, or this email will land in spam — and this
   email is the only way a customer can sign in.

## Wire-up

**1. Copy the files in.** `routes/customer-api.php`, `app/Models/*`,
`app/Http/Controllers/Api/*`, `app/Http/Requests/*`, `app/Mail/*`,
`database/migrations/*`.

**2. Load the routes.** In `bootstrap/app.php`:

```php
->withRouting(
    // ... your existing options ...
    then: function () {
        Route::middleware('api')->group(base_path('routes/customer-api.php'));
    },
)
```

**3. Register the guard** in `bootstrap/app.php`:

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'customer.auth' => \App\Support\CustomerAuthGuard::class,
    ]);

    // JSON 401 rather than a redirect to the admin login page.
    $middleware->authenticate('customer', function ($request, array $guards) {
        return response()->json(['status' => 'error', 'message' => 'Unauthorized request'], 401);
    });
})
```

and in `config/auth.php`:

```php
'guards' => [
    'customer' => [
        'driver' => 'sanctum',
        'provider' => 'customers',
    ],
],

'providers' => [
    'customers' => [
        'driver' => 'eloquent',
        'model' => App\Models\Customer::class,
    ],
],
```

**4. Add the rate limiter** in `bootstrap/app.php` (or a service provider):

```php
RateLimiter::for('auth-code', function (Request $request) {
    return Limit::perMinute(5)->by($request->ip())
        ->and(Limit::perHour(15)->by(strtolower((string) $request->input('email'))));
});
```

**5. Migrate.**

```bash
php artisan migrate
```

## Test it

```bash
php artisan test --filter=CustomerAuthTest
```

## Routes provided

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/customer/auth/request-code` | no |
| `POST` | `/customer/auth/resend-code` | no |
| `POST` | `/customer/auth/verify-code` | no |
| `POST` | `/customer/auth/refresh` | no (refresh token in body) |
| `POST` | `/customer/logout` | yes |
| `GET`  | `/customer/profile` | yes |
| `PATCH`| `/customer/profile` | yes |

## Security decisions worth knowing about

- **No `unique` validation on the email.** Rejecting an address that already
  has an account would answer 422 for known addresses and 200 for unknown ones —
  an enumeration oracle. Both cases must succeed identically. The response does
  include `accountExists`, which the app does not branch on and which you can
  delete entirely if you would rather not expose it at all.
- **Codes are hashed, never stored in plaintext**, so a database leak cannot be
  replayed against sign-in.
- **Codes are single-use and superseded.** Requesting a new one invalidates the
  previous.
- **Refresh tokens rotate on use.** Presenting one revokes it and issues a new
  one, so a captured token works at most once and leaves a trace when replayed.
- **A mail failure is logged, not returned.** Otherwise a customer on a failing
  mail provider would see a different response from one who does not exist.
- **No route accepts a customer id.** Ownership is resolved from the bearer
  token, so the client cannot act as another customer.

## Not included

`deviceName` is accepted by `PATCH /profile` for the finish-setup screen but
deliberately not persisted — it belongs on the device record, which does not
have an endpoint yet. Once `/customer/devices/me` exists, store it there.

See `docs/api-contract.md` for the remaining 22 routes the app expects.
