import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,  // слушать на всех интерфейсах (нужно для ngrok)
    port: 5173,
  },
});
