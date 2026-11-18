// Local acceptance server: real Worker routes + isolated SQLite D1. Never production data.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import worker from '../worker/index.mjs';
import { LocalD1 } from '../tests/fixtures/local-d1-admin.mjs';
const db = new LocalD1(); db.sqlite.exec(readFileSync('db/delivery-registry.sql', 'utf8'));
db.batch = async statements => {
  db.sqlite.exec('BEGIN');
  try { const result = statements.map(s => { const r = db.sqlite.prepare(s.sql).run(...s.values); return { success: true, meta: { changes: Number(r.changes) } }; }); db.sqlite.exec('COMMIT'); return result; }
  catch (e) { db.sqlite.exec('ROLLBACK'); throw e; }
};
const root = resolve('dist'), before = resolve('/tmp/almizan-quality-before/dist');
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.woff2': 'font/woff2' };
const assets = { async fetch(request) {
  let path = decodeURIComponent(new URL(request.url).pathname), base = root;
  if (path === '/version.json') return new Response(JSON.stringify({ commit: 'local-quality-candidate', builtAt: new Date().toISOString() }), { headers: { 'content-type': 'application/json' } });
  if (path.startsWith('/before/')) { path = path.slice(7); base = before; }
  if (path === '/') path = '/home.html';
  if (path.endsWith('/')) path += 'index.html';
  if (!extname(path)) path += '.html';
  const file = resolve(base, '.' + path);
  if (!file.startsWith(base + sep) || !existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(readFileSync(file), { headers: { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' } });
} };
const env = { DB: db, ASSETS: assets };
const server = http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const request = new Request('http://' + req.headers.host + req.url, { method: req.method, headers: { ...req.headers, 'CF-Connecting-IP': '127.0.0.1' }, ...(!['GET', 'HEAD'].includes(req.method) ? { body } : {}) });
    const response = await worker.fetch(request, env, { waitUntil(p) { p.catch(() => {}); } });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) { console.error(e); res.writeHead(500); res.end('local preview failed'); }
});
server.listen(4317, '127.0.0.1', () => console.log('QUALITY_PREVIEW http://127.0.0.1:4317 (isolated SQLite, no provider keys)'));
