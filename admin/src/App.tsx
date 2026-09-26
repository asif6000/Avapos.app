import { useEffect, useState } from 'react';

import { Icon, MenuButton, PageHead, type IconName } from './Icon';
import {
  Audit,
  CustomerDetailView,
  Customers,
  Dashboard,
  DeviceDetailView,
  Devices,
  Notifications,
  Payments,
  Tickets,
} from './screens/panels';
import { SignIn } from './screens/SignIn';
import { tokens, useSessionValue } from './ui';

/**
 * The panel.
 *
 * One navigation, two shapes: a permanent sidebar on a desk, a drawer in a hand.
 * Both list everything, grouped by what a person is actually doing — looking at
 * people, looking at money, doing something, and checking the record.
 *
 * The session gate is the important part. Nothing below this renders until the
 * *server* has confirmed the signed-in person is staff. A panel that draws its
 * screens and asks permission afterwards is a panel that shows data first.
 */

type Tab = 'dashboard' | 'customers' | 'payments' | 'devices' | 'tickets' | 'notifications' | 'audit';

const GROUPS: { label: string; items: { id: Tab; label: string; icon: IconName }[] }[] = [
  { label: 'Overview', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard' }] },
  {
    label: 'People',
    items: [
      { id: 'customers', label: 'Customers', icon: 'customers' },
      { id: 'devices', label: 'Devices', icon: 'devices' },
    ],
  },
  { label: 'Money', items: [{ id: 'payments', label: 'Payments', icon: 'payments' }] },
  {
    label: 'Work',
    items: [
      { id: 'tickets', label: 'Tickets', icon: 'tickets' },
      { id: 'notifications', label: 'Notifications', icon: 'notifications' },
    ],
  },
  { label: 'Record', items: [{ id: 'audit', label: 'Audit', icon: 'audit' }] },
];

/** Every section, in one place, for the tests that count them. */
export const SECTIONS = GROUPS.flatMap((group) => group.items);

export function App() {
  const { identity, checking, signOut } = useSessionValue();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  // A desk has a sidebar and needs no drawer; opening one there would be a
  // sidebar behind a sidebar.
  useEffect(() => {
    if (window.matchMedia('(min-width: 900px)').matches) setDrawer(false);
  }, []);

  useEffect(() => {
    if (!drawer) return;
    // Escape closes it, and the page behind must not scroll away underneath.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [drawer]);

  if (checking) {
    return (
      <div className="shell" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: tokens.muted }}>Checking your access…</p>
      </div>
    );
  }

  if (!identity) return <SignIn />;

  const active = tab === 'customers' && customerId ? 'customers' : tab;

  const go = (next: Tab) => {
    setTab(next);
    setCustomerId(null);
    setDeviceId(null);
    setDrawer(false);
  };

  const openCustomer = (id: string) => {
    setCustomerId(id);
    setDeviceId(null);
    setTab('customers');
    setDrawer(false);
  };

  /**
   * Opening a phone from anywhere — the list, a customer's page, a payment — lands
   * on the same screen, because there is one of those decisions in this panel and
   * it should have one address.
   */
  const openDevice = (id: string) => {
    setDeviceId(id);
    setCustomerId(null);
    setTab('devices');
    setDrawer(false);
  };

  const nav = (inDrawer: boolean) => (
    <>
      {GROUPS.map((group) => (
        <div className="drawerGroup" key={group.label}>
          {inDrawer ? <div className="drawerGroupLabel">{group.label}</div> : null}
          {group.items.map((item) => (
            <button
              key={item.id}
              className={active === item.id ? 'navItem navItemActive' : 'navItem'}
              onClick={() => go(item.id)}
              aria-current={active === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <div className="shell">
      <header className="bar" style={styles.bar}>
        <div className="barLeft">
          {drawer ? null : (
            <span className="menuOnly">
              <MenuButton onClick={() => setDrawer(true)} label="Open menu" />
            </span>
          )}
          <div style={styles.brand}>
            <span style={styles.mark}>Customer</span>
            <span style={styles.brandName}>Admin</span>
          </div>
        </div>
      </header>

      {/* The desk's sidebar: the same list, permanently in place. */}
      <nav className="rail" style={styles.rail} aria-label="Sections">
        {nav(false)}
        <div className="menuFoot">
          <span style={styles.email}>{identity.email}</span>
          <button style={styles.signOut} onClick={signOut}>
            Sign out
          </button>
        </div>
      </nav>

      {drawer ? (
        <>
          <button className="drawerOverlay" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Sections">
            <div className="drawerHead">
              <div style={styles.brand}>
                <span style={styles.mark}>Customer</span>
                <span style={styles.brandName}>Admin</span>
              </div>
              <button
                className="navItem"
                style={{ width: 44, padding: 0, justifyContent: 'center' }}
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            {nav(true)}
            <div className="menuFoot">
              <span style={styles.email}>{identity.email}</span>
              <button style={styles.signOut} onClick={signOut}>
                Sign out
              </button>
            </div>
          </aside>
        </>
      ) : null}

      <main className="main" style={styles.main}>
        {deviceId ? (
          <DeviceDetailView id={deviceId} onBack={() => setDeviceId(null)} />
        ) : customerId ? (
          <CustomerDetailView id={customerId} onBack={() => setCustomerId(null)} />
        ) : tab === 'dashboard' ? (
          <>
            <PageHead title="Dashboard" sub="Who owes what, right now. Every figure is the server's own record, not a total this page worked out." />
            <Dashboard onOpen={openCustomer} />
          </>
        ) : tab === 'customers' ? (
          <>
            <PageHead title="Customers" sub="One row is one person's contract. Open one to see the device, the schedule and the payments together." />
            <Customers onOpen={openCustomer} />
          </>
        ) : tab === 'payments' ? (
          <>
            <PageHead title="Payments" sub="Every attempt at taking money, and what the gateway said about it." />
            <Payments />
          </>
        ) : tab === 'devices' ? (
          <>
            <PageHead title="Devices" sub="What Android reports about each phone, and what can be asked of it. Open one to act; every action needs a reason." />
            <Devices onOpen={openDevice} />
          </>
        ) : tab === 'tickets' ? (
          <>
            <PageHead title="Tickets" sub="What customers asked, and what you told them. A reply appears in their app." />
            <Tickets />
          </>
        ) : tab === 'notifications' ? (
          <>
            <PageHead title="Notifications" sub="A message to one named customer, sent to one phone. There is no send-to-everyone here." />
            <Notifications onOpen={openCustomer} />
          </>
        ) : (
          <>
            <PageHead title="Audit" sub="Who did what, and the reason they gave." />
            <Audit />
          </>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: { background: tokens.surface, borderBottomColor: tokens.line },
  brand: { display: 'flex', alignItems: 'baseline', gap: 8 },
  mark: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: tokens.green, fontWeight: 700 },
  brandName: { fontSize: 18, fontWeight: 800, color: tokens.ink, letterSpacing: -0.3 },
  email: { fontSize: 13, color: tokens.muted },
  signOut: {
    height: 44,
    padding: '0 16px',
    borderRadius: 999,
    border: `1px solid ${tokens.line}`,
    background: tokens.canvas,
    color: tokens.ink,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  rail: { background: tokens.surface, borderRightColor: tokens.line },
  main: { paddingBottom: 40 },
};
