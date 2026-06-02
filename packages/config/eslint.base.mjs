// Shared ESLint flat-config preset (ESLint 10 + typescript-eslint 8).
// Non-type-aware: fast, no `parserOptions.project` needed. Apps layer their
// own globals/plugins on top (see the repo-root eslint.config.mjs).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Keep ESLint out of Prettier's lane.
  prettier,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
