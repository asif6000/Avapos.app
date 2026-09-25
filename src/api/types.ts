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

/** Supplies the bearer token for the current request. */
export type TokenProvider = () => Promise<string | null>;

/** Called when the backend rejects the token. */
export type UnauthorizedHandler = () => void | Promise<void>;
