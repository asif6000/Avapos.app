<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Payments\HttpPaymentGateway;
use App\Services\Payments\PaymentGateway;
use App\Services\Payments\PaymentProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Where the customer comes back to, and where the gateway calls.
 *
 * UddoktaPay sends the customer here with `invoice_id` after payment, and posts
 * the same invoice to the IPN URL. Neither is believed.
 *
 * What this controller does with a request:
 *
 *   1. take the invoice id it was given
 *   2. ask UddoktaPay what really happened to that invoice
 *   3. settle the payment named in the *verified* response's metadata
 *   4. tell the customer what happened, in a page they can close
 *
 * The app is not involved in any of it. It is polling
 * `GET /customer/payments/{id}/status` and will find the answer here, which is
 * the only place an answer comes from.
 */
class GatewayCallbackController extends Controller
{
    public function __construct(
        private readonly PaymentGateway $gateway,
    ) {
    }

    /** The customer's browser lands here after paying. */
    public function return(Request $request): mixed
    {
        $payload = array_merge($request->query(), $request->json()->all());
        $result = $this->resolve($payload);

        return response($this->page(
            $result['status'] === 'SUCCESS'
                ? 'Payment received'
                : ($result['status'] === 'PENDING' ? 'Almost there' : 'Payment not completed'),
            $result['message'],
        ), 200)
            ->header('Content-Type', 'text/html; charset=utf-8');
    }

    /** UddoktaPay's IPN. Same handling, because the same verification follows. */
    public function ipn(Request $request): JsonResponse
    {
        $payload = array_merge($request->query(), $request->json()->all(), $request->all());
        $result = $this->resolve($payload);

        return response()->json([
            'status' => 'ok',
            'payment_status' => $result['status'],
        ]);
    }

    /**
     * @return array{status: string, message: string}
     */
    private function resolve(array $payload): array
    {
        if (! $this->gateway->isWorthVerifying($payload)) {
            return ['status' => 'IGNORED', 'message' => 'That request was not a payment notification.'];
        }

        $invoiceId = (string) $payload['invoice_id'];

        try {
            $payment = $this->payments()->settleFromInvoice($invoiceId);
        } catch (Throwable $exception) {
            Log::error('A payment callback could not be settled', [
                'invoice_id' => $invoiceId,
                'message' => $exception->getMessage(),
            ]);

            return ['status' => 'PENDING', 'message' => 'We are still checking this payment.'];
        }

        if ($payment?->status === 'SUCCESS') {
            return [
                'status' => 'SUCCESS',
                'message' => 'Your payment has been recorded. You can close this window and return to the app.',
            ];
        }

        return [
            'status' => 'PENDING',
            'message' => 'We have not confirmed this payment yet. Close this window; the app will update itself.',
        ];
    }

    private function payments(): PaymentProcessor
    {
        return new PaymentProcessor(new HttpPaymentGateway(config('payment')));
    }

    /** A plain page, because this one is opened in the customer's browser. */
    private function page(string $title, string $body): string
    {
        $title = e($title);
        $body = e($body);

        return <<<HTML
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
            <title>{$title}</title>
            <style>
              * { box-sizing: border-box; }
              body {
                margin: 0; min-height: 100vh; background: #f6f8f8; color: #131918;
                font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center; gap: 8px;
                padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
              }
              .card {
                width: 100%; max-width: 400px; background: #fff;
                border: 1px solid #e4edea; border-radius: 20px; padding: 28px 22px;
                box-shadow: 0 8px 24px rgba(16,20,20,0.08);
              }
              h1 { font-size: 20px; margin: 0 0 8px; letter-spacing: -0.2px; }
              p { margin: 0; color: #3f4947; }
              .dot { width: 44px; height: 44px; border-radius: 999px; background: #0b6b5b;
                     display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
              .dot span { color: #fff; font-size: 22px; }
              .foot { font-size: 12px; color: #6f7977; margin-top: 18px; }
            </style>
          </head>
          <body>
            <main class="card">
              <div class="dot"><span>&check;</span></div>
              <h1>{$title}</h1>
              <p>{$body}</p>
              <p class="foot">Srabon Telecom</p>
            </main>
          </body>
        </html>
        HTML;
    }
}
