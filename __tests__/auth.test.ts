import { useAuthStore } from '@/store/authStore';
import {
  getSession,
  requestSignInCode,
  signOut,
  verifySignInCode,
} from '@/supabase/auth';

jest.mock('@/supabase/auth', () => ({
  getSession: jest.fn(),
  requestSignInCode: jest.fn(),
  verifySignInCode: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChange: jest.fn(() => ({ unsubscribe: jest.fn() })),
}));

jest.mock('@/supabase/client', () => ({
  canReadDirectly: () => true,
  isSupabaseAuthReady: () => true,
  getSupabaseClient: jest.fn(),
  looksLikeServiceRoleKey: jest.fn(() => false),
}));

const authMock = {
  getSession: getSession as jest.MockedFunction<typeof getSession>,
  requestSignInCode: requestSignInCode as jest.MockedFunction<typeof requestSignInCode>,
  verifySignInCode: verifySignInCode as jest.MockedFunction<typeof verifySignInCode>,
  signOut: signOut as jest.MockedFunction<typeof signOut>,
};

const session = {
  userId: '9f1c2b3a-0000-4000-8000-000000000001',
  email: 'ayesha@example.com',
  accessToken: 'supabase-jwt',
};

function resetStore() {
  useAuthStore.setState({
    status: 'loading',
    profile: null,
    error: null,
    pendingEmail: null,
    otpResendAvailableAt: null,
  });
}

describe('auth store (Supabase passwordless)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  it('starts unauthenticated when there is no session', async () => {
    authMock.getSession.mockResolvedValue(null);
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('restores a persisted session on boot', async () => {
    authMock.getSession.mockResolvedValue(session);
    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().profile).toMatchObject({
      userId: session.userId,
      email: 'ayesha@example.com',
    });
  });

  it('sends no password, only the address', async () => {
    authMock.requestSignInCode.mockResolvedValue({ ok: true });

    await useAuthStore.getState().requestCode('  Ayesha@Example.COM ');

    expect(authMock.requestSignInCode).toHaveBeenCalledWith('ayesha@example.com');
  });

  it('records the address a code is outstanding for', async () => {
    authMock.requestSignInCode.mockResolvedValue({ ok: true });

    await useAuthStore.getState().requestCode('ayesha@example.com');

    expect(useAuthStore.getState().pendingEmail).toBe('ayesha@example.com');
    expect(useAuthStore.getState().otpResendAvailableAt).toBeGreaterThan(Date.now());
  });

  it('reports a disabled email provider instead of a generic failure', async () => {
    authMock.requestSignInCode.mockResolvedValue({
      ok: false,
      reason: 'disabled',
      message: 'Email sign-in is not switched on for this service yet.',
    });

    await expect(
      useAuthStore.getState().requestCode('ayesha@example.com'),
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe(
      'Email sign-in is not switched on for this service yet.',
    );
  });

  it('advises waiting when the mail provider rate-limits us', async () => {
    authMock.requestSignInCode.mockResolvedValue({
      ok: false,
      reason: 'rate_limited',
      message: 'Too many codes have been requested. Please wait a few minutes and try again.',
    });

    await expect(
      useAuthStore.getState().requestCode('ayesha@example.com'),
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe(
      'Too many codes have been requested. Please wait a few minutes and try again.',
    );
  });

  it('completes sign-in and records the Supabase user id', async () => {
    authMock.verifySignInCode.mockResolvedValue({
      ok: true,
      userId: session.userId,
      email: 'ayesha@example.com',
      isNewUser: false,
    });

    const profile = await useAuthStore.getState().verifyCode('ayesha@example.com', '123456');

    expect(authMock.verifySignInCode).toHaveBeenCalledWith('ayesha@example.com', '123456');
    expect(profile.userId).toBe(session.userId);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('flags a brand new user so the app can collect their details', async () => {
    authMock.verifySignInCode.mockResolvedValue({
      ok: true,
      userId: session.userId,
      email: 'new@example.com',
      isNewUser: true,
    });

    const profile = await useAuthStore.getState().verifyCode('new@example.com', '000000');

    expect(profile.isNewUser).toBe(true);
  });

  it('surfaces a customer-safe message for a wrong code', async () => {
    authMock.verifySignInCode.mockResolvedValue({
      ok: false,
      message: 'That code is not correct. Try again.',
    });

    await expect(
      useAuthStore.getState().verifyCode('ayesha@example.com', '000000'),
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe('That code is not correct. Try again.');
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('distinguishes an expired code', async () => {
    authMock.verifySignInCode.mockResolvedValue({
      ok: false,
      message: 'That code has expired. Request a new one.',
    });

    await expect(
      useAuthStore.getState().verifyCode('ayesha@example.com', '000000'),
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe('That code has expired. Request a new one.');
  });

  it('holds the display name in memory rather than writing to the database', () => {
    useAuthStore.setState({
      profile: { userId: 'u', email: 'a@b.com', fullName: '', isNewUser: true },
    });

    useAuthStore.getState().setDisplayName('  Ayesha Rahman  ');

    expect(useAuthStore.getState().profile?.fullName).toBe('Ayesha Rahman');
  });

  it('clears everything on sign out', async () => {
    authMock.verifySignInCode.mockResolvedValue({
      ok: true,
      userId: session.userId,
      email: 'ayesha@example.com',
      isNewUser: false,
    });
    await useAuthStore.getState().verifyCode('ayesha@example.com', '123456');
    useAuthStore.getState().setDisplayName('Ayesha Rahman');

    await useAuthStore.getState().signOut();

    expect(authMock.signOut).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().profile).toBeNull();
  });
});
