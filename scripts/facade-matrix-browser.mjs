// مصفوفة الواجهات في المتصفح: طراز × قالب (يشمل «بلا قالب» الذي ينتج عن تبديل الطراز) × مخطط، عبر صفحة الواجهة الفعلية (dist/facade-j).
// تفشل (رمز خروج 1) عند أي خطأ صفحة أو console.error أو فشل تحميل وحدة (404) أو __FR.error أو لوحة فارغة أو رسالة «تعذّر».
// الاستعمال: PLAYWRIGHT_MODULE=/opt/npm-tools/node_modules/playwright/index.mjs node scripts/facade-matrix-browser.mjs [--all] [--night] [--flow]
//   افتراضيًا: 6 طرز × (بلا قالب + قالبان) × مخططان ≈ 36 تركيبة؛ --all كل القوالب؛ --night ليلًا؛ --flow يمرّ أيضًا على view3d.html (تبديل الطراز بالأزرار).
//   JOBS=2 للتوازي؛ SHOTS=dir لحفظ لقطات (JPEG) للأعطال. يُستعمل تصيير swiftshader (برمجي) فكل تركيبة 10–30 ثانية.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { STYLES } from '../dist/facade-j/facade-realism/styles/index.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ALL = process.argv.includes('--all'), NIGHT = process.argv.includes('--night'), FLOW = process.argv.includes('--flow'), JOBS = +process.env.JOBS || 2, SHOTS = process.env.SHOTS || '';
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.hdr': 'application/octet-stream' };
const server = http.createServer((q, r) => { let f = path.normalize(path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname))); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); r.end('nf'); return; } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const counts = b => ({ bedrooms: b, majlis: 1, baths: b, kitchens: 1, halls: 1, dining: 1 });
const mk = (w, l, b, f, req = '') => (f === 1 ? generateVillaDesigns : generateVillaTwoFloors)({ land: { width: w, length: l, streets: ['s'], entries: ['s'], floors: f }, counts: counts(b), requirements: extractRequirements(req, {}), keep: 1 }).designs[0].doc;
const DOCS = { 'دوران 20×30 تراس': mk(20, 30, 4, 2, 'ابي فيلا دورين وتراس فوق'), 'دور 15×25': mk(15, 25, 4, 1) };
const NIGHT_Q = '&night=1&sun=0.05&skys=.01&bgs=.04&el=4&exp=1.6';
const jobs = []; for (const style of Object.keys(STYLES)) { const T = (await STYLES[style].load()).templates, ids = ALL ? T.map(t => t.id) : [T[0].id, T[Math.floor(T.length / 2)].id];
  for (const [dn, doc] of Object.entries(DOCS)) for (const tpl of ['', ...ids]) jobs.push({ style, tpl, dn, doc }); }
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const failures = []; let done = 0;
async function watch(p, errs) {
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console.error: ' + m.text().slice(0, 160)); });
  p.on('response', x => { if (x.status() >= 400 && !/api\/site\/notice/.test(x.url())) errs.push(`HTTP ${x.status()} ${x.url()}`); });
}
const canvasOk = p => p.evaluate(() => { const c = document.querySelector('canvas'); if (!c) return false; const t = document.createElement('canvas'); t.width = 32; t.height = 20; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 32, 20); const d = x.getImageData(0, 0, 32, 20).data; let mn = 765, mx = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return mx - mn >= 30; }).catch(() => false);
async function one(j) {
  const tag = `${j.style}/${j.tpl || 'بلا قالب'}/${j.dn}`, ctx = await b.newContext({ viewport: { width: 1000, height: 640 } }), errs = [];
  await ctx.addInitScript(d => { try { localStorage.setItem('mizan.studio.doc.v1', d); } catch {} }, JSON.stringify(j.doc));
  const p = await ctx.newPage(); await watch(p, errs);
  await p.goto(`${base}/facade-j/?v=A&hq=1&nav=0&w=640&h=400&style=${j.style}&src=studio&cam=auto&floors=${j.doc.levels.length}${j.tpl ? `&tpl=${j.tpl}&tseed=1` : ''}${NIGHT ? NIGHT_Q : ''}`);
  try { await p.waitForFunction(() => window.__FR?.ready === true, null, { timeout: 150000 }); } catch { errs.push('انتهت المهلة'); }
  const fr = await p.evaluate(() => window.__FR || null).catch(() => null), msg = await p.evaluate(() => document.getElementById('msg')?.textContent || '').catch(() => '');
  if (fr?.error) errs.push('__FR.error: ' + fr.error); if (/تعذّر/.test(msg)) errs.push('رسالة ظاهرة: ' + msg.slice(0, 100)); if (!errs.length && !(await canvasOk(p))) errs.push('لوحة فارغة');
  if (!errs.length && fr && fr.floors !== j.doc.levels.length) errs.push(`عدد الأدوار ${fr.floors} ≠ ${j.doc.levels.length}`);
  if (errs.length) { failures.push(`${tag}: ${errs.join(' | ')}`); if (SHOTS) await p.screenshot({ path: path.join(SHOTS, tag.replace(/[\/ ×]/g, '_') + '.jpg'), type: 'jpeg', quality: 60 }).catch(() => {}); }
  await ctx.close(); console.log(`[${++done}/${jobs.length}] ${errs.length ? 'FAIL' : 'ok  '} ${tag}`);
}
const queue = [...jobs]; await Promise.all(Array.from({ length: JOBS }, async () => { for (let j; (j = queue.shift());) await one(j).catch(e => { failures.push(`${j.style}/${j.tpl}: انهيار الاختبار ${e.message}`); }); }));
// تدفق view3d: الشكل الخارجي المخزَّن يظهر طرازه فعلًا، وتبديل الطراز بالأزرار يعيد بناء الإطار بالطراز الجديد بلا خطأ
if (FLOW) {
  const doc = DOCS['دور 15×25'], ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }), errs = [];
  await ctx.addInitScript(([d, e]) => { try { localStorage.setItem('mizan.studio.doc.v1', d); localStorage.setItem('mizan.exterior.v1', e); } catch {} }, [JSON.stringify(doc), JSON.stringify({ style: 'N' })]);
  const p = await ctx.newPage(); await watch(p, errs); await p.goto(base + '/view3d.html');
  const state = () => p.evaluate(() => { const fr = document.getElementById('facadeFrame'); let r = null, u = ''; try { r = fr.contentWindow.__FR; u = fr.contentWindow.location.search; } catch { /* قبل التحميل */ } return { u, r: r && { ready: r.ready, error: r.error } }; });
  for (const st of ['N', 'S', 'H', 'C', 'M']) {
    if (st !== 'N') await p.click(`#styleSel [data-s="${st}"]`);
    const t0 = Date.now(); let s; do { await p.waitForTimeout(800); s = await state(); } while (!(s.u.includes('style=' + st) && s.r?.ready) && Date.now() - t0 < 150000);
    if (!s.u.includes('style=' + st)) errs.push(`الإطار لم ينتقل إلى الطراز ${st}`); else if (s.r?.error) errs.push(`${st}: ${s.r.error}`); else if (!s.r?.ready) errs.push(`${st}: انتهت المهلة`);
    console.log(`flow ${st}: ${s.u.slice(0, 60)} ${JSON.stringify(s.r)}`);
  }
  if (errs.length) failures.push('تدفق view3d: ' + errs.join(' | ')); await ctx.close();
}
await b.close(); server.close();
console.log(failures.length ? `\nفشل ${failures.length} من ${jobs.length}:\n` + failures.join('\n') : `\nنجحت كل التركيبات (${jobs.length}${FLOW ? ' + تدفق view3d' : ''}) بلا أخطاء صفحة.`);
process.exit(failures.length ? 1 : 0);
