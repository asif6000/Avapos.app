import { create } from 'zustand';

import { getSession, onAuthStateChange, signIn, signOut, signUp } from '@/supabase/auth';
import { canReadDirectly } from '@/supabase/client';
import { normalizePhone } from '@/utils/format';

/**
 * Authentication state, backed by Supabase Auth.
 *
 * Phone number and password. The session's
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
  phone: string;
  fullName: string;
  isNewUser: boolean;
}

interface AuthState {
  status: AuthStatus;
  profile: Profile | null;
  error: string | null;
  /** True once the customer has chosen a number, so the app can prefill it. */
  lastPhone: string | null;
  /** False until `verify:rls` passes; drives the "direct reads" notice. */
  directReadsEnabled: boolean;
  bootstrap: () => Promise<void>;
  signIn: (phone: string, password: string) => Promise<Profile>;
  signUp: (phone: string, password: string) => Promise<Profile>;
  setDisplayName: (fullName: string) => void;
  signOut: () => Promise<void>;
  clearError: () => void;
  subscribe: () => () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  profile: null,
  error: null,
  lastPhone: null,
  directReadsEnabled: canReadDirectly(),

  async bootstrap() {
    const session = await getSession();

    if (!session) {
      set({ status: 'unauthenticated', profile: null });
      return;
    }

    set({
      status: 'authenticated',
      lastPhone: session.phone,
      profile: {
        userId: session.userId,
        phone: session.phone,
        fullName: get().profile?.fullName ?? '',
        isNewUser: false,
      },
      error: null,
    });
  },

  async signIn(rawPhone, password) {
    set({ error: null });
    // Normalized here, not by callers, so `01712345678` and `+8801712345678`
    // can never become two accounts.
    const phone = normalizePhone(rawPhone);
    const result = await signIn(phone, password);

    if (!result.ok) {
      set({ error: result.message });
      throw new Error('sign-in-failed');
    }

    const profile: Profile = {
      userId: result.value.userId,
      phone: result.value.phone,
      fullName: '',
      isNewUser: false,
    };

    set({ status: 'authenticated', profile, lastPhone: phone, error: null });
    return profile;
  },

  async signUp(rawPhone, password) {
    set({ error: null });
    const phone = normalizePhone(rawPhone);
    const result = await signUp(phone, password);

    if (!result.ok) {
      set({ error: result.message });
      throw new Error('sign-up-failed');
    }

    const profile: Profile = {
      userId: result.value.userId,
      phone: result.value.phone,
      fullName: '',
      isNewUser: result.value.isNewUser,
    };

    // A brand new account may have no session yet if the number still needs
    // confirming, so the UI must not assume it is signed in.
    set({ status: 'authenticated', profile, lastPhone: phone, error: null });
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
            phone: session.phone,
            fullName: '',
            isNewUser: false,
          },
        });
      }
    }).unsubscribe;
  },
}));
