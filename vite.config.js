import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  base: './',  // relative paths for Electron file:// protocol
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
    host: true,  // слушать на всех интерфейсах (нужно для ngrok)
    port: 5173,
  },
});

