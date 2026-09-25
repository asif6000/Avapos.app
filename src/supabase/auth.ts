import { getSupabaseClient, isSupabaseAuthReady } from './client';

/**
 * Passwordless email sign-in against Supabase Auth.
 *
 * The emailed 6-digit code is exchanged for a session whose JWT is what RLS
 * evaluates, so `auth.uid()` is a real customer id rather than NULL. That is the
 * entire reason authentication lives here.
 *
 * No password exists anywhere in this flow.
 */

export type CodeRequestResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'unconfigured' | 'disabled' | 'rate_limited' | 'error';
      message: string | null;
    };

/**
 * Emails a sign-in code.
 *
 * `createUser: false` means Supabase will not mint an account for an address
 * that was never provisioned. With signups enabled the same call both creates
 * the user and issues the code, which is what makes signup and signin the same
 * action.
 */
export async function requestSignInCode(email: string): Promise<CodeRequestResult> {
  if (!isSupabaseAuthReady()) return { ok: false, reason: 'unconfigured', message: null };

  const client = getSupabaseClient();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true, emailRedirectTo: undefined },
  });

  if (!error) return { ok: true };

  const detail = `${error.message} ${(error as { code?: string }).code ?? ''}`;

  // "Signups not allowed for otp" means the Email provider's signup toggle is
  // off in the Supabase dashboard. Say so plainly rather than showing a code the
  // customer will never receive.
  if (/otp_disabled|signups? not allowed|signup/i.test(detail)) {
    return {
      ok: false,
      reason: 'disabled',
      message: 'Email sign-in is not switched on for this service yet.',
    };
  }

  // Supabase's built-in mailer allows only a handful of messages an hour. With
  // that cap, "try again soon" is genuinely the best advice, and saying
  // something vaguer would just send the customer round the loop.
  if (/rate limit|429|over_email/i.test(detail)) {
    return {
      ok: false,
      reason: 'rate_limited',
      message: 'Too many codes have been requested. Please wait a few minutes and try again.',
    };
  }

  return {
    ok: false,
    reason: 'error',
    // Deliberately not echoing the driver text: it can contain internals.
    message: 'We could not send a code right now. Please try again.',
  };
}

export type CodeVerification =
  | { ok: true; userId: string; email: string; isNewUser: boolean }
  | { ok: false; message: string };

export async function verifySignInCode(email: string, code: string): Promise<CodeVerification> {
  if (!isSupabaseAuthReady()) {
    return { ok: false, message: 'Sign-in is not available in this build.' };
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });

  if (error || !data.user) {
    const expired = /expired|has expired/i.test(error?.message ?? '');
    return {
      ok: false,
      message: expired
        ? 'That code has expired. Request a new one.'
        : 'That code is not correct. Try again.',
    };
  }

  return {
    ok: true,
    userId: data.user.id,
    email: data.user.email ?? email,
    // A user created moments ago has no name or device record yet.
    isNewUser: !data.user.last_sign_in_at,
  };
}

export interface SessionSnapshot {
  userId: string;
  email: string;
  accessToken: string;
}

/** The current session, or null. Used on boot and as the API bearer. */
export async function getSession(): Promise<SessionSnapshot | null> {
  if (!isSupabaseAuthReady()) return null;
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  const session = data.session;
  if (!session) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    accessToken: session.access_token,
  };
}

/**
 * The bearer token for the Laravel API.
 *
 * Supabase JWTs are sent to the backend, which validates them against the
 * project's JWKS before trusting a claim. That is what replaces the missing
 * `/auth/*` routes — see `backend/app/Http/Middleware/VerifySupabaseJwt.php`.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseAuthReady()) return null;
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export function onAuthStateChange(
  handler: (session: SessionSnapshot | null) => void,
): { unsubscribe: () => void } {
  if (!isSupabaseAuthReady()) return { unsubscribe: () => undefined };
  const client = getSupabaseClient();
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    handler(
      session
        ? {
            userId: session.user.id,
            email: session.user.email ?? '',
            accessToken: session.access_token,
          }
        : null,
    );
  });
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

export async function signOut(): Promise<void> {
  if (!isSupabaseAuthReady()) return;
  await getSupabaseClient().auth.signOut();
}

export async function resendSignInCode(email: string): Promise<CodeRequestResult> {
  return requestSignInCode(email);
}
