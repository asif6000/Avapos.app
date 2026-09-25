import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';

import { ApiError, api, signIn as doSignIn, signOut as doSignOut, whoAmI, type AdminIdentity } from './lib/api';

/**
 * The shared shell: a session, a theme, and the small set of components every
 * screen composes.
 *
 * `Session` is deliberately thin. It holds the signed-in identity the *server*
 * confirmed, and nothing about permissions the panel could enforce on its own —
 * because a panel that hides a button it does not have the right to press is
 * still a panel with that button in it.
 */

export const tokens = {
  green: '#0b6b5b',
  greenDark: '#085246',
  greenSoft: '#e7f1ee',
  ink: '#131918',
  inkSoft: '#3f4947',
  muted: '#6f7977',
  line: '#e4edea',
  surface: '#ffffff',
  canvas: '#f6f8f8',
  warn: '#9a6200',
  warnSoft: '#fdf3e2',
  danger: '#a32626',
  dangerSoft: '#fbecec',
} as const;

export const cardStyle: CSSProperties = {
  background: tokens.surface,
  border: `1px solid ${tokens.line}`,
  borderRadius: 16,
  padding: 18,
};

export function useSession() {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On load, ask the server who this is. Never trust the stored token on its
  // own: it may have been revoked, or belong to a session that has since lost
  // its admin role.
  useEffect(() => {
    let alive = true;
    void whoAmI().then((found) => {
      if (!alive) return;
      setIdentity(found);
      setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await doSignIn(email, password);
      setIdentity(await whoAmI());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not sign in.');
      throw caught;
    }
  }, []);

  const signOut = useCallback(() => {
    doSignOut();
    setIdentity(null);
  }, []);

  return useMemo(
    () => ({ identity, checking, error, signIn, signOut, setError }),
    [identity, checking, error, signIn, signOut],
  );
}

const SessionContext = createContext<ReturnType<typeof useSession> | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSession();
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionValue() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
}

/* ----------------------------------------------------------------- data bits */

export function useResource<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load this.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

export { api, ApiError };
