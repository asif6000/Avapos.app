# Srabon Telecom — Customer App

React Native + Expo (SDK 57) customer application for mobile devices sold on an
installment (EMI) plan. Customers see their device, installment schedule and
payment history, pay installments, manage notifications, and contact support.

The backend at `https://srabontelecom.paymently.io/customer` is the only source
of truth for money and device state. The prefix is `/customer`, not `/api` — see
`docs/api-contract.md` for the exact routes, the three that are live, and the
ones still to be implemented. This app never decides that a payment
succeeded, never grants or revokes device access, and never stores a secret.

---

## Quick start

```bash
npm install
npm run start:go     # Expo Go — UI only, no native device-management module
npm run android      # dev client / local native build
npm run verify       # typecheck + lint + tests
```

### Running against local mock data

The real Supabase project cannot serve the app yet (see the live state notes
below), so the whole app can be run and verified offline against the mock:

```bash
npm run dev:mock      # terminal 1 — mock Supabase + the /customer API on :4000
npm run dev:mock:app  # terminal 2 — the app, pointed at the mock
```

Sign in with `asifghe78@gmail.com` / `Passw0rd!`, or create a new account.

**From a phone or a second machine**, `127.0.0.1` means *that* machine, so the
two-terminal setup above cannot work: the phone cannot reach the mock, and the
tunnel or LAN address only reaches the port serving the app. Two ways out:

```bash
npm run dev:mock            # terminal 1 — the mock, as above
npm run dev:mock:proxy      # terminal 2 — dev proxy on :8081 (mock API + Expo)
npm run dev:mock:app:proxy  # terminal 3 — Expo on :8083 with same-origin env
```

`scripts/dev-web-proxy.mjs` serves the app and the API from one port, and the
app is then same-origin with its own API, so a browser makes no preflight and no
CORS headers are needed. Open whatever address already points at `:8081` — the
tunnel, or a LAN address — and everything works: all five tabs read the mock's
assembled views. `EXPO_PUBLIC_SUPABASE_URL=same-origin` is the switch, it
resolves on web builds only, and no build profile sets it.

Build the app first for the steadier version — a static bundle has no Metro in
the loop, so nothing the bundler does can take the page away mid-demo. The proxy
serves `dist/` when it exists and falls back to Expo otherwise:

```bash
EXPO_PUBLIC_SUPABASE_URL=same-origin \
EXPO_PUBLIC_API_BASE_URL=same-origin/customer \
EXPO_PUBLIC_SUPABASE_ANON_KEY=local-dev-anon-key \
EXPO_PUBLIC_SUPABASE_READS_ENABLED=true \
npx expo export -p web --output-dir dist
```

Use `--supervise` (both `dev:mock:keep` and `dev:mock:proxy:keep` do) when the
stack has to survive unattended: a supervisor that holds no port re-forks the
one that does, which is the only way to recover from a signal no handler can
catch. `MOCK_PORT` moves the mock off a port something else already owns, and
`MOCK_ORIGIN` points the proxy at it.

**Those credentials exist only in the mock.** A build started any other way —
`npm run web`, `npm start`, an EAS build — reads `.env.local` and points at the
real project, which has no such account and cannot create one while the
built-in mailer is rate limited. That is not a wrong password: the screen says
"That email address or password is not correct." for every refusal on purpose,
and in a dev build the console says which one it was. Check the banner:

```
[auth] signIn refused against https://<project>.supabase.co: no such address, or the password is wrong
```

`npm run check:signup` reports the same thing for sign-up.

To point a *native* build at a mock on your network instead, use
`npm run dev:mock:lan`, which binds the LAN interface and prints an address to
put in `EXPO_PUBLIC_SUPABASE_URL`.

The mock refuses to start when `NODE_ENV=production`, refuses to bind anything
but loopback without `--allow-remote`, and `eas.json` pins the real project URL
in every profile — so no build can point at it. It also refuses writes to every
table, mirroring the RLS policies, and a payment only reaches `SUCCESS` through
an explicit stand-in for a verified gateway callback.

