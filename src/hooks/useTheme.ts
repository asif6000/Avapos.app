import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { createTranslator, type Language, type Translator } from '@/i18n';
import { usePreferencesStore } from '@/store/preferencesStore';
import { darkTheme, lightTheme, type ThemePreference } from '@/theme/theme';

export function useTranslation(): { t: Translator; language: Language } {
  const language = usePreferencesStore((state) => state.language);
  const t = useMemo(() => createTranslator(language), [language]);
  return { t, language };
}

export function useAppTheme() {
  const preference = usePreferencesStore((state) => state.theme);
  const systemScheme = useColorScheme();
  return useMemo(() => {
    const resolved: Exclude<ThemePreference, 'system'> =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
    return {
      theme: resolved === 'dark' ? darkTheme : lightTheme,
      isDark: resolved === 'dark',
    };
  }, [preference, systemScheme]);
}
