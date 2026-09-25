/**
 * The copy the customer sees when a sign-in is refused.
 *
 * Two things have to hold at once, and they pull against each other:
 *
 * - the message has to be useful, which means naming what the customer actually
 *   typed. Sign-in is by email address, so copy that says "mobile number" is
 *   worse than no copy: it tells them the app does not understand their own
 *   screen.
 * - the message must not reveal whether an address has an account, so a wrong
 *   password and an unknown address have to produce the same string.
 *
 * The cause of a refusal is logged in `__DEV__` instead, so whoever is running
 * the build is not left guessing. That log must never carry the password or the
 * address.
 */

const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();

jest.mock('@/supabase/client', () => ({
  SUPABASE_URL: 'https://project.supabase.co',
  isSupabaseAuthReady: () => true,
  getSupabaseClient: () => ({ auth: { signInWithPassword: mockSignInWithPassword, signUp: mockSignUp } }),
}));

const { signIn, signUp: register } = require('@/supabase/auth') as typeof import('@/supabase/auth');

const PASSWORD = 'Sup3rSecret!';
const ADDRESS = 'ayesha@example.com';

function refusal(message: string, status = 400, code = 'invalid_credentials') {
  mockSignInWithPassword.mockResolvedValue({
    data: { user: null, session: null },
    error: { message, status, code },
  });
}

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

describe('a refused sign-in', () => {
  it('names the email address, because that is what the field asks for', async () => {
    refusal('Invalid login credentials');

    const result = await signIn(ADDRESS, PASSWORD);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBe(
      'That email address or password is not correct.',
    );
  });

  it('never mentions a phone number, on an email-only screen', async () => {
    refusal('Invalid login credentials');

    const result = await signIn(ADDRESS, PASSWORD);

    expect(result.ok === false && result.message).not.toMatch(/mobile|phone|otp|code/i);
  });

  it('looks identical for a wrong password and for an unknown address', async () => {
    refusal('Invalid login credentials');
    const wrongPassword = await signIn(ADDRESS, 'not-the-password');
    const unknownAddress = await signIn('nobody@example.com', PASSWORD);

    expect(wrongPassword.ok === false && wrongPassword.message).toBe(
      unknownAddress.ok === false ? unknownAddress.message : null,
    );
  });

  it('logs the real cause in dev, without the address or the password', async () => {
    refusal('Invalid login credentials');

    await signIn(ADDRESS, PASSWORD);

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toMatch(/no such address, or the password is wrong/);
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain(ADDRESS);
  });

  it('says the address is unconfirmed rather than blaming the password', async () => {
    refusal('Email not confirmed', 400, 'email_not_confirmed');

    const result = await signIn(ADDRESS, PASSWORD);

    expect(result.ok === false && result.message).toMatch(/not been confirmed/i);
  });

  it('does not report a rate limit as a bad password', async () => {
    refusal('email rate limit exceeded', 429, 'over_email');

    const result = await signIn(ADDRESS, PASSWORD);

    expect(result.ok === false && result.message).not.toBe(
      'That email address or password is not correct.',
    );
    expect(result.ok === false && result.message).toMatch(/wait a few minutes/i);
  });

  it('reports an unreachable auth service as a service problem, not a bad password', async () => {
    mockSignInWithPassword.mockRejectedValue(new TypeError('fetch failed'));

    const result = await signIn(ADDRESS, PASSWORD);

    // The client rejects on a transport failure, so it has to be caught. A raw
    // TypeError used to escape as a thrown error and the screen showed nothing
    // at all, which reads as a button that does nothing.
    expect(result.ok === false && result.message).toBe(
      'We could not reach the service. Check your connection and try again.',
    );
  });

  it('never shows the transport error itself', async () => {
    mockSignInWithPassword.mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.1:4000'));

    const result = await signIn(ADDRESS, PASSWORD);

    expect(result.ok === false && result.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.1/);
  });
});

describe('a refused sign-up', () => {
  it('points at the mailer when the rate limit blocks account creation', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'email rate limit exceeded', status: 429, code: 'over_email' },
    });

    const result = await register(ADDRESS, PASSWORD);

    expect(result.ok === false && result.message).toMatch(/wait a few minutes/i);
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toMatch(/mailer rate limit/);
    expect(logged).not.toContain(PASSWORD);
  });

  it('treats an address that already exists as a sign-in, not a failure', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered', status: 422, code: 'user_already_exists' },
    });

    const result = await register(ADDRESS, PASSWORD);

    expect(result.ok === false && result.message).toMatch(/already in use/i);
  });
});
