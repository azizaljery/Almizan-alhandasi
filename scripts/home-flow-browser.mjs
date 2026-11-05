// فحص حي للصفحة الرئيسية في Chromium حقيقي: استقبال ← أرض ← شرعاء ← توليد ← المرسم.
//   node scripts/home-flow-browser.mjs [outDir]      (اللقطات خارج المستودع افتراضيًا)
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const outDir = process.argv[2] || '/tmp/claude-0/home-shots';
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
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.g|net::/.test(m.text())) logs.push('console: ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  page.logs = logs; return page;
}
const visible = (page, sel) => page.locator(sel).isVisible();
/** توليد ← صفحة التصميم الأولي ← «افتح في المرسم» ← المرسم بتصميم جاهز */
async function toStudio(page) {
  await Promise.all([page.waitForURL('**/design.html', { timeout: 90000 }), page.click('#chat .cta:has-text("توليد التصميم")')]);
  await page.waitForSelector('#btnStudio', { timeout: 30000 });
  await Promise.all([page.waitForURL('**/studio.html', { timeout: 30000 }), page.click('#btnStudio')]);
  await page.waitForFunction(() => globalThis.__mizanStudio?.doc?.walls?.length > 0, null, { timeout: 30000 });
}

async function runLand(page) {
  await page.click('#start');
  check('الأرض تظهر بعد «ابدأ»', await visible(page, '#stageLand'));
  await page.click('#landForm button[type=submit]');
  check('إرسال الأرض فارغة يعرض خطأ', await visible(page, '#landError'), await page.locator('#landError').innerText());
  check('المدخل معطّل قبل اختيار الشارع', await page.locator('input[data-kind=entry][value=s]').isDisabled());
  await page.fill('#landLength', '30'); await page.fill('#landWidth', '20');
  await page.check('input[data-kind=street][value=s]'); await page.check('input[data-kind=street][value=e]');
  await page.check('input[data-kind=entry][value=s]'); await page.check('input[data-kind=entry][value=e]');
  check('المعاينة ترسم شارعين ومدخلين', (await page.locator('#landPreview .pv-street').count()) === 2 && (await page.locator('#landPreview .pv-door').count()) === 2);
  await page.screenshot({ path: join(outDir, '1b-land-filled.png') });
  await page.uncheck('input[data-kind=street][value=e]');
  check('إلغاء الشارع يلغي مدخله', !(await page.locator('input[data-kind=entry][value=e]').isChecked()) && (await page.locator('#landPreview .pv-door').count()) === 1);
  await page.check('input[data-kind=street][value=e]'); await page.check('input[data-kind=entry][value=e]');
  await page.click('#landForm button[type=submit]');
  check('شرعاء تظهر بعد الأرض', await visible(page, '#stageShara'));
}

