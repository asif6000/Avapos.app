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
