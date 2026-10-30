// رحلة متصفح فعلية لشرعاء V2: أرض 25×12.5 مدخل شمالي، برنامج بسيط، المسار الموجَّه، ثم التوليد الحقيقي وعرض البدائل.
// التشغيل: node scripts/e2e-sharaa-v2.mjs [مسار-لقطات]  (يحتاج playwright ومتصفحًا مثبتًا)
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const shots = process.argv[2] || '/tmp';
const PORT = 8127, ORIGIN = 'http://localhost:' + PORT;
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = createServer((req, res) => { const p = new URL(req.url, ORIGIN).pathname; const f = join(root, p === '/' ? 'home.html' : p); if (existsSync(f)) { res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); } else { res.writeHead(404); res.end(); } }).listen(PORT);
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log('CONSOLE', m.type(), m.text().slice(0, 200)); });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.route(/workers\.dev/, r => r.abort());
const T = async sel => (await page.innerText(sel).catch(() => '')).replace(/\n+/g, ' | ');
await page.goto(ORIGIN + '/home.html'); await page.click('#start');
await page.fill('#landLength', '25'); await page.fill('#landWidth', '12.5');
await page.check('input[data-kind="street"][value="n"]'); await page.check('input[data-kind="entry"][value="n"]');
await page.click('#landForm button[type=submit]');
await page.waitForSelector('#stageShara:not([hidden])', { timeout: 10000 });
await page.waitForSelector('#chat button', { timeout: 10000 });
console.log('LAND-BAR:', await T('#landBar'));
console.log('START:', (await T('#chat')).slice(0, 400));
console.log('PATH-SWITCH:', await T('#pathSwitch'));
await page.screenshot({ path: shots + '/sharaa-1-start.png', fullPage: true });
await page.click('#pathSwitch button:has-text("أسئلة موجهة")');
await page.waitForTimeout(500);
const asked = [];
for (let i = 0; i < 25; i++) {
  const nums = await page.$$('#chat input[type=number]');
  if (nums.length >= 6) { const vals = ['3', '1', '3', '1', '1', '0']; for (let k = 0; k < 6; k++) await nums[k].fill(vals[k]); asked.push('COUNTS-FORM: ' + (await page.$$eval('#chat label', ls => ls.map(l => l.innerText.trim()).join(' / ')))); await page.click('#chat button:has-text("متابعة")'); await page.waitForTimeout(600); continue; }
  if (nums.length === 2 && /أفراد الأسرة الحاليين/.test(await nums[0].evaluate(el => el.closest('form').innerText))) { await nums[0].fill('5'); asked.push(i + ' HOUSEHOLD: 5 أفراد'); }
  const gen = await page.$('#chat button:has-text("أؤكد وأبدأ"), #chat button:has-text("أفهم القيود")');
  if (gen) break;
  const start = await page.$('#chat button:has-text("ابدأ التصميم")'); if (start) { asked.push(i + ' START-DESIGN-CHOICE'); await start.click(); await page.waitForTimeout(600); continue; }
  const last = (await T('#chat')).slice(-260) + ' ## ERR: ' + (await T('#chatError')); asked.push(i + ' Q: ' + last);
  let btn = null;
  for (const w of ['لا يهم', 'لا أحتاج', 'تخطّي', 'تسجيل', 'متابعة', 'اعتمد']) { btn = await page.$(`#chat button:has-text("${w}")`); if (btn) break; }
  if (!btn) btn = (await page.$('#chat button:has-text("متابعة")')) || (await page.$('#chat button:has-text("اعتمد")')) || (await page.$('#chat .controls button, #chat button.chip, #chat button.opt'));
  if (!btn) break; await btn.click(); await page.waitForTimeout(500);
}
console.log('ASKED:\n' + asked.join('\n'));
console.log('PROFILE:', (await T('#liveProfile')).slice(0, 700));
await page.screenshot({ path: shots + '/sharaa-2-profile.png', fullPage: true });
const go = await page.$('#chat button:has-text("أؤكد وأبدأ"), #chat button:has-text("أفهم القيود")');
console.log('REVIEW:', (await T('#chat')).slice(-700));
// الرحلة بخطوتين متعمَّدتين: «أؤكد وأبدأ» تثبّت الملف وتعرض زر «توليد التصميم»، والتوليد يبدأ بضغطه (home.mjs: kind==='generate').
// (كان هذا السكربت يتوقف بعد الخطوة الأولى وينتظر نتيجة لا تُطلَق أبدًا — وهذا هو «التعليق» الذي ورد في التقرير السابق.)
const OUTCOME_MS = Number(process.env.MIZAN_E2E_OUTCOME_MS) || 180000;   // مهلة معقولة للنتيجة: 3 دقائق (القياس الفعلي ≈ 9 ث)
let failed = null; const t0 = Date.now();
if (go) { await go.click(); } else { console.log('NO-GENERATE-BUTTON'); failed = 'NO-GENERATE-BUTTON'; }
if (!failed) {
  const gen2 = await page.waitForSelector('#chat button:has-text("توليد التصميم")', { timeout: 15000 }).catch(() => null);
  if (!gen2) { failed = 'NO-GENERATE-STEP-AFTER-CONFIRM'; console.log(failed, '| CHAT-TAIL:', (await T('#chat')).slice(-300)); }
  else { console.log('CONFIRM-OK: زر «توليد التصميم» ظهر بعد', Date.now() - t0, 'ms'); await gen2.click(); }
}
if (!failed) {
  await Promise.race([page.waitForURL(/design|studio/, { timeout: OUTCOME_MS }), page.waitForSelector('#buildReport:not([hidden])', { timeout: OUTCOME_MS })])
    .catch(() => { failed = 'NO-OUTCOME-IN-' + Math.round(OUTCOME_MS / 1000) + 's'; console.log(failed, '| BUILD-TEXT:', ''); });
  console.log('OUTCOME-MS:', Date.now() - t0);
}
console.log('URL:', page.url());
console.log('BUILD-REPORT:', (await T('#buildReport')).slice(0, 1800));
console.log('BUTTONS:', JSON.stringify(await page.$$eval('#buildReport button', bs => bs.map(b => b.innerText.trim()))));
await page.screenshot({ path: shots + '/sharaa-3-outcome.png', fullPage: true });
// ضغط خيار «موقف موازٍ» ثم «فصل المجلس» بموافقة صريحة، إن عُرضا
for (const name of ['قبول موقف موازٍ', 'فصل المجلس عن غرفة الطعام']) {
  const row = await page.$(`#buildReport .alt:has(strong:has-text("${name}"))`);
  if (!row) { console.log('NOT-SHOWN:', name); continue; }
  console.log('PRESS:', name);
  await row.$('button').then(b => b.click());
  await page.waitForFunction(() => /design/.test(location.pathname) || (document.querySelector('#buildReport') && !document.querySelector('#buildReport button:disabled')), null, { timeout: 900000 }).catch(() => {});
  console.log('URL-AFTER:', page.url()); if (/design/.test(page.url())) break;
  console.log('REPORT-AFTER:', (await T('#buildReport')).slice(0, 500));
}
if (/design/.test(page.url())) { await page.waitForTimeout(3000); console.log('DESIGN-TEXT:', (await T('body')).slice(0, 500)); await page.screenshot({ path: shots + '/sharaa-4-design.png' }); }
await browser.close(); srv.close();
if (failed) { console.log('E2E-FAILED:', failed); process.exitCode = 1; } else console.log('E2E-OK');
