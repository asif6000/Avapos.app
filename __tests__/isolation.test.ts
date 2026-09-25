import { ApiClient } from '@/api/client';
import { createEndpoints } from '@/api/endpoints';
import { createMemoryTokenStorage } from '@/auth/tokenStorage';

/**
 * Customer data isolation.
 *
 * The app never sends a customerId, deviceId or contractId to authorize
 * anything: every request is scoped by the session token alone. These tests
 * assert that property, plus what happens when the backend rejects a forged
 * identifier.
 */
describe('customer data isolation', () => {
  const BASE = 'https://api.test.local/api';

  const customerATokens = {
    accessToken: 'customer-a-token',
    refreshToken: 'a-refresh',
    expiresAt: Date.now() + 3_600_000,
  };

  function clientFor(tokens: typeof customerATokens) {
    const fetchImpl = jest.fn();
    const client = new ApiClient({
      baseUrl: BASE,
      storage: createMemoryTokenStorage(tokens),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => undefined,
    });
    return { client, endpoints: createEndpoints(client), fetchImpl };
  }

  it('never puts a customerId, deviceId or contractId in the request body', async () => {
    const { endpoints: api, fetchImpl } = clientFor(customerATokens);
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
    const { endpoints: api, fetchImpl } = clientFor(customerATokens);
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: { id: 'dev-A' } }),
    } as unknown as Response);

    await api.device.get();

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/devices/me`);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer customer-a-token');
    expect(url).not.toContain('customer-a');
  });

  it('requests "me" resources rather than a customer-chosen device id', async () => {
    const { endpoints: api, fetchImpl } = clientFor(customerATokens);
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: { deviceState: 'ACTIVE' } }),
    } as unknown as Response);

    await api.device.status();
    await api.device.sync();

    const urls = fetchImpl.mock.calls.map(([url]) => url);
    expect(urls).toEqual([`${BASE}/devices/me/status`, `${BASE}/devices/me/sync`]);
  });

  it('surfaces a 403 when the backend refuses a cross-customer request', async () => {
    const { endpoints: api, fetchImpl } = clientFor(customerATokens);
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
    const { endpoints: api, fetchImpl } = clientFor(customerATokens);
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: 'Forbidden' }),
    } as unknown as Response);

    await expect(api.installments.plan()).rejects.toMatchObject({ kind: 'forbidden' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('lets the backend reject a tampered payment amount', async () => {
    const { endpoints: api, fetchImpl } = clientFor(customerATokens);
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
    const { endpoints: api, fetchImpl } = clientFor(customerATokens);
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
