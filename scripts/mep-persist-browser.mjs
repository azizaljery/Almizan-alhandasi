// رحلة متصفح لحفظ الأنظمة واستعادتها وإبطالها بعد تعديل العمارة وظهور قسم «كميات الأنظمة الهندسية — أولية» في المخرجات (المرسم، صفحة المخرجات، كتاب المشروع، حزمة التصدير).
// يعتمد على بذرة localStorage من tests/fixtures/mep (بديلان فعليان v3 وv2)، بلا شبكة خارجية. الاستعمال: node scripts/mep-persist-browser.mjs [مجلد-الأدلة] [--no-build]
import http from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const OUT = resolve(ROOT, argv.find((a, i) => !a.startsWith('--') && !/^--(case|seed)$/.test(argv[i - 1] || '')) || 'docs/research/mep-persist-qty-1101/ui');
const CASE = 'PERSIST', SEED = null;
await mkdir(OUT, { recursive: true });
if (!argv.includes('--no-build')) execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'ignore' });
const CLIENT = join(ROOT, 'dist/client');
const worker = (await import('../worker/index.mjs')).default;
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary' };
const isFile = async p => { try { return (await stat(p)).isFile(); } catch { return false; } };
const ASSETS = { async fetch(request) {
  const p = decodeURIComponent(new URL(request.url).pathname);
  for (const t of p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html']) { const f = normalize(join(CLIENT, t)); if (!f.startsWith(CLIENT)) break; if (await isFile(f)) return new Response(await readFile(f), { status: 200, headers: { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' } }); }
  return new Response('Not found', { status: 404 });
} };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`), chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const r = url.pathname === '/' || url.pathname.startsWith('/api/') ? await worker.fetch(request, { ASSETS }, { waitUntil() {} }) : await ASSETS.fetch(request);
    const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; }); res.writeHead(r.status, headers); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e?.stack || e)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const log = { startedAt: new Date().toISOString(), base: BASE, case: CASE, seed: SEED, checks: [], shots: [], downloads: [], errors: [], blocked: [] };
const check = (name, ok, detail = '') => { log.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 240) : ''}`); };

