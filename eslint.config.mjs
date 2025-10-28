import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import eslintPluginUnicorn from 'eslint-plugin-unicorn';
const ignores = [
  '**/.wrangler/**',
  '**/dist/**',
  '**/node_modules/**',
  '**/*.mjs',
  '**/*.js',
  '**/*.cjs',
  '**/.astro/**',
  '**/worker-configuration.d.ts',
  '**/build/**',
  '**/test-results/**',
  '**/.react-router/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/tmp/**',
  '**/scripts/**',
  '**/package.json',
];

const projectRules = {};

const stylisticRules = {};

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
  eslintConfigPrettier,
  {
    rules: {
      ...projectRules,
      ...stylisticRules,
    },
  }
);
