// فحص متصفح للإدارة وأرشيف الموافقة والبدء من جديد. Worker حقيقي (worker/index.mjs) فوق D1 محاكى بـ node:sqlite، وملفات dist من القرص.
// لا اتصال بأي خدمة خارجية. التشغيل: node scripts/admin-browser.mjs [مجلد اللقطات]   (PLAYWRIGHT=… لمسار المكتبة)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import worker from '../worker/index.mjs';
import { LocalD1 } from '../tests/fixtures/local-d1-admin.mjs';
import { generateInitialDesign, normalizeLand } from '../dist/home-flow.mjs';
import { createSession } from '../dist/design-session.mjs';
const ROOT = path.resolve('dist'), SHOTS = process.argv[2] || '', PW = process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright/index.mjs';
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' };
const assets = { async fetch(req) {
  let p = decodeURIComponent(new URL(req.url).pathname); if (p === '/') p = '/home.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('nf', { status: 404 });
  return new Response(fs.readFileSync(f), { headers: { 'content-type': T[path.extname(f)] || 'application/octet-stream' } });
} };
const env = { DB: new LocalD1(), ASSETS: assets };
const server = http.createServer(async (q, r) => {
  const chunks = []; for await (const c of q) chunks.push(c);
  const url = 'http://' + q.headers.host + q.url, body = chunks.length && !['GET', 'HEAD'].includes(q.method) ? Buffer.concat(chunks) : undefined;
  const res = await worker.fetch(new Request(url, { method: q.method, headers: { ...q.headers, 'cf-connecting-ip': '4.4.4.4' }, body }), env, {});
  const h = {}; res.headers.forEach((v, k) => { h[k] = v; }); const sc = res.headers.getSetCookie?.(); if (sc?.length) h['set-cookie'] = sc;
  r.writeHead(res.status, h); r.end(Buffer.from(await res.arrayBuffer()));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok)); const B = 'http://localhost:' + server.address().port;
const { chromium } = await import(PW);
const br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
let pass = 0, fail = 0; const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };
const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 55 }); };
const PW1 = 'ميزان-Alpha-Tree-7391!', PW2 = 'نخلة-Beta-River-5520#';

// بيانات تصميم حقيقية
const { land } = normalizeLand({ length: 30, width: 20, streets: ['s'], entries: ['s'], floors: 1, geo: { lat: 24.7743123, lng: 46.7386123, north: 3 } });
const result = await generateInitialDesign({ land, idea: 'x', counts: { bedrooms: 3, majlis: 1 } });
const sess = createSession({ land, counts: {}, requirements: { ...result.requirements, prefs: { exterior: { style: 'S', tone: 'warm' } } }, discovery: null, idea: 'اسمي سعد', result });
const seed = { 'mizan.design.session.v1': JSON.stringify({ ...sess, approved: 0 }), 'mizan.studio.doc.v1': sess.designs[0].doc, 'mizan.home.state.v1': JSON.stringify({ v: 1, confirmedLand: land, shara: null, tlog: [] }) };

