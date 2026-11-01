// تجربة واجهة الأنظمة الهندسية في متصفح حقيقي (Chromium المثبت مسبقًا) على ناتج البناء dist/client محليًا:
// الرحلة الفعلية (الأرض ← شرعاء بالفهم المحلي بلا رمز ولا مزود ← التوليد في المتصفح ← صفحة التصميم ← رابط الأنظمة)،
// ثم لكل تخصص: إضافة أجهزة بالنقر على المسقط وتحرير المدخلات، لقطات الطبقات والجداول والرسائل، رفض النقر خارج الغرف،
// حالة «قديمة» ومنع التصدير، ثم تنزيل كل صيغة وفحصها (SVG XML، أقسام DXF، ترويسة CSV UTF-8، JSON)، على 1366×900 و390×844.
// الاستعمال: node scripts/mep-systems-browser.mjs [مجلد-الأدلة] [--case C7] [--seed tests/fixtures/mep/C7-v3.json] [--no-build]
// بلا شبكة خارجية: كل طلب خارج 127.0.0.1 يُمنع ويُسجَّل.
import http from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const OUT = resolve(ROOT, argv.find((a, i) => !a.startsWith('--') && !/^--(case|seed)$/.test(argv[i - 1] || '')) || 'docs/research/mep-integration/ui');
const CASE = opt('case', 'C7'), SEED = opt('seed', null);
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
async function placeAt(page, { group = 0, kind, x, y, z = 1.2, outside = false }) {
  await page.click('[data-mode=add]'); await page.waitForTimeout(300);
  await page.selectOption('#grpSel', String(group)); await page.selectOption('#kindSel', kind);
  await page.fill('#zRel', String(z)); await page.dispatchEvent('#zRel', 'change');
  if (outside !== await page.isChecked('#outsideChk')) await page.click('#outsideChk');
  const pt = await page.evaluate(([X, Y]) => globalThis.__mizanSystems.screenPoint(X, Y), [x, y]);
  await page.locator('#plan').scrollIntoViewIfNeeded();
  const pt2 = await page.evaluate(([X, Y]) => globalThis.__mizanSystems.screenPoint(X, Y), [x, y]);
  await page.mouse.click(pt2.x, pt2.y);
  await page.waitForTimeout(200); await waitFresh(page);
  return pt;
}
async function setField(page, section, row, field, value) {
  const loc = page.locator(`[data-section="${section}"] tr[data-row="${row}"] [data-field="${field}"]`);
  if (await loc.evaluate(e => e.tagName) === 'SELECT') await loc.selectOption(String(value)); else { await loc.fill(String(value)); await loc.dispatchEvent('change'); }
  await page.waitForTimeout(100); await waitFresh(page);
}
const addRow = async (page, sec, key = sec) => { await page.evaluate(x => { const d = document.querySelector(`[data-section="${x}"]`); if (d) d.open = true; }, sec); await page.click(`[data-add="${key}"]`); await waitFresh(page); };
const lastDevice = async (page, path) => page.evaluate(p => { let o = globalThis.__mizanSystems.state.inputs.services; for (const k of p.split('.')) o = o?.[k]; return o?.at(-1)?.id; }, path);
const roomsOf = (page, lv) => page.evaluate(l => globalThis.__mizanSystems.rooms(l), lv);
const noHScroll = (page, vw) => page.evaluate(vw => { const w = document.scrollingElement.scrollWidth, off = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > vw + 1 || r.left < -1) && !e.closest('.tw'); }).slice(0, 4).map(e => e.tagName + '.' + e.className + ':' + Math.round(e.getBoundingClientRect().width)); return { ok: w <= vw + 1 && innerWidth <= vw + 1, w, innerWidth, off }; }, vw);

