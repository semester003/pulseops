import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
