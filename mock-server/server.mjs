/**
 * Dev-only mock of the two services the app talks to:
 *
 *   1. Supabase  — GoTrue (`/auth/v1/*`) and PostgREST (`/rest/v1/*`)
 *   2. Customer API (`/customer/*`, the Laravel prefix)
 *
 * WHY THIS EXISTS
 *
 * The real Supabase project cannot create an account at the moment: the
 * project's built-in mailer is rate limited, and sign-up has to send a
 * confirmation email. Until someone with dashboard access adds an SMTP provider
 * (or turns confirmation off), every sign-in against it fails as a wrong
 * password. This server lets the whole app be run, signed in, and verified
 * today, with the same credentials every time.
 *
 * WHAT IT IS NOT
 *
 * It is not a fallback and it cannot be reached in a real build. The app only
 * talks to it when `EXPO_PUBLIC_SUPABASE_URL` points here, which only
 * `npm run dev:mock` does. `eas.json` keeps the production URL, so a production
 * bundle can never point at this. It refuses to bind anything but loopback
 * unless `--allow-remote` is passed.
 *
 * WHAT IT DELIBERATELY DOES NOT FAKE
 *
 * Payment outcomes. A payment in this mock only ever reaches SUCCESS through
 * an explicit call that stands in for a verified gateway callback, and the
 * status endpoint reports whatever the server recorded. There is no path where
 * the client's opinion of a payment changes the answer — the real design's core
 * property, preserved here.
 *
 * USAGE
 *
 *   npm run dev:mock                      # terminal 1
 *   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:4000 \
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=local-dev-anon-key \
 *   npm run dev:mock:app                  # terminal 2
 *
 * `127.0.0.1` only works on this machine. To sign in from a phone on the same
 * network, use `npm run dev:mock:lan` and point the app at the address the
 * startup banner prints.
 *
 * Sign in with asifghe78@gmail.com / Passw0rd!
 */

import { spawn } from 'node:child_process';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.MOCK_PORT ?? 4000);
const HOST = process.env.MOCK_HOST ?? '127.0.0.1';
const ANON_KEY = process.env.MOCK_ANON_KEY ?? 'local-dev-anon-key';
const JWT_SECRET = 'mock-only-signing-secret-not-a-real-key';

/**
 * The IPv4 addresses other devices on this network can reach, so the startup
 * banner can print something a phone can actually use. Empty when there is no
 * external interface, which is the normal case in a container.
 */
function lanAddresses() {
  const interfaces = networkInterfaces();
  const found = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      const usable =
        entry.family === 'IPv4' && !entry.internal && /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(entry.address);
      if (usable) found.push(entry.address);
    }
  }
  return found;
}

