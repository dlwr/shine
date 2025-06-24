import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'api/src/**/*.test.ts',
      'scrapers/src/**/*.test.ts',
      'src/**/*.test.ts',
      'front/src/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
      ],
    },
  },
})