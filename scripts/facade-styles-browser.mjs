// (طلب المالك 2026-10-31) رحلة Chromium محلية للواجهات: لكل تصميم (C1 دور واحد، C7 دوران — مستندات المحرك في tests/fixtures/facade)
// ولكل طراز (كلاسيكي/نيوكلاسيكي/حديث): صفحة التصميم ← بطاقة «واجهات التصميم» ← زر الطراز (معاينة فورية) ← لقطة الواجهة الأمامية
// ← «اعتمده» ← العرض ثلاثي الأبعاد ← لقطة المجسّم. ويتحقق أن المسقط في الجلسة لم يتغير حرفيًا بعد تبديل الطراز.
//   node scripts/facade-styles-browser.mjs <مجلد-اللقطات> [--root <مجلد dist>] [--before]
// --before: لقطات «قبل» على شيفرة أخرى (مثل f8e1844): المجسّم فقط لأن صفحة التصميم هناك بلا واجهات.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url)), argv = process.argv.slice(2), opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const shots = argv[0] || '/tmp/facade-shots', root = opt('root') || join(here, '..', 'dist'), before = argv.includes('--before');
mkdirSync(shots, { recursive: true });
const fx = id => readFileSync(join(here, '..', 'tests', 'fixtures', 'facade', id + '.json'), 'utf8');
const { createSession } = await import(join(here, '..', 'dist', 'design-session.mjs'));
const { parseDoc } = await import(join(here, '..', 'dist', 'draw', 'doc.mjs'));
const PORT = Number(opt('port') || 8137), ORIGIN = 'http://localhost:' + PORT;
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = createServer((req, res) => { const p = new URL(req.url, ORIGIN).pathname; const f = join(root, p === '/' ? 'home.html' : p); if (existsSync(f)) { res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); } else { res.writeHead(404); res.end(); } });
await new Promise(r => srv.listen(PORT, r));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const errors = [], results = [];
const LAND = { C1: { width: 20, length: 30, streets: ['s'], entries: ['s'], floors: 1 }, C7: { width: 18, length: 25, streets: ['s'], entries: ['s'], floors: 2 } };
async function view3d(page, name) {
  await page.waitForFunction(() => globalThis.__mizanViewer?.built && document.getElementById('threeMsg')?.hidden !== false, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.evaluate(() => { const v = globalThis.__mizanViewer; v.setMode('orbit', { animate: false }); v.orbitTo({ azimuthDeg: 22, elevationDeg: 12, distance: v.radius() * 2.4 }); });
  await page.waitForTimeout(1500);
  const host = await page.$('#threeHost'); await (host || page).screenshot({ path: join(shots, name) });
}
for (const id of ['C1', 'C7']) {
  const doc = parseDoc(fx(id));
  const session = createSession({ land: LAND[id], counts: {}, requirements: null, idea: '', result: { doc, notes: [], summary: '', alternatives: [] } });
  const styles = before ? [null] : ['classic', 'neoclassic', 'modern'];
  for (const style of styles) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(`${id}/${style}: ${e.message}`));
    await page.route(/workers\.dev|googleapis|gstatic/, r => r.abort());
    await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } }, ['mizan.design.session.v1', JSON.stringify(session)]);
    if (before) { await page.goto(ORIGIN + '/design.html'); await page.waitForSelector('#btnApprove'); await page.click('#btnApprove'); await page.waitForURL(/view3d/); await view3d(page, `before-${id}-3d.png`); results.push({ id, before: true }); await page.close(); continue; }
    await page.goto(ORIGIN + '/design.html');
    await page.waitForSelector('#facadeCard svg'); await page.addStyleTag({ content: '.ph{position:static!important}' });
    const planBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('mizan.design.session.v1')).designs.map(d => d.doc));
    const t0 = Date.now(); await page.click(`#facadeCard [data-style="${style}"]`);
    await page.waitForSelector(`#facadeCard svg[data-facade-style="${style}"]`); const ms = Date.now() - t0;
    const info = await page.evaluate(() => { const s = document.querySelector('#facadeCard svg'); return { side: s.dataset.facadeSide, style: s.dataset.facadeStyle, seed: s.dataset.seed, openings: [...s.querySelectorAll('[data-opening]')].map(n => n.dataset.opening), summary: document.querySelector('[data-facade-summary]').innerText, pressed: [...document.querySelectorAll('#facadeCard [data-style][aria-pressed=true]')].map(b => b.dataset.style) }; });
    const stored = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mizan.design.session.v1')); return { facade: s.input.facade, docs: s.designs.map(d => d.doc) }; });
    const planSame = JSON.stringify(stored.docs) === JSON.stringify(planBefore);
    const card = await page.$('#facadeCard'); await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: join(shots, `${id}-${style}-2d.png`) });
    await page.click('#btnApprove'); await page.waitForURL(/view3d/);
    const handed = await page.evaluate(() => JSON.parse(localStorage.getItem('mizan.studio.doc.v1')).finish?.facade || null);
    await view3d(page, `${id}-${style}-3d.png`);
    const r = { id, style, ms, svgStyle: info.style, side: info.side, seed: info.seed, openingsDrawn: info.openings.length, pressed: info.pressed, stored: { style: stored.facade?.style, source: stored.facade?.source }, planSame, handed: handed && { style: handed.style, seed: handed.seed, source: handed.styleSource } };
    results.push(r); console.log(JSON.stringify(r));
    await page.close();
  }
}
await browser.close(); srv.close();
console.log('ERRORS', errors.length, errors.slice(0, 5).join(' | '));
const bad = results.filter(r => !r.before && (r.svgStyle !== r.style || !r.planSame || r.stored.style !== r.style || r.stored.source !== 'client_confirmed' || r.handed?.style !== r.style || !r.pressed.includes(r.style)));
console.log(bad.length || errors.length ? 'FAIL ' + JSON.stringify(bad) : 'OK ' + results.length);
process.exit(bad.length || errors.length ? 1 : 0);
