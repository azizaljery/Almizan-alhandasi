// (قرار المالك 2026-10-31، رابعًا — فحص فقط، لا يغيّر الواجهة) هل يمكن نقل التوليد إلى Web Worker دون تغيير النتائج؟
// يشغّل generateInitialDesign في Chromium مرتين على الطلب نفسه: على خيط الصفحة، وداخل Worker من نوع module (ملف عامل يُحقن بالتوجيه، لا يُضاف إلى dist)،
// ويقارن بصمة SHA-256 للناتج (دون حقول الزمن) وترتيب البدائل، ويقيس أطول توقف لخيط الواجهة (فجوة بين نبضات setInterval كل 50 مللي ث)،
// ويجرّب نقل الناتج كما هو بـ postMessage (structured clone). الاستعمال: node scripts/worker-feasibility-probe.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist'), PORT = 8131, ORIGIN = 'http://localhost:' + PORT;
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = createServer((q, s) => { const p = new URL(q.url, ORIGIN).pathname; const f = join(root, p === '/' ? 'home.html' : p); if (existsSync(f)) { s.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f)); } else { s.writeHead(404); s.end(); } }).listen(PORT);
const CASES = [['door', 'لازم باب مباشر بين المجلس والطعام', { length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 }], ['plain', 'أبي ثلاث غرف نوم ومجلس رجال وصالة', { length: 25, width: 12.5, streets: ['n'], entries: ['n'], floors: 1 }]];
const COMMON = `
const strip = (k, v) => (/^(ms|time|elapsed|duration|seconds|t0|t1)/i.test(k) || /_ms$|Ms$/.test(k) ? undefined : v);
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
async function runCase({ text, land, counts }) {
  const { normalizeLand, generateInitialDesign } = await import('${ORIGIN}/home-flow.mjs'); const { extractRequirements } = await import('${ORIGIN}/requirements.mjs');
  const req = extractRequirements(text, { counts }); req.counts = { ...req.counts, ...counts };
  const t0 = performance.now(); let out, err = null; try { out = await generateInitialDesign({ land: normalizeLand(land).land, counts: req.counts, requirements: req }); } catch (e) { err = String(e.code || '') + '|' + String(e.message).slice(0, 120); }
  const ms = performance.now() - t0, body = JSON.stringify(err ? { err } : out, strip);
  let clone = 'n/a'; if (!err) { try { structuredClone(out); clone = 'ok'; } catch (e) { clone = 'FAIL: ' + e.message.slice(0, 120); } }
  return { ms: Math.round(ms), sha: await sha(body), order: err ? [] : (out.alternatives || []).map(a => (a.presentation?.status || '') + ':' + (a.pat || a.summary || '').toString().slice(0, 30)), clone, err };
}`;
const browser = await chromium.launch(), page = await browser.newPage();
await page.route(/workers\.dev/, r => r.abort());
await page.route(ORIGIN + '/__probe-worker.mjs', r => r.fulfill({ contentType: 'text/javascript', body: COMMON + `\nself.onmessage = async e => { try { self.postMessage(await runCase(e.data)); } catch (x) { self.postMessage({ fatal: String(x && x.message || x) }); } };` }));
await page.goto(ORIGIN + '/home.html');
await page.evaluate(COMMON + '; window.runCase = runCase;');
const results = [];
for (const [id, text, land] of CASES) {
  const counts = { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 };
  const one = mode => page.evaluate(async ({ mode, text, land, counts, ORIGIN }) => {
    let last = performance.now(), maxGap = 0; const iv = setInterval(() => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 50);
    await new Promise(r => setTimeout(r, 120));
    let res;
    if (mode === 'main') res = await window.runCase({ text, land, counts });
    else res = await new Promise(resolve => { const w = new Worker(ORIGIN + '/__probe-worker.mjs', { type: 'module' }); w.onmessage = e => { resolve(e.data); w.terminate(); }; w.onerror = e => resolve({ fatal: e.message || 'worker error' }); w.postMessage({ text, land, counts }); });
    await new Promise(r => setTimeout(r, 120)); clearInterval(iv); return { ...res, maxUiGapMs: Math.round(maxGap) };
  }, { mode, text, land, counts, ORIGIN });
  const main = await one('main'), worker = await one('worker');
  const r = { id, main, worker, sameSha: main.sha === worker.sha, sameOrder: JSON.stringify(main.order) === JSON.stringify(worker.order) };
  results.push(r); console.log(JSON.stringify(r));
}
console.log('SUMMARY', JSON.stringify(results.map(r => ({ id: r.id, sameSha: r.sameSha, sameOrder: r.sameOrder, mainMs: r.main.ms, workerMs: r.worker.ms, mainUiGap: r.main.maxUiGapMs, workerUiGap: r.worker.maxUiGapMs, clone: r.worker.clone, fatal: r.worker.fatal || null }))));
await browser.close(); srv.close();
