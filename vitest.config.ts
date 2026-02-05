import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60_000,     // RPC calls can be slow, especially with rate limiting
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    // Run test files sequentially to avoid RPC rate limiting (429)
    fileParallelism: false,
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
