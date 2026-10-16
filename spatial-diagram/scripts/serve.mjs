#!/usr/bin/env node
// serve.mjs — tiny static server for developing diagrams locally.
// Usage: node scripts/serve.mjs [rootDir] [--port 8080]
// Binds 0.0.0.0 so preview proxies can reach it.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, normalize } from 'node:path';

const argv = process.argv.slice(2);
const portIdx = argv.indexOf('--port');
const port = portIdx >= 0 ? Number(argv[portIdx + 1]) : 8080;
const root = resolve(argv.find((a) => !a.startsWith('--')) || '.');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm', '.ico': 'image/x-icon'
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
    const st = await stat(file);
    if (st.isDirectory()) { res.writeHead(302, { Location: path + '/' }); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`spatial-diagram dev server: http://localhost:${port}/  (root: ${root})`);
});
