/**
 * The installment schedule, derived from the contract row.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS THE RISKIEST THING IN THE SERVICE
 *
 * There is no per-installment table in this database. Measured 2026-09-26:
 *
 *   installment_contracts → total_installments: 7, paid_installments: 2,
 *                           installment_amount: 2500, next_due_date: "10 October 2026"
 *
 * One row per contract, holding counts and the next date. The app's Installments
 * screen shows a list — number, amount, due date, paid or not — so a list has to
 * come from somewhere.
 *
 * So this file builds it, and the rest of the service marks the result
 * `scheduleSource: 'derived'` so nothing downstream can mistake arithmetic for a
 * record. That distinction is the whole point of this file existing: a number
 * this service computed and a number the shop recorded must never look alike.
 *
 * WHAT IS DERIVED AND WHAT IS READ
 *
 * Read from the contract, never invented: how many installments there are, how
 * much each is, how many are paid, and the due date of the next one.
 *
 * Derived: the due dates of the installments *after* the next one. The database
 * has no cadence column, so the monthly assumption below is an assumption. It is
 * marked as one, and it is the one number in this service that could be wrong.
 *
 * `next_due_date` is stored as free text — the live value is `10 October 2026`,
 * not an ISO date — so it is parsed rather than passed to `new Date()`, which
 * would read it as Invalid Date.
 */

import type { ContractRow } from './supabase.js';

export type InstallmentStatus = 'PAID' | 'DUE' | 'UPCOMING' | 'OVERDUE';
export type ContractStatus = 'ACTIVE' | 'OVERDUE' | 'SETTLED' | 'PENDING';

export interface DerivedInstallment {
  id: string;
  contractId: string;
  number: number;
  amount: number;
  paidAmount: number;
  status: InstallmentStatus;
  dueDate: string;
  paidAt: string | null;
}

export interface DerivedPlan {
  contractId: string;
  status: ContractStatus;
  totalPrice: number;
  downPayment: number;
  paidAmount: number;
  remainingAmount: number;
  installmentAmount: number;
  totalInstallments: number;
  paidInstallments: number;
  remainingInstallments: number;
  nextDueDate: string | null;
  nextInstallmentId: string | null;
  currency: string;
  installments: DerivedInstallment[];
  /**
   * `derived` means every installment except the next one has a computed due
   * date. `contract` would mean the database holds per-installment rows, which
   * today it does not. The app shows this to the customer rather than passing
   * off a computed date as a recorded one.
   */
  scheduleSource: 'derived' | 'contract';
  scheduleNote: string;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Parse the free-text due date the contract actually stores.
 *
 * Accepts `10 October 2026`, `2026-10-10`, and `10/10/2026`. Returns null
 * rather than a wrong date: an unparseable date must show as unknown, because a
 * date invented from an unparseable string is how a customer ends up being told
 * a payment is due on a day nobody agreed to.
 */
export function parseDueDate(raw: string | null): Date | null {
  if (!raw) return null;

  const trimmed = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    return buildDate(Number(y), Number(m) - 1, Number(d));
  }

  const long = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(trimmed);
  if (long) {
    const d = long[1];
    const name = long[2];
    const y = long[3];
    if (!d || !name || !y) return null;
    const month = MONTHS.indexOf(name.toLowerCase());
    if (month < 0) return null;
    return buildDate(Number(y), month, Number(d));
  }

  const slash = /^(\d{1,2})[/](\d{1,2})[/](\d{4})$/.exec(trimmed);
  if (slash) {
    const [, d, m, y] = slash;
    return buildDate(Number(y), Number(m) - 1, Number(d));
  }

  return null;
}

function buildDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month, day));
  // Rejects 31 February and similar overflow rather than rolling into March.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** Paid installments are dated before the next due date, so they are back-filled. */
function paidAtFor(number: number, nextDue: Date | null): string | null {
  if (nextDue === null) return null;
  if (number < 1) return null;
  return toIso(addMonths(nextDue, -number));
}

function contractStatus(contract: ContractRow): ContractStatus {
  const raw = (contract.status ?? '').toUpperCase();
  if (raw === 'SETTLED' || raw === 'COMPLETED' || raw === 'PAID') return 'SETTLED';
  if (raw === 'OVERDUE' || raw === 'DEFAULTED') return 'OVERDUE';
  if (raw === 'PENDING' || raw === 'ACTIVE') return 'ACTIVE';
  return contract.remaining_amount <= 0 ? 'SETTLED' : 'ACTIVE';
}

/**
 * Build the plan, or null when the contract has no installment schedule at all.
 *
 * Null is a real answer, not a failure: a customer who has bought a phone and
 * not yet started the plan has a contract and no schedule, and the app has a
 * state for that. It is not an error and must not become one.
 */
export function derivePlan(contract: ContractRow | null): DerivedPlan | null {
  if (!contract) return null;

  const total = Math.max(0, Math.trunc(contract.total_installments));
  const each = Number(contract.installment_amount);
  if (total === 0 || !Number.isFinite(each) || each <= 0) return null;

  const paidCount = Math.min(Math.max(0, Math.trunc(contract.paid_installments)), total);
  const nextDue = parseDueDate(contract.next_due_date);
  const today = new Date();

  const installments: DerivedInstallment[] = [];

  for (let number = 1; number <= total; number += 1) {
    const isPaid = number <= paidCount;

    // The one date the database actually holds belongs to installment
    // `paidCount + 1`. Everything before it is back-filled from that, and
    // everything after it is a monthly assumption.
    //
    // If that one date cannot be parsed there is no anchor for the cadence, and
    // `created_at` is not one: it records when the row was written, not when
    // money falls due. Anchoring on it would produce a schedule that looks
    // authoritative and is not, so the dates stay empty instead. The counts and
    // the amount still come through, and the plan still renders.
    const dueDate = (() => {
      if (nextDue === null) return null;
      if (isPaid) return toIso(addMonths(nextDue, -(paidCount + 1 - number)));
      return toIso(addMonths(nextDue, number - (paidCount + 1)));
    })();

    // Without a parseable date there is no due date to be overdue against, so an
    // unpaid installment is `DUE` rather than a guessed `OVERDUE`.
    let status: InstallmentStatus;
    if (isPaid) {
      status = 'PAID';
    } else if (dueDate && new Date(`${dueDate}T00:00:00Z`) < today) {
      status = 'OVERDUE';
    } else {
      status = 'DUE';
    }

    installments.push({
      id: `${contract.id}-${number}`,
      contractId: contract.id,
      number,
      amount: each,
      paidAmount: isPaid ? each : 0,
      status,
      dueDate: dueDate ?? '',
      paidAt: isPaid ? paidAtFor(number, nextDue) : null,
    });
  }

  const remaining = installments.filter((i) => i.status !== 'PAID');
  const next = remaining[0] ?? null;

  return {
    contractId: contract.id,
    status: contractStatus(contract),
    totalPrice: Number(contract.total_price),
    downPayment: Number(contract.down_payment),
    paidAmount: Number(contract.paid_amount),
    remainingAmount: Number(contract.remaining_amount),
    installmentAmount: each,
    totalInstallments: total,
    paidInstallments: paidCount,
    remainingInstallments: remaining.length,
    nextDueDate: next?.dueDate || null,
    nextInstallmentId: next?.id ?? null,
    currency: 'BDT',
    installments,
    scheduleSource: 'derived',
    scheduleNote:
      'Due dates for this plan are calculated from the contract, one month apart. Only the next due date is recorded by the shop.',
  };
}
