type SessionExpiredListener = () => void | Promise<void>;

const listeners = new Set<SessionExpiredListener>();

/**
 * Single funnel for "this session is no longer valid". The API client raises the
 * event; the auth layer decides what the user sees. Keeping this in its own
 * module avoids a dependency cycle between the client and the store.
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function notifySessionExpired(): Promise<void> {
  for (const listener of listeners) {
    try {
      await listener();
    } catch {
      // a failing listener must not break the others
    }
  }
}
