import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@routes': `${dirname}/apps/front/app/routes`,
      '@': `${dirname}/apps/front/app`,
      '@/components': `${dirname}/apps/front/app/components`,
      '@/lib': `${dirname}/apps/front/app/lib`,
      '@/hooks': `${dirname}/apps/front/app/hooks`,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['apps/front/app/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**'],
  },
});
