<?php

use App\Http\Controllers\Admin\AdminActionController;
use App\Http\Controllers\Admin\AdminReadController;
use App\Http\Middleware\RequireAdmin;
use App\Http\Middleware\VerifySupabaseJwt;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Admin panel API
|--------------------------------------------------------------------------
|
| The web panel at `/admin` is a browser application, and browsers cannot keep a
| secret. So the panel is not given one: it signs in to Supabase like the customer
| app does and presents that session's JWT, and this API decides what it may see.
| The service-role key is used here, on the server, for the tables an admin needs
| — which is also why this works today while RLS is still off, without the panel
| ever holding elevated access of its own.
|
| `RequireAdmin` is on the whole group, not on individual routes. Adding an
| endpoint later cannot forget the check, because there is nothing to forget.
|
| It serves the panel from this same origin, deliberately: the API sends no CORS
| headers, so a panel on a different origin could not read a single response.
|
*/

Route::prefix('admin/api')
    ->middleware([VerifySupabaseJwt::class, RequireAdmin::class])
    ->group(function () {
        // ---- Who is asking --------------------------------------------------
        Route::get('me', [AdminReadController::class, 'me']);
        Route::get('dashboard', [AdminReadController::class, 'dashboard']);

        // ---- Reading --------------------------------------------------------
        Route::get('customers', [AdminReadController::class, 'customers']);
        Route::get('customers/{id}', [AdminReadController::class, 'customer']);
        Route::get('payments', [AdminReadController::class, 'payments']);
        Route::get('devices', [AdminReadController::class, 'devices']);
        Route::get('devices/{id}', [AdminReadController::class, 'deviceDetail']);
        // A read that is audited, because it is somebody's location being looked
        // at by a member of staff.
        Route::get('devices/{id}/location', [AdminReadController::class, 'deviceLocation']);
        Route::get('tickets', [AdminReadController::class, 'tickets']);
        Route::get('notifications', [AdminReadController::class, 'notifications']);
        Route::get('audit', [AdminReadController::class, 'audit']);

        // ---- Acting ---------------------------------------------------------
        // A payment becomes SUCCESS only by asking the gateway, never by being
        // told to. Device changes and ticket replies need a reason.
        Route::post('payments/{id}/reverify', [AdminActionController::class, 'reverifyPayment']);
        Route::post('devices/{id}/state', [AdminActionController::class, 'deviceState']);
        // A device command is a *request*. There is no route that marks one done —
        // the phone reports its own outcome, and the shape of the group above means
        // a route added later cannot forget the admin check.
        Route::post('devices/{id}/command', [AdminActionController::class, 'deviceCommand']);
        // The reminder quotes the schedule's own figure; the panel cannot supply one.
        Route::post('devices/{id}/reminder', [AdminActionController::class, 'deviceReminder']);
        Route::post('tickets/{id}/reply', [AdminActionController::class, 'replyToTicket']);
        Route::post('notifications', [AdminActionController::class, 'sendNotification']);
    });
