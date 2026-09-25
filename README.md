FINAL MASTER PROMPT

REACT NATIVE EXPO CUSTOMER INSTALLMENT DEVICE MANAGEMENT APP

You are a senior React Native + Expo engineer, TypeScript architect, Android Enterprise integration engineer, API integration engineer, payment integration engineer, security engineer, and UI/UX developer.

Build ONLY the CUSTOMER MOBILE APP using React Native + Expo.

The app is a legitimate installment-based mobile device management application for customers who legally purchase/finance mobile devices from our business.

The customer must explicitly agree to device-management terms during enrollment.

The application must be transparent, secure, production-ready, and compatible with Android and Google Play requirements.

============================================================

1. TECHNOLOGY STACK
   ============================================================

Use:

React Native

Expo

TypeScript

Expo Router OR the existing navigation architecture

React Native Paper / NativeWind / existing UI system where appropriate

TanStack Query where appropriate

Zustand OR existing state management

Expo SecureStore

Expo Notifications

Expo Network

Expo Device

Expo Application

Expo Constants

Expo Linking

Expo WebBrowser where appropriate

Expo Dev Build

EAS Build

Firebase Cloud Messaging / Expo-compatible notification architecture according to the existing project

Android native modules only where genuinely required.

IMPORTANT:

Do NOT assume Expo Go supports Android Enterprise / DevicePolicyManager.

If official device-management functionality requires native Android APIs:

Use:

Expo Development Build

Custom Expo Config Plugin

Android native module

Official Android Enterprise APIs

DevicePolicyManager where legitimately supported

Do NOT attempt security bypasses.

============================================================
2. FIRST INSPECT THE EXISTING PROJECT

Before changing code:

Inspect the complete existing project.

Identify:

- Expo SDK version
- React Native version
- TypeScript configuration
- package.json
- app.json / app.config.js / app.config.ts
- Expo Router configuration
- Existing navigation
- Existing screens
- Existing components
- Existing API client
- Existing authentication
- Existing Supabase integration
- Existing database integration
- Existing payment integration
- Existing notification system
- Existing device-management code
- Existing secure storage
- Existing state management
- Existing theme
- Existing environment variables
- Existing EAS configuration
- Existing Android configuration

Do NOT rebuild the entire project unnecessarily.

Reuse existing working components.

============================================================
3. BACKEND

API BASE URL:

https://srabontelecom.paymently.io/api

IMPORTANT:

Never put backend secrets inside the React Native/Expo application.

Never hardcode:

- API secret
- Payment secret
- Admin credentials
- Database password
- Supabase service-role key
- Private backend key

Do NOT put secrets in:

.env files that are bundled into the mobile app

app.json

app.config.ts

EXPO_PUBLIC_* variables

TypeScript source

JavaScript source

AsyncStorage

SecureStore

assets

The mobile app must use customer authentication/session tokens.

Server-only credentials remain on the backend.

============================================================
4. AUTHENTICATION

Create complete authentication.

Screens:

Splash

Login

Phone Number

OTP Verification

Create Account

Profile

Logout

Flow:

Splash

↓

Check session

↓

Valid session → Dashboard

Invalid session → Login

Implement:

- Login
- Registration
- OTP
- OTP resend
- Session persistence
- Token refresh
- Logout
- Session expiration
- Unauthorized handling
- Network error handling

Use Expo SecureStore for sensitive session tokens.

Never store passwords in plain text.

If Supabase Auth already exists, reuse it.

============================================================
5. APP STRUCTURE

Use a clean structure.

Recommended:

app/

(auth)/
login.tsx
register.tsx
otp.tsx

(tabs)/
index.tsx
installments.tsx
device.tsx
payments.tsx
support.tsx

device/
enrollment.tsx
agreement.tsx
details.tsx
restriction.tsx
restored.tsx

installments/
[id].tsx

payments/
create.tsx
processing.tsx
success.tsx
failed.tsx
pending.tsx
[id].tsx

notifications/
index.tsx

support/
create.tsx
[id].tsx

settings/
index.tsx
profile.tsx
privacy.tsx
terms.tsx
management-agreement.tsx

src/

api/

auth/

components/

hooks/

services/

store/

types/

utils/

security/

device/

notifications/

payments/

installments/

support/

============================================================
6. CUSTOMER DASHBOARD

Create professional modern dashboard.

Show:

Customer Name

Device Name

Device Status

Installment Status

Total Device Price

Total Paid

Remaining Amount

Next Installment

Next Due Date

Example:

Samsung Galaxy A15

ACTIVE

Remaining:

৳18,500

Next Installment:

৳2,500

Due:

10 October 2026