// ———————————————————————————————— 1) الرحلة الفعلية حتى صفحة الأنظمة
const desktop = { width: 1366, height: 900 }, mobile = { width: 390, height: 844 };
const { ctx, page } = await context(desktop);
const t0 = Date.now();
if (SEED) {
  const f = JSON.parse(await readFile(resolve(ROOT, SEED), 'utf8'));
  await page.goto(BASE + '/home.html');
  await page.evaluate(f => localStorage.setItem('mizan.design.session.v1', JSON.stringify({ v: 1, input: {}, designs: f.alternatives.map((a, i) => ({ doc: JSON.stringify(a.doc), version: i + 1, engine: f.villaEngine })), current: 0, alternatives: [], approved: null, createdAt: 1 })), f);
  await page.goto(BASE + '/design.html'); await page.waitForSelector('#plan', { timeout: 60000 });
  check('بذرة: صفحة التصميم من مستند محرك فعلي', true, SEED);
} else {
  const { CASES } = await import('./acceptance-cases.mjs');
  // GUIDED: الأرض والأعداد نفسها التي يستعملها scripts/e2e-sharaa-r21-ui.mjs (25×12.5، شارع ومدخل شمالي، 3 غرف ومجلس و3 دورات)
  const C = CASE === 'GUIDED' ? { id: 'GUIDED', land: { length: 25, width: 12.5, streets: ['n'], entries: ['n'] }, counts: { bedrooms: 3, majlis: 1, baths: 3 } } : CASES.find(c => c.id === CASE);
  await page.goto(BASE + '/'); await page.waitForSelector('#start'); await page.click('#start');
  await page.fill('#landLength', String(C.land.length)); await page.fill('#landWidth', String(C.land.width));
  if ((C.land.floors || 1) > 1) await page.selectOption('#landFloors', String(C.land.floors));
  for (const s of C.land.streets) await page.check(`input[data-kind=street][value=${s}]`);
  for (const s of C.land.entries) await page.check(`input[data-kind=entry][value=${s}]`);
  await page.click('#landForm button[type=submit]'); await page.waitForSelector('#stageShara:not([hidden])');
  await page.waitForSelector('#chat button');
  // شرعاء V2: مسار «أسئلة موجهة» بالفهم المحلي (بلا رمز ولا مزود)، بالأجوبة نفسها التي يستعملها scripts/e2e-sharaa-r21-ui.mjs
  await page.click('#pathSwitch button:has-text("أسئلة موجهة")'); await page.waitForTimeout(500);
  const T = sel => page.locator(sel).innerText().catch(() => '');
  for (let i = 0; i < 30; i++) {
    const nums = await page.$$('#chat input[type=number]');
    if (nums.length >= 6) { const vals = [String(C.counts.bedrooms), String(C.counts.majlis), String(C.counts.baths), '1', '1', '0']; for (let k = 0; k < 6; k++) await nums[k].fill(vals[k]); await page.click('#chat button:has-text("متابعة")'); await page.waitForTimeout(600); continue; }
    if (nums.length === 2 && /أفراد الأسرة الحاليين/.test(await nums[0].evaluate(el => el.closest('form').innerText))) await nums[0].fill('6');
    if (await page.$('#chat button:has-text("أؤكد وأبدأ"), #chat button:has-text("أفهم القيود")')) break;
    const st0 = await page.$('#chat button:has-text("ابدأ التصميم")'); if (st0) { await st0.click(); await page.waitForTimeout(600); continue; }
    let btn = null;
    for (const w of ['لا يهم', 'لا أحتاج', 'تخطّي', 'تسجيل', 'متابعة', 'اعتمد']) { btn = await page.$(`#chat button:has-text("${w}")`); if (btn) break; }
    if (!btn) btn = (await page.$('#chat .controls button, #chat button.chip, #chat button.opt'));
    if (!btn) break; await btn.click(); await page.waitForTimeout(500);
  }
  await snap(page, desktop, '01-sharaa-brief', false);
  const go = await page.$('#chat button:has-text("أؤكد وأبدأ"), #chat button:has-text("أفهم القيود")'); if (go) await go.click();
  await page.waitForSelector('#chat button:has-text("توليد التصميم")', { timeout: 20000 }).then(b => b.click()).catch(() => {});
  await snap(page, desktop, '01b-after-confirm', false);
  let outcome = await Promise.race([page.waitForURL(/\/design(\.html)?$/, { timeout: 3000000 }).then(() => 'design'), page.waitForFunction(() => { const r = document.querySelector('#buildReport'); return r && !r.hidden && r.children.length > 0; }, null, { timeout: 3000000 }).then(() => 'report')]);
  // المحرك حجب كل التصاميم وعرض خيارات صريحة؛ «العميل» يوافق صراحة في الواجهة على تنازلين محددين بالترتيب (لا تغيير صامت)
  for (const [k, title] of [['parking', 'قبول موقف موازٍ للشارع'], ['majlis', 'فصل المجلس عن غرفة الطعام']].entries()) {
    if (outcome !== 'report') break;
    await snap(page, desktop, `01c-build-report-${k}`, true);
    const card = page.locator('#buildReport div').filter({ hasText: title[1] }).filter({ has: page.locator('button') }).last();
    if (!(await card.count())) continue;
    await card.locator('button').first().click();
    check(`بعد حجب التصاميم: موافقة صريحة على «${title[1]}» من بطاقة الخيارات`, true);
    outcome = await page.waitForURL(/\/design(\.html)?$/, { timeout: 1500000 }).then(() => 'design').catch(() => 'report');
  }
  if (outcome !== 'design') { await snap(page, desktop, '01d-build-report', true); check('التوليد انتهى بصفحة التصميم', false, await page.locator('#buildReport').innerText().catch(() => '')); throw Error('NO_DESIGN'); }
  await page.waitForSelector('#plan', { timeout: 300000 }); await page.waitForTimeout(800);
  check('الرحلة: الأرض ← شرعاء ← التوليد في المتصفح ← صفحة التصميم', true, `${CASE} في ${Math.round((Date.now() - t0) / 1000)} ث`);
}
const alts = await page.locator('#alts [data-alt]').count();
await snap(page, desktop, '02-design-alternatives', false);
if (alts > 1) { await page.click('#alts [data-alt="1"]'); await page.waitForTimeout(500); check('اختيار بديل آخر من بطاقة البدائل', true, `${alts} بدائل؛ اختير الثاني`); }
const chosen = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mizan.design.session.v1')); return { current: s.current, version: s.designs[s.current].version ?? s.current + 1, createdAt: s.createdAt }; });
check('رابط الأنظمة ظاهر في صفحة التصميم', await page.locator('[data-systems-entry] a').isVisible());
await page.click('[data-systems-entry] a', { timeout: 180000 }); await page.waitForURL(/systems/, { timeout: 180000 }); await waitFresh(page);
const s0 = await st(page);
check('صفحة الأنظمة مربوطة بالتصميم المعروض نفسه', s0.source === `D${chosen.createdAt}-v${chosen.version}`, s0.source);
check('وسم «تصميم أولي يحتاج مراجعة مهندس مختص» ظاهر', /تصميم أولي يحتاج مراجعة مهندس مختص — ليس مخططًا تنفيذيًا معتمدًا/.test(await page.locator('[data-preliminary]').innerText()));
const levels = await page.locator('[data-level]').count();
check('اختيار الدور يعرض أدوار المستند الفعلية', levels >= 1, `${levels} دور`);
await snap(page, desktop, '03-systems-bound');

