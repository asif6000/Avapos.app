<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerPayment;
use App\Models\Customer;
use App\Services\Payments\HttpPaymentGateway;
use App\Services\Payments\PaymentProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Throwable;

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

        // The amount above came from the contract, not from the phone. UddoktaPay
        // is asked to charge *that* figure, with the merchant key held on this
        // server; the response carries no key and no secret back to the
        // customer — only a reference, a checkout URL and when it expires.
        try {
            return response()->json($this->payments()->start(
                customer: $customer,
                installment: $installment,
                method: $data['gateway'],
                requestedAmount: isset($data['amount']) ? (float) $data['amount'] : null,
            ));
        } catch (Throwable $exception) {
            report($exception);

            // 501 tells the app the provider is not set up, which is different
            // from 402, which would tell the customer they cannot pay.
            return response()->json([
                'status' => 'error',
                'message' => $exception->getMessage(),
            ], 501);
        }
    }

    /**
     * The customer's own record. Read-only about everything that matters: the
     * enrollment status, the agreement version and the device state are the
     * server's to report, never the phone's to set.
     */
    public function profile(Request $request): JsonResponse
    {
        $customer = $request->user();

        return response()->json([
            'id' => $customer->getKey(),
            'fullName' => $customer->full_name,
            'email' => $customer->email,
            'phone' => $customer->phone_number,
            'language' => $customer->language,
            'verifiedAt' => $customer->created_at?->toIso8601String(),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'fullName' => ['sometimes', 'string', 'min:2', 'max:120'],
            'language' => ['sometimes', Rule::in(['en', 'bn'])],
        ]);

        $customer = $request->user();
        $customer->fill(array_filter([
            'full_name' => $data['fullName'] ?? null,
            'language' => $data['language'] ?? null,
        ], fn ($value) => $value !== null))->save();

        return $this->profile($request);
    }

    public function settings(Request $request): JsonResponse
    {
        $customer = $request->user();

        return response()->json([
            'language' => $customer->language ?? 'en',
            'pushNotifications' => true,
            'overdueReminders' => true,
            'nextDueDate' => $this->nextDueDate($customer),
            'supportPhone' => config('app.support_phone', '09612-000000'),
            'agreementVersion' => $customer->agreement_version,
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pushNotifications' => ['sometimes', 'boolean'],
            'overdueReminders' => ['sometimes', 'boolean'],
            'language' => ['sometimes', Rule::in(['en', 'bn'])],
        ]);

        $customer = $request->user();
        if (isset($data['language'])) {
            $customer->language = $data['language'];
            $customer->save();
        }

        return $this->settings($request);
    }

    private function nextDueDate(Customer $customer): ?string
    {
        return $customer->installments()
            ->where('status', '!=', 'PAID')
            ->orderBy('due_date')
            ->value('due_date')
            ?->toDateString();
    }

    private function payments(): PaymentProcessor
    {
        return new PaymentProcessor(new HttpPaymentGateway(config('payment')));
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

    /**
     * Ownership is always resolved from the token, never from the request: the
     * installment has to belong to the customer who is asking. This used to
     * return null for everything, which answered every payment with 404 and hid
     * the real reason.
     */
    private function findInstallment(Customer $customer, string $installmentId)
    {
        return \App\Models\Installment::query()
            ->where('id', $installmentId)
            ->where('customer_key', $customer->getKey())
            ->first();
    }
}
