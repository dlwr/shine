import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import importX from 'eslint-plugin-import-x';
import n from 'eslint-plugin-n';
import promise from 'eslint-plugin-promise';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

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

const generalRules = {
	// pnpm workspaceで共通依存をルートに集約しているためオフのままにする
	'import-x/no-extraneous-dependencies': 'off',
	'n/no-extraneous-import': 'off',
	'import-x/extensions': 'off',
	'no-await-in-loop': 'off',
	'import-x/no-anonymous-default-export': 'off',
	'n/prefer-global/process': 'off',
	'unicorn/no-process-exit': 'off',
	'no-bitwise': 'off',
	'n/prefer-global/buffer': 'off',
	'no-alert': 'off',
	'promise/prefer-await-to-then': 'off',
	'no-return-assign': 'off',
};

const typescriptRules = {
	'@typescript-eslint/naming-convention': 'off',
	'@typescript-eslint/no-unsafe-assignment': 'off',
	'@typescript-eslint/no-unsafe-argument': 'off',
	'@typescript-eslint/no-unsafe-member-access': 'off',
	'@typescript-eslint/no-unsafe-call': 'off',
	'@typescript-eslint/no-unsafe-return': 'off',
	'@typescript-eslint/member-ordering': 'off',
	'@typescript-eslint/consistent-type-assertions': 'off',
	'@typescript-eslint/no-confusing-void-expression': 'off',
	'@typescript-eslint/no-unnecessary-type-assertion': 'off',
	'@typescript-eslint/no-floating-promises': 'off',
	'@typescript-eslint/no-deprecated': 'off',
	'@typescript-eslint/no-explicit-any': 'off',
	'@typescript-eslint/no-unused-vars': 'off',
	'@typescript-eslint/require-await': 'off',
	'@typescript-eslint/unbound-method': 'off',
};

const typeAwareRules = {
	'@typescript-eslint/prefer-nullish-coalescing': [
		'error',
		{
			ignoreTernaryTests: true,
			ignoreConditionalTests: true,
			ignorePrimitives: {
				string: true,
				number: true,
				bigint: true,
				boolean: true,
			},
		},
	],
};

const tsFiles = ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'];

const typeCheckedFiles = [
	'api/**/*.ts',
	'api/**/*.tsx',
	'front/app/**/*.ts',
	'front/app/**/*.tsx',
	'scrapers/**/*.ts',
	'src/**/*.ts',
];

const tsProjects = [
	'./tsconfig.json',
	'./api/tsconfig.json',
	'./front/tsconfig.cloudflare.json',
	'./front/tsconfig.node.json',
	'./scrapers/tsconfig.json',
	'./scripts/tsconfig.json',
];

const projectRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)));

export default tseslint.config(
	{
		ignores,
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		plugins: {
			'import-x': importX,
			n,
			promise,
			unicorn,
		},
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: generalRules,
	},
	{
		files: tsFiles,
		rules: typescriptRules,
	},
	{
		files: typeCheckedFiles,
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: tsProjects,
				tsconfigRootDir: projectRoot,
			},
		},
		rules: typeAwareRules,
	},
	eslintConfigPrettier,
);
