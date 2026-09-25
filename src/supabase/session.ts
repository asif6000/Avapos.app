import { getSupabaseClient } from './client';

/**
 * Secondary Supabase session, used for one purpose only: giving RLS an
 * `auth.uid()` to scope reads with.
 *
 * The app's real identity is the REST session in `src/auth/`. Supabase is not
 * an identity provider here — it is a second, read-only session so that
 * `auth.uid()` is not NULL and the policies in `sql/03-owner-policies.sql` can
 * match a row to a customer.
 *
 * Consequence, stated plainly: this does NOT replace backend authorization.
 * Money, device state, agreement acceptance and enrollment all still go through
 * the REST API, which validates its own session token. A Supabase session grants
 * no ability to write anything.
 */

export type LinkState =
  | 'disabled' // Supabase reads are off; the app uses the API only
  | 'signed-out'
  | 'linked'
  | 'unlinked' // signed in to Supabase, but no profile row matches this email
  | 'error';

export interface LinkResult {
  state: LinkState;
  supabaseUserId: string | null;
  message: string | null;
}

/**
 * Establishes (or reuses) the Supabase session for `email`.
 *
 * Requires a Supabase magic link or email OTP to have been completed. When the
 * authenticated Supabase user has no row in `profiles` — the link step in
 * `sql/02-add-auth-link.sql` has not been backfilled for them — the result is
 * `unlinked` and the caller keeps reading through the API. That is a
 * recoverable state, not an error: the app stays fully usable without Supabase.
 */
export async function linkSupabaseSession(email: string): Promise<LinkResult> {
  const client = getSupabaseClient();
  if (!client) return { state: 'disabled', supabaseUserId: null, message: null };

  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) {
    return { state: 'signed-out', supabaseUserId: null, message: null };
  }

  const supabaseUserId = sessionData.session.user.id;

  // Confirm the auth user is actually mapped to a customer row. If it is not,
  // every policy returns no rows and the app would quietly show nothing.
  const { data: profile, error } = await client
    .from('profiles')
    .select('auth_uid')
    .eq('auth_uid', supabaseUserId)
    .maybeSingle();

  if (error) {
    return {
      state: 'error',
      supabaseUserId,
      message: 'Could not verify the account link.',
    };
  }

  if (!profile) {
    return {
      state: 'unlinked',
      supabaseUserId,
      message:
        'This account is not linked to a Supabase profile yet, so the app is reading through the API instead.',
    };
  }

  return { state: 'linked', supabaseUserId, message: null };
}

export type SupabaseLinkStatus = 'idle' | 'sent' | 'verifying' | 'linked' | 'unlinked' | 'error';

/**
 * Starts the Supabase email code flow.
 *
 * Deliberately a separate, explicit step the customer triggers, not something
 * that fires silently after REST sign-in: nobody should get a surprise second
 * email they did not ask for.
 *
 * `shouldCreateUser: false` means Supabase will not mint an account for an
 * address that was never provisioned. Without that, a typo could create an
 * orphan auth user that no `profiles` row matches.
 */
export async function requestSupabaseCode(email: string): Promise<SupabaseLinkStatus> {
  const client = getSupabaseClient();
  if (!client) return 'unlinked';
  const { error } = await client.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });
  return error ? 'error' : 'sent';
}

/** Exchanges the emailed Supabase code for the read-only session RLS needs. */
export async function verifySupabaseCode(
  email: string,
  code: string,
): Promise<{ status: SupabaseLinkStatus; message: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { status: 'unlinked', message: 'Supabase reads are disabled.' };

  const { error } = await client.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });

  if (error) {
    // Deliberately does not echo the driver message; it can contain internals.
    return { status: 'error', message: 'That code is not correct. Try again.' };
  }

  const link = await linkSupabaseSession(email);
  return { status: link.state === 'linked' ? 'linked' : 'unlinked', message: link.message };
}

export async function currentSupabaseUserId(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

export async function signOutSupabase(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}
