import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import type { Connect } from 'vite';

const DATA_DIR = path.join(__dirname, 'src', 'data');
const ALLOWED_FILES = [
  'teyvat.json',
  'inazuma.json',
  'liyue.json',
  'snezhnaya.json',
  'ferry.json',
  'same.json',
];

function adminApi(
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
  next: Connect.NextFunction,
) {
  const url = req.url || '';
  const match = url.match(/^\/__admin\/data\/(.+)\.json$/);
  if (!match) return next();

  const filename = match[1] + '.json';
  if (!ALLOWED_FILES.includes(filename)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  const filePath = path.join(DATA_DIR, filename);

  if (req.method === 'GET') {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.setHeader('Content-Type', 'application/json');
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    }
    return;
  }

  if (req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        JSON.parse(body);
        fs.writeFileSync(filePath, body, 'utf-8');
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  next();
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    {
      name: 'admin-api',
      configureServer(server) {
        server.middlewares.use(adminApi);
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '5173'),
  },
});
