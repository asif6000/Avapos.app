<?php

namespace App\Services\Payments;

/**
 * What the app is told about a payment it has just started.
 *
 * Deliberately small: a reference we keep, an order id the gateway knows, a URL
 * to send the customer to, and when it stops being payable. No API key, no
 * signature, no callback secret — none of that may ever travel back to a phone.
 */
final readonly class ChargeRequest
{
    public function __construct(
        public string $reference,
        public float $amount,
        public string $currency,
        public string $method,
        public string $description,
        public string $customerEmail,
    ) {
    }
}

final readonly class Charge
{
    public function __construct(
        /** What we store as the payment id and show the customer. */
        public string $reference,
        /** The gateway's own order id, used when verifying the callback. */
        public string $orderId,
        /** Where the customer completes the payment. */
        public string $checkoutUrl,
        public string $method,
        public ?\DateTimeImmutable $expiresAt = null,
    ) {
    }
}

/**
 * What the gateway says about a payment after we ask it, or after it called us
 * back. This is the only input that may move a payment to SUCCESS.
 */
final readonly class Verification
{
    public function __construct(
        public bool $paid,
        public ?string $gatewayReference = null,
        public ?float $amount = null,
        public ?string $currency = null,
        public ?string $method = null,
        public ?string $message = null,
    ) {
    }
}

/**
 * The gateway, as the rest of the app sees it.
 *
 * Everything vendor-specific lives behind this interface. When the gateway's
 * documentation arrives, `HttpPaymentGateway` is the only class that changes —
 * the controller, the callback route and the app all keep talking to these three
 * methods, and none of them can be moved by the phone.
 */
interface PaymentGateway
{
    /** Creates an order. Throws if the gateway refuses; never returns a half-built charge. */
    public function createCharge(ChargeRequest $request): Charge;

    /**
     * Asks the gateway what really happened to this order.
     *
     * This is deliberately a question, not a callback payload: a webhook body
     * can be forged, so the callback route calls this to find out for itself.
     */
    public function verifyCharge(string $orderId, ?string $gatewayReference = null): Verification;

    /** Verifies a callback's own signature, so a forged POST never reaches `verifyCharge`. */
    public function isAuthenticCallback(string $rawBody, array $headers): bool;
}
