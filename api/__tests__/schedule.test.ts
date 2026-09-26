/**
 * The derived schedule, which is the one place this service does arithmetic on
 * money. Everything here is about not being confidently wrong.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { derivePlan, parseDueDate } from '../src/schedule.ts';
import type { ContractRow } from '../src/supabase.ts';

/** The contract row that actually exists in the live project, measured 2026-09-26. */
const LIVE_CONTRACT: ContractRow = {
  id: 'CONTRACT-BD-2026-902',
  customer_key: 'CUST-23839',
  device_name: 'Samsung Galaxy A15 5G',
  total_price: 25000,
  down_payment: 6500,
  paid_amount: 11500,
  remaining_amount: 13500,
  installment_amount: 2500,
  total_installments: 7,
  paid_installments: 2,
  remaining_installments: 5,
  next_due_date: '10 October 2026',
  next_due_amount: 2500,
  status: 'ACTIVE',
  created_at: '2026-09-25T14:29:06.188011+00:00',
};

test('reads the free-text due date the contract actually stores', () => {
  // `new Date('10 October 2026')` is Invalid Date, which is why this is parsed.
  assert.equal(parseDueDate('10 October 2026')?.toISOString().slice(0, 10), '2026-10-10');
  assert.equal(parseDueDate('2026-10-10')?.toISOString().slice(0, 10), '2026-10-10');
  assert.equal(parseDueDate('10/10/2026')?.toISOString().slice(0, 10), '2026-10-10');
  assert.equal(parseDueDate('1 october 2026')?.toISOString().slice(0, 10), '2026-10-01');
});

test('refuses a date it cannot understand instead of guessing one', () => {
  assert.equal(parseDueDate(null), null);
  assert.equal(parseDueDate(''), null);
  assert.equal(parseDueDate('soon'), null);
  assert.equal(parseDueDate('10 Smarch 2026'), null);
});

test('rejects a calendar overflow rather than rolling it into the next month', () => {
  assert.equal(parseDueDate('31 February 2026'), null);
  assert.equal(parseDueDate('30 February 2026'), null);
  assert.notEqual(parseDueDate('29 February 2024')?.toISOString().slice(0, 10), null);
});

test('builds one installment per installment, from the counts on the contract', () => {
  const plan = derivePlan(LIVE_CONTRACT);
  assert.ok(plan);
  assert.equal(plan.installments.length, 7);
  assert.equal(plan.paidInstallments, 2);
  assert.equal(plan.remainingInstallments, 5);
  assert.equal(plan.installmentAmount, 2500);
  // Every one is the amount the contract states. No rounding, no remainder fix.
  assert.ok(plan.installments.every((i) => i.amount === 2500));
});

test('marks the schedule as derived, so nothing downstream mistakes it for a record', () => {
  const plan = derivePlan(LIVE_CONTRACT);
  assert.equal(plan?.scheduleSource, 'derived');
  assert.match(plan?.scheduleNote ?? '', /calculated/i);
});

test('the next due date is the one the shop recorded, not a computed one', () => {
  const plan = derivePlan(LIVE_CONTRACT);
  assert.equal(plan?.nextDueDate, '2026-10-10');
  // Two are paid, so the third is the next one.
  assert.equal(plan?.nextInstallmentId, 'CONTRACT-BD-2026-902-3');
  assert.equal(plan?.installments[2]?.status !== 'PAID', true);
});

test('works backwards from the recorded date for the installments already paid', () => {
  const plan = derivePlan(LIVE_CONTRACT);
  // Paid installments are one month apart, ending the month before the next due.
  assert.equal(plan?.installments[0]?.dueDate, '2026-08-10');
  assert.equal(plan?.installments[1]?.dueDate, '2026-09-10');
  assert.equal(plan?.installments[0]?.status, 'PAID');
  assert.equal(plan?.installments[0]?.paidAmount, 2500);
  assert.notEqual(plan?.installments[0]?.paidAt, null);
});

test('continues a month at a time after the recorded date', () => {
  const plan = derivePlan(LIVE_CONTRACT);
  const dates = plan?.installments.map((i) => i.dueDate) ?? [];
  assert.deepEqual(dates, [
    '2026-08-10', '2026-09-10', '2026-10-10', '2026-11-10',
    '2026-12-10', '2027-01-10', '2027-02-10',
  ]);
});

test('a paid amount is never greater than the installment amount', () => {
  const plan = derivePlan(LIVE_CONTRACT);
  for (const installment of plan?.installments ?? []) {
    assert.ok(installment.paidAmount <= installment.amount, `installment ${installment.number}`);
  }
});

test('an unpaid installment with no parseable date is DUE, never OVERDUE', () => {
  // OVERDUE is a claim against a customer. It must never come from a date this
  // service could not read.
  const plan = derivePlan({ ...LIVE_CONTRACT, next_due_date: 'whenever' });
  assert.equal(plan?.nextDueDate, null);
  for (const installment of plan?.installments ?? []) {
    assert.notEqual(installment.status, 'OVERDUE');
  }
});

test('an unparseable date yields no dates at all rather than wrong ones', () => {
  const plan = derivePlan({ ...LIVE_CONTRACT, next_due_date: 'whenever' });
  assert.ok(plan?.installments.every((i) => i.dueDate === ''));
});

test('a contract with no schedule is a real answer, not a failure', () => {
  assert.equal(derivePlan(null), null);
  assert.equal(derivePlan({ ...LIVE_CONTRACT, total_installments: 0 }), null);
  assert.equal(derivePlan({ ...LIVE_CONTRACT, installment_amount: 0 }), null);
});

test('paid installments can never exceed the total', () => {
  // A contract row edited by hand can disagree with itself. The list must stay
  // the length the contract says it is.
  const plan = derivePlan({ ...LIVE_CONTRACT, paid_installments: 99 });
  assert.equal(plan?.installments.length, 7);
  assert.equal(plan?.paidInstallments, 7);
  assert.equal(plan?.remainingInstallments, 0);
  assert.equal(plan?.nextInstallmentId, null);
});

test('a settled contract is reported as settled', () => {
  assert.equal(derivePlan({ ...LIVE_CONTRACT, status: 'SETTLED' })?.status, 'SETTLED');
  assert.equal(derivePlan({ ...LIVE_CONTRACT, status: 'overdue' })?.status, 'OVERDUE');
  assert.equal(derivePlan({ ...LIVE_CONTRACT, remaining_amount: 0, status: 'weird' })?.status, 'SETTLED');
});
