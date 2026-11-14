import acde from '@dopame/acde-api/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import backend from './server.ts'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: {
    watch: { ignored: ['**/.debug/**', '**/.acde/**', '**/dist/**', '**/marketing/**', '**/promo-video/**'] },
  },
  plugins: [react(), acde(), {
    name: 'canvas-backend',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) { next(); return; }
        const method = req.method || 'GET';
        if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) { res.statusCode = 405; res.end(); return; }
        const chunks: Buffer[] = [];
        if (method !== 'GET') {
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 32 * 1024 * 1024) { res.statusCode = 413; res.end(); return; }
            chunks.push(Buffer.from(chunk));
          }
        }
        const response = await backend.fetch(new Request(`http://localhost${req.url}`, {
          method,
          headers: { 'Content-Type': req.headers['content-type'] || 'application/octet-stream' },
          ...(method !== 'GET' ? { body: Buffer.concat(chunks) } : {}),
        }));
        res.statusCode = response.status;
        res.setHeader('Content-Type', response.headers.get('Content-Type') || 'application/octet-stream');
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  }],
})
