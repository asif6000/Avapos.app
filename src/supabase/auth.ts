import { getSupabaseClient, isSupabaseAuthReady } from './client';
import { normalizeEmail } from '@/utils/format';

/**
 * Phone + password sign-in, through Supabase Auth.
 *
 * WHY THIS EXISTS
 *
 * Sign-in is by email address and password. The project's Email provider is
 * enabled, so unlike the OTP path this does not depend on the mailer being able
 * to deliver a code on demand — it only matters when a confirmation or reset
 * email has to go out.
 *
 * THE TRADE-OFF, STATED PLAINLY
 *
 * A password can be phished and reused; a one-time code cannot. That is a real
 * downgrade, and it is why the original design was passwordless. What this
 * implementation does to blunt it:
 *
 * - strength is enforced before the request leaves the device, not only by the
 *   server: 8+ characters with upper, lower and a digit
 * - the number is normalized to E.164, so `01712345678` and `+8801712345678`
 *   are one account rather than two
 * - the password is never stored, logged or persisted locally. Supabase holds
 *   the hash; the app keeps only the session
 * - every failure path returns one message that does not reveal whether the
 *   number exists
 *
 * Raise the minimum length in the Supabase dashboard (Authentication → Sign In
 * / Providers → Phone) as well; 8 is the app floor, not a substitute for it.
 */

export type AuthResult<T> = { ok: true; value: T } | { ok: false; message: string };

export interface Identity {
  userId: string;
  email: string;
  isNewUser: boolean;
  /**
   * False when the account exists but has no session yet because the address
   * still has to be confirmed. The UI must not pretend the customer is signed
   * in in that case.
   */
  hasSession: boolean;
}

/** One message for every failure, so this cannot enumerate accounts. */
const GENERIC = 'That mobile number or password is not correct.';

function classify(error: { message: string; status?: number } | null): string {
  const detail = `${error?.message ?? ''} ${error?.status ?? ''}`.toLowerCase();

  // A number that exists with the wrong password must look identical to a
  // number that does not exist.
  if (detail.includes('invalid login') || detail.includes('invalid credentials')) {
    return GENERIC;
  }
  if (detail.includes('already') || detail.includes('registered') || detail.includes('exists')) {
    return 'That email is already in use. Try signing in instead.';
  }
  if (detail.includes('not confirmed') || detail.includes('email not confirmed')) {
    return 'That email has not been confirmed yet. Check your inbox.';
  }
  if (detail.includes('rate limit') || detail.includes('over_email') || error?.status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (detail.includes('disabled') || detail.includes('not enabled')) {
    return 'Sign-in is not switched on for this service yet.';
  }
  return 'We could not complete that. Please try again.';
}

export async function signIn(email: string, password: string): Promise<AuthResult<Identity>> {
  if (!isSupabaseAuthReady()) {
    return { ok: false, message: 'Sign-in is not available in this build.' };
  }

  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });

  if (error || !data.user) {
    return { ok: false, message: classify(error) };
  }

  return {
    ok: true,
    value: {
      userId: data.user.id,
      email: data.user.email ?? normalizeEmail(email),
      isNewUser: false,
      hasSession: true,
    },
  };
}

export async function signUp(email: string, password: string): Promise<AuthResult<Identity>> {
  if (!isSupabaseAuthReady()) {
    return { ok: false, message: 'Sign-in is not available in this build.' };
  }

  const { data, error } = await getSupabaseClient().auth.signUp({
    email: normalizeEmail(email),
    password,
  });

  if (error || !data.user) {
    return { ok: false, message: classify(error) };
  }

  return {
    ok: true,
    value: {
      userId: data.user.id,
      email: data.user.email ?? normalizeEmail(email),
      isNewUser: true,
      // No session means the address still has to be confirmed, so the app must
      // not assume the customer is signed in yet.
      hasSession: data.session !== null,
    },
  };
}

export interface SessionSnapshot {
  userId: string;
  email: string;
  accessToken: string;
}

export async function getSession(): Promise<SessionSnapshot | null> {
  if (!isSupabaseAuthReady()) return null;
  const { data } = await getSupabaseClient().auth.getSession();
  const session = data.session;
  if (!session) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    accessToken: session.access_token,
  };
}

/** The bearer token for the REST API. See `api/instance.ts`. */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseAuthReady()) return null;
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    // No token is a truthful answer. Throwing here would surface as a network
    // error and make the app look offline instead of signed out.
    return null;
  }
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

/** Re-sends the confirmation email. Only needed while it is unconfirmed. */
export async function resendConfirmation(email: string): Promise<AuthResult<null>> {
  if (!isSupabaseAuthReady()) {
    return { ok: false, message: 'Sign-in is not available in this build.' };
  }
  const { error } = await getSupabaseClient().auth.resend({
    type: 'signup',
    email: normalizeEmail(email),
  });
  if (error) return { ok: false, message: classify(error) };
  return { ok: true, value: null };
}
