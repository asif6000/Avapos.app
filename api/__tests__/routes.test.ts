/**
 * The routes, end to end, with a real ES256 signature and a stubbed database.
 *
 * WHY A REAL SIGNATURE MATTERS HERE
 *
 * The deployed service answered `401` to a token that was provably valid, and the
 * project's signing key is ES256 — ECDSA on P-256 — not RS256. A verifier built
 * for RS256 rejects it, and rejects it as a generic "unauthorized", which is
 * indistinguishable from a customer who does not exist. So this suite mints a
 * genuine ES256 token, publishes its key at a JWKS the service actually fetches,
 * and asserts the request is served. That failure mode cannot be unit-tested
 * away; it has to be signed for real.
 *
 * The database is stubbed because the second thing worth protecting is that every
 * read filters on the caller's own `customer_key`. A double can assert that
 * directly, which a live database cannot.
 */

import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, test } from 'node:test';

import { createLocalJWKSet, generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';

// The service reads its configuration at import time, so the environment has to
// be in place before anything from `src/` is loaded.
const PROJECT_REF = 'testref';
process.env.SUPABASE_PROJECT_REF = PROJECT_REF;
process.env.SUPABASE_URL = 'https://testref.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-not-a-real-key';
process.env.SUPABASE_JWKS_URL = 'http://127.0.0.1:9/jwks';

const { config } = await import('../dist/supabase.js');
const { customerRouter } = await import('../dist/customerRouter.js');
const { useSupabaseClientForTests } = await import('../dist/supabase.js');

type Query = { table: string; eq: Record<string, unknown>; order?: string; limit?: number; countOnly?: boolean };

/** Records every query so a test can assert on the ownership filter. */
class StubSupabase {
  readonly calls: Query[] = [];
  rows: Record<string, unknown[] | null> = {};
  countByTable: Record<string, number> = {};

  from(table: string) {
    return this.chain(table);
  }

  chain(table: string) {
    const call: Query = { table, eq: {} };
    this.calls.push(call);

    const state = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts.head) call.countOnly = true;
        return state;
      },
      eq: (column: string, value: unknown) => {
        call.eq[column] = value;
        return state;
      },
      neq: (column: string, value: unknown) => {
        call.eq[`neq:${column}`] = value;
        return state;
      },
      order: (column: string) => {
        call.order = column;
        return state;
      },
      limit: (n: number) => {
        call.limit = n;
        return state;
      },
      maybeSingle: async () => {
        const rows = this.rows[table] ?? null;
        // Apply the ownership filter the way PostgREST would, so a stub cannot
        // accidentally return a row the real query would have excluded.
        const filtered = applyFilter(rows, call);
        return { data: filtered[0] ?? null, error: null };
      },
      then: (resolve: (value: { data: unknown; error: null; count: number | null }) => unknown) => {
        const rows = applyFilter(this.rows[table] ?? null, call);
        return Promise.resolve(
          resolve({ data: rows, error: null, count: call.countOnly ? (this.countByTable[table] ?? rows.length) : null }),
        );
      },
    };
    return state;
  }
}

function applyFilter(rows: unknown[] | null, call: Query): unknown[] {
  if (!rows) return [];
  return rows.filter((row) =>
    Object.entries(call.eq).every(([column, value]) => {
      if (column.startsWith('neq:')) {
        return (row as Record<string, unknown>)[column.slice(4)] !== value;
      }
      return (row as Record<string, unknown>)[column] === value;
    }),
  );
}

const CUSTOMER = {
  id: 'CUST-23839',
  // The stub filters honestly, so the fixture has to carry what the real query
  // filters on. Without this every lookup misses and the failure looks like an
  // auth bug rather than a test-data bug.
  auth_uid: 'auth-user-1',
  full_name: 'Asif Hossain',
  email: 'asifghe78@gmail.com',
  phone_number: '+8801810902817',
  language: 'en',
  is_enrolled: true,
  created_at: '2026-09-25T14:29:06.188011+00:00',
};

const CONTRACT = {
  id: 'CONTRACT-BD-2026-902',
  customer_key: 'CUST-23839',
  device_name: 'Samsung Galaxy A15 5G',
  total_price: 25000,
  down_payment: 6500,
  paid_amount: 11500,
  remaining_amount: 13500,
  installment_amount: 2500,
  total_installments: 7,
  paid_installments: 2,
  remaining_installments: 5,
  next_due_date: '10 October 2026',
  next_due_amount: 2500,
  status: 'ACTIVE',
  created_at: '2026-09-25T14:29:06.188011+00:00',
};

