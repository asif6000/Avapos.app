-- ============================================================================
-- 00-run-all-in-order.sql
--
-- ONE PASTE. Replaces running 01…06 by hand, in the right order, in the
-- Supabase SQL Editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- Generated from the individual scripts, which remain the source of truth and
-- are not edited by this file. Order matters and is not alphabetical:
--
--   01 stop-the-bleed      revoke anon access      MUST BE FIRST
--   02 add-auth-link       profiles.auth_uid       after 01, before 03
--   03 owner-policies      RLS keyed on auth.uid() after 02
--   04 link-demo-customer  the customer row + link after 01
--   05 device-commands     the commands table      after 01
--   06 device-report       the device report table after 01
--
-- SAFE TO RUN TWICE. Every statement in every script is `if not exists`,
-- `on conflict`, `if exists`, or otherwise conditional.
--
-- ONE PRECONDITION. 01…05 all create what they need. 06 does not: it only does
--   `alter table public.devices …`, so it needs a `devices` table to already
--   exist. If the paste stops at 06 with `relation "devices" does not exist`,
--   that is this, not damage — 01…05 already applied. Create the table or skip
--   06; 06 only adds reporting columns the device panel reads, so the customer
--   app is unaffected by leaving it out.
--
-- If a statement does fail, the SQL Editor runs a pasted script inside a
-- transaction, so a failure rolls the whole paste back and it is safe to fix
-- the cause and run it again from the top.
--
-- WHAT THIS WILL AND WILL NOT FIX
--
--   Fixes:   GET /customer        401 -> 200   (the session resolves to a
--                                                    customer at all)
--            GET /customer/payments 401 -> 200  (payments.customer_key exists)
--
--   Does NOT fix: GET /customer/dashboard        404 -> 404
--                GET /customer/profile           404 -> 404
--                GET /customer/settings          404 -> 404
--                GET /customer/devices/me        404 -> 404
--                GET /customer/installments      404 -> 404
--                GET /customer/notifications     404 -> 404
--                GET /customer/support/tickets   404 -> 404
--
--   Those seven are 404 *with and without* a valid session, which is Laravel's
--   "no such route" rather than "not authorised". No route named them on the
--   deployed server, and no route named them anywhere in backend/ either. This
--   SQL cannot conjure an endpoint; someone has to deploy a backend that has
--   them. Until then Home, Installments, Device and Support have nothing to
--   render, and the app correctly shows an error rather than inventing one.
-- ============================================================================




-- ###########################################################################
-- BEGIN 01-stop-the-bleed.sql
-- ###########################################################################


-- ============================================================================
-- 01-stop-the-bleed.sql   — RUN THIS FIRST, RIGHT NOW
--
-- Supabase SQL editor → vslediphrlrlhrormmxh → paste → Run.
-- Safe to run repeatedly. Takes effect immediately.
--
-- CURRENT SITUATION
-- The publishable ("anon") key ships inside the app bundle, so anyone can lift
-- it out of the APK. Right now that key can:
--   - read every row of profiles, devices, payments and support_tickets
--   - UPDATE devices  (verified: an unauthenticated PATCH returned HTTP 200)
--
-- A writable devices.state means anyone could set their phone to UNLOCKED
-- without paying a taka. That is the one thing this app exists to prevent.
--
-- WHAT THIS SCRIPT DOES
-- Turns row level security on for every table and revokes the blanket grants
-- Supabase hands out by default.
--
-- CONSEQUENCE, DELIBERATE: the app will see ZERO rows until 02 and 03 are
-- applied. That is the correct trade — closed but correct, rather than open and
-- leaking. The app already handles it: EXPO_PUBLIC_SUPABASE_READS_ENABLED is
-- false, so the app is not reading from Supabase at all yet.
-- ============================================================================


-- 1. Turn on RLS everywhere. `force` also applies to the table owner, so
--    nothing accidentally bypasses it.
alter table public.profiles        enable row level security;
alter table public.devices         enable row level security;
alter table public.payments        enable row level security;
alter table public.notifications   enable row level security;
alter table public.support_tickets enable row level security;

