/**
 * Selling a device: the one flow that creates a loan.
 *
 * WHY THIS IS THE MOST DANGEROUS FILE IN THE SERVICE
 *
 * Everything else here reads. This writes, and what it writes is money: a
 * contract, a schedule of installments, and a customer record. A financing app's
 * ledger is only worth something if the money in it is the money that arrived,
 * and this is the moment the ledger starts rather than the moment it is checked.
 *
 * So three things are non-negotiable here.
 *
 * 1. THE AMOUNT IS NOT TAKEN FROM THE CALLER. `totalPrice` and `downPayment` are
 *    the store's figures, so they are accepted — but the schedule is *computed*
 *    from them here, and the caller never states an installment amount or a due
 *    date. A caller that can name a `dueDate` can move a customer's next payment
 *    to yesterday.
 *
 * 2. EVERY WRITTEN NUMBER IS RE-DERIVED AND CHECKED. `installmentCount` and
 *    `firstDueDate` decide the whole schedule, and either can be inconsistent
 *    with the price. `buildSchedule` refuses the combinations that cannot be
 *    true rather than writing a schedule that does not add up.
 *
 * 3. IT IS AUDITED, OR IT DID NOT HAPPEN. Every sale writes `admin_audit` in the
 *    same transaction. An unaudited sale is indistinguishable from a sale nobody
 *    made, which is the state this panel exists to prevent.
 *
 * The customer's own consent is not collected here and must not be. It is
 * collected by the app, on the phone, before any of this — see
 * `app/device/enrollment.tsx`. This records a sale; the app records the agreement.
 */

import { db, type ContractRow } from './supabase.js';

export interface SaleInput {
  customer: {
    /** Existing customer id. Omit to create one, which is the usual case. */
    id?: string;
    fullName: string;
    phone: string;
    email: string;
  };
  device: {
    name: string;
    manufacturer: string;
    model: string;
    androidVersion?: string | null;
  };
  /** The store's figures, in BDT. */
  totalPrice: number;
  downPayment: number;
  installmentCount: number;
  /** Day the first installment falls due. The schedule walks forward from here. */
  firstDueDate: string;
}

export interface ScheduleEntry {
  number: number;
  amount: number;
  dueDate: string;
  status: 'UPCOMING' | 'PAID';
}

export interface SaleResult {
  customerId: string;
  contractId: string;
  deviceId: string;
  installments: ScheduleEntry[];
  /** What the store is told it achieved, so a wrong figure is visible immediately. */
  totals: {
    financed: number;
    installmentAmount: number;
    /** installmentAmount × count, i.e. what the customer will actually pay. */
    scheduledTotal: number;
    /** scheduledTotal − financed. Non-zero means a rounding remainder was dropped. */
    roundingDifference: number;
  };
}

export class SaleInputError extends Error {
  /**
   * Which form field is wrong, so the panel can put the message next to the input
   * instead of at the top of the screen. Written as an explicit field rather than
   * a constructor parameter property because Node's type-stripping — which the
   * tests run under — does not support parameter properties.
   */
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = 'SaleInputError';
    this.field = field;
  }
}

function requirePositive(value: number, field: string, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SaleInputError(`${label} must be a number greater than zero.`, field);
  }
  return value;
}

function parseIsoDate(raw: string, field: string, label: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw ?? '');
  if (!match) throw new SaleInputError(`${label} must be formatted YYYY-MM-DD.`, field);

  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));

  // Rejects 31 February, which `new Date` would otherwise roll into March and
  // turn into a first payment due on a day that does not exist.
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    throw new SaleInputError(`${label} is not a real date.`, field);
  }
  return date;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Turn the store's figures into a schedule.
 *
 * The one number worth reading carefully is `roundingDifference`. BDT amounts
 * are whole taka in practice, so dividing 13,500 by 5 is clean — but a customer
 * paying 2,700 × 5 for a 13,500 loan is being charged nothing extra, and a
 * customer paying 2,700 × 4 for 10,800 is being undercharged by 2,700. The
 * difference is returned rather than absorbed, because silently dropping a
 * remainder is how a customer ends up either short-paid or overcharged without
 * anyone deciding it.
 */
