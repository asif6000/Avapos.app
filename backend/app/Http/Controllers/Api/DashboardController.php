<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\SupportTicket;
use App\Services\Customer\PlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The Home screen, assembled server-side.
 *
 * WHY ONE ROUTE ASSEMBLES ALL OF IT
 *
 * Home shows the customer's name, their phone, the state of that phone, what they
 * owe, when the next installment falls due, and how many unread messages and open
 * tickets they have. That is eight reads across five tables for one screen.
 *
 * Assembled here rather than in the app, for the reason the rest of this codebase
 * is shaped the way it is: the app is the only source of *presentation*, and the
 * server is the only source of *truth*. If the phone assembled this itself, the
 * figure on Home and the figure on the Installments tab would be two separate
 * calculations of a customer's debt, taken at two separate moments, from two
 * different partial views. They would eventually disagree, and the screen where
 * they disagreed would be the one a customer is arguing about.
 *
 * Every value below is read from the database. Nothing is cached, inferred from a
 * previous response, or taken from the device.
 */
class DashboardController extends Controller
{
    public function __construct(private readonly PlanService $plans) {}

    public function show(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $installments = $customer->installments()->get();
        $device = $customer->device()->first();
        $agreement = $customer->agreement()->first();

        $next = $this->plans->nextInstallment($installments);
        $outstanding = $this->plans->outstanding($installments);

        return response()->json([
            'customer' => $customer->present(),
            'device' => $device?->present($agreement),
            'plan' => $this->plans->present($installments),
            'nextInstallment' => $next?->present(),

            // Authoritative device state, and it is the same row the Device tab
            // reads. Null when no phone is linked, which the app shows as "no
            // device" rather than inventing one.
            'deviceStatus' => $device === null ? null : [
                'deviceState' => $device->state,
                'enrollmentStatus' => $device->enrollment_status,
                'managementStatus' => $device->management_status,
                'lastSyncedAt' => optional($device->last_sync_time)->toIso8601String(),
                'serverTime' => now()->toIso8601String(),
                'outstandingAmount' => $outstanding,
                'dueDate' => $next?->due_date?->toDateString(),
                'restrictionReason' => null,
                'unlockAuthorizedAt' => null,
            ],

            'unreadNotificationCount' => AppNotification::query()
                ->where('customer_key', $customer->getKey())
                ->where('is_read', false)
                ->count(),

            'openTicketCount' => SupportTicket::query()
                ->where('customer_key', $customer->getKey())
                ->where('status', '!=', 'CLOSED')
                ->count(),
        ]);
    }
}
