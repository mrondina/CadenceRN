import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/domain/**/__tests__/**/*.test.ts',
      'src/db/**/__tests__/**/*.test.ts',
      'src/hooks/**/__tests__/**/*.test.ts',
      'src/stores/**/__tests__/**/*.test.ts',
    ],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