// ———————————————————————————————— 2) الكهرباء والإنارة
const L1 = await roomsOf(page, 'L1'), pick = (rooms, re) => rooms.find(r => re.test(r.type)) || rooms[0];
const kitchen = pick(L1, /kitchen/), majlis = pick(L1, /majlis/), living = pick(L1, /living/), bath = pick(L1, /bath/);
await tab(page, 'electrical');
await placeAt(page, { group: 0, kind: 'PANEL', x: kitchen.c.x, y: kitchen.c.y, z: 1.6 });
await placeAt(page, { group: 1, kind: 'SOCKET', x: majlis.c.x, y: majlis.c.y, z: 0.4 });
await placeAt(page, { group: 1, kind: 'SOCKET', x: living.c.x, y: living.c.y, z: 0.4 });
let s = await st(page);
check('إضافة لوحة ومقبسين بالنقر على المسقط داخل غرفها', (s.inputs.services.electrical?.panels || []).length === 1 && (s.inputs.services.electrical?.loads || []).length === 2, JSON.stringify(s.inputs.services.electrical).slice(0, 200));
await setField(page, 'electrical.loads', 'SO1', 'powerW', 1000); await setField(page, 'electrical.loads', 'SO1', 'demandFactor', 0.5);
await setField(page, 'electrical.loads', 'SO2', 'powerW', 800); await setField(page, 'electrical.loads', 'SO2', 'powerFactor', 0.95); await setField(page, 'electrical.loads', 'SO2', 'demandFactor', 0.5);
await addRow(page, 'electrical.circuits');
await setField(page, 'electrical.circuits', 'C1', 'panelId', 'DB1');
await page.locator('[data-section="electrical.circuits"] tr[data-row="C1"] [data-field="loadIds"]').fill('SO1, SO2'); await page.locator('[data-section="electrical.circuits"] tr[data-row="C1"] [data-field="loadIds"]').dispatchEvent('change'); await waitFresh(page);
await setField(page, 'electrical.circuits', 'C1', 'voltageV', 230); await setField(page, 'electrical.circuits', 'C1', 'phase', 'L1');
await page.click('[data-section="electrical.circuits"] [data-demo]'); await waitFresh(page);
await page.evaluate(() => { document.querySelector('[data-section="electrical.lightingByRoom"]').open = true; }); await page.selectOption('#lightRoom', majlis.id); await addRow(page, 'electrical.lightingByRoom', 'lighting');
for (const [f, v] of [['targetLux', 150], ['lumensPerFixture', 1600], ['utilizationFactor', 0.6], ['maintenanceFactor', 0.8], ['wattsPerFixture', 14], ['powerFactor', 0.95], ['demandFactor', 1], ['mountHeightM', 2.9]]) await setField(page, 'electrical.lightingByRoom', '0', f, v);
const calcs = await page.locator('[data-calcs=electrical] tr[data-status]').evaluateAll(rs => rs.map(r => [r.cells[0].innerText, r.dataset.status, r.cells[3].innerText]));
check('PF ناقص للمقبس SO1: «غير محسوب» لا صفر', calcs.some(([id, st, v]) => id === 'E-P-SO1' && st === 'NOT_CALCULATED' && /غير محسوب/.test(v)), calcs.find(c => c[0] === 'E-P-SO1'));
check('الإنارة محسوبة بطريقة اللومن من مدخلات صريحة', calcs.some(([id, st]) => id === 'E-LUX-' + majlis.id && st === 'CALCULATED'));
await snapEl(page, desktop, '[data-plan-card]', '10-electrical-layer'); await snap(page, desktop, '11-electrical-tables');

