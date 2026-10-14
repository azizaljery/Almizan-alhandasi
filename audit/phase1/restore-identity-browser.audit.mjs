// Real Chromium: the browser build of project.mjs (sync SHA-256 fallback, schema import) verifies identity on restore.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve('dist/client'); const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(b); } }); });
await new Promise((ok) => srv.listen(0, ok)); const port = srv.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(`http://127.0.0.1:${port}/studio.html`);
const res = await pg.evaluate(async () => {
  const P = await import('./planner.mjs'), M = await import('./multi-engine.mjs'), J = await import('./project.mjs');
  const plot = P.validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
  const rooms = P.normalizeRooms(P.defaultRooms());
  const out = await M.runMultiEngineDesign({ plot, rooms, selectedShape: 'rect', idea: '', seed: 1 });
  const text = J.encodeProject({ plot, rooms, palette: 'modern', rates: {}, costReserve: 10, vat: 15, idea: '', discovery: { likes: [], rejects: [], avoids: [], life: {} }, model: out.selectedModel });
  const ok = J.decodeProject(text).model.integration;
  const t = JSON.parse(text); t.design.embedded.openings.find((o) => o.type === 'window' && typeof o.pos === 'number').pos += 0.05;
  const bad = J.decodeProject(JSON.stringify(t)).model.integration;
  return { okRequiresReview: ok.requiresReview ?? false, okHasId: !!ok.candidateId, badRequiresReview: bad.requiresReview, badId: bad.candidateId, badCheck: bad.restoreCheck };
});
console.log(JSON.stringify(res), 'pageerrors:', errs.length, errs.slice(0, 2));
await b.close(); srv.close();
const pass = res.okHasId && !res.okRequiresReview && res.badRequiresReview === true && res.badId === null && !errs.length;
console.log(pass ? 'BROWSER CHECK: PASS' : 'BROWSER CHECK: FAIL'); process.exit(pass ? 0 : 1);
