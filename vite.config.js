import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  base: './',  // relative paths for Electron file:// protocol
  define: {
    APP_VERSION: JSON.stringify(pkg.version),
  },
  server: {
    host: true,  // слушать на всех интерфейсах (нужно для ngrok)
    port: 5173,
  },
});
