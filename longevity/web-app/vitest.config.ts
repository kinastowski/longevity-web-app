import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['amplify/functions/**/*.test.ts'],
    environment: 'node',
  },
});