Buttons:

PAY NOW

MY DEVICE

INSTALLMENTS

PAYMENT HISTORY

SUPPORT

Use:

Loading skeleton

Error state

Empty state

Pull-to-refresh

Offline state

============================================================
7. MY DEVICE

Show:

Device Name

Manufacturer

Model

Android Version

Enrollment Status

Management Status

Device State

Last Synchronization

Contract ID

Possible states:

ACTIVE

PAYMENT_DUE

GRACE_PERIOD

RESTRICTED

UNLOCK_PENDING

UNLOCKED

SUSPENDED

Do not unnecessarily expose:

IMEI

Serial Number

Hardware identifiers

unless specifically required.

============================================================
8. DEVICE ENROLLMENT

Create transparent enrollment flow.

Screen 1:

Why device management is required.

Screen 2:

What information is collected.

Screen 3:

What management functionality is enabled.

Screen 4:

What happens if installment becomes overdue.

Screen 5:

What happens after verified payment.

Screen 6:

Terms & Conditions

Screen 7:

Privacy Policy

Screen 8:

Device Management Agreement

Customer must explicitly accept.

Store server-side:

customer ID

contract ID

agreement version

timestamp

Then start official Android Enterprise enrollment where applicable.

IMPORTANT:

React Native/Expo JavaScript alone must NOT attempt to obtain privileged device-management permissions.

For Android Enterprise:

Use Expo Development Build.

Use a custom Expo Config Plugin if necessary.

Create a native Android module only when required.

Use official Android APIs.

Do NOT use:

Accessibility Service

root

ADB hacks

hidden APIs

bootloader tricks

FRP bypass

security exploits

============================================================
9. DEVICE MANAGEMENT SERVICE

Create:

DeviceManagementService

Functions:

isDeviceManaged()

getManagementStatus()

getEnrollmentStatus()

getDeviceState()

syncDeviceStatus()

requestEnrollment()

handleServerState()

On standard consumer Android devices where full management is not available:

Return:

UNSUPPORTED

or

NOT_ENROLLED

Do NOT attempt to bypass Android limitations.

============================================================
10. DEVICE STATE

Central TypeScript model:

type DeviceState =
| "ACTIVE"
| "PAYMENT_DUE"
| "GRACE_PERIOD"
| "RESTRICTED"
| "UNLOCK_PENDING"
| "UNLOCKED"
| "SUSPENDED";

Backend is the source of truth.

Never trust local state as authorization.

============================================================
11. INSTALLMENT MODULE

Create:

Installment List

Installment Details

Installment Timeline

Display:

Total Price

Down Payment

Paid Amount

Remaining Amount

Installment Amount

Total Installments

Paid Installments

Remaining Installments

Next Due Date

Contract Status

Timeline:

Installment 1 — PAID

Installment 2 — PAID

Installment 3 — DUE

Installment 4 — UPCOMING

Use ৳ currency.

============================================================
12. PAYMENT MODULE

Create:

Pay Now

Payment Amount

Payment Gateway

Payment Processing

Payment Success

Payment Failed

Payment Pending

Flow:

Customer taps PAY NOW

↓

App calls backend

↓

Backend creates payment order

↓

Backend returns safe payment session/details

↓

Open payment gateway

↓

Customer pays

↓

Gateway processes payment

↓

Backend verifies payment

↓

Backend updates payment

↓

Backend updates installment

↓

Backend updates device state if required

↓

App fetches latest state

↓

Display result

IMPORTANT:

Never trust payment success from JavaScript.

Never set:

paymentStatus = SUCCESS

only because the client received a success response from a WebView/browser.

Backend must verify the transaction.

============================================================
13. PAYMENT HISTORY

Display:

Transaction ID

Installment Number

Amount

Date

Payment Method

Status

Statuses:

SUCCESS

PENDING

FAILED

Payment details screen must be read-only.

============================================================
14. PAYMENT GATEWAY SECURITY

Never put gateway secret credentials inside Expo.

Never put private credentials into:

EXPO_PUBLIC_*

app.config.ts

TypeScript

SecureStore

AsyncStorage

The backend owns:

- gateway credentials
- payment verification
- transaction validation
- amount validation
- contract validation

============================================================
15. DEVICE RESTRICTION

If backend reports:

RESTRICTED

Show:

Device Temporarily Restricted

Reason:

Your installment payment is overdue.

Display:

Outstanding Amount

Due Date

Buttons:

PAY NOW

CONTACT SUPPORT

REFRESH STATUS

This must be a normal customer-facing React Native screen.

Do NOT create a fake Android system screen.

Do NOT impersonate Android.

Do NOT block emergency functions.

