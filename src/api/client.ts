import { API_BASE_URL, DEFAULT_TIMEOUT_MS, MAX_RETRIES, RETRYABLE_METHODS } from './config';
import {
  logRequestStart,
  logResponse,
  logUnreachable,
} from './devLog';
import {
  ApiError,
  defaultMessageFor,
  extractFieldErrors,
  extractSafeMessage,
  refineKind,
  type ErrorKind,
} from './errors';
import type { HttpMethod, RequestOptions, TokenProvider, UnauthorizedHandler } from './types';

export type { HttpMethod, RequestOptions, TokenProvider, UnauthorizedHandler };

/**
 * Centralized HTTP client.
 *
 * The bearer token is a Supabase JWT supplied by the caller (see
 * `api/instance.ts`). Supabase owns issuing and refreshing it, so this client
 * deliberately has **no** refresh logic and stores nothing of its own: a 401
 * means the session is gone, and the only honest response is to sign out.
 *
 * - never retries a write
 * - normalizes every failure into a customer-safe `ApiError`
 * - never logs bodies, headers or credentials
 */
export class ApiClient {
  private readonly origin: string;
  /** Only set in tests. When absent, the global fetch is resolved per call. */
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly getToken: TokenProvider;
  private readonly onUnauthorized: UnauthorizedHandler;

  constructor(options: {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    getToken?: TokenProvider;
    onUnauthorized?: UnauthorizedHandler;
    sleep?: (ms: number) => Promise<void>;
  } = {}) {
    this.origin = (options.baseUrl ?? API_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl;
    this.getToken = options.getToken ?? (async () => null);
    this.onUnauthorized = options.onUnauthorized ?? (() => undefined);
    this.sleepFn = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get baseUrl(): string {
    return this.origin;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const maxRetries = options.retries ?? (RETRYABLE_METHODS.has(method) ? MAX_RETRIES : 0);

    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.performRequest<T>(path, options, method);
      } catch (error) {
        const apiError = toApiError(error);

        if (apiError.kind === 'unauthorized' && !options.anonymous) {
          // The token was rejected. Supabase refreshes it if it can; if it
          // cannot, the session is gone and only a sign-out is honest.
          await this.onUnauthorized();
        }

        lastError = apiError;
        const canRetry = attempt < maxRetries && apiError.isRetryable && !options.signal?.aborted;
        if (!canRetry) break;
        await this.sleepFn(2 ** attempt * 500);
      }
    }

    throw lastError ?? new ApiError({ kind: 'unknown', message: defaultMessageFor('unknown') });
  }

  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  patch<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  private async performRequest<T>(
    path: string,
    options: RequestOptions,
    method: HttpMethod,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    try {
      let token: string | null = null;
      if (!options.anonymous) {
        try {
          token = await this.getToken();
        } catch {
          // A token provider that throws is a configuration or session problem,
          // not a network problem. Reporting it as `network` makes the app look
          // offline when it is actually unauthenticated.
          token = null;
        }
        if (!token) {
          throw new ApiError({
            kind: 'unauthorized',
            message: defaultMessageFor('unauthorized'),
          });
        }
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Resolved per call, not captured in the constructor: on React Native the
      // global fetch is installed by the runtime after modules are evaluated, so
      // a reference captured at construction can be undefined. That made every
      // request fail as a "network" error without ever leaving the device.
      const doFetch = this.fetchImpl ?? globalThis.fetch;
      if (typeof doFetch !== 'function') {
        throw new ApiError({ kind: 'unknown', message: defaultMessageFor('unknown') });
      }

      const url = buildUrl(this.origin, path, options.query);
      const startedAt = Date.now();
      logRequestStart({ method, url });

      const response = await doFetch(url, {
        method,
        headers,
        signal: controller.signal,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });

      const payload = await readBody(response);

      // Every answer, not only the failures: the one thing that makes a
      // mis-pointed build obvious from a device is a line naming the URL that was
      // actually called, next to the status that came back from it.
      logResponse({
        method,
        url,
        status: response.status,
        kind: response.ok ? 'ok' : refineKind(response.status, payload),
        durationMs: Date.now() - startedAt,
        payload,
      });

      if (!response.ok) {
        throw buildHttpError(response.status, payload);
      }
      return unwrap<T>(payload);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (isAbortError(error)) {
        const kind: ErrorKind = options.signal?.aborted ? 'network' : 'timeout';
        throw new ApiError({ kind, message: defaultMessageFor(kind) });
      }
      if (__DEV__) {
        // The one failure here that arrives with no detail of its own. On a web
        // build the usual cause is not a dead network at all: the browser blocks
        // a response that carries no `Access-Control-Allow-Origin` header and
        // reports it exactly like an unreachable host, so the app says "unable
        // to reach our servers" while the server is answering perfectly well.
        // Logging the destination is the difference between a one-minute fix and
        // an afternoon. Never the token, never a body.
        logUnreachable(
          { method, url: buildUrl(this.origin, path, options.query) },
          error instanceof Error ? error.message : String(error),
        );
      }
      throw new ApiError({ kind: 'network', message: defaultMessageFor('network') });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError({ kind: 'network', message: defaultMessageFor('network') });
}

export function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions['query'],
): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${normalized}`;
  if (!query) return url;
  const pairs = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  if (pairs.length === 0) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${pairs.join('&')}`;
}

export function buildHttpError(status: number, payload: unknown): ApiError {
  const kind = refineKind(status, payload);
  const fallback = defaultMessageFor(kind);
  // The backend's own wording is only shown for validation failures, where it
  // is written for a human. A 404 that says "Not Found" is the server's
  // vocabulary, not something to put in front of a customer — and, refined above,
  // it is not even a statement about the customer.
  const message = kind === 'validation' ? extractSafeMessage(payload, fallback) : fallback;
  const code =
    payload && typeof payload === 'object' && typeof (payload as { code?: unknown }).code === 'string'
      ? (payload as { code: string }).code
      : null;

  return new ApiError({
    kind,
    message,
    status,
    code,
    fieldErrors: extractFieldErrors(payload),
  });
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text().catch(() => '');
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Unwraps a success payload.
 *
 * Tolerates the shapes a Laravel API realistically returns:
 *   { success: true, data: {...} }   explicit envelope
 *   { data: {...} }                   Laravel resource style
 *   { ...fields }                     bare payload
 *
 * A `success: false` envelope never reaches here: it only arrives with a
 * non-2xx status and is turned into an ApiError by `buildHttpError`.
 */
export function unwrap<T>(payload: unknown): T {
  if (payload === null || payload === undefined) return null as T;
  if (typeof payload !== 'object') return payload as T;

  const record = payload as Record<string, unknown>;
  if (record['success'] === true) return (record['data'] ?? null) as T;
  if ('data' in record && Object.keys(record).length <= 2) return (record['data'] ?? null) as T;
  return payload as T;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}
