import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.spec.ts'],
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false,
  },
});
