import type { ApiError, ErrorKind } from '@/api/errors';
import type { DashboardSummary } from '@/types/domain';

/**
 * Every state the Home screen can be in, decided in one place.
 *
 * The screen used to have two: "loading", "error", "here is some data". The
 * error was then rendered as one full-screen message whatever had actually
 * happened, and because the assembled view 404s when the route is not deployed,
 * that message was "The requested information was not found." — which is a
 * statement about the customer's account, made by a server that had never looked
 * at one. This module is the fix: the reason is worked out from the evidence
 * available on the device, and only then written in words.
 *
 * It is a pure function of the query result plus whether a Supabase session is
 * live, so every branch below is testable without a network, a server or a
 * render.
 */

/** The numbering in the comments below matches the states this screen owes a customer. */
export type HomeState =
  /** 1. First read in flight. */
  | 'loading'
  /** 2. Nothing was answered: no network, DNS, timeout, aborted. */
  | 'network_error'
  /** 3. There is no live session, so there is nothing to be refused about. */
  | 'auth_error'
  /**
   * 4. The session is valid and the server still refused it.
   *
   * `VerifySupabaseJwt` answers 401 both when a token cannot be verified and when
   * a perfectly good token resolves to no `profiles` row — `sql/04-link-demo-customer.sql`
   * is the script that creates that link, and until it has been run every signed-in
   * customer lands here. The two used to be told apart by their consequences.
   */
  | 'customer_not_found'
  /** 5. The customer exists; there is no installment schedule yet. */
  | 'no_installment'
  /** 6. The customer exists; no phone is linked yet. */
  | 'no_device'
  /** 5 and 6 together — a real account, nothing sold on it yet. */
  | 'no_installment_no_device'
  /** 7. A contract and a phone: the ordinary case. */
  | 'active'
  /** 2, other than a dead network: 5xx, a validation failure, a malformed 200. */
  | 'service_error';

export interface ClassifyInput {
  data: DashboardSummary | undefined;
  error: ApiError | null;
  /** True while the first read is in flight and there is nothing cached to show. */
  isLoading: boolean;
  /**
   * Whether this device holds a live Supabase session.
   *
   * This is the only evidence that separates state 3 from state 4, and it is
   * sound: the client cannot mint a customer, so a 401 against a session Supabase
   * still considers valid is the server failing to find the customer behind it,
   * not a session that has gone stale.
   */
  hasSession: boolean;
}

/** Errors that mean the request never reached a server. */
const TRANSPORT_KINDS: ReadonlySet<ErrorKind> = new Set<ErrorKind>([
  'network',
  'timeout',
  'offline',
]);

/**
 * Is this really the assembled view, or a 200 that happens to be something else?
 *
 * A proxy's error page, a captive portal and a sign-in redirect all arrive as 200.
 * Reading `data.plan` off one of those yields `undefined`, which would classify as
 * "no installment plan" and tell a customer with a full schedule that they owe
 * nothing. The customer is the one field that cannot be missing from a real
 * summary, so it is the one field checked.
 */
export function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (!value || typeof value !== 'object') return false;
  const customer = (value as { customer?: unknown }).customer;
  return Boolean(customer) && typeof customer === 'object';
}

/**
 * The single decision the Home screen renders from.
 *
 * Errors are classified before data on purpose. When a refetch fails after a
 * successful load, TanStack Query keeps the last good data *and* sets `error`;
 * a customer who pulls to refresh on a tunnel and sees their balance replaced by
 * an error page is being shown the outage instead of their account, and the
 * cached truth is the better of the two answers.
 */
export function classifyHomeState(input: ClassifyInput): HomeState {
  const { data, error, isLoading, hasSession } = input;

  if (error) {
    if (error.kind === 'unauthorized') {
      return hasSession ? 'customer_not_found' : 'auth_error';
    }
    if (TRANSPORT_KINDS.has(error.kind)) return 'network_error';
    return 'service_error';
  }

  if (isLoading && !data) return 'loading';

  if (data === undefined) {
    // No error, no data, not loading. There is no honest screen for this, and
    // rendering the empty account would be a guess — so it is reported as the
    // service failing rather than as a customer who owes nothing.
    return 'service_error';
  }

  if (!isDashboardSummary(data)) return 'service_error';

  const hasPlan = Boolean(data.plan);
  const hasDevice = Boolean(data.device);

  if (hasPlan && hasDevice) return 'active';
  if (hasPlan) return 'no_device';
  if (hasDevice) return 'no_installment';
  return 'no_installment_no_device';
}

/** States where the account is real and the screen must show what it has. */
export function isRenderableState(state: HomeState): boolean {
  return (
    state === 'active' ||
    state === 'no_installment' ||
    state === 'no_device' ||
    state === 'no_installment_no_device'
  );
}

/**
 * The identities behind a summary, for the console.
 *
 * The customer and the profile are deliberately one line and not two: they are
 * the same row. `profiles.id` is what `installments.customer_key`,
 * `devices.customer_key`, `payments.customer_key` and `notifications.customer_key`
 * all point at, and it is a readable string like `CUST-23839` — not a uuid. The
 * uuid belongs to `auth.users` and reaches this row only through `auth_uid`.
 */
export function describeHomeSummary(summary: DashboardSummary | undefined) {
  return {
    customerId: summary?.customer?.id ?? null,
    contractId: summary?.plan?.contractId ?? summary?.device?.contractId ?? null,
    installmentId: summary?.nextInstallment?.id ?? summary?.plan?.nextInstallmentId ?? null,
    deviceId: summary?.device?.id ?? null,
    hasPlan: Boolean(summary?.plan),
    hasDevice: Boolean(summary?.device),
    hasNextInstallment: Boolean(summary?.nextInstallment),
  };
}
