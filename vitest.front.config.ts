import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@routes': `${dirname}/front/app/routes`,
		},
	},
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.ts'],
		include: ['front/app/**/*.test.{ts,tsx}'],
		exclude: ['node_modules/**'],
	},
});
