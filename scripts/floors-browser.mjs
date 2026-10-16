// فحص حي لدورين: الصفحة الرئيسية (عدد الأدوار = 2) ← شرعاء ← المرسم بدورين ← تبديل الدور ← المجسّم.
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist'), out = process.argv[2] || '/tmp/claude-0/floors-shots';
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
await p.fill('#landLength', '30'); await p.fill('#landWidth', '20'); await p.selectOption('#landFloors', '2');
await p.check('input[data-kind=street][value=s]'); await p.check('input[data-kind=entry][value=s]'); await p.click('#landForm button[type=submit]');
await p.click('text=اسألني أسئلة محددة');
for (let i = 0; i < 10; i++) {
  if (await p.locator('#chat form.counts').count()) break;
  const chips = p.locator('#chat .chip[aria-pressed]'); const n = await chips.count();
  if (n) { await chips.nth(0).click(); if (n > 1) await chips.nth(1).click(); await p.locator('#chat .cta:has-text("متابعة")').last().click(); }
  else { const c = p.locator('#chat .pick .chip'); if (await c.count()) await c.first().click(); }
  await p.waitForTimeout(250);
}
await p.fill('#chat form.counts input[name=bedrooms]', '4'); await p.fill('#chat form.counts input[name=majlis]', '2');
for (const [n, v] of Object.entries({ bedrooms: 3, majlis: 1, baths: 2, kitchens: 1, halls: 1, dining: 1 })) { const i = p.locator(`#chat form.counts input[name=${n}]`); if (!(await i.inputValue())) await i.fill(String(v)); }
await p.click('#chat form.counts .cta'); await p.click('#chat .cta:has-text("توليد التصميم")');
await p.waitForURL('**/design.html', { timeout: 120000 }); await p.waitForSelector('#btnStudio'); await p.click('#btnStudio'); await p.waitForURL('**/studio.html', { timeout: 30000 }); await p.waitForTimeout(1500);
const levels = p.locator('#levels button:not(.add)');
check('المرسم يعرض دورين في المحدد', (await levels.count()) === 2, 'levels=' + await levels.count());
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('mizan.studio.doc.v1') || 'null'));
check('المستند المحفوظ بدورين وفيه سلم', stored?.levels?.length === 2 && stored.stairs.length === 1, stored && `walls=${stored.walls.length} labels=${stored.labels.length}`);
await p.screenshot({ path: join(out, 'floor-ground.png') });
await levels.nth(1).click(); await p.waitForTimeout(600);
check('تبديل الدور يغيّر الدور النشط', (await p.locator('#levels button.on').innerText()) === (await levels.nth(1).innerText()));
await p.screenshot({ path: join(out, 'floor-upper.png') });
const rooms = await p.locator('#tab-rooms, #rooms').first().innerText().catch(() => '');
check('غرف العلوي: صالة علوية وغرف النوم (السلم يصعد من صالة الأرضي)', /صالة/.test(rooms) && /غرفة نوم|غرفة 1|نوم/.test(rooms), rooms.replace(/\s+/g, ' ').slice(0, 160));
check('لا أخطاء في المتصفح', errs.length === 0, errs.join(' | ').slice(0, 300));
// حالة الفشل: أرض صغيرة بدورين تعرض سببًا ولا تنتقل
await p.goto(base + '/home.html'); await p.click('#start');
await p.fill('#landLength', '12'); await p.fill('#landWidth', '10'); await p.selectOption('#landFloors', '2');
await p.check('input[data-kind=street][value=s]'); await p.check('input[data-kind=entry][value=s]'); await p.click('#landForm button[type=submit]');
await p.click('text=اسألني أسئلة محددة');
for (let i = 0; i < 10; i++) {
  if (await p.locator('#chat form.counts').count()) break;
  const chips = p.locator('#chat .chip[aria-pressed]'); const n = await chips.count();
  if (n) { await chips.nth(0).click(); await p.locator('#chat .cta:has-text("متابعة")').last().click(); }
  else { const c = p.locator('#chat .pick .chip'); if (await c.count()) await c.first().click(); }
  await p.waitForTimeout(250);
}
for (const [n, v] of Object.entries({ bedrooms: 3, majlis: 1, baths: 2, kitchens: 1, halls: 1, dining: 1 })) { const i = p.locator(`#chat form.counts input[name=${n}]`); if (!(await i.inputValue())) await i.fill(String(v)); }
await p.click('#chat form.counts .cta'); await p.click('#chat .cta:has-text("توليد التصميم")');
await p.waitForSelector('#buildReport:not([hidden])', { timeout: 120000 });
const rep = await p.locator('#buildReport').innerText();
check('تقرير الفشل يعرض الدورين والخيارات المجرَّبة', /الدور الأرضي/.test(rep) && /الدور العلوي/.test(rep) && /ينجح|لا ينجح/.test(rep));
check('رسالة الفشل بأرقام', /10×12/.test(await p.locator('#buildError').innerText()), (await p.locator('#buildError').innerText()).slice(0, 140));
await p.screenshot({ path: join(out, 'floors-fail.png') });
await b.close(); server.close();
process.exit(results.every(Boolean) ? 0 : 1);
