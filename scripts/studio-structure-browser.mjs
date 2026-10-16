// فحص حي لبصمة التصميم: الصفحة الرئيسية ← شرعاء (إجابات) ← المرسم ← تبويب البصمة ← فتح بديل ← تعديل يدوي يغيّر بصمة الهندسة.
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist'), out = process.argv[2] || '/tmp/claude-0/home-shots';
await mkdir(out, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => { const f = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const errs = [];
p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.g|net::/.test(m.text())) errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.message));
p.on('dialog', d => d.accept());
await p.goto(base + '/home.html'); await p.click('#start');
await p.fill('#landLength', '30'); await p.fill('#landWidth', '20'); await p.check('input[data-kind=street][value=s]'); await p.check('input[data-kind=entry][value=s]'); await p.click('#landForm button[type=submit]');
await p.click('text=اسألني أسئلة محددة');
for (let i = 0; i < 10; i++) {
  if (await p.locator('#chat form.counts').count()) break;
  const chips = p.locator('#chat .chip[aria-pressed]'); const n = await chips.count();
  if (n) { await chips.nth(0).click(); if (n > 1) await chips.nth(1).click(); await p.locator('#chat .cta:has-text("متابعة")').last().click(); }
  else { const c = p.locator('#chat .pick .chip'); if (await c.count()) await c.first().click(); }
  await p.waitForTimeout(250);
}
await p.fill('#chat form.counts input[name=bedrooms]', '3'); await p.fill('#chat form.counts input[name=majlis]', '1');
for (const [n, v] of Object.entries({ bedrooms: 3, majlis: 1, baths: 2, kitchens: 1, halls: 1, dining: 1 })) { const i = p.locator(`#chat form.counts input[name=${n}]`); if (!(await i.inputValue())) await i.fill(String(v)); }
await p.click('#chat form.counts .cta'); await p.click('#chat .cta:has-text("توليد التصميم")');
await p.waitForURL('**/studio.html', { timeout: 90000 }); await p.waitForTimeout(1500);
check('تبويب الإنشاء موجود', await p.locator('.tabs [data-tab=str]').isVisible());
await p.click('.tabs [data-tab=str]');
await p.waitForSelector('#tab-str .dna-table', { timeout: 10000 });
const t0 = await p.locator('#tab-str').innerText();
check('تنبيه «لا تصميم إنشائي» ظاهر', t0.includes('لا تصميم إنشائي'));
check('جدول أعمدة وجسور', (await p.locator('#tab-str .dna-table').count()) >= 2);
check('غير القابل للحساب معلن', t0.includes('الأساسات'));
const before = await p.screenshot({ clip: { x: 360, y: 100, width: 700, height: 650 } });
check('اللوحة الإنشائية تظهر تلقائيًا في التبويب', (await p.locator('#tab-str .sheetprev svg').count()) === 1 && t0.includes('تُولَّد تلقائيًا'));
check('شارة عدد الأعمدة على التبويب', await p.locator('#strCount').isVisible());
await p.click('#tab-str .sheetprev'); await p.waitForSelector('#strModal .strsheet svg');
await p.screenshot({ path: out + '/sheet-modal.png' });
check('اللوحة الكاملة تُفتح وفيها جداول', (await p.locator('#strModal').innerText()).includes('جدول الأعمدة'));
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#strModal button:has-text("حمّل SVG")')]);
check('تحميل SVG', /structure-.*\.svg$/.test(dl.suggestedFilename()), dl.suggestedFilename());
await p.click('#strModal button:has-text("إغلاق")');
check('الإغلاق يخفي النافذة', !(await p.locator('#strModal').isVisible()));
await p.check('#tab-str input[type=checkbox]'); await p.waitForTimeout(500);
const after = await p.screenshot({ clip: { x: 360, y: 100, width: 700, height: 650 } });
check('تفعيل العرض يرسم فوق المسقط', Buffer.compare(before, after) !== 0);
await p.screenshot({ path: out + '/str.png' });
const n0 = (t0.match(/مقترح/g) || []).length;
await p.click('#tab-str button:has-text("اعتمد الأعمدة المقترحة")'); await p.waitForTimeout(800);
const t1 = await p.locator('#tab-str').innerText();
check('بعد الاعتماد صارت الأعمدة «رسمته»', (t1.match(/رسمته/g) || []).length >= n0 - 5 && (t1.match(/مقترح/g) || []).length < 5, 'مقترح قبل ' + n0 + ' بعد ' + (t1.match(/مقترح/g) || []).length);
await p.fill('#tab-str .strgrid input >> nth=4', '5'); await p.press('#tab-str .strgrid input >> nth=4', 'Tab'); await p.waitForTimeout(700);
const t2 = await p.locator('#tab-str').innerText();
check('تغيير الحمل الحي يعيد الحساب', t2 !== t1);
check('لا أخطاء في الصفحة', errs.length === 0, errs.join(' | ').slice(0, 200));
await b.close(); server.close();
const bad = results.filter(x => !x).length; console.log(bad ? 'FAILED ' + bad : 'ALL PASS ' + results.length); process.exit(bad ? 1 : 0);