// ------------------------------------------------------------------------------------------------ 1) المسار الموجَّه
{
  const page = await newPage({ width: 1440, height: 860 });
  await page.goto(base + '/home.html');
  check('اتجاه الصفحة RTL وعربية', (await page.evaluate(() => [document.documentElement.dir, document.documentElement.lang])).join() === 'rtl,ar');
  check('اسم الميزان الهندسي في الاستقبال', (await page.locator('#brandName').innerText()).trim() === 'الميزان الهندسي');
  check('شعار «نحو منزلك» في الاستقبال', (await page.locator('.tagline').innerText()).trim() === 'نحو منزلك');
  await page.waitForTimeout(2500);
  check('مشهد 3D (canvas) يعمل في الاستقبال', (await page.locator('#scene canvas').count()) === 1);
  await page.screenshot({ path: join(outDir, '1-welcome.png') });
  await runLand(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(outDir, '2-land-shara.png') });
  const first = await page.locator('#chat .bubble').first().innerText();
  check('شرعاء تفتح المحادثة بنفسها بنص الترحيب', first.trim() === 'أهلاً بك، أنا شرعاء، مساعدك الذكي لفهم احتياجاتك في تصميم منزلك.', first);
  const modes = await page.locator('#chat .pick .chip').allInnerTexts();
  check('خياران: حديث حر أو أسئلة محددة', modes.join('|') === 'أتحدث بحرية|اسألني أسئلة محددة', modes.join('|'));
  await page.click('text=اسألني أسئلة محددة');
  check('أول سؤال يوضح الهدف', (await page.locator('#chat .bubble').allInnerTexts()).some(t => t.includes('نمط حياتك')));
  check('سؤال الأسرة أولًا ومعه سببه الهندسي', (await page.locator('#chat .ask[data-ask=g_family]').count()) === 1 && (await page.locator('#chat .bubble .why').last().innerText()).startsWith('أسأل'));
  // كتابة حرة في خطوة إرشادية + خيار
  await page.click('#chat .ask .chip:has-text("والدتي تسكن معنا")');
  await page.fill('#chat .ask input[type=text]', '3 أولاد وبنتين صغار');
  await page.waitForTimeout(500); await page.screenshot({ path: join(outDir, '2b-lifestyle.png') });
  await page.click('#chat .ask .cta');
  check('سؤال الضيوف ثانيًا', (await page.locator('#chat .ask[data-ask=g_guests]').count()) === 1);
  await page.click('#chat .ask .chip:has-text("مجلس رجال ومجلس نساء")'); await page.click('#chat .ask .cta');
  check('سؤال النوم ثالثًا', (await page.locator('#chat .ask[data-ask=g_sleep]').count()) === 1);
  await page.click('#chat .ask .chip:has-text("كل غرفة بحمامها")'); await page.click('#chat .ask .cta');
  check('سؤال المطبخ والخدمة رابعًا', (await page.locator('#chat .ask[data-ask=g_kitchen]').count()) === 1);
  await page.click('#chat .ask .chip:has-text("مطبخ مغلق")'); await page.click('#chat .ask .chip:has-text("غرفة خادمة")'); await page.click('#chat .ask .cta');
  check('سؤال الإضافات أخيرًا', (await page.locator('#chat .ask[data-ask=g_extras]').count()) === 1);
  await page.click('#chat .ask .chip:has-text("مسبح")'); await page.click('#chat .ask .cta');
  await page.waitForSelector('#program');
  const prog = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#program [data-count]')].map(b => [b.dataset.count, Number(b.textContent)])));
  check('الإرشادي ينتهي بجدول البرنامج (أولاد 2، بنات 1، الوالدة 1، مجلسان، خادمة)', prog.bedroom_boys === 2 && prog.bedroom_girls === 1 && prog.elderly_room === 1 && prog.majlis_men === 1 && prog.majlis_women === 1 && prog.maid === 1, JSON.stringify(prog));
  check('المسبح يُقال بصدق أنه لا يُرسم', (await page.locator('#chat .bubble').allInnerTexts()).some(t => t.includes('المسبح')));
  check('لا نموذج أعداد فارغة يعيد السؤال', (await page.locator('#chat .counts').count()) === 0);
  // مشروع محفوظ سابق في المرسم: يجب ألا يضيع
  await page.evaluate(async () => {
    const { createDoc, applyCommand, serialize } = await import('./draw/doc.mjs');
    let d = createDoc({ title: 'مشروعي القديم' });
    d = applyCommand(d, { type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }).doc;
    localStorage.setItem('mizan.studio.doc.v1', serialize(d));
  });
  // تعديل في مكانه: إنقاص غرف الأولاد إلى 1 وحذف المقلط
  await page.click('#program tr[data-row=bedroom_boys] .pm[aria-label^="أنقص"]');
  await page.click('#program tr[data-row=dining] .pm.del');
  const prog2 = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#program [data-count]')].map(b => [b.dataset.count, Number(b.textContent)])));
  check('± والحذف يعملان في مكانهما', prog2.bedroom_boys === 1 && prog2.dining === undefined, JSON.stringify(prog2));
  check('زر التوليد يظهر بلا حقل إلزامي', await visible(page, '#chat .cta:has-text("توليد التصميم")'));
  await toStudio(page);
  const out = await page.evaluate(() => { const d = globalThis.__mizanStudio.doc; return { walls: d.walls.length, openings: d.openings.length, labels: d.labels.map(l => l.type), plot: !!d.plot, entry: d.entry, entries: d.entries, streets: d.streets, title: d.title, backup: !!localStorage.getItem('mizan.studio.doc.v1.before-home'), handoffLeft: !!sessionStorage.getItem('mizan.home.handoff.v1') }; });
  check('المرسم فتح تصميمًا جاهزًا لا لوحة فاضية', out.walls > 10 && out.openings > 0, `جدران ${out.walls}، فتحات ${out.openings}`);
  check('الأرض والمداخل والشوارع المتعددة في المستند', out.plot && out.entry === 's' && out.entries.join() === 's,e' && out.streets.join() === 's,e', JSON.stringify([out.entry, out.entries, out.streets]));
  check('المشروع القديم نُسخ احتياطيًا ولم يضع', out.backup);
  check('التسليم استُهلك مرة واحدة', !out.handoffLeft);
  check('الغرف المطلوبة موجودة في الرسم (4 نوم: الرئيسية والأولاد والبنات والوالدة)', out.labels.filter(t => t === 'bedroom' || t === 'master').length === 4 && out.labels.filter(t => t === 'majlis').length === 2, out.labels.join());
  const toast = await page.locator('#toast').innerText().catch(() => '');
  check('المرسم يخبر العميل أن التصميم من شرعاء', toast.includes('شرعاء'), toast);
  await page.screenshot({ path: join(outDir, '3-studio-after-generate.png') });
  // تعديل يدوي بعد التسليم: إضافة جدار ثم تراجع
  const edit = await page.evaluate(() => { const e = globalThis.__mizanStudio, n = e.doc.walls.length; e.exec({ type: 'add-wall', level: 'L1', a: { x: -3, y: -3 }, b: { x: -1, y: -3 } }, 'اختبار'); const after = e.doc.walls.length; e.undo(); return [n, after, e.doc.walls.length]; });
  check('تعديل يدوي ثم تراجع يعملان على التصميم المولَّد', edit[1] === edit[0] + 1 && edit[2] === edit[0], edit.join());
  check('لا أخطاء في المتصفح (مسار موجَّه)', page.logs.length === 0, page.logs.join(' | '));
}

