import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

// The page only loads its own files. Quotes are fetched by the main process,
// so the renderer needs no network access at all.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Added to the production build only. The dev server injects an inline script
// for live reloading, which this policy would block.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  root: 'src/renderer',
  // Relative paths so the built index.html works when Electron loads it from disk.
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    // Vite's root is src/renderer, but tests live under src/shared and src/main too.
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});
