import {reactRouter} from '@react-router/dev/vite';
import {cloudflare} from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
	plugins: [
		cloudflare({viteEnvironment: {name: 'ssr'}}),
		tailwindcss(),
		reactRouter(),
		tsconfigPaths(),
	],
	resolve: {
		alias: {
			'@routes': `${dirname}/app/routes`,
		},
	},
});