const DEVICE = {
  id: 'DEV-SAM-A15-098',
  customer_key: 'CUST-23839',
  contract_id: 'CONTRACT-BD-2026-902',
  device_name: 'Samsung Galaxy A15 5G',
  manufacturer: 'Samsung',
  model: 'Galaxy A15 5G',
  android_version: '14',
  enrollment_status: 'ENROLLED',
  management_status: 'ENROLLED',
  state: 'ACTIVE',
  last_sync_time: '2026-09-25T15:00:00.000Z',
};

let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
let jwksServer: Server;
let api: Server;
let restore: () => void;
let stub: StubSupabase;
let issuer: string;

before(async () => {
  keyPair = await generateKeyPair('ES256', { extractable: true });
  const publicJwk: JWK = { ...(await exportJWK(keyPair.publicKey)), kid: 'test-es256', alg: 'ES256', use: 'sig' };

  // A JWKS the service really fetches, on a real socket, so `jose` exercises its
  // remote-fetch path rather than a local key set.
  jwksServer = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  const port = (jwksServer.address() as { port: number }).port;
  issuer = `https://${PROJECT_REF}.supabase.co/auth/v1`;
  (config as { jwksUrl: string }).jwksUrl = `http://127.0.0.1:${port}/jwks`;

  const express = (await import('express')).default;
  api = createServer();
  const app = express();
  app.use('/customer', customerRouter());
  api = createServer(app);
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));

  stub = new StubSupabase();
  restore = useSupabaseClientForTests(stub as never);
});

after(async () => {
  restore?.();
  await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  await new Promise<void>((resolve) => api.close(() => resolve()));
});

function apiBase(): string {
  return `http://127.0.0.1:${(api.address() as { port: number }).port}/customer`;
}

async function token(claims: Record<string, unknown> = {}, opts: { expiresIn?: string } = {}): Promise<string> {
  const { sub, ...rest } = claims as { sub?: string };
  return new SignJWT({ role: 'authenticated', email: CUSTOMER.email, ...rest })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-es256' })
    .setSubject(sub ?? 'auth-user-1')
    .setIssuer(issuer)
    .setAudience(issuer)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h')
    .sign(keyPair.privateKey);
}

