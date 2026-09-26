import { useMemo, useState, type ReactNode } from 'react';

import { deviceStateLabel, money, relativeTime, ticketStateLabel } from '../lib/format';
import { api, cardStyle, tokens, useResource, useSessionValue } from '../ui';
import type { CustomerSummary, PaymentRecord } from '../lib/api';

/* ----------------------------------------------------------------- primitives */

export function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warn' | 'danger' | 'ok';
}) {
  const colour =
    tone === 'warn' ? tokens.warn : tone === 'danger' ? tokens.danger : tone === 'ok' ? tokens.green : tokens.ink;
  return (
    <div style={{ ...cardStyle, ...styles.stat }}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, color: colour }}>{value}</span>
    </div>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  const palette = {
    ok: { background: tokens.greenSoft, colour: tokens.greenDark },
    warn: { background: tokens.warnSoft, colour: tokens.warn },
    danger: { background: tokens.dangerSoft, colour: tokens.danger },
    neutral: { background: tokens.canvas, colour: tokens.inkSoft },
  }[tone];
  return (
    <span style={{ ...styles.pill, background: palette.background, color: palette.colour }}>{label}</span>
  );
}

/**
 * A table cell that knows what it is.
 *
 * On a desk the header row says it; on a phone the header row is hidden and the
 * table becomes a stack of cards, so the label has to travel with the value —
 * otherwise the card is a list of numbers with nothing to attach them to.
 */
export function Cell({
  label,
  muted = false,
  children,
}: {
  label: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <td data-label={label} style={muted ? styles.tdMuted : styles.td}>
      {children}
    </td>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} style={styles.th}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * A placeholder that looks like the thing it is standing in for: bars where
 * numbers are, blocks where rows are. The word "Loading…" tells an agent nothing
 * and makes the page jump when the data arrives.
 */
export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div style={styles.skeletonWrap} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton" style={{ height: 46, opacity: 1 - index * 0.12 }} />
      ))}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {body ? <span>{body}</span> : null}
    </div>
  );
}