async function ctxPage(opts = {}) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts }), p = await ctx.newPage(), errs = [], external = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  p.on('request', q => { const u = q.url(); if (!u.startsWith(B) && !/^(data|blob):/.test(u)) external.push(u); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return { ctx, p, errs, external };
}

// ================================================================ الإدارة
{
  const { ctx, p, errs, external } = await ctxPage();
  await p.goto(B + '/admin'); await p.waitForSelector('h1');
  check('الإدارة: الصفحة بترويسات آمنة', true);
  const resp = await ctx.request.get(B + '/admin'); const hd = resp.headers();
  check('ترويسات الصفحة: CSP + noindex + no-store', /default-src 'none'/.test(hd['content-security-policy']) && /noindex/.test(hd['x-robots-tag']) && /no-store/.test(hd['cache-control']));
  check('إعداد أول مرة: عنوان وتحذير «أول من ينشئها يملك الإدارة»', /إنشاء كلمة سر/.test(await p.locator('h1').innerText()) && /أول من ينشئها يملك الإدارة/.test(await p.locator('.warn').innerText()));
  await p.fill('#spw', 'قصيرة'); check('مقياس القوة يعمل (ضعيفة)', /قصيرة/.test(await p.locator('.meter + p').innerText()));
  await p.click('button[type=submit]'); await p.waitForTimeout(300); check('كلمة ضعيفة: رفض برسالة', (await p.locator('.err').innerText()).length > 0);
  await p.fill('#spw', PW1); await p.fill('#scf', PW1 + 'x'); await p.click('button[type=submit]'); await p.waitForTimeout(300);
  check('تأكيد غير مطابق: رفض', /غير متطابقتين/.test(await p.locator('.err').innerText()));
  await p.fill('#scf', PW1); await p.click('button[type=submit]'); await p.waitForSelector('.shell', { timeout: 15000 });
  check('إنشاء كلمة السر ثم دخول تلقائي إلى لوحة الإدارة', await p.locator('.shell').count() === 1);
  const cookies = await ctx.cookies(); const ck = cookies.find(c => c.name === '__Host-mz_admin');
  check('كوكي الجلسة __Host- HttpOnly Secure SameSite=Strict', !!ck && ck.httpOnly && ck.secure && ck.sameSite === 'Strict' && ck.path === '/');
  check('الجلسة غير مقروءة من JS', !(await p.evaluate(() => document.cookie)).includes('mz_admin'));

  // تغذية التصاميم من عملاء (عبر الواجهة العامة)
  for (let i = 0; i < 3; i++) {
    const r = await ctx.request.post(B + '/api/archive-consent/designs', { headers: { origin: B }, data: { consent: true, token: 'tok'.repeat(12) + i, doc: JSON.parse(sess.designs[0].doc), land, program: { counts: sess.input.requirements.counts }, exterior: { style: ['S', 'N', 'H'][i] } } });
    if (r.status() !== 201) check('تغذية التصميم ' + i, false, String(r.status()));
  }
  await p.click('button.nav:has-text("التصاميم السابقة")'); await p.waitForSelector('tbody tr');
  const nums = await p.locator('tbody tr td:nth-child(2)').allInnerTexts();
  check('التصاميم السابقة: مرتبة ترقيميًا (الأحدث أولًا)', nums.join() === 'D-000003,D-000002,D-000001', nums.join());
  await p.selectOption('select[aria-label="الترتيب"]', 'asc'); await p.waitForTimeout(600);
  check('الترتيب بالأقدم أولًا', (await p.locator('tbody tr td:nth-child(2)').allInnerTexts()).join() === 'D-000001,D-000002,D-000003');
  check('الجدول RTL', await p.evaluate(() => getComputedStyle(document.querySelector('table')).direction === 'rtl' && getComputedStyle(document.querySelector('th')).textAlign === 'right'));
  await p.fill('input[type=search]', 'D-000002'); await p.press('input[type=search]', 'Enter'); await p.waitForTimeout(500);
  check('البحث بالرقم', await p.locator('tbody tr').count() === 1);
  await p.fill('input[type=search]', ''); await p.press('input[type=search]', 'Enter'); await p.waitForTimeout(500);
  await p.locator('tbody tr').first().locator('button:has-text("معاينة")').click(); await p.waitForSelector('dialog[open] .plans img');
  check('المعاينة: مسقط SVG مرسوم من النموذج المخزَّن', await p.evaluate(async () => { const im = document.querySelector('dialog .plans img'); await im.decode().catch(() => {}); return im.naturalWidth > 100; }));
  check('المعاينة: الموقع مقرّب', /24\.77, 46\.74/.test(await p.locator('dialog').innerText()));
  await shot(p, 'admin-designs-preview');
  const [dl1] = await Promise.all([p.waitForEvent('download'), p.locator('dialog button:has-text("تحميل JSON")').click()]);
  const j = JSON.parse(fs.readFileSync(await dl1.path(), 'utf8')); check('تحميل ملف تصميم واحد JSON', dl1.suggestedFilename() === 'D-000001.json' && j.doc.schema === 'mizan-draw/1' && j.number === 'D-000001');
  await p.locator('dialog button:has-text("إغلاق")').click();
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("تحميل الكل (zip)")')]);
  const zbuf = fs.readFileSync(await dl2.path()); check('تحميل الكل zip (توقيع PK + ثلاثة تصاميم)', zbuf.slice(0, 2).toString() === 'PK' && (zbuf.toString('latin1').match(/design\.json/g) || []).length >= 3, String(zbuf.length));
  const [dl3] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("فهرس CSV")')]);
  check('فهرس CSV', /D-000003/.test(fs.readFileSync(await dl3.path(), 'utf8')));
  p.once('dialog', d => d.accept()); await p.locator('tbody tr').nth(1).locator('button:has-text("حذف")').click(); await p.waitForTimeout(700);
  check('حذف تصميم بتأكيد', await p.locator('tbody tr').count() === 2);
  // مفاتيح التحكم
  await p.click('button.nav:has-text("مفاتيح التحكم")'); await p.waitForSelector('.card .row');
  await p.fill('input[aria-label="رسالة الصيانة"]', 'صيانة قصيرة الليلة'); await p.locator('.row:has-text("رسالة صيانة") button').click(); await p.waitForTimeout(500);
  check('حفظ رسالة الصيانة', /تم الحفظ/.test(await p.locator('.row:has-text("رسالة صيانة")').innerText()));
  // إيقاف الصورة الاحترافية
  await p.locator('.row:has-text("الصورة الاحترافية") input[type=checkbox]').uncheck(); await p.waitForTimeout(500);
  await p.click('button.nav:has-text("نظرة عامة")'); await p.waitForSelector('.cards');
  check('نظرة عامة: عدّاد الأرشيف والخدمة موقوفة', /إجمالي الأرشيف/.test(await p.locator('.cards').innerText()) && /متوقف/.test(await p.locator('.card:has-text("الصورة الاحترافية")').innerText()));
  await p.click('button.nav:has-text("السجل والجلسات")'); await p.waitForSelector('table');
  check('سجل التدقيق يحوي الإجراءات بلا أسرار', /setting/.test(await p.locator('body').innerText()) && !(await p.locator('body').innerText()).includes(PW1));
  // خروج ثم دخول
  await p.click('button.nav:has-text("تسجيل الخروج")'); await p.waitForSelector('input[type=password]');
  check('بعد الخروج: شاشة الدخول', /دخول الإدارة/.test(await p.locator('h1').innerText()));
  await p.fill('input[type=password]', 'wrong-wrong-wrong'); await p.click('button[type=submit]'); await p.waitForTimeout(700);
  check('دخول خاطئ: رسالة عامة', /غير صحيحة/.test(await p.locator('.err').innerText()));
  await p.fill('input[type=password]', PW1); await p.click('button[type=submit]'); await p.waitForSelector('.shell');
  await p.reload(); await p.waitForSelector('.shell'); check('تحديث الصفحة داخل الجلسة يبقي الدخول (CSRF مشتق)', true);
  // تغيير كلمة السر
  await p.click('button.nav:has-text("الحساب")'); await p.waitForSelector('#apw');
  const cur = p.locator('.card:has-text("تغيير كلمة السر") input[type=password]').first(); await cur.fill(PW1); await p.fill('#apw', PW2); await p.fill('#acf', PW2);
  await p.locator('button:has-text("تغيير كلمة السر")').click(); await p.waitForTimeout(1500);
  check('تغيير كلمة السر', /تم تغيير كلمة السر/.test(await p.locator('.ok').innerText()));
  // تعطيل
  const dis = p.locator('.card:has-text("تعطيل الإدارة")'); await dis.locator('input[type=password]').fill(PW2); await dis.locator('input[type=text]').fill('احذف');
  p.once('dialog', d => d.accept()); await dis.locator('button[type=submit]').click(); await p.waitForSelector('h1:has-text("الإدارة مغلقة")', { timeout: 15000 });
  check('تعطيل الإدارة: شاشة «مغلقة»', true);
  await p.reload(); await p.waitForSelector('h1'); check('بعد التحديث تبقى مغلقة ولا إعداد أول', /مغلقة/.test(await p.locator('h1').innerText()) && await p.locator('#spw').count() === 0);
  const st = await ctx.request.get(B + '/api/admin/state'); check('API: 503 مغلقة', st.status() === 503);
  check('الإدارة: لا طلبات خارجية ولا أخطاء صفحة', external.length === 0 && errs.length === 0, external.concat(errs).join(' | '));
  await ctx.close();
}

// ================================================================ مربع الموافقة في المخرجات
{
  const { ctx, p, errs } = await ctxPage();
  const posts = []; p.on('request', q => { if (q.url().includes('/api/archive-consent') && q.method() !== 'GET') posts.push(q.method()); });
  await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); } }, seed);
  await p.goto(B + '/final.html'); await p.waitForSelector('#archiveConsentBox', { timeout: 60000 });
  check('الموافقة: المربع غير محدد مسبقًا', await p.locator('#archiveConsentBox').isChecked() === false);
  check('الموافقة: زر الحفظ معطّل قبل التحديد', await p.locator('#archiveConsentSend').isDisabled());
  check('الموافقة: نص الموافقة والخصوصية بالعربية', /دون اسمي أو بياناتي الشخصية/.test(await p.locator('#consent').innerText()) && /لا نحفظ: اسمك/.test(await p.locator('#consent').innerText()));
  await p.waitForTimeout(500); check('بلا موافقة: لا طلب كتابة إلى الأرشيف', posts.length === 0);
  await p.locator('#consent').scrollIntoViewIfNeeded(); await shot(p, 'final-consent');
  const base = env.DB.sqlite.prepare('SELECT COUNT(*) n FROM client_designs').get().n;
  await p.check('#archiveConsentBox'); await p.click('#archiveConsentSend'); await p.waitForFunction(() => /D-\d{6}/.test(document.querySelector('#consent').innerText), null, { timeout: 15000 });
  const n = env.DB.sqlite.prepare('SELECT COUNT(*) n FROM client_designs').get().n;
  const row = env.DB.sqlite.prepare('SELECT payload, geo_lat FROM client_designs ORDER BY id DESC LIMIT 1').get();
  check('بعد الموافقة: حُفظت نسخة بإحداثيات مقرّبة وبلا اسم', n === base + 1 && row.geo_lat === 24.77 && !row.payload.includes('سعد'), `rows=${n}, base=${base}`);
  check('سحب الموافقة متاح', await p.locator('#archiveConsentWithdraw').isVisible());
  await p.click('#archiveConsentWithdraw'); await p.waitForFunction(() => /سُحبت موافقتك/.test(document.querySelector('#consent').innerText));
  check('سحب الموافقة يحذف النسخة', env.DB.sqlite.prepare('SELECT COUNT(*) n FROM client_designs').get().n === base);
  check('الموافقة: لا أخطاء صفحة', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ================================================================ البدء من جديد مقابل استعادة نفس التبويب
{
  const { ctx, p, errs } = await ctxPage();
  await p.goto(B + '/home.html'); await p.waitForSelector('#start');
  await p.evaluate(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); localStorage.setItem('mizan.shara.voice', '1'); localStorage.setItem('mizan.archive.consent.v1', '{"id":9}'); }, seed);
  await p.reload(); await p.waitForSelector('#start');
  check('تحديث الصفحة داخل نفس التبويب: يستعيد مشروعه', await p.evaluate(() => !!localStorage.getItem('mizan.design.session.v1')) && await p.locator('#resumeHome').isVisible());
  check('نفس التبويب: زر «العودة إلى تصميمي»', /تصاميم|تصميم/.test(await p.locator('#resumeHomeText').innerText()));
  await p.goto(B + '/design.html'); await p.waitForTimeout(1500); await p.goto(B + '/home.html#shara'); await p.waitForTimeout(800);
  check('الرجوع من التصميم إلى شرعاء في نفس التبويب: المشروع باقٍ', await p.evaluate(() => !!localStorage.getItem('mizan.design.session.v1')));
  // تبويب جديد = دخول جديد
  const p2 = await ctx.newPage(); const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
  await p2.goto(B + '/home.html'); await p2.waitForSelector('#start');
  const after = await p2.evaluate(() => ({ s: localStorage.getItem('mizan.design.session.v1'), d: localStorage.getItem('mizan.studio.doc.v1'), voice: localStorage.getItem('mizan.shara.voice'), consent: localStorage.getItem('mizan.archive.consent.v1'), past: JSON.parse(localStorage.getItem('mizan.projects.past.v1') || 'null') }));
  check('دخول جديد: لا تصميم سابق ولا مرسم', after.s === null && after.d === null);
  check('دخول جديد: الإعدادات ومعرّف الأرشيف باقيان', after.voice === '1' && after.consent === '{"id":9}');
  check('دخول جديد: المشروع السابق في «مشاريعي السابقة»', after.past?.items?.length === 1);
  check('دخول جديد: التلميح ظاهر', /مشروعك السابق في «مشاريعي السابقة»/.test(await p2.locator('#freshNote').innerText()) && await p2.locator('#freshNote').isVisible());
  check('دخول جديد: لا زر عودة لتصميم سابق', !(await p2.locator('#resumeHome').isVisible()));
  await p2.locator('#pastBox summary').click(); check('قائمة مشاريعي السابقة فيها مدخل واحد', await p2.locator('#pastList li').count() === 1);
  await p2.locator('#pastList li button:has-text("استعادة")').click(); await p2.waitForSelector('#resumeHome', { state: 'visible', timeout: 15000 });
  check('الاستعادة تعيد المشروع', await p2.evaluate(() => !!localStorage.getItem('mizan.design.session.v1')));
  // «مشروع جديد» من داخل التبويب
  await p2.click('#start'); await p2.waitForSelector('#landLength', { state: 'visible', timeout: 15000 });
  const mid = await p2.evaluate(() => ({ s: localStorage.getItem('mizan.design.session.v1'), past: JSON.parse(localStorage.getItem('mizan.projects.past.v1')).items.length }));
  check('«مشروع جديد»: يبدأ نظيفًا ويحفظ السابق', mid.s === null && mid.past === 1);
  check('لا أخطاء صفحة', errs.length === 0 && errs2.length === 0, errs.concat(errs2).join(' | '));
  await ctx.close();
}
await br.close(); server.close();
console.log(`\n${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
