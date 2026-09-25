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
 */
export const API_BASE_URL: string =
  (typeof ENV_BASE_URL === 'string' && ENV_BASE_URL.length > 0
    ? ENV_BASE_URL
    : typeof extra.apiBaseUrl === 'string'
      ? extra.apiBaseUrl
      : 'https://srabontelecom.paymently.io/customer').replace(/\/+$/, '');

export const DEFAULT_TIMEOUT_MS = 20_000;

/** Only idempotent reads are retried. Writes are never retried automatically. */
export const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);

export const MAX_RETRIES = 2;

export const REQUEST_ID_HEADER = 'x-client-request-id';
