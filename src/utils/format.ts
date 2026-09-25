import type { Translator } from '@/i18n';
import type {
  DeviceState,
  EnrollmentStatus,
  InstallmentStatus,
  ManagementStatus,
  PaymentStatus,
  TicketStatus,
} from '@/types/domain';

export const CURRENCY = '৳';

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTHS_BN = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Bangladeshi digit grouping: the last three digits, then pairs.
 * 1250000 -> 12,50,000
 */
export function groupDigits(whole: string): string {
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = sign ? whole.slice(1) : whole;
  if (digits.length <= 3) return `${sign}${digits}`;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const groups = (rest.match(/.{1,2}/g) ?? []).join(',');
  return `${sign}${groups},${last3}`;
}

/** Bangladeshi Taka, e.g. `৳18,500`. Amounts are minor-unit free integers. */
export function formatCurrency(amount: number | null | undefined, options?: { compact?: boolean }): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return `${CURRENCY}0`;
  if (options?.compact && Math.abs(amount) >= 100_000) {
    const lakh = amount / 100_000;
    const rounded = Math.round(lakh * 10) / 10;
    return `${CURRENCY}${rounded} লক্ষ`;
  }
  const fixed = Math.round(amount * 100) / 100;
  const [whole = '0', fraction] = fixed.toFixed(2).split('.');
  const sign = fixed < 0 ? '-' : '';
  const fractionPart = fraction && fraction !== '00' ? `.${fraction}` : '';
  return `${sign}${CURRENCY}${groupDigits(whole)}${fractionPart}`;
}

export function formatDate(
  value: string | number | Date | null | undefined,
  language: 'en' | 'bn' = 'en',
): string {
  const date = toDate(value);
  if (!date) return '—';
  const months = language === 'bn' ? MONTHS_BN : MONTHS_EN;
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  language: 'en' | 'bn' = 'en',
): string {
  const date = toDate(value);
  if (!date) return '—';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date, language)}, ${hours}:${minutes}`;
}

/** "in 3 days" / "2 days ago" style copy for due dates. */
export function formatRelativeDue(
  value: string | number | Date | null | undefined,
  language: 'en' | 'bn' = 'en',
): string {
  const date = toDate(value);
  if (!date) return '—';
  const diffMs = date.getTime() - Date.now();
  const days = Math.round(diffMs / 86_400_000);
  if (days === 0) return language === 'bn' ? 'আজ' : 'Today';
  if (days === 1) return language === 'bn' ? 'আগামীকাল' : 'Tomorrow';
  if (days === -1) return language === 'bn' ? 'গতকাল' : 'Yesterday';
  if (days > 0) {
    return language === 'bn' ? `${days} দিন বাকি` : `in ${days} days`;
  }
  return language === 'bn' ? `${Math.abs(days)} দিন দেরি` : `${Math.abs(days)} days overdue`;
}

export function deviceStateLabel(
  state: DeviceState,
  t: Translator,
): string {
  return t(`states.${state}`);
}

export function enrollmentLabel(status: EnrollmentStatus, t: Translator): string {
  return t(`states.${status}`);
}

export function managementLabel(status: ManagementStatus, t: Translator): string {
  return t(`states.${status}`);
}

export function installmentStatusLabel(status: InstallmentStatus, t: Translator): string {
  return t(`installments.status.${status}`);
}

export function paymentStatusLabel(status: PaymentStatus, t: Translator): string {
  return t(`payments2.${status}`);
}

export function ticketStatusLabel(status: TicketStatus, t: Translator): string {
  return t(`support.${status.toLowerCase().replace('_', '') as 'open' | 'inProgress' | 'resolved' | 'closed'}`);
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 3)}******${phone.slice(-3)}`;
}

/** Normalizes +8801XXXXXXXXX / 01XXXXXXXXX to 8801XXXXXXXXX. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d]/g, '');
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0')) return `880${digits.slice(1)}`;
  return digits;
}

/** Lowercased and trimmed; the backend treats addresses case-insensitively. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isValidEmail(input: string): boolean {
  return EMAIL_REGEX.test(input.trim());
}

/** `name@example.com` -> `n***@example.com`, so a code screen leaks less. */
export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf('@');
  if (at <= 0) return normalized;
  const name = normalized.slice(0, at);
  const visible = name.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(1, name.length - 1))}${normalized.slice(at)}`;
}

/**
 * E.164 form, which is what Supabase Auth expects for a phone identity.
 * `01712345678` and `+880 1712-345678` both become `+8801712345678`, so one
 * number is always one account.
 */
export function toE164(input: string): string {
  const digits = input.replace(/[\s()-]/g, '');
  const bare = normalizePhone(digits);
  return `+${bare.replace(/^\+/, '')}`;
}

/** A password long enough to be worth anything, and not a dictionary word. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 8) problems.push('length');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) problems.push('case');
  if (!/\d/.test(password)) problems.push('digit');
  return problems;
}

export const BD_PHONE_REGEX = /^(?:\+?880|0)1[3-9]\d{8}$/;

export function isValidBdPhone(input: string): boolean {
  return BD_PHONE_REGEX.test(input.replace(/[\s-]/g, ''));
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function percentOf(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}
