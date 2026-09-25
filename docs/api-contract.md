# Customer API contract

The app talks to exactly one host:

```
https://srabontelecom.paymently.io/customer
```

Not `/api/customer`. `/api/*` has no routes registered — verified by probing
`/api/user` (Laravel's own default route), which returns 404. Everything lives
under the `/customer` prefix.

## What already exists

Confirmed live on the deployed server:

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/customer` | yes | Dashboard root |
| `GET` | `/customer/payments` | yes | Paginated list |
| `POST` | `/customer/payments/create` | yes | Create the gateway order |
| `POST` | `/customer/logout` | yes | Revokes the session |

## What is missing — and why sign-in cannot work

**There is no authentication route on the backend.** Probed exhaustively
(`/api`, `/customer`, `/v1`, `/app`, `/rest`, plus every Laravel/Sanctum
convention); every auth path returns 404. Until one of these exists, the app
cannot sign anyone in, and it correctly shows an error rather than pretending.

### 1. `POST /customer/auth/request-code` — no auth

```jsonc
// request
{ "email": "ayesha@example.com" }

// 200
{
  "challengeId": "b7f1…",
  "sent": true,
  "expiresIn": 300,        // seconds the code stays valid
  "resendAfter": 60,       // seconds before another may be sent
  "accountExists": true
}
```

Rules that matter for security:

- **The response must be identical whether or not the address exists**, apart
  from `accountExists`. A timing or wording difference turns this endpoint into
  an account-enumeration oracle.
- Rate-limit per address **and** per IP. Without it, this is a mail-bomb.
- Store only a hash of the code. Never log it.
- Normalise the address (`strtolower(trim())`) before doing anything, so
  `Ayesha@Example.com` and `ayesha@example.com` cannot become two accounts.

### 2. `POST /customer/auth/verify-code` — no auth

```jsonc
// request
{ "email": "ayesha@example.com", "code": "123456", "challengeId": "b7f1…" }

// 200
{
  "accessToken":  "…",
  "refreshToken": "…",
  "expiresAt":    1790340000000,   // epoch milliseconds
  "customerId":   "CUST-23839",
  "fullName":     "Ayesha Rahman",  // "" for a brand new address
  "email":        "ayesha@example.com",
  "emailVerified": true
}
```

- Return `fullName: ""` for an address that has never signed in before. The app
  then routes to the finish-setup screen. Do **not** make the app call a
  separate register endpoint; this one call covers both sign-in and sign-up.
- `expiresAt` is absolute epoch **milliseconds**, which is what the client uses
  to decide when to refresh.
- Wrong code → `422 {"message":"That code is not correct. Try again."}`.
  Expired → `422 {"message":"That code has expired. Request a new one."}`.

### 3. `POST /customer/auth/resend-code` — no auth

Same body and response as `request-code`, but subject to the same rate limit.

### 4. `PATCH /customer/profile` — auth

```jsonc
// request
{ "fullName": "Ayesha Rahman", "deviceName": "Samsung Galaxy A15" }

// 200
{ "fullName": "Ayesha Rahman" }
```

Also the target for the profile-edit screen, so accept `email` and `language`
as optional fields.

## Response envelope

The client accepts all three of these, so no wrapper is required:

```jsonc
{ "success": true, "data": { … } }   // explicit envelope
{ "data": { … } }                    // Laravel resource style
{ "id": "…", "fullName": "…" }       // bare payload
```

For errors, the existing Laravel shape is used and understood:

```json
{ "status": "error", "message": "Not Found" }
```

The client deliberately **does not** display that `message` for anything other
than 400/422. `Not Found`, `Forbidden`, `Internal Server Error` and friends are
replaced with customer-facing copy, because showing a customer the server's
vocabulary tells them nothing useful. For 400/422 the message is passed through,
so write it for a human: `"That code is not correct. Try again."`

Never put SQL errors, stack traces, file paths, or internal identifiers in a
message that reaches this API.

## Authorization

Every route except the three `/auth/*` ones requires
`Authorization: Bearer <accessToken>`. A missing, malformed or expired token
returns `401`. A valid token that does not own the resource returns `403` —
the app shows "you don't have access" and never retries.

The client sends **no** `customerId`, `deviceId` or `contractId` to authorize
anything. Ownership is resolved from the token. Do not add a body field that
lets a client choose which customer it is acting as.

## Money

`POST /payments/create` takes:

```jsonc
{ "installmentId": "…", "gateway": "bkash", "amount": 2500 }
```

**Re-validate the amount server-side against the contract.** The `amount` the
app sends is display-only and is not trusted. Return:

```jsonc
{
  "paymentId": "…",
  "orderId": "…",
  "redirectUrl": "https://gateway…/checkout/…",   // no secret material
  "gateway": "bkash",
  "expiresAt": "2026-09-25T18:40:00.000Z"
}
```

`GET /payments/{id}/status` must report only what the server has itself
verified from the gateway callback. The app treats a status other than a
confirmed `SUCCESS` as `PENDING` and will not unlock anything on a browser
success page.

## Remaining routes to implement

Everything marked `[todo]` in `src/api/endpoints.ts`:

```
GET    /customer/profile
PATCH  /customer/profile
GET    /customer/dashboard
GET    /customer/settings
PATCH  /customer/settings
GET    /customer/devices/me
GET    /customer/devices/me/status
POST   /customer/devices/me/enroll
POST   /customer/devices/me/sync
GET    /customer/agreements/device-management/current
POST   /customer/agreements/device-management/accept
GET    /customer/installments
GET    /customer/installments/plan
GET    /customer/installments/{id}
GET    /customer/payments/{id}/status
GET    /customer/notifications
POST   /customer/notifications/{id}/read
POST   /customer/notifications/read-all
POST   /customer/notifications/devices
GET    /customer/support/tickets
POST   /customer/support/tickets
GET    /customer/support/tickets/{id}
```

Paginated endpoints return:

```jsonc
{ "items": [ … ], "page": 1, "perPage": 20, "total": 87, "hasMore": true }
```

## Not part of the customer API

- Gateway secrets, payment signing keys, admin credentials, the Supabase
  `service_role` key. All server-side only.
- `devices.state`, `enrollment_status`, `management_status` and `contract_id`
  are server-authoritative. No client may write them, including through
  Supabase. See `sql/01-stop-the-bleed.sql` — that table is currently writable
  by the anonymous key.
