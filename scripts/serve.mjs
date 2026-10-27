import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PUBLIC_FILES } from './files.mjs';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const mime = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', txt: 'text/plain; charset=utf-8' };
export async function handleRequest(request, response) {
  const host = request.headers.host;
  if (host !== '127.0.0.1:4230' && host !== 'localhost:4230') { response.writeHead(403); response.end(); return; }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  const route = request.url;
  // Use the raw request target: reject dot segments and escapes before URL normalization.
  const name = route === '/' ? 'index.html' : route === '/en/' ? 'en/index.html' : route?.slice(1);
  if (!route?.startsWith('/') || /[%?\\#]/.test(route) || !PUBLIC_FILES.includes(name) || name.startsWith('_')) {
    response.writeHead(404); response.end(); return;
  }
  try {
    const bytes = await readFile(resolve(root, name));
    const csp = "default-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
    response.writeHead(200, { 'Content-Type': mime[name.split('.').at(-1)] ?? 'application/octet-stream',
      'Content-Length': bytes.length, 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(404); response.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer((request, response) => { handleRequest(request, response).catch(() => response.destroy()); });
  server.on('error', () => { console.error('LOCAL_SERVER_START_FAILED: port 4230 may already be occupied; no process was stopped.'); process.exitCode = 1; });
  server.listen(4230, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:4230 (no browser opened)'));
}