// ———————————————————————————————— 3) التكييف والتهوية: جهاز باستهلاك فعلي وربطه بالكهرباء، ومنطقة بمناخ المثال المعلن
await tab(page, 'hvac');
await placeAt(page, { group: 0, kind: 'AIR_EQUIPMENT', x: majlis.c.x + 0.4, y: majlis.c.y, z: 2.7 });
await setField(page, 'hvac.equipment', 'AC1', 'ratedInputW', 1800);
await page.click('[data-link="AC1"]'); await waitFresh(page);
await addRow(page, 'hvac.zones');
await setField(page, 'hvac.zones', 'Z1', 'roomId', majlis.id); await setField(page, 'hvac.zones', 'Z1', 'equipmentId', 'AC1');
await page.click('[data-section="hvac.zones"] [data-demo]'); await waitFresh(page);
const hv = await page.locator('[data-calcs=hvac] tr[data-status]').evaluateAll(rs => rs.map(r => [r.cells[0].innerText, r.dataset.status]));
check('مكاسب حرارية محسوبة من مدخلات المناخ والغلاف المعلنة افتراضًا', hv.some(([id, st]) => id === 'M-Q-Z1' && st === 'CALCULATED'), hv);
await snapEl(page, desktop, '[data-plan-card]', '20-hvac-layer'); await snap(page, desktop, '21-hvac-tables');

