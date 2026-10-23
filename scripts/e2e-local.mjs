// تجربة المسار الحي محليًا في متصفح حقيقي (بند بوابة النشر «تجربة المسار الحي في متصفح»، محليًا لا على الموقع):
//   الوركر نفسه (worker/index.mjs ← worker/server.mjs) يخدم dist/client كما في الإنتاج (assets + run_worker_first)،
//   بلا أي شبكة إلى Cloudflare أو مزود الذكاء: لا مفاتيح ولا رمز دخول، فيُختبر الفهم المحلي فقط.
//   كل طلب خارج 127.0.0.1 يُمنع في المتصفح ويُسجَّل.
// الاستعمال: node scripts/e2e-local.mjs [outDir] [--cases C1,C7,C10] [--devices desktop,mobile] [--no-build]
//   الافتراضي outDir = evidence/e2e/local؛ اللقطات وسجل JSON (e2e.json) فيه.
import http from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').match(/^--(cases|devices|html-handling)$/));
const OUT = resolve(ROOT, pos[0] || 'evidence/e2e/local');
const CASE_IDS = opt('cases', 'C1,C7,C10').split(',');
const DEVICES = { desktop: { width: 1400, height: 900 }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const DEVICE_IDS = opt('devices', 'desktop,mobile').split(',');
const HTML_HANDLING = opt('html-handling', 'auto-trailing-slash'); // افتراضي Cloudflare Workers Assets (wrangler.toml لا يغيّره)
const EDITS = ['المجلس أصغر', 'غيّر الواجهة حجر', 'احذف المكتب', 'رجّع مثل أول'];
await mkdir(OUT, { recursive: true });

if (!argv.includes('--no-build')) execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'ignore' });
const CLIENT = join(ROOT, 'dist/client');
const { CASES } = await import('./acceptance-cases.mjs');
const { docRooms } = await import('../dist/rules.mjs');
const worker = (await import('../worker/index.mjs')).default;

// ------------------------------------------------------------------------------------------ الخادم المحلي = الوركر
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream' };
const isFile = async p => { try { return (await stat(p)).isFile(); } catch { return false; } };
/** محاكاة ربط ASSETS: ملفات dist/client، و html_handling «auto-trailing-slash» (/x.html ← 307 إلى /x، و/x يخدم x.html). */
const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url), p = decodeURIComponent(url.pathname);
    if (HTML_HANDLING === 'auto-trailing-slash') {
      if (/\/index\.html$/.test(p)) return new Response(null, { status: 307, headers: { location: p.replace(/index\.html$/, '') + url.search } });
      if (p.endsWith('.html')) return new Response(null, { status: 307, headers: { location: p.slice(0, -5) + url.search } });
    }
    const tries = p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html'];
    for (const t of tries) {
      const f = normalize(join(CLIENT, t));
      if (!f.startsWith(CLIENT)) break;
      if (await isFile(f)) return new Response(request.method === 'HEAD' ? null : await readFile(f), { status: 200, headers: { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' } });
    }
    return new Response('Not found', { status: 404 });
  },
};
const ENV = { ASSETS }; // بلا ANTHROPIC_API_KEY ولا MIZAN_ACCESS_CODE ولا DB: المسار المحلي وحده
const apiCalls = [];
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    // run_worker_first = ["/", "/api/*"]؛ البقية ملفات ثابتة مباشرة (كما في wrangler.toml)
    const viaWorker = url.pathname === '/' || url.pathname.startsWith('/api/');
    if (url.pathname.startsWith('/api/')) apiCalls.push({ method: req.method, path: url.pathname });
    const r = viaWorker ? await worker.fetch(request, ENV, { waitUntil() {} }) : await ASSETS.fetch(request);
    const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(r.status, headers); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e?.stack || e)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ------------------------------------------------------------------------------------------ المتصفح
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const statsPage = await (await browser.newContext()).newPage();
/** إحصاء صورة PNG (لقطة عنصر): عدد الألوان المكمّمة والانحراف المعياري للإضاءة — «غير فارغة» إن تنوّعت. */
async function imageStats(buf) {
  return statsPage.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
    const set = new Set(); let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { set.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)); const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; n++; }
    const m = s / n; return { w: c.width, h: c.height, colors: set.size, std: Math.round(Math.sqrt(Math.max(0, s2 / n - m * m)) * 10) / 10 };
  }, buf.toString('base64'));
}
const nonBlank = st => st.colors >= 24 && st.std >= 8;
const r2 = v => Math.round(v * 100) / 100;

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: !!viewport.isMobile, hasTouch: !!viewport.hasTouch, deviceScaleFactor: viewport.deviceScaleFactor || 1, locale: 'ar-SA' });
  const blocked = [], errors = [], ignored = [];
  await ctx.route('**/*', route => { const u = new URL(route.request().url()); if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue(); blocked.push(u.host); return route.abort(); });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url || '';
    // الخطوط الخارجية (fonts.googleapis) ممنوعة عمدًا: فشل تحميلها ليس خطأ في الموقع
    if (/net::ERR_FAILED|ERR_BLOCKED/.test(m.text()) && (!loc || !loc.startsWith(BASE))) { ignored.push(m.text()); return; }
    errors.push('console: ' + m.text() + (loc ? ' @' + loc.replace(BASE, '') : ''));
  });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) errors.push(`http ${r.status()}: ${r.url().replace(BASE, '')}`); });
  page.on('requestfailed', r => { if (r.url().startsWith(BASE)) errors.push('requestfailed: ' + r.url().replace(BASE, '') + ' ' + (r.failure()?.errorText || '')); });
  page.on('dialog', d => d.accept());
  return { ctx, page, blocked, errors, ignored };
}
const noHScroll = page => page.evaluate(() => { const e = document.scrollingElement; return { ok: e.scrollWidth <= window.innerWidth + 1, scrollWidth: e.scrollWidth, innerWidth: window.innerWidth }; });
const rtlOf = page => page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, computed: getComputedStyle(document.body).direction }));

