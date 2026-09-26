/**
 * Selling a device, and the arithmetic that decides what a customer owes.
 *
 * The bar these tests set: a schedule either adds up to what the customer was
 * told, or the sale is refused. There is no third outcome, and in particular no
 * outcome where the figure is quietly rounded and nobody is shown it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

// `sales.ts` pulls in the Supabase module, which refuses to load without a
// configured project. `buildSchedule` is pure arithmetic and never touches it,
// but the import graph still has to resolve.
process.env.SUPABASE_PROJECT_REF ??= 'testref';
process.env.SUPABASE_URL ??= 'https://testref.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-only-not-a-real-key';

const { buildSchedule, SaleInputError } = await import('../dist/sales.js');
type SaleInput = import('../dist/sales.js').SaleInput;

function sale(overrides: Partial<SaleInput> = {}): SaleInput {
  return {
    customer: { fullName: 'Asif Hossain', phone: '+8801810902817', email: 'asifghe78@gmail.com' },
    device: { name: 'Samsung Galaxy A15 5G', manufacturer: 'Samsung', model: 'Galaxy A15 5G' },
    totalPrice: 25000,
    downPayment: 6500,
    installmentCount: 7,
    firstDueDate: '2026-10-10',
    ...overrides,
  };
}

test('the demo figures produce a schedule that adds up', () => {
  // 25,000 less a 6,500 down payment leaves 18,500 to finance. (The live
  // contract shows 13,500 remaining because 5,000 has already been paid since
  // the sale — this is a *new* sale of the same handset.)
  const { financed, installmentAmount, scheduledTotal, roundingDifference, entries } = buildSchedule(sale());

  assert.equal(financed, 18500);
  assert.equal(installmentAmount, 2642); // floor(18500 / 7)
  assert.equal(entries.length, 7);
  // 2642 × 7 = 18494, six taka under the financed amount. That gap is reported,
  // not absorbed.
  assert.equal(scheduledTotal, 18494);
  assert.equal(roundingDifference, -6);
  // The gap is never in the customer's favour against them: they are scheduled
  // to pay less than they owe, and the shortfall is visible rather than billed.
  assert.ok(scheduledTotal < financed);
});

test('the rounding difference is never silently absorbed', () => {
  // 13,500 over 5 is exact, so there is nothing to report.
  const exact = buildSchedule(sale({ installmentCount: 5 }));
  assert.equal(exact.roundingDifference, 0);
  assert.equal(exact.scheduledTotal, exact.financed);

  // 10,000 over 3 is not: 3333 × 3 = 9999, and the missing taka is reported.
  const short = buildSchedule(sale({ totalPrice: 14000, downPayment: 4000, installmentCount: 3 }));
  assert.equal(short.financed, 10000);
  assert.equal(short.scheduledTotal, 9999);
  assert.equal(short.roundingDifference, -1);
  // The difference always reconciles: financed = scheduled − difference.
  assert.equal(short.scheduledTotal - short.roundingDifference, short.financed);
});

test('a schedule is never built to collect more than was financed', () => {
  // The customer must never be quoted a total above what they owe us. Flooring
  // the per-installment amount is what guarantees that, and this pins it.
  for (let count = 1; count <= 24; count += 1) {
    const result = buildSchedule(sale({ totalPrice: 25000, downPayment: 999, installmentCount: count }));
    assert.ok(
      result.scheduledTotal <= result.financed,
      `count=${count} collected ${result.scheduledTotal} of ${result.financed}`,
    );
  }
});

test('the first due date is the date given, and the rest walk forward a month', () => {
  const { entries } = buildSchedule(sale({ installmentCount: 4 }));
  assert.equal(entries[0]?.dueDate, '2026-10-10');
  assert.deepEqual(entries.map((e) => e.dueDate), [
    '2026-10-10', '2026-11-10', '2026-12-10', '2027-01-10',
  ]);
  assert.deepEqual(entries.map((e) => e.number), [1, 2, 3, 4]);
});

test('a due date that is not a real day is refused, not rolled over', () => {
  // `new Date('2026-02-31')` becomes 3 March, which would quietly move a
  // customer's first payment.
  assert.throws(() => buildSchedule(sale({ firstDueDate: '2026-02-31' })), SaleInputError);
  assert.throws(() => buildSchedule(sale({ firstDueDate: '10/10/2026' })), SaleInputError);
  assert.throws(() => buildSchedule(sale({ firstDueDate: '' })), SaleInputError);
});

test('29 February is accepted in a leap year and refused otherwise', () => {
  assert.doesNotThrow(() => buildSchedule(sale({ firstDueDate: '2028-02-29' })));
  assert.throws(() => buildSchedule(sale({ firstDueDate: '2026-02-29' })), SaleInputError);
});

test('figures that cannot describe a loan are refused', () => {
  // Nothing left to finance.
  assert.throws(() => buildSchedule(sale({ totalPrice: 6500, downPayment: 6500 })), SaleInputError);
  assert.throws(() => buildSchedule(sale({ downPayment: 25000 })), SaleInputError);
  // A larger down payment than the price is not caught by an equality check, so
  // it gets its own line.
  assert.throws(() => buildSchedule(sale({ downPayment: 90000 })), SaleInputError);
  // Not numbers.
  assert.throws(() => buildSchedule(sale({ totalPrice: Number.NaN })), SaleInputError);
  assert.throws(() => buildSchedule(sale({ totalPrice: 0 })), SaleInputError);
  // Not a whole count of installments.
  assert.throws(() => buildSchedule(sale({ installmentCount: 0 })), SaleInputError);
  assert.throws(() => buildSchedule(sale({ installmentCount: 2.5 })), SaleInputError);
  assert.throws(() => buildSchedule(sale({ installmentCount: 61 })), SaleInputError);
});

test('a plan of more taka than there is money is refused', () => {
  // 59 taka over 60 installments is 0.98 each, which floors to nothing: a plan
  // that collects less than a taka a month is not a plan.
  const error = (() => {
    try {
      buildSchedule(sale({ totalPrice: 60, downPayment: 1, installmentCount: 60 }));
      return null;
    } catch (caught) {
      return caught;
    }
  })();

  assert.ok(error instanceof SaleInputError);
  assert.equal(error.field, 'installmentCount');
});

test('a single installment is a valid plan', () => {
  const result = buildSchedule(sale({ installmentCount: 1 }));
  assert.equal(result.entries.length, 1);
  assert.equal(result.installmentAmount, result.financed);
  assert.equal(result.roundingDifference, 0);
});

test('every installment is UPCOMING, because no money has arrived yet', () => {
  // A sale cannot create a paid installment. If it could, a store could mark a
  // loan settled by selling it.
  const { entries } = buildSchedule(sale());
  assert.ok(entries.every((e) => e.status === 'UPCOMING'));
  assert.ok(entries.every((e) => e.amount > 0));
});
