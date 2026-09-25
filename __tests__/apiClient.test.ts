import { ApiClient } from '@/api/client';
import { isCustomerFacingDetail, isSafeDetail, statusToKind } from '@/api/errors';

/**
 * The client no longer owns tokens: Supabase issues and refreshes the session
 * JWT, so the client just asks for it. What matters here is that it is attached
 * correctly, that a rotated session is used, that writes are never retried, and
 * that failures become customer-safe copy.
 */

const BASE = 'https://srabontelecom.paymently.io/customer';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeClient(
  fetchImpl: jest.Mock | undefined,
  getToken: () => Promise<string | null> = async () => 'supabase-jwt',
  onUnauthorized: () => void | Promise<void> = () => undefined,
) {
  return new ApiClient({
    baseUrl: BASE,
    fetchImpl: fetchImpl as unknown as typeof fetch | undefined,
    getToken,
    onUnauthorized,
    sleep: async () => undefined,
  });
}

describe('ApiClient', () => {
  it('sends the Supabase session JWT as the bearer token', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ id: 'CUST-23839' }));
    const client = makeClient(fetchImpl);

    await client.get('/profile');

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer supabase-jwt');
  });

  it('refuses an authenticated request when there is no session', async () => {
    const fetchImpl = jest.fn();
    const client = makeClient(fetchImpl as unknown as jest.Mock, async () => null);

    await expect(client.get('/profile')).rejects.toMatchObject({ kind: 'unauthorized' });
    // The request must never leave the device without a token.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('omits the Authorization header on anonymous requests', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ ok: true }));
    const client = makeClient(fetchImpl);

    await client.post('/auth/anything', { email: 'a@b.com' }, { anonymous: true });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('asks for a token per request, so a rotated session is picked up', async () => {
    const getToken = jest
      .fn<Promise<string | null>, []>()
      .mockResolvedValueOnce('jwt-1')
      .mockResolvedValueOnce('jwt-2');
    const fetchImpl = jest.fn(async () => jsonResponse({ ok: true }));
    const client = makeClient(fetchImpl, getToken);

    await client.get('/profile');
    await client.get('/profile');

    expect(getToken).toHaveBeenCalledTimes(2);
    const first = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const second = (fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect((first.headers as Record<string, string>).Authorization).toBe('Bearer jwt-1');
    expect((second.headers as Record<string, string>).Authorization).toBe('Bearer jwt-2');
  });

  it('signs the customer out when the backend rejects the token', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ message: 'Unauthorized request' }, 401));
    const onUnauthorized = jest.fn();
    const client = makeClient(fetchImpl, async () => 'expired-jwt', onUnauthorized);

    await expect(client.get('/profile')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not retry a write', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ message: 'server error' }, 500));
    const client = makeClient(fetchImpl);

    await expect(client.post('/payments/create', {})).rejects.toMatchObject({ kind: 'server' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries an idempotent read', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 502))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = makeClient(fetchImpl);

    await expect(client.get('/payments')).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('never surfaces SQL, stack traces or credentials from the backend', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ message: 'select * from profiles - ERESOLVE at /api/x.js:1' }, 400),
    );
    const client = makeClient(fetchImpl);

    const error = (await client.get('/payments').catch((e: unknown) => e)) as { message: string };
    expect(error.message).not.toMatch(/select \*|ERESOLVE|\.js:1/);
  });

  it('replaces the server HTTP vocabulary with customer-facing copy', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ message: 'Not Found' }, 404));
    const client = makeClient(fetchImpl);

    const error = (await client.get('/payments').catch((e: unknown) => e)) as {
      kind: string;
      message: string;
    };
    expect(error.kind).toBe('not_found');
    expect(error.message).toBe('The requested information was not found.');
  });

  it('still shows a human-written validation message', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ message: 'That code has expired. Request a new one.' }, 422),
    );
    const client = makeClient(fetchImpl);

    const error = (await client
      .post('/x', {}, { anonymous: true })
      .catch((e: unknown) => e)) as { message: string };
    expect(error.message).toBe('That code has expired. Request a new one.');
  });

  it('unwraps the three response envelopes a Laravel API may return', async () => {
    const cases: [unknown, unknown][] = [
      [{ success: true, data: { id: 1 } }, { id: 1 }],
      [{ data: { id: 2 } }, { id: 2 }],
      [{ id: 3 }, { id: 3 }],
    ];

    for (const [payload, expected] of cases) {
      const fetchImpl = jest.fn(async () => jsonResponse(payload));
      const client = makeClient(fetchImpl);
      await expect(client.get('/profile')).resolves.toEqual(expected);
    }
  });

  it('builds URLs under the /customer prefix with query parameters', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ items: [] }));
    const client = makeClient(fetchImpl);

    await client.get('/payments', { query: { page: 2, perPage: 20 } });

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${BASE}/payments?page=2&perPage=20`);
  });

  it('resolves the global fetch at call time, not when constructed', async () => {
    // On React Native the global fetch is installed after modules are evaluated.
    // Capturing it in the constructor left every request failing as a network
    // error without ever leaving the device.
    const original = globalThis.fetch;
    const calls: string[] = [];
    // A client built while the global is unusable must still work later.
    (globalThis as { fetch?: unknown }).fetch = undefined;
    const client = makeClient(undefined as unknown as jest.Mock);
    (globalThis as { fetch?: unknown }).fetch = ((url: string) => {
      calls.push(String(url));
      return Promise.resolve(jsonResponse({ id: 'CUST-1' }));
    }) as unknown as typeof fetch;

    try {
      await expect(client.get('/profile')).resolves.toEqual({ id: 'CUST-1' });
      expect(calls).toEqual([`${BASE}/profile`]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('logs where an unanswered request went, and never the token', async () => {
    // A browser rejects a response with no `Access-Control-Allow-Origin` header
    // exactly as it rejects an unreachable host, and the app can only report
    // "unable to reach our servers". Without this line there is nothing on screen
    // or in the console to tell those two apart.
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = makeClient(fetchImpl);

    try {
      await expect(client.get('/profile')).rejects.toMatchObject({ kind: 'network' });
      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).toContain(`${BASE}/profile`);
      expect(logged).toMatch(/CORS/);
      expect(logged).not.toContain('supabase-jwt');
    } finally {
      warn.mockRestore();
    }
  });

  it('classifies HTTP statuses into customer-safe error kinds', () => {
    expect(statusToKind(400)).toBe('validation');
    expect(statusToKind(401)).toBe('unauthorized');
    expect(statusToKind(403)).toBe('forbidden');
    expect(statusToKind(404)).toBe('not_found');
    expect(statusToKind(409)).toBe('conflict');
    expect(statusToKind(422)).toBe('validation');
    expect(statusToKind(429)).toBe('rate_limit');
    expect(statusToKind(500)).toBe('server');
  });

  it('rejects unsafe and generic backend text', () => {
    expect(isSafeDetail('Your payment is overdue.')).toBe(true);
    expect(isSafeDetail('SQLSTATE[42P01]: relation missing')).toBe(false);
    expect(isSafeDetail('at Object.<anonymous> (/src/api/x.ts:1:1)')).toBe(false);
    expect(isSafeDetail('api_key=abcdef')).toBe(false);
    // Short and harmless-looking, but still the server's own vocabulary.
    expect(isSafeDetail('Not Found')).toBe(true);
    expect(isCustomerFacingDetail('Not Found')).toBe(false);
  });
});
