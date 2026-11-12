// فحص متصفح: موقع الأرض على الخريطة ← الاشتراطات ← الشمس والتوجيه (سطح مكتب وجوال)، بخادم بلاطات وهمي.
// لا يتصل بأي خدمة خارجية: بلاطات OpenStreetMap و Nominatim تُعترض وتُجاب محليًا — فالبلاطات الحقيقية والبحث الحقيقي «غير متحقق» هنا.
// التشغيل: node scripts/regs-sun-browser.mjs [مجلد اللقطات] ؛ PLAYWRIGHT=/path/to/playwright/index.mjs ؛ ROOT=dist أو dist/client
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const ROOT = path.resolve(process.env.ROOT || 'dist'), SHOTS = process.argv[2] || '', PW = process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright/index.mjs';
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/home.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(r); });
await new Promise(ok => server.listen(0, ok)); const B = 'http://localhost:' + server.address().port;

/** بلاطة PNG وهمية 256×256: شبكة شوارع رمادية على أرضية فاتحة، ولونها يتبع رقم البلاطة (لتمييز البلاطات في اللقطة). */
function fakeTile(z, x, y) {
  const N = 256, raw = Buffer.alloc((N * 3 + 1) * N), tint = ((x * 7 + y * 13) % 5) * 4;
  for (let j = 0; j < N; j++) { raw[j * (N * 3 + 1)] = 0; for (let i = 0; i < N; i++) { const road = i % 64 < 5 || j % 64 < 5, edge = i === 0 || j === 0, o = j * (N * 3 + 1) + 1 + i * 3, c = edge ? [150, 150, 160] : road ? [255, 255, 255] : [232 - tint, 226 - tint, 214 - tint]; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; } }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]), cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const { chromium } = await import(PW);
const br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
let pass = 0, fail = 0; const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };
const shot = async (p, name, sel) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.addStyleTag({ content: '.ph,#home .bar{position:static!important}#sharaFab,.shara-fab,[id^=sharaP]{visibility:hidden!important}' }).catch(() => {}); await p.locator(sel).screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 70 }); };

