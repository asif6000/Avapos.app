/**
 * Server-side configuration and the one Supabase client this service uses.
 *
 * THE KEY QUESTION: WHY A PRIVILEGED KEY ON A SERVER AT ALL
 *
 * The alternative was to forward the caller's own Supabase JWT to PostgREST and
 * let RLS do the scoping. That is the better design and it is the one to move to.
 * It cannot be the one today, for a measured reason: RLS is not enabled on this
 * project yet. Measured on 2026-09-26 with the publishable key, which is public:
 *
 *   profiles / payments / devices / installment_contracts /
 *   notifications / support_tickets   -> 200, real rows returned
 *
 * So with RLS off, forwarding the caller's token would return *every* customer's
 * rows. A privileged key is used instead, and ownership is enforced here in the
 * query — every read filters on the `customer_key` resolved from the verified
 * session. The guarantee does not come from the database; it comes from the fact
 * that no query in this service can be written without a customer id.
 *
 * `sql/01-stop-the-bleed.sql`, `sql/03-owner-policies.sql` and `sql/07-owner-columns.sql`
 * close that gap. Once they are applied, delete `db()`'s privileged client and
 * forward the caller's token instead; the ownership filters stay either way.
 *
 * This key is a server secret. It must never appear in `EXPO_PUBLIC_*`, in the app
 * bundle, in SecureStore or in AsyncStorage — anything shipped to a phone is
 * public. `__tests__/noSecretsInClient.test.ts` in the app enforces that half.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `${name} is not set. The API cannot start without it — there is no anonymous mode for a service that reads customer records.`,
    );
  }
  return value;
}

export const config = {
  /** Supabase project ref, e.g. `vslediphrlrlhrormmxh`. Drives issuer checks. */
  projectRef: required('SUPABASE_PROJECT_REF'),
  supabaseUrl: required('SUPABASE_URL'),
  /**
   * Where the signing keys are fetched from.
   *
   * Defaults to the public project URL. Overridable for two reasons: a
   * self-hosted Supabase is not at `*.supabase.co`, and the test suite serves a
   * JWKS of its own so the ES256 path can be exercised without a network.
   */
  jwksUrl: process.env.SUPABASE_JWKS_URL ?? `https://${required('SUPABASE_PROJECT_REF')}.supabase.co/auth/v1/.well-known/jwks.json`,
  /** Server-only. See the note above before adding this to any client. */
  supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  port: Number.parseInt(process.env.PORT ?? '4001', 10),
  logSql: process.env.LOG_SQL === 'true',
} as const;

/** Row shapes as they exist in the live database, measured 2026-09-26. */
export interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  language: string | null;
  is_enrolled: boolean | null;
  created_at: string | null;
}

export interface ContractRow {
  id: string;
  customer_key: string | null;
  device_name: string | null;
  total_price: number;
  down_payment: number;
  paid_amount: number;
  remaining_amount: number;
  installment_amount: number;
  total_installments: number;
  paid_installments: number;
  remaining_installments: number;
  /** Stored as free text — `10 October 2026` — not as a date. See schedule.ts. */
  next_due_date: string | null;
  next_due_amount: number | null;
  status: string;
  created_at: string | null;
}

export interface DeviceRow {
  id: string;
  customer_key: string | null;
  contract_id: string | null;
  device_name: string | null;
  manufacturer: string | null;
  model: string | null;
  android_version: string | null;
  enrollment_status: string | null;
  management_status: string | null;
  state: string | null;
  last_sync_time: string | null;
}

export interface PaymentRow {
  transaction_id: string;
  customer_key: string | null;
  installment_number: number | null;
  amount: number;
  status: string;
  date: string | null;
  payment_method: string | null;
  receipt_url: string | null;
  created_at: string | null;
}

export interface TicketRow {
  id: string;
  customer_key: string | null;
  subject: string | null;
  message: string | null;
  category: string | null;
  status: string | null;
  admin_response: string | null;
  created_at: string | null;
}

export interface NotificationRow {
  id: string;
  customer_key: string | null;
  type: string | null;
  title: string | null;
  message: string | null;
  is_read: boolean | null;
  reference_id: string | null;
  created_at: string | null;
}

/**
 * The single Supabase client.
 *
 * `persistSession: false` and no storage: this process is a server, it has no
 * user to keep a session for, and writing tokens to disk here would be a
 * credential at rest for no benefit.
 */
let client: SupabaseClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { 'x-client-info': 'srabon-api' } },
});

/**
 * The client every read goes through.
 *
 * A function rather than a constant so a test can substitute a double: the
 * `.eq('customer_key', …)` on every query in `reads.ts` is the only thing
 * standing between two customers in this service, and it is worth asserting
 * against without standing up a database. Use `useSupabaseClientForTests`, which
 * hands back a restore function so one test cannot leak its double into another.
 */
export function db(): SupabaseClient {
  return client;
}

export function useSupabaseClientForTests(replacement: SupabaseClient | null): () => void {
  const original = client;
  if (replacement) client = replacement;
  return () => {
    client = original;
  };
}
