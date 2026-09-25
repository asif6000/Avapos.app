<?php

use App\Http\Controllers\Api\CustomerAuthController;
use App\Http\Controllers\Api\CustomerProfileController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Customer API
|--------------------------------------------------------------------------
|
| The mobile app is served from the `/customer` prefix. Nothing lives under
| `/api` — that route group is empty.
|
| Every route except the four in `auth` requires a bearer access token issued
| by `CustomerAuthController::verifyCode`. Ownership is resolved from the token:
| no route accepts a customerId, deviceId or contractId as an identifier.
|
*/

Route::prefix('customer')->group(function () {
    // ---- Passwordless authentication (no token) -------------------------
    // Identical response for known and unknown addresses, so this cannot be
    // used to discover which email addresses have accounts.
    Route::post('auth/request-code', [CustomerAuthController::class, 'requestCode'])
        ->middleware('throttle:auth-code');

    Route::post('auth/resend-code', [CustomerAuthController::class, 'resendCode'])
        ->middleware('throttle:auth-code');

    Route::post('auth/verify-code', [CustomerAuthController::class, 'verifyCode'])
        ->middleware('throttle:auth-code');

    Route::post('auth/refresh', [CustomerAuthController::class, 'refresh'])
        ->middleware('throttle:auth-code');

    // ---- Authenticated ---------------------------------------------------
    Route::middleware('auth:customer')->group(function () {
        Route::post('logout', [CustomerAuthController::class, 'logout']);

        Route::patch('profile', [CustomerProfileController::class, 'update']);
    });
});
