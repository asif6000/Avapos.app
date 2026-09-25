<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Payments\PaymentGateway;
use App\Services\Payments\PaymentProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The gateway's callback.
 *
 * This route is the *only* way a payment can become SUCCESS, and it does not
 * believe itself. It checks the callback's signature, and then asks the gateway
 * directly what happened. A POST that arrives with a forged body — or with a
 * perfectly valid body for somebody else's order — changes nothing, because the
 * answer comes from the gateway, not from the request.
 *
 * No customer session is involved: the caller is the gateway, not the app.
 */
class GatewayCallbackController extends Controller
{
    public function __construct(
        private readonly PaymentGateway $gateway,
        private readonly PaymentProcessor $payments,
    ) {
    }

    public function __invoke(Request $request): JsonResponse
    {
        if (! $this->gateway->isAuthenticCallback($request->getContent(), $request->headers->all())) {
            Log::warning('Rejected a payment callback with a bad signature.', [
                'ip' => $request->ip(),
            ]);

            return response()->json(['status' => 'error', 'message' => 'Invalid signature.'], 401);
        }

        $body = $request->json()->all();
        $paymentId = $body['reference'] ?? $body['order_id'] ?? $body['payment_id'] ?? null;
        $gatewayReference = $body['transaction_id'] ?? $body['payment_id'] ?? null;

        if (! $paymentId) {
            return response()->json(['status' => 'error', 'message' => 'No reference.'], 422);
        }

        try {
            $payment = $this->payments->settleFromGateway((string) $paymentId, $gatewayReference);
        } catch (Throwable $exception) {
            Log::error('Payment callback could not be settled', [
                'reference' => $paymentId,
                'message' => $exception->getMessage(),
            ]);

            return response()->json(['status' => 'error', 'message' => 'Could not settle.'], 500);
        }

        // The gateway is told what happened in terms it understands, and nothing
        // about the customer is echoed back to it.
        return response()->json([
            'status' => 'ok',
            'payment_status' => strtoupper((string) $payment->status),
        ]);
    }
}
