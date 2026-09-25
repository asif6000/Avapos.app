<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing
    |--------------------------------------------------------------------------
    |
    | The customer app ships as a native build *and* as a web build
    | (`expo start --web`, and the exported bundle). React Native's fetch
    | ignores CORS entirely; a browser does not. With no headers on the
    | response, a browser blocks it before the app sees a single byte, `fetch`
    | rejects, and the app reports "Unable to reach our servers" — while the
    | server is in fact answering perfectly well.
    |
    | That is not a guess: a preflight to /customer returns 200 with no
    | `Access-Control-Allow-Origin` at all, which is what the web build was
    | doing.
    |
    | `supports_credentials` stays false on purpose. The app authenticates with
    | a Supabase access token in the `Authorization` header, never a cookie, so
    | there is nothing for a browser to attach automatically and nothing here
    | that a cross-origin page could ride on. A `*` origin is therefore
    | defensible in this configuration — but listing the app's own web origins
    | is still better, so set CORS_ALLOWED_ORIGINS in `.env`:
    |
    |   CORS_ALLOWED_ORIGINS=https://app.example.com,http://localhost:8081
    |
    | The tunnel and preview hostnames change with every build, so a wildcard
    | per subdomain is usually what a staging deployment wants:
    |
    |   CORS_ALLOWED_ORIGINS=https://*.e2b.app,https://*.expo.app
    |
    | If this file already exists in the Laravel app, merge these keys rather
    | than replacing it, then clear the cached config — a cached config file
    | keeps serving the old headers until you do:
    |
    |   php artisan config:clear
    |
    */

    'paths' => ['customer/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],

    /*
     | No cookies, so a wildcard is safe here — see above. Kept as the default
     | so a web build works in development without a per-environment .env entry.
     */
    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('CORS_ALLOWED_ORIGINS', '*'))
    ))),

    'allowed_origins_patterns' => [],

    // The Authorization header is the credential here; the rest are the app's
    // own request headers.
    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Client-Request-Id'],

    // Only these, if the server ever wants to hand something back for display.
    'exposed_headers' => ['X-Client-Request-Id'],

    'max_age' => 3600,

    'supports_credentials' => false,

];
