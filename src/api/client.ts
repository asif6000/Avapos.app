import { API_BASE_URL, DEFAULT_TIMEOUT_MS, MAX_RETRIES, RETRYABLE_METHODS } from './config';
import {
  ApiError,
  extractFieldErrors,
  extractSafeMessage,
  statusToKind,
  defaultMessageFor,
  type ErrorKind,
} from './errors';
import { isExpired, secureTokenStorage, type TokenStorage } from '@/auth/tokenStorage';
import { notifySessionExpired } from '@/auth/sessionEvents';
import type { ApiEnvelope } from '@/types/api';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Skip the Authorization header (login, OTP). */
  anonymous?: boolean;
  /** Caller-owned cancellation, combined with the internal timeout. */
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export type SessionListener = () => void | Promise<void>;

export interface ApiClientOptions {
  baseUrl?: string;
  storage?: TokenStorage;
  fetchImpl?: typeof fetch;
  onSessionExpired?: SessionListener;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface InternalConfig {
  baseUrl: string;
  storage: TokenStorage;
  fetchImpl: typeof fetch;
  onSessionExpired?: SessionListener;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}

function buildUrl(
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

/**
 * Centralized HTTP client.
 *
 * - attaches the customer session token to every authenticated request
 * - refreshes an expired token exactly once, with a shared in-flight lock
 * - normalizes every failure into a customer-safe `ApiError`
 * - retries only idempotent reads, with exponential backoff
 * - never logs request/response bodies, headers or credentials
 */
export class ApiClient {
  private readonly config: InternalConfig;
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(options: ApiClientOptions = {}) {
    this.config = {
      baseUrl: options.baseUrl ?? API_BASE_URL,
      storage: options.storage ?? secureTokenStorage,
      fetchImpl: options.fetchImpl ?? fetch,
      onSessionExpired: options.onSessionExpired ?? notifySessionExpired,
      now: options.now ?? (() => Date.now()),
      sleep: options.sleep ?? defaultSleep,
    };
  }

  get baseUrl(): string {
    return this.config.baseUrl;
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
          const recovered = await this.tryRefresh();
          if (recovered) {
            continue;
          }
          await this.config.onSessionExpired?.();
        }
        lastError = apiError;
        const canRetry =
          attempt < maxRetries && apiError.isRetryable && !options.signal?.aborted;
        if (!canRetry) break;
        await this.config.sleep(2 ** attempt * 500);
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

  async performRequest<T>(
    path: string,
    options: RequestOptions,
    method: HttpMethod,
    attempt = 0,
  ): Promise<T> {
    const { storage, fetchImpl } = this.config;
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    try {
      let token: string | null = null;
      if (!options.anonymous) {
        const tokens = await storage.get();
        if (!tokens) {
          throw new ApiError({ kind: 'unauthorized', message: defaultMessageFor('unauthorized') });
        }
        if (isExpired(tokens, 30_000) && attempt === 0) {
          const refreshed = await this.refreshTokens();
          if (!refreshed) {
            throw new ApiError({
              kind: 'unauthorized',
              message: defaultMessageFor('unauthorized'),
            });
          }
        }
        const current = await storage.get();
        if (!current) {
          throw new ApiError({ kind: 'unauthorized', message: defaultMessageFor('unauthorized') });
        }
        token = current.accessToken;
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetchImpl(buildUrl(this.config.baseUrl, path, options.query), {
        method,
        headers,
        signal: controller.signal,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });

      const payload = await readBody(response);

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
      throw new ApiError({ kind: 'network', message: defaultMessageFor('network') });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  /**
   * Refreshes the session token. Concurrent callers share a single in-flight
   * refresh so a burst of 401s produces exactly one rotation.
   */
  private async refreshTokens(): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      const tokens = await this.config.storage.get();
      if (!tokens) return null;
      try {
        const response = await this.config.fetchImpl(
          buildUrl(this.config.baseUrl, '/auth/refresh'),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ refreshToken: tokens.refreshToken }),
          },
        );
        if (!response.ok) {
          await this.config.storage.clear();
          return null;
        }
        const payload = await readBody(response);
        const data = unwrap<{ accessToken?: string; refreshToken?: string; expiresIn?: number }>(
          payload,
        );
        if (typeof data.accessToken !== 'string') {
          await this.config.storage.clear();
          return null;
        }
        const next: AuthTokensShape = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken ?? tokens.refreshToken,
          expiresAt: this.config.now() + (data.expiresIn ?? 3600) * 1000,
        };
        await this.config.storage.set(next);
        return next.accessToken;
      } catch {
        // A failed refresh never escalates to a crash; the caller surfaces 401.
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  private async tryRefresh(): Promise<boolean> {
    return (await this.refreshTokens()) !== null;
  }
}

type AuthTokensShape = { accessToken: string; refreshToken: string; expiresAt: number };

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) {
    return new ApiError({ kind: 'network', message: defaultMessageFor('network') });
  }
  return new ApiError({ kind: 'unknown', message: defaultMessageFor('unknown') });
}

function buildHttpError(status: number, payload: unknown): ApiError {
  const kind = statusToKind(status);
  const message = extractSafeMessage(payload, defaultMessageFor(kind));
  const code =
    payload && typeof payload === 'object' && typeof (payload as { code?: unknown }).code === 'string'
      ? ((payload as { code: string }).code)
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

function unwrap<T>(payload: unknown): T {
  if (payload === null || payload === undefined) return null as T;
  if (typeof payload === 'object' && 'success' in (payload as Record<string, unknown>)) {
    const envelope = payload as ApiEnvelope<T>;
    if (envelope.success === true) return envelope.data;
  }
  return payload as T;
}

export const apiClient = new ApiClient();
