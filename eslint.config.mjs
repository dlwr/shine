import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import reactHooks from 'eslint-plugin-react-hooks';
const ignores = [
  '**/.claude/**',
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
    rules: {
      'unicorn/single-line-block-comment-style': ['error', 'single-line'],
      'unicorn/consistent-class-member-order': [
        'error',
        {
          order: [
            'static-field',
            'static-block',
            'static-method',
            'private-field',
            'public-field',
            'constructor',
            'public-method',
            'private-method',
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'vitest.setup*.ts'],
    rules: {
      'unicorn/no-top-level-assignment-in-function': 'off',
    },
  },
  {
    // unicorn 73 で増えたルール。1ルールずつ直しては消していく作業中で、
    // 全部消えたらこのブロックごと無くなる。恒久的な除外ではない。
    rules: {
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/max-nested-calls': 'off',
      'unicorn/name-replacements': 'off',
      'unicorn/no-break-in-nested-loop': 'off',
      'unicorn/no-top-level-assignment-in-function': 'off',
      'unicorn/prefer-await': 'off',
      // Iterator#toArray は tsconfig の lib が ES2023 なので型が無い
      'unicorn/prefer-iterator-to-array': 'off',
      'unicorn/prefer-number-coercion': 'off',
      'unicorn/prefer-simple-condition-first': 'off',
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
