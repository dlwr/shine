import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@routes': `${dirname}/front/app/routes`,
      '@': `${dirname}/front/app`,
      '@/components': `${dirname}/front/app/components`,
      '@/lib': `${dirname}/front/app/lib`,
      '@/hooks': `${dirname}/front/app/hooks`,
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
