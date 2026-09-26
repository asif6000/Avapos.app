// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'android/*',
      'ios/*',
      'modules/*',
      // The admin panel is a separate browser app with its own config below.
      'admin/**',
      // The API is a separate Node service. Two Expo rules are actively wrong
      // for it rather than merely inapplicable:
      //
      //   expo/no-dynamic-env-var  — in the app, `EXPO_PUBLIC_*` is inlined into
      //     a shipped bundle, so a computed name genuinely breaks. On a server
      //     `process.env` is read at runtime and a computed name is ordinary.
      //   the React Native resolver  — there is no Metro here, and `.js`
      //     extensions in imports are what Node ESM requires.
      'api/**',
    ],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: [
      'jest.setup.js',
      'jest.config.js',
      'eslint.config.js',
      'scripts/**/*.{js,mjs}',
      'mock-server/**/*.mjs',
      '**/__tests__/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        global: 'readonly',
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        __DEV__: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },
  {
    // The API is a plain Node service: no React, no Expo, no bundler. The rules
    // above are the app's; these are the ones that actually matter to it, and
    // `any` is refused outright because the whole safety argument in
    // reads.ts is that the ownership filter is typed and visible.
    files: ['api/**/*.{ts,js}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', fetch: 'readonly', Buffer: 'readonly', URL: 'readonly' },
    },
    rules: {
      'no-console': ['error', { allow: ['error', 'warn'] }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // Test harnesses and the RLS verification script are CLIs; printing is
      // their entire job.
      'no-console': 'off',
    },
  },
]);
