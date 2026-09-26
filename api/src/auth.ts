/**
 * Supabase session verification, and the customer it belongs to.
 *
 * WHY THIS FILE IS THE ONE THAT MATTERS
 *
 * The Laravel service answered `401 Unauthorized` to a token that is provably
 * valid: it was signed by this project's key, its `sub` matched `profiles.auth_uid`,
 * and its signature verified against the JWKS. Whatever the deployed service was
 * doing, this is the part it got wrong, so it is the part written from scratch
 * and written carefully.
 *
 * THE ALGORITHM IS ES256, NOT RS256
 *
 * This project's signing key is ECDSA on P-256:
 *
 *   { "alg": "ES256", "crv": "P-256", "kty": "EC", ... }
 *
 * A verifier written for RS256 — which is what most JWT examples and several PHP
 * libraries default to — rejects it, and rejects it as a generic "unauthorized",
 * which is indistinguishable from a customer that does not exist. `jose` is used
 * here precisely because it reads `alg` and `crv` from the JWK rather than
 * assuming, so both ES256 and RS256 verify correctly and an unlisted one is
 * refused before any crypto runs.
 *
 * WHAT A VALID TOKEN DOES NOT BUY
 *
 * A signature proves who signed the session. It does not prove there is a
 * customer, so `resolveCustomer` is a second, separate step, and its failure is
 * reported as its own thing. A customer that cannot be found is not an
 * authentication failure, and the app treats them differently.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { config, db, type ProfileRow } from './supabase.js';

/** One hour, matching the longest-lived Supabase access token. */
const JWKS_CACHE_SECONDS = 3600;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl: string | null = null;

function keySetFor(url: string) {
  if (!jwks || jwksUrl !== url) {
    jwksUrl = url;
    jwks = createRemoteJWKSet(new URL(url), {
      // Key rotation must not require a deploy. Supabase publishes a new `kid`
      // and keeps the old one for a while; a remote set refetches on a miss.
      cooldownDuration: 30,
      cacheMaxAge: JWKS_CACHE_SECONDS * 1000,
    });
  }
  return jwks;
}

export type AuthFailure =
  | 'no_token'
  | 'bad_token'
  | 'wrong_project'
  | 'not_authenticated'
  | 'no_customer';

export interface AuthOk {
  ok: true;
  userId: string;
  email: string | null;
  customer: CustomerRecord;
}

export interface AuthErr {
  ok: false;
  reason: AuthFailure;
}

export type AuthResult = AuthOk | AuthErr;

/** What the rest of the service is allowed to know about the caller. */
export interface CustomerRecord {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  isEnrolled: boolean;
  createdAt: string | null;
}

function toCustomer(row: ProfileRow): CustomerRecord {
  return {
    id: row.id,
    fullName: row.full_name ?? '',
    email: row.email ?? null,
    phone: row.phone_number ?? null,
    language: row.language ?? null,
    isEnrolled: row.is_enrolled === true,
    createdAt: row.created_at ?? null,
  };
}

function checkClaims(payload: JWTPayload, projectRef: string): AuthFailure | null {
  const issuer = `https://${projectRef}.supabase.co/auth/v1`;

  if (payload.iss !== issuer) return 'wrong_project';
  if (payload.aud !== issuer) return 'wrong_project';
  // An `anon` token is a public key, not an identity. Refusing it here is what
  // stops a signed-in-but-anonymous request from resolving to a customer.
  if (payload.role !== 'authenticated') return 'not_authenticated';
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return 'bad_token';
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return 'bad_token';

  return null;
}

/**
 * Verify the bearer, then find the customer.
 *
 * The two failures stay separate on purpose. `no_customer` means the token was
 * good and this Supabase account has no `profiles` row — a link that is made
 * when a phone is sold, never by the customer. The app shows a different screen
 * for it than for a session it should re-issue.
 */
export async function authenticate(
  authorization: string | undefined,
  projectRef: string,
): Promise<AuthResult> {
  const header = authorization ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return { ok: false, reason: 'no_token' };

  const token = header.slice(7).trim();
  if (token.length === 0) return { ok: false, reason: 'no_token' };

  let payload: JWTPayload;
  try {
    // No `algorithms` allowlist: `jose` picks from the JWK's own `alg` and
    // refuses anything the key does not advertise, so `none` and an RSA key
    // swapped in for an EC one are both rejected before verification.
    ({ payload } = await jwtVerify(token, keySetFor(config.jwksUrl)));
  } catch {
    // Signature, expiry or key lookup. All three mean the same thing to a caller
    // and none of them is the caller's fault to fix.
    return { ok: false, reason: 'bad_token' };
  }

  const claimProblem = checkClaims(payload, projectRef);
  if (claimProblem) return { ok: false, reason: claimProblem };

  const { data, error } = await db()
    .from('profiles')
    .select('id, full_name, email, phone_number, language, is_enrolled, created_at')
    .eq('auth_uid', payload.sub as string)
    .maybeSingle();

  if (error) {
    // A database that cannot answer is a service failure, not a verdict about
    // this customer. Thrown rather than returned so it becomes a 503.
    throw new Error(`customer lookup failed: ${error.message}`);
  }
  if (!data) return { ok: false, reason: 'no_customer' };

  return {
    ok: true,
    userId: payload.sub as string,
    email: typeof payload.email === 'string' ? payload.email : null,
    customer: toCustomer(data as ProfileRow),
  };
}
