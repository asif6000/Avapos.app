# Backend — Supabase JWT authentication

Supabase Auth owns sign-in for the app. The customer enters an email address and
a password, Supabase issues a session, and that session's access token is
presented as the bearer on every API call.

This replaced a set of local password-based auth routes.

## Before anything works

1. **Run `sql/04-link-demo-customer.sql`**, then `sql/01-stop-the-bleed.sql` and
   `sql/03-owner-policies.sql`. The anonymous key can currently read *and write*
   customer tables, and `VerifySupabaseJwt` will correctly refuse every request
   until an auth user can be matched to a customer row, because it looks the
   customer up with `where('auth_uid', $userId)`.

2. **Publish the CORS config** (`config/cors.php`, in this directory). A web
   build cannot read a single response without it. See step 7 below.

## What is here

```
routes/customer-api.php                      the customer API routes
app/Http/Middleware/VerifySupabaseJwt.php    validates the Supabase access token
app/Http/Controllers/Api/CustomerPaymentController.php
config/supabase.php
config/cors.php                               so a web build can read responses
```

## Wire-up

**1. Copy** the files above into the Laravel app.

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

**7. The payment gateway (UddoktaPay).** Set these in the server's `.env`:

```bash
UDDOKTAPAY_API_KEY=…                     # Dashboard → API Keys
UDDOKTAPAY_BASE_URL=https://srabontelecom.paymently.io   # the installation, NOT …/api
UDDOKTAPAY_RETURN_URL=https://srabontelecom.paymently.io/customer/payment/return
UDDOKTAPAY_CANCEL_URL=https://srabontelecom.paymently.io/customer/payment/cancel
UDDOKTAPAY_WEBHOOK_URL=https://srabontelecom.paymently.io/api/gateway/ipn
```

The key travels in the `RT-UDDOKTAPAY-API-KEY` header and nowhere else. The
adapter speaks the documented API: `POST /api/checkout-v2` creates the order and
`POST /api/verify-payment` takes an `invoice_id`.

Two things about UddoktaPay that shape the design:

- **The create response carries no invoice id**, only a `payment_url`. The
  invoice id arrives on the return URL (a `GET` with `invoice_id`) and in the
  IPN body, so a payment cannot be verified until one of those has been seen.
- **There is no callback signature.** So a callback is never believed: both
  handlers ask UddoktaPay what really happened, and the payment is identified
  from the `metadata` that comes back — not from the request. A stranger posting
  somebody else's invoice id settles nothing, because the verified metadata does
  not name a payment we hold.

**8. CORS, for the web build.** Copy `config/cors.php` across, or merge its keys
into the one the app already has, and clear the cached config:

```bash
php artisan config:clear
```

Native builds do not care — React Native's fetch ignores CORS. A browser does,
and without these headers it discards the response and rejects the request, so
the app shows "Unable to reach our servers" for a server that is answering
correctly. Check it with:

```bash
curl -sI -X OPTIONS https://srabontelecom.paymently.io/customer \
  -H 'Origin: http://localhost:8081' \
  -H 'Access-Control-Request-Method: GET' | grep -i access-control
```

An empty answer means the config is not loaded. `supports_credentials` is false
because the credential is a bearer token, never a cookie.

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
