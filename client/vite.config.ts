/// <reference types="vitest/config" />
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, defaultClientConditions, defaultServerConditions, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const refAssets = fileURLToPath(new URL('../reference-ui/assets', import.meta.url));

/**
 * Same-origin API in development, like the Vercel rewrite in production (the refresh cookie stays first-party).
 * A plain Node pipe instead of Vite's `server.proxy`: that proxy (http-proxy-3 on Node 24) intermittently stalled
 * responses over ~256 KB at a fixed byte offset, e.g. the 317 KB institution logo (decisions.md). Dev only.
 */
function apiProxy(target = { host: '127.0.0.1', port: 4000 }): Plugin {
  return {
    name: 'spacebasic-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        const upstream = http.request(
          { ...target, method: req.method, path: req.originalUrl ?? req.url, headers: req.headers },
          (upRes) => {
            res.writeHead(upRes.statusCode ?? 502, upRes.headers);
            upRes.pipe(res);
          },
        );
        upstream.on('error', () => {
          if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'The API server is not running.' } }));
        });
        req.pipe(upstream);
      });
    },
  };
}

// Client build (docs/architecture.md). `@spacebasic/shared` is read from its TypeScript source through the
// `source` export condition, like the server does in development. The supplied brand assets are imported straight
// from reference-ui/assets (used as-is, never copied or edited).
export default defineConfig({
  plugins: [react(), apiProxy()],
  resolve: {
    conditions: ['source', ...defaultClientConditions],
    alias: { '@assets': refAssets },
  },
  server: {
    port: 5173,
    strictPort: true,
    // reference-ui/assets lives outside the client folder
    fs: { allow: ['..'] },
  },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  // Vitest resolves with the SSR conditions: read `shared` from source there too.
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  test: { environment: 'node', include: ['src/**/*.test.ts'], server: { deps: { inline: ['@spacebasic/shared'] } } },
});
