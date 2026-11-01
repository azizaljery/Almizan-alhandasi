import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
export function serve(root, PORT) {
  const ORIGIN = 'http://localhost:' + PORT;
  const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg' };
  const srv = createServer((req, res) => { const p = decodeURIComponent(new URL(req.url, ORIGIN).pathname); const f = join(root, p === '/' ? 'home.html' : p); if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); } else { res.writeHead(404); res.end(); } }).listen(PORT);
  return { ORIGIN, close: () => srv.close() };
}
