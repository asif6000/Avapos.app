<?php

namespace App\Services\Payments;

/**
 * What the app is told about a payment it has just started.
 *
 * Deliberately small: a reference we keep, an order id, a URL to send the
 * customer to, and when it stops being payable. No API key, no signature, no
 * callback secret — none of that may ever travel back to a phone.
 *
 * `metadata` is UddoktaPay's free-form object. It comes back on verification, so
 * it is where our own reference goes: that echo is how a verified invoice is
 * tied back to the payment it belongs to.
 */
final readonly class ChargeRequest
{
    public function __construct(
        public string $reference,
        public float $amount,
        public string $currency,
        public string $method,
        public string $customerName,
        public string $customerEmail,
        public array $metadata = [],
    ) {
    }
}

final readonly class Charge
{
    public function __construct(
        /** What we store as the payment id and show the customer. */
        public string $reference,
        /**
         * Whatever the gateway calls its order at creation time. UddoktaPay only
         * hands back a checkout token here; the invoice id comes later.
         */
        public string $orderId,
        /** Where the customer completes the payment. */
        public string $checkoutUrl,
        public string $method,
        public ?\DateTimeImmutable $expiresAt = null,
    ) {
    }
}

/**
 * What the gateway says about an invoice after we asked it.
 *
 * This is the only input that may move a payment to SUCCESS.
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
        /** Our own reference, echoed back inside the gateway's metadata. */
        public ?string $ourReference = null,
        public ?string $invoiceId = null,
        public string $status = '',
    ) {
    }
}

/**
 * The gateway, as the rest of the app sees it.
 *
 * Everything vendor-specific lives behind this interface. The controller, the
 * callback route and the app all keep talking to these three methods, and none of
 * them can be moved by the phone.
 */
interface PaymentGateway
{
    public function isConfigured(): bool;

    /** Creates an order. Throws if the gateway refuses; never returns a half-built charge. */
    public function createCharge(ChargeRequest $request): Charge;

    /**
     * Asks the gateway what really happened to this invoice.
     *
     * A question, not a payload: a callback body can be forged, so the callback
     * route uses this to find out for itself.
     */
    public function verifyCharge(string $invoiceId): Verification;

    /**
     * Whether a callback is worth spending an API call on. Not a trust decision:
     * a gateway that signs its callbacks gets the signature checked here, and one
     * that does not (UddoktaPay) gets a shape check, with the evidence still
     * coming from `verifyCharge`.
     */
    public function isWorthVerifying(array $payload): bool;
}
