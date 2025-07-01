import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import path from 'node:path';

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			db: path.resolve(__dirname, './src/index.ts'),
		},
	},
	test: {
		globals: true,
		setupFiles: ['./vitest.setup.ts'],
		include: [
			'api/src/**/*.test.ts',
			'scrapers/src/**/*.test.ts',
			'src/**/*.test.ts',
			'front/app/**/*.test.{ts,tsx}',
		],
		exclude: ['node_modules/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov', 'html'],
			exclude: ['node_modules/**', 'dist/**'],
		},
		pool: 'threads',
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
		environmentMatchGlobs: [
			['api/src/**/*.test.ts', 'node'],
			['scrapers/src/**/*.test.ts', 'node'],
			['src/**/*.test.ts', 'node'],
			['front/app/**/*.test.{ts,tsx}', 'jsdom'],
		],
	},
});