Do NOT interfere with Android security.

Actual device-management enforcement must only use legitimate official Android Enterprise mechanisms where supported.

============================================================
16. ACCESS RESTORATION

After payment:

Backend verifies payment

↓

Backend changes contract/device state

↓

Backend authorizes access restoration

↓

FCM/notification may inform user

↓

App synchronizes

↓

Official device-management state updates where supported

↓

Display:

"Device access restored"

Never restore access only because:

- local variable changed
- FCM payload says unlocked
- app restarted
- user manually refreshed

Backend authorization is mandatory.

============================================================
17. PUSH NOTIFICATIONS

Implement notifications for:

Installment Due Soon

Payment Due Today

Payment Overdue

Payment Successful

Device Status Changed

Device Restriction Notice

Device Access Restored

Support Response

When notification arrives:

Do not directly trust its payload for sensitive state.

Instead:

Notification

↓

Call backend

↓

Verify session

↓

Get latest state

↓

Update UI

============================================================
18. BACKGROUND SYNC

Use Expo-supported background mechanisms where possible.

Use:

expo-background-fetch / compatible Expo background task architecture

or

WorkManager through native integration if required.

Sync:

Device status

Installment status

Payment status

Management status

Do not continuously track location.

Do not create unnecessary background services.

Respect Android battery restrictions.

============================================================
19. OFFLINE MODE

Use Expo Network.

When offline:

Show:

You're offline.

Use cached safe data.

Do not make financial/device authorization decisions offline.

When network returns:

Synchronize automatically.

Use retry with backoff.

============================================================
20. SECURE STORAGE

Use:

expo-secure-store

for:

Access token

Refresh token

Session information

Use normal storage only for non-sensitive UI preferences.

Never store:

API secrets

Payment secrets

Admin credentials

Database credentials

============================================================
21. PERMISSIONS

Only request permissions that are genuinely required.

Potential:

Notifications

Network

Device information required by the documented feature

Do NOT request:

Accessibility

Notification Listener

All Files Access

Install Unknown Apps

Usage Access

Display Over Other Apps

Modify System Settings

unless a legitimate documented feature requires it and the implementation is allowed by Android/Google Play.

============================================================
22. CUSTOMER SUPPORT

Create:

Support Home

Create Ticket

Ticket List

Ticket Details

Contact Support

Ticket:

ID

Subject

Message

Status

Created Date

Support Response

Statuses:

OPEN

IN_PROGRESS

RESOLVED

CLOSED

============================================================
23. NOTIFICATION CENTER

Create notification list.

Each item:

Title

Message

Date

Read/Unread

Type

Navigation:

Payment notification → Payment

Installment notification → Installment

Device notification → Device

Support notification → Ticket

============================================================
24. SETTINGS

Create:

Profile

Phone

Language

Notification Settings

Terms & Conditions

Privacy Policy

Device Management Agreement

Support

About App

App Version

Logout

============================================================
25. API CLIENT

Create a centralized API client.

Example:

src/api/client.ts

Implement:

- Base URL
- Authorization header
- Token refresh
- Timeout
- Error normalization
- 401 handling
- Retry where appropriate
- Request cancellation

Required API functionality:

POST /auth/login

POST /auth/otp/verify

GET /customer/profile

GET /devices/me

GET /devices/me/status

POST /devices/me/enroll

POST /devices/me/sync

GET /installments

GET /installments/:id

POST /payments/create

GET /payments/:id/status

GET /notifications

GET /support/tickets

POST /support/tickets

Use existing endpoints if they already exist.

Do not invent duplicate endpoints unnecessarily.

============================================================
26. API AUTHORIZATION

Every authenticated request must include the customer's session token.

Backend must determine:

customer identity

device ownership

contract ownership

payment ownership

ticket ownership

Never trust:

customerId from frontend

deviceId from frontend

contractId from frontend

to authorize access.

============================================================
27. SUPABASE

If existing system uses Supabase:

Reuse it.

Do not expose:

Supabase service_role key.

Do not connect directly to privileged database APIs from the app.

Use:

Supabase Auth where appropriate

RLS

Backend authorization

Customer ownership rules

============================================================
28. DATA TYPES

Create strong TypeScript types/interfaces.

Example:

Customer

Device

Installment

Payment

Notification

SupportTicket

DeviceManagementStatus

DeviceState

Agreement

APIResponse

ApiError

Do not use "any" unnecessarily.

============================================================
29. STATE MANAGEMENT

Use a clean state architecture.

Recommended:

TanStack Query for server state.

Zustand for lightweight client state if necessary.

SecureStore for authentication credentials.

