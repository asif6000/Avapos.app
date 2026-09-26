-- ============================================================================
-- 07-owner-columns.sql
--
-- Run in the Supabase SQL Editor, AFTER 04-link-demo-customer.sql and BEFORE
-- 01-stop-the-bleed.sql.
--
-- HOW THIS RELATES TO 02-add-auth-link.sql
--
-- 02 is the canonical file for this job, and it is not superseded by this one.
-- Read 02 first. What changed is that 02 has now also been given the
-- `installment_contracts` column, so after that edit the two files overlap
-- completely on schema and differ only in the backfill:
--
--   02  adds the owner columns, creates the indexes, backfills `profiles.auth_uid`
--       from `auth.users.phone`, and leaves its own step 4 *commented out* with
--       the note "ADJUST the join".
--   07  the backfill that 02 declines to guess, for this schema.
--
-- Both are safe to run, in any order, and both are safe to run twice.
--
-- WHY THE BACKFILL IS A SEPARATE FILE
--
-- 02's commented-out step assumes a row's own key contains its owner's id
-- (`d.id like p.id || '%'`). That is false here. Measured:
--
--   devices.id                 DEV-SAM-A15-098      — contains no CUST- id
--   installment_contracts.id   CONTRACT-BD-2026-902 — contains no CUST- id
--
-- So uncommenting it would silently match nothing and leave every row unowned,
-- and an unowned row matches no RLS policy — which presents to the customer as
-- an empty account rather than as an error. The claim has to be stated, and the
-- one real relationship in this part of the schema is `devices.contract_id`.
--
-- WHY 03-owner-policies.sql COULD NOT RUN BEFORE THIS
--
-- 03 filters every customer table on `customer_key`. Measured on the live
-- project before this file existed:
--
--   profiles.auth_uid           exists   (added by 04)
--   payments.customer_key       exists   (added by 04)
--   devices.customer_key        DOES NOT EXIST
--   notifications.customer_key  DOES NOT EXIST
--   support_tickets.customer_key DOES NOT EXIST
--
-- So 03 aborts on the first missing column with
--
--   ERROR: column "customer_key" does not exist
--
-- and an aborted script leaves RLS *off*. The publishable key, which ships
-- inside the app bundle and is therefore public, currently reads every customer
-- table in this project:
--
--   profiles / payments / devices / installment_contracts /
--   notifications / support_tickets      -> 200, rows returned
--
-- Running 01 alone does not fix that either: it enables RLS and revokes from
-- `anon` *and* `authenticated`, so with no policy creatable a signed-in customer
-- loses their own account instead of regaining it.
--
-- WHAT THIS FILE DOES NOT DO
--
-- It does not enable RLS and it does not create a policy. That is 01 and 03, and
-- they are not to be skipped. It does not create a customer row, and it does not
-- mint one per signup: a customer record is created by the store when the phone
-- is sold, never by a handset that can type an address.
--
-- SAFE TO RUN TWICE. Every statement is `if not exists` or conditional, and the
-- only rows it writes are the owner column on rows this project already has.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The owner column, on every table a policy filters on.
--
--    `customer_key`, not `customer_id`, because that is the name 03 queries. It
--    holds `profiles.id` — a readable string such as `CUST-23839`, not a uuid.
--
--    02 does this too. Both are `if not exists`, so running either or both is
--    harmless — and running this file alone is the shorter path on a project
--    where 02 was never applied, which is the state this one was written for.
--
--    Nullable. A row nobody has claimed stays NULL, and a NULL owner matches no
--    policy: unowned rows are invisible to customers rather than visible to all.
-- ---------------------------------------------------------------------------
alter table public.devices          add column if not exists customer_key text;
alter table public.notifications   add column if not exists customer_key text;
alter table public.support_tickets add column if not exists customer_key text;
alter table public.installment_contracts add column if not exists customer_key text;


-- ---------------------------------------------------------------------------
-- 2. The demo device and its contract.
--
--    There is no column anywhere in this project that links a customer to a
--    device. Measured: `devices` has `contract_id` and nothing that names a
--    customer; `installment_contracts` has no customer column at all. So the
--    claim below cannot be derived — it has to be stated.
--
--    That is the same reasoning 04 uses for the demo customer row: this is a demo
--    project with one seeded handset sold on one contract, and the ids are the
--    ones already in the database (`DEV-SAM-A15-098` -> `CONTRACT-BD-2026-902`).
--    In production the store writes `customer_key` at the moment of sale, when it
--    knows who bought the phone; it is not something a customer or a handset may
--    do for themselves.
-- ---------------------------------------------------------------------------
update public.devices
   set customer_key = 'CUST-23839'
 where customer_key is null
   and id = 'DEV-SAM-A15-098';


-- ---------------------------------------------------------------------------
-- 3. The contract, from the device that names it.
--
--    `devices.contract_id` is the one real relationship in this part of the
--    schema, so the contract inherits the owner of the device sold on it. This
--    is a join, not a guess: no row is written whose device has no owner.
-- ---------------------------------------------------------------------------
update public.installment_contracts c
   set customer_key = d.customer_key
  from public.devices d
 where c.customer_key is null
   and d.contract_id = c.id
   and d.customer_key is not null;


-- ---------------------------------------------------------------------------
-- 4. Report. This is the whole check.
--
--    Every table that 03 writes a policy for must show a non-null `customer_key`
--    on at least one row, or that policy matches nothing and a signed-in customer
--    will see an empty account rather than their own.
--
--    `profiles` is checked by 04's own report. What must be true here is:
--
--      devices               CUST-23839
--      installment_contracts CUST-23839
--
--    `notifications` and `support_tickets` may legitimately be empty — an account
--    with no tickets and no notifications is a real account, not a broken one.
--    A count of 0 there is correct; a missing column is not, and step 1 has
--    already made that impossible.
-- ---------------------------------------------------------------------------
select 'devices'                as table_name, count(*) as rows, count(customer_key) as owned from public.devices
union all
select 'installment_contracts',  count(*),        count(customer_key)        from public.installment_contracts
union all
select 'notifications',         count(*),        count(customer_key)        from public.notifications
union all
select 'support_tickets',       count(*),        count(customer_key)        from public.support_tickets
 order by table_name;

-- Then, and only then, run:
--
--   01-stop-the-bleed.sql
--   03-owner-policies.sql
--   npm run verify:rls
--
-- `--\i 01` must also list `installment_contracts`; see the note in that file's
-- header. Without it the table holding the money stays readable by the public key.
