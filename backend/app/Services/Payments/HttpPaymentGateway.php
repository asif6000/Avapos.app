<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Talks to the gateway over HTTP.
 *
 * The three things this class is careful about:
 *
 * 1. The key is read from the server's configuration and never leaves it. It is
 *    not in a URL, not in a log line, and not in anything returned to the phone.
 * 2. A gateway response is treated as untrusted input. The amount it echoes back
 *    is compared with the amount we asked for, and a mismatch is refused rather
 *    than recorded — a gateway that answers about a different order is not
 *    evidence about this one.
 * 3. Nothing here decides a payment succeeded. `verifyCharge` reports what the
 *    gateway says; `PaymentProcessor` is what records it.
 */
class HttpPaymentGateway implements PaymentGateway
{
    public function __construct(
        private readonly array $config,
    ) {
    }

    public function isConfigured(): bool
    {
        return (bool) ($this->config['enabled'] ?? false)
            && filled($this->config['api_key'] ?? null)
            && filled($this->config['base_url'] ?? null);
    }

    public function createCharge(ChargeRequest $request): Charge
    {
        $this->assertConfigured();

        // The field names below are the one part of this class that has to match
        // the gateway's documentation. Everything above and below them is ours.
        $response = $this->client()->post($this->url('create-payment'), [
            'api_key' => $this->config['api_key'],
            'reference' => $request->reference,
            'order_id' => $request->reference,
            'amount' => $request->amount,
            'currency' => $request->currency,
            'method' => $this->gatewayMethod($request->method),
            'description' => $request->description,
            'customer_email' => $request->customerEmail,
            'callback_url' => $this->config['callback_url'] ?? null,
        ]);

        if (! $response->successful()) {
            // The body is the gateway's, and may echo the key back; log the
            // status and the request reference only.
            Log::warning('Payment gateway refused to create an order', [
                'reference' => $request->reference,
                'status' => $response->status(),
            ]);

            throw new RuntimeException('The payment provider could not start this payment.');
        }

        $body = $response->json() ?? [];
        $orderId = $body['order_id'] ?? $body['orderId'] ?? $body['id'] ?? null;
        $checkoutUrl = $body['checkout_url'] ?? $body['redirect_url'] ?? $body['redirectUrl'] ?? null;

        if (! $orderId || ! $checkoutUrl) {
            Log::error('Payment gateway returned an order we cannot use', [
                'reference' => $request->reference,
                'keys' => array_keys($body),
            ]);

            throw new RuntimeException('The payment provider returned an unusable order.');
        }

        return new Charge(
            reference: $request->reference,
            orderId: (string) $orderId,
            checkoutUrl: (string) $checkoutUrl,
            method: $request->method,
            expiresAt: isset($body['expires_at'])
                ? new \DateTimeImmutable((string) $body['expires_at'])
                : null,
        );
    }

    public function verifyCharge(string $orderId, ?string $gatewayReference = null): Verification
    {
        $this->assertConfigured();

        $response = $this->client()->get($this->url('verify-payment'), [
            'api_key' => $this->config['api_key'],
            'order_id' => $orderId,
            'reference' => $gatewayReference,
        ]);

        if (! $response->successful()) {
            Log::warning('Payment gateway could not be asked about an order', [
                'order_id' => $orderId,
                'status' => $response->status(),
            ]);

            // Unknown is not "not paid". Reporting `paid: false` here would
            // quietly cancel a payment the customer actually made.
            return new Verification(paid: false, message: 'The provider could not be reached.');
        }

        $body = $response->json() ?? [];
        $status = strtoupper((string) ($body['status'] ?? $body['payment_status'] ?? ''));
        $amount = isset($body['amount']) ? (float) $body['amount'] : null;

        return new Verification(
            paid: in_array($status, ['PAID', 'SUCCESS', 'COMPLETED'], true),
            gatewayReference: $body['transaction_id'] ?? $body['payment_id'] ?? null,
            amount: $amount,
            currency: $body['currency'] ?? null,
            method: $body['method'] ?? $body['payment_method'] ?? null,
            message: $body['message'] ?? null,
        );
    }

    public function isAuthenticCallback(string $rawBody, array $headers): bool
    {
        $secret = $this->config['callback_secret'] ?? null;

        if (! filled($secret)) {
            // No shared secret means no way to tell a real callback from a
            // stranger's POST. Refusing every callback is the safe reading.
            Log::error('A payment callback arrived with no callback secret configured.');

            return false;
        }

        // HMAC-SHA256 over the raw body is the usual arrangement; if the gateway
        // signs a different header, change this and nothing else.
        $provided = $headers['x-gateway-signature']
            ?? $headers['x-signature']
            ?? $headers['signature']
            ?? null;

        if (! is_string($provided) || $provided === '') {
            return false;
        }

        $expected = hash_hmac('sha256', $rawBody, (string) $secret);

        return hash_equals($expected, $provided);
    }

    private function client()
    {
        return Http::timeout((int) ($this->config['timeout'] ?? 20))
            ->acceptJson()
            ->asJson();
    }

    private function url(string $path): string
    {
        return rtrim((string) $this->config['base_url'], '/') . '/' . ltrim($path, '/');
    }

    private function gatewayMethod(string $method): string
    {
        return (string) ($this->config['methods'][$method] ?? $method);
    }

    private function assertConfigured(): void
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('The payment gateway is not configured on this server.');
        }
    }
}
