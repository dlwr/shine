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
      'unicorn/consistent-class-member-order': 'off',
      'unicorn/consistent-optional-chaining': 'off',
      'unicorn/logical-assignment-operators': 'off',
      'unicorn/max-nested-calls': 'off',
      'unicorn/name-replacements': 'off',
      'unicorn/no-break-in-nested-loop': 'off',
      'unicorn/no-chained-comparison': 'off',
      'unicorn/no-computed-property-existence-check': 'off',
      'unicorn/no-declarations-before-early-exit': 'off',
      'unicorn/no-incorrect-template-string-interpolation': 'off',
      'unicorn/no-this-outside-of-class': 'off',
      'unicorn/no-unnecessary-global-this': 'off',
      'unicorn/no-unreadable-for-of-expression': 'off',
      'unicorn/no-top-level-assignment-in-function': 'off',
      'unicorn/no-unsafe-string-replacement': 'off',
      'unicorn/prefer-await': 'off',
      'unicorn/prefer-else-if': 'off',
      'unicorn/prefer-includes-over-repeated-comparisons': 'off',
      'unicorn/prefer-iterator-to-array': 'off',
      'unicorn/prefer-minimal-ternary': 'off',
      'unicorn/prefer-number-coercion': 'off',
      'unicorn/prefer-number-is-safe-integer': 'off',
      'unicorn/prefer-simple-condition-first': 'off',
      'unicorn/prefer-simple-sort-comparator': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/prefer-unicode-code-point-escapes': 'off',
      'unicorn/prefer-url-href': 'off',
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
