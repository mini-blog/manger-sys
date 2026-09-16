import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(import.meta.dirname, '../..'), '');
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy: { '/api': `http://127.0.0.1:${env.API_PORT || 3100}` } },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/')) {
              if (id.includes('/@mui/') || id.includes('/@emotion/')) return 'ui';
              if (id.includes('/luxon/')) return 'dates';
              if (id.includes('/@tanstack/')) return 'query';
              return 'vendor';
            }
          },
        },
      },
    },
  };
});
