import tseslint from 'typescript-eslint';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';

const rule = process.env.UNICORN_RULE;

export default tseslint.config(
  {
    ignores: [
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
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    linterOptions: {reportUnusedDisableDirectives: 'off'},
    languageOptions: {parser: tseslint.parser},
    plugins: {unicorn: eslintPluginUnicorn},
    rules: {[`unicorn/${rule}`]: 'error'},
  },
);