`npm run prebuild` regenerates the native project. Production builds go through
EAS (`eas.json` has `development`, `preview`, `production` profiles).

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | no (defaults to the production API) | Public API base URL. `same-origin/customer` on a web dev build behind the proxy |
| `EXPO_PUBLIC_ENVIRONMENT` | no | `development` / `preview` / `production` label |
| `EXPO_PUBLIC_SUPABASE_URL` | no | Supabase project URL for direct RLS-scoped reads. `same-origin` on a web dev build behind the proxy |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | no | **Publishable / `anon` key only.** Never `service_role` |
| `EXPO_PUBLIC_SUPABASE_READS_ENABLED` | no (defaults to `false`) | Must be `true` only after `npm run verify:rls` passes |

Copy `.env.example` to `.env.local` to set these. `.env.local` is gitignored.

Nothing else belongs in the app. Gateway secrets, Supabase service-role keys,
admin credentials and database passwords live on the backend and must never be
added to `app.config.ts`, `EXPO_PUBLIC_*`, `SecureStore`, `AsyncStorage` or any
bundled asset.

## Design system

One source for spacing, radii and touch targets: `src/theme/layout.ts`. Screens
do not invent their own numbers — a gap, a radius and a minimum target come from
`spacing`, `radius` and `MIN_TAP_TARGET` (48dp, which is the difference between a
button you can hit while walking and one you cannot).

Responsive behaviour is a component, not a per-screen decision. `useLayout()`
reports the window width and `Container` caps content at 720dp and centres it, so
a tablet or a landscape phone does not stretch one column of text to the far
edge; `StatTile` and `ListRow` reflow on their own. Anything that needs a
breakpoint asks `useLayout()`, not `Dimensions.get()`.

The shared building blocks, and what they are for:

| Component | Use it for |
| --- | --- |
| `AppButton` | Every button. Five variants, two sizes, always a 48dp ripple |
| `Field` | Every input. Label above, validation message in the same place |
| `ListRow` | Every list row: title, detail, trailing value, chevron only if it goes somewhere |
| `StatTile` | A number with its label — money, dates, counts |
| `SectionCard` / `InfoRow` | The only container and the only label/value pair |
| `StatusBadge` | Server-provided state. The dot carries the emphasis, so the text is sentence case |
| `EmptyState` / `ErrorState` | Nothing to show, and something that failed. `ErrorState` offers sign-out where the customer is signed in, so a broken screen is never a dead end |

## Layout

```
app/                     expo-router routes
  (auth)/                login (email), register (finish setup)
  (tabs)/                dashboard, installments, device, payments, support
  device/                enrollment, restriction, restored
  installments/[id]      installment detail
  payments/              create, processing, success, failed, pending, [id]
  notifications/         notification centre
  support/               create ticket, [id]
  settings/              profile, terms, privacy, agreement, supabase-link, about
src/
  api/                   client, endpoints, errors, query client
  auth/                  SecureStore token storage, session manager, events
  components/            shared UI (Screen, cards, badges, skeletons, states)
  config/                agreement version
  content/               legal copy
  hooks/                 TanStack Query bindings, theme + translation hooks
  i18n/                  en / bn dictionaries and `t()`
  native/                JS side of the Kotlin device-management module
  services/              deviceManagement, payments, notifications, backgroundSync
  store/                 zustand stores (auth, preferences, network, payment flow)
  types/                 domain and transport types
  utils/                 ৳ currency, dates, phone helpers
modules/                 local Expo module (Kotlin, read-only status reporting)
plugins/                 config plugins
__tests__/               jest suites
```

## Security model

