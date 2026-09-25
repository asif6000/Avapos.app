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

const session = { userId: 'u-1', phone: '+8801712345678', accessToken: 'supabase-jwt' };
const identity = { userId: 'u-1', phone: '+8801712345678', isNewUser: false };

function resetStore() {
  useAuthStore.setState({ status: 'loading', profile: null, error: null, lastPhone: null });
}

describe('auth store (phone and password)', () => {
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
      phone: '+8801712345678',
    });
  });

  it('normalizes the number so one number is always one account', async () => {
    authMock.signIn.mockResolvedValue({ ok: true, value: identity });

    await useAuthStore.getState().signIn('  +880 1712-345678 ', 'Sup3rSecret!');

    expect(authMock.signIn).toHaveBeenCalledWith('8801712345678', 'Sup3rSecret!');
  });

  it('signs in and records the Supabase user id', async () => {
    authMock.signIn.mockResolvedValue({ ok: true, value: identity });

    const profile = await useAuthStore.getState().signIn('01712345678', 'Sup3rSecret!');

    expect(profile.userId).toBe('u-1');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('never keeps the password anywhere in the store', async () => {
    authMock.signIn.mockResolvedValue({ ok: true, value: identity });

    await useAuthStore.getState().signIn('01712345678', 'Sup3rSecret!');

    expect(JSON.stringify(useAuthStore.getState())).not.toContain('Sup3rSecret!');
  });

  it('surfaces a customer-safe message on a bad password', async () => {
    authMock.signIn.mockResolvedValue({
      ok: false,
      message: 'That mobile number or password is not correct.',
    });

    await expect(
      useAuthStore.getState().signIn('01712345678', 'wrong-password'),
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe('That mobile number or password is not correct.');
    expect(useAuthStore.getState().status).not.toBe('authenticated');
  });

  it('creates an account on sign-up', async () => {
    authMock.signUp.mockResolvedValue({ ok: true, value: { ...identity, isNewUser: true } });

    const profile = await useAuthStore.getState().signUp('01712345678', 'Sup3rSecret!');

    expect(authMock.signUp).toHaveBeenCalledWith('8801712345678', 'Sup3rSecret!');
    expect(profile.isNewUser).toBe(true);
  });

  it('reports a number already in use without confirming it exists', async () => {
    authMock.signUp.mockResolvedValue({
      ok: false,
      message: 'That number is already in use. Try signing in, or use another number.',
    });

    await expect(
      useAuthStore.getState().signUp('01712345678', 'Sup3rSecret!'),
    ).rejects.toThrow();

    expect(useAuthStore.getState().error).toBe(
      'That number is already in use. Try signing in, or use another number.',
    );
  });

  it('holds the display name in memory rather than writing to the database', () => {
    useAuthStore.setState({
      profile: { userId: 'u', phone: '+8801712345678', fullName: '', isNewUser: true },
    });

    useAuthStore.getState().setDisplayName('  Ayesha Rahman  ');

    expect(useAuthStore.getState().profile?.fullName).toBe('Ayesha Rahman');
  });

  it('clears everything on sign out', async () => {
    authMock.signIn.mockResolvedValue({ ok: true, value: identity });
    await useAuthStore.getState().signIn('01712345678', 'Sup3rSecret!');
    useAuthStore.getState().setDisplayName('Ayesha Rahman');

    await useAuthStore.getState().signOut();

    expect(authMock.signOut).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().profile).toBeNull();
  });
});
