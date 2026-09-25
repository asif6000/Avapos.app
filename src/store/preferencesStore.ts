import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { detectLanguage, type Language } from '@/i18n';
import type { ThemePreference } from '@/theme/theme';

const LANGUAGE_KEY = 'preferences.language';
const THEME_KEY = 'preferences.theme';

interface PreferencesState {
  language: Language;
  theme: ThemePreference;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
}

/**
 * Non-sensitive UI preferences only. Tokens and secrets never touch this store.
 */
export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  language: detectLanguage(),
  theme: 'system',
  hydrated: false,

  async hydrate() {
    try {
      const [language, theme] = await Promise.all([
        AsyncStorage.getItem(LANGUAGE_KEY),
        AsyncStorage.getItem(THEME_KEY),
      ]);
      set({
        language: language === 'bn' || language === 'en' ? language : get().language,
        theme: theme === 'dark' || theme === 'light' || theme === 'system' ? theme : 'system',
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  async setLanguage(language) {
    set({ language });
    await AsyncStorage.setItem(LANGUAGE_KEY, language).catch(() => undefined);
  },

  async setTheme(theme) {
    set({ theme });
    await AsyncStorage.setItem(THEME_KEY, theme).catch(() => undefined);
  },
}));
