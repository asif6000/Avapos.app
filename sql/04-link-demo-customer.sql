-- ============================================================================
-- 04-link-demo-customer.sql
--
-- Run in the Supabase SQL Editor, AFTER 01-stop-the-bleed.sql. It repeats the
-- one piece of 02-add-auth-link.sql that this project is still missing, then
-- creates the demo customer row and links it to the Supabase auth user.
--
-- WHY THIS IS NEEDED, MEASURED NOT ASSUMED
--
-- Sign-in works now that "Confirm email" is off:
--
--   POST /auth/v1/token?grant_type=password   -> 200, session issued
--
-- and the very next request the app makes fails:
--
--   GET https://srabontelecom.paymently.io/customer   -> 401 Unauthorized
--
-- The reason is not the token. `VerifySupabaseJwt` verifies the signature, then
-- resolves the customer with
--
--   Customer::query()->where('auth_uid', $userId)->first()
--
-- (backend/app/Http/Middleware/VerifySupabaseJwt.php:60). Against the live
-- database that query cannot succeed, for two reasons:
--
--   1. `profiles.auth_uid` does not exist — 02-add-auth-link.sql has not been
--      run on this project.
--   2. `profiles` is empty. There is no customer row at all, so even the column
--      would not help: no auth user could ever resolve to a customer.
--
-- The second reason is the one to be careful about. A customer row is not
-- something a phone may create (see 03-owner-policies.sql: "a customer record
-- is created by your backend, never a phone"). The insert below exists because
-- this project is a demo with one seeded customer, and the values match the
-- seed in `mock-server/server.mjs` and `docs/api-contract.md` so the app renders
-- the same thing against either server. In production the store creates this
-- row when the device is sold.
--
-- WHAT IT DOES NOT DO
--
-- It does not enable RLS or add the owner policies (that is 01 and 03), and it
-- does not create a profile for every new auth user. A trigger that minted a
-- customer row per signup would hand every stranger who can type an address a
-- signed-in session on a device they do not own.
--
-- SAFE TO RUN TWICE. Every statement is `if not exists`, `on conflict`, or
-- conditional, and the only row it writes is the demo customer.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The auth link. Nullable on purpose: adding a column cannot lock anyone
--    out, and the backfill below runs before anything reads it.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists auth_uid uuid references auth.users(id);

-- One auth user, one customer. Without this, a duplicated link would let the
-- wrong customer match a session.
create unique index if not exists profiles_auth_uid_unique
  on public.profiles (auth_uid)
  where auth_uid is not null;

create index if not exists profiles_auth_uid_idx
  on public.profiles (auth_uid);


-- ---------------------------------------------------------------------------
-- 2. The demo customer, if the project has none.
--
--    `CUST-23839` is the id the other seeded tables already refer to, so the
--    payments backfill in step 4 lands on the right row.
-- ---------------------------------------------------------------------------
insert into public.profiles
  (id, full_name, phone_number, email, is_enrolled, language, created_at, updated_at)
values
  ('CUST-23839', 'Asif Hossain', '+8801810902817', 'asifghe78@gmail.com', true, 'en', now(), now())
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 3. Link every auth user to its customer by email.
--
--    Done by email, not by pasting a uuid: the auth user is created by whoever
--    signs up, so the link has to be derived, not hardcoded. Safe to re-run —
--    `where p.auth_uid is null` means a row is never re-pointed at a different
--    account, which is what stops this from being an account-takeover vector.
-- ---------------------------------------------------------------------------
update public.profiles p
   set auth_uid = u.id
  from auth.users u
 where lower(p.email) = lower(u.email)
   and p.auth_uid is null
   and u.email is not null;


-- ---------------------------------------------------------------------------
-- 4. payments.customer_key
--
--    The deployed controller reads
--
--      CustomerPayment::query()->where('customer_key', $customer->getKey())
--
--    (backend/app/Http/Controllers/Api/CustomerPaymentController.php:24) and
--    the live table has no such column — `payments` is keyed by
--    `transaction_id` and carries no owner at all. So `GET /customer/payments`
--    cannot return this customer's history until the column exists, and RLS
--    cannot scope a table with no owner either (03-owner-policies.sql expects
--    one).
--
--    Named `customer_key`, not `customer_id`, because that is the column the
--    deployed code queries. It holds the same value as `profiles.id` — a
--    readable string, not a uuid.
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists customer_key text;

update public.payments p
   set customer_key = c.id
  from public.profiles c
 where p.customer_key is null
   and c.email = 'asifghe78@gmail.com';


-- ---------------------------------------------------------------------------
-- 5. Report. This is the whole check: `profiles_linked` must be at least 1, or
--    the session still resolves to no customer and every call is a 401.
-- ---------------------------------------------------------------------------
select p.id                as profile_id,
       p.email             as profile_email,
       p.auth_uid          as linked_auth_uid,
       u.email             as auth_user_email,
       (select count(*) from public.payments pay where pay.customer_key = p.id) as payments
  from public.profiles p
  left join auth.users u on u.id = p.auth_uid
 order by p.id;

-- Expected: CUST-23839 | asifghe78@gmail.com | <a uuid> | asifghe78@gmail.com | 3
--
-- Then, with a signed-in session, this must return 200:
--
--   curl -H "Authorization: Bearer <access token>" \
--        https://srabontelecom.paymently.io/customer
