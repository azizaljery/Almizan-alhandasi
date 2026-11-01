// محايد: يعيد رحلة scripts/mep-systems-browser.mjs (الأرض ← شرعاء «أسئلة موجهة» بالفهم المحلي ← التوليد في المتصفح) حرفيًا حتى
// نهاية التوليد، على أي إيداع، ويسجّل كل استدعاء للمحرك (المدخل الحرفي، الزمن، الناتج/الخطأ) دون تغيير سلوك التطبيق.
// الاستعمال: node c7-journey.mjs <ROOT> <OUTDIR> [--case C7] [--no-build]
// الاعتراض: مسار generation-client.mjs يُقدَّم بنسخة تلفّ generateOffThread (للتسجيل فقط؛ لا يغيّر المدخل ولا الناتج).
import http from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const ROOT = resolve(argv[0]), OUT = resolve(argv[1]), CASE = opt('case', 'C7');
await mkdir(OUT, { recursive: true });
if (!argv.includes('--no-build')) execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'ignore' });
const CLIENT = join(ROOT, 'dist/client');
const worker = (await import(pathToFileURL(join(ROOT, 'worker/index.mjs')).href)).default;
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary' };
const isFile = async p => { try { return (await stat(p)).isFile(); } catch { return false; } };
const ASSETS = { async fetch(request) {
  const p = decodeURIComponent(new URL(request.url).pathname);
  for (const t of p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html']) { const f = normalize(join(CLIENT, t)); if (!f.startsWith(CLIENT)) break; if (await isFile(f)) return new Response(await readFile(f), { status: 200, headers: { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' } }); }
  return new Response('Not found', { status: 404 });
} };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`), chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const r = url.pathname === '/' || url.pathname.startsWith('/api/') ? await worker.fetch(request, { ASSETS }, { waitUntil() {} }) : await ASSETS.fetch(request);
    const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; }); res.writeHead(r.status, headers); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e?.stack || e)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const log = { startedAt: new Date().toISOString(), root: ROOT, case: CASE, calls: [], clicks: [], errors: [], blocked: [], checks: [] };
const vp = { width: 1366, height: 900 };
const ctx = await browser.newContext({ viewport: vp, locale: 'ar-SA', acceptDownloads: true });
await ctx.route('**/*', route => { const u = new URL(route.request().url()); if (u.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(u.protocol)) return route.continue(); log.blocked.push(u.host); return route.abort(); });
// تسجيل استدعاءات المحرك فقط
const WRAP = `
const __sum = o => { try { return JSON.parse(JSON.stringify(o, (k, v) => (k === 'stack' ? undefined : typeof v === 'string' && v.length > 4000 ? v.slice(0, 4000) + '…' : v)), (k, v) => v); } catch (e) { return { unserializable: String(e) }; } };
const __errSum = e => { const o = { name: e?.name, message: e?.message }; for (const k of Object.getOwnPropertyNames(e || {})) if (k !== 'stack' && k !== 'message') o[k] = e[k]; return __sum(o); };
const __outSum = o => { const d = o?.doc; const s = { keys: Object.keys(o || {}), alternatives: (o?.alternatives || []).length, statuses: (o?.alternatives || []).map(a => a?.presentation?.status), hidden: (o?.hidden || o?.alternativesInfo?.hidden || []).length, notes: o?.notes, presentation: o?.presentation, alternativesInfo: o?.alternativesInfo, status: o?.status, reason: o?.reason }; return __sum(s); };
export function generateOffThread(input) {
  const rec = { t0: Date.now(), input: JSON.parse(JSON.stringify(input)) }; globalThis.__recCall?.(JSON.stringify({ phase: 'start', rec }));
  return __orig(input).then(out => { rec.ms = Date.now() - rec.t0; rec.ok = true; rec.out = __outSum(out); globalThis.__recCall?.(JSON.stringify({ phase: 'end', rec })); return out; },
    err => { rec.ms = Date.now() - rec.t0; rec.ok = false; rec.err = __errSum(err); globalThis.__recCall?.(JSON.stringify({ phase: 'end', rec })); throw err; });
}
function __orig(input) {`;
await ctx.route('**/generation-client.mjs', async route => { const r = await route.fetch(); let t = await r.text(); const needle = 'export function generateOffThread(input) {'; if (!t.includes(needle)) throw Error('needle'); await route.fulfill({ response: r, body: t.replace(needle, WRAP), headers: { ...r.headers(), 'content-type': 'text/javascript; charset=utf-8' } }); });
const page = await ctx.newPage(); page.setDefaultTimeout(240000);
await page.exposeFunction('__recCall', s => { const m = JSON.parse(s); if (m.phase === 'end') log.calls.push(m.rec); else log.starts = (log.starts || []).concat([{ t0: m.rec.t0 }]); });
page.on('pageerror', e => log.errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED/.test(m.text())) log.errors.push(`console: ${m.text()}`); });
page.on('dialog', d => d.accept());
const t0 = Date.now(), el = () => Math.round((Date.now() - t0) / 1000);
const snap = async n => { await page.screenshot({ path: join(OUT, n + '.png'), fullPage: false }).catch(() => {}); };
const { CASES } = await import(pathToFileURL(join(ROOT, 'scripts/acceptance-cases.mjs')).href);
const C = CASES.find(c => c.id === CASE); log.caseDef = C;
await page.goto(BASE + '/'); await page.waitForSelector('#start'); await page.click('#start');
await page.fill('#landLength', String(C.land.length)); await page.fill('#landWidth', String(C.land.width));
if ((C.land.floors || 1) > 1) await page.selectOption('#landFloors', String(C.land.floors));
for (const s of C.land.streets) await page.check(`input[data-kind=street][value=${s}]`);
for (const s of C.land.entries) await page.check(`input[data-kind=entry][value=${s}]`);
await page.click('#landForm button[type=submit]'); await page.waitForSelector('#stageShara:not([hidden])');
await page.waitForSelector('#chat button');
await page.click('#pathSwitch button:has-text("أسئلة موجهة")'); await page.waitForTimeout(500);
const transcript = [];
for (let i = 0; i < 30; i++) {
  const nums = await page.$$('#chat input[type=number]');
  if (nums.length >= 6) { const vals = [String(C.counts.bedrooms), String(C.counts.majlis), String(C.counts.baths), '1', '1', '0']; for (let k = 0; k < 6; k++) await nums[k].fill(vals[k]); log.clicks.push({ i, counts6: vals }); await page.click('#chat button:has-text("متابعة")'); await page.waitForTimeout(600); continue; }
  if (nums.length === 2 && /أفراد الأسرة الحاليين/.test(await nums[0].evaluate(el => el.closest('form').innerText))) { await nums[0].fill('6'); log.clicks.push({ i, household: 6 }); }
  if (await page.$('#chat button:has-text("أؤكد وأبدأ"), #chat button:has-text("أفهم القيود")')) break;
  const st0 = await page.$('#chat button:has-text("ابدأ التصميم")'); if (st0) { log.clicks.push({ i, click: 'ابدأ التصميم' }); await st0.click(); await page.waitForTimeout(600); continue; }
  let btn = null, w0 = null;
  for (const w of ['لا يهم', 'لا أحتاج', 'تخطّي', 'تسجيل', 'متابعة', 'اعتمد']) { btn = await page.$(`#chat button:has-text("${w}")`); if (btn) { w0 = w; break; } }
  if (!btn) btn = (await page.$('#chat .controls button, #chat button.chip, #chat button.opt'));
  if (!btn) { log.clicks.push({ i, click: null }); break; }
  log.clicks.push({ i, click: w0 || (await btn.innerText()) , text: (await btn.innerText()).slice(0, 80) }); await btn.click(); await page.waitForTimeout(500);
}
log.chatBeforeConfirm = await page.locator('#chat').innerText().catch(() => '');
await snap('01-sharaa-brief');
const go = await page.$('#chat button:has-text("أؤكد وأبدأ"), #chat button:has-text("أفهم القيود")'); if (go) { log.clicks.push({ click: await go.innerText() }); await go.click(); }
await page.waitForSelector('#chat button:has-text("توليد التصميم")', { timeout: 20000 }).then(b => { log.clicks.push({ click: 'توليد التصميم' }); return b.click(); }).catch(() => {});
log.chatAfterConfirm = await page.locator('#chat').innerText().catch(() => '');
log.tGenStart = el();
let outcome = await Promise.race([page.waitForURL(/\/design(\.html)?$/, { timeout: 3000000 }).then(() => 'design'), page.waitForFunction(() => { const r = document.querySelector('#buildReport'); return r && !r.hidden && r.children.length > 0; }, null, { timeout: 3000000 }).then(() => 'report')]);
log.firstOutcome = outcome; log.tFirstOutcome = el();
for (const [k, tt] of [['parking', 'قبول موقف موازٍ للشارع'], ['majlis', 'فصل المجلس عن غرفة الطعام']].entries()) { const title = tt[1];
  if (outcome !== 'report') break;
  await page.waitForTimeout(1500);
  log['report' + k] = await page.locator('#buildReport').innerText().catch(() => ''); log['reportOutcome' + k] = await page.locator('#buildReport').getAttribute('data-outcome').catch(() => null);
  await snap(`01c-build-report-${k}`);
  const card = page.locator('#buildReport div').filter({ hasText: title }).filter({ has: page.locator('button') }).last();
  if (!(await card.count())) { log.clicks.push({ concession: title, found: false }); continue; }
  log.clicks.push({ concession: title, found: true }); await card.locator('button').first().click();
  outcome = await page.waitForURL(/\/design(\.html)?$/, { timeout: 1500000 }).then(() => 'design').catch(() => 'report');
}
log.finalOutcome = outcome; log.tEnd = el();
if (outcome === 'report') {
  // انتظار انتهاء أي تحليل لاحق (diagnoseFit) حتى يهدأ #buildText
  await page.waitForFunction(() => !document.querySelector('#buildText')?.textContent?.trim() || /تعذّر/.test(document.querySelector('#buildText').textContent), null, { timeout: 900000 }).catch(() => {});
  await page.waitForTimeout(1500);
  log.finalReportText = await page.locator('#buildReport').innerText().catch(() => '');
  log.finalReportOutcomeAttr = await page.locator('#buildReport').getAttribute('data-outcome').catch(() => null);
  log.buildText = await page.locator('#buildText').innerText().catch(() => '');
  log.tAfterDiag = el();
  await snap('02-final-report');
} else { await page.waitForSelector('#plan', { timeout: 300000 }).catch(() => {}); await snap('02-design'); log.designUrl = page.url(); }
log.endedAt = new Date().toISOString();
await writeFile(join(OUT, 'run.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify({ outcome: log.finalOutcome, attr: log.finalReportOutcomeAttr, calls: log.calls.map(c => ({ ms: c.ms, ok: c.ok, pending: c.pending })), tGen: log.tFirstOutcome - log.tGenStart }));
await browser.close(); server.close(); process.exit(0);