alter table public.profiles        force row level security;
alter table public.devices         force row level security;
alter table public.payments        force row level security;
alter table public.notifications   force row level security;
alter table public.support_tickets force row level security;


-- 2. Remove the default grants. Supabase grants anon and authenticated broad
--    access to everything in public; the policies, not the grants, are meant to
--    decide access. anon gets nothing at all.
revoke all on public.profiles        from anon;
revoke all on public.devices         from anon;
revoke all on public.payments        from anon;
revoke all on public.notifications   from anon;
revoke all on public.support_tickets from anon;

revoke all on public.profiles        from authenticated;
revoke all on public.devices         from authenticated;
revoke all on public.payments        from authenticated;
revoke all on public.notifications   from authenticated;
revoke all on public.support_tickets from authenticated;


-- 3. Re-grant only the verbs the app may ever perform, as a floor. The RLS
--    policies added in 03 tighten this further per row.
grant select on public.profiles        to authenticated;
grant select on public.devices         to authenticated;
grant select on public.payments        to authenticated;
grant select on public.notifications   to authenticated;
grant select on public.support_tickets to authenticated;

-- Customers may open a ticket and mark a notification read. Nothing else.
grant insert on public.support_tickets to authenticated;
grant update on public.notifications   to authenticated;
grant update on public.profiles        to authenticated;

-- NOTE what is deliberately NOT granted to anyone on the client:
--   insert/update/delete on devices  — state, contract_id and enrollment_status
--                                       are server-authoritative. A client that
--                                       can write them can unlock itself.
--   update on support_tickets          — admin_response must not be forgeable.
--   any insert/update/delete on payments — only the backend, after it has
--                                       verified the gateway callback, may
--                                       mark a payment SUCCESS.


-- 4. Confirm. Run these as a separate query; both must be 0.
select
  (select count(*) from public.devices)         as devices_visible,
  (select count(*) from public.payments)        as payments_visible,
  (select count(*) from public.profiles)        as profiles_visible,
  (select count(*) from public.support_tickets) as tickets_visible;


-- ###########################################################################
-- END 01-stop-the-bleed.sql
-- ###########################################################################


-- ###########################################################################
-- BEGIN 02-add-auth-link.sql
-- ###########################################################################


-- ============================================================================
-- 02-add-auth-link.sql
--
-- Run AFTER 01-stop-the-bleed.sql, and before 03-owner-policies.sql.
--
-- THE PROBLEM THIS SOLVES
-- RLS decides access by asking `auth.uid()` — the Supabase Auth user's id,
-- which is a UUID like '9f1c2b3a-...'. But this database's tables are keyed by
-- human-readable strings:
--
--   profiles.id          = 'CUST-23839'
--   devices.id           = 'DEV-SAM-A15-098'
--   support_tickets.id   = 'TICK-4029'
--
-- So a policy reading `id = auth.uid()` can never match, and customers would see
-- nothing. Every table needs a real link back to the Supabase auth user before
-- a per-customer policy can be written.
--
-- A BIGGER QUESTION THIS SCRIPT EXPOSES
-- RLS only works if the app holds a Supabase Auth session. The app now signs
-- in through Supabase Auth with a mobile number and password, so it does hold
-- one — but that session's `sub` must be matched to a `profiles` row by the
-- backfill below. Until it is, every policy resolves to "no rows".
--
-- So one of these must be true before 03 is useful:
--
--   (a) Your backend creates/links a Supabase Auth user per customer and hands
--       the app a Supabase session, which the app uses for reads.
--   (b) The app never reads PostgREST directly and everything goes through your
--       REST API, which already knows the customer from its own session token.
--
-- (b) is simpler and needs none of this. (a) buys you fewer round trips.
-- Decide this before running 03 — the columns below are needed either way if
-- you go with (a).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Add an auth linkage column to every customer-owned table.
--    Nullable on purpose: adding it cannot lock anyone out, and you backfill
--    before it is ever read.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists auth_uid uuid references auth.users(id);

