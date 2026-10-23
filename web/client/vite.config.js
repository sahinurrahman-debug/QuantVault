import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development the API runs on :5000 (web/server); proxy /api to it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
  test: { environment: 'jsdom', setupFiles: ['./test/setup.js'], include: ['test/**/*.test.{js,jsx}'], css: false, testTimeout: 20000 },
});
