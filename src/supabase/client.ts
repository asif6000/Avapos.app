import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types';

/**
 * Direct Supabase access from the app — read-only, RLS-scoped.
 *
 * SECURITY RULES ENFORCED HERE
 *
 * 1. Only the publishable / `anon` key is ever read. It is public by design; the
 *    `service_role` key bypasses RLS and must never reach a client bundle. If
 *    someone puts a service-role key in the env var, this module refuses to
 *    start rather than quietly shipping it.
 * 2. Reads are gated behind `EXPO_PUBLIC_SUPABASE_READS_ENABLED`, which is only
 *    set to "true" after `npm run verify:rls` has proved that an anonymous
 *    request cannot read another customer's rows. Default is off, so a missing
 *    RLS policy fails closed.
 * 3. Nothing here writes. Money, device state, agreement acceptance and
 *    enrollment stay on the REST API, where the backend validates the session
 *    token and the payment gateway callback.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const readsEnabled = process.env.EXPO_PUBLIC_SUPABASE_READS_ENABLED === 'true';

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

/**
 * A `service_role` key grants unrestricted database access and bypasses RLS
 * entirely. It is not a "private" key in the same sense as a password, but it
 * must never ship, so we fail loudly rather than quietly using it.
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
        'Supabase reads are disabled. Run `npm run verify:rls`, then set EXPO_PUBLIC_SUPABASE_READS_ENABLED=true.',
    };
  }
  return { status: 'ready' };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigState().status === 'ready';
}

let client: SupabaseClient<Database> | null = null;

/** Returns the shared client, or null when direct reads are not usable. */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (client) return client;
  if (!isSupabaseConfigured()) return null;
  client = createClient<Database>(url as string, anonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The mobile app authenticates its own REST session; Supabase only ever
      // sees the customer's Supabase session for RLS-scoped reads.
      storage: undefined,
      detectSessionInUrl: false,
    },
    global: { headers: { 'x-client-info': 'srabon-customer-app' } },
  });
  return client;
}

export const SUPABASE_URL = url;
