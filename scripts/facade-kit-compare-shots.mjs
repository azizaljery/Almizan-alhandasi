// تشغيل صفحة المقارنة (dist/facade-kit/integration/comparison.html) وحفظ اللقطات الثماني عشرة. الاستخدام: node scripts/facade-kit-compare-shots.mjs [مجلد]
import { createServer } from 'node:http'; import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs'; import { extname, join, dirname, resolve, sep } from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..', 'dist'), out = resolve(process.argv[2] || '.'); mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const srv = createServer((q, r) => { const f = resolve(root, '.' + new URL(q.url, 'http://x').pathname); if ((f === root || f.startsWith(root + sep)) && existsSync(f) && statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)); } else { r.writeHead(404); r.end(); } });
await new Promise(r => srv.listen(8151, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1100, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
const t0 = Date.now(); await pg.goto('http://localhost:8151/facade-kit/integration/comparison.html'); await pg.click('#run');
await pg.waitForFunction(() => /CAPTURED|INCOMPLETE|BLOCKED/.test(document.querySelector('#report').textContent), null, { timeout: 3000000, polling: 3000 });
const report = JSON.parse(await pg.textContent('#report')); const imgs = await pg.evaluate(async () => Promise.all([...document.querySelectorAll('#images img')].map(async i => ({ n: i.alt, d: await new Promise(async r => { const b = await (await fetch(i.src)).blob(); const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(b); }) }))));
for (const i of imgs) writeFileSync(join(out, i.n + '.png'), Buffer.from(i.d, 'base64'));
writeFileSync(join(out, 'report.json'), JSON.stringify({ ...report, elapsedMs: Date.now() - t0, pageErrors: errs.slice(0, 5) }, null, 1));
console.log(report.status, report.shots?.length, 'imgs', imgs.length, 'ms', Date.now() - t0, 'errors', report.errors, errs.slice(0, 3)); await b.close(); srv.close();
