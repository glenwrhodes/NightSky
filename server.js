// Tiny static server for the built site (dist/). No dependencies.
// Everything is read into memory at start-up with a gzipped copy, so each request is a lookup.
import http from 'node:http';
import path from 'node:path';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 5197;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml', '.webmanifest']);

const files = new Map();
for (const e of readdirSync(DIST, { recursive: true, withFileTypes: true })) {
  if (!e.isFile()) continue;
  const full = path.join(e.parentPath, e.name);
  const rel = '/' + path.relative(DIST, full).split(path.sep).join('/');
  const ext = path.extname(rel).toLowerCase();
  const body = readFileSync(full);
  const gz = COMPRESS.has(ext) && body.length > 512 ? gzipSync(body, { level: 9 }) : null;
  const etag = '"' + createHash('sha1').update(body).digest('base64url').slice(0, 16) + '"';
  let cache = 'public, max-age=3600';
  if (rel.startsWith('/assets/')) cache = 'public, max-age=31536000, immutable'; // Vite-hashed names
  else if (ext === '.html' || ext === '.webmanifest') cache = 'no-cache';
  files.set(rel, { body, gz, etag, type: MIME[ext] || 'application/octet-stream', cache, mtime: statSync(full).mtime.toUTCString() });
}
console.log(`Serving ${files.size} files from dist/`);

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; connect-src 'self' blob: data: https://cloudflareinsights.com; " +
    "worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { p = '/'; }
  if (p === '/healthz' || p === '/readyz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  if (p.endsWith('/')) p += 'index.html';
  let f = files.get(p);
  // Unknown paths without an extension get the app (deep links); missing files 404.
  if (!f && !path.extname(p)) f = files.get('/index.html');
  if (!f) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY });
    return res.end('Not found');
  }
  const headers = { 'Content-Type': f.type, 'Cache-Control': f.cache, ETag: f.etag, 'Last-Modified': f.mtime, Vary: 'Accept-Encoding', ...SECURITY };
  if (req.headers['if-none-match'] === f.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  let body = f.body;
  if (f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    body = f.gz;
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.listen(PORT, '0.0.0.0', () => console.log(`Night Sky on http://localhost:${PORT}`));
