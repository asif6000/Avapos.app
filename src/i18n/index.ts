import { getLocales } from 'expo-localization';

import { bn } from './bn';
import { en, type TranslationSchema } from './en';

export type Language = 'en' | 'bn';

const dictionaries: Record<Language, TranslationSchema> = {
  en,
  bn: bn as TranslationSchema,
};

export function detectLanguage(): Language {
  const tag = getLocales()[0]?.languageCode;
  return tag === 'bn' ? 'bn' : 'en';
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
