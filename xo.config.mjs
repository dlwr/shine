import path from 'node:path';
import {fileURLToPath} from 'node:url';
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
	complexity: ['warn', 40],
	'max-depth': ['warn', 8],
	'max-nested-callbacks': ['warn', 8],
	'no-await-in-loop': 'off',
	'import-x/no-anonymous-default-export': 'off',
	'n/prefer-global/process': 'off',
	'unicorn/no-process-exit': 'off',
	'no-bitwise': 'off',
	'max-params': ['warn', 6],
	'n/prefer-global/buffer': 'off',
	'no-alert': 'off',
	'promise/prefer-await-to-then': 'off',
	'no-return-assign': 'off',
};;

const typescriptRules = {
	'@typescript-eslint/naming-convention': 'off',
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
	'./front/tsconfig.json',
	'./scrapers/tsconfig.json',
	'./scripts/tsconfig.json',
];

const projectRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)));

export default [
	{
		ignores,
	},
	{
		rules: generalRules,
		prettier: true,
	},
	{
		files: tsFiles,
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		languageOptions: {
			parser: tseslint.parser,
		},
		rules: typescriptRules,
	},
	{
		files: typeCheckedFiles,
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: tsProjects,
				tsconfigRootDir: projectRoot,
			},
		},
	},
];
