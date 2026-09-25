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

The real Supabase project cannot currently create accounts (see below), so the
whole app can be run and verified offline:

```bash
npm run dev:mock      # terminal 1 — mock Supabase + the /customer API on :4000
npm run dev:mock:app  # terminal 2 — the app, pointed at the mock
```

Sign in with `asifghe78@gmail.com` / `Passw0rd!`, or create a new account.

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

To sign in from a phone, or a second machine, `127.0.0.1` is not reachable — use
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
| `EXPO_PUBLIC_API_BASE_URL` | no (defaults to the production API) | Public API base URL |
| `EXPO_PUBLIC_ENVIRONMENT` | no | `development` / `preview` / `production` label |
| `EXPO_PUBLIC_SUPABASE_URL` | no | Supabase project URL for direct RLS-scoped reads |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | no | **Publishable / `anon` key only.** Never `service_role` |
| `EXPO_PUBLIC_SUPABASE_READS_ENABLED` | no (defaults to `false`) | Must be `true` only after `npm run verify:rls` passes |

Copy `.env.example` to `.env.local` to set these. `.env.local` is gitignored.

Nothing else belongs in the app. Gateway secrets, Supabase service-role keys,
admin credentials and database passwords live on the backend and must never be
added to `app.config.ts`, `EXPO_PUBLIC_*`, `SecureStore`, `AsyncStorage` or any
bundled asset.

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

> **Live state: the project's built-in mailer is rate limited to a handful of
> messages an hour**, which currently blocks the confirmation and reset emails
> signup depends on. `POST /auth/v1/signup` answers `429 email rate limit
> exceeded` and creates no account at all, so on the real project nobody can
> register and no seeded credential can work. Add a custom SMTP provider
> (Supabase → Settings → Providers → Email → SMTP) before real customers sign
> up; `npm run check:signup` reports which of the two states the project is in.

**Authorization.** Requests are scoped by the session token alone. The app never
sends `customerId`, `deviceId` or `contractId` to authorize anything, and uses
`/devices/me` style endpoints instead of client-chosen identifiers. A 403 is
shown as "you don't have access" and is never retried.

**Payments.** `POST /payments/create` asks the backend for an order; the customer
pays in the gateway; the app then polls `GET /payments/:id/status` until the
backend — which verified the gateway callback — reports a terminal state. A
gateway "success" page is treated as `PENDING`, never `SUCCESS`.

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

> **Live state: the Supabase project's RLS was found disabled.** See
> `sql/fix-rls.sql` and run `npm run verify:rls` after applying it.
> `EXPO_PUBLIC_SUPABASE_READS_ENABLED` stays `false` until it passes.
> `src/supabase/types.ts` is hand-corrected from the live schema; regenerate it
> with `supabase gen types typescript` before relying on it long-term.

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

`app/device/enrollment.tsx` walks through why management is required, what is
collected, what management can and cannot do, what happens when a payment is
overdue, and what happens after a verified payment. The customer then ticks an
explicit consent box and types their full name. The backend records the
customer, the contract, the agreement version and the timestamp
(`POST /agreements/device-management/accept`), then enrollment is attempted
server-side. Nothing is ever enrolled silently.

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
