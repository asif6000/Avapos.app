# Srabon Telecom — Customer App

React Native + Expo (SDK 57) customer application for mobile devices sold on an
installment (EMI) plan. Customers see their device, installment schedule and
payment history, pay installments, manage notifications, and contact support.

The backend at `https://srabontelecom.paymently.io/api` is the only source of
truth for money and device state. This app never decides that a payment
succeeded, never grants or revokes device access, and never stores a secret.

---

## Quick start

```bash
npm install
npm run start:go     # Expo Go — UI only, no native device-management module
npm run android      # dev client / local native build
npm run verify       # typecheck + lint + tests
```

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
  (auth)/                login, register, otp
  (tabs)/                dashboard, installments, device, payments, support
  device/                enrollment, restriction, restored
  installments/[id]      installment detail
  payments/              create, processing, success, failed, pending, [id]
  notifications/         notification centre
  support/               create ticket, [id]
  settings/              profile, terms, privacy, management agreement, about
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

**Authentication.** Phone + password or phone + OTP. Access and refresh tokens
live in `expo-secure-store` (Android Keystore-backed), never AsyncStorage. The
API client attaches `Authorization: Bearer <access token>`, refreshes once on
expiry with a shared in-flight lock, and funnels every 401 into one sign-out.

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

**Supabase.** The app reads the installment schedule and notification centre
directly from Supabase through PostgREST, scoped by the customer's Supabase JWT
and constrained by RLS. Reads are fail-closed: they stay disabled until
`npm run verify:rls` proves an anonymous request cannot read another customer's
rows, and a `service_role` key in the env is rejected outright. Everything
privileged — payment order creation, payment verification, device state,
agreement acceptance, enrollment — stays on the REST API, where the backend
revalidates the contract. `src/supabase/types.ts` is inferred, not generated:
regenerate it with `supabase gen types typescript` before relying on it.

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
sanitisation), auth store (login, OTP, sign-out, offline, session expiry),
payments (server-verified outcomes only), customer isolation (no client-supplied
identity, 403 handling, amount tampering), offline / device-management
capability reporting, formatting and localization, and a dashboard render test.

Run `npx expo-doctor` after changing dependencies.
