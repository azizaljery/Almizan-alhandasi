// Real Chromium on the legacy page: generate a design, open «لوحة العرض», download SVG and PNG; each comes with a manifest whose sha256 matches the bytes
// and whose identity is VERIFIED against the generated model.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { chromium } from 'playwright';
const root = path.resolve('dist/client'); const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); if (u.startsWith('/api/')) { r.writeHead(404); return r.end(); } const p = path.join(root, u.replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(b); } }); });
await new Promise((ok) => srv.listen(0, ok)); const port = srv.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 1000 } }); const pg = await ctx.newPage(); const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { const o = HTMLAnchorElement.prototype.click; window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push(this.getAttribute('download')); return o.call(this); }; });
await pg.goto(`http://127.0.0.1:${port}/index.html`); await pg.waitForTimeout(1200);
await pg.evaluate(() => document.getElementById('gen')?.click());
await pg.waitForSelector('[data-board-open]', { timeout: 60000 }); await pg.waitForTimeout(1500);
await pg.evaluate(() => document.querySelector('[data-board-open]').click()); await pg.waitForSelector('#boardSvg', { timeout: 15000 });
const results = [];
for (const [id, ext] of [['boardSvg', 'svg'], ['boardPng', 'png']]) {
  await pg.evaluate(() => { window.__dl.length = 0; }); const files = []; const onDl = async (d) => { files.push({ bytes: fs.readFileSync(await d.path()) }); }; pg.on('download', onDl);
  await pg.evaluate((i) => document.getElementById(i).click(), id); await pg.waitForTimeout(2500); pg.off('download', onDl);
  const names = await pg.evaluate(() => window.__dl.slice()); files.forEach((f, i) => { f.name = names[i]; });
  const main = files.find((f) => f.name && !f.name.endsWith('.manifest.json')), man = files.find((f) => f.name?.endsWith('.manifest.json'));
  const m = man ? JSON.parse(man.bytes.toString('utf8')) : null;
  results.push({ ext, names, hashMatches: !!(main && m && m.export.sha256 === crypto.createHash('sha256').update(main.bytes).digest('hex')), nameMatches: !!(main && man.name === main.name + '.manifest.json'), identity: m?.source.identityStatus, candidate: !!m?.source.candidateId, geometryMatches: m?.source.geometryMatches, kind: m?.export.kind });
}
console.log(JSON.stringify(results, null, 1), 'pageerrors:', errs.length, errs.slice(0, 2));
await b.close(); srv.close();
const pass = results.every((r) => r.names.length === 2 && r.hashMatches && r.nameMatches && r.identity === 'VERIFIED' && r.candidate && r.geometryMatches === true) && !errs.length;
console.log(pass ? 'BROWSER CHECK: PASS' : 'BROWSER CHECK: FAIL'); process.exit(pass ? 0 : 1);
