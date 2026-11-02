// (طلب المالك 2026-11-02) التقاط عينة الواجهات الواقعية بمتصفح Chromium واحد:
//   node scripts/facade-realism-render.mjs <مجلد-اللقطات>
// يلتقط منظورًا ثلاثي الأبعاد لكل بديل (A وB وC) ولوحة الخامات. يتحقق من WebGL ويفشل إن لم يُلتقط منظور فعلي.
// المسقط يُقرأ من tests/fixtures/facade/C1.json ويُقدَّم للصفحة على المسار /facade-realism/C1.json فقط داخل هذا الخادم.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', 'dist'), fixtures = join(here, '..', 'tests', 'fixtures', 'facade');
const out = process.argv[2] || join(here, '..', 'docs', 'research', 'facade-realism-sample');
mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const PORT = 8148, ORIGIN = 'http://localhost:' + PORT;
const srv = createServer((req, res) => {
  const p = new URL(req.url, ORIGIN).pathname;
  let f = p === '/' ? join(root, 'home.html') : join(root, p);
  if (p === '/facade-realism/C1.json') f = join(fixtures, 'C1.json');
  if (!f.startsWith(root) && !f.startsWith(fixtures)) { res.writeHead(403); res.end(); return; }
  if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(PORT, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [], results = [];
try {
  for (const id of ['A', 'B', 'C']) {
    const page = await browser.newPage({ viewport: { width: 1312, height: 840 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(`${id}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${id} console: ${m.text()}`); });
    await page.goto(`${ORIGIN}/facade-realism.html?v=${id}`);
    await page.waitForFunction(() => globalThis.__FR?.ready === true, null, { timeout: 180000 });
    const info = await page.evaluate(() => globalThis.__FR);
    if (info.error) throw new Error(`${id}: ${info.error}`);
    const file = join(out, `perspective-${id}.png`);
    await (await page.$('#fr')).screenshot({ path: file });
    results.push({ id, file, ...info });
    console.log(JSON.stringify({ id, meshes: info.meshes, triangles: info.triangles, layers: info.layers, glError: info.glError, renderer: info.renderer }));
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(`board: ${e.message}`));
  await page.goto(`${ORIGIN}/facade-realism.html?mode=board`);
  await page.waitForFunction(() => globalThis.__FR?.ready === true, null, { timeout: 180000 });
  const bi = await page.evaluate(() => globalThis.__FR);
  if (bi.error) throw new Error('board: ' + bi.error);
  const board = join(out, 'materials-board.png');
  await (await page.$('#stage')).screenshot({ path: board });
  results.push({ id: 'board', file: board, rows: bi.rows });
  console.log(JSON.stringify({ board, rows: bi.rows }));
  await page.close();
} finally {
  await browser.close(); srv.close();
}
console.log('ERRORS', errors.length, errors.slice(0, 5).join(' | '));
const bad = results.filter(r => r.id !== 'board' && (r.glError !== 0 || !r.meshes));
if (errors.length || bad.length) { console.log('FAIL', JSON.stringify(bad)); process.exit(1); }
console.log('OK', results.length);
