import { ApiClient } from '@/api/client';
import { ApiError, isCustomerFacingDetail, isSafeDetail, statusToKind } from '@/api/errors';
import { createMemoryTokenStorage } from '@/auth/tokenStorage';

const BASE = 'https://api.test.local/customer';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeClient(fetchImpl: jest.Mock, storage = createMemoryTokenStorage()) {
  return new ApiClient({
    baseUrl: BASE,
    storage,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => undefined,
  });
}

const validTokens = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() + 3_600_000,
};

describe('ApiClient', () => {
  it('sends the session token on authenticated requests', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ success: true, data: { id: 'c1' } }));
    const client = makeClient(fetchImpl, createMemoryTokenStorage(validTokens));

    await client.get('/customer/profile');

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('omits the Authorization header on anonymous requests', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ success: true, data: { ok: true } }));
    const client = makeClient(fetchImpl, createMemoryTokenStorage(validTokens));

    await client.post('/auth/login', { phone: '8801' }, { anonymous: true });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('refuses to call the API when no session exists', async () => {
    const fetchImpl = jest.fn();
    const client = makeClient(fetchImpl as unknown as jest.Mock);

    await expect(client.get('/devices/me')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes once on 401 and replays the original request', async () => {
    const storage = createMemoryTokenStorage(validTokens);
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { accessToken: 'access-2', expiresIn: 3600 } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'd1' } }));
    const client = makeClient(fetchImpl, storage);

    const result = await client.get<{ id: string }>('/devices/me');

    expect(result).toEqual({ id: 'd1' });
    expect((await storage.get())?.accessToken).toBe('access-2');
    const replayHeaders = (fetchImpl.mock.calls[2]?.[1] as RequestInit).headers as Record<string, string>;
    expect(replayHeaders.Authorization).toBe('Bearer access-2');
  });

  it('clears tokens and reports unauthorized when refresh fails', async () => {
    const storage = createMemoryTokenStorage(validTokens);
    const expired = jest.fn();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'invalid refresh' }, 401));
    const client = new ApiClient({
      baseUrl: BASE,
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onSessionExpired: expired,
      sleep: async () => undefined,
    });

    await expect(client.get('/devices/me')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(await storage.get()).toBeNull();
    expect(expired).toHaveBeenCalled();
  });

  it('shares a single refresh between concurrent 401s', async () => {
    const storage = createMemoryTokenStorage(validTokens);
    let protectedCalls = 0;
    let refreshCalls = 0;

    const fetchImpl = jest.fn(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse({ success: true, data: { accessToken: 'access-2', expiresIn: 3600 } });
      }
      protectedCalls += 1;
      if (protectedCalls <= 2) {
        return jsonResponse({ message: 'expired' }, 401);
      }
      return jsonResponse({ success: true, data: { protectedCalls } });
    });
    const client = makeClient(fetchImpl, storage);

    await Promise.all([client.get('/a'), client.get('/b')]);

    expect(refreshCalls).toBe(1);
  });

  it('does not retry non-idempotent writes', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ message: 'server error' }, 500));
    const client = makeClient(fetchImpl, createMemoryTokenStorage(validTokens));

    await expect(client.post('/payments/create', {})).rejects.toMatchObject({ kind: 'server' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries idempotent reads with backoff', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'gateway' }, 502))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true } }));
    const client = makeClient(fetchImpl, createMemoryTokenStorage(validTokens));

    await expect(client.get('/installments')).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('never surfaces SQL or stack-trace text from a backend error', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ message: 'select * from customers - ERESOLVE syntax error at /api/x' }, 400),
    );
    const client = makeClient(fetchImpl, createMemoryTokenStorage(validTokens));

    const error = await client.get('/installments').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).not.toMatch(/select \*|ERESOLVE|\/api\//);
  });

  it('never shows the server HTTP vocabulary to a customer', async () => {
    // A 404 that says "Not Found" is the server's wording, not ours.
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ status: 'error', message: 'Not Found' }, 404),
    );
    const client = makeClient(fetchImpl, createMemoryTokenStorage(validTokens));

    const error = (await client
      .get('/installments')
      .catch((e: unknown) => e)) as ApiError;

    expect(error.kind).toBe('not_found');
    expect(error.message).not.toMatch(/^not found$/i);
    expect(error.message).toBe('The requested information was not found.');
  });

  it('replaces generic backend text for other statuses too', async () => {
    for (const [status, text, kind] of [
      [500, 'Internal Server Error', 'server'],
      [403, 'Forbidden', 'forbidden'],
      [409, 'Conflict', 'conflict'],
    ] as const) {
      const fetchImpl = jest.fn(async () => jsonResponse({ message: text }, status));
      const client = makeClient(fetchImpl, createMemoryTokenStorage(validTokens));
      const error = (await client.get('/devices/me').catch((e: unknown) => e)) as ApiError;
      expect(error.kind).toBe(kind);
      expect(error.message).not.toBe(text);
    }
  });

  it('still shows a human-written validation message', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ message: 'That code has expired. Request a new one.' }, 422),
    );
    const client = makeClient(fetchImpl, createMemoryTokenStorage(validTokens));

    const error = (await client
      .get('/installments')
      .catch((e: unknown) => e)) as ApiError;

    expect(error.message).toBe('That code has expired. Request a new one.');
  });

  it('normalizes HTTP status codes to customer-safe error kinds', () => {
    expect(statusToKind(400)).toBe('validation');
    expect(statusToKind(401)).toBe('unauthorized');
    expect(statusToKind(403)).toBe('forbidden');
    expect(statusToKind(404)).toBe('not_found');
    expect(statusToKind(409)).toBe('conflict');
    expect(statusToKind(422)).toBe('validation');
    expect(statusToKind(429)).toBe('rate_limit');
    expect(statusToKind(500)).toBe('server');
    expect(statusToKind(503)).toBe('server');
  });

  it('rejects unsafe backend detail strings', () => {
    expect(isSafeDetail('Your payment is overdue.')).toBe(true);
    expect(isSafeDetail('SQLSTATE[42P01]: relation missing')).toBe(false);
    expect(isSafeDetail('at Object.<anonymous> (/src/api/x.ts:1:1)')).toBe(false);
    expect(isSafeDetail('api_key=abcdef')).toBe(false);
  });

  it('rejects generic HTTP vocabulary even when it looks harmless', () => {
    expect(isSafeDetail('Not Found')).toBe(true);
    expect(isCustomerFacingDetail('Not Found')).toBe(false);
    expect(isCustomerFacingDetail('Your payment is overdue.')).toBe(true);
  });
});
