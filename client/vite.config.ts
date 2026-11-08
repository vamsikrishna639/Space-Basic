/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, defaultClientConditions, defaultServerConditions } from 'vite';
import react from '@vitejs/plugin-react';

const refAssets = fileURLToPath(new URL('../reference-ui/assets', import.meta.url));

// Client build (docs/architecture.md). `@spacebasic/shared` is read from its TypeScript source through the
// `source` export condition, like the server does in development. The supplied brand assets are imported straight
// from reference-ui/assets (used as-is, never copied or edited).
export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['source', ...defaultClientConditions],
    alias: { '@assets': refAssets },
  },
  server: {
    port: 5173,
    strictPort: true,
    // reference-ui/assets lives outside the client folder
    fs: { allow: ['..'] },
    // Same-origin API in development, like the Vercel rewrite in production (refresh cookie stays first-party).
    proxy: { '/api': 'http://localhost:4000' },
  },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  // Vitest resolves with the SSR conditions: read `shared` from source there too.
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: { environment: 'node', include: ['src/**/*.test.ts'], server: { deps: { inline: ['@spacebasic/shared'] } } },
});
