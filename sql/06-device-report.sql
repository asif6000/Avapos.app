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