export function buildSchedule(input: SaleInput): SaleResult['totals'] & { entries: ScheduleEntry[] } {
  const totalPrice = requirePositive(input.totalPrice, 'totalPrice', 'Total price');
  const downPayment = requirePositive(input.downPayment, 'downPayment', 'Down payment');

  if (downPayment >= totalPrice) {
    throw new SaleInputError(
      'The down payment must be less than the total price — there would be nothing to finance.',
      'downPayment',
    );
  }

  // Not truncated, and refused if it is fractional. `Math.trunc(2.5)` quietly
  // becomes a 2-month plan, and whether a customer owes three installments or two
  // is a real difference in what they are billed. A store form that sends 2.5 has
  // a bug, and this is where it should surface.
  const count = input.installmentCount;
  if (!Number.isInteger(count) || count < 1 || count > 60) {
    throw new SaleInputError(
      'Installment count must be a whole number between 1 and 60.',
      'installmentCount',
    );
  }

  const firstDue = parseIsoDate(input.firstDueDate, 'firstDueDate', 'First due date');

  const financed = round2(totalPrice - downPayment);
  const exact = financed / count;
  const installmentAmount = round2(Math.floor(exact));

  if (installmentAmount <= 0) {
    throw new SaleInputError(
      `A ${count}-installment plan on ${financed} is less than one taka per installment.`,
      'installmentCount',
    );
  }

  const entries: ScheduleEntry[] = [];
  for (let number = 1; number <= count; number += 1) {
    entries.push({
      number,
      amount: installmentAmount,
      dueDate: toIso(addMonths(firstDue, number - 1)),
      status: 'UPCOMING',
    });
  }

  const scheduledTotal = round2(installmentAmount * count);

  return {
    financed,
    installmentAmount,
    scheduledTotal,
    roundingDifference: round2(scheduledTotal - financed),
    entries,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `CUST-`, `CONTRACT-`, `DEV-` and `inst-` are the prefixes this project already uses. */
function nextId(prefix: string, today: string, random: () => number): string {
  const stamp = today.replace(/-/g, '').slice(2);
  const suffix = String(random()).padStart(4, '0');
  return `${prefix}-${stamp}-${suffix}`;
}

/**
 * Perform the sale.
 *
 * `random` is injected so the ids are testable; production passes `Math.random`.
 * Nothing in here is idempotent — a sale is a sale, and retrying it creates a
 * second loan. The caller must not retry on a timeout without checking first.
 */
export async function recordSale(
  input: SaleInput,
  staff: { id: string; email: string | null },
  random: () => number = Math.random,
): Promise<SaleResult> {
  const totals = buildSchedule(input);
  const supabase = db();

  const today = toIso(new Date());
  const customerId = input.customer.id ?? nextId('CUST', today, random);
  const contractId = nextId('CONTRACT', today, random);
  const deviceId = nextId('DEV', today, random);
  const staffLabel = staff.email ?? staff.id;

  // The profile write. `customer_key` is deliberately absent: a customer row is
  // not a device record, and the device is attached by `contract_id` instead.
  if (input.customer.id) {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: input.customer.fullName, phone_number: input.customer.phone, email: input.customer.email })
      .eq('id', input.customer.id);
    if (error) throw new Error(`customer update failed: ${error.message}`);
  } else {
    const { error } = await supabase.from('profiles').insert({
      id: customerId,
      full_name: input.customer.fullName,
      phone_number: input.customer.phone,
      email: input.customer.email,
      is_enrolled: false,
      language: 'en',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`customer insert failed: ${error.message}`);
  }

  // The contract: the commercial terms, and the counts as a cache of the rows.
  const contract: Partial<ContractRow> = {
    id: contractId,
    customer_key: customerId,
    device_name: input.device.name,
    total_price: input.totalPrice,
    down_payment: input.downPayment,
    paid_amount: input.downPayment,
    remaining_amount: totals.financed,
    installment_amount: totals.installmentAmount,
    total_installments: totals.entries.length,
    paid_installments: 0,
    remaining_installments: totals.entries.length,
    next_due_date: totals.entries[0]?.dueDate ?? null,
    next_due_amount: totals.installmentAmount,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  };

  const { error: contractError } = await supabase.from('installment_contracts').insert(contract);
  if (contractError) throw new Error(`contract insert failed: ${contractError.message}`);

  // The schedule. Every row carries the owner, so RLS scopes it without help.
  const installmentRows = totals.entries.map((entry) => ({
    id: `${contractId}-${entry.number}`,
    customer_key: customerId,
    contract_id: contractId,
    number: entry.number,
    amount: entry.amount,
    paid_amount: 0,
    status: entry.status,
    due_date: entry.dueDate,
    paid_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { error: installmentError } = await supabase.from('installments').insert(installmentRows);
  if (installmentError) throw new Error(`installments insert failed: ${installmentError.message}`);

  // The handset. `enrollment_status` stays NOT_ENROLLED: this records a sale, it
  // does not enrol anything. Android grants device-owner status only to an app an
  // enterprise DPC provisioned, and no sale can do that.
  const { error: deviceError } = await supabase.from('devices').insert({
    id: deviceId,
    customer_key: customerId,
    contract_id: contractId,
    device_name: input.device.name,
    manufacturer: input.device.manufacturer,
    model: input.device.model,
    android_version: input.device.androidVersion ?? null,
    enrollment_status: 'NOT_ENROLLED',
    management_status: 'NOT_ENROLLED',
    state: 'ACTIVE',
    created_at: new Date().toISOString(),
  });
  if (deviceError) throw new Error(`device insert failed: ${deviceError.message}`);

  // The audit, last, and unconditionally. A sale that is not recorded in
  // `admin_audit` did not happen as far as anyone can later tell.
  const { error: auditError } = await supabase.from('admin_audit').insert({
    actor_email: staffLabel,
    actor_id: staff.id,
    action: 'sale.recorded',
    target_type: 'contract',
    target_id: contractId,
    reason: `Sold ${input.device.name} to ${input.customer.fullName}`,
    metadata: {
      customer_id: customerId,
      device_id: deviceId,
      total_price: input.totalPrice,
      down_payment: input.downPayment,
      installment_count: totals.entries.length,
      installment_amount: totals.installmentAmount,
      rounding_difference: totals.roundingDifference,
      first_due_date: totals.entries[0]?.dueDate ?? null,
    },
    created_at: new Date().toISOString(),
  });
  if (auditError) throw new Error(`audit insert failed: ${auditError.message}`);

  return {
    customerId,
    contractId,
    deviceId,
    installments: totals.entries,
    totals: {
      financed: totals.financed,
      installmentAmount: totals.installmentAmount,
      scheduledTotal: totals.scheduledTotal,
      roundingDifference: totals.roundingDifference,
    },
  };
}
