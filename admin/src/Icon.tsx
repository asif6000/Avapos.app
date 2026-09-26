import type { ReactNode } from 'react';

/**
 * The panel's icons.
 *
 * Inline SVG rather than an icon package: eleven glyphs do not justify a
 * dependency, and `currentColor` means an icon never needs to know what colour it
 * is sitting on.
 */

interface IconProps {
  name: IconName;
  size?: number;
}

export type IconName =
  | 'dashboard'
  | 'customers'
  | 'payments'
  | 'devices'
  | 'tickets'
  | 'notifications'
  | 'audit'
  | 'menu'
  | 'close';

const PATHS: Record<IconName, string> = {
  // A grid of four: the overview.
  dashboard: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z',
  // Two people.
  customers:
    'M8 11a3 3 0 100-6 3 3 0 000 6zm-6 8a6 6 0 0112 0H2zm13.5-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm.5 2.5a5 5 0 014 4H21a6 6 0 00-1-3.5 2.5 2.5 0 00-4.9-.5z',
  // A card, for money.
  payments:
    'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm2 0v2h14V7H5zm2 9h4v-2H7v2z',
  // A phone.
  devices: 'M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zm0 2v16h8V4H8zm3 14h2v1h-2v-1z',
  // A conversation.
  tickets:
    'M4 4h16a1 1 0 011 1v10a1 1 0 01-1 1h-9l-5 4V16H4a1 1 0 01-1-1V5a1 1 0 011-1zm2 4v2h12V8H6zm0 4v2h8v-2H6z',
  // A bell.
  notifications:
    'M12 3a5 5 0 00-5 5v4l-2 3v1h14v-1l-2-3V8a5 5 0 00-5-5zm-2 16a2 2 0 004 0h-4z',
  // A shield, for the trail.
  audit:
    'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3zm-1 12l5-5-1.4-1.4L11 11.2 9.4 9.6 8 11l3 3z',
  menu: 'M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z',
  close: 'M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 5z',
};

export function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg
      className="navIcon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function MenuButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className="navItem" style={{ width: 44, padding: 0, justifyContent: 'center' }} onClick={onClick} aria-label={label} aria-expanded={false}>
      <Icon name="menu" size={20} />
    </button>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="pageHead">
      <div>
        <h1 className="pageTitle">{title}</h1>
        <p className="pageSub">{sub}</p>
      </div>
      {action}
    </div>
  );
}