// A build that somehow points at this must be obvious, not silent.
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to start: the mock server must never run in production.');
  process.exit(1);
}
if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !process.argv.includes('--allow-remote')) {
  console.error(`Refusing to bind ${HOST}. Pass --allow-remote if you really mean it.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Seed data. Shapes match the live schema in `src/supabase/types.ts`.
// ---------------------------------------------------------------------------

const now = new Date().toISOString();

/** Fixed so the demo is reproducible and screenshots are stable. */
const SEED_CUSTOMERS = [
  {
    id: 'CUST-23839',
    auth_uid: null, // set when that number signs up
    full_name: 'Asif Hossain',
    phone_number: '+8801810902817',
    email: 'asifghe78@gmail.com',
    is_enrolled: true,
    language: 'en',
    created_at: '2026-01-04T09:12:00.000Z',
    updated_at: '2026-09-20T10:00:00.000Z',
  },
  {
    id: 'CUST-71997',
    auth_uid: null,
    full_name: 'Nusrat Jahan',
    phone_number: '+8801712345678',
    email: 'nusrat@example.com',
    is_enrolled: true,
    language: 'bn',
    created_at: '2026-02-11T08:00:00.000Z',
    updated_at: '2026-09-18T12:30:00.000Z',
  },
  {
    id: 'CUST-74139',
    auth_uid: null,
    full_name: 'Tanvir Ahmed',
    phone_number: '+8801911223344',
    email: 'tanvir@example.com',
    is_enrolled: false,
    language: 'en',
    created_at: '2026-03-02T14:45:00.000Z',
    updated_at: '2026-09-19T07:15:00.000Z',
  },
];

const devices = [
  {
    id: 'DEV-SAM-A15-098',
    customer_key: 'CUST-23839',
    device_name: 'Samsung Galaxy A15 5G',
    manufacturer: 'Samsung',
    model: 'Galaxy A15 5G',
    android_version: 'Android 14 (API 34)',
    contract_id: 'CONTRACT-BD-2026-902',
    enrollment_status: 'ENROLLED',
    management_status: 'MANAGED_BY_ENTERPRISE',
    state: 'ACTIVE',
    last_sync_time: '2026-09-25T09:00:00.000Z',
    is_managed: true,
    created_at: '2026-01-04T09:20:00.000Z',
  },
];

const installments = [
  ['CUST-23839', 1, 5000, 5000, 'PAID', '2026-02-04', '2026-02-03T10:00:00.000Z'],
  ['CUST-23839', 2, 2500, 2500, 'PAID', '2026-04-04', '2026-04-02T11:00:00.000Z'],
  ['CUST-23839', 3, 2500, 1150, 'PARTIAL', '2026-07-04', null],
  ['CUST-23839', 4, 2500, 0, 'OVERDUE', '2026-10-04', null],
  ['CUST-23839', 5, 2500, 0, 'UPCOMING', '2026-12-04', null],
].map(([key, number, amount, paid, status, due, paidAt], index) => ({
  id: `inst-${key}-${number}`,
  customer_key: key,
  contract_id: 'CONTRACT-BD-2026-902',
  number: Number(number),
  amount: Number(amount),
  paid_amount: Number(paid),
  status,
  due_date: due,
  paid_at: paidAt,
  created_at: '2026-01-04T09:20:00.000Z',
  _index: index,
}));

const payments = [
  ['CUST-23839', 'TXN-90211', 2, 2500, 'SUCCESS', 'bkash', '2026-04-02T11:00:00.000Z'],
  ['CUST-23839', 'TXN-90233', 3, 1150, 'SUCCESS', 'bkash', '2026-06-28T08:20:00.000Z'],
].map(([key, txn, number, amount, status, method, date]) => ({
  transaction_id: txn,
  customer_key: key,
  installment_number: Number(number),
  amount: Number(amount),
  date,
  payment_method: method,
  status,
  receipt_url: null,
  created_at: date,
}));

const notifications = [
  {
    id: 'notif-1',
    customer_key: 'CUST-23839',
    type: 'INSTALLMENT_DUE_SOON',
    title: 'Installment due on 4 October',
    message: 'Your 4th installment of ৳2,500 is due on 4 October 2026.',
    is_read: false,
    reference_id: 'inst-CUST-23839-4',
    created_at: '2026-09-22T06:00:00.000Z',
  },
  {
    id: 'notif-2',
    customer_key: 'CUST-23839',
    type: 'PAYMENT_SUCCESSFUL',
    title: 'Payment received',
    message: 'We received your payment of ৳1,150. Thank you.',
    is_read: true,
    reference_id: 'TXN-90233',
    created_at: '2026-06-28T08:21:00.000Z',
  },
  {
    id: 'notif-3',
    customer_key: 'CUST-71997',
    type: 'GENERAL',
    title: 'Welcome',
    message: 'Your account is ready.',
    is_read: false,
    reference_id: null,
    created_at: '2026-02-11T08:01:00.000Z',
  },
];

// The server's own record of the device-management agreement, per customer.
// Seeded so the enrollment screen has something to show before the customer
// accepts anything.
const agreements = new Map();

/**
 * Orders handed to the simulated gateway. A gateway is a *different* system from
 * the customer API, so its orders live here and its callback is a separate route
 * — the app can only ever see the result through `GET /payments/:id/status`,
 * which reports what this server recorded.
 */
const gatewayOrders = new Map();

/** Mutable per-customer app settings, as the settings screen writes them. */
const appSettings = new Map();

/**
 * Who did what, and why. An admin can release a phone and ask the gateway about
 * money, so the trail is part of the feature rather than a nicety.
 */
const adminAudit = [];

const supportTickets = [
  {
    id: 'TICK-4029',
    customer_key: 'CUST-23839',
    subject: 'Installment date query',
    message: 'Can I pay the next installment early?',
    category: 'INSTALLMENT',
    status: 'RESOLVED',
    admin_response: 'Yes — you can pay any time before the due date.',
    created_at: '2026-09-10T04:00:00.000Z',
  },
];

/**
 * Staff for the admin panel.
 *
 * The mock's admin gate reads the *token*, exactly as `RequireAdmin` does on the
 * server: the role is in `app_metadata`, which a client cannot write, and the
 * address is in an allow-list. A customer session presented to `/admin/*` is
 * refused, and that refusal is the thing worth testing.
 */
const DEMO_ADMIN = {
  email: 'staff@srabontelecom.com',
  password: 'Passw0rd!1a',
  role: 'admin',
};
const ADMIN_EMAILS = [DEMO_ADMIN.email];

const tables = {
  profiles: SEED_CUSTOMERS,
  devices,
  installments,
  payments,
  notifications,
  support_tickets: supportTickets,
};

/** Which column links a row to a customer — this is what RLS is emulated on. */
const OWNER_COLUMN = {
  profiles: 'auth_uid',
  devices: 'customer_key',
  installments: 'customer_key',
  payments: 'customer_key',
  notifications: 'customer_key',
  support_tickets: 'customer_key',
};

// ---------------------------------------------------------------------------
// Auth users and tokens
// ---------------------------------------------------------------------------

/** email (lowercased) -> { id, email, passwordHash, sessions:Set<token> } */
const authUsers = new Map();
const refreshTokens = new Map();

/** Credentials printed on startup, so the demo works from a cold start. */
const DEMO_EMAIL = 'asifghe78@gmail.com';
const DEMO_PASSWORD = 'Passw0rd!';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signJwt(claims, secret = JWT_SECRET) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifyJwt(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
}

function passwordHash(email, password) {
  return createHmac('sha256', JWT_SECRET).update(`${email}:${password}`).digest('hex');
}

function issueSession(user) {
  const expiresIn = 3600;
  const accessToken = signJwt({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    // The admin role travels in the token's app_metadata, which is what
    // `RequireAdmin` reads and what a client cannot write for itself.
    app_metadata: isAdmin(user.email) ? { role: DEMO_ADMIN.role } : {},
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    session_id: randomUUID(),
  });
  const refreshToken = randomUUID();
  user.sessions.add(refreshToken);
  refreshTokens.set(refreshToken, user.id);
  return { accessToken, refreshToken, expiresIn };
}

/** The acting customer for a request, or null. */
function actorFor(request) {
  const header = request.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const claims = verifyJwt(header.slice(7));
  if (!claims) return null;
  if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) return null;
  return claims;
}

function isAdmin(email) {
  return ADMIN_EMAILS.includes(String(email ?? '').toLowerCase());
}

/**
 * The mock's `RequireAdmin`: a token has to be verified *and* the account has to
 * be staff. One message for every refusal, so the panel cannot be used to learn
 * which addresses are admins.
 */
function requireAdmin(request, response) {
  const claims = actorFor(request);
  if (!claims) {
    error(response, 401, 'unauthorized', 'You do not have access to this area.');
    return null;
  }
  const byEmail = isAdmin(claims.email);
  const byRole = claims.app_metadata?.role === DEMO_ADMIN.role;
  if (!byEmail && !byRole) {
    console.log(`  [mock] refused an admin request from ${claims.email} on ${request.url}`);
    error(response, 403, 'forbidden', 'You do not have access to this area.');
    return null;
  }
  return claims;
}

function audit(adminEmail, action, subject, reason) {
  adminAudit.unshift({
    id: adminAudit.length + 1,
    admin_email: adminEmail,
    action,
    subject,
    reason: reason ?? null,
    created_at: new Date().toISOString(),
  });
}

function customerForAuthUser(authUid) {
  return SEED_CUSTOMERS.find((c) => c.auth_uid === authUid) ?? null;
}

/**
 * Creates the demo auth user and links it to a customer row, mirroring what
 * `sql/02-add-auth-link.sql` does in production. Without this the documented
 * credentials would only work after a fresh signup, and a restarted mock would
 * forget every account.
 */
function seedDemoUser() {
  const customer = SEED_CUSTOMERS.find((c) => c.email === DEMO_EMAIL);
  if (!customer) return;

  const user = {
    id: randomUUID(),
    email: DEMO_EMAIL,
    passwordHash: passwordHash(DEMO_EMAIL, DEMO_PASSWORD),
    sessions: new Set(),
  };
  authUsers.set(DEMO_EMAIL, user);
  customer.auth_uid = user.id;
}

/**
 * The staff account for the admin panel.
 *
 * Deliberately *not* linked to a customer: a staff member's own session must be
 * refused by every `/customer` route as firmly as a customer's is refused by
 * every `/admin` route. One account, one job.
 */
function seedAdminUser() {
  authUsers.set(DEMO_ADMIN.email, {
    id: randomUUID(),
    email: DEMO_ADMIN.email,
    passwordHash: passwordHash(DEMO_ADMIN.email, DEMO_ADMIN.password),
    sessions: new Set(),
  });
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

function json(response, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Origin': '*',
    // supabase-js sends more than the obvious set; an incomplete list fails the
    // preflight and the real request never leaves the browser.
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, prefer, range, accept, ' +
      'x-client-info, x-supabase-api-version, x-supabase-authorization, ' +
      'x-www-form-urlencoded, authorization-profile, apikey, ' +
      'x-client-ip, x-forwarded-for',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Expose-Headers': 'content-range',
    ...extraHeaders,
  });
  response.end(payload);
}

function error(response, status, code, message) {
  json(response, status, { code, error_code: code, msg: message, message });
}

/** ৳1,234 — formatted the way the app shows money, so the two agree. */
function taka(amount) {
  return `\u09F3${Number(amount).toLocaleString('en-US')}`;
}

/**
 * The gateway page, laid out for a phone first.
 *
 * A single column, one card, every row a label and a value with room between
 * them, and a tap target no smaller than the app's own 48dp buttons. This opens
 * in the customer's browser on whatever phone they own, so a two-column layout
 * would be a page that falls apart on the smallest and most common screen.
 */
