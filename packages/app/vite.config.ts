import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const apiPort = process.env.VITE_API_PORT || '3000';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5175,
    strictPort: false,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
