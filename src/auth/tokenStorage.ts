import * as SecureStore from 'expo-secure-store';

import type { AuthTokens } from '@/types/api';

export const TOKEN_STORAGE_KEY = 'srabon.session.v1';

export interface TokenStorage {
  get(): Promise<AuthTokens | null>;
  set(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}

function parse(raw: string | null): AuthTokens | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as AuthTokens).accessToken === 'string' &&
      typeof (parsed as AuthTokens).refreshToken === 'string' &&
      typeof (parsed as AuthTokens).expiresAt === 'number'
    ) {
      return parsed as AuthTokens;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Access and refresh tokens live in the Android Keystore-backed EncryptedSharedPreferences
 * via expo-secure-store. Nothing sensitive is ever written to AsyncStorage.
 */
export const secureTokenStorage: TokenStorage = {
  async get() {
    try {
      return parse(await SecureStore.getItemAsync(TOKEN_STORAGE_KEY));
    } catch {
      return null;
    }
  },
  async set(tokens) {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, JSON.stringify(tokens), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async clear() {
    try {
      await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    } catch {
      // Deleting a non-existent key must never block logout.
    }
  },
};

/** Used by unit tests and by environments without a native secure enclave. */
export function createMemoryTokenStorage(initial: AuthTokens | null = null): TokenStorage {
  let current = initial;
  return {
    async get() {
      return current;
    },
    async set(tokens) {
      current = tokens;
    },
    async clear() {
      current = null;
    },
  };
}

export function isExpired(tokens: AuthTokens | null, skewMs = 30_000): boolean {
  if (!tokens) return true;
  return tokens.expiresAt - skewMs <= Date.now();
}
