import { endpoints } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { createMemoryTokenStorage, isExpired } from '@/auth/tokenStorage';
import { createAuthStore } from '@/store/authStore';
import type { AuthSession } from '@/types/api';

jest.mock('@/api/endpoints', () => ({
  endpoints: {
    auth: {
      login: jest.fn(),
      register: jest.fn(),
      requestOtp: jest.fn(),
      verifyOtp: jest.fn(),
    },
    customer: { profile: jest.fn() },
  },
}));

const authMock = jest.mocked(endpoints.auth);
const customerMock = jest.mocked(endpoints.customer);

const session: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() + 3_600_000,
  customerId: 'cust-1',
  fullName: 'Ayesha Rahman',
  phone: '8801712345678',
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

describe('auth store', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts unauthenticated when no session is stored', async () => {
    const { store } = makeStore();
    await store.getState().bootstrap();
    expect(store.getState().status).toBe('unauthenticated');
  });

  it('signs in with phone and password and stores tokens securely', async () => {
    authMock.login.mockResolvedValue(session);
    const { store, storage } = makeStore();

    await store.getState().login({ phone: '8801712345678', password: 'secret123' });

    expect(authMock.login).toHaveBeenCalledWith({
      phone: '8801712345678',
      password: 'secret123',
    });
    expect(store.getState().status).toBe('authenticated');
    expect(store.getState().profile?.fullName).toBe('Ayesha Rahman');
    expect((await storage.get())?.accessToken).toBe('access-1');
  });

  it('surfaces a customer-safe message and stays signed out on a bad password', async () => {
    authMock.login.mockRejectedValue(
      new ApiError({ kind: 'unauthorized', message: 'Incorrect mobile number or password.' }),
    );
    const { store } = makeStore();
    await store.getState().bootstrap();

    await expect(
      store.getState().login({ phone: '8801712345678', password: 'wrong' }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(store.getState().status).toBe('unauthenticated');
    expect(store.getState().error).toBe('Incorrect mobile number or password.');
  });

  it('completes an OTP login', async () => {
    authMock.requestOtp.mockResolvedValue({ sent: true, expiresIn: 300, resendAfter: 60 });
    authMock.verifyOtp.mockResolvedValue(session);
    const { store, storage } = makeStore();

    await store.getState().requestOtp('8801712345678');
    expect(store.getState().otpPhone).toBe('8801712345678');
    expect(store.getState().otpResendAvailableAt).toBeGreaterThan(Date.now());

    await store.getState().verifyOtp({ phone: '8801712345678', code: '123456' });

    expect(store.getState().status).toBe('authenticated');
    expect((await storage.get())?.refreshToken).toBe('refresh-1');
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

    // Offline is not a revocation: tokens are kept so cached data can render,
    // and no authorization decision is made locally.
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

  it('destroys local tokens on sign out', async () => {
    const { store, storage } = makeStore();
    authMock.login.mockResolvedValue(session);
    await store.getState().login({ phone: '8801712345678', password: 'secret123' });

    await store.getState().signOut();

    expect(store.getState().status).toBe('unauthenticated');
    expect(store.getState().profile).toBeNull();
    expect(await storage.get()).toBeNull();
  });

  it('signs out globally when any request returns 401', async () => {
    const { store, storage } = makeStore();
    authMock.login.mockResolvedValue(session);
    await store.getState().login({ phone: '8801712345678', password: 'secret123' });

    await store.getState().handleUnauthorized();

    expect(store.getState().status).toBe('unauthenticated');
    expect(await storage.get()).toBeNull();
  });
});
