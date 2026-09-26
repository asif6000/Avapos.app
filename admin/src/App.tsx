import { useState } from 'react';

import { Audit, CustomerDetailView, Customers, Dashboard, Devices, Notifications, Payments, Tickets } from './screens/panels';
import { SignIn } from './screens/SignIn';
import { tokens, useSessionValue } from './ui';

/**
 * The panel.
 *
 * A single page with a rail, because this is used on a laptop at a counter and on
 * a phone in a shop, and both have to be quick. The rail collapses to a horizontal
 * strip on a narrow screen rather than disappearing behind a menu nobody opens.
 *
 * The session gate is the important part: nothing below this renders until the
 * *server* has confirmed the signed-in person is staff. A panel that renders its
 * screens and asks permission afterwards is a panel that shows data first.
 */

type Tab = 'dashboard' | 'customers' | 'payments' | 'devices' | 'tickets' | 'notifications' | 'audit';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customers', label: 'Customers' },
  { id: 'payments', label: 'Payments' },
  { id: 'devices', label: 'Devices' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'audit', label: 'Audit' },
];

export function App() {
  const { identity, checking, signOut } = useSessionValue();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [customerId, setCustomerId] = useState<string | null>(null);

  if (checking) {
    return (
      <div style={styles.centre}>
        <p style={styles.muted}>Checking your access…</p>
      </div>
    );
  }

  if (!identity) return <SignIn />;

  const openCustomer = (id: string) => {
    setCustomerId(id);
    setTab('customers');
  };

  return (
    <div className="shell">
      <header className="bar" style={styles.bar}>
        <div style={styles.brand}>
          <span style={styles.mark}>Customer</span>
          <span style={styles.brandName}>Admin</span>
        </div>
        <div style={styles.who}>
          <span style={styles.email}>{identity.email}</span>
          <button style={styles.signOut} onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="rail" style={styles.rail}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            style={tab === entry.id && !customerId ? styles.railActive : styles.railItem}
            onClick={() => {
              setTab(entry.id);
              setCustomerId(null);
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <main className="main" style={styles.main}>
        {customerId ? (
          <CustomerDetailView id={customerId} onBack={() => setCustomerId(null)} />
        ) : tab === 'dashboard' ? (
          <Dashboard onOpen={openCustomer} />
        ) : tab === 'customers' ? (
          <Customers onOpen={openCustomer} />
        ) : tab === 'payments' ? (
          <Payments />
        ) : tab === 'devices' ? (
          <Devices />
        ) : tab === 'tickets' ? (
          <Tickets />
        ) : tab === 'notifications' ? (
          <Notifications onOpen={openCustomer} />
        ) : (
          <Audit />
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  centre: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: { background: tokens.surface, borderBottomColor: tokens.line },
  brand: { display: 'flex', alignItems: 'baseline', gap: 8 },
  mark: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: tokens.green, fontWeight: 700 },
  brandName: { fontSize: 18, fontWeight: 800, color: tokens.ink, letterSpacing: -0.3 },
  who: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  email: { fontSize: 13, color: tokens.muted },
  signOut: {
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
  rail: { background: tokens.surface, borderBottomColor: tokens.line },
  railItem: {
    height: 44,
    padding: '0 14px',
    borderRadius: 999,
    border: `1px solid ${tokens.line}`,
    background: tokens.surface,
    color: tokens.inkSoft,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  muted: { color: tokens.muted },
};
