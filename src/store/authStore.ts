import { create } from 'zustand';

import { getSession, onAuthStateChange, signIn, signOut, signUp } from '@/supabase/auth';
import { canReadDirectly } from '@/supabase/client';
import { normalizeEmail } from '@/utils/format';

/**
 * Authentication state, backed by Supabase Auth.
 *
 * Email address and password. The session's
 * JWT is what row level security evaluates, so a signed-in customer gets a real
 * `auth.uid()` instead of NULL — which is what lets the policies in
 * `sql/03-owner-policies.sql` match rows to a person.
 *
 * The display name is held in memory until the backend exposes a profile
 * endpoint. The app never writes to `profiles` itself: that table is
 * server-authoritative.
 */

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface Profile {
  userId: string;
  email: string;
  fullName: string;
  isNewUser: boolean;
  /** False while the address is still awaiting email confirmation. */
  confirmed: boolean;
}

interface AuthState {
  status: AuthStatus;
  profile: Profile | null;
  error: string | null;
  /** Remembered so the sign-in screen can prefill the last address used. */
  lastEmail: string | null;
  /** False until `verify:rls` passes; drives the "direct reads" notice. */
  directReadsEnabled: boolean;
  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<Profile>;
  signUp: (email: string, password: string) => Promise<Profile>;
  setDisplayName: (fullName: string) => void;
  signOut: () => Promise<void>;
  clearError: () => void;
  subscribe: () => () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  profile: null,
  error: null,
  lastEmail: null,
  directReadsEnabled: canReadDirectly(),

  async bootstrap() {
    const session = await getSession();

    if (!session) {
      set({ status: 'unauthenticated', profile: null });
      return;
    }

    set({
      status: 'authenticated',
      lastEmail: session.email,
      profile: {
        userId: session.userId,
        email: session.email,
        fullName: get().profile?.fullName ?? '',
        isNewUser: false,
        confirmed: true,
      },
      error: null,
    });
  },

  async signIn(rawEmail, password) {
    set({ error: null });
    // Normalized here, not by callers, so `Ayesha@Example.com` and
    // `ayesha@example.com` can never become two accounts.
    const email = normalizeEmail(rawEmail);
    const result = await signIn(email, password);

    if (!result.ok) {
      set({ error: result.message });
      throw new Error('sign-in-failed');
    }

    const profile: Profile = {
      userId: result.value.userId,
      email: result.value.email,
      fullName: '',
      isNewUser: false,
      confirmed: result.value.hasSession,
    };

    set({ status: 'authenticated', profile, lastEmail: email, error: null });
    return profile;
  },

  async signUp(rawEmail, password) {
    set({ error: null });
    const email = normalizeEmail(rawEmail);
    const result = await signUp(email, password);

    if (!result.ok) {
      set({ error: result.message });
      throw new Error('sign-up-failed');
    }

    const profile: Profile = {
      userId: result.value.userId,
      email: result.value.email,
      fullName: '',
      isNewUser: true,
      confirmed: result.value.hasSession,
    };

    // `status` stays unauthenticated until the address is confirmed: there is no
    // session to authorize requests with, and pretending otherwise would let the
    // app render empty screens.
    if (result.value.hasSession) {
      set({ status: 'authenticated', profile, lastEmail: email, error: null });
    } else {
      set({ lastEmail: email, error: null });
    }
    return profile;
  },

  setDisplayName(fullName) {
    set((state) => ({
      profile: state.profile ? { ...state.profile, fullName: fullName.trim() } : state.profile,
    }));
  },

  async signOut() {
    await signOut();
    set({
      status: 'unauthenticated',
      profile: null,
      error: null,
    });
  },

  clearError() {
    set({ error: null });
  },

  /**
   * Keeps the app in step with token expiry and a sign-out from another device,
   * without polling.
   */
  subscribe() {
    return onAuthStateChange((session) => {
      if (!session) {
        set({ status: 'unauthenticated', profile: null });
        return;
      }
      if (get().status !== 'authenticated') {
        set({
          status: 'authenticated',
          profile: {
            userId: session.userId,
            email: session.email,
            fullName: '',
            isNewUser: false,
            confirmed: true,
          },
        });
      }
    }).unsubscribe;
  },
}));