Do not duplicate server state across multiple stores.

Backend data should be refreshed through the API/query layer.

============================================================
30. UI/UX

Design:

Modern

Professional

Clean

Fast

Mobile-first

Bangladesh-friendly

Use:

Material-style components

Cards

Status badges

Progress bars

Bottom sheets

Dialogs

Skeleton loaders

Empty states

Error states

Retry buttons

Pull-to-refresh

Dark/light theme where supported.

Currency:

৳

Language-ready:

English

Bengali

All UI strings should be localization-ready.

============================================================
31. NAVIGATION

Recommended bottom navigation:

Home

Installments

Device

Payments

Support

Profile/settings accessible from header/menu.

Handle:

Authentication redirect

Session expiration

Notification deep links

Payment deep links

Back navigation

Device enrollment flow

============================================================
32. ERROR HANDLING

Handle:

400

401

403

404

409

422

429

500

502

503

Network timeout

Offline

Payment timeout

Session expired

Show customer-friendly messages.

Never display:

SQL errors

Stack traces

API keys

Backend paths

Internal errors

============================================================
33. SECURITY

Implement:

HTTPS

Secure token storage

Secure session handling

Input validation

Response validation

No sensitive logs

No secrets in bundle

No admin credentials

No payment secrets

No service-role keys

Use Android secure storage.

Use certificate/security best practices appropriate for the application.

============================================================
34. PRIVACY

Collect only data required for:

Authentication

Device management

Installment management

Payment

Notifications

Support

Do NOT collect:

Location

Contacts

SMS

Call history

Microphone

Camera

Personal files

Browsing history

unless a separate documented feature genuinely requires it.

============================================================
35. CUSTOMER DATA ISOLATION

CRITICAL:

Customer A must NEVER access Customer B's:

Device

Installment

Contract

Payment

Notifications

Support tickets

Backend must enforce this.

Test manually and automatically.

============================================================
36. AUDIT

Backend should maintain audit records for:

Agreement accepted

Device enrollment

Payment created

Payment verified

Device state change

Restriction

Access restoration

Support ticket

The mobile app is not the authoritative audit system.

============================================================
37. TESTING

Create tests for:

Login

Registration

OTP

Logout

Token refresh

Session expiration

Dashboard

Device loading

Enrollment

Installment

Payment

Payment failure

Payment pending

Payment success

Payment history

Device restriction

Access restoration

Notifications

Offline

Network failure

Support

Customer isolation

============================================================
38. SECURITY TESTS

Test:

Customer A tries Customer B device.

Must fail.

Customer A changes device ID.

Must fail.

Customer A changes customer ID.

Must fail.

Customer changes payment amount.

Backend must reject.

Customer submits fake payment success.

Backend must reject.

Customer submits fake unlock state.

Backend must reject.

Fake FCM payload.

App must verify backend.

============================================================
39. EXPO CONFIGURATION

Configure:

app.json / app.config.ts

Android package name

Version

Permissions

Notifications

Deep linking

EAS build

Environment configuration

Use:

Development

Preview

Production

separate configurations where appropriate.

Never expose production secrets through Expo public environment variables.

============================================================
40. DEVICE MANAGEMENT NATIVE INTEGRATION

If Android Enterprise functionality is required:

DO NOT attempt to implement it purely in JavaScript.

Use:

Expo Development Build

Custom Expo Config Plugin

Android native module

Kotlin native implementation

Official Android Enterprise APIs

DevicePolicyManager where supported

Expose only safe methods to JavaScript:

isDeviceManaged()

getManagementStatus()

getEnrollmentStatus()

syncDeviceStatus()

Do NOT expose dangerous native methods that bypass Android security.

If device-management capability requires enterprise provisioning that cannot be initiated from a normal consumer-installed application, document that requirement and implement the supported enrollment flow instead of attempting a workaround.

============================================================
41. EAS BUILD

Configure:

eas.json

development

preview

production

Use development build for native device-management testing.

Do not assume Expo Go supports custom native device-management functionality.

Production build must be generated using EAS Build or the appropriate native build pipeline.

============================================================
42. PERFORMANCE

Optimize:

Startup

API calls

Image loading

Rendering

Navigation

Memory

Battery

Background tasks

Do not continuously poll.

Use cache intelligently.

============================================================
43. FINAL SCREEN LIST

Create all required screens:

Splash

Login

Register

OTP

Dashboard

My Device

Device Enrollment

Device Management Explanation

Device Management Agreement

Installments

Installment Details

Pay Now

Payment Gateway

Payment Processing

Payment Success

Payment Failed

Payment Pending

Payment History

Payment Details

Device Restriction

Device Access Restored