**Authentication.** Supabase Auth owns it: the customer enters an email address
and a password. Sign-up and sign-in both go through
`signUp` / `signInWithPassword`. Sign-up and sign-in are the same call — a new address
simply has no name yet, so the app asks for one afterwards. Addresses are
normalized (trimmed, lowercased) inside the store, not by callers, so
`Ayesha@Example.com` and `ayesha@example.com` can never become two accounts.
Password strength is enforced on the device before transmission (8+ characters
with upper, lower and a digit), the password is never persisted or logged, and
every failure returns one message so the endpoint cannot be used to discover
which addresses have accounts.

Supabase is the identity provider because the backend has no `/auth/*` routes to
call, and because RLS is evaluated against `auth.uid()` — without a real session
every policy denies everything. The session JWT is what the API client sends as
its bearer; the backend verifies that JWT's signature against the project's JWKS
before trusting a claim (`backend/app/Http/Middleware/VerifySupabaseJwt.php`).
The client owns no refresh logic: a 401 means the session is gone, and the only
honest response is to sign out. The Supabase session itself lives in
AsyncStorage, since that is what it is; the app stores no other secret.

> **Live state: "Confirm email" is now OFF on the project**
> (`mailer_autoconfirm: true`, measured via `/auth/v1/settings`), so signup
> issues a session immediately and the mailer rate limit no longer blocks
> anything. `asifghe78@gmail.com` / `Passw0rd!` exists on the **real** project
> now, not only in the mock, and `POST /auth/v1/token?grant_type=password`
> returns 200 for it. Two consequences worth remembering:
>
> - No address is verified any more. Anyone who can type an address can hold a
>   session, which is why `sql/04-link-demo-customer.sql` deliberately does *not*
>   create a profile row per signup: a customer row is what the backend
>   authorises, and a phone must never be able to mint one. Add a custom SMTP
>   provider (Supabase → Settings → Providers → Email → SMTP) and turn
>   confirmation back on before real customers sign up.
> - `npm run check:signup` still reports which state the project is in.

**Authorization.** Requests are scoped by the session token alone. The app never
sends `customerId`, `deviceId` or `contractId` to authorize anything, and uses
`/devices/me` style endpoints instead of client-chosen identifiers. A 403 is
shown as "you don't have access" and is never retried.

**Payments.** `POST /payments/create` asks the backend for an order; the customer
pays in the gateway; the app then polls `GET /payments/:id/status` until the
backend — which verified the gateway callback — reports a terminal state. A
gateway "success" page is treated as `PENDING`, never `SUCCESS`.

**The gateway key lives on the server, and only on the server.** It is read from
the backend's environment (`backend/config/payment.php`) and never reaches the
app: not in `EXPO_PUBLIC_*` (those are inlined into the shipped bundle), not in
SecureStore, not in AsyncStorage. With a merchant key, anybody who unzips the
app could create orders no installment backs.
`__tests__/noSecretsInClient.test.ts` fails the build if a credential-shaped name
or value ever appears in `src/`, `app/`, `plugins/`, `modules/` or the app
config, and the backend is the only place `PaymentProcessor` moves a payment to
SUCCESS.

The gateway is **UddoktaPay**, self-hosted at
`https://srabontelecom.paymently.io`, and it is reached only from the backend
(`backend/config/payment.php` → `Services/Payments/HttpPaymentGateway.php`).
The chain, in order, all of it server-side:

```
app → POST /customer/payments/create   (amount re-read from the contract)
     → POST {gateway}/api/checkout-v2  (RT-UDDOKTAPAY-API-KEY header; the
                                        response is a checkout URL and no
                                        invoice id)
     → customer pays on the gateway page
     → GET  /customer/payment/return    (browser, carries ?invoice_id=)
        POST /api/gateway/ipn           (UddoktaPay's own callback)
     → POST {gateway}/api/verify-payment  (asked what happened — the callback
                                        body is never believed)
     → settleFromInvoice               (the payment is identified from the
                                        *verified* metadata; only now may it
                                        become SUCCESS, the installment is
                                        marked paid, and a fully settled plan
                                        releases the device)
     → app polls GET /customer/payments/{id}/status
```

