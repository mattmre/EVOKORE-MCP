import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test-*.{js,ts}', 'e2e-test.js', 'hook-test-suite.js', 'hook-e2e-validation.js'],
    testTimeout: 60000,
    hookTimeout: 30000,
    pool: 'forks',
    fileParallelism: false,
    globals: true,
    globalSetup: './tests/global-setup.ts',
  },
});