Notifications

Support

Create Ticket

Ticket List

Ticket Details

Profile

Notification Settings

Terms

Privacy Policy

Management Agreement

Settings

About

============================================================
44. DEVELOPMENT WORKFLOW

Follow this order exactly.

PHASE 1:

Inspect existing Expo project.

PHASE 2:

Inspect existing backend/API.

PHASE 3:

Inspect Supabase/database architecture.

PHASE 4:

Inspect authentication.

PHASE 5:

Inspect payment.

PHASE 6:

Inspect notifications.

PHASE 7:

Inspect device-management requirements.

PHASE 8:

Create implementation plan.

PHASE 9:

Implement authentication.

PHASE 10:

Implement dashboard.

PHASE 11:

Implement device.

PHASE 12:

Implement enrollment.

PHASE 13:

Implement official Android Enterprise/native integration where supported.

PHASE 14:

Implement installments.

PHASE 15:

Implement payment.

PHASE 16:

Implement payment verification.

PHASE 17:

Implement notifications.

PHASE 18:

Implement background synchronization.

PHASE 19:

Implement restriction/access-restoration UI.

PHASE 20:

Implement support.

PHASE 21:

Implement settings/privacy/agreements.

PHASE 22:

Implement security.

PHASE 23:

Test.

PHASE 24:

Fix TypeScript errors.

PHASE 25:

Fix runtime errors.

PHASE 26:

Run Android build.

PHASE 27:

Test development build.

PHASE 28:

Create production EAS build.

============================================================
45. NO MOCK FUNCTIONALITY

Do NOT finish with only UI.

Every button must have a real implementation.

If an API is available:

Connect it.

If a backend endpoint is missing:

Clearly identify the missing endpoint.

Do not fake security-sensitive functionality.

Do not fake payment.

Do not fake enrollment.

Do not fake device management.

Do not fake unlock.

============================================================
46. FINAL QUALITY CHECK

Before declaring the app complete:

Run:

npx expo doctor

TypeScript checks

Lint

Unit tests

Android development build

Production build validation

API tests

Authentication tests

Payment tests

Notification tests

Offline tests

Security tests

Customer isolation tests

Device-management tests

Fix all errors that can be fixed within the existing project.

============================================================
47. FINAL DELIVERABLE

The final result must be:

A complete React Native Expo Customer App.

It must include:

Authentication

OTP

Dashboard

Device

Device enrollment

Official Android Enterprise integration where supported

Installment management

Payment

Payment verification

Payment history

Device status

Restriction status

Access restoration

Push notifications

Background synchronization

Offline support

Customer support

Profile

Settings

Privacy

Terms

Device Management Agreement

Secure storage

API integration

Error handling

Loading states

Empty states

Testing

EAS build configuration

Production-ready code

============================================================
48. FINAL INSTRUCTION TO THE CODING AGENT

START BY INSPECTING THE EXISTING PROJECT.

DO NOT BLINDLY OVERWRITE THE PROJECT.

DO NOT CREATE DUPLICATE AUTHENTICATION.

DO NOT CREATE DUPLICATE PAYMENT SYSTEMS.

DO NOT CREATE DUPLICATE DATABASE TABLES.

DO NOT EXPOSE SECRET API KEYS.

DO NOT EXPOSE SUPABASE SERVICE ROLE KEYS.

DO NOT EXPOSE PAYMENT SECRETS.

DO NOT IMPLEMENT SECURITY BYPASSES.

DO NOT USE ACCESSIBILITY SERVICE AS A DEVICE-MANAGEMENT WORKAROUND.

DO NOT USE ROOT.

DO NOT USE FRP BYPASS.

DO NOT USE BOOTLOADER BYPASS.

DO NOT USE FAKE SYSTEM UI.

DO NOT SILENTLY ENROLL DEVICES.

DO NOT HIDE DEVICE MANAGEMENT FROM CUSTOMERS.

USE EXPLICIT CONSENT.

USE OFFICIAL ANDROID ENTERPRISE CAPABILITIES.

USE EXPO DEVELOPMENT BUILD WHEN NATIVE ANDROID FUNCTIONALITY IS REQUIRED.

USE EAS BUILD FOR PRODUCTION.

THE BACKEND IS THE SOURCE OF TRUTH.

THE PAYMENT GATEWAY MUST BE VERIFIED BY THE BACKEND.

THE DEVICE STATE MUST BE AUTHORIZED BY THE BACKEND.

FCM MUST NOT BE USED AS AN AUTHORIZATION MECHANISM.

MAKE THE FINAL REACT NATIVE EXPO CUSTOMER APP PRODUCTION-READY.
