// (طلب المالك 2026-11-02) التقاط عينة الواجهات الواقعية بمتصفح Chromium واحد:
//   node scripts/facade-realism-render.mjs <مجلد-اللقطات>
// لكل بديل (A وB وC): منظور أمامي جانبي من الجنوب الغربي، ومنظور للشمالية، وكلاهما بالخامات ثم بلون رمادي موحّد بالكاميرا نفسها.
// يُلتقط أيضًا لوحة الخامات، وصور مقارنة (ثلاثة بدائل متجاورة بالكاميرا والإضاءة نفسهما) عبر sharp.
// يتحقق من WebGL ويفشل إن لم يُلتقط منظور فعلي. المسقط يُقرأ من tests/fixtures/facade/C1.json ويُقدَّم للصفحة على /facade-realism/C1.json داخل هذا الخادم فقط.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium, sharp;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright')); }
try { sharp = require('sharp'); } catch { sharp = require('/home/claude/.npm-global/lib/node_modules/sharp'); }
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', 'dist'), fixtures = join(here, '..', 'tests', 'fixtures', 'facade');
const out = process.argv[2] || join(here, '..', 'docs', 'research', 'facade-realism-sample', 'v2');
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
const shots = [];
for (const id of ['A', 'B', 'C']) for (const cam of ['oblique', 'north']) for (const grey of [0, 1]) {
  shots.push({ id, cam, grey, file: `${grey ? 'grey' : 'color'}-${cam}-${id}.png` });
}
try {
  for (const s of shots) {
    const page = await browser.newPage({ viewport: { width: 1312, height: 840 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(`${s.file}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`${s.file} console: ${m.text()}`); });
    await page.goto(`${ORIGIN}/facade-realism.html?v=${s.id}&cam=${s.cam}&grey=${s.grey}`);
    await page.waitForFunction(() => globalThis.__FR?.ready === true, null, { timeout: 300000 });
    const info = await page.evaluate(() => globalThis.__FR);
    if (info.error) throw new Error(`${s.file}: ${info.error}`);
    const file = join(out, s.file);
    await (await page.$('#fr')).screenshot({ path: file });
    results.push({ ...s, file, ...info });
    console.log(JSON.stringify({ file: s.file, meshes: info.meshes, triangles: info.triangles, layers: info.layers, glError: info.glError, renderer: info.renderer }));
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
  console.log(JSON.stringify({ board, rows: bi.rows }));
  await page.close();
} finally {
  await browser.close(); srv.close();
}
// صور مقارنة: البدائل الثلاثة متجاورة، بالكاميرا والإضاءة نفسهما (لون ثم رمادي)
for (const cam of ['oblique', 'north']) for (const grey of [0, 1]) {
  const files = ['A', 'B', 'C'].map(id => join(out, `${grey ? 'grey' : 'color'}-${cam}-${id}.png`));
  const meta = await Promise.all(files.map(f => sharp(f).metadata()));
  const w = meta[0].width, h = meta[0].height, label = 42;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 3}" height="${label}"><rect width="100%" height="100%" fill="#fff"/>${['A', 'B', 'C'].map((id, i) => `<text x="${i * w + 16}" y="30" font-family="DejaVu Sans, sans-serif" font-size="22" fill="#222">البديل ${id}</text>`).join('')}</svg>`;
  const composite = [{ input: Buffer.from(svg), top: 0, left: 0 }, ...files.map((f, i) => ({ input: f, top: label, left: i * w }))];
  await sharp({ create: { width: w * 3, height: h + label, channels: 3, background: '#ffffff' } }).composite(composite).png().toFile(join(out, `compare-${grey ? 'grey' : 'color'}-${cam}.png`));
  console.log('compare', `compare-${grey ? 'grey' : 'color'}-${cam}.png`);
}
console.log('ERRORS', errors.length, errors.slice(0, 5).join(' | '));
const bad = results.filter(r => r.glError !== 0 || !r.meshes);
if (errors.length || bad.length) { console.log('FAIL', JSON.stringify(bad)); process.exit(1); }
console.log('OK', results.length);
