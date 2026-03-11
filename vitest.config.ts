import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      '@ooda-agent/core': resolve(__dirname, './packages/core/src'),
      '@ooda-agent/server': resolve(__dirname, './packages/server/src'),
      '@ooda-agent/tools': resolve(__dirname, './packages/tools/src'),
      '@ooda-agent/storage': resolve(__dirname, './packages/storage/src'),
      '@ooda-agent/app': resolve(__dirname, './packages/app/src'),
    },
  },
});
