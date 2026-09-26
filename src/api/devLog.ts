/**
 * Development-only logging for every request the app makes.
 *
 * WHY THIS EXISTS
 *
 * "The requested information was not found." on the Home screen had exactly one
 * cause — `GET /customer/dashboard` answering 404 because that route is not
 * deployed — and nothing on the device said so. A customer sees two sentences;
 * whoever is holding the phone needs the URL, the status and the shape of the
 * response that came back. This is that, and it is confined to `__DEV__` so a
 * release build says nothing at all.
 *
 * WHAT IS NEVER LOGGED
 *
 * - the bearer token, or any part of it, or the session's refresh token
 * - request or response headers
 * - a response body. Only the *shape* of one: its top-level keys, and the length
 *   of a list. A body is a customer's name, phone number, address and money, and
 *   a console is not somewhere that belongs.
 * - an email address, which is a list of who has an account
 *
 * Identifiers are logged: the auth user id, the customer id, the contract id,
 * the installment id and the device id. Those are what the failure is about, they
 * are not secrets, and `__tests__/noSecretsInClient.test.ts` holds the line on
 * anything credential-shaped.
 */

import type { ErrorKind } from './errors';

/** True only in a development build. Every function here is a no-op otherwise. */
export function isDevLogging(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export interface RequestLogContext {
  method: string;
  url: string;
  /** Correlates the reply with the request that asked for it. */
  requestId?: string;
}

function header(line: string): string {
  return `[api]${line}`;
}

/**
 * A request is about to leave the device.
 *
 * The URL is logged because the base address is the single most useful fact when
 * a request is refused: a build pointed at the wrong host, or at a mock it cannot
 * reach, is the most common cause and it is invisible from the response.
 */
export function logRequestStart(context: RequestLogContext): void {
  if (!isDevLogging()) return;
  const id = context.requestId ? ` #${context.requestId}` : '';
  console.info(header(`→ ${context.method} ${context.url}${id}`));
}

export interface ResponseLogContext extends RequestLogContext {
  status: number;
  kind: ErrorKind | 'ok';
  durationMs: number;
  /** The response body. Only its shape is read. */
  payload?: unknown;
}

/**
 * A response arrived, or did not.
 *
 * `kind` is the classification the screen will branch on, logged next to the
 * status so a disagreement between the two is visible immediately. For a failure
 * the backend's own `message` is included, because that is where Laravel puts
 * "Unauthorized request" — the one word that separates "your session expired"
 * from "we have no customer for this account".
 */
export function logResponse(context: ResponseLogContext): void {
  if (!isDevLogging()) return;

  const id = context.requestId ? ` #${context.requestId}` : '';
  const tail = `${context.status} ${context.kind} in ${Math.round(context.durationMs)}ms`;

  if (context.status >= 200 && context.status < 300) {
    console.info(header(`← ${context.method} ${context.url}${id} ${tail} ${describeShape(context.payload)}`));
    return;
  }

  console.warn(
    header(
      `← ${context.method} ${context.url}${id} ${tail} ${describeShape(context.payload)} ${
        backendMessage(context.payload) ?? ''
      }`.trimEnd(),
    ),
  );
}

/**
 * What the customer is told when nothing arrived at all.
 *
 * The commonest cause of this on a web build is not a dead network: a browser
 * discards a response that carries no `Access-Control-Allow-Origin` header and
 * reports it exactly like an unreachable host. Naming the destination is the
 * difference between a one-minute fix and an afternoon.
 */
export function logUnreachable(context: RequestLogContext, reason: string): void {
  if (!isDevLogging()) return;
  const id = context.requestId ? ` #${context.requestId}` : '';
  console.warn(
    header(
      `✗ ${context.method} ${context.url}${id} was not answered: ${reason} — on a web build, check the API sends CORS headers`,
    ),
  );
}

export interface HomeStateLogContext {
  state: string;
  /** The Supabase auth user, or null when there is no session. */
  authUserId?: string | null;
  /** `profiles.id` — the customer and the profile are one row, by design. */
  customerId?: string | null;
  contractId?: string | null;
  installmentId?: string | null;
  deviceId?: string | null;
  errorKind?: ErrorKind | null;
  errorStatus?: number | null;
}

/**
 * The state Home resolved to, with every identifier the decision was made from.
 *
 * This is the line that answers "which query failed and for which account". It
 * names the auth user and the customer separately on purpose: those are two
 * different keys joined in the database, and a session that resolves to no
 * customer — the single most common broken state in this app — is invisible
 * unless both are printed.
 */
export function logHomeState(context: HomeStateLogContext): void {
  if (!isDevLogging()) return;
  const parts = [
    `state=${context.state}`,
    `authUserId=${context.authUserId ?? 'none'}`,
    `customerId=${context.customerId ?? 'none'}`,
    `contractId=${context.contractId ?? 'none'}`,
    `installmentId=${context.installmentId ?? 'none'}`,
    `deviceId=${context.deviceId ?? 'none'}`,
  ];
  if (context.errorKind) parts.push(`error=${context.errorKind}`);
  if (context.errorStatus != null) parts.push(`status=${context.errorStatus}`);
  console.info(header(`[home] ${parts.join(' ')}`));
}

/**
 * The shape of a payload: its top-level keys, and how long each list is.
 *
 * Deliberately lossy. Enough to tell "the server sent a customer but no plan"
 * from "the server sent a 200 and an HTML login page" without printing a single
 * value from either.
 */
export function describeShape(payload: unknown): string {
  if (payload === null || payload === undefined) return 'body=none';
  if (typeof payload !== 'object') return `body=${typeof payload}`;
  if (Array.isArray(payload)) return `body=array(${payload.length})`;

  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length === 0) return 'body={}';

  const described = entries.map(([key, value]) => {
    if (value === null) return `${key}=null`;
    if (Array.isArray(value)) return `${key}=array(${value.length})`;
    if (value === undefined) return `${key}=undefined`;
    return `${key}=${typeof value}`;
  });
  return `body={${described.join(', ')}}`;
}

/**
 * The backend's own short message, for the console only.
 *
 * Never for a customer — the copy in `DEFAULT_MESSAGES` is what reaches the
 * screen. `Unauthorized request` is the one that matters: it is the exact
 * difference between "this session expired" and "this account is not linked to a
 * customer record", and the two used to be indistinguishable on the device.
 */
function backendMessage(payload: unknown): string | null {
  if (typeof payload === 'string') return payload.slice(0, 120);
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail', 'title']) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) return `server said: ${value.slice(0, 120)}`;
    }
  }
  return null;
}

export interface RealtimeLogContext {
  table?: string;
  userId?: string;
  status?: string;
  tables?: number;
}

/**
 * One line per realtime lifecycle event: subscribing, connected, a change, and
 * the app going to the background.
 *
 * It is a log and not a query. The row contents are never printed — the payload
 * is only ever a hint to refetch, so printing it would suggest it is being used
 * for something it is not.
 */
export function logRealtime(event: string, context: RealtimeLogContext): void {
  if (!isDevLogging()) return;
  const parts = [`event=${event}`];
  if (context.table) parts.push(`table=${context.table}`);
  if (context.userId) parts.push(`userId=${context.userId}`);
  if (context.status) parts.push(`status=${context.status}`);
  if (context.tables != null) parts.push(`tables=${context.tables}`);
  console.info(header(`[realtime] ${parts.join(' ')}`));
}
