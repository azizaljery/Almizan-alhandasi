// (عينة الواقعية، v3) لقطات مقرّبة لكل بديل: حجر، نافذة، عمق الفتحة، مدخل — بالكاميرا نفسها والإضاءة نفسها لكل بديل.
// الاستخدام:  node scripts/facade-realism-closeups.mjs [مجلد-الإخراج]
// الصور تُلتقط من صفحة العينة dist/facade-realism.html نفسها عبر ?v=<A|B|C>&shot=<stone|window|slot|door>، لا من كود قياس منفصل.
// لا يُعدَّل شيء في المسقط أو الفتحات أو الإضاءة بين البدائل. يُكتب results.json بالأرقام الخام (roi بالبكسل) للمراجعة.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'dist'), fixtures = resolve(here, '..', 'tests', 'fixtures', 'facade');
const out = resolve(process.argv[2] || join(here, '..', 'docs', 'research', 'facade-realism-sample', 'v3'));
mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const PORT = 8148, ORIGIN = 'http://localhost:' + PORT;
const inside = (p, base) => p === base || p.startsWith(base + sep);
const srv = createServer((req, res) => {
  const p = new URL(req.url, ORIGIN).pathname;
  const f = p === '/facade-realism/C1.json' ? join(fixtures, 'C1.json') : resolve(root, '.' + p);
  if (!inside(f, root) && !inside(f, fixtures)) { res.writeHead(403); res.end(); return; }
  if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); }
  else { res.writeHead(404); res.end(); }
});

const SHOTS = ['stone', 'window', 'slot', 'door'];
const VARIANTS = ['A', 'B', 'C'];
await new Promise(r => srv.listen(PORT, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const results = [], errors = [];
try {
  for (const shot of SHOTS) for (const v of VARIANTS) {
    const file = join(out, `${shot}-${v}.png`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(`${shot}-${v}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${shot}-${v} console: ${m.text()}`); });
    await page.goto(`${ORIGIN}/facade-realism.html?v=${v}&shot=${shot}`);
    await page.waitForFunction(() => globalThis.__FR?.ready === true, null, { timeout: 900000 });
    const info = await page.evaluate(() => globalThis.__FR);
    if (info.error) { errors.push(`${shot}-${v}: ${info.error}`); await page.close(); continue; }
    await (await page.$('#fr')).screenshot({ path: file });
    results.push({ shot, variant: v, file, roi: info.roi, glError: info.glError, meshes: info.meshes, triangles: info.triangles, renderer: info.renderer });
    console.log(`OK ${shot}-${v} glError=${info.glError}`);
    await page.close();
  }
} finally {
  await browser.close(); srv.close();
}
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 1));
console.log('ERRORS', errors.length, errors.slice(0, 5).join(' | '));
if (errors.length || results.length !== SHOTS.length * VARIANTS.length) { console.log('FAIL'); process.exit(1); }
console.log('OK', results.length);
