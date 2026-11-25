#!/usr/bin/env node
// Serves the in-browser preview (brs-engine running the dev build) on http://localhost:6502.
// The engine needs cross-origin isolation (SharedArrayBuffer), hence the COOP/COEP headers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.join(root, 'node_modules', 'brs-engine');
const port = Number(process.env.PORT ?? 6502);

const routes = {
  '/': path.join(root, 'preview', 'index.html'),
  '/brs.api.js': path.join(engine, 'lib', 'brs.api.js'),
  '/brs.worker.js': path.join(engine, 'lib', 'brs.worker.js'),
  '/brs-sg.js': path.join(root, 'node_modules', 'brs-scenegraph', 'lib', 'brs-sg.js'),
  '/assets/common.zip': path.join(root, 'node_modules', 'brs-scenegraph', 'assets', 'common.zip'), // superset of the core assets
  '/app.zip': path.join(root, 'out', 'reef-tank-dev.zip'),
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.zip': 'application/zip' };

// POST /shot?name=foo with a PNG body saves out/screens/foo.png (the preview's "Save frame" button).
function saveShot(req, res) {
  const name = (new URL(req.url, 'http://x').searchParams.get('name') ?? `frame-${Date.now()}`).replace(/[^\w.-]/g, '_');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const dir = path.join(root, 'out', 'screens');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.png`);
    fs.writeFileSync(file, Buffer.concat(chunks));
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(path.relative(root, file));
  });
}

http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/shot')) return saveShot(req, res);
    const file = routes[new URL(req.url, 'http://x').pathname];
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  })
  // Localhost only: the preview has an endpoint that writes files (Save frame).
  .listen(port, '127.0.0.1', () => console.log(`Reef Tank preview: http://localhost:${port}/`));
