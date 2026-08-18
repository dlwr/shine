import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import reactHooks from 'eslint-plugin-react-hooks';
const ignores = [
  '**/.wrangler/**',
  '**/dist/**',
  '**/node_modules/**',
  '**/*.mjs',
  '**/*.js',
  '**/*.cjs',
  '**/worker-configuration.d.ts',
  '**/build/**',
  '**/test-results/**',
  '**/.react-router/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/tmp/**',
  '**/package.json',
];

export default tseslint.config(
  {
    ignores,
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginUnicorn.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/__tests__/**'],
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
  {
    files: [
      'apps/api/src/index.ts',
      'apps/api/src/routes/**',
      'drizzle.config.ts',
    ],
    rules: {
      'unicorn/no-top-level-side-effects': 'off',
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: {'react-hooks': reactHooks},
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  eslintConfigPrettier
);
