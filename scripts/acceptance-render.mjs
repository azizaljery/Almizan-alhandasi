// يرسم صور الأدلة لمرحلة: مسقط كل بديل (كل دور) بالأبعاد والمناطق، ومجسّم ثلاثي الأبعاد لأفضل بديل في كل حالة.
// الاستعمال: node scripts/acceptance-render.mjs <stage>
import http from 'node:http'; import { readFile, readdir } from 'node:fs/promises'; import { existsSync } from 'node:fs'; import { join, normalize, extname } from 'node:path';
const stage = process.argv[2] || 'before', only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const root = new URL('../dist/', import.meta.url).pathname, ev = new URL(`../evidence/acceptance/${stage}/`, import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
const HARNESS = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:Tahoma}canvas{display:block}</style></head><body><canvas id="c" width="1400" height="1000" style="width:1400px;height:1000px"></canvas><script type="module">
import { renderPlan, fitView, docBounds } from '/draw/editor/render2d.mjs'; import { analyzeDoc } from '/draw/digest.mjs'; import { exteriorWallIds } from '/draw/topology.mjs'; import { parseDoc } from '/draw/doc.mjs'; import { ZONES, zoneOf } from '/design-session.mjs';
window.draw = (raw, levelIndex, title) => { const doc = parseDoc(raw), lv = doc.levels[levelIndex], m = analyzeDoc(doc), L = m.levelById.get(lv.id); const c = document.getElementById('c'), ctx = c.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#fff'; ctx.fillRect(0,0,1400,1000);
const b = docBounds(doc, lv.id), view = fitView({ x0: b.x0 - 2.6, y0: b.y0 - 2.6, x1: b.x1 + 2.6, y1: b.y1 + 1.4 }, 1400, 940, 40);
ctx.save(); ctx.translate(0, 60); renderPlan(ctx, { doc, levelId: lv.id, view, W: 1400, H: 940, analysis: L ? { rooms: L.rooms, gaps: [], exteriorWallIds: exteriorWallIds(L.analysis) } : null, flags: { grid: false, dims: true, areas: true, fixtures: true, underlay: false, roomDims: true }, roomFill: rm => ZONES[zoneOf(rm.label)].color }); ctx.restore();
ctx.fillStyle = '#1d2a24'; ctx.font = 'bold 26px Tahoma'; ctx.textAlign = 'right'; ctx.fillText(title + (doc.levels.length > 1 ? ' — ' + lv.name : ''), 1380, 40); return true; };
window.ready = true;</script></body></html>`;
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/__h.html') { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(HARNESS); }
  const f = normalize(join(root, p)); if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const p = await ctx.newPage(); await p.goto(base + '/__h.html'); await p.waitForFunction(() => window.ready);
const cases = (await readdir(ev, { withFileTypes: true })).filter(d => d.isDirectory() && (!only || only.test(d.name))).map(d => d.name).sort((a, b) => +a.slice(1) - +b.slice(1));
for (const id of cases) {
  const files = (await readdir(ev + id)).filter(f => f.endsWith('.json') && f !== 'result.json');
  for (const f of files) {
    const raw = await readFile(ev + id + '/' + f, 'utf8'), n = JSON.parse(raw).levels.length;
    for (let li = 0; li < n; li++) { await p.evaluate(([r, i, t]) => window.draw(r, i, t), [raw, li, `${id} — ${f.replace('.json', '')}`]); await p.locator('#c').screenshot({ path: ev + id + '/' + f.replace('.json', '') + (n > 1 ? `-L${li + 1}` : '') + '.png' }); }
  }
  // ثلاثي الأبعاد لأفضل بديل
  const raw = await readFile(ev + id + '/' + (files.includes('alt-1.json') ? 'alt-1.json' : files[0]), 'utf8');
  const q = await ctx.newPage(); await q.setViewportSize({ width: 1360, height: 860 });
  await q.goto(base + '/home.html'); await q.evaluate(s => localStorage.setItem('mizan.studio.doc.v1', s), raw);
  await q.goto(base + '/view3d.html');
  try { await q.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 90000 }); await q.evaluate(() => { const e = document.getElementById('hour'); e.value = 9; e.dispatchEvent(new Event('input')); }); await q.waitForTimeout(1500); await q.locator('#threeHost').screenshot({ path: ev + id + '/3d-alt-1.png' }); await q.evaluate(() => globalThis.__mizanViewer.setMode('dollhouse')); await q.waitForTimeout(1500); await q.locator('#threeHost').screenshot({ path: ev + id + '/3d-alt-1-dollhouse.png' }); }
  catch (e) { console.log(id, '3D فشل:', e.message); }
  await q.close();
  console.log(id, 'صور:', files.length);
}
await b.close(); server.close();
