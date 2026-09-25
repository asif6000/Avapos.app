# Backend — Supabase JWT authentication

Supabase Auth now owns sign-in for the mobile app. The app requests an emailed
6-digit code, Supabase issues a session, and that session's access token is
presented as the bearer on every API call.

This replaced a set of local password-based auth routes. Supabase's email
provider is enabled but its **sign-up toggle is off**, so OTP requests return:

```
422 {"error_code":"otp_disabled","msg":"Signups not allowed for otp"}
```

## Before anything works

1. **Enable email sign-up.** Supabase Dashboard → Authentication → Sign In /
   Providers → Email → turn on the provider's signup toggle. Until then the app
   cannot request a code, and no amount of server-side work changes that.

2. **Run `sql/01-stop-the-bleed.sql` and `sql/02-add-auth-link.sql`.** The
   anonymous key can currently read *and write* `devices`. Until RLS is on and
   `profiles.auth_uid` is backfilled, `VerifySupabaseJwt` will correctly refuse
   every request, because no auth user can be matched to a customer.

## What is here

```
routes/customer-api.php                      the customer API routes
app/Http/Middleware/VerifySupabaseJwt.php    validates the Supabase access token
app/Http/Controllers/Api/CustomerPaymentController.php
config/supabase.php
```

## Wire-up

**1. Copy** the four files above into the Laravel app.

**2. Add the project ref** to `.env`:

```dotenv
SUPABASE_PROJECT_REF=vslediphrlrlhrormmxh
```

**3. Register the middleware alias** in `bootstrap/app.php`:

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'supabase.jwt' => \App\Http\Middleware\VerifySupabaseJwt::class,
    ]);
})
```

**4. Load the routes from the `api` group**, not `web`:

```php
->withRouting(
    then: function () {
        Route::middleware('api')->group(base_path('routes/customer-api.php'));
    },
)
```

Using the `web` group puts CSRF in front of these routes and every request from
the app comes back `419`. That is a routing mistake, not an auth failure.

**5. Add the `Customer` model** if the app does not have one. It must expose
`auth_uid` (the Supabase user id) so the middleware can resolve it:

```php
// app/Models/Customer.php
protected $table = 'profiles';

public static function findBySupabaseUserId(string $userId): ?self
{
    return static::query()->where('auth_uid', $userId)->first();
}
```

The middleware queries `where('auth_uid', $userId)`. Adjust the column if your
customer table is named differently.

**6. Point the payment controller at your models.** `findInstallment()` and
`store()` are marked `TODO` — they need your installment model and your gateway
SDK. The amount check is the part that matters: the `amount` the phone sends is
display-only and is compared against the contract, with a mismatch logged.

## How the token is verified

1. The JWT signature is checked against the project's JWKS, fetched from
   `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` and cached an hour.
   A token whose signature does not verify is rejected, so `sub` cannot be
   forged by editing a decoded token.
2. `iss` and `aud` must both equal `https://<ref>.supabase.co/auth/v1`, so a
   token minted for a different Supabase project is refused.
3. `role` must be `authenticated`. An `anon` token is never an identity.
4. `exp` must be in the future.
5. Only then is `sub` used — and only to *look up* a customer via `auth_uid`.
   No matching row means 401.

## Why the client is never trusted

The app sends no customer id anywhere. Ownership is the token's `sub` resolved
through `profiles.auth_uid`, so a signed-in customer cannot read or change
anyone else's payments, and cannot write `devices.state` to unlock a phone.
Those columns stay server-authoritative: only this API, after verifying a
gateway callback, may change them.
