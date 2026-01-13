
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
});