async function journey(label, viewport, { tiles = true } = {}) {
  const ctx = await br.newContext({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500, geolocation: { latitude: 24.774265, longitude: 46.738586, accuracy: 12 }, permissions: ['geolocation'] });
  const p = await ctx.newPage(), errs = [], tileReq = [], geoReq = [], other = [];
  p.on('pageerror', e => errs.push(e.message));
  await ctx.route(/tile\.openstreetmap\.org/, r => { const u = r.request().url(); tileReq.push({ u, referer: r.request().headers().referer || '' }); const m = u.match(/\/(\d+)\/(\d+)\/(\d+)\.png$/); return tiles && m ? r.fulfill({ status: 200, contentType: 'image/png', headers: { 'cache-control': 'max-age=604800' }, body: fakeTile(+m[1], +m[2], +m[3]) }) : r.abort(); });
  await ctx.route(/nominatim\.openstreetmap\.org/, r => { geoReq.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([{ lat: '24.7743', lon: '46.7386', display_name: 'حي النرجس، الرياض، منطقة الرياض، السعودية', address: { city: 'الرياض', state: 'منطقة الرياض' } }]) }); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  p.on('request', q => { const u = q.url(); if (!u.startsWith(B) && !/openstreetmap\.org|fonts\.g/.test(u) && !u.startsWith('data:') && !u.startsWith('blob:')) other.push(u); });
  const T0 = `[${label}] `;
  await p.goto(B + '/home.html#land'); await p.waitForSelector('#landLength', { state: 'visible' });
  check(T0 + 'لا طلب بلاطات قبل فتح الخريطة', tileReq.length === 0, String(tileReq.length));
  await p.fill('#landLength', '30'); await p.fill('#landWidth', '20'); await p.check('input[data-kind=street][value=s]'); await p.check('input[data-kind=entry][value=s]');
  check(T0 + 'بطاقة «وضع أرضك» تظهر بعد إدخال الأرض', await p.locator('#landBrief:visible').count() === 1);
  const brief0 = await p.locator('#landBrief').innerText();
  check(T0 + 'البطاقة بالأرقام (600 م²، ارتداد أمامي 3 م، موقفان)', /600 م²/.test(brief0) && /الارتداد الأمامي[^\n]*3 م/.test(brief0) && /موقفان/.test(brief0) && /أدخل عرض الشارع للدقة/.test(brief0), brief0.slice(0, 160).replace(/\n/g, ' '));
  await p.fill('input[data-kind=width][data-side=s]', '20');
  const brief1 = await p.locator('#landBrief').innerText();
  check(T0 + 'عرض الشارع 20 م ← الارتداد الأمامي 4 م والمسطح 17 × 24.5', /الارتداد الأمامي[^\n]*: 4 م/.test(brief1) && /17 × 24.5 م = 416.5 م²/.test(brief1) && !/أدخل عرض الشارع للدقة/.test(brief1));
  check(T0 + 'تنبيه الصدق ثابت في البطاقة', /مطابقة أولية للاشتراطات العامة للوزارة/.test(brief1));
  // ---- الخريطة
  await p.click('#locateBox > summary'); await p.waitForSelector('#lmMap');
  await p.waitForFunction(() => document.querySelectorAll('#lmMap .lm-tiles img').length > 0, null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(500);
  if (tiles) check(T0 + 'بلاطات المشهد تُطلب بعد الفتح فقط، بالرابط القياسي ومع Referer', tileReq.length > 0 && tileReq.length <= 30 && tileReq.every(t => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(t.u)) && tileReq.every(t => t.referer.startsWith(B)), `${tileReq.length} طلبًا`);
  check(T0 + 'الإسناد «© مساهمو OpenStreetMap» ظاهر فوق الخريطة', await p.locator('#lmMap .lm-attr:visible').innerText() === '© مساهمو OpenStreetMap');
  await p.fill('#lmPaste', 'https://maps.app.goo.gl/AbCdEf'); await p.click('#lmPasteGo');
  check(T0 + 'الرابط المختصر: رسالة صريحة', /رابط مختصر/.test(await p.locator('.lm-msg').innerText()));
  await p.fill('#lmPaste', 'https://www.google.com/maps/place/X/@24.7135,46.6752,17z/data=!3d24.774265!4d46.738586'); await p.click('#lmPasteGo'); await p.waitForTimeout(500);
  check(T0 + 'رابط Google ← دبوس', await p.locator('#lmMap .lm-pin').count() === 1 && /وُضع الدبوس/.test(await p.locator('.lm-msg').innerText()));
  check(T0 + 'اقتُرحت أقرب مدينة (الرياض)', await p.inputValue('#landCity') === 'riyadh');
  await p.click('#lmDraw'); await p.waitForTimeout(400);
  check(T0 + 'ظهر مستطيل الأرض بأضلاعه الأربعة', await p.locator('#lmMap .lm-poly').count() === 1 && await p.locator('#lmMap .lm-grip').count() === 4);
  // تدوير 100° من الشريط (لوحة مفاتيح/وصولية) ← عند الاعتماد يتبادل الطول والعرض وينتقل الشارع
  await p.locator('#lmRot').evaluate(n => { n.value = '100'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  check(T0 + 'نص الشمال يشرح الانحراف أثناء التدوير', /منحرف 10° نحو الشرق/.test(await p.locator('#lmNorth').innerText()), await p.locator('#lmNorth').innerText());
  await shot(p, `${label}-1-map-rect`, '#locateBox');
  // النقر على ضلع يعلّمه شارعًا (الضلع الشمالي للمستطيل)
  await p.locator('#lmMap').evaluate(n => n.scrollIntoView({ block: 'center' })); await p.waitForTimeout(250);
  const grip = p.locator('#lmMap .lm-grip[data-side=n]'); let gb = await grip.boundingBox();
  const hit = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('class') || '', [gb.x + gb.width / 2, gb.y + gb.height / 2]);
  if (!/lm-grip/.test(hit)) { console.log('  (المقبض محجوب بـ«' + hit + '»؛ أعيد التمرير)'); await p.locator('#lmMap').evaluate(n => n.scrollIntoView({ block: 'end' })); await p.waitForTimeout(400); gb = await grip.boundingBox(); }
  await p.mouse.click(gb.x + gb.width / 2, gb.y + gb.height / 2); await p.waitForTimeout(200);
  check(T0 + 'النقر على ضلع ← شارع في النموذج', await p.isChecked('input[data-kind=street][value=n]'));
  gb = await grip.boundingBox(); await p.mouse.click(gb.x + gb.width / 2, gb.y + gb.height / 2); await p.waitForTimeout(200);
  check(T0 + 'نقرة ثانية تعيده جارًا', !(await p.isChecked('input[data-kind=street][value=n]')));
  // سحب منتصف الضلع الشرقي للخارج ← يزيد العرض
  { const g = await p.locator('#lmMap .lm-grip[data-side=e]').boundingBox(), c = await p.locator('#lmMap .lm-pin').boundingBox(), cx = c.x + c.width / 2, cy = c.y + c.height, gx = g.x + 6, gy = g.y + 6, ux = gx - cx, uy = gy - cy, ul = Math.hypot(ux, uy);
    await p.mouse.move(gx, gy); await p.mouse.down(); await p.mouse.move(gx + ux / ul * 14, gy + uy / ul * 14, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(200);
    const w = Number(await p.inputValue('#landWidth')); check(T0 + 'سحب الضلع يحدّث حقل العرض', w > 20 && w <= 40 && w * 2 === Math.round(w * 2), 'العرض ' + w); await p.fill('#landWidth', '20'); }
  await p.click('#lmApply'); await p.waitForTimeout(300);
  const after = { L: await p.inputValue('#landLength'), W: await p.inputValue('#landWidth'), w: await p.isChecked('input[data-kind=street][value=w]'), s: await p.isChecked('input[data-kind=street][value=s]'), ew: await p.isChecked('input[data-kind=entry][value=w]'), sw: await p.inputValue('input[data-kind=width][data-side=w]') };
  check(T0 + 'الاعتماد: تبادل الطول والعرض وانتقل الشارع والمدخل وعرضه إلى الضلع الغربي', after.L === '20' && after.W === '30' && after.w && !after.s && after.ew && after.sw === '20', JSON.stringify(after));
  check(T0 + 'حالة الموقع: إحداثيات وانحراف 10° وخصوصية', /24\.7742\d.*46\.7385\d/.test(await p.locator('#geoState').innerText()) && /منحرف 10° نحو الشرق/.test(await p.locator('#geoState').innerText()) && /متصفحك فقط/.test(await p.locator('#geoState').innerText()));
  check(T0 + 'سطر الخصوصية ظاهر', /تبقى في متصفحك ولا تُرسل إلى خادم الميزان/.test(await p.locator('.lm-privacy').innerText()));
  // البحث بالاسم: زر صريح، طلب واحد، بلغة ar وحصر sa
  await p.fill('#lmSearch', 'النرجس'); await p.waitForTimeout(400);
  check(T0 + 'لا إكمال تلقائي: الكتابة وحدها لا ترسل طلبًا', geoReq.length === 0);
  await p.click('#lmSearchGo'); await p.waitForSelector('#lmResults .lm-hit');
  check(T0 + 'البحث بزر صريح: طلب واحد (countrycodes=sa، accept-language=ar)', geoReq.length === 1 && /countrycodes=sa/.test(geoReq[0]) && /accept-language=ar/.test(geoReq[0]) && /Nominatim/.test(await p.locator('#lmResults').innerText()));
  await p.click('#lmSearchGo'); await p.waitForTimeout(200); check(T0 + 'النتيجة نفسها من الذاكرة بلا طلب ثانٍ', geoReq.length === 1);
  await p.locator('#lmMap').focus(); await p.keyboard.press('Escape');
  // أعد الموقع المعتمد (البحث ينقل العرض فقط؛ الدبوس المعتمد محفوظ في النموذج)
  await shot(p, `${label}-2-land-brief`, '#landBrief');
  const mobileOverflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(T0 + 'لا تمرير أفقي في خطوة الأرض', mobileOverflow <= 1, String(mobileOverflow));
  // ---- إلى شرعاء ثم التوليد
  await p.click('#landForm button[type=submit]'); await p.waitForTimeout(800);
  const geoKey = await p.evaluate(() => JSON.parse(localStorage.getItem('mizan.land.geo.v1') || 'null'));
  check(T0 + 'الموقع محفوظ في المتصفح بمفتاحه (للشمس في المجسم)', geoKey && Math.abs(geoKey.lat - 24.774265) < 1e-5 && geoKey.north === 10 && geoKey.source === 'map', JSON.stringify(geoKey));
  await p.click('text=أتحدث بحرية'); await p.waitForTimeout(300);
  await p.fill('#chat textarea', 'ابي فيلا دورين 4 غرف نوم ومجلس وصالة ومطبخ'); await p.click('#chat .free .cta'); await p.waitForSelector('#program', { timeout: 90000 });
  await p.click('#chat .cta:has-text("توليد التصميم")'); await p.waitForURL(/\/design(\.html)?/, { timeout: 300000 }); await p.waitForSelector('#sunCard', { timeout: 60000 }); await p.waitForTimeout(1800);
  // ---- صفحة التصميم
  const land = await p.evaluate(() => globalThis.__mizanDesign.session.input.land);
  check(T0 + 'أرض الجلسة تحمل الموقع وعرض الشارع', land.geo?.source === 'map' && land.geo.north === 10 && land.streetWidths?.w === 20 && land.width === 30 && land.length === 20, JSON.stringify(land));
  const regs = await p.locator('#regsCard').innerText(), sum = await p.locator('#regsSummary').innerText();
  check(T0 + 'بطاقة المطابقة: ملخص أعلى (مطابق/يُراجع/مخالف)', /\d+ مطابق/.test(sum) && /\d+ يُراجع/.test(sum) && /\d+ مخالف/.test(sum), sum.replace(/\n/g, ' '));
  check(T0 + 'الارتداد الأمامي محسوب من عرض الشارع 20 م (المطلوب 4 م) بالمطلوب والموجود', /شارع 20 م\): المطلوب 4 م والموجود/.test(regs), (regs.match(/الواجهة[^\n]{0,120}/) || [''])[0]);
  check(T0 + 'تنبيه الصدق في بطاقة المطابقة', /مطابقة أولية للاشتراطات العامة للوزارة؛ أنظمة البناء تختلف بحسب الأمانة والمخطط المعتمد لحيّك، والاعتماد للمكتب الهندسي والبلدية/.test(regs));
  check(T0 + 'بنود «يُراجع» لا تُعرض حكمًا', await p.locator('#regsCard .rg[data-rule=ground_level][data-verdict=review]').count() === 1 && await p.locator('#regsCard .rg[data-rule=entry_car][data-verdict=review]').count() === 1);
  const sun = await p.locator('#sunCard').innerText(), score = Number(await p.locator('#sunCard').getAttribute('data-score'));
  check(T0 + 'بطاقة الشمس: درجة 0–100 وسطران', score >= 0 && score <= 100 && new RegExp(`التوجيه: ${score}/100`).test(sun) && (await p.locator('#sunLines').innerText()).length > 20, `الدرجة ${score}`);
  check(T0 + 'الحساب لموقع الأرض على الخريطة وبالشمال الحقيقي', /موقع أرضك على الخريطة/.test(await p.locator('#sunSite').innerText()) && /منحرف 10° نحو الشرق/.test(await p.locator('#sunSite').innerText()));
  check(T0 + 'الرسم: مسارا الصيف والشتاء والبوصلة ونوافذ ملوّنة وظل', await p.locator('#sunCard .sf-path.summer').count() === 1 && await p.locator('#sunCard .sf-path.winter').count() === 1 && await p.locator('#sunCard .sf-card.n').count() === 1 && await p.locator('#sunCard .sf-win').count() > 3 && await p.locator('#sunCard .sf-shadow polygon').count() > 2);
  const now1 = await p.locator('#sunNow').innerText();
  await p.locator('#sunHour').evaluate(n => { n.value = '8'; n.dispatchEvent(new Event('input', { bubbles: true })); }); await p.locator('#sunMonth').evaluate(n => { n.value = '12'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  const now2 = await p.locator('#sunNow').innerText();
  check(T0 + 'المنزلقان يحرّكان الشمس والظل (ديسمبر 08:00 ← الجنوب الشرقي)', now1 !== now2 && /ديسمبر/.test(now2) && /الجنوب الشرقي/.test(now2) && /بتوقيت المملكة/.test(now2), now2);
  await p.locator('#sunHour').evaluate(n => { n.value = '20'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  const badges = await p.locator('.history button .ori').count(), nDesigns = await p.locator('.history button').count();
  check(T0 + 'كل بديل يحمل شارة التوجيه، وواحد على الأقل «الأفضل توجيهًا»', nDesigns >= 2 && badges === nDesigns && await p.locator('.history button .ori.best').count() >= 1, `${badges}/${nDesigns}`);
  check(T0 + 'شارة التوجيه وسطراها أعلى الصفحة', /التوجيه: \d+\/100/.test(await p.locator('#orientBadge').innerText()));
  check(T0 + 'ترتيب التصاميم بالتوجيه', await p.locator('#sunRank li').count() === nDesigns);
  await p.locator('#sunHour').evaluate(n => { n.value = '15'; n.dispatchEvent(new Event('input', { bubbles: true })); }); await p.locator('#sunMonth').evaluate(n => { n.value = '6'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  await shot(p, `${label}-3-sun-card`, '#sunCard');
  await shot(p, `${label}-4-regs-card`, '#regsCard');
  // التبديل إلى بديل آخر يحدّث البطاقتين
  const before = { sum: await p.locator('#regsCard').getAttribute('data-summary'), score, plan: await p.evaluate(() => globalThis.__mizanDesign.session.current) };
  const other2 = p.locator('#sunRank button:not([disabled])').first(); await other2.click(); await p.waitForTimeout(900);
  const cur2 = await p.evaluate(() => globalThis.__mizanDesign.session.current), score2 = Number(await p.locator('#sunCard').getAttribute('data-score')), badge2 = await p.locator('#orientBadge .ori-badge').innerText();
  check(T0 + 'البطاقتان تتحدثان مع البديل', cur2 !== before.plan && badge2 === `التوجيه: ${score2}/100` && await p.locator('#regsCard .rg').count() > 8, `التصميم ${cur2 + 1}: ${score2}`);
  // طلب بالكلام عبر مسار الملاحظات القائم
  await p.click('#sunCard [data-sun-ask]'); check(T0 + 'طلب التوجيه يفتح ملاحظات شرعاء بنص جاهز', await p.locator('#shara:visible').count() === 1 && /في جهة/.test(await p.inputValue('#fbText'))); await p.click('#fbClose');
  // الطي يُحفظ
  await p.click('#regsCard .fold > summary'); check(T0 + 'البطاقة قابلة للطي', !(await p.locator('#regsCard .fold').evaluate(n => n.open)));
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(T0 + 'لا تمرير أفقي في صفحة التصميم', ov <= 1, String(ov));
  // الاعتماد ← المستند المسلَّم للمجسم يحمل الشمال الحقيقي
  await p.evaluate(() => document.querySelector('#btnApprove').click()); await p.waitForTimeout(400);
  const north = await p.evaluate(() => JSON.parse(localStorage.getItem('mizan.studio.doc.v1') || '{}').north);
  check(T0 + 'المستند المعتمد يحمل الشمال الحقيقي (للمجسم والمخططات)', north === 10, String(north));
  check(T0 + 'لا أخطاء صفحة', errs.length === 0, errs.slice(0, 3).join(' | '));
  check(T0 + 'لا اتصال بأي خادم خارجي غير OpenStreetMap', other.length === 0, other.slice(0, 3).join(' '));
  await ctx.close();
}

/** السقوط الآمن: بلاطات محجوبة ← الإدخال اليدوي يعمل والمستطيل يُرسم بلا صور. */
async function offline() {
  const ctx = await br.newContext({ viewport: { width: 390, height: 780 } }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route(/openstreetmap\.org/, r => r.abort()); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.goto(B + '/home.html#land'); await p.waitForSelector('#landLength', { state: 'visible' });
  await p.fill('#landLength', '30'); await p.fill('#landWidth', '12.5'); await p.check('input[data-kind=street][value=s]'); await p.check('input[data-kind=entry][value=s]');
  await p.click('#locateBox > summary'); await p.waitForSelector('#lmMap'); await p.waitForTimeout(1200);
  check('[بلا بلاطات] رسالة واضحة والخريطة لا تعطّل النموذج', await p.locator('#lmWarn:visible').count() === 1 && /تعذّر تحميل صور الخريطة/.test(await p.locator('#lmWarn').innerText()));
  await p.fill('#lmPaste', '21.4858, 39.1925'); await p.click('#lmPasteGo'); await p.click('#lmDraw'); await p.click('#lmApply'); await p.waitForTimeout(200);
  check('[بلا بلاطات] الإحداثيات والمستطيل والاعتماد تعمل بلا صور', /21\.4858/.test(await p.locator('#geoState').innerText()) && await p.inputValue('#landCity') === 'jeddah');
  const t = await p.locator('#landBrief').innerText(); check('[بلا بلاطات] بطاقة وضع الأرض 12.5×30: 375 م² وموقف واحد', /375 م²/.test(t) && /موقف واحد/.test(t));
  await p.click('#landForm button[type=submit]'); await p.waitForTimeout(600); check('[بلا بلاطات] المتابعة إلى شرعاء تعمل', /#shara$/.test(p.url()) && errs.length === 0, errs.join('|'));
  await ctx.close();
}
try {
  await journey('desktop', { width: 1366, height: 900 });
  await journey('mobile', { width: 390, height: 800 });
  await offline();
} catch (e) { fail++; console.log('FAIL خطأ في الرحلة — ' + (e.stack || e.message).split('\n').slice(0, 4).join(' ')); }
await br.close(); server.close();
console.log(`\n${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
