/**
 * Staff authentication for the `/admin` routes.
 *
 * WHY THIS IS SEPARATE FROM `authenticate()`
 *
 * `authenticate()` answers "is this a real customer?". This answers "is this a
 * member of staff?", and the difference is not a role flag — it is a different
 * authority with a different blast radius. A customer token that reached a sale
 * endpoint could create a contract on somebody else's account, which is the one
 * thing this whole service is built to make impossible.
 *
 * The check is on `app_metadata`, not on anything the caller can write:
 *
 *   user_metadata   — writable by the user themselves through
 *                     `supabase.auth.updateUser()`. A customer could put
 *                     `role: 'admin'` in their own profile and this service
 *                     would believe them.
 *   app_metadata    — only settable with the service-role key. A client cannot
 *                     reach it, so nothing on a phone can claim to be staff.
 *
 * That is the same reasoning the deployed Laravel panel uses
 * (`RequireAdmin.php`), and it is the only part of the check that matters.
 *
 * The sign-out path matters too: a staff session is revoked server-side, so a
 * staff member who leaves stops being staff without waiting for a token to
 * expire.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { config } from './supabase.js';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl: string | null = null;

function keySetFor(url: string) {
  if (!jwks || jwksUrl !== url) {
    jwksUrl = url;
    jwks = createRemoteJWKSet(new URL(url), { cooldownDuration: 30, cacheMaxAge: 3_600_000 });
  }
  return jwks;
}

export interface Staff {
  id: string;
  email: string | null;
}

export type StaffFailure = 'no_token' | 'bad_token' | 'not_staff';

export type StaffResult = { ok: true; staff: Staff } | { ok: false; reason: StaffFailure };

/** The roles this service treats as staff. Anything else is a customer. */
const STAFF_ROLES = new Set(['admin', 'staff']);

export async function authenticateStaff(authorization: string | undefined): Promise<StaffResult> {
  const header = authorization ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return { ok: false, reason: 'no_token' };

  const token = header.slice(7).trim();
  if (token.length === 0) return { ok: false, reason: 'no_token' };

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keySetFor(config.jwksUrl)));
  } catch {
    return { ok: false, reason: 'bad_token' };
  }

  // `iss` is strict so a token from another project cannot be replayed here.
  // `aud` is NOT compared to the issuer: Supabase issues `aud: "authenticated"`,
  // a literal audience class rather than a second copy of the issuer. Comparing
  // the two is what made the deployed service answer 401 to every valid session.
  const issuer = `https://${config.projectRef}.supabase.co/auth/v1`;
  if (payload.iss !== issuer) return { ok: false, reason: 'bad_token' };
  if (payload.aud !== 'authenticated' || payload.role !== 'authenticated') {
    return { ok: false, reason: 'not_staff' };
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return { ok: false, reason: 'bad_token' };

  // `app_metadata` only. See the note at the top of this file.
  const appMetadata = payload.app_metadata;
  const role =
    appMetadata && typeof appMetadata === 'object' && !Array.isArray(appMetadata)
      ? (appMetadata as { role?: unknown }).role
      : undefined;

  if (typeof role !== 'string' || !STAFF_ROLES.has(role)) return { ok: false, reason: 'not_staff' };

  return {
    ok: true,
    staff: { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : null },
  };
}
