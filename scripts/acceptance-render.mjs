// يرسم صور الأدلة لمرحلة: مسقط كل بديل (كل دور) بالأبعاد والمناطق، ومجسّم ثلاثي الأبعاد لأفضل بديل في كل حالة.
// الاستعمال: node scripts/acceptance-render.mjs <stage> [نمط الحالات] [--engine v1|v2] [--no3d]
// (المحرك لا يغيّر الرسم هنا: الصور تُرسم من مستندات المرحلة نفسها؛ يُقبل العلم للاتساق مع acceptance-run.)
import http from 'node:http'; import { readFile, readdir } from 'node:fs/promises'; import { existsSync } from 'node:fs'; import { join, normalize, extname } from 'node:path';
const argv = process.argv.slice(2), flags = new Set(argv.filter(a => a.startsWith('--')));
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--engine');
const stage = pos[0] || 'before', only = pos[1] ? new RegExp(pos[1]) : null, no3d = flags.has('--no3d');
const root = new URL('../dist/', import.meta.url).pathname, ev = new URL(`../evidence/acceptance/${stage}/`, import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
const HARNESS = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:Tahoma}canvas{display:block}</style></head><body><canvas id="c" width="1400" height="1000" style="width:1400px;height:1000px"></canvas><script type="module">
import { renderPlan, fitView, docBounds } from '/draw/editor/render2d.mjs'; import { analyzeDoc } from '/draw/digest.mjs'; import { exteriorWallIds } from '/draw/topology.mjs'; import { parseDoc } from '/draw/doc.mjs'; import { ZONES, zoneOf } from '/design-session.mjs';
window.draw = (raw, levelIndex, title) => { const doc = parseDoc(raw), lv = doc.levels[levelIndex], m = analyzeDoc(doc), L = m.levelById.get(lv.id); const c = document.getElementById('c'), ctx = c.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#fff'; ctx.fillRect(0,0,1400,1000);
const b0 = docBounds(doc, lv.id), pp = doc.plot?.polygon || [], b = pp.length ? { x0: Math.min(b0.x0, ...pp.map(q => q.x)) + 1.6, y0: Math.min(b0.y0, ...pp.map(q => q.y)) + 1.6, x1: Math.max(b0.x1, ...pp.map(q => q.x)) - 1.6, y1: Math.max(b0.y1, ...pp.map(q => q.y)) - 1.6 } : b0, view = fitView({ x0: Math.min(b.x0, b0.x0) - 2.6, y0: Math.min(b.y0, b0.y0) - 2.6, x1: Math.max(b.x1, b0.x1) + 2.6, y1: Math.max(b.y1, b0.y1) + 1.4 }, 1400, 940, 40);
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
  if (no3d) { console.log(id, 'صور:', files.length); continue; }
  // ثلاثي الأبعاد لأفضل بديل
  const raw = await readFile(ev + id + '/' + (files.includes('alt-1.json') ? 'alt-1.json' : files[0]), 'utf8');
  const q = await ctx.newPage(); await q.setViewportSize({ width: 1360, height: 860 });
  await q.goto(base + '/home.html'); await q.evaluate(s => localStorage.setItem('mizan.studio.doc.v1', s), raw);
  await q.goto(base + '/view3d.html');
  try { await q.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 90000 }); await q.evaluate(() => { const e = document.getElementById('hour'); e.value = 9; e.dispatchEvent(new Event('input')); }); await q.waitForTimeout(1500); await q.locator('#threeHost').screenshot({ path: ev + id + '/3d-alt-1.png' }); await q.evaluate(() => globalThis.__mizanViewer.setMode('dollhouse')); await q.waitForTimeout(1500); await q.locator('#threeHost').screenshot({ path: ev + id + '/3d-alt-1-dollhouse.png' }); }
  catch (e) { console.log(id, '3D فشل:', e.message); }
  await q.close();
  // (الجولة الثانية عشرة) صورة الواجهة الأمامية (ارتفاع منخفض من جهة المدخل): التظليل والدروة والمادة والشارعان في أرض الزاوية؛
  // وفي تعديل الواجهة (C9) صورة الواجهة قبل التعديل وبعده من المستندين نفسيهما
  const facadeShot = async (rawDoc, name) => {
    const dd = JSON.parse(rawDoc), az = { s: 0, n: 180, e: 90, w: -90 }[dd.entry || 's'] ?? 0;
    const z = await ctx.newPage(); await z.setViewportSize({ width: 1360, height: 860 });
    try {
      await z.goto(base + '/home.html'); await z.evaluate(s => localStorage.setItem('mizan.studio.doc.v1', s), rawDoc); await z.goto(base + '/view3d.html');
      await z.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 90000 });
      await z.evaluate(() => { const e = document.getElementById('hour'); e.value = 10; e.dispatchEvent(new Event('input')); });
      await z.evaluate(a => { const v = globalThis.__mizanViewer; v.frameBuilding(); v.orbitTo({ azimuthDeg: a, elevationDeg: 9, distance: v.orbit.dist * .78 }); }, az + 18);
      await z.waitForTimeout(1500); await z.locator('#threeHost').screenshot({ path: ev + id + '/' + name });
    } catch (e) { console.log(id, name, 'فشل:', e.message); }
    await z.close();
  };
  await facadeShot(raw, 'facade-alt-1.png');
  if (files.includes('edit-after.json')) {
    const after = await readFile(ev + id + '/edit-after.json', 'utf8'), before = files.includes('edit-before.json') ? await readFile(ev + id + '/edit-before.json', 'utf8') : null;
    if (JSON.parse(after).finish?.facade?.material || /واجه/.test(id)) { await facadeShot(after, 'facade-edit-after.png'); if (before) await facadeShot(before, 'facade-edit-before.png'); }
  }
  // (الجولة العاشرة) السلم في ثلاثي الأبعاد لكل بديل فيه سلم: الدور الأرضي وحده (القلبات والبسطة) ثم الدور العلوي (الفتحة والدرابزين)
  for (const f of files.filter(x => /^alt-\d+\.json$/.test(x))) {
    const rawS = await readFile(ev + id + '/' + f, 'utf8'), d = JSON.parse(rawS); if (!(d.stairs || []).length || d.levels.length < 2) continue;
    const s0 = d.stairs[0], L0 = d.levels.find(l => l.id === s0.level) || d.levels[0], L1 = d.levels[d.levels.indexOf(L0) + 1];
    const z = await ctx.newPage(); await z.setViewportSize({ width: 1100, height: 760 });
    try {
      await z.goto(base + '/home.html'); await z.evaluate(s => localStorage.setItem('mizan.studio.doc.v1', s), rawS); await z.goto(base + '/view3d.html');
      await z.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 90000 });
      // مركز السلم من تخطيطه نفسه (stairLayout) لا من نقطة البدء
      const c = await z.evaluate(async ([st, rise]) => { const { stairLayout } = await import('/draw/stairs3d.mjs'); const lay = stairLayout(st, rise); const pts = lay.steps.flatMap(x => x.poly); const xs = pts.map(p => p.x), ys = pts.map(p => p.y); return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }; }, [s0, (L1?.elevation ?? 3.2) - (L0.elevation || 0)]);
      const shot = async (lvl, elev, name) => { await z.evaluate(([lv, e, cx, cy]) => { const v = globalThis.__mizanViewer; v.setMode('dollhouse', { animate: false }); v.showLevel(lv); v.orbitTo({ target: [cx, e + .8, -cy], distance: 9, elevationDeg: 58, azimuthDeg: 30 }); }, [lvl, elev, c.x, c.y]); await z.waitForTimeout(1200); await z.locator('#threeHost').screenshot({ path: ev + id + '/' + f.replace('.json', '') + name }); };
      await shot(L0.id, L0.elevation || 0, '-stair3d-L1.png');
      if (L1) await shot(L1.id, L1.elevation, '-stair3d-L2.png');
    } catch (e) { console.log(id, f, 'سلم 3D فشل:', e.message); }
    await z.close();
  }
  console.log(id, 'صور:', files.length);
}
await b.close(); server.close();
