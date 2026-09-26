-- ============================================================================
-- 09-realtime.sql
--
-- Run AFTER 01, 03, 07 and 08. This file is what makes live updates possible at
-- all, and it is deliberately last: realtime without RLS is a data leak, so the
-- policies have to already exist.
--
-- WHAT WAS MISSING, MEASURED
--
--   select pubname, schemaname, tablename from pg_publication_tables;
--   -> []          (no rows)
--
-- `supabase_realtime` published nothing at all. No amount of client code can
-- subscribe to a table that is not in the publication, so "realtime" was not a
-- missing feature in the app, it was a missing line of database configuration.
--
-- WHY THIS IS SAFE NOW, AND WAS NOT BEFORE
--
-- Supabase Realtime authorises every `postgres_changes` event against the
-- subscriber's RLS policies before sending it. A table with RLS disabled
-- therefore broadcasts every customer's rows to every subscriber — and this
-- project's RLS was disabled until 01 and 03 were applied. Measured on
-- 2026-09-26, before those ran, the publishable key read every customer table
-- and got real rows back with a 200.
--
-- So the order is not a convention. 01 and 03 enable and define the policies;
-- this file publishes. Running it first would put a live feed of every
-- customer's money, device and ticket behind a public key.
--
-- 07 is also required, because every policy here filters on `customer_key` and
-- 07 is what put that column on the tables.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. What the customer's own app needs to react to.
--
--   installment_contracts  a new sale, or a changed balance
--   installments           an installment becoming PAID — the screen that matters
--   devices                a restriction or a release
--   payments               a payment settling
--   notifications          the notification centre, without polling
--   support_tickets        a reply from the shop
--   profiles               a display name change
--
--   `profiles` is included even though the customer rarely edits it, because
--   the store does: a name corrected at the counter should reach the app without
--   the customer pulling to refresh.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'installment_contracts',
    'installments',
    'devices',
    'payments',
    'notifications',
    'support_tickets',
    'profiles'
  ] loop
    -- `if not exists` is not available on `add table`, so the catalogue is
    -- checked instead. Re-running this file is therefore safe.
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'published %', t;
    else
      raise notice 'already published: %', t;
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- 2. Confirm. This is the whole check — all seven must be listed.
--
--    select tablename from pg_publication_tables
--     where pubname = 'supabase_realtime' order by tablename;
-- ---------------------------------------------------------------------------
select schemaname, tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
 order by tablename;


-- ---------------------------------------------------------------------------
-- 3. What the client must not do.
--
-- A subscription is a *trigger* to refetch, never a source of truth:
--
--   * Do not write from a realtime handler. The app holds no credential that
--     could, and if it ever did, this table would be the temptation.
--   * Do not treat a `DELETE` payload as proof. The payload carries the row as
--     it was, so it is a hint to refetch, not an answer.
--   * Do not subscribe anonymously. An anon token reads nothing under these
--     policies, so it would receive nothing at all — a silent failure that looks
--     exactly like "realtime is broken". A missing session must be handled as a
--     session, and the 15-second refetch stays as the floor underneath.
--
-- The existing poller (`useAutoDeviceSync`) is not removed by this. Realtime
-- makes it faster; it does not make it unnecessary, because a phone that was
-- asleep does not replay the events it missed.
-- ---------------------------------------------------------------------------
