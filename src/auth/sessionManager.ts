import { apiClient } from '@/api/client';
import { isExpired, secureTokenStorage, type TokenStorage } from './tokenStorage';
import type { AuthSession } from '@/types/api';

export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3600;

export function toTokens(session: AuthSession) {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt:
      typeof session.expiresAt === 'number'
        ? session.expiresAt
        : Date.now() + DEFAULT_ACCESS_TOKEN_TTL_SECONDS * 1000,
  };
}

export interface SessionManagerOptions {
  storage?: TokenStorage;
}

export class SessionManager {
  private readonly storage: TokenStorage;

  constructor(options: SessionManagerOptions = {}) {
    this.storage = options.storage ?? secureTokenStorage;
  }

  /** Persists a freshly issued session. Tokens go to secure storage only. */
  async persist(session: AuthSession): Promise<void> {
    await this.storage.set(toTokens(session));
  }

  async read() {
    return this.storage.get();
  }

  async clear(): Promise<void> {
    await this.storage.clear();
  }

  /** A stored session is only trusted while its access token is still valid. */
  async isUsable(): Promise<boolean> {
    return !isExpired(await this.storage.get());
  }

  /**
   * Signs out locally. This never notifies the server: the refresh token is
   * destroyed locally and the backend revokes the session on its own schedule.
   */
  async signOut(): Promise<void> {
    await this.storage.clear();
  }

  get baseUrl(): string {
    return apiClient.baseUrl;
  }
}

export const sessionManager = new SessionManager();
