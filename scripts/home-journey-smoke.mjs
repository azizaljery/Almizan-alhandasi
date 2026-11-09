// فحص ما بعد النشر لرحلة العميل الحديثة على الموقع المنشور فعليًا (قراءة فقط: لا ينشئ شيئًا في الخادم ولا يرسل أسرارًا).
// الرحلة: الصفحة الأولى ← الأرض ← شرعاء (نص حر) ← البرنامج ← التصميم («ورّني وين»، المقارنة، «تصميم بديل») ← ثلاثي الأبعاد ← المخرجات ← الأنظمة،
// ثم الجوال (الصفحة الأولى والتصميم بلا تمرير أفقي).
// الاستعمال: SITE_URL=… EXPECTED_COMMIT=… node scripts/home-journey-smoke.mjs   (PLAYWRIGHT_MODULE لمسار بديل لمكتبة playwright)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = (process.env.SITE_URL || 'https://almizan-handasi.aljeryabod.workers.dev').replace(/\/$/, '');
const EXPECTED = process.env.EXPECTED_COMMIT || '';
const results = [], errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + String(detail).slice(0, 160) : '')); };
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, e.message); } };

// 1) الإصدار المنشور
await step('version.json', async () => {
  const v = await (await fetch(`${BASE}/version.json?smoke=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } })).json();
  check('version.json يحمل رقم الإصدار', typeof v.commit === 'string' && v.commit.length >= 7, v.commit);
  if (EXPECTED) check('الإصدار المنشور هو المتوقع', v.commit.startsWith(EXPECTED.slice(0, 7)), `${v.commit} ≠ ${EXPECTED}`);
});

// 1ب) شرعاء الذكي: حالة الربط فقط (لا يستهلك الخدمة ولا يحتاج رمز الدخول). اختبار تحليل حقيقي يحتاج رمز المالك.
await step('حالة شرعاء الذكي', async () => {
  const r = await fetch(`${BASE}/api/assistant/status?smoke=${Date.now()}`);
  const s = await r.json().catch(() => ({}));
  check('شرعاء الذكي: نقطة الحالة تستجيب', r.ok && typeof s.configured === 'boolean', `HTTP ${r.status}`);
  console.log(`INFO  شرعاء الذكي: المفتاح ${s.configured ? 'مهيأ' : 'غير مهيأ'}، رمز الدخول ${s.accessConfigured ? 'مهيأ' : 'غير مهيأ'} (الاتصال الفعلي لا يُختبر هنا)`);
});

const launchArgs = process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : {};
const browser = await chromium.launch({ ...launchArgs, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('response', r => { if (r.status() >= 400 && !/\/api\//.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const bodyText = p => p.evaluate(() => document.body.innerText);

await step('الرحلة', async () => {
  // 2) الصفحة الأولى
  await page.goto(`${BASE}/?smoke=${Date.now()}`, { waitUntil: 'load' });
  check('الصفحة الأولى: الاسم والعبارة', await page.evaluate(() => document.querySelector('#brandName')?.textContent.trim() === 'الميزان الهندسي' && /بوابتك لتصميم منزلك/.test(document.querySelector('.tagline')?.textContent || '')));
  check('الصفحة الأولى: نقاط الرحلة الثماني', (await page.$$('.journey-list li')).length === 8);
  check('الصفحة الأولى: بلا تمرير أفقي', await noOverflow(page));
  await page.click('#lxSkip').catch(() => {});
  // 3) الأرض وشرعاء والبرنامج
  await page.click('#start');
  await page.fill('#landLength', '30'); await page.fill('#landWidth', '20');
  await page.check('input[data-kind=street][value=s]'); await page.check('input[data-kind=entry][value=s]');
  await page.click('#landForm button[type=submit]'); await page.waitForTimeout(800);
  await page.click('text=أتحدث بحرية'); await page.waitForTimeout(300);
  await page.fill('#chat textarea', '4 غرف نوم ومجلس رجال بمدخل مستقل ومجلس نساء ومقلط ومطبخ مفتوح على الطعام وصالة، المطبخ في الخلف');
  await page.click('#chat .free .cta'); await page.waitForSelector('#program', { timeout: 30000 });
  check('شرعاء: البرنامج المعماري ظاهر', (await page.$$('#program tr')).length >= 4);
  await Promise.all([page.waitForURL(/\/design(\.html)?(\?.*)?$/, { timeout: 120000 }), page.click('#chat .cta:has-text("توليد التصميم")')]);
  await page.waitForSelector('#ledger', { timeout: 60000 }); await page.waitForTimeout(800);
  // 4) التصميم
  const t = await bodyText(page);
  check('التصميم: لا «null» ولا «undefined» ولا «NaN»', !/\bnull\b|undefined|NaN/.test(t));
  const led = await page.$$eval('#ledger li', l => [l.length, l.filter(x => x.classList.contains('locatable')).length]);
  check('«هل نُفّذ طلبك؟»: بنود قابلة للتحديد في المسقط', led[0] >= 5 && led[1] === led[0], led.join('/'));
  await page.click('#ledger li.locatable');
  check('«ورّني وين»: إضاءة البند في المسقط', await page.evaluate(() => !document.querySelector('#focusBar').hidden && document.querySelector('#focusText').textContent.length > 5));
  const nDesigns = (await page.$$('.history button')).length;
  if (nDesigns >= 2) {
    await page.click('#btnCompare'); await page.waitForTimeout(800);
    check('مقارنة تصميمين: جدول وعناوين', await page.evaluate(() => document.querySelectorAll('#cmpRows tr').length >= 8 && document.querySelectorAll('#cmpHead li').length >= 1));
    await page.click('#cmpClose');
  } else check('مقارنة تصميمين (يحتاج تصميمين)', true, 'تصميم واحد فقط في هذه الرحلة');
  await page.click('#btnAnother'); await page.fill('#fbText', 'ابي تصميم بديل مختلف'); await page.click('#fbGo');
  await page.waitForFunction(n => document.querySelectorAll('.history button').length > n || (document.querySelector('#fbStatus')?.textContent || '').length > 25, Math.max(1, nDesigns), { timeout: 90000 });
  check('«ابي تصميم بديل»: تصميم جديد', (await page.$$('.history button')).length > Math.max(1, nDesigns), await page.evaluate(() => document.querySelector('#fbStatus')?.textContent || ''));
  // 5) ثلاثي الأبعاد
  await Promise.all([page.waitForURL(/\/view3d(\.html)?(\?.*)?$/, { timeout: 60000 }), page.click('#btnApprove')]); await page.waitForTimeout(4000);
  check('ثلاثي الأبعاد: مجسم أو مسقط بديل', await page.evaluate(() => !!document.querySelector('#stage canvas, .v3 canvas') || !!document.querySelector('#stage svg')));
  // 6) المخرجات
  await page.goto(`${BASE}/final.html`); await page.waitForTimeout(6000);
  const heads = await page.$$eval('#fmain > section h2', h => h.map(x => x.textContent.trim()));
  check('المخرجات: جداول الكميات في الآخر', heads.length > 3 && /جداول الكميات/.test(heads.at(-1)), heads.at(-1));
  check('المخرجات: لا «null»', !/\bnull\b|undefined|NaN/.test(await bodyText(page)));
  // 7) الأنظمة
  await page.goto(`${BASE}/mep/systems.html`); await page.waitForTimeout(5000);
  check('الأنظمة: الصفحة تعمل', (await bodyText(page)).length > 200);
});

await step('الجوال', async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() })).newPage();
  m.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  await m.goto(`${BASE}/home.html`); await m.waitForTimeout(1500);
  check('الجوال: الصفحة الأولى بلا تمرير أفقي', await noOverflow(m));
  await m.goto(`${BASE}/design.html`); await m.waitForTimeout(2500);
  check('الجوال: صفحة التصميم بلا تمرير أفقي', await noOverflow(m));
});

check('لا أخطاء صفحات ولا ملفات مفقودة', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