alter table public.devices
  add column if not exists customer_key text;

alter table public.payments
  add column if not exists customer_key text;

alter table public.notifications
  add column if not exists customer_key text;

alter table public.support_tickets
  add column if not exists customer_key text;


-- ---------------------------------------------------------------------------
-- 2. Help the backfill. The keys look like CUST-23839, so a text prefix match
--    links devices and payments to their customer.
-- ---------------------------------------------------------------------------
create index if not exists profiles_auth_uid_idx
  on public.profiles (auth_uid);
create index if not exists devices_customer_key_idx
  on public.devices (customer_key);
create index if not exists payments_customer_key_idx
  on public.payments (customer_key);
create index if not exists notifications_customer_key_idx
  on public.notifications (customer_key);
create index if not exists support_tickets_customer_key_idx
  on public.support_tickets (customer_key);


-- ---------------------------------------------------------------------------
-- 3. Backfill profiles.auth_uid from your auth users.
--
--    Sign-in is by MOBILE NUMBER, so the join is on `auth.users.phone`.
--    Supabase stores it in E.164 (`+8801712345678`) while profiles hold it as
--    `+880 1700000000`, so normalise the formatting on both sides before
--    comparing. A mismatch here is why every request 401s.
-- ---------------------------------------------------------------------------
update public.profiles p
   set auth_uid = u.id
  from auth.users u
 where regexp_replace(u.phone, '[^0-9]', '', 'g') = regexp_replace(p.phone_number, '[^0-9]', '', 'g')
   and p.auth_uid is null;

select count(*) as profiles_linked
  from public.profiles
 where auth_uid is not null;


-- ---------------------------------------------------------------------------
-- 4. Backfill the customer_key on the other tables.
--    ADJUST the join: this assumes a row's key contains its owner's CUST- id.
-- ---------------------------------------------------------------------------
-- update public.devices d
--    set customer_key = p.id
--   from public.profiles p
--  where d.id like p.id || '%'
--    and d.customer_key is null;

-- update public.payments pay
--    set customer_key = p.id
--   from public.profiles p
--  where pay.transaction_id like p.id || '%'
--    and pay.customer_key is null;


-- ---------------------------------------------------------------------------
-- 5. Report what is still unlinked. Every row listed here is invisible to the
--    customer it belongs to once 03 lands, and is also the row most likely to
--    be a data-entry mistake. Investigate; do not ignore.
-- ---------------------------------------------------------------------------
select 'devices'         as table_name, count(*) from public.devices         where customer_key is null
union all select 'payments',        count(*) from public.payments        where customer_key is null
union all select 'notifications',   count(*) from public.notifications   where customer_key is null
union all select 'support_tickets', count(*) from public.support_tickets where customer_key is null
union all select 'profiles',        count(*) from public.profiles        where auth_uid is null;


-- ###########################################################################
-- END 02-add-auth-link.sql
-- ###########################################################################


-- ###########################################################################
-- BEGIN 03-owner-policies.sql
-- ###########################################################################


-- ============================================================================
-- 03-owner-policies.sql   — RUN LAST
--
-- Requires 01-stop-the-bleed.sql and 02-add-auth-link.sql to have been run,
-- and requires that you have answered the question raised in 02: does the app
-- hold a Supabase Auth session at all?
--
-- If it does not, auth.uid() is always NULL, every policy below denies
-- everything, and the app will silently show empty screens. Verify with a real
-- signed-in customer before shipping, not just with the anon key.
--
-- Do not run this until 02's final report shows no unlinked rows.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- profiles: the auth uid is on the row, so this is exact.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth_uid = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth_uid = auth.uid())
  with check (auth_uid = auth.uid());

-- No insert policy: a customer record is created by your backend, never a phone.