function gatewayPage({
  title,
  heading,
  subheading,
  amount,
  rows = [],
  formAction,
  payLabel,
  cancelAction,
  tone = 'brand',
}) {
  const body = `
      <h1>${heading}</h1>
      ${subheading ? `<p class="sub">${subheading}</p>` : ''}
      ${amount === undefined ? '' : `<div class="amount">${taka(amount)}</div>`}
      ${rows
        .map(
          ([label, value]) =>
            `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`,
        )
        .join('')}
      ${
        formAction
          ? `<form method="POST" action="${formAction}"><button class="pay" type="submit">${payLabel}</button></form>`
          : ''
      }
      ${
        cancelAction
          ? `<form method="POST" action="${cancelAction}"><button class="cancel" type="submit">Cancel</button></form>`
          : ''
      }
      <p class="note">This is the local mock's stand-in for a gateway page. No money moves. The payment
      is only marked paid after this server records the callback.</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #f6f8f8;
        color: #131918;
        font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;      /* one column, always: this is a phone page */
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
      }
      .card {
        width: 100%;
        max-width: 400px;
        background: #fff;
        border: 1px solid #e4edea;
        border-radius: 20px;
        padding: 24px 20px;
        box-shadow: 0 8px 24px rgba(16, 20, 20, 0.08);
      }
      h1 { font-size: 20px; line-height: 1.3; margin: 0; letter-spacing: -0.2px; }
      .sub { margin: 4px 0 0; color: #6f7977; font-size: 14px; }
      .amount {
        font-size: 36px; font-weight: 800; letter-spacing: -1px;
        margin: 16px 0 4px; word-break: break-all;
      }
      .row {
        display: flex; flex-wrap: wrap;
        justify-content: space-between; align-items: baseline;
        gap: 4px 16px;                     /* the value wraps below the label, not into it */
        padding: 10px 0;
        border-top: 1px solid #eef3f1;
        font-size: 14px;
      }
      .label { color: #3f4947; }
      .value { font-weight: 600; text-align: right; word-break: break-all; min-width: 0; }
      form { margin: 0; }
      button {
        display: block; width: 100%;
        min-height: 52px;                    /* the same target the app uses */
        margin-top: 12px; padding: 14px 16px;
        font-size: 16px; font-weight: 700;
        border-radius: 999px; border: 0; cursor: pointer;
      }
      .pay { background: #0b6b5b; color: #fff; }
      .cancel { background: transparent; color: #3f4947; }
      .note { margin: 20px 0 0; font-size: 12px; line-height: 1.45; color: #6f7977; }
      .success .card { border-color: #cdefe7; }
      @media (min-width: 520px) { .amount { font-size: 40px; } }
    </style>
  </head>
  <body class="${tone}">
    <main class="card">${body}
    </main>
  </body>
</html>`;
}

/** An HTML response, for the simulated gateway page. */
function html(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

/**
 * The origin the *customer* used, so the gateway hand-off comes back through
 * the tunnel rather than a loopback address the phone cannot reach.
 */
function originFor(request) {
  return `http://${request.headers.host ?? `127.0.0.1:${PORT}`}`;
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      if (raw.length === 0) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function hasValidApiKey(request) {
  const key = request.headers.apikey;
  return key === ANON_KEY || (typeof key === 'string' && key.startsWith('mock-'));
}

// ---------------------------------------------------------------------------
// GoTrue subset
// ---------------------------------------------------------------------------

async function handleAuth(request, response, url) {
  const path = url.pathname.replace('/auth/v1', '');
  const method = request.method ?? 'GET';
  const body = await readBody(request);

  if (path === '/settings' && method === 'GET') {
    return json(response, 200, {
      external: { phone: true, email: true },
      disable_signup: false,
      sms_provider: 'twilio',
      mailer_autoconfirm: false,
    });
  }

  if (path === '/.well-known/jwks.json' && method === 'GET') {
    return json(response, 200, { keys: [] });
  }

  if (path === '/signup' && method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
      return error(response, 400, 'validation_failed', 'Unable to validate email address');
    }
    if (authUsers.has(email)) {
      // The app maps this to "that email is already in use".
      return error(response, 422, 'user_already_exists', 'User already registered');
    }
    if (String(body.password ?? '').length < 6) {
      return error(response, 422, 'weak_password', 'Password is too weak');
    }

    const user = {
      id: randomUUID(),
      email,
      passwordHash: passwordHash(email, String(body.password)),
      sessions: new Set(),
    };
    authUsers.set(email, user);

    // Link the auth user to a customer row, exactly as sql/02 does. A known
    // address is adopted by the matching profile; a new one gets a profile.
    let customer = SEED_CUSTOMERS.find((c) => c.email === email);
    if (customer) {
      customer.auth_uid = user.id;
    } else {
      customer = {
        id: `CUST-${Math.floor(10000 + Math.random() * 89999)}`,
        auth_uid: user.id,
        full_name: '',
        phone_number: null,
        email,
        is_enrolled: false,
        language: 'en',
        created_at: now,
        updated_at: now,
      };
      SEED_CUSTOMERS.push(customer);
    }

    const session = issueSession(user);
    return json(response, 200, {
      access_token: session.accessToken,
      token_type: 'bearer',
      expires_in: session.expiresIn,
      refresh_token: session.refreshToken,
      user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email },
    });
  }

  if (path === '/token' && method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const user = authUsers.get(email);

    // One message for a wrong password and an unknown address alike, so this
    // cannot be used to discover which addresses have accounts.
    if (!user || user.passwordHash !== passwordHash(email, password)) {
      return error(response, 400, 'invalid_credentials', 'Invalid login credentials');
    }

    const session = issueSession(user);
    return json(response, 200, {
      access_token: session.accessToken,
      token_type: 'bearer',
      expires_in: session.expiresIn,
      refresh_token: session.refreshToken,
      user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email },
    });
  }

  if (path === '/user' && method === 'GET') {
    const claims = actorFor(request);
    if (!claims) return error(response, 401, 'no_authorization', 'Missing authorization header');
    return json(response, 200, {
      id: claims.sub,
      aud: 'authenticated',
      role: 'authenticated',
      email: claims.email,
    });
  }

  if (path === '/logout' && method === 'POST') {
    return error(response, 404, 'not_found', 'Not Found');
  }

  return error(response, 404, 'not_found', 'Not Found');
}

// ---------------------------------------------------------------------------
// PostgREST subset, with RLS emulated on the owner column
// ---------------------------------------------------------------------------

async function handleRest(request, response, url) {
  const method = request.method ?? 'GET';
  const table = url.pathname.replace('/rest/v1/', '').split('?')[0];
  const rows = tables[table];

  if (!rows) return error(response, 404, 'PGRST205', 'Not Found');

  if (method === 'GET') {
    const claims = actorFor(request);
    const ownerColumn = OWNER_COLUMN[table];

    // An anonymous request matches no rows — which is what a correct RLS policy
    // does, and is the whole reason this mock is useful for checking how the app
    // behaves with no session.
    //
    // Note the two-step lookup, because this is the part that is easy to get
    // wrong in real policies too: the JWT `sub` is the Supabase auth user id
    // (a uuid), but every table except `profiles` is keyed by the *customer*
    // key ('CUST-23839'). Comparing a row's owner column straight against
    // `auth.uid()` therefore matches nothing. The policy has to resolve the
    // auth user to a customer first, which is what
    // `sql/03-owner-policies.sql` does with a sub-select.
    const customer = claims ? customerForAuthUser(claims.sub) : null;
    const ownerValue =
      ownerColumn === 'auth_uid' ? claims?.sub : (customer?.id ?? null);

    const visible = ownerValue
      ? rows.filter((row) => row[ownerColumn] === ownerValue)
      : [];

    // `profiles` is keyed on auth_uid, so a signed-in customer sees their row.
    const requested = url.searchParams.get('select');
    const limit = Number(url.searchParams.get('limit') ?? '100');
    let payload = visible.slice(0, limit);

    if (requested) {
      const fields = requested.split(',').map((f) => f.trim());
      payload = payload.map((row) =>
        Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]])),
      );
    }
    if (table !== 'profiles') {
      payload = payload.map(({ _index, customer_key, auth_uid, ...rest }) => rest);
    }

    return json(response, 200, payload, {
      'Content-Range': `0-${Math.max(0, payload.length - 1)}/${visible.length}`,
    });
  }

  // Writes are refused exactly as the real RLS policies refuse them: a client
  // must not be able to change a device's state or a payment.
  if (method !== 'GET' && method !== 'HEAD') {
    return error(
      response,
      403,
      '42501',
      'new row violates row-level security policy for table "' + table + '"',
    );
  }

  return error(response, 405, 'PGRST117', 'Method not allowed');
}

