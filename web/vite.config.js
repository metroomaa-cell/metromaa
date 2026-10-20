import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.PREVIEW_API_PORT || 3001);
const webPort = Number(process.env.PREVIEW_WEB_PORT || 5173);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-preview-disable-production-tag-snippets',
      apply: 'serve',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html.replace(/<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/gi, '');
        },
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
      '/uploads': `http://127.0.0.1:${apiPort}`,
    },
  },
});
