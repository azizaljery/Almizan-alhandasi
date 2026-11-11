// اختبار متصفح لميزة «صورة معمارية احترافية» بخادم محلي ومزوّد صور وهمي (لا يتصل بـ Workers AI ولا يختبر النموذج الحقيقي).
// الخادم (scripts/photo-mock-server.mjs): ملفات dist/client + معالج /api/photo الحقيقي من worker/photo.mjs مع AI وهمي:
//   echo  : يعيد اللقطة المرسلة نفسها (هندسة مطابقة ← الفحص ينجح)
//   fixed : يعيد صورة ثابتة لتصميم آخر (tests/fixtures/photo-sample.jpg) ← الفحص يفشل ← إعادة تلقائية واحدة وتنبيه
//   off   : بلا ربط AI ← الزر يبقى مخفيًا
// الاستعمال: node scripts/build.mjs && PLAYWRIGHT_MODULE=… node scripts/photo-pro-browser-check.mjs   (OUT لمجلد اللقطتين، PORT للمنفذ)
import fs from 'node:fs'; import path from 'node:path';
import { PHOTO_LIMITS } from '../worker/photo.mjs';
import { startMockServer, ROOT } from './photo-mock-server.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const OUT = process.env.OUT || path.join(ROOT, 'evidence/photo-pro'); fs.mkdirSync(OUT, { recursive: true });
const DOC = fs.readFileSync(path.join(ROOT, 'tests/fixtures/flow-30x20-doc.json'), 'utf8');
const server = await startMockServer({ port: +process.env.PORT || 8886 }), BASE = server.base, M = server.state;

const results = [], errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== '' ? '  — ' + String(detail).slice(0, 220) : '')); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
async function open(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}), acceptDownloads: true });
  await ctx.addInitScript(doc => { try { localStorage.setItem('mizan.studio.doc.v1', doc); } catch {} }, DOC);
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`${BASE}/view3d.html`, { waitUntil: 'load' });
  return { ctx, page };
}
// التصيير البرمجي (swiftshader) يجعل اللقطة العالية الكاملة تستغرق دقائق؛ الاختبار يستدعي الدالة الحقيقية نفسها بدقة وعيّنات أقل.
const facadeReady = async page => {
  await page.waitForFunction(() => typeof document.getElementById('facadeFrame')?.contentWindow?.__facadeHQ === 'function', null, { timeout: 180000 });
  await page.evaluate(() => { const w = document.getElementById('facadeFrame').contentWindow, hq = w.__facadeHQ; w.__facadeHQ = o => hq({ ...o, scale: 1, samples: 8 }); });
};
const resultShown = page => page.waitForFunction(() => { const d = document.getElementById('ppDialog'); return d?.open && d.querySelector('.pp-wait').hidden && !!d.querySelector('.pp-after').getAttribute('src') && !d.querySelector('.pp-after').hidden; }, null, { timeout: 240000 });
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

