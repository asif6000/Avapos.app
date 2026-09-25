// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'android/*', 'ios/*', 'modules/*'],
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
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // Test harnesses and the RLS verification script are CLIs; printing is
      // their entire job.
      'no-console': 'off',
    },
  },
]);
