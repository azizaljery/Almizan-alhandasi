// اختبار متصفح لبطاقة «صورة داخلية احترافية» بخادم Worker حقيقي (worker/photo.mjs) ومزوّد صور وهمي: لا اتصال بـ Workers AI ولا اختبار للنموذج الحقيقي.
// يحفظ لقطة المجسم الداخلي المؤثث لكل غرفة (المجلس، الصالة، الرئيسية) وصورة الحوار. الاستعمال:
//   node scripts/build.mjs && PLAYWRIGHT_MODULE=/opt/npm-tools/node_modules/playwright/index.mjs node scripts/interior-browser-check.mjs   (OUT للمجلد، PORT)
import fs from 'node:fs'; import path from 'node:path';
import { startMockServer, ROOT } from './photo-mock-server.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const OUT = process.env.OUT || path.join(ROOT, 'evidence/photo-interior'); fs.mkdirSync(OUT, { recursive: true });
const DOC = fs.readFileSync(path.join(ROOT, 'tests/fixtures/flow-30x20-doc.json'), 'utf8');
const server = await startMockServer({ port: +process.env.PORT || 8887, delay: 600 }), BASE = server.base, M = server.state;
const results = [], errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== '' ? '  — ' + String(detail).slice(0, 240) : '')); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
async function open(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(doc => { try { localStorage.setItem('mizan.studio.doc.v1', doc); } catch {} }, DOC);
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`${BASE}/view3d.html`, { waitUntil: 'load' }); return { ctx, page };
}
const shown = page => page.waitForFunction(() => { const d = document.getElementById('piDialog'); return d?.open && d.querySelector('.pp-wait').hidden && !!d.querySelector('.pp-after').getAttribute('src') && !d.querySelector('.pp-after').hidden; }, null, { timeout: 280000 });
const saveShot = async (page, name) => { const url = await page.evaluate(() => globalThis.__mizanInteriorPhoto.state.shot.dataUrl); fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64')); };
try {
  let { ctx, page } = await open({ width: 1366, height: 900 });
  await page.waitForSelector('#photoInterior:not([hidden])', { timeout: 90000 });
  check('الزر ظاهر بجانب زر الصورة المعمارية عند تهيئة الخدمة الداخلية', await page.isVisible('#photoInterior') && await page.evaluate(() => document.getElementById('photoInterior').previousElementSibling?.id === 'photoPro'), await page.textContent('#photoInterior'));
  for (const [room, label] of [['majlis', 'المجلس'], ['living', 'الصالة'], ['master', 'غرفة النوم الرئيسية']]) {
    const n0 = M.calls.length;
    if (room === 'majlis') { await page.evaluate(() => document.getElementById('photoInterior').click()); } else { await page.evaluate(r => document.querySelector(`#piDialog [data-r=${r}]`).click(), room); }
    await shown(page);
    const c = M.calls[n0], r = await page.evaluate(() => { const s = globalThis.__mizanInteriorPhoto.state; return { ok: s.result.fidelity?.ok, score: s.result.fidelity?.score, lm: (s.landmarks || []).length, extra: s.extra, stamp: document.querySelector('#piDialog .pp-stamp').textContent, title: document.querySelector('#piDialog h2').textContent }; });
    check(`${label}: طلب kind=interior ببرومبت داخلي للغرفة وأعداد الفتحات والقطع من اللقطة`, M.calls.length === n0 + 1 && /interior photograph/.test(c.prompt) && new RegExp(({ majlis: 'Arab majlis', living: 'family living room', master: 'master bedroom' })[room]).test(c.prompt) && /exactly/.test(c.prompt), c.prompt.slice(260, 520));
    check(`${label}: وسم داخلي دائم وفحص أمانة داخلي يجتاز لصورة بهندسة اللقطة نفسها`, /داخلية/.test(r.stamp) && r.ok === true && r.score >= .9 && r.lm >= 3, JSON.stringify({ score: r.score, lm: r.lm, extra: r.extra }));
    await saveShot(page, `interior-${room}.jpg`);
  }
  await page.screenshot({ path: path.join(OUT, 'interior-dialog-desktop.jpg'), type: 'jpeg', quality: 80 });
  // مخالفة: صورة تحذف ما في المجسم (ثابتة لواجهة) ← تنبيه ولا ادّعاء
  M.mode = 'fixed'; const n1 = M.calls.length; await page.evaluate(() => document.querySelector('#piDialog [data-l=night]').click()); await shown(page);
  const w = await page.evaluate(() => ({ ok: globalThis.__mizanInteriorPhoto.state.result.fidelity?.ok, note: document.querySelector('#piDialog .pp-note').textContent }));
  check('صورة تخالف المجسم الداخلي: تنبيه صريح وإعادة تلقائية واحدة', w.ok === false && /قد تختلف/.test(w.note) && M.calls.length === n1 + 2, w.note.slice(0, 120));
  check('تغيير الإضاءة يعيد التقاط المجسم بإضاءته (طلب ليلي)', /evening/.test(M.calls.at(-1).prompt));
  check('مصغّرة الصورة حُفظت مع المشروع (غلاف «مشاريعي السابقة»)', await page.evaluate(() => { try { const v = JSON.parse(localStorage.getItem('mizan.photo.keep.v1') || 'null'); return v?.items?.some(i => /^interior:/.test(i.kind)) && v.items.every(i => i.thumb.length < 40000); } catch { return false; } }));
  M.mode = 'echo'; await page.keyboard.press('Escape'); await ctx.close();
  ({ ctx, page } = await open({ width: 390, height: 844 }, true));
  await page.waitForSelector('#photoInterior:not([hidden])', { timeout: 90000 }); await page.locator('#photoInterior').scrollIntoViewIfNeeded(); await page.evaluate(() => document.getElementById('photoInterior').click()); await shown(page);
  check('الجوال: لا تمرير أفقي والمقارنة بعرض الشاشة', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('#piDialog .pp-cmp').getBoundingClientRect().width >= 340));
  await page.screenshot({ path: path.join(OUT, 'interior-dialog-mobile.jpg'), type: 'jpeg', quality: 80 }); await ctx.close();
  M.mode = 'off'; ({ ctx, page } = await open({ width: 1366, height: 900 }));
  await page.waitForFunction(() => globalThis.__mizanInteriorPhoto !== undefined, null, { timeout: 90000 });
  check('الخدمة غير مهيأة: الزر الداخلي مخفي بصمت', await page.evaluate(() => document.getElementById('photoInterior').hidden && !document.getElementById('piDialog'))); await ctx.close();
  check('لا أخطاء صفحات', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('اكتمال الاختبار', false, e.stack || e.message); }
await browser.close(); server.close();
const failed = results.filter(r => !r.ok); console.log(`\n${results.length - failed.length}/${results.length} PASS — المزوّد وهمي؛ النموذج الحقيقي غير مختبر هنا`); process.exit(failed.length ? 1 : 0);
