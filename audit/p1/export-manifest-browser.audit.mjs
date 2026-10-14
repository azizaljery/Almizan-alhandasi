// Real Chromium: Drawing Studio export (DXF + plan PNG) downloads the file AND its manifest; manifest hash == hash of the downloaded bytes.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { chromium } from 'playwright';
const root = path.resolve('dist/client'); const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); r.end(b); } }); });
await new Promise((ok) => srv.listen(0, ok)); const port = srv.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ acceptDownloads: true }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.addInitScript(() => { const o = HTMLAnchorElement.prototype.click; window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push(this.getAttribute('download')); return o.call(this); }; }); // Playwright reports Arabic names as 'download'; the anchor attribute is the real name
await pg.goto(`http://127.0.0.1:${port}/studio.html`); await pg.waitForTimeout(800);
// load the built-in sample so the document is non-empty
const sample = await pg.$('text=مثال'); if (sample) await sample.click().catch(() => {}); await pg.waitForTimeout(500);
const results = [];
for (const kind of ['dxf', 'png']) {
  await pg.evaluate(() => { window.__dl.length = 0; }); const files = []; const onDl = async (d) => { const p = await d.path(); files.push({ bytes: fs.readFileSync(p) }); }; pg.on('download', onDl);
  await pg.click('#btnExport'); await pg.click(`[data-export="${kind}"]`); await pg.waitForTimeout(1500); pg.off('download', onDl);
  const names = await pg.evaluate(() => window.__dl.slice()); files.forEach((f, i) => { f.name = names[i]; });
  const main = files.find((f) => !f.name.endsWith('.manifest.json')), man = files.find((f) => f.name.endsWith('.manifest.json'));
  const m = man ? JSON.parse(man.bytes.toString('utf8')) : null;
  results.push({ kind, files: files.map((f) => f.name), hashMatches: !!(main && m && m.export.sha256 === crypto.createHash('sha256').update(main.bytes).digest('hex')), nameMatches: !!(main && m && m.export.fileName === main.name && man.name === main.name.replace(/\.[^.]+$/, '') + '.manifest.json'),
    sourceKind: m?.source.sourceKind, identity: m?.source.identityStatus, docHash: /^[a-f0-9]{64}$/.test(m?.source.documentSha256 || ''), commit: m?.app.commit, bytes: m?.export.bytes === main?.bytes.length });
}
console.log(JSON.stringify(results, null, 1), 'pageerrors:', errs.length, errs.slice(0, 2));
await b.close(); srv.close();
const pass = results.every((r) => r.files.length === 2 && r.hashMatches && r.nameMatches && r.docHash && r.bytes && r.sourceKind === 'studio-document' && r.identity === 'NONE') && !errs.length;
console.log(pass ? 'BROWSER CHECK: PASS' : 'BROWSER CHECK: FAIL'); process.exit(pass ? 0 : 1);
