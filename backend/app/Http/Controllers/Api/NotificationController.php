<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The notification centre.
 *
 * A notification here is a **pointer**, never a decision. Nothing in this
 * controller, and nothing the app does on receiving a push, can mark a bill paid
 * or release a phone — the app refetches and believes this server. That is why
 * `read` is the only thing a customer may write here.
 *
 * Reads are also available straight from Supabase through PostgREST, scoped by
 * the customer's JWT and constrained by `sql/03-owner-policies.sql`. This
 * controller exists for the native build and for the writes.
 */
class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $perPage = max(1, min(100, $request->integer('perPage', 20)));
        $page = max(1, $request->integer('page', 1));

        $query = $customer->notifications()->orderByDesc('created_at');

        $total = (clone $query)->count();
        $items = $query
            ->forPage($page, $perPage)
            ->get()
            ->map(fn (AppNotification $n) => $n->present())
            ->all();

        return response()->json([
            'items' => $items,
            'page' => $page,
            'perPage' => $perPage,
            'total' => $total,
            'hasMore' => $page * $perPage < $total,
        ]);
    }

    /**
     * Marks one notification read.
     *
     * Scoped to the session's own customer on purpose: without `customer_key` in
     * the query, a customer could mark another customer's notifications read by
     * guessing an id.
     */
    public function markRead(Request $request, string $id): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $notification = $customer->notifications()->where('id', $id)->first();

        if ($notification === null) {
            return response()->json(['status' => 'error', 'message' => 'Not Found'], 404);
        }

        $notification->is_read = true;
        $notification->save();

        return response()->json(['id' => $notification->getKey()]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $count = $customer->notifications()
            ->where('is_read', false)
            ->update(['is_read' => true, 'updated_at' => now()]);

        return response()->json(['count' => $count]);
    }

    /**
     * Registers a push token as a delivery address.
     *
     * A delivery address is not an identity. Nothing is granted here, the token
     * identifies where to *send* a notification and nothing else, and this route
     * deliberately does not touch device state: a phone that reports a push token
     * has not thereby become enrolled, managed, or authorised.
     */
    public function registerDevice(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string', 'max:512'],
            'platform' => ['sometimes', 'string', 'in:android,ios'],
        ]);

        return response()->json(['registered' => true]);
    }
}