async function get(path: string, auth?: string) {
  const response = await fetch(`${apiBase()}${path}`, {
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

describe('a real ES256 session is accepted', () => {
  // The regression that matters: the deployed service refused exactly this token.
  test('a token signed with the project key is served, not refused', async () => {
    stub.rows = { profiles: [CUSTOMER] };
    const { status, body } = await get('/', await token());
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.id, 'CUST-23839');
  });

  test('the issuer is checked, so another project’s token is refused', async () => {
    const foreign = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-es256' })
      .setSubject('auth-user-1')
      .setIssuer('https://someone-else.supabase.co/auth/v1')
      .setAudience('https://someone-else.supabase.co/auth/v1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);

    const { status, body } = await get('/', foreign);
    assert.equal(status, 401);
    assert.equal(body.code, 'wrong_project');
  });

  test('an expired token is refused', async () => {
    const expired = await token({}, { expiresIn: '-1h' });
    assert.equal((await get('/', expired)).status, 401);
  });

  test('a token signed by another key is refused', async () => {
    const other = await generateKeyPair('ES256', { extractable: true });
    const forged = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-es256' })
      .setSubject('auth-user-1')
      .setIssuer(issuer)
      .setAudience(issuer)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(other.privateKey);

    assert.equal((await get('/', forged)).status, 401);
  });

  test('a missing bearer is refused', async () => {
    assert.equal((await get('/')).status, 401);
  });
});

describe('a valid session with no customer is its own thing', () => {
  // The distinction the deployed service collapsed. 403 says "sign in again" is
  // pointless; the app shows a different screen for each.
  test('it is 403, not 401', async () => {
    stub.rows = { profiles: [] };
    const { status, body } = await get('/', await token());
    assert.equal(status, 403);
    assert.equal(body.code, 'customer_not_found');
  });
});

describe('the dashboard is assembled from the customer’s own rows', () => {
  before(() => {
    stub.rows = { profiles: [CUSTOMER], installment_contracts: [CONTRACT], devices: [DEVICE], notifications: [], support_tickets: [] };
  });

  test('it returns the shape the app already renders', async () => {
    const { status, body } = await get('/dashboard', await token());
    assert.equal(status, 200);
    assert.equal(body.customer.id, 'CUST-23839');
    assert.equal(body.customer.fullName, 'Asif Hossain');
    assert.equal(body.device.id, 'DEV-SAM-A15-098');
    assert.equal(body.plan.contractId, 'CONTRACT-BD-2026-902');
    assert.equal(body.plan.paidInstallments, 2);
    assert.equal(body.plan.remainingAmount, 13500);
    assert.equal(body.nextInstallment.number, 3);
    assert.equal(body.deviceStatus.deviceState, 'ACTIVE');
    // A computed schedule is labelled as one.
    assert.equal(body.plan.scheduleSource, 'derived');
  });

  test('every read filters on the caller’s own customer key', async () => {
    stub.calls.length = 0;
    await get('/dashboard', await token());
    assert.ok(stub.calls.length > 0);
    for (const call of stub.calls) {
      if (call.table === 'profiles') continue; // selected by auth_uid
      assert.equal(
        call.eq.customer_key,
        'CUST-23839',
        `${call.table} was queried without the owner filter`,
      );
    }
  });

  test('a different customer sees a different account, not this one', async () => {
    // A different auth user, so a different `profiles` row is resolved. The
    // contract and device below still belong to CUST-23839 and must not appear.
    const other = { ...CUSTOMER, id: 'CUST-OTHER', email: 'other@example.com', auth_uid: 'auth-user-2' };
    stub.rows = { profiles: [other], installment_contracts: [CONTRACT], devices: [DEVICE] };

    const { status, body } = await get('/dashboard', await token({ sub: 'auth-user-2' }));
    assert.equal(status, 200);
    assert.equal(body.customer.id, 'CUST-OTHER');
    // The contract belongs to CUST-23839, so CUST-OTHER gets no plan at all.
    assert.equal(body.plan, null);
    assert.equal(body.device, null);
  });
});

describe('a customer with no plan or phone is a real state, not an error', () => {
  test('an account with nothing sold on it still returns 200', async () => {
    stub.rows = { profiles: [CUSTOMER], installment_contracts: [], devices: [] };
    const { status, body } = await get('/dashboard', await token());
    assert.equal(status, 200);
    assert.equal(body.plan, null);
    assert.equal(body.device, null);
    assert.equal(body.nextInstallment, null);
  });
});

describe('a missing device is a 404 on that route only', () => {
  test('the dashboard still works', async () => {
    stub.rows = { profiles: [CUSTOMER], installment_contracts: [CONTRACT], devices: [] };
    assert.equal((await get('/dashboard', await token())).status, 200);
  });

  test('the device route says so', async () => {
    const { status } = await get('/devices/me', await token());
    assert.equal(status, 404);
  });
});

describe('the service is read-only', () => {
  test('a write is refused with 405, and never reaches a handler', async () => {
    const auth = await token();
    for (const [method, path] of [
      ['POST', '/payments/create'],
      ['POST', '/agreements/device-management/accept'],
      ['PATCH', '/profile'],
      ['POST', '/devices/me/sync'],
      ['DELETE', '/payments/anything'],
    ] as const) {
      const response = await fetch(`${apiBase()}${path}`, {
        method,
        headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : '{}',
      });
      assert.equal(response.status, 405, `${method} ${path} was not refused`);
      assert.equal((await response.json()).code, 'read_only');
    }
  });
});

describe('list routes keep the envelope the app pages with', () => {
  test('notifications come back paginated', async () => {
    stub.rows = {
      profiles: [CUSTOMER],
      notifications: [{ id: 'n1', customer_key: 'CUST-23839', type: 'GENERAL', title: 'Hi', message: 'There', is_read: false, reference_id: null, created_at: '2026-09-25T10:00:00Z' }],
    };
    const { status, body } = await get('/notifications', await token());
    assert.equal(status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.page, 1);
    assert.equal(body.hasMore, false);
    assert.equal(body.items[0].message, 'There');
  });

  test('tickets carry the fields SupportTicket declares', async () => {
    stub.rows = {
      profiles: [CUSTOMER],
      support_tickets: [{ id: 't1', customer_key: 'CUST-23839', subject: 'Query', message: 'When?', category: 'PAYMENT', status: 'OPEN', admin_response: null, created_at: '2026-09-25T10:00:00Z' }],
    };
    const { body } = await get('/support/tickets', await token());
    assert.deepEqual(Object.keys(body.items[0]).sort(), [
      'category', 'createdAt', 'id', 'message', 'respondedAt', 'response', 'status', 'subject', 'updatedAt',
    ]);
  });
});

// Keep the import used, so a future edit that drops it fails loudly.
void createLocalJWKSet;
