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

http
  .createServer((req, res) => {
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
  .listen(port, () => console.log(`Reef Tank preview: http://localhost:${port}/`));
