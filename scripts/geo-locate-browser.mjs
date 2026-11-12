// فحص متصفح لتحديد موقع الأرض: الحقل الذكي (إحداثيات، رابط جوجل، Plus Code، رابط مختصر، العنوان الوطني، اسم)، موقعي الحالي، سحب الدبوس،
// واعتماد الموقع في نموذج الأرض (land.geo + مفتاح localStorage). وكيل الوركر (worker/geo.mjs) حقيقي ومصدره Nominatim/جوجل وهمي؛ البلاطات وهمية.
// لا اتصال بأي خدمة خارجية. التشغيل: node scripts/geo-locate-browser.mjs [مجلد اللقطات] ؛ PLAYWRIGHT=… ؛ ROOT=dist
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createGeo } from '../worker/geo.mjs';
const ROOT = path.resolve(process.env.ROOT || 'dist'), SHOTS = process.argv[2] || '', PW = process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright/index.mjs';
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const upstream = [];
const geoWorker = createGeo({ sleep: async () => {}, fetchImpl: async u => {
  upstream.push(String(u));
  if (/goo\.gl/.test(u)) return new Response(null, { status: 302, headers: { Location: 'https://www.google.com/maps/place/X/@24.7,46.6,17z/data=!3d24.7743!4d46.7386' } });
  return Response.json([{ lat: '24.8123', lon: '46.7101', display_name: 'حي النرجس، الرياض، منطقة الرياض، السعودية', address: { city: 'الرياض' } }, { lat: '24.80', lon: '46.69', display_name: 'النرجس الشمالي، الرياض', address: { city: 'الرياض' } }]);
} });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
const server = http.createServer(async (q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/home.html';
  if (p.startsWith('/api/geo/')) { const res = await geoWorker.fetch(new Request('http://localhost' + q.url, { headers: { 'CF-Connecting-IP': '3.3.3.3' } }), {}); r.writeHead(res.status, Object.fromEntries(res.headers)); r.end(Buffer.from(await res.arrayBuffer())); return; }
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r);
});
await new Promise(ok => server.listen(0, ok)); const B = 'http://localhost:' + server.address().port;
const { chromium } = await import(PW);
const br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
let pass = 0, fail = 0; const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };
const shot = async (p, name, sel) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.addStyleTag({ content: '#sharaFab,.shara-fab,[id^=sharaP]{visibility:hidden!important}' }).catch(() => {}); await p.locator(sel).screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 55 }); };

