/**
 * Guards around direct Supabase reads.
 *
 * The app reads customer rows straight from PostgREST. That is only acceptable
 * if the publishable key cannot see another customer's data, and if a
 * misconfiguration stops the app rather than shipping a leak. These tests cover
 * that fail-closed behaviour.
 */

function loadEnv(vars: Record<string, string | undefined>) {
  jest.resetModules();
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    process.env = previous;
  };
}

const URL = 'https://vslediphrlrlhrormmxh.supabase.co';
const ANON = 'anon-key-placeholder';
const SERVICE_ROLE = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
  JSON.stringify({ role: 'service_role' }),
).toString('base64')}.signature`;

describe('supabase client configuration', () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  it('is unconfigured when the env vars are missing', () => {
    restore = loadEnv({ EXPO_PUBLIC_SUPABASE_URL: undefined, EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined });
    const { getSupabaseConfigState } = require('@/supabase/client') as typeof import('@/supabase/client');
    expect(getSupabaseConfigState()).toEqual({ status: 'unconfigured' });
  });

  it('is blocked while reads are not explicitly enabled', () => {
    restore = loadEnv({
      EXPO_PUBLIC_SUPABASE_URL: URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON,
      EXPO_PUBLIC_SUPABASE_READS_ENABLED: 'false',
    });
    const { getSupabaseConfigState } = require('@/supabase/client') as typeof import('@/supabase/client');
    const state = getSupabaseConfigState();
    expect(state.status).toBe('blocked');
    expect(state.status === 'blocked' && state.reason).toMatch(/verify:rls/);
  });

  it('is ready only with a url, a key, and reads enabled', () => {
    restore = loadEnv({
      EXPO_PUBLIC_SUPABASE_URL: URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON,
      EXPO_PUBLIC_SUPABASE_READS_ENABLED: 'true',
    });
    const { getSupabaseConfigState, isSupabaseConfigured } = require('@/supabase/client') as typeof import('@/supabase/client');
    expect(getSupabaseConfigState()).toEqual({ status: 'ready' });
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('refuses a service_role key even when reads are enabled', () => {
    restore = loadEnv({
      EXPO_PUBLIC_SUPABASE_URL: URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: SERVICE_ROLE,
      EXPO_PUBLIC_SUPABASE_READS_ENABLED: 'true',
    });
    const { getSupabaseConfigState, isSupabaseConfigured } = require('@/supabase/client') as typeof import('@/supabase/client');
    const state = getSupabaseConfigState();
    expect(state.status).toBe('blocked');
    expect(state.status === 'blocked' && state.reason).toMatch(/bypasses RLS/);
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('refuses the newer sb_secret_ key form', () => {
    restore = loadEnv({
      EXPO_PUBLIC_SUPABASE_URL: URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_abc123',
      EXPO_PUBLIC_SUPABASE_READS_ENABLED: 'true',
    });
    const { getSupabaseConfigState } = require('@/supabase/client') as typeof import('@/supabase/client');
    expect(getSupabaseConfigState().status).toBe('blocked');
  });

  it('never returns a client while blocked, so no query can run', () => {
    restore = loadEnv({
      EXPO_PUBLIC_SUPABASE_URL: URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON,
      EXPO_PUBLIC_SUPABASE_READS_ENABLED: 'false',
    });
    const { getSupabaseClient } = require('@/supabase/client') as typeof import('@/supabase/client');
    expect(getSupabaseClient()).toBeNull();
  });
});

describe('supabase read queries', () => {
  it('accepts no customer identifier parameter at all', () => {
    // The ownership filter is the RLS policy, not a query argument, so there is
    // nothing for a tampered client to change.
    const source = require('node:fs').readFileSync(
      require.resolve('../src/supabase/queries.ts'),
      'utf8',
    ) as string;
    expect(source).not.toMatch(/customer_id\s*[:=]\s*(params|props|arg)/);
    expect(source).not.toMatch(/eq\(['"]customer_id['"]/);
  });
});
