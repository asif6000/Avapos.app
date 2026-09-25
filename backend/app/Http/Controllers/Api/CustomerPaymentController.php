<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerPayment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Payment orders and status.
 *
 * The client never decides that a payment succeeded. It creates an order here,
 * the customer pays at the gateway, and `status` reports only what this server
 * has itself verified from the gateway callback.
 */
class CustomerPaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $customer = $request->user();

        $payments = CustomerPayment::query()
            ->where('customer_key', $customer->getKey())
            ->orderByDesc('date')
            ->paginate($request->integer('perPage', 20));

        return response()->json([
            'items' => $payments->map(fn ($p) => $this->present($p))->all(),
            'page' => $payments->currentPage(),
            'perPage' => $payments->perPage(),
            'total' => $payments->total(),
            'hasMore' => $payments->hasMorePages(),
        ]);
    }

    /**
     * Creates a gateway order.
     *
     * SECURITY: the `amount` the app sends is display-only. The payable figure
     * is looked up from the installment schedule here. A client that tampers
     * with the amount is ignored, and should be logged.
     */
    public function store(Request $request): JsonResponse
    {
        $customer = $request->user();

        $data = $request->validate([
            'installmentId' => ['required', 'string', 'max:64'],
            'gateway' => ['required', 'string', 'in:bkash,nagad,rocket,card'],
            'amount' => ['sometimes', 'numeric', 'min:0'],
        ]);

        $installment = $this->findInstallment($customer, $data['installmentId']);

        if (! $installment) {
            return response()->json(
                ['status' => 'error', 'message' => 'That installment was not found.'],
                404
            );
        }

        $expected = $installment->amount - $installment->paid_amount;

        if (isset($data['amount']) && (float) $data['amount'] !== (float) $expected) {
            // The app's figure disagreed with the contract. Trust the contract,
            // and leave a trail: a tampered amount is worth investigating.
            report(new \RuntimeException(sprintf(
                'Payment amount mismatch for customer %s installment %s: client sent %s, contract says %s',
                $customer->getKey(),
                $installment->id,
                (string) $data['amount'],
                (string) $expected,
            )));
        }

        // TODO: create the order with your gateway SDK, then:
        //   - persist a CustomerPayment row with status PENDING
        //   - never put a signing key or webhook secret in the response
        //
        // return response()->json([
        //     'paymentId'   => $payment->transaction_id,
        //     'orderId'     => $gatewayOrderId,
        //     'redirectUrl' => $gatewayCheckoutUrl,
        //     'gateway'     => $data['gateway'],
        //     'expiresAt'   => now()->addMinutes(15)->toIso8601String(),
        // ]);

        return response()->json([
            'status' => 'error',
            'message' => 'Payment gateway is not configured yet.',
        ], 501);
    }

    /**
     * Reports the server's own view of a payment.
     *
     * Only the gateway webhook moves a payment to SUCCESS. Nothing a client
     * sends can, and a client that asks about someone else's payment gets 404
     * rather than a hint that it exists.
     */
    public function status(Request $request, string $id): JsonResponse
    {
        $customer = $request->user();

        $payment = CustomerPayment::query()
            ->where('transaction_id', $id)
            ->where('customer_key', $customer->getKey())
            ->first();

        if (! $payment) {
            return response()->json(
                ['status' => 'error', 'message' => 'That payment was not found.'],
                404
            );
        }

        return response()->json($this->present($payment));
    }

    private function present(CustomerPayment $payment): array
    {
        return [
            'id' => $payment->transaction_id,
            'transactionId' => $payment->transaction_id,
            'installmentId' => $payment->installment_number,
            'installmentNumber' => $payment->installment_number,
            'amount' => (float) $payment->amount,
            'currency' => 'BDT',
            'status' => strtoupper((string) $payment->status),
            'method' => $payment->payment_method,
            'paidAt' => $payment->date?->toIso8601String(),
            'createdAt' => $payment->created_at?->toIso8601String(),
            'gateway' => $payment->payment_method,
        ];
    }

    /** Ownership is always resolved from the token. */
    private function findInstallment(Customer $customer, string $installmentId)
    {
        // TODO: point at your installment model, scoped by the token's customer.
        // return Installment::query()
        //     ->where('id', $installmentId)
        //     ->where('customer_key', $customer->getKey())
        //     ->first();

        return null;
    }
}
