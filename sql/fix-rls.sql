-- ============================================================================
-- fix-rls.sql
--
-- Run this in the Supabase SQL editor for vslediphrlrlhrormmxh.
-- Then re-run: npm run verify:rls
--
-- WHY
-- The publishable ("anon") key ships inside the app bundle. As of the last
-- check, these tables had row level security DISABLED, so that key — which
-- anyone can lift out of the APK — could read every row, and could also
-- UPDATE rows. A writable `devices.state` means an attacker could mark their
-- own device UNLOCKED without paying. That is the exact attack the design of
-- this app is supposed to make impossible.
--
-- Fix: enable RLS on every table, then grant access ONLY to rows belonging to
-- the signed-in customer. anon (no session) matches nothing and therefore sees
-- nothing.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. profiles
--    `id` is the Supabase auth user id, so ownership is id = auth.uid().
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No anon insert: a customer profile must be created server-side by your API,
-- never by a phone.


-- ---------------------------------------------------------------------------
-- 2. devices
--    `id` is the auth user id (values look like DEV-SAM-A15-098 — confirm this
--    is the auth uid and not a device serial; the policy below assumes it is).
-- ---------------------------------------------------------------------------
alter table public.devices enable row level security;
alter table public.devices force row level security;

drop policy if exists "devices_select_own" on public.devices;
create policy "devices_select_own" on public.devices
  for select to authenticated
  using (id = auth.uid());

-- Deliberately NO insert / update / delete policy.
--
-- `state`, `enrollment_status`, `management_status`, `is_managed` and
-- `contract_id` are server-authoritative. If the app is allowed to write them,
-- the whole security model collapses: the app would be able to grant itself
-- UNLOCKED status, or move a device onto someone else's contract. Only your
-- backend, using the service_role key, may change these columns.
--
-- (If you do want a client-writable field later, add a narrow column-level
-- grant for that column only — never the whole table.)


-- ---------------------------------------------------------------------------
-- 3. payments
--    !! SCHEMA PROBLEM: this table has no owner column.
--
--    Columns are: transaction_id, installment_number, amount, date,
--                 payment_method, status, receipt_url, created_at
--
--    There is nothing to scope a policy to, so RLS cannot be written correctly
--    until an owner column exists. Add one, backfill it, then apply the policy.
-- ---------------------------------------------------------------------------

-- Step 1: add the owner column.
alter table public.payments
  add column if not exists customer_id uuid references auth.users(id);

-- Step 2: backfill. Match on whatever links a payment to a customer.
--         ADJUST the join to your real schema before running.
-- update public.payments p
--    set customer_id = d.id
--   from public.devices d
--  where p.transaction_id like d.id || '%';   -- TODO: replace with the real link

-- Step 3: any row you could not backfill must be investigated, not left
--         orphaned — a NULL customer_id row is invisible to every policy.
select count(*) as payments_without_owner
  from public.payments
 where customer_id is null;

-- Step 4: only once customer_id is populated and validated:
alter table public.payments enable row level security;
alter table public.payments force row level security;

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select to authenticated
  using (customer_id = auth.uid());

-- Payments are read-only to the client. Creating a payment, verifying a
-- gateway callback and marking a payment SUCCESS are backend-only.


-- ---------------------------------------------------------------------------
-- 4. notifications
--    Already returning 0 rows to anon, but the table is empty so that is not
--    proof. Apply the same treatment now, before it has real rows.
--    ADD customer_id FIRST — the table has no owner column either.
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists customer_id uuid references auth.users(id);

-- update public.notifications set customer_id = ... ;  -- TODO: backfill

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (customer_id = auth.uid());

-- Marking a notification read is a client action, scoped to the owner:
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 5. support_tickets
--    !! Same problem: no owner column.
--    Columns: id, subject, message, category, status, created_at, admin_response
--
--    `admin_response` must never be writable by a customer — a client-writable
--    response field would let a customer forge a reply from support.
-- ---------------------------------------------------------------------------
alter table public.support_tickets
  add column if not exists customer_id uuid references auth.users(id);

-- update public.support_tickets set customer_id = ... ;  -- TODO: backfill

alter table public.support_tickets enable row level security;
alter table public.support_tickets force row level security;

drop policy if exists "support_tickets_select_own" on public.support_tickets;
create policy "support_tickets_select_own" on public.support_tickets
  for select to authenticated
  using (customer_id = auth.uid());

drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own" on public.support_tickets
  for insert to authenticated
  with check (customer_id = auth.uid());

-- No UPDATE policy: the customer may open a ticket but may not edit status or
-- write admin_response. Use a column grant if the UI must edit the message.


-- ---------------------------------------------------------------------------
-- 6. Belt and braces: revoke the broad table grants from anon/authenticated and
--    let the policies above do the authorising. Supabase grants these by
--    default, which is why the key could read and write everything above.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','devices','payments','notifications','support_tickets']
  loop
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

grant insert on public.support_tickets to authenticated;
grant update on public.notifications to authenticated;
grant update on public.profiles to authenticated;

-- The backend uses the service_role key, which bypasses RLS entirely and is
-- unaffected by the revokes above. Do not grant anything to anon from here on.


-- ---------------------------------------------------------------------------
-- 7. Sanity check: run these two. Both must return 0.
-- ---------------------------------------------------------------------------
select count(*) as should_be_zero from public.devices;
select count(*) as should_be_zero from public.payments;
