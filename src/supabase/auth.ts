import { getSupabaseClient, isSupabaseAuthReady, SUPABASE_URL } from './client';
import { normalizeEmail } from '@/utils/format';

/**
 * Email + password sign-in and sign-up, through Supabase Auth.
 *
 * WHY THIS EXISTS
 *
 * Supabase owns identity here. The customer API has no `/auth/*` routes to
 * call, and RLS is evaluated against `auth.uid()` — without a real session
 * every policy denies everything, so signing in here is what makes
 * policy-scoped reads possible at all. The session's JWT is also the bearer the
 * REST client sends.
 *
 * WHAT THIS MODULE GUARANTEES
 *
 * - one message for every credential failure, so the endpoint cannot be used to
 *   discover which addresses have accounts
 * - the customer-facing copy never mentions the transport, and never implies
 *   that an account exists (or does not)
 * - the password is never stored, logged or persisted locally. Supabase holds
 *   the hash; the app keeps only the session
 * - the address is normalized by the store before it arrives, so
 *   `Ayesha@Example.com` and `ayesha@example.com` are one account
 * - strength is enforced on the device in `app/(auth)/register.tsx`, so a weak
 *   password never leaves it. Raise the minimum in the dashboard too
 *   (Authentication → Sign In / Providers → Email); the app floor is not a
 *   substitute for it.
 *
 * WHY A REFUSED SIGN-IN IS LOGGED IN DEV ONLY
 *
 * "That email address or password is not correct." is the correct thing to show
 * a stranger, and a useless thing to show whoever is running the build. A
 * sign-in fails for very different reasons — no such address, wrong password,
 * an unconfirmed address, a mailer rate limit that stops new accounts being
 * created at all — and they all look identical from the outside on purpose. The
 * real cause goes to the console in `__DEV__`; production shows the one
 * message and nothing else.
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

/**
 * One message for every credential failure, so this cannot enumerate accounts.
 *
 * It has to name what the customer actually typed: sign-in here is by email
 * address, and copy that says otherwise is worse than no copy at all.
 */
const GENERIC = 'That email address or password is not correct.';

/** A transport failure, as opposed to a refusal. */
const UNREACHABLE = 'We could not reach the service. Check your connection and try again.';

interface AuthFailure {
  message: string;
  status?: number;
  code?: string;
}

/** The part of a Supabase user this module reads. */
interface AuthedUser {
  id: string;
  email?: string | null;
}

/**
 * The Supabase client *rejects* when the request cannot be made — a dead
 * network, a DNS failure, a host that is not there — instead of returning an
 * `error`. Left unguarded that rejection escapes as a raw `TypeError` and the
 * sign-in screen ends up with no message to show at all, which reads to the
 * customer as a button that does nothing. Every call goes through here so a
 * transport failure becomes the same kind of answer as any other refusal.
 */
async function attempt<T>(
  run: () => Promise<unknown>,
): Promise<{ data: T | null; error: AuthFailure | null }> {
  try {
    const result = (await run()) as { data?: T | null; error?: AuthFailure | null } | null;
    return { data: result?.data ?? null, error: result?.error ?? null };
  } catch (thrown) {
    return {
      data: null,
      error: {
        message: thrown instanceof Error ? thrown.message : String(thrown),
        code: 'transport',
      },
    };
  }
}

function classify(error: AuthFailure | null): string {
  const detail = `${error?.message ?? ''} ${error?.status ?? ''} ${error?.code ?? ''}`.toLowerCase();

  // An address that exists with the wrong password must look identical to one
  // that does not exist.
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
  // Checked last, and matched on the transport code rather than the wording:
  // "fetch" also appears in messages that are genuine refusals.
  if (error?.code === 'transport' || /network|load failed|failed to fetch/.test(detail)) {
    return UNREACHABLE;
  }
  return 'We could not complete that. Please try again.';
}

export async function signIn(email: string, password: string): Promise<AuthResult<Identity>> {
  if (!isSupabaseAuthReady()) {
    return { ok: false, message: 'Sign-in is not available in this build.' };
  }

  const { data, error } = await attempt<{ user: AuthedUser | null }>(() =>
    getSupabaseClient().auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    }),
  );
  const user = data?.user;

  if (error || !user) {
    if (__DEV__) {
      // Whoever is running the build needs the real cause; a customer does not.
      // The address is deliberately left out of this line: a console that
      // printed the address alongside the reason would be a list of who does and
      // does not have an account.
      console.warn(
        `[auth] signIn refused against ${SUPABASE_URL ?? 'an unconfigured project'}: ${diagnose(
          error,
          'no session returned',
        )}`,
      );
    }
    return { ok: false, message: classify(error) };
  }

  return {
    ok: true,
    value: {
      userId: user.id,
      email: user.email ?? normalizeEmail(email),
      isNewUser: false,
      hasSession: true,
    },
  };
}

/**
 * Why a request was refused, in words a developer can act on. Console only —
 * never shown to a customer, and never combined with the address they typed.
 */
function diagnose(error: AuthFailure | null, nothingReturned: string): string {
  const detail = `${error?.message ?? ''} ${error?.code ?? ''} ${error?.status ?? ''}`.toLowerCase();
  if (detail.includes('invalid login') || detail.includes('invalid credentials')) {
    return 'no such address, or the password is wrong';
  }
  if (detail.includes('not confirmed')) return 'the address has not been confirmed yet';
  if (detail.includes('over_email') || detail.includes('rate limit')) {
    return 'the mailer rate limit — new accounts cannot be created';
  }
  if (detail.includes('provider_disabled') || detail.includes('signup_disabled')) {
    return 'the email provider is disabled';
  }
  if (detail.includes('email_address_invalid')) return 'the address was rejected';
  if (error?.code === 'transport') {
    return 'the auth service could not be reached — check EXPO_PUBLIC_SUPABASE_URL';
  }
  if (!error) return nothingReturned;
  return error.code || error.message;
}

export async function signUp(email: string, password: string): Promise<AuthResult<Identity>> {
  if (!isSupabaseAuthReady()) {
    return { ok: false, message: 'Sign-in is not available in this build.' };
  }

  const { data, error } = await attempt<{ user: AuthedUser | null; session: unknown }>(() =>
    getSupabaseClient().auth.signUp({
      email: normalizeEmail(email),
      password,
    }),
  );
  const user = data?.user;

  if (error || !user) {
    if (__DEV__) {
      // The customer sees plain copy; the cause is logged for whoever is
      // running the build, because "could not create account" on a working app
      // is nearly always a project setting rather than a bug — an unconfirmed
      // address, or a mailer rate limit that blocks account creation outright.
      console.warn(
        `[auth] signUp refused against ${SUPABASE_URL ?? 'an unconfigured project'}: ${diagnose(
          error,
          'no account returned',
        )} — run \`npm run check:signup\``,
      );
    }
    return { ok: false, message: classify(error) };
  }

  return {
    ok: true,
    value: {
      userId: user.id,
      email: user.email ?? normalizeEmail(email),
      isNewUser: true,
      // No session means the address still has to be confirmed, so the app must
      // not assume the customer is signed in yet.
      hasSession: Boolean(data?.session),
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
  const { error } = await attempt(() =>
    getSupabaseClient().auth.resend({
      type: 'signup',
      email: normalizeEmail(email),
    }),
  );
  if (error) return { ok: false, message: classify(error) };
  return { ok: true, value: null };
}
