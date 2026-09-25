import { useAuthStore } from '@/store/authStore';
import { getSession, signIn, signOut, signUp } from '@/supabase/auth';

jest.mock('@/supabase/auth', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
  signUp: jest.fn(),
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
  signIn: signIn as jest.MockedFunction<typeof signIn>,
  signUp: signUp as jest.MockedFunction<typeof signUp>,
  signOut: signOut as jest.MockedFunction<typeof signOut>,
};

const session = { userId: 'u-1', email: 'ayesha@example.com', accessToken: 'supabase-jwt' };
const identity = { userId: 'u-1', email: 'ayesha@example.com', isNewUser: false, hasSession: true };

function resetStore() {
  useAuthStore.setState({ status: 'loading', profile: null, error: null, lastEmail: null });
}

describe('auth store (email and password)', () => {
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
      userId: 'u-1',
      email: 'ayesha@example.com',
    });
  });

  it('normalizes the address so one address is always one account', async () => {
    authMock.signIn.mockResolvedValue({ ok: true, value: identity });

    await useAuthStore.getState().signIn('  Ayesha@Example.COM ', 'Sup3rSecret!');

    expect(authMock.signIn).toHaveBeenCalledWith('ayesha@example.com', 'Sup3rSecret!');
  });

  it('signs in and records the Supabase user id', async () => {
    authMock.signIn.mockResolvedValue({ ok: true, value: identity });

    const profile = await useAuthStore.getState().signIn('ayesha@example.com', 'Sup3rSecret!');

    expect(profile.userId).toBe('u-1');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('never keeps the password anywhere in the store', async () => {
    authMock.signIn.mockResolvedValue({ ok: true, value: identity });

    await useAuthStore.getState().signIn('ayesha@example.com', 'Sup3rSecret!');

    expect(JSON.stringify(useAuthStore.getState())).not.toContain('Sup3rSecret!');
  });

  it('surfaces a customer-safe message on a bad password', async () => {
    authMock.signIn.mockResolvedValue({
      ok: false,
      message: 'That mobile number or password is not correct.',
    });

    await expect(
      useAuthStore.getState().signIn('ayesha@example.com', 'wrong-password'),
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe('That mobile number or password is not correct.');
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('creates an account on sign-up', async () => {
    authMock.signUp.mockResolvedValue({
      ok: true,
      value: { ...identity, isNewUser: true, hasSession: true },
    });

    const profile = await useAuthStore.getState().signUp('new@example.com', 'Sup3rSecret!');

    expect(authMock.signUp).toHaveBeenCalledWith('new@example.com', 'Sup3rSecret!');
    expect(profile.isNewUser).toBe(true);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('does not claim a session while the address is unconfirmed', async () => {
    authMock.signUp.mockResolvedValue({
      ok: true,
      value: { ...identity, isNewUser: true, hasSession: false },
    });

    const profile = await useAuthStore.getState().signUp('new@example.com', 'Sup3rSecret!');

    expect(profile.confirmed).toBe(false);
    // No session means no authorization, so the app must not render as signed in.
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('reports a number already in use without confirming it exists', async () => {
    authMock.signUp.mockResolvedValue({
      ok: false,
      message: 'That email is already in use. Try signing in instead.',
    });

    await expect(
      useAuthStore.getState().signUp('01712345678', 'Sup3rSecret!'),
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe('That email is already in use. Try signing in instead.');
  });

  it('holds the display name in memory rather than writing to the database', () => {
    useAuthStore.setState({
      profile: {
        userId: 'u',
        email: 'ayesha@example.com',
        fullName: '',
        isNewUser: true,
        confirmed: true,
      },
    });

    useAuthStore.getState().setDisplayName('  Ayesha Rahman  ');

    expect(useAuthStore.getState().profile?.fullName).toBe('Ayesha Rahman');
  });

  it('clears everything on sign out', async () => {
    authMock.signIn.mockResolvedValue({ ok: true, value: identity });
    await useAuthStore.getState().signIn('ayesha@example.com', 'Sup3rSecret!');
    useAuthStore.getState().setDisplayName('Ayesha Rahman');

    await useAuthStore.getState().signOut();

    expect(authMock.signOut).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().profile).toBeNull();
  });
});
