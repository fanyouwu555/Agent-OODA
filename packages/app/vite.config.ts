import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const apiPort = process.env.VITE_API_PORT || '3000';
const wsPort = process.env.VITE_WS_PORT || '3000';

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
