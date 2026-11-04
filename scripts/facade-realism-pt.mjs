// (اختبار جدوى) تتبّع مسار الضوء مقابل التصيير اللحظي لمقطع واحد من العينة، بالكاميرا نفسها والشمس نفسها.
// الاستخدام:  node scripts/facade-realism-pt.mjs [مجلد-الإخراج] [shot=window] [spp=32] [w=960] [h=600] [v=A]
// يخرج: raster.png وpathtraced.png وcompare.png وresults.json (الزمن لكل مرحلة، المثلثات، العقد، المعالج الرسومي).
// ملاحظة: الأداء المقاس على المصيّر البرمجي (SwiftShader) داخل Chromium بلا GPU؛ لا يمثل الأجهزة الفعلية.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium, sharp;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
try { sharp = require('sharp'); } catch { sharp = require('/opt/npm-tools/node_modules/sharp'); }

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..', 'dist'), fixtures = resolve(here, '..', 'tests', 'fixtures', 'facade');
const args = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')));
const shot = args.shot || 'window', spp = Number(args.spp || 32), w = Number(args.w || 960), h = Number(args.h || 600), v = (args.v || 'A').toUpperCase(), geo = args.geo || 'block';
const out = resolve(process.argv[2] || join(here, '..', 'docs', 'research', 'facade-realism-sample', 'pt-feasibility'));
mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const PORT = 8149, ORIGIN = 'http://localhost:' + PORT;
const inside = (p, base) => p === base || p.startsWith(base + sep);
const srv = createServer((req, res) => {
  const p = new URL(req.url, ORIGIN).pathname;
  const f = p === '/facade-realism/C1.json' ? join(fixtures, 'C1.json') : resolve(root, '.' + p);
  if (!inside(f, root) && !inside(f, fixtures)) { res.writeHead(403); res.end(); return; }
  if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(PORT, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = []; let raster, pt;
try {
  const p1 = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p1.on('pageerror', e => errors.push('raster: ' + e.message));
  await p1.goto(`${ORIGIN}/facade-realism.html?v=${v}&shot=${shot}&geo=${geo}&w=${w}&h=${h}`);
  await p1.waitForFunction(() => globalThis.__FR?.ready === true, null, { timeout: 900000 });
  raster = await p1.evaluate(() => globalThis.__FR);
  await (await p1.$('#fr')).screenshot({ path: join(out, 'raster.png') });
  await p1.close();

  const p2 = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p2.on('pageerror', e => errors.push('pt: ' + e.message));
  p2.on('console', m => { if (m.type() === 'error') errors.push('pt console: ' + m.text().slice(0, 4000)); });
  await p2.goto(`${ORIGIN}/facade-realism-pt.html?v=${v}&shot=${shot}&geo=${geo}&w=${w}&h=${h}&spp=${spp}`);
  await p2.waitForFunction(() => globalThis.__PT?.ready === true, null, { timeout: 3000000, polling: 2000 });
  pt = await p2.evaluate(() => globalThis.__PT);
  if (pt.error) throw new Error(pt.error);
  await (await p2.$('#pt')).screenshot({ path: join(out, 'pathtraced.png') });
  await p2.close();
} finally { await browser.close(); srv.close(); }
console.log('PT_INFO', JSON.stringify({ spp: pt.spp, tri: pt.triangles, nodes: pt.nodes, glError: pt.glError, gpu: pt.gpu, timings: pt.timings }));
if (errors.length) console.log('ERRORS', errors.slice(0, 5).map(e => e.slice(0, 4500)).join(' | '));
const lab = (t, i) => `<text x="${i * w + 16}" y="30" font-family="DejaVu Sans, sans-serif" font-size="22" fill="#222">${t}</text>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="42"><rect width="100%" height="100%" fill="#fff"/>${lab('Raster (WebGL)', 0)}${lab(`Path tracing ${pt.spp} spp`, 1)}</svg>`;
await sharp({ create: { width: w * 2, height: h + 42, channels: 3, background: '#fff' } }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }, { input: await sharp(join(out, 'raster.png')).resize(w, h, { fit: 'fill' }).toBuffer(), top: 42, left: 0 }, { input: await sharp(join(out, 'pathtraced.png')).resize(w, h, { fit: 'fill' }).toBuffer(), top: 42, left: w }]).png().toFile(join(out, 'compare.png'));
writeFileSync(join(out, 'results.json'), JSON.stringify({ shot, variant: v, geo, size: [w, h], raster: { triangles: raster.triangles, meshes: raster.meshes }, pathtrace: pt, note: 'الأداء مقاس على SwiftShader (معالج) داخل Chromium، وليس على جهاز عميل فعلي.' }, null, 1));
console.log(JSON.stringify({ spp: pt.spp, triangles: pt.triangles, nodes: pt.nodes, timings: pt.timings, glError: pt.glError, gpu: pt.gpu }));
console.log(errors.length ? 'FAIL' : 'OK');