async function context(vp) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500, deviceScaleFactor: vp.width < 500 ? 2 : 1, locale: 'ar-SA', acceptDownloads: true });
  await ctx.route('**/*', route => { const u = new URL(route.request().url()); if (u.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(u.protocol)) return route.continue(); log.blocked.push(u.host); return route.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(240000);
  await page.addInitScript(() => { window.__toasts = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('toast')) window.__toasts.push(n.textContent); }).observe(document, { childList: true, subtree: true }); });
  page.on('pageerror', e => log.errors.push(`[${vp.width}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED/.test(m.text())) log.errors.push(`[${vp.width}] console: ${m.text()}`); });
  page.on('dialog', d => d.accept());
  return { ctx, page };
}
const tag = vp => vp.width < 500 ? 'mobile' : 'desktop';
const snap = async (page, vp, name, full = true) => { const p = join(OUT, `${tag(vp)}-${name}.png`); await page.screenshot({ path: p, fullPage: full }); log.shots.push(p.replace(ROOT + '/', '')); };
const snapEl = async (page, vp, sel, name) => { const p = join(OUT, `${tag(vp)}-${name}.png`); await page.locator(sel).first().screenshot({ path: p }); log.shots.push(p.replace(ROOT + '/', '')); };
const waitFresh = page => page.waitForFunction(() => { const s = globalThis.__mizanSystems?.state; return s && s.fresh?.fresh && !s.busy; }, null, { timeout: 120000 });
const st = page => page.evaluate(() => globalThis.__mizanSystems.state);
const tab = async (page, id) => { await page.click(`[data-tab="${id}"]`); await page.waitForTimeout(150); };
const level = async (page, id) => { await page.click(`[data-level="${id}"]`); await page.waitForTimeout(150); };

import { readFileSync } from 'node:fs';
const fx = n => JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/mep/' + n + '.json'), 'utf8')).alternatives[0].doc;
const V3 = fx('C6-v3'), V2 = fx('C6-v2');
const SESSION = { v: 1, input: {}, createdAt: 7, current: 0, approved: 0, alternatives: [], designs: [V3, V2].map((d, i) => ({ doc: JSON.stringify(d), version: i + 1, engine: i ? 'v2' : 'v3' })) };
const desktop = { width: 1366, height: 900 }, mobile = { width: 390, height: 844 };
const stateOf = page => page.evaluate(() => globalThis.__mizanSystems.state);
async function addDevice(page, { group, kind, type, z }) {
  await page.click('[data-mode=add]'); await page.waitForTimeout(300);
  await page.selectOption('#grpSel', String(group)); await page.selectOption('#kindSel', kind);
  await page.fill('#zRel', String(z)); await page.dispatchEvent('#zRel', 'change');
  const room = (await page.evaluate(() => globalThis.__mizanSystems.rooms())).find(r => r.type === type);
  await page.locator('#plan').scrollIntoViewIfNeeded();
  const pt = await page.evaluate(([X, Y]) => globalThis.__mizanSystems.screenPoint(X, Y), [room.c.x, room.c.y]);
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(200); await waitFresh(page);
}
const ids = s => Object.values(s.inputs.services || {}).flatMap(g => Object.values(g)).flat().map(d => d.id);
async function seed(page, studioDoc = V3) {
  await page.goto(BASE + '/home.html');
  await page.evaluate(([S, D]) => { localStorage.clear(); localStorage.setItem('mizan.design.session.v1', JSON.stringify(S)); localStorage.setItem('mizan.studio.doc.v1', JSON.stringify(D)); }, [SESSION, studioDoc]);
}
async function run(vp) {
  const { ctx, page } = await context(vp), T = tag(vp), P = n => `${T}: ${n}`;
  await seed(page);
  // 1) بديل 1: كاشف دخان في المجلس. بديل 2: لوحة توزيع. ثم تبديل وإعادة تحميل.
  await page.goto(BASE + '/systems.html?source=D7-v1'); await waitFresh(page);
  await tab(page, 'fire'); await addDevice(page, { group: 0, kind: 'SMOKE_DETECTOR', type: 'majlis', z: 2.9 });
  let s = await stateOf(page); check(P('البديل 1 حُفظ بجهازه'), s.source === 'D7-v1' && ids(s).join() === 'SD1', ids(s));
  await page.selectOption('#sourceSel', 'D7-v2'); await waitFresh(page);
  s = await stateOf(page); check(P('التبديل إلى البديل 2: لا يحمل أجهزة البديل 1'), s.source === 'D7-v2' && ids(s).length === 0, ids(s));
  await tab(page, 'electrical'); await addDevice(page, { group: 0, kind: 'PANEL', type: 'majlis', z: 1.6 });
  s = await stateOf(page); check(P('البديل 2 حُفظ بجهازه'), ids(s).join() === 'DB1', ids(s));
  await page.selectOption('#sourceSel', 'D7-v1'); await waitFresh(page);
  s = await stateOf(page); check(P('الرجوع إلى البديل 1 يعيد كاشف الدخان وحده'), s.source === 'D7-v1' && ids(s).join() === 'SD1' && s.fresh.fresh, ids(s));
  await page.reload(); await waitFresh(page);
  s = await stateOf(page); const hash1 = s.sourceHash; check(P('إعادة تحميل الصفحة تستعيد البديل 1 بنتيجة حديثة'), ids(s).join() === 'SD1' && s.fresh.fresh);
  await page.goto(BASE + '/systems.html?source=D7-v2'); await waitFresh(page);
  s = await stateOf(page); check(P('إعادة التحميل على البديل 2 تستعيد لوحته وبصمة مصدر مختلفة'), ids(s).join() === 'DB1' && s.sourceHash !== hash1);
  await snap(page, vp, '10-systems-two-alternatives', false);
  // 2) فتح جلسة قديمة (createdAt مختلف بالمستندين نفسيهما) لا يخلط
  await page.evaluate(S => { localStorage.setItem('mizan.design.session.v1', JSON.stringify({ ...S, createdAt: 99 })); }, SESSION);
  await page.goto(BASE + '/systems.html?source=D99-v1'); await waitFresh(page);
  s = await stateOf(page); check(P('جلسة جديدة بالمستند نفسه: لا أجهزة موروثة'), s.source === 'D99-v1' && ids(s).length === 0, ids(s));
  await page.evaluate(S => { localStorage.setItem('mizan.design.session.v1', JSON.stringify(S)); }, SESSION);
  // 3) المخرجات: قسم الأنظمة حديث (المرسم = مستند البديل 1 نفسه ⇒ تبنٍّ بالبصمة)
  await page.goto(BASE + '/final.html'); await page.waitForSelector('#mep');
  const sec = () => page.locator('#mep').innerText(), st0 = () => page.locator('#mep [data-mep-status]').getAttribute('data-mep-status');
  let t = await sec(); check(P('صفحة المخرجات: القسم حديث بعنوانه وتصنيفه وبند الحريق «غير مسعّر»'), await st0() === 'CURRENT' && t.includes('كميات الأنظمة الهندسية — أولية') && t.includes('كميات أولية — غير معتمدة للتنفيذ') && t.includes('كاشف دخان') && t.includes('غير مسعّر'), t.slice(0, 200));
  await page.locator('#mep').scrollIntoViewIfNeeded(); await snapEl(page, vp, '#mep', '20-final-current');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnBook')]); const book = readFileSync(await dl.path(), 'utf8');
  check(P('كتاب المشروع المنزَّل يحمل القسم الحديث'), /data-mep-status="CURRENT"/.test(book) && book.includes('كاشف دخان') && book.includes('كميات أولية — غير معتمدة للتنفيذ'));
  // 4) المرسم: تبويب الكميات وحزمة التصدير (ملفات منفصلة) تحمل القسم
  await page.goto(BASE + '/studio.html'); await page.waitForSelector('#plan, canvas', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { for (const b of document.querySelectorAll('[data-tab=qty]')) b.removeAttribute('hidden'); document.querySelector('[data-tab=qty]').click(); });
  await page.waitForSelector('#mepQty[data-mep-status]', { timeout: 60000 });
  check(P('تبويب الكميات في المرسم: قسم الأنظمة حديث'), await page.locator('#mepQty').getAttribute('data-mep-status') === 'CURRENT', (await page.locator('#mepQty').innerText()).slice(0, 120));
  async function bundle() {
    await page.evaluate(() => { document.querySelector('[data-export=bundle]').click(); }).catch(() => {});
    await page.waitForSelector('dialog.export-studio button:has-text("تنزيل ملفات منفصلة")', { timeout: 60000 });
    const got = {}; const handler = async d => { got[d.suggestedFilename()] = readFileSync(await d.path(), 'utf8'); }; page.on('download', handler);
    await page.click('dialog.export-studio button:has-text("تنزيل ملفات منفصلة")'); await page.waitForTimeout(2500); page.off('download', handler);
    await page.evaluate(() => document.querySelector('dialog.export-studio')?.close()); return got;
  }
  await page.evaluate(() => { const m = document.getElementById('exportMenu'); if (m) m.hidden = false; });
  let files = await bundle(), csv = files['quantities.csv'] || '', man = JSON.parse(files['manifest.json'] || '{}');
  check(P('quantities.csv: BOM + جدول العمارة + قسم الأنظمة بكاشف الدخان وغير مسعّر'), csv.charCodeAt(0) === 0xfeff && csv.includes('كميات الأنظمة الهندسية — أولية') && csv.includes('كاشف دخان') && csv.includes('غير مسعّر') && csv.includes('البند'), csv.slice(-400));
  check(P('manifest.json يحمل systemsQuantities حديثًا غير معتمد'), man.systemsQuantities?.status === 'CURRENT' && man.systemsQuantities.constructionApproved === false && man.systemsQuantities.codeCompliance === 'NOT_EVALUATED');
  log.downloads.push({ vp: T, files: Object.keys(files) });
  await page.evaluate(() => document.querySelector('#mepQty').scrollIntoView()); await snapEl(page, vp, '#mepQty', '30-studio-qty-current');
  // 5) تعديل العمارة (سماكة جدار داخلي) في المرسم: القسم والملفات «قديمة» بلا أرقام قديمة
  await page.evaluate(async () => {
    const { applyCommand, parseDoc, serialize } = await import('./draw/doc.mjs'); const { analyzeDoc } = await import('./draw/digest.mjs');
    const doc = parseDoc(localStorage.getItem('mizan.studio.doc.v1')), A = analyzeDoc(doc), w = doc.walls.find(w => A.levels[0].rooms.filter(r => r.edges.some(e => e.wallIds?.includes(w.id))).length >= 2);
    localStorage.setItem('mizan.studio.doc.v1', serialize(applyCommand(doc, { type: 'update', id: w.id, patch: { t: Math.min(0.5, w.t + 0.1) } }).doc));
  });
  await page.goto(BASE + '/final.html'); await page.waitForSelector('#mep [data-mep-status]');
  t = await sec(); check(P('بعد تعديل الجدار: قسم المخرجات قديم بلا بنود ولا جدول'), await st0() === 'STALE' && /قديمة/.test(t) && !t.includes('كاشف دخان') && (await page.locator('#mep table').count()) === 0, t.slice(0, 200));
  await page.locator('#mep').scrollIntoViewIfNeeded(); await snapEl(page, vp, '#mep', '40-final-stale');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btnBook')]); const book2 = readFileSync(await dl2.path(), 'utf8');
  check(P('كتاب المشروع بعد التعديل: القسم قديم بلا كاشف دخان'), /data-mep-status="STALE"/.test(book2) && !book2.includes('كاشف دخان'));
  await page.goto(BASE + '/studio.html'); await page.waitForTimeout(1500);
  await page.evaluate(() => { document.querySelector('[data-tab=qty]').click(); });
  await page.waitForSelector('#mepQty[data-mep-status]', { timeout: 60000 });
  check(P('تبويب كميات المرسم بعد التعديل: قديمة'), await page.locator('#mepQty').getAttribute('data-mep-status') === 'STALE');
  await page.evaluate(() => { const m = document.getElementById('exportMenu'); if (m) m.hidden = false; });
  files = await bundle(); csv = files['quantities.csv'] || ''; man = JSON.parse(files['manifest.json'] || '{}');
  check(P('quantities.csv بعد التعديل: القسم قديم بلا كاشف دخان'), csv.includes('كميات الأنظمة الهندسية — أولية') && csv.includes('قديمة') && !csv.includes('كاشف دخان'));
  check(P('manifest.json بعد التعديل: STALE وبلا صفوف'), man.systemsQuantities?.status === 'STALE' && man.systemsQuantities.rows.length === 0);
  await snapEl(page, vp, '#mepQty', '50-studio-qty-stale');
  // 6) صفحة الأنظمة بعد التعديل: تنبيه، مدخلات محفوظة، الجداول والتصدير حسب الحالة، ثم إعادة الحساب
  await page.goto(BASE + '/systems.html?source=STUDIO-D7-v1'); await page.waitForFunction(() => globalThis.__mizanSystems?.state?.source);
  await waitFresh(page);
  s = await stateOf(page); check(P('صفحة الأنظمة على المخطط المعدّل: أُعيد الحساب بمدخلات محفوظة'), s.fresh.fresh && s.source === 'STUDIO-D7-v1');
  await snap(page, vp, '60-systems-after-edit', false);
  // 7) طريق الإيقاف اليدوي: نقل جهاز بلا حساب تلقائي ⇒ قديمة، الجداول مخفية، التصدير معطل
  await page.uncheck('#autoCalc');
  await tab(page, 'fire'); await page.click('[data-mode=add]'); await page.waitForTimeout(200);
  const room = (await page.evaluate(() => globalThis.__mizanSystems.rooms())).find(r => r.type === 'living');
  await page.selectOption('#kindSel', 'HEAT_DETECTOR'); await page.fill('#zRel', '2.9'); await page.dispatchEvent('#zRel', 'change'); await page.locator('#plan').scrollIntoViewIfNeeded(); const pt = await page.evaluate(([X, Y]) => globalThis.__mizanSystems.screenPoint(X, Y), [room.c.x, room.c.y]);
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(400);
  s = await stateOf(page); const disabled = await page.locator('[data-export]').evaluateAll(b => b.length > 0 && b.every(x => x.disabled));
  const noteVis = await page.locator('#tablesBox[data-stale] .stale-note').isVisible().catch(() => false), tblVis = await page.locator('#tablesBox table').first().isVisible().catch(() => false);
  check(P('تعديل مدخل بلا إعادة حساب: قديمة، التصدير معطل، الجداول والكميات مخفية'), !s.fresh.fresh && disabled && noteVis && !tblVis, { fresh: s.fresh, disabled, noteVis, tblVis, ids: ids(s) });
  await snap(page, vp, '70-systems-stale-hidden-tables', false);
  await page.click('#btnRecalc'); await waitFresh(page); await page.check('#autoCalc');
  check(P('إعادة الحساب تعيد الحالة محدّثة والجداول ظاهرة'), (await stateOf(page)).fresh.fresh && await page.locator('#tablesBox table').first().isVisible());
  // 8) لا تمرير أفقي
  await page.goto(BASE + '/final.html'); await page.waitForSelector('#mep [data-mep-status]');
  const hs = await page.evaluate(vw => ({ sw: document.scrollingElement.scrollWidth, summaryRight: Math.round(document.querySelector('#summary').getBoundingClientRect().right), mepTableOverflow: [...document.querySelectorAll('#mep *')].filter(e => { const r = e.getBoundingClientRect(), sr = document.querySelector('#mep').getBoundingClientRect().right; return r.width && r.right > sr + 1 && !e.closest('.tw'); }).map(e => e.tagName).slice(0, 5), mepRight: Math.round(document.querySelector('#mep').getBoundingClientRect().right), headerOverflow: [...document.querySelectorAll('header, header *')].some(e => e.getBoundingClientRect().right > vw + 1), widest: [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > vw + 1).sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right).slice(0, 4).map(e => e.tagName + '.' + e.className + '/' + (e.closest('section')?.id || '') + ' ' + Math.round(e.getBoundingClientRect().right)) }), vp.width);
  check(P('قسم الأنظمة في المخرجات داخل عرض الشاشة (الجداول تمرَّر داخل حاويتها)'), hs.mepRight <= Math.max(vp.width, hs.summaryRight) + 1 && hs.mepTableOverflow.length === 0, hs);
  if (hs.sw > vp.width + 1) log.notes = [...(log.notes || []), `${T}: تمرير أفقي سابق الوجود في final.html (scrollWidth=${hs.sw}) يشمل أقسامه كلها (summary وplan0…) ولم يُغيَّر؛ قسم الأنظمة بعرض بقية الأقسام نفسه`];
  await ctx.close();
}
await run(desktop); await run(mobile);
log.finishedAt = new Date().toISOString();
await writeFile(join(OUT, 'journey-log.json'), JSON.stringify(log, null, 2));
const fails = log.checks.filter(c => !c.ok); console.log(`\n${log.checks.length - fails.length}/${log.checks.length} checks passed; errors=${log.errors.length}; blocked=${[...new Set(log.blocked)]}`);
await browser.close(); server.close(); process.exit(fails.length || log.errors.length ? 1 : 0);
