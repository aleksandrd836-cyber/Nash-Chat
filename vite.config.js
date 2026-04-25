import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

function normalizeProxyPath(path) {
  const trimmed = String(path || '').trim();
  if (!trimmed) return '/_supabase';

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '') || '/_supabase';
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseTarget = env.VITE_SUPABASE_URL;
  const supabaseProxyPath = normalizeProxyPath(env.VITE_SUPABASE_PROXY_PATH || '/_supabase');
  const supabaseProxyMatcher = new RegExp(`^${escapeRegex(supabaseProxyPath)}`);

  return {
    plugins: [react()],
    base: './',
    define: {
      APP_VERSION: JSON.stringify(pkg.version),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return null;

            if (id.includes('emoji-picker-react')) return 'emoji-vendor';
            if (id.includes('@supabase/supabase-js')) return 'supabase-vendor';
            if (id.includes('@jitsi/rnnoise-wasm')) return 'voice-vendor';
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('framer-motion') ||
              id.includes('zustand') ||
              id.includes('lucide-react') ||
              id.includes('date-fns')
            ) {
              return 'ui-vendor';
            }

            return 'vendor';
          },
        },
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy: supabaseTarget
        ? {
            [supabaseProxyPath]: {
              target: supabaseTarget,
              changeOrigin: true,
              secure: true,
              ws: true,
              rewrite: (path) => path.replace(supabaseProxyMatcher, ''),
            },
          }
        : undefined,
    },
  };
});
