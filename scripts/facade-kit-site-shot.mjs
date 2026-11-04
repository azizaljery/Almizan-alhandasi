// لقطة من لوحة dist/facade-kit-site.html. الاستخدام: node scripts/facade-kit-site-shot.mjs [مجلد] [fixture=C1] [side=]
import { createServer } from 'node:http'; import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'; import { extname, join, dirname, resolve, sep } from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..', 'dist'), fx = resolve(here, '..', 'tests', 'fixtures', 'facade');
const a = Object.fromEntries(process.argv.slice(3).map(x => x.split('='))), out = resolve(process.argv[2] || '.'); mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const srv = createServer((q, r) => { const p = new URL(q.url, 'http://x').pathname; const f = p === '/facade-realism/C1.json' ? join(fx, (a.fixture || 'C1') + '.json') : resolve(root, '.' + p); if ((f === root || f.startsWith(root + sep) || f.startsWith(fx)) && existsSync(f) && statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)); } else { r.writeHead(404); r.end(); } });
await new Promise(r => srv.listen(8150, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } }); await pg.addInitScript(() => { try { localStorage.clear(); } catch {} }); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await pg.goto('http://localhost:8150/facade-kit-site.html?fixture=1'); if (a.side) await pg.selectOption('#side', a.side); if (a.exp) await pg.check('#exp'); if (a.mono) await pg.check('#mono');
await pg.waitForFunction(() => window.__KS?.ready, null, { timeout: 600000 });
await pg.waitForTimeout(1500); await pg.screenshot({ path: join(out, a.name || 'site-panel.png'), fullPage: true });
console.log(JSON.stringify(await pg.evaluate(() => window.__KS)), errs.slice(0, 4)); await b.close(); srv.close();