try {
  // ------------------------------------------------------------------ سطح المكتب (echo)
  let { ctx, page } = await open({ width: 1366, height: 900 });
  await page.waitForSelector('#photoPro:not([hidden])', { timeout: 60000 });
  check('الزر ظاهر عندما تكون الخدمة مهيأة', await page.isVisible('#photoPro'), await page.textContent('#photoPro'));
  await facadeReady(page);
  await page.click('#photoPro');
  await page.waitForFunction(() => /أحوّل مجسم تصميمك إلى صورة معمارية/.test(document.querySelector('#ppDialog .pp-wait b')?.textContent || ''), null, { timeout: 240000 });
  const w = await page.evaluate(() => ({ open: document.getElementById('ppDialog').open, msg: document.querySelector('#ppDialog .pp-wait b').textContent, sec: document.querySelector('#ppDialog .pp-wait span').textContent, before: !!document.querySelector('#ppDialog .pp-before').getAttribute('src'), downloadDisabled: document.getElementById('ppDownload').disabled }));
  check('الانتظار: نافذة مفتوحة بنص صادق وعدّاد ثوانٍ ولقطة المجسم معروضة', w.open && /قد يستغرق حتى دقيقة/.test(w.msg) && /مضى \d+ ث/.test(w.sec) && w.before && w.downloadDisabled, w.msg + ' | ' + w.sec);
  await resultShown(page);
  const r1 = await page.evaluate(() => { const d = document.getElementById('ppDialog'), s = globalThis.__mizanPhotoPro.state; return { stamp: d.querySelector('.pp-stamp').textContent, stampVisible: d.querySelector('.pp-stamp').getBoundingClientRect().height > 10, note: d.querySelector('.pp-note').textContent, warn: d.querySelector('.pp-note').classList.contains('warn'), score: s.result.fidelity?.score, ok: s.result.fidelity?.ok, attempts: s.result.attempts, shot: [s.shot.width, s.shot.height], tags: [...d.querySelectorAll('.pp-tag')].map(t => t.textContent).join('|') }; });
  check('النتيجة: الوسم الدائم ظاهر على الصورة', r1.stampVisible && r1.stamp === 'صورة محسّنة بالذكاء الاصطناعي من مجسم تصميمك — للتصوّر لا للتنفيذ' && r1.tags === 'المجسم|الصورة');
  check('فحص الأمانة: صورة بهندسة اللقطة نفسها تجتاز بلا إعادة', r1.ok === true && r1.score >= 0.9 && r1.attempts === 1 && !r1.warn, `score ${r1.score}، محاولات ${r1.attempts}`);
  check('اللقطة المرسلة مصغّرة إلى 1536 على الأطول وتحت حد الحجم', Math.max(...r1.shot) <= 1536 && M.calls[0].bytes <= PHOTO_LIMITS.maxImageBytes, `${r1.shot.join('×')}، ${M.calls[0].bytes} بايت`);
  check('الخادم بنى البرومبت بقيود الهندسة وبطراز الواجهة المعروضة', /keep the exact building massing/.test(M.calls[0].prompt) && /Golden hour/.test(M.calls[0].prompt) && M.calls[0].model.includes('flux-2-klein-9b'), M.calls[0].prompt.slice(165, 260));
  // شريط المقارنة بلوحة المفاتيح
  await page.focus('#ppDialog .pp-range'); for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  check('شريط المقارنة يتحرك بلوحة المفاتيح', await page.evaluate(() => document.querySelector('#ppDialog .pp-cmp').style.getPropertyValue('--pp-p')) === '62%');
  await page.evaluate(() => { const r = document.querySelector('#ppDialog .pp-range'); r.value = 55; r.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, 'photo-pro-desktop.png') });
  // التحميل: ملف JPEG عليه الوسم محروقًا
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#ppDownload')]);
  const file = path.join(OUT, 'dl.tmp'); await dl.saveAs(file); const bytes = fs.readFileSync(file); fs.rmSync(file);
  check('التحميل: ملف JPEG باسم واضح', dl.suggestedFilename() === 'mizan-architectural-photo.jpg' && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes.length > 20000, `${dl.suggestedFilename()} ${bytes.length} بايت`);
  // إضاءة أخرى: الزاوية نفسها بلا التقاط جديد
  const n0 = M.calls.length; await page.click('#ppDialog .pp-seg button[data-l=night]'); await page.waitForFunction(() => !document.querySelector('#ppDialog .pp-wait').hidden); await resultShown(page);
  check('«جرّب إضاءة أخرى»: طلب جديد بإضاءة الليل للّقطة نفسها', M.calls.length === n0 + 1 && /Blue hour at night/.test(M.calls.at(-1).prompt) && M.calls.at(-1).bytes === M.calls[0].bytes && await page.getAttribute('#ppDialog .pp-seg button[data-l=night]', 'aria-pressed') === 'true');
  const n1 = M.calls.length; await page.click('#ppRedo'); await resultShown(page);
  check('«أعد التوليد»: طلب جديد ببذرة أخرى', M.calls.length === n1 + 1 && M.calls.at(-1).seed !== M.calls.at(-2).seed);
  await page.click('#ppPremium'); await resultShown(page);
  check('«جودة أعلى»: المستوى premium (FLUX.2 dev)', M.calls.at(-1).model.includes('flux-2-dev'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Esc يغلق النافذة ويعيد التركيز إلى الزر', await page.evaluate(() => !document.getElementById('ppDialog').open && document.activeElement?.id === 'photoPro'));
  check('آخر صورة محفوظة لهذا التصميم (IndexedDB)', await page.evaluate(async () => { const m = await import('./photo-pro.mjs'), v = await m.loadLastPhoto(); return !!v?.image && !!v.key && v.disclaimer === m.DISCLAIMER; }));
  // تصيير مخالف للمجسم: تنبيه + إعادة تلقائية واحدة
  M.mode = 'fixed'; const n2 = M.calls.length; await page.click('#photoPro'); await resultShown(page);
  const r2 = await page.evaluate(() => { const d = document.getElementById('ppDialog'), s = globalThis.__mizanPhotoPro.state; return { note: d.querySelector('.pp-note').textContent, warn: d.querySelector('.pp-note').classList.contains('warn'), score: s.result.fidelity?.score, ok: s.result.fidelity?.ok, attempts: s.result.attempts }; });
  check('صورة تخالف المجسم: إعادة تلقائية واحدة ثم تنبيه «قد تختلف عن تصميمك»', M.calls.length === n2 + 2 && r2.ok === false && r2.warn && /قد تختلف عن تصميمك في بعض التفاصيل/.test(r2.note) && r2.attempts === 2, `score ${r2.score}، طلبات ${M.calls.length - n2}`);
  // إغلاق أثناء الانتظار يلغي الطلب بلا خطأ
  M.mode = 'echo'; await page.click('#ppClose'); await page.click('#photoPro'); await page.waitForFunction(() => /أحوّل/.test(document.querySelector('#ppDialog .pp-wait b')?.textContent || ''), null, { timeout: 240000 });
  await page.click('#ppClose'); await page.waitForTimeout(400);
  check('الإغلاق أثناء الانتظار يلغي بلا رسالة خطأ', await page.evaluate(() => !document.getElementById('ppDialog').open && !document.querySelector('#ppDialog .pp-note').classList.contains('err')));
  // كتاب المشروع: آخر صورة لهذا التصميم تظهر في قسم المنظور بوسمها (وهي هنا الصورة المخالفة، فيظهر تنبيهها)
  await page.goto(`${BASE}/final.html`); const cap = await page.waitForSelector('#view3d .pro-photo figcaption', { timeout: 60000 }).then(h => h.textContent()).catch(() => '');
  check('المخرجات: الصورة الاحترافية لهذا التصميم في قسم المنظور بوسمها وتنبيهها', /صورة محسّنة بالذكاء الاصطناعي من مجسم تصميمك — للتصوّر لا للتنفيذ/.test(cap) && /قد تختلف عن تصميمك/.test(cap) && await page.evaluate(() => document.querySelector('#view3d .pro-photo img').naturalWidth > 100), cap);
  await ctx.close();

  // ------------------------------------------------------------------ الجوال (echo)
  ({ ctx, page } = await open({ width: 390, height: 844 }, true));
  await page.waitForSelector('#photoPro:not([hidden])', { timeout: 60000 }); await facadeReady(page);
  await page.locator('#photoPro').scrollIntoViewIfNeeded(); await page.tap('#photoPro'); await resultShown(page);
  const m = await page.evaluate(() => { const d = document.getElementById('ppDialog'), c = d.querySelector('.pp-cmp').getBoundingClientRect(), b = [...d.querySelectorAll('.pp-row .btn:not([hidden]), .pp-seg button, .pp-x')].map(x => x.getBoundingClientRect()); return { cmpW: c.width, cmpH: c.height, inView: b.every(r => r.left >= -1 && r.right <= innerWidth + 1), minTap: Math.min(...b.map(r => r.height)), ok: globalThis.__mizanPhotoPro.state.result.fidelity?.ok }; });
  check('الجوال: المقارنة بعرض الشاشة والأزرار داخلها بلا تمرير أفقي', m.cmpW >= 340 && m.cmpH > 150 && m.inView && await noOverflow(page) && m.ok === true, JSON.stringify(m));
  check('الجوال: أهداف اللمس ≥ 34px', m.minTap >= 34, m.minTap);
  await page.screenshot({ path: path.join(OUT, 'photo-pro-mobile.png') });
  await ctx.close();

  // ------------------------------------------------------------------ الخدمة غير مهيأة
  M.mode = 'off'; ({ ctx, page } = await open({ width: 1366, height: 900 }));
  await page.waitForFunction(() => globalThis.__mizanPhotoPro !== undefined, null, { timeout: 60000 });
  check('الخدمة غير مهيأة: الزر مخفي بصمت ولا نافذة', await page.evaluate(() => document.getElementById('photoPro').hidden && !document.getElementById('ppDialog') && globalThis.__mizanPhotoPro.available === false));
  await ctx.close();
  check('لا أخطاء صفحات', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('اكتمال الاختبار', false, e.stack || e.message); }
await browser.close(); server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS — المزوّد وهمي؛ النموذج الحقيقي غير مختبر هنا`);
process.exit(failed.length ? 1 : 0);
