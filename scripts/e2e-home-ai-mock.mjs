import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = '/home/claude/wt-stg/dist';
const { createWorker } = await import('/home/claude/wt-stg/worker/server.mjs');
let providerBodies = [];
const brief = { summary: 'بيت دور واحد بثلاث غرف نوم ومجلس ومطبخ', assumptions: ['افترضتُ مساحة المطبخ'], questions: [], unhandled: [],
  rooms: [
    ...[1,2,3].map(i => ({ name: 'غرفة نوم ' + i, type: 'bedroom', area: 14, position: 'back', side: 'any' })),
    { name: 'مجلس', type: 'majlis', area: 20, position: 'front', side: 'any' },
    { name: 'مطبخ', type: 'kitchen', area: 12, position: 'middle', side: 'any' },
    { name: 'صالة', type: 'living', area: 24, position: 'middle', side: 'any' },
    ...[1,2,3].map(i => ({ name: 'حمام ' + i, type: 'bath', area: 5, position: 'middle', side: 'any' })),
  ] };
const provider = async (url, init) => { providerBodies.push(JSON.parse(init.body)); return Response.json({ stop_reason: 'tool_use', model: 'mock', content: [{ type: 'tool_use', name: 'submit_home_brief', input: brief }] }); };
const PORT = 8123, ORIGIN = 'http://localhost:' + PORT;
const worker = createWorker({}, provider);
const env = { OPEN_ASSISTANT: '1', ANTHROPIC_API_KEY: 'mock-key', ALLOWED_ORIGIN: ORIGIN };
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = createServer((req, res) => { const p = new URL(req.url, ORIGIN).pathname; const f = join(root, p === '/' ? 'home.html' : p); if (existsSync(f)) { res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); } else { res.writeHead(404); res.end(); } }).listen(PORT);
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const hits = [];
await page.route('https://almizan-handasi.aljeryabod.workers.dev/**', async route => {
  const r = route.request(); const u = new URL(r.url()); hits.push(r.method() + ' ' + u.pathname + ' code=' + (r.headers()['x-mizan-access-code'] ? 'YES' : 'no'));
  const resp = await worker.fetch(new Request(r.url(), { method: r.method(), headers: { ...r.headers(), origin: ORIGIN }, body: r.method() === 'POST' ? r.postData() : undefined }), env);
  await route.fulfill({ status: resp.status, headers: { ...Object.fromEntries(resp.headers), 'access-control-allow-origin': ORIGIN }, body: await resp.text() });
});
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(ORIGIN + '/home.html'); await page.click('#start');
await page.fill('#landLength', '25'); await page.fill('#landWidth', '12.5');
await page.check('input[data-kind="street"][value="n"]'); await page.check('input[data-kind="entry"][value="n"]');
await page.click('#landForm button[type=submit]');
await page.waitForSelector('#stageShara:not([hidden])', { timeout: 10000 });
const chatText = async () => (await page.innerText('#chat')).replace(/\n+/g, ' | ');
await page.waitForSelector('#chat button', { timeout: 10000 });
console.log('START:', (await chatText()).slice(0, 300));
await page.click('#chat button:has-text("أتحدث بحرية")');
await page.waitForSelector('#chat textarea', { timeout: 10000 });
await page.fill('#chat textarea', 'أبي بيت دور واحد فيه ثلاث غرف نوم ومجلس ومطبخ وصالة وثلاث حمامات');
await page.click('#chat form button[type=submit]');
await page.waitForSelector('#chat input[type=number]', { timeout: 20000 });
const t = await chatText(); console.log('AFTER-SEND:', t.slice(-900));
console.log('ROUTE HITS:', JSON.stringify(hits)); console.log('PROVIDER CALLS:', providerBodies.length);
console.log('AI-FALLBACK-MESSAGE-PRESENT:', t.includes('تعذّر الذكاء المتصل'));
console.log('VIA-CLAUDE-PRESENT:', t.includes('عبر Claude'));
console.log('COUNTS:', JSON.stringify(await page.$$eval('#chat input[type=number]', els => els.map(e => e.value))));
await page.screenshot({ path: '/tmp/e2e-after-send.png', fullPage: true });
const inputs = await page.$$('#chat input[type=number]'); if (!(await inputs[5].inputValue())) await inputs[5].fill('0');
await page.click('#chat button:has-text("متابعة")');
await page.waitForSelector('#chat button:has-text("توليد التصميم")', { timeout: 10000 });
await page.click('#chat button:has-text("توليد التصميم")');
await page.waitForFunction(() => /studio|view3d|design/.test(location.pathname) || !document.querySelector('#stageBuild').hidden, null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(8000);
console.log('URL:', page.url());
console.log('BUILD-TITLE:', await page.innerText('#buildTitle').catch(() => 'n/a'));
console.log('BUILD-TEXT:', (await page.innerText('#buildText').catch(() => '')).slice(0, 400));
console.log('BUILD-REPORT:', (await page.innerText('#buildReport').catch(() => '')).replace(/\n+/g, ' | ').slice(0, 1200));
await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(3000);
console.log('DESIGN-TEXT:', (await page.innerText('body')).replace(/\\n+/g, ' | ').slice(0, 1500));
await page.screenshot({ path: '/tmp/e2e-design.png', fullPage: false });
await browser.close(); srv.close();