Two UddoktaPay behaviours are load-bearing here. Its create response contains no
invoice id, only a `payment_url`, so nothing can be verified until a return or an
IPN has supplied one. And it does not sign its callbacks, which is precisely why
the handlers verify through the API and match on the metadata UddoktaPay echoes
back, instead of trusting the body that arrived.

**Device state.** `DeviceState` always comes from `/devices/me/status`. A missing
or stale server value surfaces as `null` and is never inferred locally. The
restriction screen is an ordinary app screen; it does not imitate an Android
system screen and does not touch any Android security setting.

**Push notifications.** A payload only triggers a refetch. It can never move the
UI into an unlocked, paid or restored state on its own.

**Offline.** Cached data stays visible, but no financial or device-management
decision is made offline. Reconnecting triggers a single refetch.

**Direct reads.** The app can read the notification centre straight from Supabase
through PostgREST, scoped by the customer's Supabase JWT and constrained by RLS.
Reads are fail-closed: they stay disabled until `npm run verify:rls` proves an
anonymous request can neither read nor write any of those tables, and a
`service_role` / `sb_secret_` key in the env is rejected outright. Everything
privileged — payment order creation, payment verification, device state,
agreement acceptance, enrollment, and anything written — stays on the REST API,
where the backend revalidates the contract. `src/supabase/queries.ts` contains
no `.insert()`, `.update()`, `.upsert()` or `.delete()`, enforced by a test.

