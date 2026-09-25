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
-- RLS only works if the app holds a Supabase Auth session. Today the app signs
-- in against your REST API (phone + password / OTP) and holds its own tokens.
-- If customers never authenticate through Supabase Auth, auth.uid() is always
-- NULL and EVERY RLS policy denies everything.
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
--    ADJUST to however you actually map a customer to an auth user. If
--    profiles.phone_number is what you signed users up with, use that.
--    If there is no existing mapping yet, this returns 0 and that is your
--    answer: you have not linked customers to Supabase Auth yet.
-- ---------------------------------------------------------------------------
-- update public.profiles p
--    set auth_uid = u.id
--   from auth.users u
--  where u.phone = p.phone_number
--    and p.auth_uid is null;

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
