// Test-only static host: emulate Pages' 404 response instead of Vite's SPA rewrite.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const base = process.env.BASE_PATH ?? '/';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    let file = resolve(dist, pathname.slice(base.length));
    if (!pathname.startsWith(base) || (file !== dist && !file.startsWith(`${dist}${sep}`))) {
      response.writeHead(404); response.end('Not found'); return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      const body = await readFile(resolve(dist, '404.html'));
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body);
    }
  } catch {
    response.writeHead(400); response.end('Bad request');
  }
}).listen(4180, '127.0.0.1', () => console.log(`Pages test host: http://127.0.0.1:4180${base}`));

// A real second origin: route.fulfill mocks do not reproduce browser CORS or redirects.
createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1:4181').pathname;
  if (path === '/redirect') {
    response.writeHead(302, { Location: 'http://127.0.0.1:4181/allowed', 'Access-Control-Allow-Origin': '*' }); response.end(); return;
  }
  response.writeHead(200, { 'Content-Type': 'application/json', ...(path === '/allowed' ? { 'Access-Control-Allow-Origin': '*' } : {}) });
  response.end(JSON.stringify({ ok: true }));
}).listen(4181, '127.0.0.1');
