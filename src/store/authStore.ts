import { create } from 'zustand';

import { endpoints } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { onSessionExpired } from '@/auth/sessionEvents';
import { sessionManager, type SessionManager } from '@/auth/sessionManager';
import { linkSupabaseSession, signOutSupabase, type LinkState } from '@/supabase/session';
import type { AuthSession, OtpVerifyRequest, RegisterRequest } from '@/types/api';
import { normalizeEmail } from '@/utils/format';

/**
 * Passwordless authentication.
 *
 * The app holds no password anywhere. Sign-up and sign-in are the same flow:
 * ask the backend for a code, the customer types the code the backend mailed,
 * and the code is exchanged for a session. An unknown address creates the
 * account on first successful verify, which is why `requestOtp` never reveals
 * whether an account already exists.
 *
 * A second, read-only Supabase session may be linked so RLS has an
 * `auth.uid()` to scope by. It is optional, and it grants no write access.
 */

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  emailVerified: boolean;
}

interface AuthState {
  status: AuthStatus;
  profile: Profile | null;
  error: string | null;
  /** Address a code is currently outstanding for. */
  pendingEmail: string | null;
  otpResendAvailableAt: number | null;
  /** Result of linking the secondary Supabase session. */
  supabaseLink: LinkState;
  bootstrap: () => Promise<void>;
  requestOtp: (email: string) => Promise<number>;
  resendOtp: (email: string) => Promise<number>;
  verifyOtp: (payload: OtpVerifyRequest) => Promise<AuthSession>;
  completeRegistration: (payload: RegisterRequest) => Promise<void>;
  linkSupabase: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  handleUnauthorized: () => Promise<void>;
  clearError: () => void;
  setPendingEmail: (email: string, resendAvailableAt: number | null) => void;
}

const extractProfile = (session: AuthSession): Profile => ({
  id: session.customerId,
  fullName: session.fullName,
  email: session.email,
  emailVerified: session.emailVerified,
});

export function createAuthStore(manager: SessionManager = sessionManager) {
  return create<AuthState>((set, get) => ({
    status: 'loading',
    profile: null,
    error: null,
    pendingEmail: null,
    otpResendAvailableAt: null,
    supabaseLink: 'signed-out',

    async bootstrap() {
      const tokens = await manager.read();
      if (!tokens) {
        set({ status: 'unauthenticated', profile: null });
        return;
      }
      try {
        const customer = await endpoints.customer.profile();
        set({
          status: 'authenticated',
          profile: {
            id: customer.id,
            fullName: customer.fullName,
            email: customer.email ?? '',
            emailVerified: customer.verifiedAt !== null,
          },
          error: null,
        });
        // Best effort: a missing Supabase link must never block the app.
        if (customer.email) await get().linkSupabase(customer.email);
      } catch (error) {
        if (error instanceof ApiError && error.isAuthError) {
          await manager.clear();
          set({ status: 'unauthenticated', profile: null });
          return;
        }
        // Offline. Keep the tokens so cached data can render. Authorization is
        // never granted locally.
        set({ status: 'authenticated', profile: null, error: messageOf(error) });
      }
    },

    async requestOtp(rawEmail) {
      set({ error: null });
      // Normalized here, not in the caller: `Ayesha@Example.com` and
      // `ayesha@example.com` must be one account, never two.
      const email = normalizeEmail(rawEmail);
      try {
        const challenge = await endpoints.auth.requestOtp({ email });
        const resendAfterMs = (challenge.resendAfter ?? 60) * 1000;
        set({ pendingEmail: email, otpResendAvailableAt: Date.now() + resendAfterMs });
        return resendAfterMs;
      } catch (error) {
        set({ error: messageOf(error) });
        throw error;
      }
    },

    async resendOtp(rawEmail) {
      set({ error: null });
      const email = normalizeEmail(rawEmail);
      try {
        const challenge = await endpoints.auth.resendOtp({ email });
        const resendAfterMs = (challenge.resendAfter ?? 60) * 1000;
        set({ otpResendAvailableAt: Date.now() + resendAfterMs });
        return resendAfterMs;
      } catch (error) {
        set({ error: messageOf(error) });
        throw error;
      }
    },

    async verifyOtp(payload) {
      set({ error: null });
      const email = normalizeEmail(payload.email);
      try {
        const session = await endpoints.auth.verifyOtp({ ...payload, email });
        await manager.persist(session);
        set({
          status: 'authenticated',
          profile: extractProfile(session),
          pendingEmail: null,
          otpResendAvailableAt: null,
        });
        await get().linkSupabase(session.email);
        return session;
      } catch (error) {
        set({ error: messageOf(error) });
        throw error;
      }
    },

    /**
     * Runs after the first successful verify for a new address: the account
     * exists, it just needs a name and the device it covers.
     */
    async completeRegistration(payload) {
      set({ error: null });
      try {
        const updated = await endpoints.auth.registerProfile({
          fullName: payload.fullName.trim(),
          deviceName: payload.deviceName.trim(),
        });
        set((state) => ({
          profile: state.profile ? { ...state.profile, fullName: updated.fullName } : state.profile,
        }));
      } catch (error) {
        set({ error: messageOf(error) });
        throw error;
      }
    },

    async linkSupabase(rawEmail) {
      const result = await linkSupabaseSession(normalizeEmail(rawEmail));
      set({ supabaseLink: result.state });
    },

    async signOut() {
      await manager.signOut();
      await signOutSupabase();
      set({
        status: 'unauthenticated',
        profile: null,
        error: null,
        pendingEmail: null,
        otpResendAvailableAt: null,
        supabaseLink: 'signed-out',
      });
    },

    async handleUnauthorized() {
      await manager.clear();
      set({ status: 'unauthenticated', profile: null });
    },

    clearError() {
      set({ error: null });
    },

    setPendingEmail(email, resendAvailableAt) {
      set({ pendingEmail: email, otpResendAvailableAt: resendAvailableAt });
    },
  }));
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

export const useAuthStore = createAuthStore();

// Any 401 raised anywhere in the app lands here, so the UI reacts once.
onSessionExpired(() => useAuthStore.getState().handleUnauthorized());
