<?php

namespace App\Services\Payments;

use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Device;
use App\Models\Installment;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Payment orders, start to finish.
 *
 * The order of operations is the security property of the whole thing:
 *
 *   1. the payable amount is looked up from the contract, not taken from the phone
 *   2. the order is created at the gateway with our reference in its metadata
 *   3. a PENDING row is stored, so the customer has something to ask about
 *   4. SUCCESS is possible *only* here, and only after the gateway has been asked
 *      directly — never from a callback body, never from the app
 *
 * A payment therefore advances because the gateway told us, in answer to our
 * question, that it was paid. The customer's own app has no way to influence
 * that, which is the point of a financing app.
 */
class PaymentProcessor
{
    public function __construct(private readonly PaymentGateway $gateway)
    {
    }

    /**
     * Creates an order for an installment.
     *
     * `requestedAmount` is what the phone displayed. It is compared with the
     * contract and never used as the figure to charge.
     *
     * @return array{paymentId: string, orderId: string, redirectUrl: string, gateway: string, expiresAt: ?string}
     */
    public function start(
        Customer $customer,
        Installment $installment,
        string $method,
        ?float $requestedAmount = null,
    ): array {
        $expected = (float) $installment->amount - (float) $installment->paid_amount;

        if ($expected <= 0) {
            throw new RuntimeException('That installment is already paid.');
        }

        if ($requestedAmount !== null && abs($requestedAmount - $expected) > 0.009) {
            // Worth a trail: a client that disagrees with the contract about
            // money is either a bug or an attempt.
            Log::warning('Payment amount mismatch', [
                'customer' => $customer->getKey(),
                'installment' => $installment->id,
                'client_amount' => $requestedAmount,
                'contract_amount' => $expected,
            ]);
        }

        $reference = $this->newReference();

        $charge = $this->gateway->createCharge(new ChargeRequest(
            reference: $reference,
            amount: $expected,
            currency: 'BDT',
            method: $method,
            customerName: (string) ($customer->full_name ?? 'Customer'),
            customerEmail: (string) ($customer->email ?? ''),
            metadata: [
                // Echoed back by UddoktaPay on verification. This is the link
                // between a gateway invoice and the payment it belongs to.
                'transaction_id' => $reference,
                'customer_key' => (string) $customer->getKey(),
                'installment_id' => (string) $installment->id,
                'installment_number' => (string) $installment->number,
            ],
        ));

        // Stored before the customer is sent anywhere, so an order the gateway
        // knows about is never one this server has forgotten.
        CustomerPayment::query()->create([
            'transaction_id' => $reference,
            'customer_key' => $customer->getKey(),
            'installment_number' => $installment->number,
            'amount' => $expected,
            'date' => null,
            'payment_method' => $method,
            'status' => 'PENDING',
            'gateway_order_id' => $charge->orderId,
        ]);

        return [
            'paymentId' => $charge->reference,
            'orderId' => $charge->orderId,
            'redirectUrl' => $charge->checkoutUrl,
            'gateway' => $charge->method,
            'expiresAt' => $charge->expiresAt?->toIso8601String(),
        ];
    }

    /**
     * Asks the gateway about an invoice, and settles the payment it belongs to.
     *
     * The payment is found from the *verified* response's metadata, not from the
     * callback: a stranger posting somebody else's invoice id settles nothing,
     * because the metadata that comes back does not name a payment we hold.
     */
    public function settleFromInvoice(string $invoiceId): ?CustomerPayment
    {
        $verification = $this->gateway->verifyCharge($invoiceId);

        if (! $verification->paid) {
            Log::info('A payment invoice is not paid yet', [
                'invoice_id' => $invoiceId,
                'gateway_status' => $verification->status,
            ]);

            return null;
        }

        $reference = $verification->ourReference;

        if (! $reference) {
            Log::warning('A verified invoice carried no reference of ours', [
                'invoice_id' => $invoiceId,
            ]);

            return null;
        }

        $payment = CustomerPayment::query()->where('transaction_id', $reference)->first();

        if (! $payment) {
            // Someone else's invoice, played to this endpoint.
            Log::warning('A verified invoice named a payment we do not hold', [
                'invoice_id' => $invoiceId,
            ]);

            return null;
        }

        if ($payment->status === 'SUCCESS') {
            return $payment; // a repeated callback must not move it twice
        }

        // The gateway's own figure has to match what this server asked for.
        // A gateway confirming a different amount is not confirming this order.
        if ($verification->amount !== null && abs($verification->amount - (float) $payment->amount) > 0.009) {
            Log::error('UddoktaPay confirmed a different amount than we charged', [
                'payment' => $payment->transaction_id,
                'gateway_amount' => $verification->amount,
                'our_amount' => $payment->amount,
            ]);

            return $payment;
        }

        $payment->update([
            'status' => 'SUCCESS',
            'date' => now(),
            'receipt_url' => $verification->gatewayReference,
            'gateway_order_id' => $verification->invoiceId ?? $payment->gateway_order_id,
        ]);

        $this->settleInstallment($payment);

        return $payment->refresh();
    }

    /**
     * Marks the installment paid and releases the device once nothing is owed.
     *
     * The device state is written here, on the server, from a payment that was
     * verified. The app never decides that a phone is unlocked.
     */
    private function settleInstallment(CustomerPayment $payment): void
    {
        $installment = Installment::query()
            ->where('customer_key', $payment->customer_key)
            ->where('number', $payment->installment_number)
            ->first();

        if (! $installment) {
            return;
        }

        $installment->update([
            'paid_amount' => (float) $installment->amount,
            'status' => 'PAID',
            'paid_at' => now(),
        ]);

        $stillOwed = Installment::query()
            ->where('customer_key', $payment->customer_key)
            ->where('status', '!=', 'PAID')
            ->exists();

        if (! $stillOwed) {
            // Fully paid: the contract is honoured, so the device is released.
            Device::query()
                ->where('customer_key', $payment->customer_key)
                ->update(['state' => 'UNLOCKED']);
        }
    }

    private function newReference(): string
    {
        return 'TXN-' . strtoupper(Str::random(10));
    }
}
