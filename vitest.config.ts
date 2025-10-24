import path from 'node:path';
import {fileURLToPath} from 'node:url';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shine/database': path.resolve(
        dirname,
        './packages/database/src/index.ts',
      ),
      '@shine/utils': path.resolve(dirname, './packages/utils/src/index.ts'),
      '@shine/types': path.resolve(dirname, './packages/types/src/index.ts'),
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
            'apps/api/src/**/*.test.ts',
            'apps/scrapers/src/**/*.test.ts',
            'packages/database/**/*.test.ts',
          ],
          environment: 'node',
          globals: true,
          setupFiles: ['./vitest.setup.node.ts'],
        },
      },
      {
        resolve: {
          alias: {
            '@routes': path.resolve(dirname, 'apps/front/app/routes'),
            '@': path.resolve(dirname, 'apps/front/app'),
            '@/components': path.resolve(dirname, 'apps/front/app/components'),
            '@/lib': path.resolve(dirname, 'apps/front/app/lib'),
            '@/hooks': path.resolve(dirname, 'apps/front/app/hooks'),
          },
        },
        test: {
          name: 'jsdom',
          include: ['apps/front/app/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
});