async function open(viewport, { geolocation = { latitude: 24.774265, longitude: 46.738586, accuracy: 12 } } = {}) {
  const ctx = await br.newContext({ viewport, hasTouch: false, ...(geolocation ? { geolocation, permissions: ['geolocation'] } : {}) });
  const p = await ctx.newPage(), errs = [], external = [];
  p.on('pageerror', e => errs.push(e.message));
  await ctx.route(/tile\.openstreetmap\.org/, r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  p.on('request', q => { const u = q.url(); if (!u.startsWith(B) && !/openstreetmap\.org|fonts\.g/.test(u) && !/^(data|blob):/.test(u)) external.push(u); });
  await p.goto(B + '/home.html#land'); await p.waitForSelector('#landLength', { state: 'visible' });
  await p.fill('#landLength', '30'); await p.fill('#landWidth', '20'); await p.check('input[data-kind=street][value=s]'); await p.check('input[data-kind=entry][value=s]');
  await p.click('#locateBox > summary'); await p.waitForSelector('#lmSmart');
  return { ctx, p, errs, external };
}
const go = async (p, text) => { await p.fill('#lmSmart', text); await p.click('#lmSmartGo'); await p.waitForTimeout(250); };
const coords = async p => (await p.locator('#lmCoords').innerText().catch(() => '')).trim();
const msg = p => p.locator('.lm-msg').innerText();
const und = p => p.locator('#lmUnderstood').innerText().catch(() => '');
const pinCount = p => p.locator('#lmMap .lm-pin').count();

{
  const { ctx, p, errs, external } = await open({ width: 1100, height: 1000 }), T0 = '[سطح المكتب] ';
  check(T0 + 'الحقل الذكي والأزرار الثلاثة موجودة', await p.locator('#lmSmart').count() === 1 && await p.locator('#lmHere').count() === 1 && await p.locator('#lmPick').count() === 1 && await p.locator('#lmSmartGo').count() === 1);
  check(T0 + 'لا طلب إلى الوركر قبل أي إدخال عدا قائمة المزوّدين', upstream.length === 0);
  await go(p, '24.7136, 46.6753');
  check(T0 + 'إحداثيات عشرية: دبوس + عبارة «فهمت» + عرض الإحداثيات', await pinCount(p) === 1 && /فهمت إحداثيات: 24\.7136, 46\.6753/.test(await und(p)) && await coords(p) === '24.7136, 46.6753', await und(p));
  await go(p, '٢٤٫٧٧٤٢٦٥، ٤٦٫٧٣٨٥٨٦');
  check(T0 + 'أرقام عربية-هندية', await coords(p) === '24.774265, 46.738586', await coords(p));
  await go(p, 'https://www.google.com/maps/place/Kingdom+Centre/@24.7114,46.6743,17z/data=!3m1!4b1!8m2!3d24.7113!4d46.6744');
  check(T0 + 'رابط جوجل: يلتقط الدبوس الفعلي (!3d!4d) ويقول ذلك', await coords(p) === '24.7113, 46.6744' && /فهمت رابط جوجل/.test(await und(p)), await und(p));
  await go(p, 'https://www.google.com/maps/@24.7000,46.6000,17z');
  check(T0 + 'رابط بمركز عرض فقط: تنبيه أنه ليس دبوسًا دقيقًا', /ليس|لا دبوسًا|مركز عرض/.test(await msg(p)) && /مركز عرض/.test(await und(p)));
  await go(p, 'PM7G+C4 الرياض');
  check(T0 + 'Plus Code قصير مع مدينة (محليًا بلا شبكة)', /^24\.7135\d*, 46\.6753\d*$/.test(await coords(p)) && /Plus Code|رمز فتح/.test(await und(p)), await coords(p));
  check(T0 + 'Plus Code لم يُرسل أي طلب للوركر', upstream.length === 0, upstream.join(' | '));
  await go(p, '7HP8PM7G+C4');
  check(T0 + 'Plus Code كامل', /^24\.7135\d*, 46\.6753\d*$/.test(await coords(p)));
  const before = await coords(p);
  await go(p, 'RRRD2929');
  check(T0 + 'العنوان الوطني: رسالة «غير مفعّلة حاليًا» مع البدائل ولا يتحرك الدبوس', /غير مفعّلة حاليًا/.test(await msg(p)) && /رابط الموقع/.test(await msg(p)) && await coords(p) === before, await msg(p));
  await go(p, '95, 46');
  check(T0 + 'إحداثيات خارج النطاق: خطأ مفهوم', /خارج النطاق/.test(await msg(p)));
  // رابط مختصر: يمر عبر الوركر الذي يفتح النطاق المسموح فقط
  await p.waitForTimeout(1100); await go(p, 'https://maps.app.goo.gl/AbCdEf123');
  await p.waitForFunction(() => /24\.7743/.test(document.querySelector('#lmCoords')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check(T0 + 'الرابط المختصر: حُلّ خادميًا إلى الدبوس الصحيح', await coords(p) === '24.7743, 46.7386' && /مختصر/.test(await und(p)), await und(p));
  check(T0 + 'الوركر فتح رابط القائمة المسموحة فقط', upstream.length === 1 && upstream[0] === 'https://maps.app.goo.gl/AbCdEf123', upstream.join(' | '));
  // البحث بالاسم: لا إكمال تلقائي، وبزر صريح، عبر الوكيل
  await p.waitForTimeout(1600); upstream.length = 0;
  await p.fill('#lmSmart', 'حي النرجس'); await p.waitForTimeout(500);
  check(T0 + 'لا إكمال تلقائي: الكتابة وحدها لا ترسل طلبًا', upstream.length === 0);
  await p.click('#lmSmartGo'); await p.waitForSelector('#lmResults .lm-hit');
  check(T0 + 'البحث: طلب واحد عبر الوكيل بـ countrycodes=sa وaccept-language=ar', upstream.length === 1 && /countrycodes=sa/.test(upstream[0]) && /accept-language=ar/.test(upstream[0]) && /nominatim\.openstreetmap\.org/.test(upstream[0]), upstream[0]);
  check(T0 + 'الإسناد لـ OpenStreetMap ظاهر تحت النتائج', /OpenStreetMap/.test(await p.locator('#lmResults .lm-credit').innerText()) && await p.locator('#lmResults .lm-hit').count() === 2);
  await p.click('#lmSmartGo'); await p.waitForTimeout(200); check(T0 + 'النتيجة نفسها من الذاكرة بلا طلب ثانٍ', upstream.length === 1);
  await p.locator('#lmResults .lm-hit').first().click(); await p.waitForTimeout(300);
  check(T0 + 'اختيار نتيجة ينقل الخريطة ويطلب وضع الدبوس', /اضغط على موضع أرضك/.test(await msg(p)) && await pinCount(p) === 0);
  await p.waitForTimeout(1600); await p.check('#lmWorld'); await p.fill('#lmSmart', 'Paris'); await p.click('#lmSmartGo'); await p.waitForSelector('#lmResults .lm-hit');
  check(T0 + '«كل العالم»: بلا countrycodes', upstream.length === 2 && !/countrycodes/.test(upstream[1]), upstream[1]); await p.uncheck('#lmWorld');
  // الضغط على الخريطة يضع الدبوس؛ وسحبه يضبطه
  await go(p, '24.7136, 46.6753'); const c0 = await coords(p);
  const pb = await p.locator('#lmMap .lm-pin path').boundingBox(), cx = pb.x + pb.width / 2, cy = pb.y + pb.height * 0.6;
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 60, cy + 30, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
  check(T0 + 'سحب الدبوس يغيّر الإحداثيات ويعلن ذلك', await coords(p) !== c0 && /ضبطت الدبوس يدويًا/.test(await und(p)), `${c0} → ${await coords(p)}`);
  const mb = await p.locator('#lmMap').boundingBox(); await p.click('#lmClear'); await p.waitForTimeout(100);
  check(T0 + 'المسح يزيل الدبوس والإحداثيات', await pinCount(p) === 0 && !(await p.locator('#lmCoords').isVisible()));
  await p.click('#lmPick'); check(T0 + '«حدّد على الخريطة» يشرح الخطوة', /اضغط على موضع أرضك/.test(await msg(p)));
  await p.mouse.click(mb.x + mb.width * 0.4, mb.y + mb.height * 0.5); await p.waitForTimeout(250);
  check(T0 + 'نقرة على الخريطة تضع الدبوس وتعرض الإحداثيات', await pinCount(p) === 1 && /^\d+\.\d+, \d+\.\d+$/.test(await coords(p)), await coords(p));
  // موقعي الحالي
  await p.click('#lmHere'); await p.waitForFunction(() => /24\.7742/.test(document.querySelector('#lmCoords')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check(T0 + 'موقعي الحالي: دبوس عند إحداثيات المتصفح ومعها الدقة', /^24\.7742\d*, 46\.7385\d*$/.test(await coords(p)) && /نحو 12 م/.test(await msg(p)), await coords(p) + ' | ' + await msg(p));
  await shot(p, 'desktop-1-locate', '#locateBox');
  // الاعتماد ← حقول النموذج ومفتاح الشمس
  await p.click('#lmDraw'); await p.waitForTimeout(300); await p.click('#lmApply'); await p.waitForTimeout(300);
  check(T0 + 'الاعتماد: حالة الموقع تعرض الإحداثيات', /24\.7742\d.*46\.7385\d/.test(await p.locator('#geoState').innerText()), await p.locator('#geoState').innerText());
  await p.click('#landForm button[type=submit]'); await p.waitForTimeout(800); // المتابعة تكتب مفتاح الموقع للشمس
  const key = await p.evaluate(() => JSON.parse(localStorage.getItem('mizan.land.geo.v1') || 'null'));
  check(T0 + 'مفتاح الموقع محفوظ في المتصفح (للشمس) ومدينة الرياض مقترحة', key && Math.abs(key.lat - 24.774265) < 1e-3 && key.source === 'map' && await p.inputValue('#landCity') === 'riyadh', JSON.stringify(key));
  check(T0 + 'سطر الخصوصية: الإحداثيات تبقى في المتصفح ويذكر من يستلم نص البحث', /تبقى في متصفحك ولا تُرسل إلى خادم الميزان/.test(await p.locator('#lmPrivacy').innerText()) && /Nominatim/.test(await p.locator('#lmPrivacy').innerText()));
  check(T0 + 'لا طلب خارجي غير OSM (خطوط/بلاطات) من الصفحة', external.length === 0, external.join(' | '));
  check(T0 + 'لا أخطاء صفحة', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{ // رفض إذن الموقع: رسالة مفهومة
  const { ctx, p } = await open({ width: 1100, height: 1000 }, { geolocation: null }), T0 = '[بلا إذن الموقع] ';
  await p.addInitScript(() => {}); await p.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, err) => err({ code: 1 }); });
  await p.click('#lmHere'); await p.waitForTimeout(200);
  check(T0 + 'رفض الإذن: رسالة عربية مفهومة وبدائل', /إذن الموقع/.test(await msg(p)) && /الصق|اضغط على الخريطة/.test(await msg(p)) && await pinCount(p) === 0, await msg(p));
  await ctx.close();
}
{ // جوال
  const { ctx, p } = await open({ width: 390, height: 900 }), T0 = '[جوال] ';
  await go(p, 'https://www.google.com/maps?q=24.7136,46.6753');
  check(T0 + 'رابط جوجل على الجوال', await coords(p) === '24.7136, 46.6753');
  check(T0 + 'لا تمرير أفقي', await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
  await shot(p, 'mobile-1-locate', '#locateBox');
  await ctx.close();
}
await br.close(); server.close();
console.log(`\n${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