/** الغرف بالاسم والدور ومستطيلها — لقياس «الغرف التي لم تُطلب بقيت كما هي». */
function roomMap(docJson) {
  const { rooms } = docRooms(typeof docJson === 'string' ? JSON.parse(docJson) : docJson);
  return new Map(rooms.map(r => [r.name + '@' + r.li, r]));
}
function preserved(beforeDoc, afterDoc, reply) {
  const A = roomMap(beforeDoc), B = roomMap(afterDoc);
  const named = new Set([...(reply?.changed || []), ...(reply?.fallback?.changed || [])].flatMap(c => [c.name, c.nameBefore]).filter(Boolean));
  const moved = [];
  for (const [k, a] of A) {
    if (named.has(a.name)) continue;
    const b = B.get(k);
    if (!b) { moved.push({ room: a.name, what: 'removed' }); continue; }
    const d = Math.max(Math.abs(a.x0 - b.x0), Math.abs(a.x1 - b.x1), Math.abs(a.y0 - b.y0), Math.abs(a.y1 - b.y1));
    if (d > 0.02) moved.push({ room: a.name, what: 'moved', by: r2(d) });
  }
  return { ok: moved.length === 0, kept: A.size - named.size - moved.length, declaredChanged: [...named], undeclared: moved };
}

