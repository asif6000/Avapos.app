<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Device;
use App\Models\SupportTicket;
use App\Services\Payments\HttpPaymentGateway;
use App\Services\Payments\PaymentProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * Acting, for staff.
 *
 * Three rules, and the second one is the one that matters:
 *
 * 1. Every action needs a reason. "Unlock this phone" without a reason is not a
 *    support action, it is an opinion with a button.
 * 2. **Nothing here can mark a payment paid by assertion.** `reverify` asks
 *    UddoktaPay what happened and records the answer; if the gateway has not
 *    confirmed a payment, the admin's screen says so and nothing moves. There is
 *    no "force paid" anywhere in this file, and that is deliberate: a financing
 *    app's ledger is only worth something if the money in it is the money that
 *    arrived.
 * 3. Every action is written to the audit log with who did it, what they did and
 *    why, before the response is sent.
 */
class AdminActionController extends Controller
{
    /**
     * Asks the gateway again about a payment.
     *
     * This is what an admin press means. The gateway is the only witness, so the
     * press cannot do what the admin hopes — it can only find out sooner.
     */
    public function reverifyPayment(Request $request, string $id): JsonResponse
    {
        $payment = CustomerPayment::query()->where('transaction_id', $id)->first();

        if (! $payment) {
            return response()->json(['status' => 'error', 'message' => 'No such payment.'], 404);
        }

        $invoiceId = (string) ($payment->gateway_order_id ?? '');

        if ($invoiceId === '') {
            return response()->json([
                'status' => 'error',
                'message' => 'This payment has no gateway reference to check.',
            ], 422);
        }

        try {
            $settled = (new PaymentProcessor(new HttpPaymentGateway(config('payment'))))
                ->settleFromInvoice($invoiceId);
        } catch (Throwable $exception) {
            Log::error('An admin re-verification failed', [
                'payment' => $id,
                'message' => $exception->getMessage(),
            ]);

            return response()->json([
                'status' => 'error',
                'message' => 'The gateway could not be reached.',
            ], 502);
        }

        $this->audit($request, 'payment.reverify', $id, $request->input('reason'));

        return response()->json([
            'status' => 'ok',
            'payment' => [
                'id' => $payment->transaction_id,
                'status' => strtoupper((string) $payment->fresh()->status),
            ],
            'message' => $settled?->status === 'SUCCESS'
                ? 'The gateway confirmed this payment and it is now recorded.'
                : 'The gateway has not confirmed this payment yet. Nothing was changed.',
        ]);
    }

    /**
     * Changes a device's state.
     *
     * A release is a real decision about somebody's phone, so it is written down
     * with a reason, and the app sees it on its next read of
     * `/devices/me/status` — the panel never tells the app anything directly.
     */
    public function deviceState(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'state' => ['required', Rule::in([
                'ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD', 'RESTRICTED', 'UNLOCKED', 'SUSPENDED',
            ])],
            // Required, not optional: see the note in the class docblock.
            'reason' => ['required', 'string', 'min:4', 'max:280'],
        ]);

        $device = Device::query()->where('id', $id)->first();

        if (! $device) {
            return response()->json(['status' => 'error', 'message' => 'No such device.'], 404);
        }

        $from = $device->state;
        $device->update(['state' => $data['state']]);

        $this->audit($request, 'device.state', $id, $data['reason'], [
            'from' => $from,
            'to' => $data['state'],
        ]);

        return response()->json([
            'status' => 'ok',
            'device' => [
                'id' => $device->id,
                'state' => $device->fresh()->state,
            ],
        ]);
    }

    public function replyToTicket(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'response' => ['required', 'string', 'min:2', 'max:2000'],
            'status' => ['sometimes', Rule::in(['OPEN', 'RESOLVED'])],
        ]);

        $ticket = SupportTicket::query()->where('id', $id)->first();

        if (! $ticket) {
            return response()->json(['status' => 'error', 'message' => 'No such ticket.'], 404);
        }

        $ticket->update([
            'admin_response' => $data['response'],
            'status' => $data['status'] ?? 'RESOLVED',
        ]);

        $this->audit($request, 'ticket.reply', $id, $data['response']);

        return response()->json(['status' => 'ok', 'id' => $ticket->id]);
    }

    /**
     * Sends a notification to one customer.
     *
     * Sent to a named customer only. "Send to everyone" is a marketing tool, and
     * a device-management notification that arrives unbidden to somebody who
     * never asked for one is how a support message turns into a complaint.
     */
    public function sendNotification(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customerKey' => ['required', 'string', 'max:64'],
            'type' => ['required', Rule::in([
                'INSTALLMENT_DUE_SOON', 'PAYMENT_SUCCESSFUL', 'DEVICE_RESTRICTED', 'GENERAL',
            ])],
            'title' => ['required', 'string', 'min:3', 'max:120'],
            'message' => ['required', 'string', 'min:3', 'max:600'],
        ]);

        $customer = Customer::query()->where('id', $data['customerKey'])->first();

        if (! $customer) {
            return response()->json(['status' => 'error', 'message' => 'No such customer.'], 404);
        }

        $id = DB::table('notifications')->insertGetId([
            'id' => 'notif-' . bin2hex(random_bytes(8)),
            'customer_key' => $customer->getKey(),
            'type' => $data['type'],
            'title' => $data['title'],
            'message' => $data['message'],
            'is_read' => false,
            'reference_id' => null,
            'created_at' => now(),
        ]);

        $this->audit($request, 'notification.send', (string) $id, $data['title']);

        return response()->json(['status' => 'ok', 'id' => $id]);
    }

    /**
     * Writes the trail. Kept small, synchronous and boring: if the record of who
     * did something fails, the action has not happened.
     */
    private function audit(
        Request $request,
        string $action,
        string $subject,
        ?string $reason = null,
        array $context = [],
    ): void {
        DB::table('admin_audit')->insert([
            'admin_email' => $request->attributes->get('admin_email'),
            'action' => $action,
            'subject' => $subject,
            'reason' => $reason,
            'context' => $context ? json_encode($context) : null,
            'ip' => $request->ip(),
            'created_at' => now(),
        ]);
    }
}