// ---------------------------------------------------------------------------
// Customer API (Laravel prefix)
// ---------------------------------------------------------------------------

async function handleCustomer(request, response, url) {
  const method = request.method ?? 'GET';
  const path = url.pathname.replace(/^\/customer/, '') || '/';
  const body = await readBody(request);

  if (path === '/' && method === 'GET') {
    const claims = actorFor(request);
    if (!claims) return error(response, 401, 'unauthorized', 'Unauthorized request');
    return json(response, 200, { ok: true });
  }

  if (path === '/profile' && method === 'GET') {
    const claims = actorFor(request);
    if (!claims) return error(response, 401, 'unauthorized', 'Unauthorized request');
    const customer = customerForAuthUser(claims.sub);
    if (!customer) return error(response, 404, 'not_found', 'Not Found');
    return json(response, 200, {
      id: customer.id,
      fullName: customer.full_name,
      email: customer.email,
      phone: customer.phone_number,
      language: customer.language,
      verifiedAt: customer.created_at,
    });
  }

  // ---- assembled views the app reads -------------------------------
  // The app fetches these rather than stitching several tables together on the
  // device, so the mock assembles them server-side exactly as Laravel would.

  if (path === '/dashboard' && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const device = devices.find((d) => d.customer_key === customer.id) ?? null;
    const plan = installments.filter((i) => i.customer_key === customer.id);
    const paid = plan.reduce((sum, i) => sum + i.paid_amount, 0);
    const total = plan.reduce((sum, i) => sum + i.amount, 0);
    const next =
      plan.filter((i) => i.status !== 'PAID').sort((a, b) => a.number - b.number)[0] ?? null;

    return json(response, 200, {
      customer: {
        id: customer.id,
        fullName: customer.full_name || 'New customer',
        phone: customer.phone_number,
        email: customer.email,
        photoUrl: null,
        language: customer.language,
        verifiedAt: customer.created_at,
        createdAt: customer.created_at,
      },
      device: device
        ? {
            id: device.id,
            name: device.device_name,
            manufacturer: device.manufacturer,
            model: device.model,
            androidVersion: device.android_version,
            enrollmentStatus: device.enrollment_status,
            managementStatus: device.management_status,
            deviceState: device.state,
            lastSyncedAt: device.last_sync_time,
            contractId: device.contract_id,
            agreementVersion: '1.0.0',
            agreementAcceptedAt: device.created_at,
            enterpriseManaged: device.is_managed,
          }
        : null,
      plan: plan.length
        ? {
            contractId: plan[0].contract_id,
            status: 'OVERDUE',
            totalPrice: total,
            downPayment: plan[0].amount,
            paidAmount: paid,
            remainingAmount: total - paid,
            installmentAmount: 2500,
            totalInstallments: plan.length,
            paidInstallments: plan.filter((i) => i.status === 'PAID').length,
            remainingInstallments: plan.filter((i) => i.status !== 'PAID').length,
            nextDueDate: next?.due_date ?? null,
            nextInstallmentId: next?.id ?? null,
            currency: 'BDT',
          }
        : null,
      nextInstallment: next ? presentInstallment(next) : null,
      deviceStatus: device
        ? {
            deviceState: device.state,
            enrollmentStatus: device.enrollment_status,
            managementStatus: device.management_status,
            lastSyncedAt: device.last_sync_time,
            serverTime: now,
            outstandingAmount: total - paid,
            dueDate: next?.due_date ?? null,
            restrictionReason: null,
            unlockAuthorizedAt: null,
          }
        : null,
      unreadNotificationCount: notifications.filter(
        (n) => n.customer_key === customer.id && !n.is_read,
      ).length,
      openTicketCount: supportTickets.filter(
        (t) => t.customer_key === customer.id && t.status !== 'CLOSED',
      ).length,
    });
  }

  if (path === '/devices/me' && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const device = devices.find((d) => d.customer_key === customer.id);
    if (!device) return error(response, 404, 'not_found', 'Not Found');
    return json(response, 200, {
      id: device.id,
      name: device.device_name,
      manufacturer: device.manufacturer,
      model: device.model,
      androidVersion: device.android_version,
      enrollmentStatus: device.enrollment_status,
      managementStatus: device.management_status,
      deviceState: device.state,
      lastSyncedAt: device.last_sync_time,
      contractId: device.contract_id,
      agreementVersion: '1.0.0',
      agreementAcceptedAt: device.created_at,
      enterpriseManaged: device.is_managed,
    });
  }

  if (path === '/devices/me/status' && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const device = devices.find((d) => d.customer_key === customer.id);
    if (!device) return error(response, 404, 'not_found', 'Not Found');
    return json(response, 200, {
      deviceState: device.state,
      enrollmentStatus: device.enrollment_status,
      managementStatus: device.management_status,
      lastSyncedAt: device.last_sync_time,
      serverTime: now,
      outstandingAmount: outstandingFor(customer),
      dueDate: nextDueFor(customer),
      restrictionReason: null,
      unlockAuthorizedAt: null,
    });
  }

  if (path === '/profile' && method === 'PATCH') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    // The only thing a customer may change about themselves: a name and a
    // language. Enrollment, device state and money are not in this body.
    if (typeof body.fullName === 'string' && body.fullName.trim()) {
      customer.full_name = body.fullName.trim();
    }
    if (typeof body.language === 'string') customer.language = body.language;
    return json(response, 200, presentCustomer(customer));
  }

  if (path === '/settings' && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    return json(response, 200, settingsFor(customer));
  }

  if (path === '/settings' && method === 'PATCH') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const current = settingsFor(customer);
    const next = {
      ...current,
      ...(typeof body.pushNotifications === 'boolean' ? { pushNotifications: body.pushNotifications } : {}),
      ...(typeof body.overdueReminders === 'boolean' ? { overdueReminders: body.overdueReminders } : {}),
    };
    appSettings.set(customer.id, next);
    return json(response, 200, next);
  }

  // ---- enrollment: consent first, then the attempt ---------------------
  if (path === '/agreements/device-management/current' && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    return json(response, 200, presentAgreement(agreements.get(customer.id)));
  }

  if (path === '/agreements/device-management/accept' && method === 'POST') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    // The signed agreement is recorded *before* any enrollment is attempted.
    if (!body.agreementVersion || !body.signatureName) {
      return error(response, 422, 'validation', 'The agreement version and a signature are required.');
    }
    const record = {
      agreement_version: body.agreementVersion,
      signature_name: String(body.signatureName).trim(),
      accepted: body.accepted !== false,
      accepted_at: body.acceptedAt ?? now,
      customer_id: customer.id,
    };
    agreements.set(customer.id, record);
    return json(response, 200, presentAgreement(record));
  }

  if (path === '/devices/me/enroll' && method === 'POST') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const device = devices.find((d) => d.customer_key === customer.id);
    if (!device) return error(response, 404, 'not_found', 'Not Found');

    // An enrollment attempt is not an enrollment. On a retail phone Android
    // grants nothing, so the binding stays *pending* until Android reports a
    // device owner — which is exactly what the app shows.
    const agreement = agreements.get(customer.id);
    device.enrollment_status = 'PENDING';
    device.management_status = 'PENDING';
    device.last_sync_time = now;
    return json(response, 200, {
      id: device.id,
      name: device.device_name,
      manufacturer: device.manufacturer,
      model: device.model,
      androidVersion: device.android_version,
      enrollmentStatus: device.enrollment_status,
      managementStatus: device.management_status,
      deviceState: device.state,
      lastSyncedAt: device.last_sync_time,
      contractId: device.contract_id,
      agreementVersion: agreement?.agreement_version ?? '1.0.0',
      agreementAcceptedAt: agreement?.accepted_at ?? null,
      enterpriseManaged: false,
    });
  }

  if (path === '/devices/me/sync' && method === 'POST') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const device = devices.find((d) => d.customer_key === customer.id);
    if (!device) return error(response, 404, 'not_found', 'Not Found');
    device.last_sync_time = now;
    return json(response, 200, {
      deviceState: device.state,
      enrollmentStatus: device.enrollment_status,
      managementStatus: device.management_status,
      lastSyncedAt: device.last_sync_time,
      serverTime: now,
      outstandingAmount: outstandingFor(customer),
      dueDate: nextDueFor(customer),
      restrictionReason: null,
      unlockAuthorizedAt: null,
    });
  }

  if (path === '/installments' && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    return json(
      response,
      200,
      installments.filter((i) => i.customer_key === customer.id).map(presentInstallment),
    );
  }

  if (path === '/installments/plan' && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const plan = installments.filter((i) => i.customer_key === customer.id);
    if (!plan.length) return error(response, 404, 'not_found', 'Not Found');
    const paid = plan.reduce((sum, i) => sum + i.paid_amount, 0);
    const total = plan.reduce((sum, i) => sum + i.amount, 0);
    const next = plan.filter((i) => i.status !== 'PAID')[0] ?? null;
    return json(response, 200, {
      contractId: plan[0].contract_id,
      status: 'OVERDUE',
      totalPrice: total,
      downPayment: plan[0].amount,
      paidAmount: paid,
      remainingAmount: total - paid,
      installmentAmount: 2500,
      totalInstallments: plan.length,
      paidInstallments: plan.filter((i) => i.status === 'PAID').length,
      remainingInstallments: plan.filter((i) => i.status !== 'PAID').length,
      nextDueDate: next?.due_date ?? null,
      nextInstallmentId: next?.id ?? null,
      currency: 'BDT',
    });
  }

  if (/^\/installments\/[^/]+$/.test(path) && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const installment = installments.find(
      (i) => i.id === decodeURIComponent(path.split('/')[2]) && i.customer_key === customer.id,
    );
    if (!installment) return error(response, 404, 'not_found', 'Not Found');
    return json(response, 200, {
      ...presentInstallment(installment),
      payments: payments
        .filter((p) => p.customer_key === customer.id && p.installment_number === installment.number)
        .map((p) => presentPayment(p)),
    });
  }

  if (path === '/notifications' && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const items = notifications
      .filter((n) => n.customer_key === customer.id)
      .map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.is_read,
        referenceId: n.reference_id,
        createdAt: n.created_at,
      }));
    return json(response, 200, {
      items,
      page: 1,
      perPage: 20,
      total: items.length,
      hasMore: false,
    });
  }

  if (path === '/support/tickets' && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const items = supportTickets.filter((t) => t.customer_key === customer.id).map(presentTicket);
    return json(response, 200, {
      items,
      page: 1,
      perPage: 20,
      total: items.length,
      hasMore: false,
    });
  }

  if (path === '/notifications/read-all' && method === 'POST') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const marked = notifications.filter((n) => n.customer_key === customer.id && !n.is_read);
    marked.forEach((n) => {
      n.is_read = true;
    });
    return json(response, 200, { count: marked.length });
  }

  if (/^\/notifications\/[^/]+\/read$/.test(path) && method === 'POST') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const id = decodeURIComponent(path.split('/')[2]);
    const item = notifications.find((n) => n.id === id && n.customer_key === customer.id);
    if (!item) return error(response, 404, 'not_found', 'Not Found');
    item.is_read = true;
    return json(response, 200, { id: item.id });
  }

  if (path === '/notifications/devices' && method === 'POST') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    // A push token is a delivery address, not an identity: it grants nothing.
    return json(response, 200, { registered: true });
  }

  if (/^\/support\/tickets\/[^/]+$/.test(path) && method === 'GET') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    const ticket = supportTickets.find(
      (t) => t.id === decodeURIComponent(path.split('/')[3]) && t.customer_key === customer.id,
    );
    if (!ticket) return error(response, 404, 'not_found', 'Not Found');
    return json(response, 200, presentTicket(ticket));
  }

  if (path === '/support/tickets' && method === 'POST') {
    const customer = requireCustomer(request, response);
    if (!customer) return undefined;
    if (!body.subject || !body.message) {
      return error(response, 422, 'validation', 'A subject and a message are required.');
    }
    const ticket = {
      id: `TICK-MOCK-${randomUUID().slice(0, 4).toUpperCase()}`,
      customer_key: customer.id,
      subject: String(body.subject).slice(0, 140),
      message: String(body.message).slice(0, 4000),
      category: body.category ?? 'GENERAL',
      status: 'OPEN',
      admin_response: null,
      created_at: now,
    };
    supportTickets.unshift(ticket);
    return json(response, 200, presentTicket(ticket));
  }

  if (path === '/logout' && method === 'POST') {
    const claims = actorFor(request);
    if (!claims) return error(response, 401, 'unauthorized', 'Unauthorized request');
    return json(response, 200, { revoked: true });
  }

  if (path === '/payments' && method === 'GET') {
    const claims = actorFor(request);
    if (!claims) return error(response, 401, 'unauthorized', 'Unauthorized request');
    const customer = customerForAuthUser(claims.sub);
    if (!customer) return error(response, 401, 'unauthorized', 'Unauthorized request');

    const items = payments.filter((p) => p.customer_key === customer.id).map(presentPayment);

    return json(response, 200, {
      items,
      page: 1,
      perPage: 20,
      total: items.length,
      hasMore: false,
    });
  }

  if (path === '/payments/create' && method === 'POST') {
    const claims = actorFor(request);
    if (!claims) return error(response, 401, 'unauthorized', 'Unauthorized request');
    const customer = customerForAuthUser(claims.sub);
    if (!customer) return error(response, 401, 'unauthorized', 'Unauthorized request');

    const installment = installments.find(
      (i) => i.id === body.installmentId && i.customer_key === customer.id,
    );
    if (!installment) {
      return error(response, 404, 'not_found', 'That installment was not found.');
    }

    // The amount the phone sent is display-only; the contract decides. A
    // mismatch is noted in the log, exactly as the Laravel controller does.
    const expected = installment.amount - installment.paid_amount;
    if (body.amount !== undefined && Number(body.amount) !== expected) {
      console.log(
        `  [mock] amount mismatch for ${customer.id}/${body.installmentId}: ` +
          `client sent ${body.amount}, contract says ${expected} — using the contract`,
      );
    }
    const payment = {
      transaction_id: `TXN-MOCK-${randomUUID().slice(0, 8).toUpperCase()}`,
      customer_key: customer.id,
      installment_number: installment.number,
      amount: expected,
      date: null,
      payment_method: 'bkash',
      status: 'PENDING',
      receipt_url: null,
      created_at: now,
    };
    payments.push(payment);

    const orderId = `ORDER-${randomUUID().slice(0, 6).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    gatewayOrders.set(orderId, {
      orderId,
      paymentId: payment.transaction_id,
      customerId: customer.id,
      installmentId: installment.id,
      amount: expected,
      gateway: body.gateway ?? 'bkash',
      createdAt: now,
      expiresAt,
      settled: null,
    });

    // A real gateway page on this same origin, not `about:blank`: the customer
    // has to see an amount and a method before any money moves.
    return json(response, 200, {
      paymentId: payment.transaction_id,
      orderId,
      redirectUrl: `${originFor(request)}/gateway/${orderId}`,
      gateway: body.gateway ?? 'bkash',
      expiresAt,
    });
  }

  if (/^\/payments\/[^/]+\/status$/.test(path) && method === 'GET') {
    const claims = actorFor(request);
    if (!claims) return error(response, 401, 'unauthorized', 'Unauthorized request');
    const customer = customerForAuthUser(claims.sub);
    if (!customer) return error(response, 401, 'unauthorized', 'Unauthorized request');

    const id = path.split('/')[2];
    const payment = payments.find(
      (p) => p.transaction_id === id && p.customer_key === customer.id,
    );
    if (!payment) return error(response, 404, 'not_found', 'Not Found');

    return json(response, 200, {
      id: payment.transaction_id,
      transactionId: payment.transaction_id,
      installmentId: null,
      installmentNumber: payment.installment_number,
      amount: payment.amount,
      currency: 'BDT',
      status: payment.status,
      method: payment.payment_method,
      paidAt: payment.status === 'SUCCESS' ? payment.date : null,
      createdAt: payment.created_at,
      gateway: payment.payment_method,
    });
  }

  return error(response, 404, 'not_found', 'Not Found');
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------


/** Returns the acting customer, or writes 401 and returns null. */
function requireCustomer(request, response) {
  const claims = actorFor(request);
  if (!claims) {
    error(response, 401, 'unauthorized', 'Unauthorized request');
    return null;
  }
  const customer = customerForAuthUser(claims.sub);
  if (!customer) {
    // No profile row is linked to this auth user yet (sql/02 not backfilled).
    error(response, 401, 'unauthorized', 'Unauthorized request');
    return null;
  }
  return customer;
}

/**
 * Records a verified gateway result — the mock's stand-in for the callback a
 * real integration would receive and verify.
 *
 * Everything the app then believes comes from here and from
 * `GET /payments/:id/status`; nothing the phone says can move a payment on its
 * own. The installment is marked paid, and a fully settled plan releases the
 * device, because that is the whole point of the financing model.
 */
function settlePayment(order, status) {
  if (order.settled) return order;
  const payment = payments.find((p) => p.transaction_id === order.paymentId);
  if (!payment) return order;

  payment.status = status;
  payment.date = now;
  order.settled = status;

  const installment = installments.find((i) => i.id === order.installmentId);
  if (installment && status === 'SUCCESS') {
    installment.paid_amount = installment.amount;
    installment.status = 'PAID';
    installment.paid_at = now;
  }

  if (status === 'SUCCESS') {
    const plan = installments.filter((i) => i.customer_key === order.customerId);
    const settled = plan.every((i) => i.status === 'PAID');
    const device = devices.find((d) => d.customer_key === order.customerId);
    if (device) {
      device.state = settled ? 'UNLOCKED' : device.state === 'RESTRICTED' ? 'PAYMENT_DUE' : device.state;
    }
    notifications.unshift({
      id: `notif-${randomUUID().slice(0, 8)}`,
      customer_key: order.customerId,
      type: 'PAYMENT_SUCCESSFUL',
      title: 'Payment received',
      message: `We received your payment of ৳${order.amount.toLocaleString('en-US')}. Thank you.`,
      is_read: false,
      reference_id: order.paymentId,
      created_at: now,
    });
  }

  console.log(
    `  [mock] gateway callback: ${order.paymentId} settled ${status} ` +
      `(৳${order.amount.toLocaleString('en-US')}) — stand-in for a verified callback`,
  );
  return order;
}

function presentCustomer(customer) {
  return {
    id: customer.id,
    fullName: customer.full_name,
    email: customer.email,
    phone: customer.phone_number,
    language: customer.language,
    verifiedAt: customer.created_at,
  };
}

function presentAgreement(record) {
  if (!record) {
    return {
      agreementVersion: null,
      accepted: false,
      acceptedAt: null,
      signatureName: null,
    };
  }
  return {
    agreementVersion: record.agreement_version,
    accepted: record.accepted,
    acceptedAt: record.accepted_at,
    signatureName: record.signature_name,
  };
}

function presentTicket(ticket) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    message: ticket.message,
    category: ticket.category,
    status: ticket.status,
    createdAt: ticket.created_at,
    updatedAt: ticket.created_at,
    response: ticket.admin_response,
    respondedAt: ticket.admin_response ? ticket.created_at : null,
  };
}

function presentPayment(row) {
  const { customer_key, ...rest } = row;
  return {
    id: rest.transaction_id,
    currency: 'BDT',
    paidAt: rest.status === 'SUCCESS' ? rest.date : null,
    gateway: rest.payment_method,
    ...rest,
  };
}

function planFor(customer) {
  return installments.filter((i) => i.customer_key === customer.id);
}

function outstandingFor(customer) {
  return planFor(customer).reduce((sum, i) => sum + Math.max(0, i.amount - i.paid_amount), 0);
}

function nextDueFor(customer) {
  return planFor(customer).find((i) => i.status !== 'PAID')?.due_date ?? null;
}

function settingsFor(customer) {
  const stored = appSettings.get(customer.id);
  if (stored) return stored;
  const nextDue = nextDueFor(customer);
  return {
    language: customer.language ?? 'en',
    pushNotifications: true,
    overdueReminders: true,
    nextDueDate: nextDue,
    supportPhone: '09612-000000',
    agreementVersion: agreements.get(customer.id)?.agreement_version ?? '1.0.0',
  };
}

function presentInstallment(row) {
  const { customer_key, _index, ...rest } = row;
  return {
    id: rest.id,
    contractId: rest.contract_id,
    number: rest.number,
    amount: rest.amount,
    paidAmount: rest.paid_amount,
    status: rest.status,
    dueDate: rest.due_date,
    paidAt: rest.paid_at,
  };
}

/* ==========================================================================
 The admin panel's API

 The same shape as `backend/app/Http/Controllers/Admin/*`, so the panel can be
 built and demoed here and pointed at the real API without changing a line of
 the front end.

 The gate is the part that matters: a verified token is not enough, it also has
 to be staff. `requireAdmin` reads the role from the token's `app_metadata`,
 which a client cannot write for itself, and refuses everything else with one
 message.
 ========================================================================== */

/** The states an admin may put a phone into, and nothing else. */
const DEVICE_STATES = [
'ACTIVE',
'PAYMENT_DUE',
'GRACE_PERIOD',
'RESTRICTED',
'UNLOCKED',
'SUSPENDED',
];

const presentAdminCustomer = (c) => ({
id: c.id,
fullName: c.full_name,
email: c.email,
phone: c.phone_number,
language: c.language,
enrolled: Boolean(c.is_enrolled),
createdAt: c.created_at,
});

const presentAdminDevice = (d) => ({
id: d.id,
customerKey: d.customer_key,
name: d.device_name,
manufacturer: d.manufacturer,
model: d.model,
androidVersion: d.android_version,
state: d.state,
enrollmentStatus: d.enrollment_status,
managementStatus: d.management_status,
isManaged: Boolean(d.is_managed),
contractId: d.contract_id,
lastSyncAt: d.last_sync_time,
});

const presentAdminPayment = (row) => ({
id: row.transaction_id,
customerKey: row.customer_key,
installmentNumber: row.installment_number,
amount: row.amount,
status: row.status,
method: row.payment_method,
gatewayReference: row.gateway_order_id ?? null,
paidAt: row.date,
createdAt: row.created_at,
});

const presentAdminInstallment = (i) => ({
id: i.id,
number: i.number,
amount: i.amount,
paidAmount: i.paid_amount,
outstanding: Math.max(0, i.amount - i.paid_amount),
status: i.status,
dueDate: i.due_date,
paidAt: i.paid_at,
});

const presentAdminTicket = (t) => ({
id: t.id,
customerKey: t.customer_key,
subject: t.subject,
message: t.message,
category: t.category,
status: t.status,
response: t.admin_response,
createdAt: t.created_at,
});

async function handleAdmin(request, response, url, method, body) {
const claims = requireAdmin(request, response);
if (!claims) return undefined;
const path = url.pathname.replace(/^\/admin/, '') || '/';

if (path === '/me' && method === 'GET') {
  return json(response, 200, {
    email: claims.email,
    role: claims.app_metadata?.role ?? 'allow-list',
    canWrite: true,
  });
}

if (path === '/dashboard' && method === 'GET') {
  const states = {};
  for (const d of devices) states[d.state] = (states[d.state] ?? 0) + 1;
  return json(response, 200, {
    customers: SEED_CUSTOMERS.length,
    devices: devices.length,
    restrictedDevices: devices.filter((d) => ['RESTRICTED', 'SUSPENDED'].includes(d.state)).length,
    openTickets: supportTickets.filter((t) => t.status === 'OPEN').length,
    pendingPayments: payments.filter((p) => p.status === 'PENDING').length,
    outstandingAmount: installments
      .filter((i) => i.status !== 'PAID')
      .reduce((sum, i) => sum + Math.max(0, i.amount - i.paid_amount), 0),
    recentPayments: [...payments]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 8)
      .map(presentAdminPayment),
    deviceStates: states,
  });
}

if (path === '/customers' && method === 'GET') {
  const term = String(url.searchParams.get('q') ?? '').trim().toLowerCase();
  const items = SEED_CUSTOMERS.filter((c) =>
    !term
      ? true
      : [c.full_name, c.email, c.phone_number, c.id].some((field) =>
          String(field ?? '').toLowerCase().includes(term),
        ),
  );
  return json(response, 200, { items: items.map(presentAdminCustomer), total: SEED_CUSTOMERS.length });
}

const customerMatch = /^\/customers\/([^/]+)$/.exec(path);
if (customerMatch && method === 'GET') {
  const customer = SEED_CUSTOMERS.find((c) => c.id === decodeURIComponent(customerMatch[1]));
  if (!customer) return error(response, 404, 'not_found', 'No such customer.');
  const plan = installments.filter((i) => i.customer_key === customer.id);
  const device = devices.find((d) => d.customer_key === customer.id) ?? null;
  const paid = plan.reduce((sum, i) => sum + i.paid_amount, 0);
  const total = plan.reduce((sum, i) => sum + i.amount, 0);
  return json(response, 200, {
    customer: presentAdminCustomer(customer),
    device: device ? presentAdminDevice(device) : null,
    installments: plan.map(presentAdminInstallment),
    payments: payments.filter((p) => p.customer_key === customer.id).map(presentAdminPayment),
    tickets: supportTickets.filter((t) => t.customer_key === customer.id).map(presentAdminTicket),
    totals: {
      totalPrice: total,
      paidAmount: paid,
      outstandingAmount: Math.max(0, total - paid),
      paidInstallments: plan.filter((i) => i.status === 'PAID').length,
      totalInstallments: plan.length,
    },
  });
}

if (path === '/payments' && method === 'GET') {
  const status = url.searchParams.get('status');
  const customer = url.searchParams.get('customer');
  return json(response, 200, {
    items: payments
      .filter((p) => (!status || p.status === status) && (!customer || p.customer_key === customer))
      .map(presentAdminPayment),
  });
}

if (path === '/devices' && method === 'GET') {
  const state = url.searchParams.get('state');
  return json(response, 200, {
    items: devices.filter((d) => !state || d.state === state).map(presentAdminDevice),
  });
}

if (path === '/tickets' && method === 'GET') {
  const status = url.searchParams.get('status');
  return json(response, 200, {
    items: supportTickets.filter((t) => !status || t.status === status).map(presentAdminTicket),
  });
}

if (path === '/notifications' && method === 'GET') {
  return json(response, 200, {
    items: [...notifications]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((n) => ({
        id: n.id,
        customerKey: n.customer_key,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: Boolean(n.is_read),
        createdAt: n.created_at,
      })),
  });
}

if (path === '/audit' && method === 'GET') {
  return json(response, 200, { items: adminAudit.slice(0, 50) });
}

// ---- actions ------------------------------------------------------------

const reverifyMatch = /^\/payments\/([^/]+)\/reverify$/.exec(path);
if (reverifyMatch && method === 'POST') {
  const payment = payments.find((p) => p.transaction_id === decodeURIComponent(reverifyMatch[1]));
  if (!payment) return error(response, 404, 'not_found', 'No such payment.');

  // Exactly as on the server: ask the gateway, and record only its answer.
  // There is deliberately no way to mark a payment paid from here.
  const order = [...gatewayOrders.values()].find((o) => o.paymentId === payment.transaction_id);
  const confirmed = order?.settled === 'SUCCESS';
  if (confirmed) settlePayment(order, 'SUCCESS');
  audit(claims.email, 'payment.reverify', payment.transaction_id, body.reason ?? null);

  return json(response, 200, {
    status: 'ok',
    payment: { id: payment.transaction_id, status: payment.status },
    message: confirmed
      ? 'The gateway confirmed this payment and it is now recorded.'
      : 'The gateway has not confirmed this payment yet. Nothing was changed.',
  });
}

const stateMatch = /^\/devices\/([^/]+)\/state$/.exec(path);
if (stateMatch && method === 'POST') {
  const device = devices.find((d) => d.id === decodeURIComponent(stateMatch[1]));
  if (!device) return error(response, 404, 'not_found', 'No such device.');
  if (!DEVICE_STATES.includes(body.state)) {
    return error(response, 422, 'validation', 'Unknown device state.');
  }
  // A reason is required, not optional: "unlock this phone" without one is an
  // opinion with a button.
  if (!body.reason || String(body.reason).trim().length < 4) {
    return error(response, 422, 'validation', 'A reason is required.');
  }
  const from = device.state;
  device.state = body.state;
  device.last_sync_time = now;
  audit(claims.email, 'device.state', device.id, String(body.reason), { from, to: body.state });
  return json(response, 200, { status: 'ok', device: presentAdminDevice(device) });
}

const replyMatch = /^\/tickets\/([^/]+)\/reply$/.exec(path);
if (replyMatch && method === 'POST') {
  const ticket = supportTickets.find((t) => t.id === decodeURIComponent(replyMatch[1]));
  if (!ticket) return error(response, 404, 'not_found', 'No such ticket.');
  if (!body.response || String(body.response).trim().length < 2) {
    return error(response, 422, 'validation', 'A reply is required.');
  }
  ticket.admin_response = String(body.response);
  ticket.status = body.status === 'OPEN' ? 'OPEN' : 'RESOLVED';
  audit(claims.email, 'ticket.reply', ticket.id, String(body.response));
  return json(response, 200, { status: 'ok', id: ticket.id });
}

if (path === '/notifications' && method === 'POST') {
  if (!body.customerKey || !body.title || !body.message) {
    return error(response, 422, 'validation', 'A customer, a title and a message are required.');
  }
  if (!SEED_CUSTOMERS.some((c) => c.id === body.customerKey)) {
    return error(response, 404, 'not_found', 'No such customer.');
  }
  const id = `notif-${randomUUID().slice(0, 8)}`;
  notifications.unshift({
    id,
    customer_key: body.customerKey,
    type: body.type ?? 'GENERAL',
    title: body.title,
    message: body.message,
    is_read: false,
    reference_id: null,
    created_at: now,
  });
  audit(claims.email, 'notification.send', id, body.title);
  return json(response, 200, { status: 'ok', id });
}

return error(response, 404, 'not_found', 'Not Found');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);

  // -------------------------------------------------------------------------
  // The admin panel's API, in the same shape as the Laravel controllers.
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    return handleAdmin(request, response, url, request.method ?? 'GET', await readBody(request));
  }

  // The simulated gateway
