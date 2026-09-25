import { endpoints } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { createMemoryTokenStorage, isExpired } from '@/auth/tokenStorage';
import { createAuthStore } from '@/store/authStore';
import type { AuthSession } from '@/types/api';

jest.mock('@/api/endpoints', () => ({
  endpoints: {
    auth: {
      requestOtp: jest.fn(),
      verifyOtp: jest.fn(),
      resendOtp: jest.fn(),
      registerProfile: jest.fn(),
    },
    customer: { profile: jest.fn() },
  },
}));

jest.mock('@/supabase/session', () => ({
  linkSupabaseSession: jest.fn(async () => ({
    state: 'disabled' as const,
    supabaseUserId: null,
    message: null,
  })),
  signOutSupabase: jest.fn(async () => undefined),
}));

const authMock = jest.mocked(endpoints.auth);
const customerMock = jest.mocked(endpoints.customer);

const session: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() + 3_600_000,
  customerId: 'CUST-23839',
  fullName: 'Ayesha Rahman',
  email: 'ayesha@example.com',
  emailVerified: true,
};

const challenge = {
  challengeId: 'ch-1',
  sent: true,
  expiresIn: 300,
  resendAfter: 60,
  accountExists: true,
};

function makeStore() {
  const storage = createMemoryTokenStorage();
  const manager = {
    read: () => storage.get(),
    persist: async (s: AuthSession) => {
      await storage.set({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        expiresAt: s.expiresAt,
      });
    },
    clear: () => storage.clear(),
    isUsable: async () => !isExpired(await storage.get()),
    signOut: () => storage.clear(),
  };
  return { store: createAuthStore(manager as never), storage };
}

describe('passwordless auth store', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts unauthenticated when no session is stored', async () => {
    const { store } = makeStore();
    await store.getState().bootstrap();
    expect(store.getState().status).toBe('unauthenticated');
  });

  it('never asks the backend for, or sends, a password', async () => {
    authMock.requestOtp.mockResolvedValue(challenge);
    const { store } = makeStore();

    await store.getState().requestOtp('  Ayesha@Example.com ');

    expect(authMock.requestOtp).toHaveBeenCalledWith({ email: 'ayesha@example.com' });
    // The endpoint surface has no password verb at all.
    expect(Object.keys(authMock).sort()).toEqual([
      'registerProfile',
      'requestOtp',
      'resendOtp',
      'verifyOtp',
    ]);
  });

  it('completes sign-in by exchanging a code for a session', async () => {
    authMock.verifyOtp.mockResolvedValue(session);
    const { store, storage } = makeStore();

    const result = await store.getState().verifyOtp({ email: 'ayesha@example.com', code: '123456' });

    expect(authMock.verifyOtp).toHaveBeenCalledWith({
      email: 'ayesha@example.com',
      code: '123456',
    });
    expect(result.customerId).toBe('CUST-23839');
    expect(store.getState().status).toBe('authenticated');
    expect((await storage.get())?.accessToken).toBe('access-1');
  });

  it('signs a new address up through the same verify call', async () => {
    // There is no separate register endpoint: a first-time address simply has no
    // name yet, and the app asks for one afterwards.
    authMock.verifyOtp.mockResolvedValue({ ...session, fullName: '', emailVerified: false });
    const { store } = makeStore();

    const result = await store.getState().verifyOtp({ email: 'new@example.com', code: '000000' });

    expect(result.fullName).toBe('');
    expect(store.getState().profile?.emailVerified).toBe(false);
  });

  it('stores the resend window so the button cannot be spammed', async () => {
    authMock.resendOtp.mockResolvedValue(challenge);
    const { store } = makeStore();

    await store.getState().resendOtp('ayesha@example.com');

    expect(authMock.resendOtp).toHaveBeenCalledWith({ email: 'ayesha@example.com' });
    expect(store.getState().otpResendAvailableAt).toBeGreaterThan(Date.now());
  });

  it('surfaces a customer-safe message and stays signed out on a bad code', async () => {
    authMock.verifyOtp.mockRejectedValue(
      new ApiError({ kind: 'validation', message: 'That code is not correct. Try again.' }),
    );
    const { store } = makeStore();
    await store.getState().bootstrap();

    await expect(
      store.getState().verifyOtp({ email: 'ayesha@example.com', code: '000000' }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(store.getState().status).toBe('unauthenticated');
    expect(store.getState().error).toBe('That code is not correct. Try again.');
  });

  it('completes registration after the address is verified', async () => {
    authMock.verifyOtp.mockResolvedValue({ ...session, fullName: '' });
    authMock.registerProfile.mockResolvedValue({ fullName: 'Ayesha Rahman' });
    const { store } = makeStore();
    await store.getState().verifyOtp({ email: 'ayesha@example.com', code: '123456' });

    await store.getState().completeRegistration({
      fullName: '  Ayesha Rahman ',
      deviceName: 'Galaxy A15',
      agreementVersion: '1.0.0',
    });

    expect(authMock.registerProfile).toHaveBeenCalledWith({
      fullName: 'Ayesha Rahman',
      deviceName: 'Galaxy A15',
    });
    expect(store.getState().profile?.fullName).toBe('Ayesha Rahman');
  });

  it('keeps the customer signed in when the network is unavailable', async () => {
    customerMock.profile.mockRejectedValue(
      new ApiError({ kind: 'network', message: 'Unable to reach our servers. Please try again.' }),
    );
    const { store, storage } = makeStore();
    await storage.set({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 3_600_000,
    });

    await store.getState().bootstrap();

    // Offline is not a revocation. No authorization is granted locally.
    expect(store.getState().status).toBe('authenticated');
    expect(await storage.get()).not.toBeNull();
  });

  it('clears the session when the stored token is rejected', async () => {
    customerMock.profile.mockRejectedValue(
      new ApiError({ kind: 'unauthorized', message: 'Your session has expired. Please sign in again.' }),
    );
    const { store, storage } = makeStore();
    await storage.set({
      accessToken: 'stale',
      refreshToken: 'stale',
      expiresAt: Date.now() + 3_600_000,
    });

    await store.getState().bootstrap();

    expect(store.getState().status).toBe('unauthenticated');
    expect(await storage.get()).toBeNull();
  });

  it('does not mistake a server error for being offline', async () => {
    // A 404/500 means we could not confirm who this is. Treating it as "offline"
    // would mark the customer authenticated with a null profile, and the next
    // authenticated call would then fail locally as "your session has expired".
    customerMock.profile.mockRejectedValue(
      new ApiError({ kind: 'not_found', message: 'The requested information was not found.' }),
    );
    const { store, storage } = makeStore();
    await storage.set({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 3_600_000,
    });

    await store.getState().bootstrap();

    expect(store.getState().status).toBe('unauthenticated');
    expect(store.getState().profile).toBeNull();
    expect(await storage.get()).toBeNull();
  });

  it('destroys local tokens on sign out', async () => {
    const { store, storage } = makeStore();
    authMock.verifyOtp.mockResolvedValue(session);
    await store.getState().verifyOtp({ email: 'ayesha@example.com', code: '123456' });

    await store.getState().signOut();

    expect(store.getState().status).toBe('unauthenticated');
    expect(store.getState().profile).toBeNull();
    expect(await storage.get()).toBeNull();
  });
});