// ------------------------------------------------------------------------------------------------ 2) الحديث الحر: الجدول الكامل بلا إعادة سؤال
{
  const page = await newPage({ width: 1280, height: 900 });
  await page.goto(base + '/home.html'); await runLand(page);
  await page.click('text=أتحدث بحرية');
  await page.fill('#chat textarea', 'أبغى مجلسين وصالتين وأربع غرف نوم ومطبخ مفتوح وغرفة خادمة');
  await page.click('#chat .free .cta');
  await page.waitForSelector('#program');
  const prog = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#program [data-count]')].map(b => [b.dataset.count, Number(b.textContent)])));
  check('الجدول يذكر المجلسين والصالتين والغرف الأربع والمطبخ والخادمة', prog.majlis_men === 1 && prog.majlis_women === 1 && prog.hall === 2 && prog.master + prog.bedroom === 4 && prog.kitchen === 1 && prog.maid === 1, JSON.stringify(prog));
  const srcs = await page.locator('#program .src').allInnerTexts();
  check('مصدر الفهم معلن في كل صف (قلتَ / افتراض عرفي)', srcs.includes('قلتَ') && srcs.includes('افتراض عرفي'), srcs.join('|'));
  check('لا نموذج أعداد يعيد السؤال عمّا فُهم', (await page.locator('#chat .counts').count()) === 0);
  const asks = await page.locator('#chat .ask').count();
  check('سؤال واحد على الأكثر في الدور، ومعه سببه', asks <= 1 && (asks === 0 || (await page.locator('#chat .bubble .why').count()) >= 1), String(asks));
  check('التوليد متاح فورًا بلا حقل إلزامي', await visible(page, '#chat .cta:has-text("توليد التصميم")'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, '3b-program-table.png'), fullPage: true });
  await toStudio(page);
  const labels = await page.evaluate(() => globalThis.__mizanStudio.doc.labels.map(l => l.type));
  check('المرسم: مجلسان وصالتان وأربع غرف نوم وخادمة', labels.filter(t => t === 'majlis').length === 2 && labels.filter(t => t === 'living').length === 2 && labels.filter(t => t === 'bedroom' || t === 'master').length === 4 && labels.includes('service'), labels.join());
  check('لا أخطاء في المتصفح (حديث حر)', page.logs.length === 0, page.logs.join(' | '));
}

