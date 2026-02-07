
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

import path from 'node:path';
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'LIGHTWEIGHT_CHARTS_VERSION': JSON.stringify(
      JSON.parse(readFileSync(path.resolve(__dirname, './node_modules/lightweight-charts/package.json'), 'utf-8')).version
    ),
  },
  // Vitest configuration
  // @ts-expect-error - vitest types handled by vitest
  test: {
    // Only include unit tests in src/
    include: ['src/**/*.{test,spec}.{js,ts,tsx}'],
    // Exclude Playwright E2E tests in tests/ folder
    exclude: [
      'tests/**/*',
      'node_modules/**/*',
      'dist/**/*',
    ],
    // Use jsdom for React component tests
    environment: 'jsdom',
    globals: true,
  },
  server: {
    proxy: {
      '/meta': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/chart': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/fundamentals': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/assistant': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});

