import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: Number(process.env.VITEST_TEST_TIMEOUT ?? 90_000),
    hookTimeout: Number(process.env.VITEST_HOOK_TIMEOUT ?? 120_000),
    fileParallelism: false,
    sequence: { concurrent: false },
    reporters: ['default'],
  },
});