// ------------------------------------------------------------------------------------------------ 2ب) جملة المالك: «أبغى اثنين مجلس واثنين صالة» إلى المرسم بلا أي حقل إلزامي
{
  const page = await newPage({ width: 1280, height: 800 });
  await page.goto(base + '/home.html'); await runLand(page);
  await page.click('text=أتحدث بحرية');
  await page.fill('#chat textarea', 'أبغى اثنين مجلس واثنين صالة');
  await page.click('#chat .free .cta');
  await page.waitForSelector('#program');
  const prog = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#program [data-count]')].map(b => [b.dataset.count, Number(b.textContent)])));
  check('«اثنين مجلس واثنين صالة» = مجلس رجال ومجلس نساء وصالتان، ولا سؤال «كم صالة؟»', prog.majlis_men === 1 && prog.majlis_women === 1 && prog.hall === 2 && !(await page.locator('#chat .bubble').allInnerTexts()).some(t => /كم صالة|كم مجلس/.test(t)), JSON.stringify(prog));
  check('غرفة النوم غير المذكورة افتراض معلن لا حقل مطلوب', prog.master === 1 && (await page.locator('#program tr[data-row=master] .src').innerText()) === 'افتراض عرفي');
  await toStudio(page);
  const labels = await page.evaluate(() => globalThis.__mizanStudio.doc.labels.map(l => l.type));
  check('المرسم استلم مجلسين وصالتين', labels.filter(t => t === 'majlis').length === 2 && labels.filter(t => t === 'living').length === 2, labels.join());
  check('لا أخطاء في المتصفح (جملة المالك)', page.logs.length === 0, page.logs.join(' | '));
}

// ------------------------------------------------------------------------------------------------ 3) الجوال
{
  const page = await newPage({ width: 390, height: 844 });
  await page.goto(base + '/home.html'); await page.waitForTimeout(800);
  const noScroll = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('الجوال: لا تمرير أفقي في الاستقبال', await noScroll());
  await page.click('#start');
  check('الجوال: لا تمرير أفقي في الأرض', await noScroll());
  await page.screenshot({ path: join(outDir, '4-mobile-land.png') });
  await page.fill('#landLength', '25'); await page.fill('#landWidth', '15');
  await page.check('input[data-kind=street][value=n]'); await page.check('input[data-kind=entry][value=n]');
  await page.click('#landForm button[type=submit]');
  check('الجوال: لا تمرير أفقي في شرعاء', await noScroll());
  await page.screenshot({ path: join(outDir, '5-mobile-shara.png') });
  await page.click('text=أتحدث بحرية');
  await page.fill('#chat textarea', 'مجلسين وثلاث غرف نوم وغرفة خادمة'); await page.click('#chat .free .cta');
  await page.waitForSelector('#program'); await page.waitForTimeout(400);
  check('الجوال: جدول البرنامج بلا تمرير أفقي للصفحة (الجدول يتمرر داخل لوحته)', await noScroll());
  await page.screenshot({ path: join(outDir, '5b-mobile-program.png') });
}

await browser.close(); server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} نجح`);
if (failed.length) { console.log('فشل:\n' + failed.map(f => ' - ' + f.name + (f.detail ? ' — ' + f.detail : '')).join('\n')); process.exit(1); }