// ------------------------------------------------------------------------------------------ تشغيل حالة على جهاز
const log = { startedAt: new Date().toISOString(), base: BASE, htmlHandling: HTML_HANDLING, server: 'worker/index.mjs (assets = dist/client، بلا أسرار)', runs: [] };
async function run(C, devId) {
  const vp = DEVICES[devId], tag = `${C.id}-${devId}`, shot = n => join(OUT, `${tag}-${n}.png`);
  const { ctx, page, blocked, errors, ignored } = await newPage(vp);
  const checks = [], shots = [];
  const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} [${tag}] ${name}${detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 220) : ''}`); };
  const snap = async (n, full = false) => { await page.screenshot({ path: shot(n), fullPage: full }); shots.push(shot(n).replace(ROOT + '/', '')); };
  const hscroll = async where => { if (devId !== 'mobile') return; const h = await noHScroll(page); check(`لا تمرير أفقي (${where})`, h.ok, h); };
  const t0 = Date.now(), times = {};
  try {
    // 1) الجذر عبر الوركر ← الصفحة الرئيسية
    await page.goto(BASE + '/');
    await page.waitForSelector('#start');
    check('الجذر «/» يمر بالوركر ويعرض الصفحة الرئيسية', await page.locator('#brandName').innerText() === 'الميزان الهندسي', page.url().replace(BASE, ''));
    const rtl = await rtlOf(page); check('RTL وعربية (الرئيسية)', rtl.dir === 'rtl' && rtl.lang === 'ar' && rtl.computed === 'rtl', rtl);
    await page.waitForTimeout(1200); await snap('1-welcome'); await hscroll('الاستقبال');
    // 2) الأرض
    await page.click('#start');
    await page.fill('#landLength', String(C.land.length)); await page.fill('#landWidth', String(C.land.width));
    if ((C.land.floors || 1) > 1) await page.selectOption('#landFloors', String(C.land.floors));
    for (const s of C.land.streets) await page.check(`input[data-kind=street][value=${s}]`);
    for (const s of C.land.entries) await page.check(`input[data-kind=entry][value=${s}]`);
    await snap('2-land'); await hscroll('الأرض');
    await page.click('#landForm button[type=submit]');
    await page.waitForSelector('#stageShara:not([hidden])');
    // 3) شرعاء: حديث حر بنص الحالة، بلا رمز دخول (الفهم المحلي)
    await page.click('#chat .chip:has-text("أتحدث بحرية")');
    await page.fill('#chat form.free textarea', C.text);
    check('حقل رمز الذكاء فارغ (المسار المحلي)', (await page.locator('#chat form.free input[type=password]').inputValue()) === '');
    await page.click('#chat form.free button[type=submit]');
    await page.waitForSelector('#chat form.counts');
    const understood = await page.locator('#chat ul.understood li').allInnerTexts();
    const chatTxt = await page.locator('#chat').innerText();
    check('شرعاء تعرض ما فهمته من الكلام', understood.length >= 3, understood.slice(0, 6).join(' | '));
    if (C.id === 'C7') check('سؤال التعارض يظهر في المحادثة قبل التوليد (C7)', /قبل التصميم أبي أتأكد منك/.test(chatTxt) && /من ضمن عدد غرف النوم/.test(chatTxt), chatTxt.split('\n').filter(l => /أتأكد|من ضمن/.test(l)).join(' | '));
    for (const [k, v] of Object.entries(C.counts)) await page.fill(`#chat form.counts input[name=${k}]`, String(v));
    await snap('3-shara', devId === 'mobile'); await hscroll('شرعاء');
    await page.click('#chat form.counts .cta');
    await page.click('#chat .cta:has-text("توليد التصميم")', { timeout: 240000 }); // (r14) التوليد يحجز الخيط الرئيسي حتى ينتهي (الدوران ≈ 40–60 ث)
    const tg = Date.now();
    await page.waitForURL(/\/design(\.html)?$/, { timeout: 240000 });
    await page.waitForSelector('#plan', { timeout: 60000 }); await page.waitForTimeout(800);
    times.generateMs = Date.now() - tg;
    // 4) صفحة التصميم
    check('صفحة التصميم تعرض «تصميمك الأولي»', (await page.locator('h1').innerText()).trim() === 'تصميمك الأولي');
    const rtl2 = await rtlOf(page); check('RTL وعربية (التصميم)', rtl2.dir === 'rtl' && rtl2.computed === 'rtl', rtl2);
    const S = await page.evaluate(() => { const s = globalThis.__mizanDesign.session; return { alts: (s.alternatives || []).length, info: s.alternativesInfo || null, conflicts: (s.conflicts || []).map(c => c.question_ar), review: s.designs[0].review ? { passed: s.designs[0].review.passed, gates: (s.designs[0].review.gates || []).length } : null }; });
    const altCard = page.locator('#alts');
    const altTxt = (await altCard.count()) ? await altCard.innerText() : '';
    check('بطاقة البدائل ظاهرة بعددها مقابل المطلوب', (await altCard.count()) > 0 && await altCard.isVisible() && new RegExp(`${S.alts}\\s*من\\s*${S.info?.requested ?? 4}`).test(altTxt.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))), altTxt.split('\n').slice(0, 3).join(' | '));
    const altButtons = await page.locator('#alts [data-alt]').count();
    check('زر لكل بديل', altButtons === S.alts, `${altButtons} زر، ${S.alts} بديل`);
    if (S.alts < (S.info?.requested ?? 4)) check('سبب النقص عن العدد المطلوب معروض', !!S.info?.shortfall_ar && (await page.locator('#alts .shortfall').count()) > 0 && /عُرض/.test(await page.locator('#alts .shortfall').innerText()), (S.info?.shortfall_ar || '').slice(0, 200));
    check('أسباب رفض المرشحين معروضة', S.info?.rejectedCount === 0 || (await page.locator('#alts .rejected li').count()) > 0, `${S.info?.rejectedCount ?? '?'} مرفوض`);
    const rv = page.locator('#review');
    check('جدول المراجعة المعمارية (البوابات) ظاهر', (await rv.count()) > 0 && await rv.isVisible() && (await page.locator('#review tbody tr').count()) >= 5, S.review);
    const led = await page.locator('#ledger').innerText();
    check('سجل «هل نُفّذ طلبك؟» ظاهر ببنوده', /هل نُفّذ طلبك/.test(led) && (await page.locator('#ledger li').count()) >= 1, led.split('\n').slice(0, 2).join(' | '));
    if (C.id === 'C7') check('سؤال التعارض معروض في صفحة التصميم (C7)', (await page.locator('#ledger [data-conflict]').count()) > 0, S.conflicts.join(' | '));
    const planStats = await imageStats(await page.locator('#plan').screenshot());
    check('المسقط مرسوم (canvas غير فارغ)', nonBlank(planStats), planStats);
    await snap('4-design'); await snap('4-design-full', true); await hscroll('التصميم');
    // البديل الثاني (إن وجد) يُعرض ثم نعود للأول
    if (altButtons > 1) {
      await page.click('#alts [data-alt="1"]'); await page.waitForTimeout(500);
      const cur = await page.evaluate(() => { const s = globalThis.__mizanDesign.session; return { cur: s.current, doc: s.designs[s.current].doc === s.alternatives[1].doc }; });
      check('عرض البديل الثاني من بطاقة البدائل', cur.doc, cur);
      await snap('5-alt2');
      await page.click('#alts [data-alt="0"]'); await page.waitForTimeout(300);
    }
    // 5) جلسة تعديل من أربعة أدوار في نافذة شرعاء
    const turns = [];
    for (const text of EDITS) {
      const before = await page.evaluate(() => { const s = globalThis.__mizanDesign.session; return { n: s.designs.length, doc: s.designs[s.current].doc, cur: s.current }; });
      await page.click('#btnAnother'); await page.waitForSelector('#shara:not([hidden])');
      await page.fill('#fbText', text); const te = Date.now(); await page.click('#fbGo');
      await page.waitForFunction(n => globalThis.__mizanDesign.session.designs.length > n || (!document.getElementById('fbGo').disabled && document.getElementById('fbStatus').textContent && !/أطبّق|أفهم/.test(document.getElementById('fbStatus').textContent)), before.n, { timeout: 240000 });
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => { const s = globalThis.__mizanDesign.session; const d = s.designs[s.current]; return { n: s.designs.length, doc: d.doc, reply: d.feedback?.reply || null, status: document.getElementById('fbStatus').textContent, open: !document.getElementById('shara').hidden }; });
      const turn = { text, ms: Date.now() - te };
      if (after.n > before.n) {
        const r = after.reply || {}, ui = (await page.locator('#sharaReply').count()) ? await page.locator('#sharaReply').innerText() : '';
        turn.mode = r.mode || (r.fallback ? 'regenerated' : 'generated'); turn.done = r.done || []; turn.failed = (r.failed || []).map(f => f.text + (f.why ? ' — ' + f.why : '')); turn.already = (r.already || []).map(f => f.text + (f.why ? ' — ' + f.why : ''));
        turn.changed = [...(r.changed || []), ...(r.fallback?.changed || [])].filter(c => c.kind !== 'openings').map(c => c.text_ar); turn.summary = r.summary_ar || r.fallback?.said_ar || ''; turn.ui = ui;
        const listed = [...turn.done, ...(r.failed || []).map(f => f.text), ...(r.already || []).map(f => f.text)].every(t => ui.includes(t)) && turn.changed.every(t => ui.includes(t));
        check(`«${text}»: رد شرعاء يسرد ما نُفّذ/لم يُنفَّذ/تغيّر`, !!ui && listed && (turn.done.length + turn.failed.length + turn.already.length) > 0, ui.split('\n').slice(0, 5).join(' | '));
        check(`«${text}»: لا يُقال «لم أفهم» عن طلب نُفّذ`, !(turn.done.length && (r.unclear || []).length), (r.unclear || []).join('، '));
        const pr = preserved(before.doc, after.doc, r); turn.preserved = pr;
        if (turn.mode !== 'regenerated' && turn.mode !== 'restore') check(`«${text}»: الغرف غير المطلوبة بقيت كما هي`, pr.ok, pr.ok ? `${pr.kept} غرفة بقيت، المعلن تغيّره: ${pr.declaredChanged.join('، ') || '—'}` : pr.undeclared);
        if (turn.mode === 'restore') { const first = await page.evaluate(() => globalThis.__mizanDesign.session.designs[0].doc); const pf = preserved(first, after.doc, null); check(`«${text}»: رجع إلى التصميم الأول مقيسًا`, pf.ok, pf.ok ? 'كل الغرف بمستطيلات التصميم الأول' : pf.undeclared); turn.vsFirst = pf; }
        const ps = await imageStats(await page.locator('#plan').screenshot()); check(`«${text}»: المسقط بعد التعديل مرسوم`, nonBlank(ps), ps);
      } else {
        turn.mode = 'no-new-design'; turn.status = after.status;
        check(`«${text}»: لا تصميم جديد، وشرعاء تشرح السبب`, !!after.status && after.open, after.status);
        await page.click('#fbClose');
      }
      turns.push(turn);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(700);
      await snap(`6-edit-${turns.length}`);
      if (await page.locator('#sharaReply').count()) { await page.locator('#sharaReply').screenshot({ path: shot(`6-edit-${turns.length}-reply`) }); shots.push(shot(`6-edit-${turns.length}-reply`).replace(ROOT + '/', '')); }
    }
    // 6) الاعتماد ← العرض ثلاثي الأبعاد
    await page.click('#btnApprove');
    await page.waitForURL(/\/view3d(\.html)?$/, { timeout: 60000 });
    await page.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const built = await page.evaluate(() => !!globalThis.__mizanViewer?.built);
    const st3 = await imageStats(await page.locator('#threeHost').screenshot());
    check('العرض ثلاثي الأبعاد يُبنى ويُرسم (canvas غير فارغ)', built && nonBlank(st3) && (await page.locator('#threeHost canvas').count()) > 0, st3);
    const rtl3 = await rtlOf(page); check('RTL وعربية (ثلاثي الأبعاد)', rtl3.dir === 'rtl' && rtl3.computed === 'rtl', rtl3);
    await snap('7-3d'); await hscroll('ثلاثي الأبعاد');
    log.runs.push({ case: C.id, device: devId, viewport: vp, times, turns });
    const fac = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('mizan.studio.doc.v1') || 'null')?.finish?.facade || null; } catch { return null; } });
    log.runs.at(-1).approvedFacade = fac;
  } catch (e) {
    check('اكتمل المسار دون انقطاع', false, String(e.message || e).slice(0, 400));
    try { await snap('x-failure'); } catch { /* الصفحة أُغلقت */ }
    log.runs.push({ case: C.id, device: devId, viewport: vp, times, aborted: String(e.message || e) });
  }
  const run = log.runs.at(-1);
  check('بلا أخطاء كونسول/صفحة/طلبات محلية', errors.length === 0, errors.slice(0, 6).join(' | '));
  Object.assign(run, { ms: Date.now() - t0, checks, passed: checks.every(c => c.ok), errors, ignoredExternal: ignored.length, blockedHosts: [...new Set(blocked)], screenshots: shots });
  await ctx.close();
}

for (const id of CASE_IDS) {
  const C = CASES.find(c => c.id === id); if (!C) throw Error('حالة غير معروفة: ' + id);
  for (const dev of DEVICE_IDS) await run(C, dev);
}
log.apiCalls = apiCalls;
log.finishedAt = new Date().toISOString();
log.passed = log.runs.every(r => r.passed);
log.table = log.runs.map(r => ({ case: r.case, device: r.device, passed: r.passed, failed: r.checks.filter(c => !c.ok).map(c => c.name) }));
await writeFile(join(OUT, 'e2e.json'), JSON.stringify(log, null, 1));
console.log(`\n${log.runs.filter(r => r.passed).length}/${log.runs.length} تشغيلات ناجحة؛ طلبات /api: ${apiCalls.length}؛ السجل: ${join(OUT, 'e2e.json').replace(ROOT + '/', '')}`);
await browser.close(); server.close();
process.exit(log.passed ? 0 : 1);