// ———————————————————————————————— 4) الصحي: جهاز، منهل خارج المبنى، صرف بمنسوب لا يصل ← BLOCKED
await tab(page, 'plumbing');
await page.click('[data-tab="coordination"]'); await page.selectOption('[data-section="domains"] tr[data-row="L1"] [data-field="mode"]', 'plot'); await waitFresh(page); await tab(page, 'plumbing');
await placeAt(page, { group: 0, kind: 'WC', x: bath.c.x, y: bath.c.y, z: 0 });
const outside = await page.evaluate(() => { const b = globalThis.__mizanSystems.bbox('L1'); return { x: b.minX - 0.9, y: (b.minY + b.maxY) / 2 }; });
const before = (await st(page)).inputs;
await page.click('[data-mode=add]'); await page.selectOption('#grpSel', '1'); await page.selectOption('#kindSel', 'MANHOLE'); if (await page.isChecked('#outsideChk')) await page.click('#outsideChk');
await page.locator('#plan').scrollIntoViewIfNeeded(); const op = await page.evaluate(([X, Y]) => globalThis.__mizanSystems.screenPoint(X, Y), [outside.x, outside.y]);
if (op) { await page.mouse.click(op.x, op.y); await page.waitForTimeout(300); }
const rejected = await page.locator('#planHint').getAttribute('data-rejected');
check('النقر خارج الغرف دون «خارج الغرف» يُرفض برسالة ولا يُضاف جهاز', rejected === 'DEVICE_OUTSIDE_ROOMS' && JSON.stringify((await st(page)).inputs) === JSON.stringify(before), { rejected, op, hint: await page.locator('#planHint').innerText() });
await snapEl(page, desktop, '[data-plan-card]', '30-outside-rejected');
await placeAt(page, { group: 1, kind: 'MANHOLE', x: outside.x, y: outside.y, z: -0.6, outside: true });
await addRow(page, 'plumbing.connections');
for (const [f, v] of [['system', 'sanitary'], ['fromId', 'WC1'], ['toId', 'MH1'], ['flowM3S', 0.001], ['velocityMS', 0.8], ['startInvertM', -0.3], ['endInvertM', -0.95], ['slope', 0.02], ['routing.widthM', 0.11], ['routing.heightM', 0.11], ['routing.clearanceM', 0.01]]) await setField(page, 'plumbing.connections', 'PC1', f, v);
const pr = await page.locator('[data-schedule="plumbing-connections"] tbody tr').first().innerText();
check('صرف لا يصل منسوب المنهل يظهر «متعذر BLOCKED» مع رسالة فرق المناسيب', /BLOCKED/.test(pr) && await page.locator('[data-issues=plumbing] [data-code=OUTFALL_INVERT_MISMATCH]').count() === 1, pr.replace(/\s+/g, ' '));
await snapEl(page, desktop, '[data-plan-card]', '40-plumbing-layer-blocked'); await snap(page, desktop, '41-plumbing-tables');

// ———————————————————————————————— 5) الحريق والتيار الخفيف والشمسية
for (const [d, k1, k2] of [['fire', 'FIRE_ALARM_PANEL', 'SMOKE_DETECTOR'], ['low_current', 'DATA_RACK', 'DATA_OUTLET'], ['solar', 'INVERTER', 'PV_MODULE']]) {
  await tab(page, d);
  await placeAt(page, { kind: k1, x: kitchen.c.x + 0.3, y: kitchen.c.y + 0.3, z: 1.4 });
  await placeAt(page, { kind: k2, x: living.c.x + 0.3, y: living.c.y + 0.3, z: d === 'fire' ? 3 : 0.4 });
  const ids2 = (await st(page)).inputs.services[d].devices.map(x => x.id);
  await addRow(page, d + '.connections');
  const cid = await lastDevice(page, d + '.connections');
  for (const [f, v] of [['fromId', ids2[0]], ['toId', ids2[1]], ['routing.routeHeightM', 2.6], ['routing.widthM', 0.02], ['routing.heightM', 0.02], ['routing.clearanceM', 0.02]]) await setField(page, d + '.connections', cid, f, v);
  if (d === 'solar') { await addRow(page, 'solar.capacity'); await setField(page, 'solar.capacity', '0', 'panelCount', 2); await setField(page, 'solar.capacity', '0', 'wattsPerPanel', 450); }
  const routes = await page.locator(`[data-routes=${d}] tbody tr`).count();
  check(`${d}: عنصران ومسار معروض في الطبقة والجدول`, routes >= 1, routes);
  await snapEl(page, desktop, '[data-plan-card]', `50-${d}-layer`);
}

