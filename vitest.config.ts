import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

export default defineConfig({
	plugins: [react()],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.ts'],
		include: [
			'api/src/**/*.test.ts',
			'scrapers/src/**/*.test.ts',
			'src/**/*.test.ts',
			'front/src/**/*.test.ts',
			'front-rr/app/**/*.test.{ts,tsx}',
		],
		exclude: ['node_modules/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov', 'html'],
			exclude: ['node_modules/**', 'dist/**'],
		},
	},
});
