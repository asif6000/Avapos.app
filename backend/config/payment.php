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
    |   PAYMENT_GATEWAY_BASE_URL=https://srabontelecom.paymently.io/api
    |   PAYMENT_GATEWAY_API_KEY=...            (rotate anything pasted into chat)
    |   PAYMENT_CALLBACK_SECRET=...            (shared with the gateway, to sign callbacks)
    |   PAYMENT_CALLBACK_URL=https://srabontelecom.paymently.io/api/gateway/callback
    |   PAYMENT_GATEWAY_ENABLED=true
    |
    | While `enabled` is false, `POST /customer/payments/create` answers 501 with
    | a plain message, which is exactly what the app shows the customer. Turning
    | it on without a key does not fall back to a fake payment: it fails loudly.
    |
    */

    'gateway' => env('PAYMENT_GATEWAY', 'uddaktapay'),

    'base_url' => env('PAYMENT_GATEWAY_BASE_URL', 'https://srabontelecom.paymently.io/api'),

    /** Server-side only. Never returned to the client, never logged. */
    'api_key' => env('PAYMENT_GATEWAY_API_KEY'),

    /**
     * Used to verify that a callback really came from the gateway. A callback
     * that is not verified is not evidence that anyone paid.
     */
    'callback_secret' => env('PAYMENT_CALLBACK_SECRET'),

    /** Where the gateway posts the result of a payment. */
    'callback_url' => env('PAYMENT_CALLBACK_URL'),

    'timeout' => (int) env('PAYMENT_GATEWAY_TIMEOUT', 20),

    'enabled' => (bool) env('PAYMENT_GATEWAY_ENABLED', false),

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