-- ---------------------------------------------------------------------------
-- devices: readable by its owner, and deliberately NOT writable.
--
-- There is no insert/update/delete policy on purpose. `state`,
-- `enrollment_status`, `management_status`, `is_managed` and `contract_id` are
-- server-authoritative. If a client may write them, the app can grant itself
-- UNLOCKED status or move a device onto another customer's contract — which is
-- the entire attack this design exists to stop.
-- ---------------------------------------------------------------------------
drop policy if exists "devices_select_own" on public.devices;
create policy "devices_select_own" on public.devices
  for select to authenticated
  using (customer_key = (select p.id from public.profiles p where p.auth_uid = auth.uid()));


-- ---------------------------------------------------------------------------
-- payments: read-only. Creating an order, verifying the gateway callback and
-- marking SUCCESS are backend-only.
-- ---------------------------------------------------------------------------
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select to authenticated
  using (customer_key = (select p.id from public.profiles p where p.auth_uid = auth.uid()));


-- ---------------------------------------------------------------------------
-- notifications: owner may read and mark their own as read. Insert is the
-- backend's job.
-- ---------------------------------------------------------------------------
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (customer_key = (select p.id from public.profiles p where p.auth_uid = auth.uid()));

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (customer_key = (select p.id from public.profiles p where p.auth_uid = auth.uid()))
  with check (customer_key = (select p.id from public.profiles p where p.auth_uid = auth.uid()));


-- ---------------------------------------------------------------------------
-- support_tickets: owner may read and create. No update policy, so a customer
-- cannot rewrite `status` or forge `admin_response`.
-- ---------------------------------------------------------------------------
drop policy if exists "support_tickets_select_own" on public.support_tickets;
create policy "support_tickets_select_own" on public.support_tickets
  for select to authenticated
  using (customer_key = (select p.id from public.profiles p where p.auth_uid = auth.uid()));

drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own" on public.support_tickets
  for insert to authenticated
  with check (customer_key = (select p.id from public.profiles p where p.auth_uid = auth.uid()));


-- ============================================================================
-- VERIFY, in this order. Do not skip to the app.
--
-- 1. As an anonymous caller (no session) — every count must be 0.
--      select count(*) from public.devices;
--      select count(*) from public.payments;
--      select count(*) from public.profiles;
--      select count(*) from public.support_tickets;
--
-- 2. As a REAL signed-in customer — they must see their own rows and nobody
--    else's. This is the check that matters; the anon test only proves the door
--    is shut to strangers, not that the owner can get in.
--
-- 3. Then: npm run verify:rls
--
-- Only once all three pass, set EXPO_PUBLIC_SUPABASE_READS_ENABLED=true.
-- ============================================================================


-- ###########################################################################
-- END 03-owner-policies.sql
-- ###########################################################################


-- ###########################################################################
-- BEGIN 04-link-demo-customer.sql
-- ###########################################################################


