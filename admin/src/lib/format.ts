/**
 * Money, dates and states, formatted once.
 *
 * The panel is read by staff on a counter, often in a hurry, so the formatting
 * here is deliberately unambiguous: a number of taka with thousands separators,
 * a date a human can read, and a state in plain words.
 */

const taka = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function money(amount: number | null | undefined): string {
  return `৳${taka.format(Number(amount ?? 0))}`;
}

export function date(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Plain words for a device state. A dot colour is an addition, not the message. */
export function deviceStateLabel(state: string): string {
  return (
    {
      ACTIVE: 'Active',
      PAYMENT_DUE: 'Payment due',
      GRACE_PERIOD: 'Grace period',
      RESTRICTED: 'Restricted',
      UNLOCKED: 'Unlocked',
      SUSPENDED: 'Suspended',
    }[state] ?? state
  );
}

export function paymentStateLabel(status: string): string {
  return (
    { SUCCESS: 'Paid', PENDING: 'Pending', FAILED: 'Failed', REFUNDED: 'Refunded' }[status] ?? status
  );
}

export function ticketStateLabel(status: string): string {
  return { OPEN: 'Open', RESOLVED: 'Resolved', CLOSED: 'Closed' }[status] ?? status;
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date(value);
}
