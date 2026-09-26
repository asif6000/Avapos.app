<?php

use App\Http\Controllers\Api\CustomerDeviceController;
use App\Http\Controllers\Api\CustomerPaymentController;
use App\Http\Controllers\Api\GatewayCallbackController;
use App\Http\Middleware\VerifySupabaseJwt;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Customer API
|--------------------------------------------------------------------------
|
| The mobile app is served from the `/customer` prefix. Nothing lives under
| `/api` — that route group is empty.
|
| Authentication is Supabase Auth. The app signs in with an emailed code and
| presents the resulting access token as its bearer; `VerifySupabaseJwt`
| verifies that token's signature against the project's signing keys before any
| claim in it is trusted. There is no local password and no `/auth/*` route.
|
| Load this from the `api` middleware group, NOT from `web`. A `web` route sits
| behind the CSRF filter and answers 419 to every request from the app, which
| looks like a broken app rather than a routing mistake.
|
*/

Route::prefix('customer')->group(function () {
    Route::middleware(VerifySupabaseJwt::class)->group(function () {
        // ---- Sessions -----------------------------------------------------
        // Revokes the Supabase session. The client also clears its own session.
        Route::post('logout', fn () => response()->json(['revoked' => true]));

        // ---- App settings (no money, no device state) --------------------
        // 2026-09-26: the app's settings and profile screens were the last
        // screens with no route at all. They write only what a customer may
        // change about themselves: a display name, a language, notification
        // preferences. Enrollment, agreement version, device state and money
        // are deliberately not accepted from a phone.
        Route::get('profile', [CustomerPaymentController::class, 'profile']);
        Route::patch('profile', [CustomerPaymentController::class, 'updateProfile']);
        Route::get('settings', [CustomerPaymentController::class, 'settings']);
        Route::patch('settings', [CustomerPaymentController::class, 'updateSettings']);

        // ---- Money --------------------------------------------------------
        // `amount` arrives from the phone for display only. Re-validate it
        // against the contract before creating the order.
        Route::get('payments', [CustomerPaymentController::class, 'index']);
        Route::post('payments/create', [CustomerPaymentController::class, 'store']);
        Route::get('payments/{id}/status', [CustomerPaymentController::class, 'status']);

        // ---- Device commands -------------------------------------------------
        // The phone asking what it has been told to do, and then saying what it did.
        //
        // These two routes are the only caller of
        // `DeviceCommandService::reportOutcome()`. Without them a command recorded in
        // the panel would sit at REQUESTED for ever, because nothing would ever
        // carry it out — and "locked" in that screen would be a thing somebody
        // decided rather than a thing that happened.
        //
        // Neither route accepts a device id. The device is resolved from the session,
        // and `reportOutcome()` re-checks that the command belongs to it, so a
        // customer cannot file an outcome against somebody else's phone.
        Route::get('device/commands', [CustomerDeviceController::class, 'commands']);
        Route::post('device/commands/{id}/outcome', [CustomerDeviceController::class, 'commandOutcome']);
    });
});

/*
|--------------------------------------------------------------------------
| Gateway callback
|--------------------------------------------------------------------------
|
| The payment provider posts here when a payment settles. It is *not* a
| customer request, so it sits outside `VerifySupabaseJwt`: a phone never
| reaches it, and the gateway holds no Supabase session.
|
| The body is not trusted. `GatewayCallbackController` verifies the signature and
| then asks the provider what actually happened, so a forged POST — or a genuine
| one for somebody else's order — cannot mark a payment paid.
|
| Throttled because it is a public URL, and the signature check is cheap
| compared to the consequences of guessing one.
|
*/

Route::prefix('api')
    ->middleware(['throttle:60,1'])
    ->group(function () {
        Route::post('gateway/ipn', [GatewayCallbackController::class, 'ipn']);
    });

/*
| The customer's browser returns here. It is a GET that carries `invoice_id`,
| and it renders a page rather than JSON, because a person is following it.
*/
Route::prefix('customer/payment')
    ->middleware(['throttle:60,1'])
    ->group(function () {
        Route::match(['get', 'post'], 'return', [GatewayCallbackController::class, 'return']);
        Route::match(['get', 'post'], 'cancel', [GatewayCallbackController::class, 'return']);
    });