> **Live state: the deployed API sends no CORS headers**, so no web build can
> read it — a browser discards a response without
> `Access-Control-Allow-Origin`, `fetch` rejects, and the app says "Unable to
> reach our servers" about a server that is answering perfectly well. Native
> builds are unaffected (React Native's fetch ignores CORS). Measured: the
> preflight to `/customer` answers 200 with zero `access-control-*` headers. The
> config is `backend/config/cors.php`; it has to be deployed and the cached
> config cleared, so **this is not fixable from the app**. `ApiClient` logs the
> destination of an unanswered request in `__DEV__` precisely so the next time
> this happens it takes a minute rather than an afternoon.
>
> **Live state: most of what the app calls is not deployed.** Measured against
> the live server with a valid session: `GET /customer` → 401 (no linked
> customer), `GET /customer/payments` → 401 (same), `GET /customer/dashboard` →
> 404, `GET /customer/profile` → 404. So once CORS and the customer link are in
> place, the **Payments tab works** and Home, Device, Installments and Support
> still error — those screens read the server-assembled views the contract
> describes but the server has not built. The fix is those routes, not the app:
> assembling device or installment state on the device to work around it is
> exactly what this design forbids.
>
> **Live state: none of `sql/01-stop-the-bleed.sql`, `02-add-auth-link.sql` or
> `03-owner-policies.sql` has been applied to the live project.** Measured: the
> publishable key can read every table it should not (`profiles` returns 200,
> so RLS is off), `profiles.auth_uid` does not exist, `profiles` has no rows,
> and `payments` has no owner column. Consequences, in order of what you hit
> first:
>
> 1. `GET /customer` answers **401 "Unauthorized request"** even for a valid
>    session: the backend resolves the customer with
>    `Customer::where('auth_uid', $userId)`
>    (`backend/app/Http/Middleware/VerifySupabaseJwt.php:60`) and there is no
>    column and no row to match. Run `sql/04-link-demo-customer.sql` first —
>    it adds the column, creates the one demo customer, links it by email and
>    adds `payments.customer_key`, which the deployed
>    `CustomerPaymentController` queries but the live table lacks.
> 2. `EXPO_PUBLIC_SUPABASE_READS_ENABLED` stays `false`: direct PostgREST reads
>    are not scoped to anyone until 01 and 03 are run and
>    `npm run verify:rls` passes.
> 3. `src/supabase/types.ts` is hand-corrected from the live schema; regenerate
>    it with `supabase gen types typescript` before relying on it long-term.

**Permissions.** `plugins/withDeviceManagement.ts` strips every Android
permission outside its allow-list at prebuild time, and `app.config.ts`
`blockedPermissions` removes the dangerous ones. The app requests no
accessibility, notification-listener, overlay, usage-stats, storage, location,
contacts, SMS, camera or microphone access.

## Device management

`modules/srabon-device-management` is a Kotlin Expo module that **only reports**:

- `isDeviceManaged()` — is this app device owner / profile owner
- `isDeviceOwner()`, `getDeviceOwnerPackage()`, `hasActiveProfileOwner()`
- `getManagementStatus()`, `getEnrollmentStatus()`
- `getDeviceIdentifiers()` — model, manufacturer, Android version, Android ID

It contains no `lockNow()`, `wipeData()`, `resetPassword()`, no
`DeviceAdminReceiver`, no `BIND_DEVICE_ADMIN`, no root, no hidden API, no
AccessibilityService.

On a retail phone, Android reports no device owner, so
`deviceManagementService` returns `NOT_ENROLLED` / `UNSUPPORTED` and the UI says
so. That is a correct answer, not an error to work around. Android only grants
device owner status to an app an enterprise DPC (or a test harness provisioning a
fully-managed device) has set up, and a store-installed customer app cannot and
must not try. The native module is only present in a **development build**; in
Expo Go the app degrades gracefully to `UNSUPPORTED`.

## Enrollment and consent

The sale happens in this order, and the app mirrors it step for step:

```
app installed → agreement accepted → store provisions the phone as an
Android Enterprise device owner → Android's own authorisation prompt →
backend binds the device to the contract
```

`app/device/enrollment.tsx` walks the customer through that chain before asking
for anything: why management is required, what is collected, that the *store*
provisions the phone and the app cannot enrol itself, what management can and
cannot do, what happens when a payment is overdue, what happens after a verified
payment, and — stated plainly, because a financing sale depends on it — what no
customer app can do:

- uninstall is blocked by Android only on a phone provisioned as a device owner
  (fully managed); on a normal phone the customer can uninstall it, and doing so
  does not cancel the agreement
- nothing here attempts to stop a factory reset, a bootloader unlock or a
  re-flash: those are the manufacturer's and Android's, not an app's
- the app is never hidden, never disguised, and takes no accessibility,
  notification-listener or background permissions beyond what Android
  Enterprise management itself requires

The customer then ticks an explicit consent box and types their full name. The
backend records the customer, the contract, the agreement version and the
timestamp (`POST /agreements/device-management/accept`) **before** any enrollment
is attempted. Nothing is ever enrolled silently.

After acceptance the screen *reports* the outcome of each step rather than
asserting it: the agreement version and timestamp, what Android reports
(`ENROLLED`, `NOT_ENROLLED`, `UNSUPPORTED`, `PENDING`, `ENROLLMENT_FAILED`), and
whether the server has confirmed the binding. A shop phone that was never
provisioned must never come back looking enrolled, and an unconfirmed binding is
reported as waiting. "Check again" re-reads both, for a phone provisioned after
the sale.

Change the agreement text in `src/content/legal.ts` and bump
`DEVICE_MANAGEMENT_AGREEMENT_VERSION` in `src/config/agreement.ts`.

## Testing

```bash
npm test
```

Suites: API client (auth header, refresh, 401 funnel, retry policy, error
sanitisation), auth store (login, sign-up, sign-out, offline, session expiry),
auth messages (one message for every refusal, no phone wording on an email
screen, transport failures caught, no password logged), payments
(server-verified outcomes only), customer isolation (no client-supplied
identity, 403 handling, amount tampering), offline / device-management
capability reporting, formatting and localization, and a dashboard render test.

Run `npx expo-doctor` after changing dependencies.
