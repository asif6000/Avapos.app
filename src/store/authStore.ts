import { create } from 'zustand';

import { endpoints } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { onSessionExpired } from '@/auth/sessionEvents';
import { sessionManager, type SessionManager } from '@/auth/sessionManager';
import type { AuthSession, LoginRequest, OtpVerifyRequest, RegisterRequest } from '@/types/api';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface Profile {
  id: string;
  fullName: string;
  phone: string;
}

interface AuthState {
  status: AuthStatus;
  profile: Profile | null;
  error: string | null;
  otpPhone: string | null;
  otpResendAvailableAt: number | null;
  bootstrap: () => Promise<void>;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  requestOtp: (phone: string) => Promise<number>;
  verifyOtp: (payload: OtpVerifyRequest) => Promise<void>;
  signOut: () => Promise<void>;
  handleUnauthorized: () => Promise<void>;
  clearError: () => void;
  setOtpContext: (phone: string, resendAvailableAt: number | null) => void;
}

const extractProfile = (session: AuthSession): Profile => ({
  id: session.customerId,
  fullName: session.fullName,
  phone: session.phone,
});

export function createAuthStore(manager: SessionManager = sessionManager) {
  return create<AuthState>((set) => ({
    status: 'loading',
    profile: null,
    error: null,
    otpPhone: null,
    otpResendAvailableAt: null,

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
            phone: customer.phone,
          },
          error: null,
        });
      } catch (error) {
        if (error instanceof ApiError && error.isAuthError) {
          await manager.clear();
          set({ status: 'unauthenticated', profile: null });
          return;
        }
        // Network is down. Keep the tokens, stay signed in, and let the query
        // layer serve cached data. Authorization is never granted offline.
        set({
          status: 'authenticated',
          profile: null,
          error: error instanceof ApiError ? error.message : null,
        });
      }
    },

    async login(payload) {
      set({ error: null });
      try {
        const session = await endpoints.auth.login(payload);
        await manager.persist(session);
        set({ status: 'authenticated', profile: extractProfile(session) });
      } catch (error) {
        set({ error: messageOf(error) });
        throw error;
      }
    },

    async register(payload) {
      set({ error: null });
      try {
        const session = await endpoints.auth.register(payload);
        await manager.persist(session);
        set({ status: 'authenticated', profile: extractProfile(session) });
      } catch (error) {
        set({ error: messageOf(error) });
        throw error;
      }
    },

    async requestOtp(phone) {
      set({ error: null });
      try {
        const result = await endpoints.auth.requestOtp({ phone });
        const resendAfterMs = (result.resendAfter ?? 60) * 1000;
        set({
          otpPhone: phone,
          otpResendAvailableAt: Date.now() + resendAfterMs,
        });
        return resendAfterMs;
      } catch (error) {
        set({ error: messageOf(error) });
        throw error;
      }
    },

    async verifyOtp(payload) {
      set({ error: null });
      try {
        const session = await endpoints.auth.verifyOtp(payload);
        await manager.persist(session);
        set({ status: 'authenticated', profile: extractProfile(session), otpPhone: null });
      } catch (error) {
        set({ error: messageOf(error) });
        throw error;
      }
    },

    async signOut() {
      await manager.signOut();
      set({
        status: 'unauthenticated',
        profile: null,
        error: null,
        otpPhone: null,
        otpResendAvailableAt: null,
      });
    },

    async handleUnauthorized() {
      await manager.clear();
      set({ status: 'unauthenticated', profile: null });
    },

    clearError() {
      set({ error: null });
    },

    setOtpContext(phone, resendAvailableAt) {
      set({ otpPhone: phone, otpResendAvailableAt: resendAvailableAt });
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
