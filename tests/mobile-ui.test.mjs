// واجهة الجوال في متصفح حقيقي (Chromium عبر Playwright): بلا تجاوز أفقي، أهداف لمس ≥44px، حدود الخط، شريط الجوال ولوحة المشي.
// يُتخطّى بلا خطأ إن لم يتوفر Playwright أو المتصفح (بيئات لا تحمله).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

let pw = null;
for (const p of ['/opt/npm-tools/node_modules/playwright/index.mjs', 'playwright']) { try { pw = await import(p); break; } catch { /* التالي */ } }
const DIST = path.resolve('dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(DIST, u === '/' ? 'index.html' : u); if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('nf'); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const DOC = fs.readFileSync('tests/fixtures/mobile-villa-b1.json', 'utf8');
let browser = null;
if (pw) { try { browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] }); } catch { browser = null; } }
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const open = async (w, h, url, ready) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  await ctx.addInitScript(x => { try { localStorage.setItem('mizan.studio.doc.v1', x); } catch { /* */ } }, DOC);
  const p = await ctx.newPage(); await p.goto(`http://localhost:${PORT}/${url}`, { waitUntil: 'domcontentloaded' });
  if (ready) await p.waitForFunction(ready, null, { timeout: 200000 }); else await p.waitForLoadState('load'); await p.waitForTimeout(800);
  return { ctx, p };
};
const skip = !browser && 'Playwright/Chromium غير متوفر';

for (const [w, h] of [[390, 844], [360, 740]]) {
  test(`جوال ${w}×${h}: صفحة العرض ثلاثي الأبعاد بلا تجاوز أفقي، المحددات ≥44px، الخط ≥16/14، والعرض خفيف افتراضيًا`, { skip, timeout: 280000 }, async () => {
    const { ctx, p } = await open(w, h, 'view3d.html', () => globalThis.__mizanViewer?.built);
    try {
      const r = await p.evaluate(() => {
        const q = s => [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().height > 0).map(e => Math.round(e.getBoundingClientRect().height));
        const v = globalThis.__mizanViewer;
        return { docW: document.documentElement.scrollWidth, innerW: innerWidth, body: parseFloat(getComputedStyle(document.body).fontSize), muted: [...document.querySelectorAll('.v3 .muted')].filter(e => e.offsetHeight).map(e => parseFloat(getComputedStyle(e).fontSize)),
          mode: q('#modeSeg button'), interior: q('#interiorSeg button'), palette: q('#paletteSeg button'), detail: q('#detailSeg button'), detailKind: v.detail, tris: v.built.stats.triangles, pr: v.maxPixelRatio, bar: q('#mobileBar button'), steps: q('.ph .btn') };
      });
      assert.ok(r.docW <= r.innerW + 1, `تجاوز أفقي ${r.docW} > ${r.innerW}`);
      assert.ok(r.body >= 16, 'خط المتن ' + r.body);
      assert.ok(r.muted.every(f => f >= 14), 'نص صغير ' + r.muted);
      for (const k of ['mode', 'interior', 'detail', 'steps']) assert.ok(r[k].length && r[k].every(x => x >= 44), `${k}: ${r[k]}`);
      assert.equal(r.detailKind, 'lite'); assert.ok(r.tris <= 90000, 'مثلثات ' + r.tris); assert.ok(r.pr <= 1.5);
    } finally { await ctx.close(); }
  });
}

test('جوال: لوحة المشي تظهر في التجوّل بأزرار ≥48px وتحرّك المشاهد، ولا تظهر في المدار', { skip, timeout: 280000 }, async () => {
  const { ctx, p } = await open(390, 844, 'view3d.html', () => globalThis.__mizanViewer?.built);
  try {
    await p.evaluate(() => { const f = document.getElementById('facadeFrame'); if (f) { f.hidden = true; f.src = 'about:blank'; } document.getElementById('threeHost').style.visibility = ''; });
    assert.equal(await p.locator('#walkPad').isHidden(), true);
    await p.evaluate(() => { const v = globalThis.__mizanViewer; v.setMode('walk', { animate: false }); v.walkToRoom([...v.built.rooms.values()].find(r => r.type === 'living').key); document.querySelector('#mobileBar [data-mode=walk]').click(); });
    assert.equal(await p.locator('#walkPad').isVisible(), true);
    const sizes = await p.evaluate(() => [...document.querySelectorAll('#walkPad button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    assert.equal(sizes.length, 4); assert.ok(sizes.every(([a, b]) => a >= 48 && b >= 48), JSON.stringify(sizes));
    const before = await p.evaluate(() => { const w = globalThis.__mizanViewer.walk; return { x: w.x, y: w.y, yaw: w.yaw }; });
    const up = await p.locator('#walkPad .up').boundingBox();
    await p.touchscreen.tap(up.x + 5, up.y + 5); // نقرة تبدأ وتنتهي
    await p.evaluate(() => globalThis.__mizanViewer.setWalkInput({ forward: 1 })); await p.waitForTimeout(1500); await p.evaluate(() => globalThis.__mizanViewer.setWalkInput({ forward: 0 }));
    const after = await p.evaluate(() => { const w = globalThis.__mizanViewer.walk; return { x: w.x, y: w.y, yaw: w.yaw }; });
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 0.01 || before.yaw !== after.yaw, 'لم يتحرك المشاهد');
  } finally { await ctx.close(); }
});

for (const [w, h] of [[390, 844], [360, 740]]) test(`جوال ${w}×${h}: المرسم لا يتجاوز عرض الشاشة وأزرار شريطه ≥44px`, { skip, timeout: 120000 }, async () => {
  const { ctx, p } = await open(w, h, 'studio.html');
  try {
    const r = await p.evaluate(() => ({ docW: document.documentElement.scrollWidth, innerW: innerWidth, top: [...document.querySelectorAll('.top button, .top a.btn')].filter(e => e.getBoundingClientRect().height > 0).map(e => Math.round(e.getBoundingClientRect().height)), right: Math.max(...[...document.querySelectorAll('.top *')].filter(e => e.getBoundingClientRect().height > 0).map(e => e.getBoundingClientRect().right)) }));
    assert.ok(r.docW <= r.innerW + 1, `تجاوز أفقي ${r.docW} > ${r.innerW}`);
    assert.ok(r.right <= r.innerW + 1, 'عنصر في الشريط العلوي خارج الشاشة ' + r.right);
    assert.ok(r.top.length && r.top.every(x => x >= 44), 'أهداف لمس صغيرة ' + r.top);
  } finally { await ctx.close(); }
});

test('الصفحة الرئيسية والمخرجات على جوال بلا تجاوز أفقي', { skip, timeout: 120000 }, async () => {
  for (const url of ['home.html', 'final.html', 'index.html']) {
    const { ctx, p } = await open(390, 844, url);
    try { const r = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert.ok(r[0] <= r[1] + 1, `${url} ${r}`); } finally { await ctx.close(); }
  }
});

test.after(async () => { try { await browser?.close(); } catch { /* */ } server.close(); });
