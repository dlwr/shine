import react from '@vitejs/plugin-react';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			db: path.resolve(dirname, './src/index.ts'),
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
				resolve: {
					alias: {
						'@routes': path.resolve(dirname, 'front/app/routes'),
						'@': path.resolve(dirname, 'front/app'),
						'@/components': path.resolve(dirname, 'front/app/components'),
						'@/lib': path.resolve(dirname, 'front/app/lib'),
						'@/hooks': path.resolve(dirname, 'front/app/hooks'),
					},
				},
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