// ———————————————————————————————— 6) دوران ورايزر (إن وُجد دور ثانٍ فعلي)
if (levels > 1) {
  await tab(page, 'coordination');
  await page.evaluate(() => { document.querySelector('[data-section="risers"]').open = true; });
  const fromOpt = await page.locator('#riserFrom option').evaluateAll(o => o.map(x => x.value));
  await page.selectOption('#riserFrom', fromOpt.includes('WC1') ? 'WC1' : fromOpt[0]); await page.selectOption('#riserLevel', 'L2');
  await page.click('[data-riser-pair]'); await page.waitForTimeout(300); await waitFresh(page).catch(() => {});
  const ok = (await st(page)).inputs.services.risers?.length === 1;
  const msg = ok ? 'رايزر مضاف' : await page.locator('.toast').last().innerText().catch(() => '');
  check('عقدة مقابلة في الدور الثاني ورايزر بمناسيب فعلية (أو رفض موثق إن لم تقع النقطة في غرفة علوية)', ok || /النقطة المقابلة/.test(msg), msg);
  await level(page, 'L2'); await tab(page, 'plumbing'); await snapEl(page, desktop, '[data-plan-card]', '60-plumbing-L2-riser'); await level(page, 'L1');
}

// ———————————————————————————————— 7) التنسيق والتعارضات
await tab(page, 'coordination');
const inter = await page.locator('[data-interfaces] tbody tr').first().innerText();
check('ربط حمل التكييف بالكهرباء: MATCHED_SUPPLIED_INPUT', /AC1[\s\S]*MATCHED_SUPPLIED_INPUT/.test(inter), inter.replace(/\s+/g, ' '));
check('رسالة «عدم اكتشاف تعارض لا يعني اكتمال المراجعة» ظاهرة', await page.locator('[data-no-clash-note]').first().isVisible());
await snapEl(page, desktop, '[data-plan-card]', '70-coordination-combined'); await snap(page, desktop, '71-coordination-tables');

// ———————————————————————————————— 8) القِدَم: إيقاف الحساب التلقائي ثم نقل جهاز ← قديمة ويُمنع التصدير
await tab(page, 'electrical');
await page.uncheck('#autoCalc');
const fresh0 = await st(page);
await page.click('[data-mode=move]');
const db = fresh0.inputs.services.electrical.panels[0].position;
await page.waitForTimeout(400); await page.locator('#plan').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
const p1 = await page.evaluate(([X, Y]) => globalThis.__mizanSystems.screenPoint(X, Y), [db.x, db.y]); await page.mouse.click(p1.x, p1.y);
const p2 = await page.evaluate(([X, Y]) => globalThis.__mizanSystems.screenPoint(X, Y), [kitchen.c.x - 0.4, kitchen.c.y - 0.2]); await page.mouse.click(p2.x, p2.y);
await page.waitForTimeout(300);
const stale = await st(page);
const disabledAll = await page.locator('[data-export]').evaluateAll(b => b.every(x => x.disabled));
check('نقل جهاز يجعل النتيجة قديمة فورًا ويُعطّل كل أزرار التصدير', stale.fresh.fresh === false && stale.fresh.reason === 'INPUTS_CHANGED' && disabledAll && await page.locator('[data-state=stale]').isVisible(), stale.fresh);
await snap(page, desktop, '80-stale-export-blocked', false);
await page.click('#btnRecalc'); await waitFresh(page); await page.check('#autoCalc');
const after = await st(page);
check('إعادة الحساب تعطي بصمة مدخل جديدة وتعيد التصدير', after.inputHash !== fresh0.inputHash && after.fresh.fresh, [fresh0.inputHash?.slice(0, 10), after.inputHash?.slice(0, 10)]);

// ———————————————————————————————— 9) تعديل المخطط المعماري (مسار المرسم) في نافذة أخرى ← إعادة ربط وحساب
const ctx2Page = await ctx.newPage();
await ctx2Page.goto(BASE + '/home.html');
await ctx2Page.evaluate(async () => {
  const { applyCommand, parseDoc, serialize } = await import('./draw/doc.mjs');
  const s = JSON.parse(localStorage.getItem('mizan.design.session.v1')), d = s.designs[s.current], doc = parseDoc(d.doc);
  const lbl = doc.labels.find(l => l.level === doc.levels[0].id);
  d.doc = serialize(applyCommand(doc, { type: 'update', id: lbl.id, patch: { name: lbl.name + ' (معدّل)' } }).doc);
  localStorage.setItem('mizan.design.session.v1', JSON.stringify(s));
});
await ctx2Page.close();
await page.bringToFront(); await page.evaluate(() => dispatchEvent(new Event('focus'))); await page.waitForTimeout(500); await waitFresh(page);
const re = await st(page);
check('تعديل الغرفة في المخطط يغيّر بصمة المصدر ويعيد الحساب قبل أي تصدير', re.sourceHash !== s0.sourceHash && re.fresh.fresh, [s0.sourceHash.slice(0, 10), re.sourceHash.slice(0, 10)]);

