/**
 * Talking to the API.
 *
 * Two rules, and both of them are why this file is short:
 *
 * 1. The panel holds **no credential of its own**. It signs in to Supabase with a
 *    staff member's own account and presents that session's JWT, exactly as the
 *    customer app does. The service-role key stays on the server, which is why
 *    this works while row-level security is still switched off — and why a
 *    stolen laptop with this page open reads nothing.
 *
 * 2. Every call asks the server who the caller is. The panel never decides it is
 *    an admin; `GET /admin/me` answers that, and a 403 means a signed-out state
 *    with a plain message, not a hidden tab.
 */

const SESSION_KEY = 'srabon.admin.session';

/**
 * The Supabase project this panel signs staff in against.
 *
 * `same-origin` resolves to the origin that served the page, which is what the
 * local mock needs: it publishes Supabase Auth on the same origin as the panel,
 * so the sign-in request is same-origin too. The real project is a different
 * host, so a production build sets the URL explicitly.
 *
 * The same idea as `resolveBase` in the customer app, and for the same reason —
 * one switch, and a phone on a tunnel or a LAN address needs no hard-coded host.
 */
function resolveSupabaseUrl(configured: string | undefined): string {
  if (!configured) return '';
  if (configured !== 'same-origin' && !configured.startsWith('same-origin/')) return configured;
  if (typeof window === 'undefined' || typeof window.location?.origin !== 'string') return '';
  return configured.replace('same-origin', window.location.origin);
}

const SUPABASE_URL = resolveSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export interface AdminIdentity {
  email: string;
  role: string;
  canWrite: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface Session {
  accessToken: string;
  email: string;
}

/* ------------------------------------------------------------------ session */

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

/**
 * Signs a staff member in, through the app's own Supabase project.
 *
 * The panel keeps only the access token and the address. No refresh token, no
 * password: a panel is a thing people leave open on a counter, and the shortest
 * session that does the job is the right one.
 */
export async function signIn(email: string, password: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // A build without these is a panel nobody can sign in to, which looks like a
    // broken server rather than a broken build. `npm run build` refuses to
    // produce one; this is the message if it happens anyway.
    throw new ApiError(
      'This build is not configured for sign-in. Rebuild with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      500,
    );
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  const body = (await response.json()) as { access_token?: string; error_code?: string };

  if (!response.ok || !body.access_token) {
    // One message for every refusal: whether an address has an account, and
    // whether that account is an admin, is not something to learn by asking.
    throw new ApiError('That email address and password are not correct.', 401);
  }

  const session: Session = { accessToken: body.access_token, email: email.trim().toLowerCase() };
  writeSession(session);

  // A password that is right but not an admin must not look like success.
  const identity = await whoAmI();
  if (!identity) {
    writeSession(null);
    throw new ApiError('That account cannot use the admin panel.', 403);
  }
}

export function signOut() {
  writeSession(null);
}

/* ----------------------------------------------------------------- requests */

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readSession();
  if (!session) throw new ApiError('Please sign in.', 401);

  const response = await fetch(`/admin/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401 || response.status === 403) {
    // The server says no. Nothing to argue with and nothing to retry.
    writeSession(null);
    throw new ApiError('You do not have access to this area.', response.status);
  }

  const text = await response.text();
  const body = text ? (JSON.parse(text) as { message?: string }) : {};

  if (!response.ok) {
    throw new ApiError(body.message ?? 'Something went wrong.', response.status);
  }

  return body as T;
}

/** The server's answer to "are you staff?". The panel does not guess. */
export async function whoAmI(): Promise<AdminIdentity | null> {
  try {
    return await request<AdminIdentity>('/me');
  } catch {
    return null;
  }
}

export const api = {
  dashboard: () => request<Dashboard>('/dashboard'),
  customers: (search: string) =>
    request<{ items: CustomerSummary[]; total: number }>(`/customers?q=${encodeURIComponent(search)}`),
  customer: (id: string) => request<CustomerDetail>(`/customers/${encodeURIComponent(id)}`),
  payments: (status?: string) =>
    request<{ items: PaymentRecord[] }>(`/payments${status ? `?status=${status}` : ''}`),
  reverifyPayment: (id: string, reason: string) =>
    request<{ message: string; payment: { status: string } }>(`/payments/${encodeURIComponent(id)}/reverify`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  devices: (state?: string) => request<{ items: DeviceRecord[] }>(`/devices${state ? `?state=${state}` : ''}`),
  device: (id: string) => request<DeviceDetail>(`/devices/${encodeURIComponent(id)}`),
  setDeviceState: (id: string, state: string, reason: string) =>
    request<{ device: DeviceRecord }>(`/devices/${encodeURIComponent(id)}/state`, {
      method: 'POST',
      body: JSON.stringify({ state, reason }),
    }),
  /**
   * Asks the phone to do something.
   *
   * The answer is a *request* that has been accepted, and the returned command
   * says so: `outcome` is `REQUESTED` until the device reports otherwise, and this
   * function never fills that in on the phone's behalf. There is no endpoint here
   * that marks a command done, for the same reason there is no "mark paid".
   */
  deviceCommand: (id: string, action: string, reason: string, confirmation?: string) =>
    request<{ message: string; command: DeviceCommand }>(`/devices/${encodeURIComponent(id)}/command`, {
      method: 'POST',
      body: JSON.stringify({ action, reason, confirmation }),
    }),
  /** A read, and audited by the server as one, because it is a person's location. */
  deviceLocation: (id: string) =>
    request<{ message: string; location: DeviceLocation | null }>(`/devices/${encodeURIComponent(id)}/location`),
  /**
   * Sends the customer a reminder about what they owe.
   *
   * No amount is sent. The server quotes the figure off the schedule, because a
   * reminder that quotes a number somebody typed into a browser can quote the
   * wrong number to a customer about money they owe.
   */
  deviceReminder: (id: string, message?: string) =>
    request<{ message: string }>(`/devices/${encodeURIComponent(id)}/reminder`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  tickets: (status?: string) => request<{ items: TicketRecord[] }>(`/tickets${status ? `?status=${status}` : ''}`),
  replyToTicket: (id: string, response: string) =>
    request<{ id: string }>(`/tickets/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ response, status: 'RESOLVED' }),
    }),
  notifications: () => request<{ items: NotificationRecord[] }>('/notifications'),
  sendNotification: (payload: { customerKey: string; type: string; title: string; message: string }) =>
    request<{ id: string }>('/notifications', { method: 'POST', body: JSON.stringify(payload) }),
  audit: () => request<{ items: AuditRecord[] }>('/audit'),
};

