import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test-*.{js,ts}', 'e2e-test.js', 'hook-test-suite.js', 'hook-e2e-validation.js', 'tests/**/*.test.{js,ts}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    maxForks: 4,
    fileParallelism: false,
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        branches: 65,
        functions: 70,
        lines: 70,
        statements: 70,
      },
      exclude: ['dist/**', 'tests/**', 'scripts/**', '*.config.*'],
    },
  },
});
