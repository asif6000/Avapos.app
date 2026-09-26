import { readFileSync } from 'node:fs';
import path from 'path';

import { ApiClient } from '@/api/client';
import { createEndpoints } from '@/api/endpoints';

const ROOT = path.resolve(__dirname, '..');

/** What a phone says about itself, forwarded so the server can match it. */
const REPORT = {
  androidId: 'a1b2c3d4e5f6a7b8',
  manufacturer: 'Samsung',
  model: 'Galaxy A15 5G',
  androidVersion: '14',
  sdkInt: 34,
  managed: false,
  managementStatus: 'NOT_ENROLLED' as const,
  enrollmentStatus: 'NOT_ENROLLED' as const,
};


/**
 * Customer data isolation.
 *
 * The app never sends a customerId, deviceId or contractId to authorize
 * anything: every request is scoped by the session token alone. These tests
 * assert that property, plus what happens when the backend rejects a forged
 * identifier.
 */
describe('customer data isolation', () => {
  const BASE = 'https://api.test.local/customer';

  // The bearer is the customer's Supabase JWT, issued by Supabase Auth.
  const customerAJwt = 'customer-a-supabase-jwt';

  function clientFor(token: string = customerAJwt) {
    const fetchImpl = jest.fn();
    const client = new ApiClient({
      baseUrl: BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getToken: async () => token,
      sleep: async () => undefined,
    });
    return { client, endpoints: createEndpoints(client), fetchImpl };
  }

  it('never puts a customerId, deviceId or contractId in the request body', async () => {
    const { endpoints: api, fetchImpl } = clientFor();
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: { id: 'pay-1' } }),
    } as unknown as Response);

    await api.payments.create({ installmentId: 'inst-1', gateway: 'bkash', amount: 2500 });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/payments/create`);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['amount', 'gateway', 'installmentId']);
    expect(body.customerId).toBeUndefined();
    expect(body.deviceId).toBeUndefined();
    expect(body.contractId).toBeUndefined();
  });

  it('scopes every request with the session token, not a supplied identity', async () => {
    const { endpoints: api, fetchImpl } = clientFor();
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: { id: 'dev-A' } }),
    } as unknown as Response);

    await api.device.get();

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/devices/me`);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${customerAJwt}`);
    expect(url).not.toContain('CUST');
  });

  it('requests "me" resources rather than a customer-chosen device id', async () => {
    const { endpoints: api, fetchImpl } = clientFor();
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: { deviceState: 'ACTIVE' } }),
    } as unknown as Response);

    await api.device.status();
    await api.device.sync(REPORT);

    const urls = fetchImpl.mock.calls.map(([url]) => url);
    expect(urls).toEqual([`${BASE}/devices/me/status`, `${BASE}/devices/me/sync`]);

    // A report describes the phone; it does not choose which phone is being read.
    // The URL is still `me`, so the token is the only thing scoping this.
    const sent = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body ?? '{}'));
    expect(Object.keys(sent)).toEqual(['report']);
  });

  it('surfaces a 403 when the backend refuses a cross-customer request', async () => {
    const { endpoints: api, fetchImpl } = clientFor();
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: "You don't have access to this information." }),
    } as unknown as Response);

    await expect(api.installments.detail('inst-owned-by-B')).rejects.toMatchObject({
      kind: 'forbidden',
      status: 403,
    });
  });

  it('does not retry a 403 or escalate it into a token refresh', async () => {
    const { endpoints: api, fetchImpl } = clientFor();
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: 'Forbidden' }),
    } as unknown as Response);

    await expect(api.installments.plan()).rejects.toMatchObject({ kind: 'forbidden' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('lets the backend reject a tampered payment amount', async () => {
    const { endpoints: api, fetchImpl } = clientFor();
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({ message: 'The amount does not match the installment.', errors: {} }),
    } as unknown as Response);

    await expect(
      api.payments.create({ installmentId: 'inst-1', gateway: 'bkash', amount: 1 }),
    ).rejects.toMatchObject({ kind: 'validation', status: 422 });
  });

  it('refuses to fake an unlock: state is only ever read from the server', async () => {
    const { endpoints: api, fetchImpl } = clientFor();
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: { id: 'dev-A', deviceState: 'RESTRICTED' } }),
    } as unknown as Response);

    const device = await api.device.get();

    expect(device.deviceState).toBe('RESTRICTED');
    // There is no endpoint that accepts a client-asserted device state.
    const apiKeys = Object.keys(api.device);
    expect(apiKeys).toEqual(['get', 'status', 'enroll', 'sync']);
  });
});

/**
 * The two sessions are each other's blind spot.
 *
 * A staff JWT is refused on every customer route and a customer JWT is refused on
 * every admin route, and the mock the demo runs against has to refuse them the
 * same way the deployed backend does — a mock that is more forgiving than the
 * server teaches the wrong lesson, and the wrong lesson here is that a panel
 * login can read a customer's account.
 */
describe('neither session is the other one', () => {
  const mock = readFileSync(path.join(ROOT, 'mock-server', 'server.mjs'), 'utf8');

  it('refuses a staff session on the customer API, without a second rule', () => {
    // The backend resolves a customer by `auth_uid` and a staff account has no
    // such row, so it is refused. The mock refuses it for that same reason rather
    // than for a second rule, so the two can never drift: one resolution, and a
    // staff token simply resolves to nothing.
    const start = mock.indexOf('function requireCustomer');
    const body = mock.slice(start, start + 900);

    expect(body).toContain('customerForAuthUser(claims.sub)');
    expect(body).not.toContain('isAdmin');
    expect(body).toContain("error(response, 401, 'unauthorized', 'Unauthorized request')");
  });

  it('does not let the session probe answer a staff token', () => {
    // `GET /customer` is a liveness probe with no customer data in it, and it
    // used to answer 200 to any token that parsed. A probe is still a door.
    const start = mock.indexOf("if (path === '/' && method === 'GET')");
    const branch = mock.slice(start, mock.indexOf("if (path === '", start + 10));

    expect(branch).toContain('requireCustomer(request, response)');
  });

  it('still refuses a customer session on the admin API', () => {
    expect(mock).toMatch(/function requireAdmin[\s\S]*?error\(response, 403, 'forbidden'/);
  });
});
