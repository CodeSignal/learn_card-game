import { defineConfig } from 'vite';

export default defineConfig({
  root: './client',
  server: {
    host: '0.0.0.0',
    hmr: true,
    allowedHosts: true,
    port: 3000,
    proxy: {
      '/state': {
        target: 'http://localhost:3031',
        changeOrigin: true
      },
      '/initial-state': {
        target: 'http://localhost:3031',
        changeOrigin: true
      },
      '/message': {
        target: 'http://localhost:3031',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3031',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
