import {reactRouter} from '@react-router/dev/vite';
import {cloudflare} from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [
    cloudflare({viteEnvironment: {name: 'ssr'}}),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  // Workers-ogのwasm importはViteの事前バンドルで壊れるため除外し、workerdに直接解決させる
  ssr: {
    optimizeDeps: {
      exclude: ['workers-og'],
    },
  },
});
