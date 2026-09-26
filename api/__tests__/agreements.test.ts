/**
 * The device-management consent.
 *
 * The stakes are a person's agreement to terms about their own phone and their
 * data. A record that can be written twice, attributed to the wrong customer, or
 * accepted on a version the app never issued is not evidence of anything, so each
 * of those has a test.
 */

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.SUPABASE_PROJECT_REF ??= 'testref';
process.env.SUPABASE_URL ??= 'https://testref.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-only-not-a-real-key';

const { acceptAgreement, AgreementError, readCurrentAgreement } = await import('../dist/agreements.js');
const { useSupabaseClientForTests } = await import('../dist/supabase.js');

type Customer = import('../dist/auth.js').CustomerRecord;
type Row = Record<string, unknown>;

const CUSTOMER: Customer = {
  id: 'CUST-23839',
  fullName: 'Asif Hossain',
  email: 'asifghe78@gmail.com',
  phone: '+8801810902817',
  language: 'en',
  isEnrolled: false,
  createdAt: '2026-09-25T14:29:06.188Z',
};

const AGREED: Row = {
  id: 'AGR-1',
  customer_key: CUSTOMER.id,
  agreement_version: '1.0.0',
  accepted_by_name: 'Asif Hossain',
  accepted_at: '2026-09-25T10:00:00.000Z',
  created_at: '2026-09-25T10:00:00.000Z',
};

/** What a test inspects afterwards. */
let written: Row[] = [];
let existing: Row[] = [];
let insertError: { code?: string; message: string } | null = null;

/**
 * A query builder that chains, the way supabase-js does: every link returns the
 * same object. A mock that returns a fresh object from `.select()` would leave
 * `.eq()` undefined, and the test would be reporting the mock's bug as a failure
 * of the code under test.
 */
function stubClient(): never {
  const state: Record<string, unknown> = {
    // `db().from('customer_agreements')` is how every read and write here starts.
    from: () => state,
    select: () => state,
    eq: () => state,
    order: () => state,
    limit: () => state,
    maybeSingle: async () => ({ data: existing[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data: existing, error: null })),
    insert: async (row: Row) => {
      written.push(row);
      return { data: null, error: insertError };
    },
  };
  return state as never;
}

let restore: () => void = () => {};

beforeEach(() => {
  written = [];
  existing = [];
  insertError = null;
  restore();
  restore = useSupabaseClientForTests(stubClient());
});

const accept = (version: string, name = 'Asif Hossain') =>
  acceptAgreement(CUSTOMER, { agreementVersion: version, acceptedByName: name });

test('a version and a name are both required', async () => {
  await assert.rejects(() => accept(''), AgreementError);
  await assert.rejects(() => accept('1.0.0', ''), AgreementError);
  // One letter is not a name, and recording "A" as a signature is not consent.
  await assert.rejects(() => accept('1.0.0', 'A'), AgreementError);
});

test('a version the app could not have issued is refused', async () => {
  // An unbounded version string is how a caller would try to record agreement to
  // terms that were never shown to anybody.
  await assert.rejects(() => accept('v'.repeat(65)), AgreementError);
});

test('the owner is the verified customer, never the request', async () => {
  const result = await accept('1.0.0');

  assert.equal(written.length, 1);
  // The one thing written that identifies a person comes from the session, so a
  // caller cannot record this agreement against somebody else's account.
  assert.equal(written[0]?.customer_key, CUSTOMER.id);
  assert.equal(written[0]?.agreement_version, '1.0.0');
  assert.equal(written[0]?.accepted_by_name, 'Asif Hossain');
  assert.equal(result.created, true);
});

test('writing this row does not claim an enrolment happened', async () => {
  const result = await accept('1.0.0');

  // Android grants device-owner status on its own screen, to an app an
  // enterprise DPC provisioned. A database row cannot, so the record must not
  // imply otherwise — a panel that trusted this flag would tell an operator a
  // phone is managed when it is not.
  assert.equal(result.agreement.enrollmentComplete, false);
});

test('pressing the button twice does not move the moment of consent', async () => {
  existing = [AGREED];

  const again = await accept('1.0.0');

  assert.equal(again.created, false);
  // The first moment they agreed, not the last time they visited the screen.
  assert.equal(again.agreement.acceptedAt, '2026-09-25T10:00:00.000Z');
  assert.equal(written.length, 0);
});

test('a new version of the terms is a new record', async () => {
  existing = [AGREED];

  const result = await accept('2.0.0');

  // The old row is left alone, so the history of what was agreed to, and when,
  // survives the terms being changed.
  assert.equal(result.created, true);
  assert.equal(result.agreement.agreementVersion, '2.0.0');
  assert.equal(written[0]?.agreement_version, '2.0.0');
});

test('a raced press with nothing to fall back on surfaces the failure', async () => {
  // Losing the unique-index race with no visible winner means the write did not
  // land. A swallowed error here would leave the customer believing they had
  // accepted terms they had not.
  insertError = { code: '23505', message: 'duplicate key' };
  await assert.rejects(() => accept('1.0.0'));
});

test('a raced press that can see the first record is answered, not failed', async () => {
  // Same race, but the winner is now visible — which is the same situation as a
  // repeat press, so it is answered the same way.
  insertError = { code: '23505', message: 'duplicate key' };
  existing = [AGREED];

  const result = await accept('1.0.0');
  assert.equal(result.created, false);
  assert.equal(result.agreement.acceptedAt, '2026-09-25T10:00:00.000Z');
});

test('no agreement yet is null, not an error', async () => {
  // A customer who has opened the app and not reached the agreement has none, and
  // the enrollment screen has to render that without treating it as a failure.
  assert.equal(await readCurrentAgreement(CUSTOMER), null);
});

test('a stored agreement is read back in the shape the app expects', async () => {
  existing = [AGREED];

  const record = await readCurrentAgreement(CUSTOMER);
  assert.deepEqual(record, {
    agreementVersion: '1.0.0',
    acceptedAt: '2026-09-25T10:00:00.000Z',
    acceptedByName: 'Asif Hossain',
    enrollmentComplete: false,
  });
});
