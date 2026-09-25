<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Payment gateway
    |--------------------------------------------------------------------------
    |
    | The customer app never holds any of this. It asks *this* server to create
    | an order, sends the customer to the gateway, and then polls
    | `GET /customer/payments/{id}/status` until this server — which verified the
    | gateway's callback — reports a terminal state.
    |
    | That is not a stylistic choice. A merchant API key inside a mobile bundle
    | is readable by anyone who unzips the app, and a key that leaves the server
    | can create orders that no installment backs. The key belongs here, in the
    | server's environment, and nowhere else — not in `app.config.ts`, not in an
    | `EXPO_PUBLIC_*` variable (those are inlined into the shipped bundle), not
    | in SecureStore or AsyncStorage on the customer's phone.
    |
    | Required in the server's `.env`:
    |
    |   UDDOKTAPAY_API_KEY=...                 (UddoktaPay → Dashboard → API Keys)
    |   UDDOKTAPAY_BASE_URL=https://srabontelecom.paymently.io
    |   UDDOKTAPAY_RETURN_URL=https://srabontelecom.paymently.io/customer/payment/return
    |   UDDOKTAPAY_CANCEL_URL=https://srabontelecom.paymently.io/customer/payment/cancel
    |   UDDOKTAPAY_WEBHOOK_URL=https://srabontelecom.paymently.io/api/gateway/ipn
    |
    | While `enabled` is false, `POST /customer/payments/create` answers 501 with
    | a plain message, which is exactly what the app shows the customer. Turning
    | it on without a key does not fall back to a fake payment: it fails loudly.
    |
    */

    'gateway' => env('PAYMENT_GATEWAY', 'uddoktapay'),

    /**
     * The UddoktaPay *installation*, not the API path. UddoktaPay appends
     * `api/checkout-v2` and `api/verify-payment` itself — pointing this at
     * `.../api` would produce `.../api/api/checkout-v2`, which is a 404.
     */
    'base_url' => rtrim((string) env('UDDOKTAPAY_BASE_URL', 'https://srabontelecom.paymently.io'), '/'),

    /**
     * The merchant key, sent in the `RT-UDDOKTAPAY-API-KEY` header.
     * Server-side only: never returned to the client, never logged.
     */
    'api_key' => env('UDDOKTAPAY_API_KEY'),

    /**
     * Where the customer lands after paying, and where a cancellation goes.
     * UddoktaPay derives its success/failure/cancel URLs from this.
     */
    'return_url' => env('UDDOKTAPAY_RETURN_URL'),
    'cancel_url' => env('UDDOKTAPAY_CANCEL_URL'),

    /** UddoktaPay's IPN. It posts the same invoice the return URL receives. */
    'webhook_url' => env('UDDOKTAPAY_WEBHOOK_URL'),

    'timeout' => (int) env('UDDOKTAPAY_TIMEOUT', 20),

    /*
    | The methods the app offers, mapped to the gateway's own names. The app's
    | four are fixed by `endpoints.ts`; the right-hand values are whatever the
    | gateway calls them.
    */
    'methods' => [
        'bkash' => env('PAYMENT_GATEWAY_METHOD_BKASH', 'bkash'),
        'nagad' => env('PAYMENT_GATEWAY_METHOD_NAGAD', 'nagad'),
        'rocket' => env('PAYMENT_GATEWAY_METHOD_ROCKET', 'rocket'),
        'card' => env('PAYMENT_GATEWAY_METHOD_CARD', 'card'),
    ],

];
