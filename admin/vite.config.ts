import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Built into `admin/dist`, which the API serves from `/admin` in production and
 * the dev proxy serves from the same origin. One origin on purpose: the customer
 * API sends no CORS headers, so a panel on its own origin could not read a single
 * response.
 *
 * `base: '/admin'` is what makes the built assets resolve under that path.
 */
export default defineConfig({
  base: '/admin',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 8090,
    // Dev server: proxy the API to the same origin so the browser sees one
    // origin in development exactly as it does in production.
    proxy: {
      '/admin/api': { target: 'http://127.0.0.1:4000', changeOrigin: true, rewrite: (p) => p.replace('/admin/api', '/admin') },
      '/customer': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/auth/v1': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/rest/v1': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
});
