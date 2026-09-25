<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * UddoktaPay.
 *
 * Documented API, implemented exactly:
 *
 *   POST {base}/api/checkout-v2     → { status, message, payment_url }
 *   POST {base}/api/verify-payment  → { invoice_id, status, charged_amount, … }
 *
 * Both authenticate with the merchant key in the `RT-UDDOKTAPAY-API-KEY` header.
 * That header is the only place the key appears: it is never a query parameter,
 * never a log line, and never anything returned to the phone.
 *
 * Two things about this gateway are worth knowing, because they shape the design:
 *
 * - **The create response carries no invoice id.** It returns a `payment_url`
 *   only. The invoice id arrives later — as a query parameter on the return URL,
 *   and in the IPN body. So a payment cannot be verified until one of those has
 *   been seen, and the return handler is what supplies it.
 * - **There is no documented signature on the callback.** So the callback is
 *   never believed: it is treated as a claim ("this invoice id is worth asking
 *   about") and the answer comes from `verify-payment`. Our own transaction id
 *   comes back inside `metadata`, which is what links a verified invoice to a
 *   payment of ours. A stranger posting somebody else's invoice id therefore
 *   settles nothing: the metadata does not name a payment we hold.
 */
class HttpPaymentGateway implements PaymentGateway
{
    /** UddoktaPay's terminal-and-not-yet-terminal states. */
    private const PAID_STATES = ['COMPLETED', 'PAID', 'SUCCESS'];

    public function __construct(private readonly array $config)
    {
    }

    public function isConfigured(): bool
    {
        return filled($this->config['api_key'] ?? null) && filled($this->config['base_url'] ?? null);
    }

    public function createCharge(ChargeRequest $request): Charge
    {
        $this->assertConfigured();

        $response = Http::timeout((int) ($this->config['timeout'] ?? 20))
            ->withHeaders([
                'RT-UDDOKTAPAY-API-KEY' => $this->config['api_key'],
                'Accept' => 'application/json',
            ])
            ->asJson()
            ->post($this->url('api/checkout-v2'), [
                'full_name' => $request->description === '' ? 'Customer' : $request->customerName,
                'email' => $request->customerEmail,
                // UddoktaPay takes the amount as a string with two decimals.
                'amount' => number_format($request->amount, 2, '.', ''),
                'metadata' => $request->metadata,
                'redirect_url' => $this->config['return_url'] ?? $this->config['callback_url'],
                'return_type' => 'GET',
                'cancel_url' => $this->config['cancel_url'] ?? $this->config['callback_url'],
                'webhook_url' => $this->config['webhook_url'] ?? null,
            ]);

        $body = $response->json() ?? [];
        $paymentUrl = $body['payment_url'] ?? null;

        if (! $response->successful() || ! ($body['status'] ?? false) || ! $paymentUrl) {
            // The message is UddoktaPay's and is safe to record; the key is not.
            Log::warning('UddoktaPay refused to create a charge', [
                'reference' => $request->reference,
                'status' => $response->status(),
                'message' => $body['message'] ?? null,
            ]);

            throw new RuntimeException(
                $body['message'] ?? 'The payment provider could not start this payment.',
            );
        }

        return new Charge(
            reference: $request->reference,
            // The token in the checkout URL is all the gateway tells us up front.
            // It is not the invoice id, so it is stored for logging and for the
            // "has it started at all" question, not for verification.
            orderId: $this->tokenFromPaymentUrl((string) $paymentUrl),
            checkoutUrl: (string) $paymentUrl,
            method: $request->method,
            expiresAt: null,
        );
    }

    public function verifyCharge(string $invoiceId): Verification
    {
        $this->assertConfigured();

        $response = Http::timeout((int) ($this->config['timeout'] ?? 20))
            ->withHeaders([
                'RT-UDDOKTAPAY-API-KEY' => $this->config['api_key'],
                'Accept' => 'application/json',
            ])
            ->asJson()
            ->post($this->url('api/verify-payment'), ['invoice_id' => $invoiceId]);

        $body = $response->json() ?? [];

        if (! $response->successful()) {
            Log::warning('UddoktaPay could not be asked about an invoice', [
                'invoice_id' => $invoiceId,
                'status' => $response->status(),
                'message' => $body['message'] ?? null,
            ]);

            // "Could not ask" is not "not paid". Reporting unpaid here would
            // quietly cancel a payment the customer actually made.
            return new Verification(paid: false, message: $body['message'] ?? 'The provider could not be reached.');
        }

        // UddoktaPay answers HTTP 200 with `status: false` for an invoice it does
        // not have. That is "invalid", not "not paid yet", and it must not be
        // logged as a failure — the app is simply asking about an order that was
        // never completed.
        if (($body['status'] ?? null) === false) {
            return new Verification(
                paid: false,
                message: (string) ($body['message'] ?? 'Unknown payment.'),
                invoiceId: $invoiceId,
                status: 'INVALID',
            );
        }

        $status = strtoupper((string) ($body['status'] ?? ''));
        $charged = $body['charged_amount'] ?? $body['amount'] ?? null;
        $metadata = is_array($body['metadata'] ?? null) ? $body['metadata'] : [];

        return new Verification(
            paid: in_array($status, self::PAID_STATES, true),
            gatewayReference: $body['transaction_id'] ?? null,
            amount: $charged === null ? null : (float) $charged,
            currency: 'BDT',
            method: $body['payment_method'] ?? null,
            message: $body['message'] ?? null,
            // UddoktaPay echoes our own metadata back. This is how a verified
            // invoice is tied to the payment it belongs to.
            ourReference: $metadata['transaction_id'] ?? $metadata['reference'] ?? null,
            invoiceId: $body['invoice_id'] ?? $invoiceId,
            status: $status,
        );
    }

    /**
     * UddoktaPay does not sign its callbacks, so there is no signature to check
     * and pretending otherwise would only be theatre. What a callback *is* is a
     * claim, and this decides whether it is worth spending an API call on: it has
     * to look like an invoice id and nothing else. The answer still comes from
     * `verify-payment`, never from the body.
     */
    public function isWorthVerifying(array $payload): bool
    {
        $invoiceId = $payload['invoice_id'] ?? null;

        return is_string($invoiceId) && $invoiceId !== '' && strlen($invoiceId) <= 128;
    }

    private function url(string $path): string
    {
        return rtrim((string) $this->config['base_url'], '/') . '/' . ltrim($path, '/');
    }

    private function tokenFromPaymentUrl(string $paymentUrl): string
    {
        $path = parse_url($paymentUrl, PHP_URL_PATH) ?: '';
        $segments = array_values(array_filter(explode('/', $path)));

        return (string) end($segments);
    }

    private function assertConfigured(): void
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('The payment gateway is not configured on this server.');
        }
    }
}
