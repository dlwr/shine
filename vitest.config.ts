import react from '@vitejs/plugin-react';
import path from 'node:path';
import {defineConfig} from 'vitest/config';

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			db: path.resolve(
				path.dirname(new URL('./', import.meta.url).pathname),
				'./src/index.ts',
			),
		},
	},
	test: {
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
		projects: [
			{
				test: {
					name: 'node',
					include: [
						'api/src/**/*.test.ts',
						'scrapers/src/**/*.test.ts',
						'src/**/*.test.ts',
					],
					environment: 'node',
					globals: true,
					setupFiles: ['./vitest.setup.node.ts'],
				},
			},
			{
				test: {
					name: 'jsdom',
					include: ['front/app/**/*.test.{ts,tsx}'],
					environment: 'jsdom',
					globals: true,
					setupFiles: ['./vitest.setup.ts'],
				},
			},
		],
	},
});
