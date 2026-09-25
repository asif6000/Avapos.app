<?php

use App\Http\Controllers\Api\CustomerPaymentController;
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

        // ---- Money --------------------------------------------------------
        // `amount` arrives from the phone for display only. Re-validate it
        // against the contract before creating the order.
        Route::get('payments', [CustomerPaymentController::class, 'index']);
        Route::post('payments/create', [CustomerPaymentController::class, 'store']);
        Route::get('payments/{id}/status', [CustomerPaymentController::class, 'status']);
    });
});
