<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Who may use the admin panel
    |--------------------------------------------------------------------------
    |
    | An admin can read every customer's money, device and contract, and can act
    | on it. That makes this file the most sensitive list in the project.
    |
    | TWO WAYS IN, both checked on the server for every single request:
    |
    |  1. `emails` — an allow-list of Supabase auth addresses. Add an admin by
    |     adding an address here. Nothing else to do, nothing else to trust.
    |  2. `require_app_metadata_role` — when true, the token must also carry
    |     `app_metadata.role = 'admin'`. `app_metadata` can only be set with the
    |     service-role key, so a customer cannot promote themselves by editing
    |     their own user metadata.
    |
    | Everything else is refused. In particular the panel itself is never
    | trusted: it may present itself as an admin, and the answer comes from here
    | regardless of what it says, because the browser is not a security boundary.
    |
    | The service-role key is used *here*, on the server, to read the tables an
    | admin needs. It is never sent to the panel: the panel authenticates with an
    | ordinary Supabase session, exactly as the customer app does.
    |
    */

    'emails' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('ADMIN_EMAILS', 'admin@srabontelecom.com'))
    ))),

    'require_app_metadata_role' => (bool) env('ADMIN_REQUIRE_APP_METADATA_ROLE', true),

    'app_metadata_role' => env('ADMIN_APP_METADATA_ROLE', 'admin'),

];
