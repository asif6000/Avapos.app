/**
 * `same-origin` — the development web build that talks to the origin serving it.
 *
 * A phone opening the app through a tunnel reaches one port, and that port can
 * only be the one serving the app. The mock publishes Supabase Auth and the
 * `/customer` API on that same origin, so the app needs no absolute URL — and
 * being same-origin means the browser makes no preflight, which is the only way
 * a web build can talk to a server that sends no CORS headers.
 *
 * Two properties matter and are pinned here:
 *
 * - it resolves, so the app works, on a web build
 * - it resolves to *nothing* on a native build, where there is no `window`, so a
 *   misconfigured production build cannot quietly send credentials somewhere
 *   unintended
 */

const ORIGINAL = { ...process.env };

function loadEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function setWindow(origin: string | null) {
  if (origin === null) {
    delete (globalThis as { window?: unknown }).window;
    return;
  }
  (globalThis as { window?: unknown }).window = { location: { origin } };
}

afterEach(() => {
  process.env = { ...ORIGINAL };
  delete (globalThis as { window?: unknown }).window;
  jest.resetModules();
});

describe('same-origin Supabase URL', () => {
  it('resolves to the origin that served the page', () => {
    setWindow('https://tunnel.example.app');
    loadEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'same-origin',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-placeholder',
      EXPO_PUBLIC_SUPABASE_READS_ENABLED: 'true',
    });
    jest.resetModules();

    const { url, isSupabaseAuthReady, getSupabaseConfigState } =
      require('@/supabase/client') as typeof import('@/supabase/client');

    expect(url).toBe('https://tunnel.example.app');
    expect(isSupabaseAuthReady()).toBe(true);
    expect(getSupabaseConfigState().status).toBe('ready');
  });

  it('resolves to nothing on a native build, rather than guessing', () => {
    // No `window` on React Native. Guessing here would be the dangerous option:
    // the app would either fail obscurely or, worse, fall back to a host nobody
    // chose.
    setWindow(null);
    loadEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'same-origin',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-placeholder',
    });
    jest.resetModules();

    const { url, isSupabaseAuthReady } = require('@/supabase/client') as typeof import('@/supabase/client');

    expect(url).toBeUndefined();
    expect(isSupabaseAuthReady()).toBe(false);
  });

  it('leaves a real project URL alone', () => {
    setWindow('https://tunnel.example.app');
    loadEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-placeholder',
    });
    jest.resetModules();

    const { url } = require('@/supabase/client') as typeof import('@/supabase/client');

    expect(url).toBe('https://project.supabase.co');
  });
});

describe('same-origin API base URL', () => {
  it('appends the /customer prefix to the serving origin', () => {
    setWindow('https://tunnel.example.app');
    loadEnv({ EXPO_PUBLIC_API_BASE_URL: 'same-origin/customer' });
    jest.resetModules();

    const { API_BASE_URL } = require('@/api/config') as typeof import('@/api/config');

    expect(API_BASE_URL).toBe('https://tunnel.example.app/customer');
  });

  it('falls back to the production host when it cannot resolve', () => {
    setWindow(null);
    loadEnv({ EXPO_PUBLIC_API_BASE_URL: 'same-origin/customer' });
    jest.resetModules();

    const { API_BASE_URL } = require('@/api/config') as typeof import('@/api/config');

    // Not a silent localhost: the app talks to the real host and says so, rather
    // than appearing to work in a demo it is not connected to.
    expect(API_BASE_URL).toBe('https://srabontelecom.paymently.io/customer');
  });
});