/* -------------------------------------------------------------------- types */

export interface Dashboard {
  customers: number;
  devices: number;
  restrictedDevices: number;
  openTickets: number;
  pendingPayments: number;
  outstandingAmount: number;
  recentPayments: PaymentRecord[];
  deviceStates: Record<string, number>;
}

export interface CustomerSummary {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  language: string;
  enrolled: boolean;
  createdAt: string | null;
}

export interface InstallmentRecord {
  id: string;
  number: number;
  amount: number;
  paidAmount: number;
  outstanding: number;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
}

export interface PaymentRecord {
  id: string;
  customerKey: string;
  installmentNumber: number;
  amount: number;
  status: string;
  method: string;
  gatewayReference: string | null;
  paidAt: string | null;
  createdAt: string | null;
}

export interface DeviceRecord {
  id: string;
  customerKey: string;
  name: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  state: string;
  enrollmentStatus: string;
  managementStatus: string;
  isManaged: boolean;
  contractId: string;
  lastSyncAt: string | null;
  /**
   * `PHONE` when a handset described this row, `DEMO` when nothing has.
   *
   * The panel marks demo data on the row, and it has to: an operator deciding
   * whether to lock somebody's phone must never be looking at a phone that does
   * not exist. The server decides this and the panel does not get to guess.
   */
  source: 'PHONE' | 'DEMO';
  /** When the handset last described itself, and which install sent the report. */
  reportedAt: string | null;
  reportedBy: string | null;
  androidId: string | null;
}

export interface TicketRecord {
  id: string;
  customerKey: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  response: string | null;
  createdAt: string | null;
}

export interface NotificationRecord {
  id: string;
  customerKey: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditRecord {
  id: number;
  adminEmail: string;
  action: string;
  subject: string;
  reason: string | null;
  createdAt: string;
}

export interface CustomerDetail {
  customer: CustomerSummary;
  device: DeviceRecord | null;
  installments: InstallmentRecord[];
  payments: PaymentRecord[];
  tickets: TicketRecord[];
  totals: {
    totalPrice: number;
    paidAmount: number;
    outstandingAmount: number;
    paidInstallments: number;
    totalInstallments: number;
  };
}

/** One button's worth of information, as the server describes it. */
export interface DeviceCommandSpec {
  action: string;
  label: string;
  needsConfirmation: boolean;
  destructive: boolean;
}

/**
 * A request made of a phone, and what the phone said.
 *
 * `outcome` is the interesting field and the panel is careful with it:
 * `REQUESTED` means a person asked and the phone has not answered yet, which is
 * the common case, because a phone is usually somewhere else when a button is
 * pressed. `outcomeAt` and `reportedBy` stay null until the device fills them in.
 */
export interface DeviceCommand {
  id: string | null;
  action: string | null;
  outcome: 'REQUESTED' | 'APPLIED' | 'FAILED' | 'REFUSED';
  reason: string | null;
  requestedAt: string | null;
  outcomeAt: string | null;
  outcomeNote: string | null;
  reportedBy: string | null;
}

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracyMetres: number | null;
  reportedAt: string;
}

export interface DeviceDetail {
  device: DeviceRecord;
  customer: { id: string; fullName: string; phone: string } | null;
  canCommand: boolean;
  /** Why nothing is available, in a shop's terms. Never null when canCommand is false. */
  blocker: string | null;
  commands: DeviceCommandSpec[];
  location: DeviceLocation | null;
  history: DeviceCommand[];
}