// ———————————————————————————————— 10) التصدير: كل صيغة تُنزَّل وتُفحص
for (const t of ['electrical', 'plumbing', 'coordination']) {
  await tab(page, t);
  const btns = await page.locator('[data-export]').evaluateAll(b => b.map(x => x.dataset.export));
  for (const key of btns) {
    await waitFresh(page);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click(`[data-export="${key}"]`)]);
    const path = join(OUT, 'downloads', `${t}-${dl.suggestedFilename()}`); await mkdir(dirname(path), { recursive: true }); await dl.saveAs(path);
    const text = await readFile(path, 'utf8'), kind = key.split(':')[0];
    let ok = text.length > 0, why = `${text.length} بايت`;
    if (kind === 'svg') { const parsed = await page.evaluate(t => { const d = new DOMParser().parseFromString(t, 'image/svg+xml'); return !d.querySelector('parsererror') && d.documentElement.tagName === 'svg'; }, text); ok &&= parsed && /PRELIMINARY/.test(text); why += ' XML صالح'; }
    if (kind === 'dxf') { ok &&= ['SECTION', 'HEADER', '$INSUNITS', 'ENTITIES', 'EOF'].every(m => text.includes(m)); why += ' أقسام DXF'; }
    if (kind === 'csv') { ok &&= text.charCodeAt(0) === 0xfeff && /^﻿"[a-zA-Z]/.test(text); why += ' BOM+ترويسة'; }
    if (kind.startsWith('json')) { try { const j = JSON.parse(text); ok &&= kind !== 'json-result' || (j.constructionApproved === false && j.codeCompliance === 'NOT_EVALUATED'); why += ' JSON'; } catch { ok = false; } }
    log.downloads.push({ tab: t, key, file: path.replace(ROOT + '/', ''), bytes: text.length, ok });
    check(`تنزيل ${t}/${key}`, ok, why);
  }
}

// ———————————————————————————————— 11) الجوال 390×844: اللقطات لكل تخصص ولا تمرير أفقي
const state = await ctx.storageState();
await ctx.close();
for (const vp of [mobile, desktop]) {
  const c2 = await browser.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500, deviceScaleFactor: vp.width < 500 ? 2 : 1, locale: 'ar-SA', storageState: state });
  await c2.route('**/*', route => { const u = new URL(route.request().url()); return u.hostname === '127.0.0.1' ? route.continue() : route.abort(); });
  const p = await c2.newPage(); p.setDefaultTimeout(240000); p.on('pageerror', e => log.errors.push(`[${vp.width}] pageerror: ${e.message}`));
  await p.goto(BASE + '/systems.html'); await waitFresh(p);
  const rtl = await p.evaluate(() => ({ dir: document.documentElement.dir, computed: getComputedStyle(document.body).direction }));
  check(`RTL عربي (${tag(vp)})`, rtl.dir === 'rtl' && rtl.computed === 'rtl', rtl);
  for (const t of ['electrical', 'hvac', 'plumbing', 'fire', 'low_current', 'solar', 'coordination']) {
    await tab(p, t); const h = await noHScroll(p, vp.width);
    check(`لا تمرير أفقي للصفحة (${tag(vp)}/${t})`, h.ok, h);
    if (vp === mobile) { await snapEl(p, vp, '[data-plan-card]', `m-${t}-layer`); await snapEl(p, vp, '[data-tables]', `m-${t}-tables`); await snapEl(p, vp, '[data-issues]', `m-${t}-issues`); }
  }
  if (vp === mobile) await snap(p, vp, 'm-full-page');
  await c2.close();
}
log.finishedAt = new Date().toISOString(); log.seconds = Math.round((Date.now() - t0) / 1000);
log.summary = { pass: log.checks.filter(c => c.ok).length, fail: log.checks.filter(c => !c.ok).length, errors: log.errors.length, blockedExternal: [...new Set(log.blocked)] };
await writeFile(join(OUT, 'browser-run.json'), JSON.stringify(log, null, 2) + '\n');
console.log(JSON.stringify(log.summary));
await browser.close(); server.close();
process.exit(log.summary.fail || log.errors.length ? 1 : 0);
