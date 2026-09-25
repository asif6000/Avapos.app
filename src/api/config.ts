import Constants from 'expo-constants';

type RuntimeExtra = {
  apiBaseUrl?: unknown;
  eas?: { projectId?: unknown };
};

const extra = (Constants.expoConfig?.extra ?? {}) as RuntimeExtra;

const ENV_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * The API base URL is public by design: the app authenticates with a per-customer
 * session token. No secret is ever derived from or stored alongside it.
 *
 * `same-origin` (optionally with a path, e.g. `same-origin/customer`) resolves to
 * the origin that served the page, on a web build only. Same reasoning as
 * `resolveBase` in `src/supabase/client.ts`: it lets a phone on a tunnel or a LAN
 * address reach a dev server that is serving the app and the API from one origin,
 * with no CORS involved. It cannot resolve on a native build, where there is no
 * `window`, and no build profile configures it.
 */
function resolveApiBaseUrl(configured: string | undefined): string | null {
  if (typeof configured !== 'string' || configured.length === 0) return null;
  if (!configured.startsWith('same-origin')) return configured;
  if (typeof window === 'undefined' || typeof window.location?.origin !== 'string') return null;
  return configured.replace('same-origin', window.location.origin);
}

export const API_BASE_URL: string = (
  resolveApiBaseUrl(ENV_BASE_URL) ??
  (typeof extra.apiBaseUrl === 'string' ? extra.apiBaseUrl : 'https://srabontelecom.paymently.io/customer')
).replace(/\/+$/, '');

export const DEFAULT_TIMEOUT_MS = 20_000;

/** Only idempotent reads are retried. Writes are never retried automatically. */
export const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);

export const MAX_RETRIES = 2;

export const REQUEST_ID_HEADER = 'x-client-request-id';
