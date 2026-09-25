import { useState, type FormEvent } from 'react';

import { cardStyle, tokens, useSessionValue } from '../ui';

/**
 * The door.
 *
 * Two things it will not do: it will not say whether an address exists, and it
 * will not stay signed in after a refusal. A staff member who typed the wrong
 * password learns exactly what a staff member who is not staff learns — the same
 * message, and the same signed-out state.
 */
export function SignIn() {
  const { signIn, error, setError } = useSessionValue();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
      setPassword('');
    } catch {
      // The message is already on screen; the password is dropped either way.
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <form style={{ ...cardStyle, ...styles.card }} onSubmit={submit}>
        <div style={styles.mark}>Customer</div>
        <h1 style={styles.title}>Admin</h1>
        <p style={styles.sub}>
          Staff only. Everything you see here is about a named customer, and every action is written
          down with your name and a reason.
        </p>

        <label style={styles.label} htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          style={styles.input}
          required
        />

        <label style={styles.label} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          style={styles.input}
          required
        />

        {error ? (
          <p style={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" style={styles.submit} disabled={busy}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: tokens.canvas,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 420, display: 'grid', gap: 6 },
  mark: {
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: tokens.green,
    fontWeight: 700,
  },
  title: { margin: '4px 0 0', fontSize: 26, letterSpacing: -0.4, color: tokens.ink },
  sub: { margin: '0 0 12px', color: tokens.muted, fontSize: 14, lineHeight: 1.5 },
  label: { fontSize: 13, color: tokens.inkSoft, fontWeight: 600, marginTop: 8 },
  input: {
    marginTop: 4,
    padding: '12px 14px',
    fontSize: 16,
    borderRadius: 12,
    border: `1px solid ${tokens.line}`,
    background: tokens.surface,
    color: tokens.ink,
  },
  error: {
    margin: '10px 0 0',
    padding: '10px 12px',
    borderRadius: 10,
    background: tokens.dangerSoft,
    color: tokens.danger,
    fontSize: 14,
  },
  submit: {
    marginTop: 18,
    height: 48,
    border: 0,
    borderRadius: 999,
    background: tokens.green,
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
