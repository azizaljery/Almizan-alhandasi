// فحص حي لمقابلة شرعاء V3 (تجريبي) داخل محادثة شرعاء في Chromium حقيقي: أرض ← شرعاء ← V3 ← إرسال ← برنامج ← توليد.
//   node scripts/sharaa-v3-browser.mjs [outDir]   (لقطات 390 و1280؛ الفشل يُنهي العملية برمز غير صفري ولا يُحسب التخطي نجاحًا)
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const outDir = process.argv[2] || '/tmp/claude-0/work/shots-v3';
await mkdir(outDir, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  const file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport }); const page = await ctx.newPage(); const logs = [];
  // /api/site/notice يطلبه الموقع دائمًا وخادم الاختبار الساكن لا يخدمه (موجود في deploy قبل V3)؛ أي 404 آخر يُعد فشلًا
  page.on('response', r => { if (r.status() === 404 && !r.url().endsWith('/api/site/notice')) logs.push('404: ' + r.url()); });
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.g|net::|status of 404/.test(m.text())) logs.push('console: ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message)); page.logs = logs; return page;
}
async function toShara(page, { width = 20 } = {}) {
  await page.goto(base + '/home.html'); await page.click('#start');
  await page.fill('#landLength', '30'); await page.fill('#landWidth', String(width));
  await page.check('input[data-kind=street][value=s]'); await page.check('input[data-kind=entry][value=s]');
  await page.click('#landForm button[type=submit]'); await page.waitForSelector('#stageShara', { state: 'visible' });
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const ANS = { 'household.adults': 2, 'household.parents': 'first', 'household.bedrooms': 4, 'services.kitchens': 1, 'living.count': 1, 'living.diningCount': 1, 'living.baths': 6 };
const YES = new Set(['hospitality.men', 'hospitality.women']);
/** يجيب عن أسئلة V3 عبر الواجهة حتى يُفعَّل زر الإرسال. */
async function interview(page, max = 80) {
  const asked = [];
  for (let i = 0; i < max; i++) {
    const apply = page.locator('[data-v3=apply]'); if (await apply.isEnabled()) break;
    const card = page.locator('.v3-q'); if (!(await card.count())) break;
    const id = await card.getAttribute('data-q'); asked.push(id);
    const input = card.locator('input'), chips = card.locator('.v3-pick button');
    if (await input.count()) { await input.fill(String(ANS[id] ?? 1)); await card.locator('button[type=submit]').click(); }
    else if (id in ANS && ANS[id] === 'first') await chips.first().click();
    else await chips.filter({ hasText: YES.has(id) ? 'نعم' : 'لا' }).first().click();
    await page.waitForTimeout(30);
  }
  return asked;
}

// ------------------------------------------------------------------------------------------------ 1) سطح المكتب: الرحلة الكاملة
{
  const page = await newPage({ width: 1280, height: 860 });
  await toShara(page);
  const chips = await page.locator('#chat .pick .chip').allInnerTexts();
  check('مساراا شرعاء الحاليان باقيان', chips.includes('أتحدث بحرية') && chips.includes('اسألني أسئلة محددة'), chips.join(' | '));
  check('خيار V3 ظاهر وصريح التسمية «تجريبي»', chips.some(t => t.includes('تجريبي')), chips.join(' | '));
  await page.screenshot({ path: join(outDir, 'd1-mode-choice.png') });
  await page.click('#v3Open'); await page.waitForSelector('#v3Panel .v3-q');
  const panelText = await page.locator('#v3Panel').innerText();
  check('اللوحة تعرض الأرض المؤكدة 20 × 30 ولا تسأل عنها', /20 × 30/.test(panelText) && !/الطول|العرض|عرض الأرض|طول الأرض/.test(await page.locator('.v3-q h4').innerText()));
  check('شارة «تجريبي» في رأس اللوحة', (await page.locator('.v3-badge').innerText()).includes('تجريبي'));
  // حديث حر يستخرج عدة متطلبات ثم يؤكدها العميل
  await page.fill('textarea[data-v3=free]', 'عندي ٣ عيال وأبي تصميم واحد وعندي ٤ غرف نوم');
  await page.click('button:has-text("افهم كلامي")'); await page.waitForSelector('.v3-confirm');
  const confirmRows = await page.locator('.v3-confirm .v3-row').count();
  check('الحديث الحر يستخرج عدة متطلبات للتأكيد', confirmRows >= 3, 'عدد المستخرجات ' + confirmRows);
  check('لا اعتماد قبل التأكيد (الأسئلة الأساسية ما زالت متبقية)', /أسئلة أساسية متبقية: [1-9]/.test(await page.locator('#v3Panel').innerText()));
  await page.locator('.v3-confirm .v3-row').nth(0).locator('button:has-text("أؤكد")').click();
  await page.locator('.v3-confirm .v3-row').nth(0).locator('button:has-text("أؤكد")').click();
  await page.locator('.v3-confirm .v3-row').nth(0).locator('button:has-text("لا، تجاهل")').click().catch(() => {});
  await page.locator('details:has-text("لماذا أسأل؟") summary').first().click();
  check('شرح سبب السؤال ظاهر', (await page.locator('.v3-q details p').first().innerText()).length > 15);
  await page.screenshot({ path: join(outDir, 'd2-v3-question.png') });
  const asked = await interview(page);
  check('المقابلة تنتهي بتفعيل زر الإرسال', await page.locator('[data-v3=apply]').isEnabled(), 'أسئلة أُجيبت: ' + asked.length);
  const sendText = await page.locator('[data-v3=send] .v3-text').innerText();
  check('نص الإرسال يتضمن غرف النوم والمجلسين', /4 غرف نوم/.test(sendText) && /مجلس رجال/.test(sendText) && /مجلس نساء/.test(sendText), sendText);
  check('ما لا يُطبَّق مُعلَن لا مُسقَط', /لن يُطبَّق في التوليد الحالي \(\d+\)/.test(await page.locator('[data-v3=send]').innerText()));
  // تعديل إجابة دون إعادة المقابلة
  const editBeds = async v => { await page.locator('[data-v3=review] summary').click(); await page.locator('[data-v3=review] .v3-row:has-text("غرفة نوم إجمالًا") button:has-text("تعديل")').click(); await page.fill('.v3-q input', String(v)); await page.click('.v3-q button[type=submit]'); };
  await editBeds(5);
  check('تعديل الإجابة يحفظ بلا إعادة المقابلة', (await page.locator('[data-v3=send] .v3-text').innerText()).includes('5 غرف نوم') && /أسئلة أساسية متبقية: 0/.test(await page.locator('#v3Panel').innerText()));
  await editBeds(4);
  await page.screenshot({ path: join(outDir, 'd3-v3-send.png'), fullPage: false });
  check('لا تمرير أفقي (1280)', await noOverflow(page));
  // رجوع إلى شرعاء الحالي ثم إعادة الفتح: المقابلة محفوظة
  await page.click('button:has-text("العودة إلى شرعاء الحالي")');
  check('العودة تعيد خياري شرعاء الحاليين مع V3', (await page.locator('#chat .pick .chip').allInnerTexts()).filter(t => /تجريبي|حرية|محددة/.test(t)).length === 3);
  await page.click('#v3Open'); await page.waitForSelector('#v3Panel');
  check('إعادة الفتح تحتفظ بالإجابات (لا إعادة مقابلة)', /أسئلة أساسية متبقية: 0/.test(await page.locator('#v3Panel').innerText()));
  // إرسال إلى شرعاء الحالي
  await page.click('[data-v3=apply]'); await page.waitForSelector('#program', { timeout: 20000 });
  const counts = await page.evaluate(() => globalThis.__mizanHome.session.counts);
  check('أعداد شرعاء الحالي = ما أكّده العميل في V3', JSON.stringify(counts) === JSON.stringify({ bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }), JSON.stringify(counts));
  check('بُني جدول البرنامج في مسار شرعاء الحالي', (await page.locator('#program table tr').count()) >= 6);
  await page.screenshot({ path: join(outDir, 'd4-program-after-v3.png') });
  // توليد حقيقي
  await Promise.all([page.waitForURL('**/design.html', { timeout: 120000 }), page.click('#chat .cta:has-text("توليد التصميم")')]);
  await page.waitForSelector('#btnStudio', { timeout: 60000 });
  check('التوليد من مسار V3 ينتهي بصفحة التصميم', page.url().endsWith('/design.html'));
  await page.screenshot({ path: join(outDir, 'd5-design.png') });
  check('لا أخطاء في الكونسول (سطح المكتب)', page.logs.length === 0, page.logs.join(' | '));
}
// ------------------------------------------------------------------------------------------------ 2) الجوال 390
{
  const page = await newPage({ width: 390, height: 844 });
  await toShara(page);
  await page.screenshot({ path: join(outDir, 'm1-mode-choice.png') });
  await page.click('#v3Open'); await page.waitForSelector('#v3Panel .v3-q');
  check('لا تمرير أفقي (390) عند فتح V3', await noOverflow(page));
  await page.screenshot({ path: join(outDir, 'm2-v3-question.png') });
  await interview(page);
  check('الجوال: زر الإرسال مفعّل بعد المقابلة', await page.locator('[data-v3=apply]').isEnabled());
  check('لا تمرير أفقي (390) في ملخص الإرسال', await noOverflow(page));
  await page.locator('[data-v3=send]').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(outDir, 'm3-v3-send.png') });
  check('لا أخطاء في الكونسول (الجوال)', page.logs.length === 0, page.logs.join(' | '));
}
// ------------------------------------------------------------------------------------------------ 3) تغيير الأرض يحفظ معلومات الأسرة ولا يعيد السؤال
{
  const page = await newPage({ width: 1280, height: 860 });
  await toShara(page, { width: 20 });
  await page.click('#v3Open'); await page.waitForSelector('#v3Panel .v3-q');
  await interview(page);
  const keep = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mizan.sharaa-v3.brief')).brief.facts).length);
  await page.evaluate(() => { location.hash = '#land'; }); await page.waitForSelector('#stageLand', { state: 'visible' });
  await page.fill('#landWidth', '24'); await page.click('#landForm button[type=submit]'); await page.waitForSelector('#stageShara', { state: 'visible' });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mizan.sharaa-v3.brief')).brief);
  check('تغيير الأرض يحفظ كل معلومات الأسرة', Object.keys(after.facts).length === keep, keep + ' → ' + Object.keys(after.facts).length);
  check('الأرض الجديدة سُجِّلت في ملف V3', after.land.widthM === 24);
  await page.click('#v3Open').catch(async () => { await page.waitForSelector('#v3Open'); await page.click('#v3Open'); });
  await page.waitForSelector('#v3Panel');
  const txt = await page.locator('#v3Panel').innerText();
  check('اللوحة تعرض الأرض الجديدة 24 × 30 ولا تعيد سؤال العائلة الأساسي', /24 × 30/.test(txt) && /أسئلة أساسية متبقية: 0/.test(txt), txt.slice(0, 160));
  check('لا أخطاء في الكونسول (تغيير الأرض)', page.logs.length === 0, page.logs.join(' | '));
}
await browser.close(); server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