//
// This is what a real bKash/Nagad page does, minus the money: it shows the
// amount and the method, the customer confirms, and only then does this server
// record a verified result. It exists so the app's real hand-off — order,
// gateway, callback, status poll — can be exercised end to end without a
// gateway account. The callback route below is the stand-in for the signature
// check a real integration performs.
// ---------------------------------------------------------------------------

  if (/^\/gateway\/[^/]+$/.test(url.pathname) && request.method === 'GET') {
    const order = gatewayOrders.get(decodeURIComponent(url.pathname.split('/')[2]));
    if (!order) return error(response, 404, 'not_found', 'That order has expired.');

    return html(
      response,
      200,
      gatewayPage({
        title: `${order.gateway.toUpperCase()} — simulated payment`,
        heading: `${order.gateway.toUpperCase()}`,
        subheading: 'Simulated payment page',
        amount: order.amount,
        rows: [
          ['Merchant', 'Srabon Telecom'],
          ['Order', order.orderId],
          ['Reference', order.paymentId],
        ],
        formAction: `/gateway/${order.orderId}/confirm`,
        payLabel: `Pay ${taka(order.amount)}`,
        cancelAction: `/gateway/${order.orderId}/cancel`,
      }),
    );
  }

  if (/^\/gateway\/[^/]+\/confirm$/.test(url.pathname) && request.method === 'POST') {
    const order = gatewayOrders.get(decodeURIComponent(url.pathname.split('/')[2]));
    if (!order) return error(response, 404, 'not_found', 'That order has expired.');
    settlePayment(order, 'SUCCESS');
    return html(
      response,
      200,
      gatewayPage({
        title: 'Payment complete',
        heading: 'Payment received',
        subheading: `${taka(order.amount)} recorded against ${order.paymentId}`,
        tone: 'success',
      }),
    );
  }

  if (/^\/gateway\/[^/]+\/cancel$/.test(url.pathname) && request.method === 'POST') {
    const order = gatewayOrders.get(decodeURIComponent(url.pathname.split('/')[2]));
    if (!order) return error(response, 404, 'not_found', 'That order has expired.');
    // Cancelling at the gateway is not a declined payment: the order simply never
    // completes, and the status endpoint keeps reporting PENDING.
    return html(
      response,
      200,
      gatewayPage({
        title: 'Cancelled',
        heading: 'Cancelled',
        subheading: `No money was taken. ${order.paymentId} is still pending and can be paid again.`,
        tone: 'neutral',
      }),
    );
  }

  if (request.method === 'OPTIONS') {
    return json(response, 204, {});
  }

  const hasSession = Boolean(request.headers.authorization);
  console.log(
    `  ${request.method} ${url.pathname}${hasSession ? '  [session]' : '  [anon] '}`,
  );

  try {
    if (url.pathname.startsWith('/auth/v1')) {
      return await handleAuth(request, response, url);
    }
    if (url.pathname.startsWith('/rest/v1')) {
      if (!hasValidApiKey(request)) {
        return error(response, 401, 'no_api_key', 'No API key found in request');
      }
      return await handleRest(request, response, url);
    }
    if (url.pathname === '/customer' || url.pathname.startsWith('/customer/')) {
      return await handleCustomer(request, response, url);
    }
  } catch (e) {
    return error(response, 500, 'server_error', String(e?.message ?? e));
  }

  return error(response, 404, 'not_found', 'Not Found');
});

