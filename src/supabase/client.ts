import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types';

/**
 * Supabase is the app's identity provider.
 *
 * Why this matters: row level security decides access by asking `auth.uid()`.
 * Without a real Supabase session, `auth.uid()` is NULL and every RLS policy
 * denies everything. So signing in here is what makes policy-scoped reads
 * possible at all — the Laravel API has no auth routes.
 *
 * SECURITY RULES ENFORCED HERE
 *
 * 1. Only the publishable / `anon` key is ever read. It is public by design; a
 *    `service_role` key bypasses RLS and must never reach a client bundle. If
 *    one is supplied, this module refuses to start rather than shipping it.
 * 2. Direct table *reads* are gated behind `EXPO_PUBLIC_SUPABASE_READS_ENABLED`,
 *    only "true" after `npm run verify:rls` proves an anonymous request can
 *    neither read nor write those tables. Default off, so a missing RLS policy
 *    fails closed. Authentication is deliberately NOT gated: signing in must
 *    not depend on a read-only feature flag.
 * 3. Nothing here writes to a table. Money, device state, agreement acceptance
 *   and enrollment stay on the REST API, which revalidates the contract and the
 *   gateway callback server-side.
 */

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const readsEnabled = process.env.EXPO_PUBLIC_SUPABASE_READS_ENABLED === 'true';

/**
 * `same-origin` means "the origin that served this page".
 *
 * It exists for one situation: a web build opened from a phone on a tunnel or a
 * LAN address, where the only reachable origin is the one serving the app. The
 * local mock publishes Supabase and the `/customer` API on that same origin, so
 * the app needs no absolute URL — and being same-origin means the browser makes
 * no preflight, so it works even against a server that sends no CORS headers.
 *
 * Development only, and inert unless the env var says so: `app.config.ts` and
 * `eas.json` pin the real project URL in every build profile, and a native build
 * has no `window` to resolve against, so this resolves to nothing there.
 */
const SAME_ORIGIN = 'same-origin';

function resolveBase(configured: string | undefined): string | undefined {
  if (!configured) return undefined;
  if (configured !== SAME_ORIGIN && !configured.startsWith(`${SAME_ORIGIN}/`)) return configured;
  if (typeof window === 'undefined' || typeof window.location?.origin !== 'string') {
    return undefined;
  }
  return configured.replace(SAME_ORIGIN, window.location.origin);
}

export const url = resolveBase(configuredUrl);

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

/**
 * A `service_role` key grants unrestricted database access and bypasses RLS
 * entirely. It is not "private" in the way a password is, but it must never
 * ship, so we fail loudly instead of quietly using it.
 */
export function looksLikeServiceRoleKey(key: string | undefined): boolean {
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return true;
  if (key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1] ?? '')) as { role?: string };
      return payload.role === 'service_role' || payload.role === 'postgres';
    } catch {
      return false;
    }
  }
  return false;
}

export type SupabaseConfigState =
  | { status: 'unconfigured' }
  | { status: 'blocked'; reason: string }
  | { status: 'ready' };

export function getSupabaseConfigState(): SupabaseConfigState {
  if (!url || url.length === 0) return { status: 'unconfigured' };
  if (!anonKey || anonKey.length === 0) return { status: 'unconfigured' };
  if (looksLikeServiceRoleKey(anonKey)) {
    return {
      status: 'blocked',
      reason:
        'A service_role key was supplied to the app. That key bypasses RLS and must never be bundled. Use the publishable/anon key.',
    };
  }
  if (!readsEnabled) {
    return {
      status: 'blocked',
      reason:
        'Direct table reads are disabled. Run `npm run verify:rls`, then set EXPO_PUBLIC_SUPABASE_READS_ENABLED=true.',
    };
  }
  return { status: 'ready' };
}

/** Auth is always required, so this ignores the read-only feature flag. */
export function isSupabaseAuthReady(): boolean {
  if (!url || url.length === 0) return false;
  if (!anonKey || anonKey.length === 0) return false;
  return !looksLikeServiceRoleKey(anonKey);
}

/**
 * Whether direct table reads are permitted right now.
 *
 * Deliberately separate from `isSupabaseAuthReady()`. Authentication is never
 * gated — signing in must not depend on a read-only feature flag — but reads are
 * off until `npm run verify:rls` proves RLS is on. Conflating the two would
 * mean that enabling auth silently enabled reads.
 */
export function canReadDirectly(): boolean {
  return getSupabaseConfigState().status === 'ready';
}

/** The client for table queries, or null when reads are not permitted. */
export function getSupabaseReadClient(): SupabaseClient<Database> | null {
  return canReadDirectly() ? getSupabaseClient() : null;
}

let client: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;
  if (!isSupabaseAuthReady()) {
    throw new SupabaseConfigError('Supabase is not configured for this build.');
  }
  client = createClient<Database>(url as string, anonKey as string, {
    auth: {
      // The session holds the JWT the RLS policies are evaluated against, so it
      // must survive an app restart or the customer would silently lose access.
      // AsyncStorage is correct for a *Supabase* session; the app's own customer
      // tokens live in SecureStore.
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: { headers: { 'x-client-info': 'srabon-customer-app' } },
  });
  return client;
}

export const SUPABASE_URL = url;
