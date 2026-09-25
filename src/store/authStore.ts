import { create } from 'zustand';

import {
  getSession,
  onAuthStateChange,
  requestSignInCode,
  signOut,
  verifySignInCode,
} from '@/supabase/auth';
import { canReadDirectly } from '@/supabase/client';
import { normalizeEmail } from '@/utils/format';

/**
 * Authentication state, backed by Supabase Auth.
 *
 * Passwordless: an emailed 6-digit code, no password anywhere. The session's
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
}

interface AuthState {
  status: AuthStatus;
  profile: Profile | null;
  error: string | null;
  /** Address a code is currently outstanding for. */
  pendingEmail: string | null;
  otpResendAvailableAt: number | null;
  /** False until `verify:rls` passes; drives the "direct reads" notice. */
  directReadsEnabled: boolean;
  bootstrap: () => Promise<void>;
  requestCode: (email: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<Profile>;
  setDisplayName: (fullName: string) => void;
  signOut: () => Promise<void>;
  clearError: () => void;
  setPendingEmail: (email: string, resendAvailableAt: number | null) => void;
  subscribe: () => () => void;
}

const RESEND_AFTER_SECONDS = 60;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  profile: null,
  error: null,
  pendingEmail: null,
  otpResendAvailableAt: null,
  directReadsEnabled: canReadDirectly(),

  async bootstrap() {
    const session = await getSession();

    if (!session) {
      set({ status: 'unauthenticated', profile: null });
      return;
    }

    set({
      status: 'authenticated',
      profile: {
        userId: session.userId,
        email: session.email,
        fullName: get().profile?.fullName ?? '',
        isNewUser: false,
      },
      error: null,
    });
  },

  async requestCode(rawEmail) {
    set({ error: null });
    // Normalized here, not by callers, so `Ayesha@Example.com` and
    // `ayesha@example.com` can never become two accounts.
    const email = normalizeEmail(rawEmail);
    const result = await requestSignInCode(email);

    if (!result.ok) {
      set({ error: result.message ?? 'We could not send a code right now.' });
      throw new Error(result.reason);
    }

    set({
      pendingEmail: email,
      otpResendAvailableAt: Date.now() + RESEND_AFTER_SECONDS * 1000,
    });
  },

  async resendCode(rawEmail) {
    set({ error: null });
    const result = await requestSignInCode(normalizeEmail(rawEmail));

    if (!result.ok) {
      set({ error: result.message ?? 'We could not send a code right now.' });
      return;
    }
    set({ otpResendAvailableAt: Date.now() + RESEND_AFTER_SECONDS * 1000 });
  },

  async verifyCode(rawEmail, code) {
    set({ error: null });
    const result = await verifySignInCode(normalizeEmail(rawEmail), code);

    if (!result.ok) {
      set({ error: result.message });
      throw new Error('invalid-code');
    }

    const profile: Profile = {
      userId: result.userId,
      email: result.email,
      fullName: '',
      isNewUser: result.isNewUser,
    };

    set({
      status: 'authenticated',
      profile,
      pendingEmail: null,
      otpResendAvailableAt: null,
      error: null,
    });

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
      pendingEmail: null,
      otpResendAvailableAt: null,
    });
  },

  clearError() {
    set({ error: null });
  },

  setPendingEmail(email, resendAvailableAt) {
    set({ pendingEmail: email, otpResendAvailableAt: resendAvailableAt });
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
          },
        });
      }
    }).unsubscribe;
  },
}));
