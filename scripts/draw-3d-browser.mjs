// Visual / performance check of the drawing-studio 3D engine in a real (software GL) Chromium.
//   node scripts/draw-3d-browser.mjs [outDir] [--only=name,name]
// Serves dist/ over a tiny local http server, opens dist/draw/_harness3d.html, renders the sample villa and
// a two level variant in several views and writes PNGs OUTSIDE the repository (default /tmp/claude-0/draw3d-shots/).
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const outDir = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || '/tmp/claude-0/draw3d-shots';
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const W = Number(process.env.W || 1280), H = Number(process.env.H || 800);
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
await mkdir(outDir, { recursive: true });
await page.goto(base + '/draw/_harness3d.html');
await page.waitForFunction(() => window.H?.ready, null, { timeout: 60000 });

const report = [];
async function shot(name, setup, { wait = true } = {}) {
  if (only.length && !only.includes(name)) return;
  const t0 = Date.now();
  await page.evaluate(setup);
  const stats = await page.evaluate(() => H.settle());
  const ms = Date.now() - t0;
  await page.screenshot({ path: join(outDir, name + '.png') });
  report.push({ name, ms, ...stats });
  console.log(name.padEnd(28), `${ms}ms`, JSON.stringify(stats));
  void wait;
}

// ---------------- single level villa ------------------------------------------------------------------------------
await page.evaluate(() => { const v = H.create(); const t = performance.now(); v.setDoc(H.sampleVilla()); window.__build = performance.now() - t; });
console.log('scene build ms (incl. textures, env map):', Math.round(await page.evaluate(() => window.__build)));
await shot('01-ext-front', () => { H.viewer.setMode('orbit', { animate: false }); H.viewer.orbitTo({ azimuthDeg: 28, elevationDeg: 17, distance: 36 }); });
await shot('02-ext-corner-ne', () => { H.viewer.orbitTo({ azimuthDeg: 140, elevationDeg: 22, distance: 38 }); });
await shot('03-ext-back-west', () => { H.viewer.orbitTo({ azimuthDeg: -125, elevationDeg: 26, distance: 40 }); });
await shot('04-ext-high', () => { H.viewer.orbitTo({ azimuthDeg: 38, elevationDeg: 38, distance: 34 }); });
await shot('05-dollhouse', () => { H.viewer.setMode('dollhouse', { animate: false }); H.viewer.orbitTo({ azimuthDeg: 20 }); });
await shot('06-top', () => { H.viewer.setMode('top', { animate: false }); });
await shot('07-walk-majlis', () => { H.viewer.walkTo(3.0, 1.2, { headingDeg: 0, pitchDeg: -4 }); });
await shot('07b-walk-majlis-corner', () => { H.viewer.walkTo(5.3, 0.7, { headingDeg: -40, pitchDeg: -8 }); });
await shot('08-walk-master', () => { H.viewer.walkTo(3.7, 9.9, { headingDeg: -5, pitchDeg: -6 }); });
await shot('08b-walk-master-bed', () => { H.viewer.walkTo(3.4, 10.2, { headingDeg: -12, pitchDeg: -10 }); });
await shot('08c-walk-kitchen', () => { H.viewer.walkTo(11.2, 7.0, { headingDeg: -160, pitchDeg: -6 }); });
await shot('08d-walk-living', () => { H.viewer.walkTo(8.0, 5.7, { headingDeg: 70, pitchDeg: -4 }); });
await shot('08e-walk-entrance', () => { H.viewer.walkTo(9.0, 0.9, { headingDeg: 8, pitchDeg: 4 }); });
await shot('08f-walk-bath', () => { H.viewer.walkTo(10.2, 9.8, { headingDeg: 140, pitchDeg: -12 }); });
await shot('09-section-1.2', () => { H.viewer.setMode('section', { animate: false }); H.viewer.setSectionHeight(1.2); H.viewer.orbitTo({ azimuthDeg: 25, elevationDeg: 52 }); });
await shot('10-dusk', () => { H.viewer.setMode('orbit', { animate: false }); H.viewer.setStyle('dusk'); H.viewer.setSun({ azimuthDeg: 250, altitudeDeg: 8 }); H.viewer.orbitTo({ azimuthDeg: 28, elevationDeg: 14, distance: 36 }); });
await shot('11-dusk-walk', () => { H.viewer.walkTo(3.0, 1.2, { headingDeg: 0, pitchDeg: -4 }); });

// ---------------- two level variant ----------------------------------------------------------------------------------
await page.evaluate(() => { const v = H.viewer; v.setStyle('day'); v.setSun({ azimuthDeg: 135, altitudeDeg: 52 }); v.setDoc(H.twoLevelVilla()); v.setMode('orbit', { animate: false }); });
await shot('20-two-ext-front', () => { H.viewer.orbitTo({ azimuthDeg: 30, elevationDeg: 16, distance: 40 }); });
await shot('21-two-ext-back', () => { H.viewer.orbitTo({ azimuthDeg: 215, elevationDeg: 25, distance: 42 }); });
await shot('22-two-dollhouse', () => { H.viewer.setMode('dollhouse', { animate: false }); });
await shot('23-two-ground-only', () => { H.viewer.showLevel('L1'); H.viewer.setMode('dollhouse', { animate: false }); });
await shot('24-two-stair-walk', () => { H.viewer.showLevel('all'); H.viewer.walkTo(7.8, 0.6, { level: 0, headingDeg: 0, pitchDeg: 10 }); });
await shot('25-two-upper-walk', () => { H.viewer.walkTo(3.2, 10.4, { level: 1, headingDeg: -10, pitchDeg: -8 }); });

console.log('console problems:', logs.length ? logs : 'none');
await writeFile(join(outDir, 'report.json'), JSON.stringify({ report, logs }, null, 1));
await browser.close(); server.close();
