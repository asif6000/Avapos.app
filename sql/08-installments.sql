-- ============================================================================
-- 08-installments.sql
--
-- Run AFTER 07-owner-columns.sql and 01/03, i.e. after the owner columns exist
-- and RLS is on. This is the table the "sell a device" flow writes.
--
-- WHY THIS TABLE HAS TO EXIST
--
-- `installment_contracts` holds a *summary*: `total_installments`,
-- `paid_installments`, `installment_amount`, `next_due_date`. One row per sale.
-- The app's Installments screen shows a *list* — number, amount, due date, paid
-- or not — and nothing in this project can produce that list from a summary.
--
-- The API currently derives it (`api/src/schedule.ts`) and labels the result
-- `scheduleSource: 'derived'`, because there was nothing better to do. That stays
-- as the legacy path, and this file is what ends it: a sale now writes real rows.
--
-- ONE AUTHORITY, NOT TWO
--
-- A summary and a schedule for the same loan can disagree, and a financing app
-- whose two records disagree is a financing app nobody can settle a dispute
-- with. The rule this file establishes:
--
--   `installments` is the authority for anything per-installment — whether a
--   specific installment is paid, when it was paid, what it was for.
--
--   `installment_contracts` keeps only what a row cannot express: which handset
--   was sold, the total price, the down payment, the status of the sale.
--
--   The counts on the contract row (`total_installments`, `paid_installments`,
--   `remaining_installments`) are a *cache* of the rows, written in the same
--   transaction as them. Section 4 is the check that they have not drifted.
--
-- WHAT IS NOT HERE, AND WHY
--
-- No down payment, and no first-installment-due rule. Both are decisions about
-- how a loan is structured, and a store should decide them, not a migration.
-- `POST /admin/api/sales` takes them as explicit input and writes what it is
-- told, so the terms of a sale live in one place and are auditable.
--
-- SAFE TO RUN TWICE. `create table if not exists`, `create index if not exists`,
-- `create policy` is preceded by a drop.
-- ============================================================================


create table if not exists public.installments (
  -- `inst-CUST-23839-4`: readable, sortable, and stable across environments.
  id                text primary key,

  -- Ownership. Same column name every other customer table uses, and the one
  -- 03's policies filter on, so the schedule is scoped by the same rule as the
  -- rest of the account.
  customer_key      text not null references public.profiles (id),

  -- The sale this installment belongs to. A contract with no installments is a
  -- real thing (a phone sold and the plan not yet started), which is why this
  -- is nullable rather than the identity of the row.
  contract_id       text references public.installment_contracts (id),

  number            integer not null check (number > 0),
  amount            numeric(12, 2) not null check (amount > 0),

  -- What has actually been received against this installment. `0` is the normal
  -- value and is not the same as NULL, which would mean "not yet known" and is
  -- why this is not nullable.
  paid_amount       numeric(12, 2) not null default 0 check (paid_amount >= 0),

  -- PAID | DUE | OVERDUE | UPCOMING | PARTIAL. A CHECK rather than an enum so
  -- adding a state does not need a migration that locks the table.
  status            text not null default 'UPCOMING'
                      check (status in ('PAID', 'DUE', 'OVERDUE', 'UPCOMING', 'PARTIAL')),

  -- A date, not a timestamp: an installment is due on a day.
  due_date          date not null,

  -- Set when the installment becomes PAID, and only by the payment path after a
  -- gateway callback this server verified. Never by a client.
  paid_at           timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One installment per position on a contract. Enforced by the database rather
  -- than by the caller, because two rows numbered 3 on one contract is exactly
  -- the kind of thing that must not be possible to write twice.
  unique (contract_id, number),

  -- An installment cannot be paid more than it is for.
  check (paid_amount <= amount)
);

comment on table public.installments is
  'Per-installment schedule. The authority for anything about a single installment.';


create index if not exists installments_customer_key_idx
  on public.installments (customer_key);

-- The dashboard's "next one to pay" and the schedule screen both order by due
-- date within a customer, so this is the index that query needs.
create index if not exists installments_due_idx
  on public.installments (customer_key, due_date);


-- ---------------------------------------------------------------------------
-- 2. RLS
--
-- `01-stop-the-bleed.sql` does not list this table, because it did not exist
-- when that file was written. Both statements are repeated here so a project
-- that has already run 01 still ends up with this table locked down, and so the
-- order of the two files does not matter.
-- ---------------------------------------------------------------------------
alter table public.installments enable row level security;
alter table public.installments force row level security;

revoke all on public.installments from anon;
revoke all on public.installments from authenticated;

-- Read-only, one customer one row. The same rule as payments, and for the same
-- reason: a phone that can write `paid_amount` can mark its own loan settled.
grant select on public.installments to authenticated;

drop policy if exists "installments_select_own" on public.installments;
create policy "installments_select_own" on public.installments
  for select to authenticated
  using (customer_key = (select p.id from public.profiles p where p.auth_uid = auth.uid()));


-- ---------------------------------------------------------------------------
-- 3. The one legacy contract.
--
-- CONTRACT-BD-2026-902 has no rows and never will: it was sold before this table
-- existed. The API derives its schedule (schedule.ts) and says so, and that is
-- the correct outcome for a contract that predates the feature.
--
-- It is deliberately NOT backfilled here. A backfill would have to invent seven
-- due dates from a single `next_due_date`, and the invented ones would be
-- indistinguishable from recorded ones to every screen and every report
-- afterwards. Deriving at read time keeps them visibly derived.
--
-- If the shop wants real dates for that contract, someone who knows them has to
-- enter them, through the panel, where the entry is audited.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 4. The drift check.
--
-- Run this after any sale. Every count must be zero. A non-zero number means the
-- cached counts on the contract row and the installment rows disagree, which is
-- the one failure mode two records for one loan can produce.
-- ---------------------------------------------------------------------------
select c.id                                        as contract_id,
       c.total_installments                        as contract_says_total,
       count(i.id)                                 as rows_say_total,
       c.paid_installments                         as contract_says_paid,
       count(i.id) filter (where i.status = 'PAID') as rows_say_paid,
       coalesce(sum(i.amount) filter (where i.status <> 'PAID'), 0)
                                                     as rows_still_owed
  from public.installment_contracts c
  left join public.installments i on i.contract_id = c.id
 group by c.id, c.total_installments, c.paid_installments
having count(i.id) <> c.total_installments
    or count(i.id) filter (where i.status = 'PAID') <> c.paid_installments
 order by c.id;

-- ONE ROW IS EXPECTED RIGHT NOW, and it is not a fault. CONTRACT-BD-2026-902
-- predates this table: it has 7 installments on the contract row and no rows
-- here, so the check reports it on every run until a real schedule is entered
-- for it. The API derives that contract's schedule and labels the result
-- `scheduleSource: 'derived'`, which is why leaving it alone is safe.
--
-- What must be absent is a *new* sale drifting, which shows up as a contract
-- whose counts disagree with rows that do exist.
--
-- If it reports a contract that does have rows, do not "fix" the contract by
-- hand. The rows are the authority; the counts are the cache. Re-derive the
-- counts from the rows, and find out why the two paths disagreed before writing
-- anything.
-- ---------------------------------------------------------------------------