seedDemoUser();
seedAdminUser();

/**
 * `--supervise` restarts the mock if it exits.
 *
 * The supervisor is a *parent* that holds no port, because the process that
 * does is the one that can be killed by a signal no handler can catch — a
 * same-process `exit` hook would never run. A dev stack served to a phone
 * through a tunnel should not go quiet just because one connection was dropped.
 * Development only, like everything else in this file.
 */
if (process.argv.includes('--supervise') && process.env.MOCK_CHILD !== '1') {
  const runChild = () => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, MOCK_CHILD: '1' },
    });
    child.on('exit', (code, signal) => {
      if (signal === 'SIGTERM' || signal === 'SIGINT' || code === 0) {
        process.exit(code ?? 0);
      }
      console.error(`  mock stopped (${signal ?? `exit ${code}`}) — restarting in 1s.`);
      setTimeout(runChild, 1000);
    });
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => process.exit(0));
  }
  runChild();
}
server.on('error', (err) => {
  console.error(`  [mock] server error: ${err.message}`);
  // A busy port is worth waiting for — usually a previous instance shutting
  // down — rather than exiting into the supervisor's restart loop.
  if (err.code === 'EADDRINUSE') {
    console.error(`  [mock] port ${PORT} is busy — retrying in 2s.`);
    setTimeout(() => server.listen(PORT, HOST), 2000);
    return;
  }
  if (err.code === 'EACCES') {
    console.error(`  [mock] not allowed to bind ${PORT}.`);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  const reachable = lanAddresses();

  console.log('');
  console.log('  Mock services (development only)');
  console.log(`    Supabase Auth   http://${HOST}:${PORT}/auth/v1`);
  console.log(`    PostgREST       http://${HOST}:${PORT}/rest/v1`);
  console.log(`    Customer API    http://${HOST}:${PORT}/customer`);

  if (reachable.length > 0) {
    // `127.0.0.1` means "this machine", which a phone or a second browser
    // cannot reach. These addresses can, as long as the two are on the same
    // network — which is the whole reason `npm run dev:mock:lan` exists.
    console.log('');
    console.log('  Reachable from another device on this network:');
    for (const address of reachable) {
      console.log(`    http://${address}:${PORT}`);
    }
  }

  console.log('');
  console.log('  Start the app against it with:');
  console.log(`    EXPO_PUBLIC_SUPABASE_URL=http://${HOST}:${PORT} \\`);
  console.log(`    EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY} npm run dev:mock:app`);
  console.log('');
  console.log('  Sign in with  asifghe78@gmail.com  /  Passw0rd!   (seeded)');
  console.log('  or create a new account with any address.');
  console.log('');
  console.log(`  Admin panel    ${DEMO_ADMIN.email}  /  ${DEMO_ADMIN.password}`);
  console.log('');
});
