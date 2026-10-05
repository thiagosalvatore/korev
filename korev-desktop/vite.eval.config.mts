import { defineConfig } from 'vitest/config';

const EVAL_TIMEOUT_MS = 40 * 60_000;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['eval/**/*.eval.ts'],
    testTimeout: EVAL_TIMEOUT_MS,
    fileParallelism: false,
  },
});
