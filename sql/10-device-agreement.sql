-- ============================================================================
-- 10-device-agreement.sql
--
-- Run AFTER 01, 03 and 07. This is the table the consent screen writes to, and
-- the app cannot complete enrollment without it.
--
-- WHY IT IS MISSING, MEASURED
--
-- The app's enrollment screen ends with a button that posts to
--
--   POST /customer/agreements/device-management/accept
--
-- and the deployed service answered that with a 404, and the new Express service
-- with a 405 because it is read-only by design. Either way the customer pressed
-- "Accept and continue" and got:
--
--   Step 11 of 11 — "Something went wrong. Please try again."
--
-- which is the worst possible outcome: they read eleven screens of terms and the
-- agreement was not recorded, so nothing was enrolled and nothing was logged. The
-- `customer_agreements` table this needs did not exist in this project — no
-- migration created it, and the model pointed at a table that was never there.
--
-- WHAT THIS TABLE IS
--
-- A record that a specific customer, holding a specific session, accepted a
-- specific version of the agreement at a specific moment. It exists so that the
-- consent is evidence rather than a claim, and so the version that was agreed to
-- is recoverable when the terms are next changed.
--
-- WHAT IT DELIBERATELY IS NOT
--
-- It is not an enrolment. Writing this row grants nothing, locks nothing and
-- enrols nothing. Android grants device-owner status to an app an enterprise DPC
-- provisioned, on its own authorisation screen, and no database insert can
-- substitute for that. A row here plus a phone that is not under enterprise
-- management is a normal, correct state — the shop sold the device and the
-- customer has not finished setting it up.
--
-- SAFE TO RUN TWICE. `create table if not exists`, and the policies are dropped
-- before they are created.
-- ============================================================================


create table if not exists public.customer_agreements (
  -- The same readable id shape as the rest of the project. A uuid would be
  -- equally unique and rather less searchable in a support conversation.
  id                text primary key,

  -- The customer who accepted. `on delete cascade` is deliberate and worth
  -- stating: an agreement is a fact about a person. If that customer is removed
  -- under their data rights, keeping a record of what they consented to is not
  -- something this system should do on its own.
  customer_key      text not null references public.profiles (id) on delete cascade,

  -- Which terms. Read from `DEVICE_MANAGEMENT_AGREEMENT_VERSION` in the app, not
  -- guessed here: the app and the server must agree, and a server that guessed
  -- would be recording a version the customer never saw.
  agreement_version text not null,

  -- Who accepted. Free text because a signature is a name, and refusing to record
  -- the name would only mean the agreement was recorded against nobody.
  accepted_by_name  text not null,

  accepted_at       timestamptz not null default now(),

  created_at        timestamptz not null default now(),

  -- A customer accepts a version once. Re-accepting the same version is refused
  -- rather than overwriting, so `accepted_at` is the first moment they agreed and
  -- not the last moment somebody pressed the button.
  unique (customer_key, agreement_version)
);


-- One agreement per customer is the only thing the app ever reads, so this is the
-- index that query needs.
create index if not exists customer_agreements_customer_idx
  on public.customer_agreements (customer_key);


-- ---------------------------------------------------------------------------
-- RLS
--
-- The customer reads their own agreement. They do not write it: `accept` is a
-- server route that revalidates the session, and letting a client write its own
-- consent record would make the evidence worthless.
-- ---------------------------------------------------------------------------
alter table public.customer_agreements enable row level security;
alter table public.customer_agreements force row level security;

revoke all on public.customer_agreements from anon;
revoke all on public.customer_agreements from authenticated;

grant select on public.customer_agreements to authenticated;

drop policy if exists "customer_agreements_select_own" on public.customer_agreements;
create policy "customer_agreements_select_own" on public.customer_agreements
  for select to authenticated
  using (customer_key = (select p.id from public.profiles p where p.auth_uid = auth.uid()));


-- ---------------------------------------------------------------------------
-- Confirm
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.customer_agreements where customer_key is null) as agreements_without_owner,
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'customer_agreements') as in_realtime_publication;

-- Expected: 0 and 0.
--
-- The second number is 0 on purpose. A consent record is not something the app
-- needs pushed to it, and the enrollment screen reads it once, on demand.
-- ---------------------------------------------------------------------------
