<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\SupportTicket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Support tickets.
 *
 * A ticket is one of the few things a customer creates for themselves, so this is
 * the one write here that a phone is allowed to make. It is scoped as narrowly as
 * it can be: a ticket records a question. It cannot change a device state, a
 * payment, an installment, or an agreement, and there is no field in the body that
 * would let it try.
 */
class SupportTicketController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $perPage = max(1, min(100, $request->integer('perPage', 20)));
        $page = max(1, $request->integer('page', 1));

        $query = $customer->tickets()->orderByDesc('created_at');

        $total = (clone $query)->count();
        $items = $query->forPage($page, $perPage)
            ->get()
            ->map(fn (SupportTicket $t) => $t->present())
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
     * Opens a ticket.
     *
     * `customer_key` is taken from the session and never from the body, so a
     * customer cannot file a ticket against somebody else's account. `status`
     * starts at `OPEN` and there is no field that sets it: only staff move a
     * ticket along, through the admin panel.
     */
    public function store(Request $request): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $data = $request->validate([
            'subject' => ['required', 'string', 'min:3', 'max:140'],
            'message' => ['required', 'string', 'min:3', 'max:4000'],
            'category' => ['sometimes', 'string', 'in:PAYMENT,DEVICE,INSTALLMENT,ACCOUNT,OTHER'],
        ]);

        $ticket = new SupportTicket;
        $ticket->id = 'TICK-'.strtoupper(Str::random(8));
        $ticket->customer_key = $customer->getKey();
        $ticket->subject = trim($data['subject']);
        $ticket->message = trim($data['message']);
        $ticket->category = $data['category'] ?? 'OTHER';
        $ticket->status = 'OPEN';
        $ticket->admin_response = null;
        $ticket->save();

        return response()->json($ticket->present());
    }

    public function show(Request $request, string $id): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $ticket = $customer->tickets()->where('id', $id)->first();

        if ($ticket === null) {
            return response()->json(['status' => 'error', 'message' => 'Not Found'], 404);
        }

        return response()->json($ticket->present());
    }
}
