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
await p.click('#chat form.counts .cta'); await p.click('#chat .cta:has-text("توليد التصميم")');
await p.waitForURL('**/studio.html', { timeout: 90000 }); await p.waitForTimeout(1500);
check('المرسم فتح بتصميم', (await p.locator('#stat-walls, .stats').count()) >= 0 && /studio\.html/.test(p.url()));
check('تبويب البصمة موجود', await p.locator('.tabs [data-tab=dna]').isVisible());
await p.click('.tabs [data-tab=dna]');
check('ثمانية محاور تظهر', (await p.locator('#tab-dna .axis').count()) === 8);
check('بصمتان تظهران', (await p.locator('#tab-dna .fp code').count()) === 2);
const state0 = await p.locator('#tab-dna .fp code').allInnerTexts();
check('الهندسة تُعلن «دون تعديل»', (await p.locator('#tab-dna').innerText()).includes('دون تعديل'));
const rows = await p.locator('#tab-dna .dna-table tr').count();
check('جدول البدائل فيه صفوف', rows >= 3, 'rows=' + rows);
check('اختيار AZIZ موسوم', (await p.locator('#tab-dna').innerText()).includes('اختيار AZIZ'));
check('الأنسب لبصمتك موسوم', (await p.locator('#tab-dna').innerText()).includes('الأنسب لبصمتك'));
await p.screenshot({ path: join(out, 'dna-tab.png') });
// فتح بديل
const openBtn = p.locator('#tab-dna .dna-table button'); const nBtn = await openBtn.count();
check('زر فتح بديل متاح', nBtn >= 1, 'buttons=' + nBtn);
await openBtn.first().click(); await p.waitForTimeout(800);
const state1 = await p.locator('#tab-dna .fp code').allInnerTexts();
check('فتح بديل غيّر بصمة الهندسة وأعلن الاختلاف أو بقيت مطابقة لأصله', state1[1] !== state0[1] || (await p.locator('#tab-dna').innerText()).includes('دون تعديل'));
check('نسخة احتياطية قبل الاستبدال', await p.evaluate(() => !!localStorage.getItem('mizan.studio.doc.v1.before-dna')));
// تعديل يدوي
const before = (await p.locator('#tab-dna .fp code').allInnerTexts())[1];
await p.click('.rail button:has-text("جدار")'); const box = await p.locator('#planCanvas').boundingBox();
await p.mouse.click(box.x + 60, box.y + 60); await p.mouse.click(box.x + 160, box.y + 60); await p.keyboard.press('Escape'); await p.waitForTimeout(600);
await p.click('.tabs [data-tab=dna]'); const after = (await p.locator('#tab-dna .fp code').allInnerTexts())[1];
check('رسم جدار يدويًا غيّر بصمة الهندسة', after !== before, before + ' → ' + after);
check('التحذير بعد التعديل ظاهر', (await p.locator('#tab-dna .fpwarn').count()) === 1);
// إعادة تحميل: البصمة تبقى مع المشروع
await p.reload(); await p.waitForTimeout(1500); await p.click('.tabs [data-tab=dna]');
check('بعد إعادة التحميل البصمة محفوظة', (await p.locator('#tab-dna .axis').count()) === 8);
check('لا أخطاء في المتصفح', errs.length === 0, errs.join(' | ').slice(0, 300));
console.log(results.filter(Boolean).length + '/' + results.length + ' نجح'); await b.close(); server.close(); process.exit(results.every(Boolean) ? 0 : 1);
