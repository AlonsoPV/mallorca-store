import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function preloadLcpAssets(): Plugin {
  return {
    name: 'preload-lcp-assets',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const files = Object.values(ctx.bundle)
          .filter((item): item is { type: 'asset'; fileName: string } => item.type === 'asset')
          .map((item) => item.fileName);
        const hero = files.find((name) => name.includes('temporada-05') && name.endsWith('.webp'));
        const playfair = files.find(
          (name) =>
            name.includes('playfair-display-400-normal-latin') &&
            name.endsWith('.woff2') &&
            !name.includes('latin-ext'),
        );
        const jakarta = files.find(
          (name) =>
            name.includes('plus-jakarta-sans-400-normal-latin') &&
            name.endsWith('.woff2') &&
            !name.includes('latin-ext'),
        );
        const tags: string[] = [];
        if (hero) {
          tags.push(
            `<link rel="preload" as="image" href="/${hero}" type="image/webp" fetchpriority="high" />`,
          );
        }
        if (playfair) {
          tags.push(`<link rel="preload" as="font" type="font/woff2" href="/${playfair}" crossorigin />`);
        }
        if (jakarta) {
          tags.push(`<link rel="preload" as="font" type="font/woff2" href="/${jakarta}" crossorigin />`);
        }
        if (!tags.length) return html;
        return html.replace(
          '<link rel="icon"',
          `${tags.join('\n    ')}\n    <link rel="icon"`,
        );
      },
    },
  };
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    preloadLcpAssets(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Replit routes /api at the platform edge. Local Windows needs a Vite proxy.
    ...(process.env.REPL_ID
      ? {}
      : {
          proxy: {
            '/api': {
              target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080',
              changeOrigin: true,
            },
          },
        }),
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
