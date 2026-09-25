export type ErrorKind =
  | 'network'
  | 'timeout'
  | 'offline'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limit'
  | 'server'
  | 'unknown';

/**
 * Normalized error thrown by the API client. Never contains SQL text, stack
 * traces, credentials or internal backend paths.
 */
export class ApiError extends Error {
  readonly kind: ErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly fieldErrors: Record<string, string[]>;

  constructor(params: {
    kind: ErrorKind;
    message: string;
    status?: number | null;
    code?: string | null;
    fieldErrors?: Record<string, string[]>;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.kind = params.kind;
    this.status = params.status ?? null;
    this.code = params.code ?? null;
    this.fieldErrors = params.fieldErrors ?? {};
  }

  get isAuthError(): boolean {
    return this.kind === 'unauthorized';
  }

  get isRetryable(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      this.kind === 'rate_limit' ||
      this.kind === 'server'
    );
  }
}

export function statusToKind(status: number): ErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'unknown';
}

const DEFAULT_MESSAGES: Record<ErrorKind, string> = {
  network: 'Unable to reach our servers. Please try again.',
  timeout: 'The request took too long. Please try again.',
  offline: "You're offline. We'll sync when your connection returns.",
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: "You don't have access to this information.",
  not_found: 'The requested information was not found.',
  validation: 'Please check the highlighted fields and try again.',
  conflict: 'This action conflicts with the current state. Please refresh.',
  rate_limit: 'Too many requests. Please wait a moment and try again.',
  server: 'Our servers are having trouble. Please try again shortly.',
  unknown: 'Something went wrong. Please try again.',
};

export function defaultMessageFor(kind: ErrorKind): string {
  return DEFAULT_MESSAGES[kind];
}

const SAFE_DETAIL_KEYS = new Set([
  'message',
  'error',
  'detail',
  'title',
]);

/**
 * Pulls a customer-safe message out of a backend payload. Any field that looks
 * like a database error, stack trace, path, or secret is discarded rather than
 * displayed.
 */
export function extractSafeMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    return isSafeDetail(payload) ? payload : fallback;
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of SAFE_DETAIL_KEYS) {
      const value = record[key];
      if (typeof value === 'string' && isSafeDetail(value)) {
        return value;
      }
    }
  }
  return fallback;
}

const UNSAFE_PATTERNS: RegExp[] = [
  /select\s+.+\s+from/i,
  /insert\s+into/i,
  /update\s+.+\s+set/i,
  /\b(sqlstate|pg_|sequelize|prisma|mysql|sqlite)\b/i,
  /\/api\/|\/var\/www|\/home\/[a-z]/i,
  /at\s+[\w.$]+\s+\(/,
  /\b(secret|api[_-]?key|password|bearer)\b/i,
  /exception|traceback|stack trace/i,
];

export function isSafeDetail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 240) return false;
  return !UNSAFE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function extractFieldErrors(payload: unknown): Record<string, string[]> {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidate = record['errors'] ?? record['fieldErrors'];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const out: Record<string, string[]> = {};
      for (const [field, value] of Object.entries(candidate as Record<string, unknown>)) {
        if (Array.isArray(value)) {
          out[field] = value.filter((item): item is string => typeof item === 'string');
        } else if (typeof value === 'string') {
          out[field] = [value];
        }
      }
      return out;
    }
  }
  return {};
}
