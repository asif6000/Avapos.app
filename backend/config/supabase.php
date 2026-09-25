<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Supabase project
    |--------------------------------------------------------------------------
    |
    | The mobile app signs in with Supabase Auth and presents that access token
    | as its bearer. This project reference is used to fetch the JWKS that
    | signs those tokens, and to build the issuer/audience the token must match.
    |
    | NEVER put the service_role key here. It bypasses RLS and must never leave
    | the server.
    |
    */

    'project_ref' => env('SUPABASE_PROJECT_REF', 'vslediphrlrlhrormmxh'),

    /*
    | Tables the API owns. The client reads notifications and device records
    | directly under RLS; everything that changes money or device state happens
    | here, server-side.
    */
    'tables' => [
        'profiles' => 'profiles',
        'devices' => 'devices',
        'payments' => 'payments',
        'notifications' => 'notifications',
        'support_tickets' => 'support_tickets',
    ],
];
