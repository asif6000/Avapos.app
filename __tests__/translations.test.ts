import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createTranslator } from '@/i18n';

/**
 * Every user-facing string must exist in the dictionary.
 *
 * A missing key does not crash: `t()` returns the key itself, so the UI
 * silently renders `auth.fullName` in a text field. That is exactly the kind of
 * defect that reaches a customer looking unpolished and is easy to miss in a
 * screenshot review, so it is checked here instead.
 *
 * The check imports the real dictionary rather than parsing the source, so
 * multi-line strings and comments cannot fool it.
 */

const ROOT = join(__dirname, '..');
const SOURCE_DIRS = ['app', 'src'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'android', 'ios']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function collectKeys(): { key: string; file: string }[] {
  const found: { key: string; file: string }[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const source = readFileSync(file, 'utf8');
      const pattern = /\bt\(\s*'([a-zA-Z0-9_.]+)'/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const key = match[1];
        if (key) found.push({ key, file: file.slice(ROOT.length + 1) });
      }
    }
  }
  return found;
}

describe('translations', () => {
  const en = createTranslator('en');
  const bn = createTranslator('bn');

  it('resolves every key the app asks for, in both languages', () => {
    const missing: string[] = [];

    for (const { key, file } of collectKeys()) {
      // t() returns the key unchanged when it is missing, so a round-trip is a
      // reliable "does this exist" check.
      if (en(key) === key) missing.push(`en: ${key} (${file})`);
      if (bn(key) === key) missing.push(`bn: ${key} (${file})`);
    }

    expect(missing).toEqual([]);
  });

  it('falls back to English for an unknown key rather than crashing', () => {
    expect(en('does.not.exist')).toBe('does.not.exist');
  });

  it('keeps the Bengali dictionary in step with English', () => {
    const enModule = require('@/i18n/en') as { en: unknown };
    const bnModule = require('@/i18n/bn') as { bn: unknown };

    const flatten = (value: unknown, prefix = ''): string[] => {
      if (typeof value !== 'object' || value === null) return [prefix];
      return Object.entries(value).flatMap(([key, child]) =>
        flatten(child, prefix ? `${prefix}.${key}` : key),
      );
    };

    const enKeys = flatten(enModule.en).sort();
    const bnKeys = flatten(bnModule.bn).sort();

    expect(bnKeys).toEqual(enKeys);
  });
});
