/**
 * Recording the customer's device-management consent.
 *
 * WHY THIS IS A WRITE, AND WHY IT IS THE ONLY ONE
 *
 * Every other route in this service is a GET. This one is not, and the difference
 * is the point: a consent record is evidence, and evidence that a client writes
 * for itself is worthless. The session is revalidated here and the customer is
 * resolved from the verified token, so `customer_key` is never taken from the
 * request body — the caller can say they agreed, but not *whose* agreement this
 * is.
 *
 * What writing this row does NOT do is enrol, lock or grant anything. Android
 * grants device-owner status to an app an enterprise DPC provisioned, on its own
 * authorisation screen. The shop's flow is:
 *
 *   app installed → agreement accepted → store provisions as device owner
 *   → Android's prompt → backend binds the device
 *
 * and this route is the second step, not the third.
 *
 * WHY RE-ACCEPTING IS REFUSED RATHER THAN OVERWRITTEN
 *
 * `accepted_at` is the moment a person agreed to something. Overwriting it on a
 * second press of the same button would move the start of their consent to
 * whenever they last visited the screen, which is not what the column means. A
 * new version of the terms is a new row, and that is the only way the history
 * grows.
 */

import { db } from './supabase.js';
import type { CustomerRecord } from './auth.js';

export interface AgreementRow {
  id: string;
  customer_key: string;
  agreement_version: string;
  accepted_by_name: string;
  accepted_at: string;
  created_at: string | null;
}

/** The shape `src/types/domain.ts` declares, which is what the app reads. */
export interface AgreementRecord {
  agreementVersion: string;
  acceptedAt: string;
  acceptedByName: string;
  /** True once Android reports the app is actually the device owner. Never set here. */
  enrollmentComplete: boolean;
}

export class AgreementError extends Error {
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = 'AgreementError';
    this.field = field;
  }
}

function toRecord(row: AgreementRow): AgreementRecord {
  return {
    agreementVersion: row.agreement_version,
    acceptedAt: row.accepted_at,
    acceptedByName: row.accepted_by_name,
    enrollmentComplete: false,
  };
}

/**
 * The most recent agreement this customer has accepted, or null.
 *
 * Null is a real answer, not a failure: a customer who has opened the app and not
 * yet reached the agreement has none, and the screen has to be able to say so
 * without an error.
 */
export async function readCurrentAgreement(customer: CustomerRecord): Promise<AgreementRecord | null> {
  const { data, error } = await db()
    .from('customer_agreements')
    .select('*')
    .eq('customer_key', customer.id)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`agreement read failed: ${error.message}`);
  if (!data) return null;

  return toRecord(data as AgreementRow);
}

export interface AcceptInput {
  agreementVersion: string;
  acceptedByName: string;
}

export interface AcceptResult {
  agreement: AgreementRecord;
  /** True when this call created the row, false when the agreement already existed. */
  created: boolean;
}

function idFor(customer: CustomerRecord, version: string, today: string, random: () => number): string {
  const stamp = today.replace(/-/g, '').slice(2);
  return `AGR-${stamp}-${customer.id.replace(/[^A-Za-z0-9]/g, '')}-${Math.trunc(random() * 10000)
    .toString()
    .padStart(4, '0')}-${version.replace(/[^A-Za-z0-9._-]/g, '')}`;
}

/**
 * Record that this customer accepted this version.
 *
 * Idempotent by design: pressing the button twice is a person being unsure, not
 * two agreements, and the second press returns the first record rather than
 * failing. `random` is injected so the id is testable.
 */
export async function acceptAgreement(
  customer: CustomerRecord,
  input: AcceptInput,
  random: () => number = Math.random,
): Promise<AcceptResult> {
  const version = (input.agreementVersion ?? '').trim();
  const name = (input.acceptedByName ?? '').trim();

  if (version.length === 0) {
    throw new AgreementError('The agreement version is required.', 'agreementVersion');
  }
  if (version.length > 64) {
    throw new AgreementError('The agreement version is not a version this app issued.', 'agreementVersion');
  }
  if (name.length < 2) {
    throw new AgreementError('Please type your full name to accept the agreement.', 'acceptedByName');
  }
  if (name.length > 120) {
    throw new AgreementError('That name is too long to record.', 'acceptedByName');
  }

  // Already agreed to this version? Then there is nothing to write, and the
  // original `accepted_at` stands.
  const existing = await readCurrentAgreement(customer);
  if (existing && existing.agreementVersion === version) {
    return { agreement: existing, created: false };
  }

  const now = new Date();
  const row: AgreementRow = {
    id: idFor(customer, version, now.toISOString().slice(0, 10), random),
    customer_key: customer.id,
    agreement_version: version,
    accepted_by_name: name,
    accepted_at: now.toISOString(),
    created_at: now.toISOString(),
  };

  const { error } = await db().from('customer_agreements').insert(row);
  if (error) {
    // A unique violation means two requests raced — the second press arriving
    // before the first finished. That is the same situation as a repeat press,
    // so it is answered the same way.
    if (error.code === '23505') {
      const raced = await readCurrentAgreement(customer);
      if (raced) return { agreement: raced, created: false };
    }
    throw new Error(`agreement insert failed: ${error.message}`);
  }

  return { agreement: toRecord(row as AgreementRow), created: true };
}