export function Failure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={styles.failure}>
      <p style={{ margin: 0 }}>{message}</p>
      {onRetry ? (
        <button style={styles.smallButton} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ dashboard */

export function Dashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, loading, error, reload } = useResource(() => api.dashboard());

  if (loading) return <Loading />;
  if (error) return <Failure message={error} onRetry={() => void reload()} />;
  if (!data) return null;

  return (
    <div style={styles.stack}>
      <div style={styles.statRow}>
        <Stat label="Customers" value={String(data.customers)} />
        <Stat label="Outstanding" value={money(data.outstandingAmount)} tone="warn" />
        <Stat label="Restricted devices" value={String(data.restrictedDevices)} tone="danger" />
        <Stat label="Open tickets" value={String(data.openTickets)} />
        <Stat label="Pending payments" value={String(data.pendingPayments)} />
      </div>

      <section style={cardStyle}>
        <h2 style={styles.h2}>Latest payments</h2>
        {data.recentPayments.length === 0 ? (
          <Empty title="No payments yet" body="Nothing has been attempted for a customer." />
        ) : (
          <Table head={['Reference', 'Customer', 'Amount', 'Status', 'When']}>
            {data.recentPayments.map((payment) => (
              <tr key={payment.id}>
                <Cell label="Reference">
                  <button style={styles.link} onClick={() => onOpen(payment.customerKey)}>
                    {payment.id}
                  </button>
                </Cell>
                <Cell label="Customer">{payment.customerKey}</Cell>
                <Cell label="Amount">{money(payment.amount)}</Cell>
                <Cell label="Status">
                  <Pill
                    label={payment.status}
                    tone={payment.status === 'SUCCESS' ? 'ok' : payment.status === 'PENDING' ? 'warn' : 'danger'}
                  />
                </Cell>
                <Cell label="When" muted>{relativeTime(payment.paidAt ?? payment.createdAt)}</Cell>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={styles.h2}>Devices by state</h2>
        <div style={styles.chips}>
          {Object.entries(data.deviceStates).map(([state, total]) => (
            <Pill key={state} label={`${deviceStateLabel(state)} · ${total}`} />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ customers */

export function Customers({ onOpen }: { onOpen: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useResource(
    () => api.customers(search),
    [search],
  );

  return (
    <div style={styles.stack}>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name, email, phone or customer id"
        style={styles.search}
      />

      {loading ? <Loading /> : null}
      {error ? <Failure message={error} onRetry={() => void reload()} /> : null}
      {data ? (
        <section style={cardStyle}>
          <h2 style={styles.h2}>
            {data.total} customer{data.total === 1 ? '' : 's'}
          </h2>
          <Table head={['Customer', 'Contact', 'Enrolled', 'Action']}>
            {data.items.map((customer) => (
              <tr key={customer.id}>
                <Cell label="Customer">
                  <strong>{customer.fullName}</strong>
                  <div style={styles.tdMuted}>{customer.id}</div>
                </Cell>
                <Cell label="Contact">
                  <div>{customer.email}</div>
                  <div style={styles.tdMuted}>{customer.phone}</div>
                </Cell>
                <Cell label="Enrolled">
                  <Pill label={customer.enrolled ? 'Enrolled' : 'Not enrolled'} tone={customer.enrolled ? 'ok' : 'neutral'} />
                </Cell>
                <Cell label="Action">
                  <button style={styles.smallButton} onClick={() => onOpen(customer.id)}>
                    Open
                  </button>
                </Cell>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
    </div>
  );
}

export function CustomerDetailView({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const { data, loading, error, reload } = useResource(() => api.customer(id), [id]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <Failure message={error} onRetry={() => void reload()} />;
  if (!data) return null;

  const { customer, device, installments, payments, tickets, totals } = data;

  const setDeviceState = async (state: string) => {
    if (note.trim().length < 4) {
      setMessage('A reason is required, and it is kept with your name.');
      return;
    }
    setBusy(state);
    setMessage(null);
    try {
      await api.setDeviceState(device?.id ?? '', state, note.trim());
      setMessage(`Device is now ${deviceStateLabel(state).toLowerCase()}.`);
      setNote('');
      reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const reverify = async (payment: PaymentRecord) => {
    setBusy(payment.id);
    setMessage(null);
    try {
      const result = await api.reverifyPayment(payment.id, 'Asked the gateway again');
      setMessage(result.message);
      reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={styles.stack}>
      <button style={styles.link} onClick={onBack}>
        ← All customers
      </button>

      <section style={cardStyle}>
        <h2 style={styles.h2}>{customer.fullName}</h2>
        <div style={styles.detailGrid}>
          <span style={styles.muted}>Customer id</span>
          <span>{customer.id}</span>
          <span style={styles.muted}>Email</span>
          <span>{customer.email}</span>
          <span style={styles.muted}>Phone</span>
          <span>{customer.phone}</span>
          <span style={styles.muted}>Enrolled</span>
          <span>{customer.enrolled ? 'Yes' : 'No'}</span>
        </div>
      </section>

      <div style={styles.statRow}>
        <Stat label="Total price" value={money(totals.totalPrice)} />
        <Stat label="Paid" value={money(totals.paidAmount)} tone="ok" />
        <Stat label="Outstanding" value={money(totals.outstandingAmount)} tone="warn" />
        <Stat
          label="Installments"
          value={`${totals.paidInstallments} / ${totals.totalInstallments}`}
        />
      </div>

      {device ? (
        <section style={cardStyle}>
          <div style={styles.sectionHead}>
            <h2 style={styles.h2}>Device</h2>
            <Pill
              label={deviceStateLabel(device.state)}
              tone={
                device.state === 'RESTRICTED' || device.state === 'SUSPENDED'
                  ? 'danger'
                  : device.state === 'ACTIVE' || device.state === 'UNLOCKED'
                    ? 'ok'
                    : 'warn'
              }
            />
          </div>
          <div style={styles.detailGrid}>
            <span style={styles.muted}>Phone</span>
            <span>
              {device.manufacturer} {device.model}
            </span>
            <span style={styles.muted}>Android</span>
            <span>{device.androidVersion}</span>
            <span style={styles.muted}>Enrollment</span>
            <span>{device.enrollmentStatus}</span>
            <span style={styles.muted}>Last sync</span>
            <span>{relativeTime(device.lastSyncAt)}</span>
          </div>

          <div style={styles.actionBox}>
            <p style={styles.actionNote}>
              Changing a device state is a real decision about a customer's phone. Say why, and it is
              kept with your name.
            </p>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Reason (required)"
              style={styles.search}
            />
            <div style={styles.buttonRow}>
              <button style={styles.primarySmall} disabled={busy !== null} onClick={() => void setDeviceState('UNLOCKED')}>
                Release the device
              </button>
              <button style={styles.dangerSmall} disabled={busy !== null} onClick={() => void setDeviceState('RESTRICTED')}>
                Mark restricted
              </button>
            </div>
            {message ? <p style={styles.actionMessage}>{message}</p> : null}
          </div>
        </section>
      ) : null}

      <section style={cardStyle}>
        <h2 style={styles.h2}>Installments</h2>
        <Table head={['#', 'Amount', 'Paid', 'Status', 'Due']}>
          {installments.map((installment) => (
            <tr key={installment.id}>
              <Cell label="#">{installment.number}</Cell>
              <Cell label="Amount">{money(installment.amount)}</Cell>
              <Cell label="Paid">{money(installment.paidAmount)}</Cell>
              <Cell label="Status">
                <Pill label={installment.status} tone={installment.status === 'PAID' ? 'ok' : 'warn'} />
              </Cell>
              <Cell label="Due" muted>{installment.dueDate ?? '—'}</Cell>
            </tr>
          ))}
        </Table>
      </section>

      <section style={cardStyle}>
        <h2 style={styles.h2}>Payments</h2>
        <Table head={['Reference', 'Amount', 'Status', 'Gateway ref', 'Action']}>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <Cell label="Reference">{payment.id}</Cell>
              <Cell label="Amount">{money(payment.amount)}</Cell>
              <Cell label="Status">
                <Pill
                  label={payment.status}
                  tone={payment.status === 'SUCCESS' ? 'ok' : payment.status === 'PENDING' ? 'warn' : 'danger'}
                />
              </Cell>
              <Cell label="Gateway ref" muted>{payment.gatewayReference ?? '—'}</Cell>
              <Cell label="Action">
                {payment.status === 'PENDING' ? (
                  <button style={styles.smallButton} disabled={busy === payment.id} onClick={() => void reverify(payment)}>
                    Ask the gateway
                  </button>
                ) : null}
              </Cell>
            </tr>
          ))}
        </Table>
        <p style={styles.actionNote}>
          "Ask the gateway" is not a way to mark a payment paid. It asks UddoktaPay what happened and
          records the answer; if the gateway has not confirmed it, nothing moves.
        </p>
      </section>

      <section style={cardStyle}>
        <h2 style={styles.h2}>Tickets</h2>
        {tickets.length === 0 ? (
          <Empty title="No tickets" body="Nobody has asked anything yet." />
        ) : (
          tickets.map((ticket) => (
            <div key={ticket.id} style={styles.ticket}>
              <div style={styles.sectionHead}>
                <strong>{ticket.subject}</strong>
                <Pill label={ticketStateLabel(ticket.status)} tone={ticket.status === 'OPEN' ? 'warn' : 'ok'} />
              </div>
              <p style={styles.ticketBody}>{ticket.message}</p>
              {ticket.response ? <p style={styles.ticketReply}>You wrote: {ticket.response}</p> : null}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------- payments */

export function Payments() {
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useResource(() => api.payments(status), [status]);
  const totals = useMemo(
    () => (data?.items ?? []).reduce((sum, payment) => sum + payment.amount, 0),
    [data],
  );

  return (
    <div style={styles.stack}>
      <div style={styles.buttonRow}>
        {['', 'PENDING', 'SUCCESS', 'FAILED'].map((value) => (
          <button
            key={value || 'all'}
            style={status === value ? styles.filterActive : styles.filter}
            onClick={() => setStatus(value)}
          >
            {value || 'All'}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : null}
      {error ? <Failure message={error} onRetry={() => void reload()} /> : null}
      {data ? (
        <section style={cardStyle}>
          <h2 style={styles.h2}>
            {data.items.length} payment{data.items.length === 1 ? '' : 's'} · {money(totals)}
          </h2>
          <Table head={['Reference', 'Customer', 'Installment', 'Amount', 'Status']}>
            {data.items.map((payment) => (
              <tr key={payment.id}>
                <Cell label="Reference">{payment.id}</Cell>
                <Cell label="Customer">{payment.customerKey}</Cell>
                <Cell label="Installment">{payment.installmentNumber}</Cell>
                <Cell label="Amount">{money(payment.amount)}</Cell>
                <Cell label="Status">
                  <Pill
                    label={payment.status}
                    tone={payment.status === 'SUCCESS' ? 'ok' : payment.status === 'PENDING' ? 'warn' : 'danger'}
                  />
                </Cell>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- devices */

export function Devices() {
  const [state, setState] = useState('');
  const { data, loading, error, reload } = useResource(() => api.devices(state), [state]);

  return (
    <div style={styles.stack}>
      <div style={styles.buttonRow}>
        {['', 'ACTIVE', 'PAYMENT_DUE', 'RESTRICTED', 'UNLOCKED'].map((value) => (
          <button
            key={value || 'all'}
            style={state === value ? styles.filterActive : styles.filter}
            onClick={() => setState(value)}
          >
            {value ? deviceStateLabel(value) : 'All'}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : null}
      {error ? <Failure message={error} onRetry={() => void reload()} /> : null}
      {data ? (
        <section style={cardStyle}>
          <Table head={['Device', 'Customer', 'State', 'Enrollment', 'Last sync']}>
            {data.items.map((device) => (
              <tr key={device.id}>
                <Cell label="Device">
                  <strong>{device.name}</strong>
                  <div style={styles.tdMuted}>{device.androidVersion}</div>
                </Cell>
                <Cell label="Customer">{device.customerKey}</Cell>
                <Cell label="State">
                  <Pill
                    label={deviceStateLabel(device.state)}
                    tone={
                      device.state === 'RESTRICTED' || device.state === 'SUSPENDED'
                        ? 'danger'
                        : device.state === 'ACTIVE' || device.state === 'UNLOCKED'
                          ? 'ok'
                          : 'warn'
                    }
                  />
                </Cell>
                <Cell label="Enrollment" muted>{device.enrollmentStatus}</Cell>
                <Cell label="Last sync" muted>{relativeTime(device.lastSyncAt)}</Cell>
              </tr>
            ))}
          </Table>
          <p style={styles.actionNote}>
            Device state is changed from a customer's page, where a reason is required. Nothing here
            can lock or unlock anything.
          </p>
        </section>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- tickets */

export function Tickets() {
  const { data, loading, error, reload } = useResource(() => api.tickets());
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reply = async (id: string) => {
    const text = (replies[id] ?? '').trim();
    if (text.length < 2) return;
    setBusy(id);
    setMessage(null);
    try {
      await api.replyToTicket(id, text);
      setMessage('Reply sent. The customer sees it in their app.');
      setReplies((previous) => ({ ...previous, [id]: '' }));
      reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={styles.stack}>
      {loading ? <Loading /> : null}
      {error ? <Failure message={error} onRetry={() => void reload()} /> : null}
      {message ? <p style={styles.actionMessage}>{message}</p> : null}
      {data?.items.map((ticket) => (
        <section key={ticket.id} style={cardStyle}>
          <div style={styles.sectionHead}>
            <div>
              <h2 style={{ ...styles.h2, margin: 0 }}>{ticket.subject}</h2>
              <p style={styles.tdMuted}>
                {ticket.customerKey} · {ticket.category} · {relativeTime(ticket.createdAt)}
              </p>
            </div>
            <Pill label={ticketStateLabel(ticket.status)} tone={ticket.status === 'OPEN' ? 'warn' : 'ok'} />
          </div>
          <p style={styles.ticketBody}>{ticket.message}</p>
          {ticket.response ? <p style={styles.ticketReply}>Answered: {ticket.response}</p> : null}
          <div style={styles.buttonRow}>
            <input
              value={replies[ticket.id] ?? ''}
              onChange={(event) => setReplies((previous) => ({ ...previous, [ticket.id]: event.target.value }))}
              placeholder="Write a reply to the customer"
              style={{ ...styles.search, flex: 1, minWidth: 240, margin: 0 }}
            />
            <button style={styles.primarySmall} disabled={busy === ticket.id} onClick={() => void reply(ticket.id)}>
              Send
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- notifications */

export function Notifications({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, loading, error, reload } = useResource(() => api.notifications());
  const [form, setForm] = useState({ customerKey: '', title: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.sendNotification({ ...form, type: 'GENERAL' });
      setMessage('Sent. It appears in that customer\'s notifications.');
      setForm({ customerKey: '', title: '', message: '' });
      reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.stack}>
      <section style={cardStyle}>
        <h2 style={styles.h2}>Send a notification</h2>
        <p style={styles.actionNote}>
          To one named customer. There is no "send to everyone" here on purpose: an unbidden
          message on somebody's phone is how a support note becomes a complaint.
        </p>
        <div style={styles.detailGrid}>
          <input
            value={form.customerKey}
            onChange={(event) => setForm({ ...form, customerKey: event.target.value })}
            placeholder="Customer id (CUST-…)"
            style={styles.search}
          />
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Title"
            style={styles.search}
          />
          <textarea
            value={form.message}
            onChange={(event) => setForm({ ...form, message: event.target.value })}
            placeholder="Message"
            rows={3}
            style={{ ...styles.search, resize: 'vertical' }}
          />
        </div>
        <button style={styles.primarySmall} disabled={busy} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send'}
        </button>
        {message ? <p style={styles.actionMessage}>{message}</p> : null}
      </section>

      {loading ? <Loading /> : null}
      {error ? <Failure message={error} onRetry={() => void reload()} /> : null}
      {data ? (
        <section style={cardStyle}>
          <h2 style={styles.h2}>Recent notifications</h2>
          <Table head={['Customer', 'Title', 'Message', 'Read', 'When']}>
            {data.items.map((notification) => (
              <tr key={notification.id}>
                <Cell label="Customer">
                  <button style={styles.link} onClick={() => onOpen(notification.customerKey)}>
                    {notification.customerKey}
                  </button>
                </Cell>
                <Cell label="Title">{notification.title}</Cell>
                <Cell label="Message" muted>{notification.message}</Cell>
                <Cell label="Read">{notification.isRead ? 'Read' : 'New'}</Cell>
                <Cell label="When" muted>{relativeTime(notification.createdAt)}</Cell>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------- audit */

export function Audit() {
  const { data, loading, error, reload } = useResource(() => api.audit());

  return (
    <div style={styles.stack}>
      <p style={styles.actionNote}>
        Who did what, and why. An action with no record of who took it is indistinguishable from a bug.
      </p>
      {loading ? <Loading /> : null}
      {error ? <Failure message={error} onRetry={() => void reload()} /> : null}
      {data ? (
        <section style={cardStyle}>
          <Table head={['When', 'Who', 'Action', 'Subject', 'Reason']}>
            {data.items.map((entry) => (
              <tr key={entry.id}>
                <Cell label="When" muted>{relativeTime(entry.createdAt)}</Cell>
                <Cell label="Who">{entry.adminEmail}</Cell>
                <Cell label="Action">{entry.action}</Cell>
                <Cell label="Subject">{entry.subject}</Cell>
                <Cell label="Reason" muted>{entry.reason ?? '—'}</Cell>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
    </div>
  );
}

export function CustomerPill({ customer }: { customer: CustomerSummary }) {
  return <Pill label={customer.fullName} />;
}

export function useAdminEmail() {
  const { identity } = useSessionValue();
  return identity?.email ?? '';
}

const styles: Record<string, React.CSSProperties> = {
  stack: { display: 'grid', gap: 16 },
  statRow: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' },
  stat: { display: 'grid', gap: 4 },
  statLabel: { fontSize: 12, color: tokens.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue: { fontSize: 24, fontWeight: 700, letterSpacing: -0.4 },
  h2: { margin: '0 0 10px', fontSize: 16, color: tokens.ink, letterSpacing: -0.2 },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  pill: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 520 },
  th: {
    textAlign: 'left',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: tokens.muted,
    padding: '8px 10px',
    borderBottom: `1px solid ${tokens.line}`,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '11px 10px',
    borderBottom: `1px solid ${tokens.line}`,
    fontSize: 14,
    color: tokens.ink,
    verticalAlign: 'top',
    fontVariantNumeric: 'tabular-nums',
  },
  tdMuted: { padding: '10px', borderBottom: `1px solid ${tokens.line}`, fontSize: 13, color: tokens.muted },
  muted: { color: tokens.muted, fontSize: 14 },
  skeletonWrap: { display: 'grid', gap: 8, padding: '4px 0' },
  failure: {
    display: 'grid',
    gap: 10,
    justifyItems: 'start',
    padding: 14,
    borderRadius: 12,
    background: tokens.dangerSoft,
    color: tokens.danger,
  },
  search: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 15,
    borderRadius: 12,
    border: `1px solid ${tokens.line}`,
    background: tokens.surface,
    color: tokens.ink,
  },
  smallButton: {
    height: 44,
    padding: '0 14px',
    borderRadius: 999,
    border: `1px solid ${tokens.line}`,
    background: tokens.canvas,
    color: tokens.ink,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  primarySmall: {
    height: 44,
    padding: '0 16px',
    borderRadius: 999,
    border: 0,
    background: tokens.green,
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  dangerSmall: {
    height: 44,
    padding: '0 16px',
    borderRadius: 999,
    border: 0,
    background: tokens.dangerSoft,
    color: tokens.danger,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  filter: {
    height: 44,
    padding: '0 14px',
    borderRadius: 999,
    border: `1px solid ${tokens.line}`,
    background: tokens.surface,
    color: tokens.inkSoft,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterActive: {
    height: 44,
    padding: '0 14px',
    borderRadius: 999,
    border: 0,
    background: tokens.green,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  buttonRow: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  link: {
    background: 'none',
    border: 0,
    padding: 0,
    color: tokens.green,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'left',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(110px, auto) 1fr',
    gap: '6px 16px',
    fontSize: 14,
    marginBottom: 10,
  },
  actionBox: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    background: tokens.canvas,
    display: 'grid',
    gap: 10,
  },
  actionNote: { margin: 0, fontSize: 13, color: tokens.muted, lineHeight: 1.5 },
  actionMessage: { margin: 0, fontSize: 14, color: tokens.greenDark, fontWeight: 600 },
  ticket: { padding: '12px 0', borderTop: `1px solid ${tokens.line}` },
  ticketBody: { margin: '0 0 6px', fontSize: 14, color: tokens.inkSoft, lineHeight: 1.5 },
  ticketReply: { margin: 0, fontSize: 13, color: tokens.greenDark },
};
