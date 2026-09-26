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
