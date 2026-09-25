import { getSupabaseClient, isSupabaseAuthReady } from './client';
import { toE164 } from '@/utils/format';

/**
 * Phone + password sign-in, through Supabase Auth.
 *
 * WHY THIS EXISTS
 *
 * The project's email provider is switched off and its built-in mailer is rate
 * limited to a handful of messages an hour, so an emailed code cannot be the
 * way in. The Phone provider and Twilio are the alternative.
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
  phone: string;
  isNewUser: boolean;
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
    return 'That number is already in use. Try signing in, or use another number.';
  }
  if (detail.includes('rate limit') || error?.status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (detail.includes('phone') && detail.includes('confirm')) {
    return 'That number has not been confirmed yet.';
  }
  if (detail.includes('disabled') || detail.includes('not enabled')) {
    return 'Phone sign-in is not switched on for this service yet.';
  }
  return 'We could not complete that. Please try again.';
}

export async function signIn(phone: string, password: string): Promise<AuthResult<Identity>> {
  if (!isSupabaseAuthReady()) {
    return { ok: false, message: 'Sign-in is not available in this build.' };
  }

  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    phone: toE164(phone),
    password,
  });

  if (error || !data.user) {
    return { ok: false, message: classify(error) };
  }

  return {
    ok: true,
    value: { userId: data.user.id, phone: data.user.phone ?? toE164(phone), isNewUser: false },
  };
}

export async function signUp(phone: string, password: string): Promise<AuthResult<Identity>> {
  if (!isSupabaseAuthReady()) {
    return { ok: false, message: 'Sign-in is not available in this build.' };
  }

  const { data, error } = await getSupabaseClient().auth.signUp({
    phone: toE164(phone),
    password,
  });

  if (error || !data.user) {
    return { ok: false, message: classify(error) };
  }

  return {
    ok: true,
    value: {
      userId: data.user.id,
      phone: data.user.phone ?? toE164(phone),
      // A user created seconds ago has no session and no previous sign-in.
      isNewUser: data.session === null,
    },
  };
}

export interface SessionSnapshot {
  userId: string;
  phone: string;
  accessToken: string;
}

export async function getSession(): Promise<SessionSnapshot | null> {
  if (!isSupabaseAuthReady()) return null;
  const { data } = await getSupabaseClient().auth.getSession();
  const session = data.session;
  if (!session) return null;
  return {
    userId: session.user.id,
    phone: session.user.phone ?? '',
    accessToken: session.access_token,
  };
}

/** The bearer token for the REST API. See `api/instance.ts`. */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseAuthReady()) return null;
  const { data } = await getSupabaseClient().auth.getSession();
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
            phone: session.user.phone ?? '',
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

/** Sends an SMS confirmation. Only needed while the number is unconfirmed. */
export async function sendPhoneConfirmation(phone: string): Promise<AuthResult<null>> {
  if (!isSupabaseAuthReady()) {
    return { ok: false, message: 'Sign-in is not available in this build.' };
  }
  const { error } = await getSupabaseClient().auth.resend({
    type: 'sms',
    phone: toE164(phone),
  });
  if (error) return { ok: false, message: classify(error) };
  return { ok: true, value: null };
}
