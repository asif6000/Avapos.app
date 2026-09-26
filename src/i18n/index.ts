import { getLocales } from 'expo-localization';

import { bn } from './bn';
import { en, type TranslationSchema } from './en';

export type Language = 'en' | 'bn';

const dictionaries: Record<Language, TranslationSchema> = {
  en,
  bn: bn as TranslationSchema,
};

/**
 * The phone's language, defaulting to English.
 *
 * WHY THIS IS DEFENSIVE DOWN TO `try`
 *
 * `getLocales` is not a pure JS helper — it is `ExpoLocalization.getLocales`, the
 * native module's function handed straight to JavaScript, returning whatever the
 * platform's `Resources`/`NSLocale` layer gave it. That is `null` on some devices
 * and configurations and it throws outright on others.
 *
 * And this runs at *import time*, not in a screen: `preferencesStore` calls it
 * inside its `create(...)`, and `preferencesStore` is in the startup import graph
 * (`_layout` → `useTheme` → `preferencesStore` → this file). A throw here happens
 * before `AppRegistry.registerComponent('main', …)` is ever reached, so there is no
 * React tree to catch it and no error boundary anywhere in the app that could: the
 * splash screen is still up, nothing replaces it, and the process is killed. From
 * the outside that is indistinguishable from the app not opening at all.
 *
 * So the whole native call is contained. A language is a preference; the worst a
 * wrong answer can be is that a screen opens in English, and that is not worth an
 * app that will not start.
 */
export function detectLanguage(): Language {
  try {
    const tag = getLocales()?.[0]?.languageCode;
    return tag === 'bn' ? 'bn' : 'en';
  } catch {
    return 'en';
  }
}

type DotPath = string;

function lookup(dictionary: TranslationSchema, path: DotPath): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, segment) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[segment] : undefined,
      dictionary,
    );
}

/**
 * Minimal, dependency-free localization. Every user-facing string in the app
 * goes through `t` so the UI is Bengali-ready without rewriting screens.
 */
export function createTranslator(language: Language) {
  return function t(path: DotPath, params?: Record<string, string | number>): string {
    const value = lookup(dictionaries[language], path) ?? lookup(dictionaries.en, path);
    if (typeof value !== 'string') return path;
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in params ? String(params[key]) : match,
    );
  };
}

export type Translator = ReturnType<typeof createTranslator>;
