import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const apiPort = '34567';
const wsPort = '34567';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${wsPort}`,
        ws: true,
      },
    },
  },
});