-- ============================================================================
-- 04-link-demo-customer.sql
--
-- Run in the Supabase SQL Editor, AFTER 01-stop-the-bleed.sql. It repeats the
-- one piece of 02-add-auth-link.sql that this project is still missing, then
-- creates the demo customer row and links it to the Supabase auth user.
--
-- WHY THIS IS NEEDED, MEASURED NOT ASSUMED
--
-- Sign-in works now that "Confirm email" is off:
--
--   POST /auth/v1/token?grant_type=password   -> 200, session issued
--
-- and the very next request the app makes fails:
--
--   GET https://srabontelecom.paymently.io/customer   -> 401 Unauthorized
--
-- The reason is not the token. `VerifySupabaseJwt` verifies the signature, then
-- resolves the customer with
--
--   Customer::query()->where('auth_uid', $userId)->first()
--
-- (backend/app/Http/Middleware/VerifySupabaseJwt.php:60). Against the live
-- database that query cannot succeed, for two reasons:
--
--   1. `profiles.auth_uid` does not exist — 02-add-auth-link.sql has not been
--      run on this project.
--   2. `profiles` is empty. There is no customer row at all, so even the column
--      would not help: no auth user could ever resolve to a customer.
--
-- The second reason is the one to be careful about. A customer row is not
-- something a phone may create (see 03-owner-policies.sql: "a customer record
-- is created by your backend, never a phone"). The insert below exists because
-- this project is a demo with one seeded customer, and the values match the
-- seed in `mock-server/server.mjs` and `docs/api-contract.md` so the app renders
-- the same thing against either server. In production the store creates this
-- row when the device is sold.
--
-- WHAT IT DOES NOT DO
--
-- It does not enable RLS or add the owner policies (that is 01 and 03), and it
-- does not create a profile for every new auth user. A trigger that minted a
-- customer row per signup would hand every stranger who can type an address a
-- signed-in session on a device they do not own.
--
-- SAFE TO RUN TWICE. Every statement is `if not exists`, `on conflict`, or
-- conditional, and the only row it writes is the demo customer.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The auth link. Nullable on purpose: adding a column cannot lock anyone
--    out, and the backfill below runs before anything reads it.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists auth_uid uuid references auth.users(id);

-- One auth user, one customer. Without this, a duplicated link would let the
-- wrong customer match a session.
create unique index if not exists profiles_auth_uid_unique
  on public.profiles (auth_uid)
  where auth_uid is not null;

create index if not exists profiles_auth_uid_idx
  on public.profiles (auth_uid);


-- ---------------------------------------------------------------------------
-- 2. The demo customer, if the project has none.
--
--    `CUST-23839` is the id the other seeded tables already refer to, so the
--    payments backfill in step 4 lands on the right row.
-- ---------------------------------------------------------------------------
insert into public.profiles
  (id, full_name, phone_number, email, is_enrolled, language, created_at, updated_at)
values
  ('CUST-23839', 'Asif Hossain', '+8801810902817', 'asifghe78@gmail.com', true, 'en', now(), now())
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 3. Link every auth user to its customer by email.
--
--    Done by email, not by pasting a uuid: the auth user is created by whoever
--    signs up, so the link has to be derived, not hardcoded. Safe to re-run —
--    `where p.auth_uid is null` means a row is never re-pointed at a different
--    account, which is what stops this from being an account-takeover vector.
-- ---------------------------------------------------------------------------
update public.profiles p
   set auth_uid = u.id
  from auth.users u
 where lower(p.email) = lower(u.email)
   and p.auth_uid is null
   and u.email is not null;


-- ---------------------------------------------------------------------------
-- 4. payments.customer_key
--
--    The deployed controller reads
--
--      CustomerPayment::query()->where('customer_key', $customer->getKey())
--
--    (backend/app/Http/Controllers/Api/CustomerPaymentController.php:24) and
--    the live table has no such column — `payments` is keyed by
--    `transaction_id` and carries no owner at all. So `GET /customer/payments`
--    cannot return this customer's history until the column exists, and RLS
--    cannot scope a table with no owner either (03-owner-policies.sql expects
--    one).
--
--    Named `customer_key`, not `customer_id`, because that is the column the
--    deployed code queries. It holds the same value as `profiles.id` — a
--    readable string, not a uuid.
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists customer_key text;

update public.payments p
   set customer_key = c.id
  from public.profiles c
 where p.customer_key is null
   and c.email = 'asifghe78@gmail.com';


-- ---------------------------------------------------------------------------
-- 5. Report. This is the whole check: `profiles_linked` must be at least 1, or
--    the session still resolves to no customer and every call is a 401.
-- ---------------------------------------------------------------------------
select p.id                as profile_id,
       p.email             as profile_email,
       p.auth_uid          as linked_auth_uid,
       u.email             as auth_user_email,
       (select count(*) from public.payments pay where pay.customer_key = p.id) as payments
  from public.profiles p
  left join auth.users u on u.id = p.auth_uid
 order by p.id;

-- Expected: CUST-23839 | asifghe78@gmail.com | <a uuid> | asifghe78@gmail.com | 3
--
-- Then, with a signed-in session, this must return 200:
--
--   curl -H "Authorization: Bearer <access token>" \
--        https://srabontelecom.paymently.io/customer


-- ###########################################################################
-- END 04-link-demo-customer.sql
-- ###########################################################################


-- ###########################################################################
-- BEGIN 05-device-commands.sql
-- ###########################################################################


-- ============================================================================
-- 05-device-commands.sql
--
-- Two tables for the admin panel's device screen, and neither of them can be
-- written by a phone.
--
-- WHAT THIS IS FOR
--
-- The panel can open a device and ask the phone to do something: lock it, unlock
-- it, read where it is, remind the customer what they owe, hand it back, or
-- uninstall the management agent. This file is where those requests and the
-- phone's answers live.
--
-- `device_commands` is the important one, and its shape is the whole point:
--
--   outcome      REQUESTED  ->  APPLIED | FAILED | REFUSED
--   requested_at             when a member of staff pressed the button
--   outcome_at               when the PHONE said what happened
--   reported_by              which device agent reported it
--   lease_expires_at         when a LOCK stops being a lock, on its own
--
-- A row is born `REQUESTED` and only the device moves it. That is not a schema
-- convention, it is the reason the panel can be trusted: an admin pressing "lock"
-- has *asked* a phone to lock, and a phone that is switched off, out of coverage
-- or on a hotel wi-fi has not locked. If the panel could write `APPLIED`, then
-- "locked" in that screen would be a thing somebody in an office decided rather
-- than a thing that happened, and a customer shown the same screen later would be
-- shown a lie.
--
-- So there is no insert/update policy below for anybody, and the admin API has no
-- route that sets an outcome. `DeviceCommandService::reportOutcome()` is called by
-- the device's own check-in and by nothing else.
--
-- `lease_expires_at` is the second half of the same promise, and it is the more
-- important of the two. A LOCK is a **lease**, not a switch: it says "locked until
-- this moment", and at that moment the phone unlocks itself whether or not this
-- database is reachable, whether or not the company is still trading, and without
-- anybody asking. A server outage therefore cannot leave a customer's phone locked,
-- because an outage *is* the expiry.
--
-- The constraint at the bottom enforces it: a LOCK with no expiry is not a row this
-- table will hold. A schema that permitted an open-ended lock would permit the exact
-- failure this column exists to make impossible, and a constraint is the only place
-- that can say so to somebody who never reads this comment.
--
-- `device_locations` is the last position a phone reported. A read of it is
-- written to `admin_audit` by `AdminReadController::deviceLocation()`: reading a
-- customer's own data costs that customer nothing, but a member of staff looking
-- up where somebody's phone is is worth leaving a name against.
--
-- RUN ORDER
--
-- After 01-stop-the-bleed.sql. Independent of 02 and 03 — nothing here reads
-- `profiles.auth_uid`.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. device_commands
-- ---------------------------------------------------------------------------
create table if not exists public.device_commands (
  id            text primary key,
  -- The phone this is about. No cascade: a command outlives the row it is about,
  -- because "you wiped this phone on the 4th and I am still asking it to unlock"
  -- is a question somebody has to be able to answer.
  device_id     text        not null,
  action        text        not null,
  outcome       text        not null default 'REQUESTED',
  reason        text,
  -- When a LOCK stops being a lock. NULL for every other action, and required for
  -- LOCK by the constraint at the bottom of this table.
  lease_expires_at timestamptz,
  outcome_note  text,
  reported_by   text,
  requested_at  timestamptz not null default now(),
  outcome_at    timestamptz,

  constraint device_commands_action_check check (action in
    ('LOCK', 'UNLOCK', 'RELEASE', 'UNINSTALL')),

  -- The one rule the table exists to enforce. If this is wrong, nothing else
  -- matters: a request is a request.
  constraint device_commands_outcome_check check (outcome in
    ('REQUESTED', 'APPLIED', 'FAILED', 'REFUSED')),

  -- An outcome without a time and a speaker is not an outcome.
  constraint device_commands_reported_check check (
    outcome = 'REQUESTED'
    or (outcome_at is not null and reported_by is not null)
  ),

  -- A lock has to say when it ends.
  --
  -- This is the constraint that matters most in the file. It makes an open-ended
  -- lock unrepresentable, rather than merely discouraged: there is no value this
  -- table will accept for a LOCK that is not a lease, so no bug anywhere above it
  -- can produce one. The phone enforces the same ceiling on arrival
  -- (`MAX_LOCK_LEASE_MS`), so the guarantee does not rest on this file alone.
  constraint device_commands_lease_check check (
    action <> 'LOCK' or lease_expires_at is not null
  )
);

create index if not exists device_commands_device_idx
  on public.device_commands (device_id, id desc);


-- ---------------------------------------------------------------------------
-- 2. device_locations
--
-- The most recent row per device is the answer; older ones are kept because
-- "where was it on the day the payment failed" is a question that gets asked
-- after the fact, and it cannot be answered by a table that only remembers now.
-- ---------------------------------------------------------------------------
create table if not exists public.device_locations (
  id               bigserial primary key,
  device_id        text        not null,
  latitude         double precision not null,
  longitude        double precision not null,
  accuracy_metres  double precision,
  reported_at      timestamptz not null default now(),
  reported_by      text        not null default 'device'
);

create index if not exists device_locations_device_idx
  on public.device_locations (device_id, reported_at desc);


-- ---------------------------------------------------------------------------
-- 3. Row level security: on, and closed to everybody
--
-- There is deliberately **no** policy on either table. `enable row level
-- security` with zero policies denies every request made with the anon or
-- publishable key, which is the point: a phone cannot read where it is, cannot
-- read the commands aimed at it through PostgREST, and above all cannot write
-- `APPLIED` onto its own row and thereby confirm a lock that never happened.
--
-- The admin API and the device check-in reach these tables with the service-role
-- key, on the server, where `RequireAdmin` and the device's own authentication
-- have already decided who is allowed to.
-- ---------------------------------------------------------------------------
alter table public.device_commands enable row level security;
alter table public.device_commands force row level security;
alter table public.device_locations enable row level security;
alter table public.device_locations force row level security;

-- If this file is re-run after a policy was added by hand, take it away again.
drop policy if exists "device_commands_allow" on public.device_commands;
drop policy if exists "device_locations_allow" on public.device_locations;


-- ---------------------------------------------------------------------------
-- 4. Report
-- ---------------------------------------------------------------------------
select 'device_commands' as table_name,
       (select count(*) from public.device_commands) as rows
union all
select 'device_locations',
       (select count(*) from public.device_locations);

-- Then prove the closure, with the publishable key. Both must be empty, not 401:
--
--   curl "$SUPABASE/rest/v1/device_commands?select=id"  -H "apikey: $ANON"
--   curl "$SUPABASE/rest/v1/device_locations?select=id" -H "apikey: $ANON"
--   curl -X POST "$SUPABASE/rest/v1/device_commands" \
--        -H "apikey: $ANON" -H 'content-type: application/json' \
--        -d '{"id":"cmd-forged","device_id":"DEV-SAM-A15-098","action":"LOCK"}'
--
-- Expected: `[]`, `[]`, and an empty result. The insert must fail: if it
-- succeeds, a phone has just been handed the ability to confirm its own lock.


-- ###########################################################################
-- END 05-device-commands.sql
-- ###########################################################################


-- ###########################################################################
-- BEGIN 06-device-report.sql
-- ###########################################################################


-- ============================================================================
-- 06-device-report.sql
--
-- What the phone said about itself, and when it said it.
--
-- WHY THIS IS NEEDED
--
-- The customer app has always been able to read Android's own answers about the
-- handset — model, manufacturer, Android version, API level, and the install
-- identifier — through the read-only Kotlin module. What it could not do was
-- *tell the server*. `POST /devices/me/sync` took no body at all, and
-- `POST /devices/me/enroll` carried only the signed agreement, so the server's
-- idea of a customer's phone was a row somebody had typed rather than a handset
-- that had spoken.
--
-- That matters more than tidiness. An operator deciding whether to lock somebody's
-- phone has to be looking at *that* phone. A row that says "Galaxy A15" because a
-- seed file says so is not evidence of anything, and if it disagrees with the
-- handset in the customer's hand then the screen is showing a fiction.
--
-- So the app now sends a report — exactly the fields the consent screen already
-- listed, and no more — and these columns are where it lands. `source` records
-- which rows are still demo data, because a panel that shows a fabricated device
-- beside a real one has to say so on the row.
--
-- THE ONE ASYMMETRY
--
-- A phone's report is believed *downwards*, never upwards.
--
--   - If a handset says Android has no device owner, `is_managed` comes down at
--     once. Showing an operator a "Lock" button for a phone that nobody can lock
--     is the worst answer this panel could give.
--   - A customer app cannot report its way *into* being managed. `is_managed` is
--     the store's provisioning — the enterprise DPC that owns the phone, which is
--     a different application entirely. A phone claiming `MANAGED_BY_ENTERPRISE`
--     changes what the panel displays about what the phone said; it does not
--     change what the panel will allow.
--
-- Run after 01-stop-the-bleed.sql. Independent of 02, 03, 04 and 05.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The columns. All nullable, all additive: a row that predates this file is
--    simply a row no phone has spoken for yet, and the panel says so.
-- ---------------------------------------------------------------------------
alter table public.devices
  add column if not exists android_id    text,
  add column if not exists android_sdk   integer,
  add column if not exists source        text    not null default 'DEMO',
  add column if not exists reported_at   timestamptz,
  add column if not exists reported_by   text;

-- PHONE means a handset described this row. DEMO means nothing has, and the
-- panel marks it. Anything else is a bug, and is treated as DEMO on read rather
-- than trusted.
alter table public.devices
  drop constraint if exists devices_source_check;
alter table public.devices
  add constraint devices_source_check check (source in ('PHONE', 'DEMO'));

-- One handset, one row. A second sync from a different phone must not silently
-- take over a customer's device: that would move a real phone's identity onto
-- whatever the newest request happened to be.
create unique index if not exists devices_android_id_idx
  on public.devices (android_id)
  where android_id is not null;


-- ---------------------------------------------------------------------------
-- 2. RLS: unchanged, and still closed
--
-- `devices` already has RLS on with owner policies from 03-owner-policies.sql. No
-- policy is added here on purpose. The report is written by the **backend**, with
-- the service-role key, revalidating the contract — never by the phone through
-- PostgREST, and never by the anon key.
--
-- So the publishable key still cannot insert or update a device row, which is
-- what stops a phone from renaming itself to "iPhone 15 Pro" or, worse, setting
-- `is_managed` to true and acquiring a lock button.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 3. Report
--
-- Expected before the app has synced: every row is DEMO with a null reported_at.
-- That is the honest starting position, and the panel shows it as such.
-- ---------------------------------------------------------------------------
select id,
       device_name,
       source,
       android_id,
       android_version,
       android_sdk,
       is_managed,
       reported_at,
       reported_by
  from public.devices
 order by id;

-- Then, with the app installed on a handset and the agreement accepted, this must
-- return 1 row with source = 'PHONE' and a recent reported_at:
--
--   select source, reported_at, reported_by, android_version
--     from public.devices where android_id is not null;


-- ###########################################################################
-- END 06-device-report.sql
-- ###########################################################################


-- ============================================================================
-- VERIFY. Run as the last statement of the paste.
--
-- `linked_auth_uid` MUST be a uuid. If it is NULL the session still resolves to
-- no customer and every /customer call is still a 401 — the scripts ran, but
-- no auth user's email matched a profile's email.
-- ============================================================================
select p.id                                          as profile_id,
       p.email                                       as profile_email,
       p.auth_uid                                    as linked_auth_uid,
       u.email                                       as auth_user_email,
       (select count(*) from public.payments pay
         where pay.customer_key = p.id)              as payments,
       (select count(*) from public.device_commands) as device_commands_table_rows
  from public.profiles p
  left join auth.users u on u.id = p.auth_uid
 order by p.id;

-- Expected: CUST-23839 | asifghe78@gmail.com | <a uuid> | asifghe78@gmail.com | 3
--
-- Then this must be 200 (was 401):
--
--   curl -H "Authorization: Bearer <access token>" \
--        https://srabontelecom.paymently.io/customer
-- ============================================================================
