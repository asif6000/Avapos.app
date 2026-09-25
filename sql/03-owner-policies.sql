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
