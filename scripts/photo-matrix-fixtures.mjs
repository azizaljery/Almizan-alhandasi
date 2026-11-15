// يولّد لقطات مدخلات المصفوفة الحية من محرك الواجهة الواقعية نفسه (swiftshader بلا GPU) ويحفظها في tests/fixtures/photo-matrix.
// الاستعمال: node scripts/build.mjs && PLAYWRIGHT_MODULE=/opt/npm-tools/node_modules/playwright/index.mjs node scripts/photo-matrix-fixtures.mjs [مفتاح …]
// يستغرق نحو دقيقة للقطة (تصيير برمجي). ليس جزءًا من الاختبارات ولا يتصل بأي خدمة؛ المخرجات ملفات تُثبَّت في المستودع.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { startMockServer, ROOT } from './photo-mock-server.mjs';
import { shotKeys } from './photo-live-matrix.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const OUT = path.join(ROOT, 'tests/fixtures/photo-matrix'); fs.mkdirSync(OUT, { recursive: true });
const NIGHT = '&night=1&sun=0.05&skys=.01&bgs=.04&el=4&exp=1.6';
const DOC = fs.readFileSync(path.join(ROOT, 'tests/fixtures/flow-30x20-doc.json'), 'utf8');
const keys = process.argv.slice(2).length ? process.argv.slice(2) : shotKeys(), JOBS = +process.env.JOBS || 2;
const server = await startMockServer({ port: +process.env.PORT || 8931 });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const manifestFile = path.join(OUT, 'manifest.json'), manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
async function one(key) {
  const [, style, f, mode] = /^(\w)-f(\d)-(day|night)$/.exec(key) ? [0, .../^(\w)-f(\d)-(day|night)$/.exec(key).slice(1)] : []; if (!style) throw new Error('مفتاح غير صالح: ' + key);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(d => { try { localStorage.setItem('mizan.studio.doc.v1', d); } catch {} }, DOC);
  const page = await ctx.newPage(), t0 = Date.now();
  await page.goto(`${server.base}/facade-j/?v=A&hq=1&nav=1&style=${style}&src=studio&cam=auto&floors=${f}${mode === 'night' ? NIGHT : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__facadeHQ === 'function', null, { timeout: 280000 });
  const r = await page.evaluate(async () => {
    const r = await window.__facadeHQ({ scale: 1.2, samples: 16 }), url = URL.createObjectURL(r.blob);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
    return { w: c.width, h: c.height, data: c.toDataURL('image/jpeg', .86), floors: window.__FR?.floors };
  });
  const bytes = Buffer.from(r.data.split(',')[1], 'base64'); fs.writeFileSync(path.join(OUT, key + '.jpg'), bytes);
  manifest[key] = { style, floors: +f, night: mode === 'night', width: r.w, height: r.h, floorsRendered: r.floors ?? null, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16) };
  fs.writeFileSync(manifestFile, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 1));
  console.log('OK', key, r.w + 'x' + r.h, bytes.length, 'B', ((Date.now() - t0) / 1000).toFixed(0) + 's'); await ctx.close();
}
const queue = [...keys];
await Promise.all(Array.from({ length: JOBS }, async () => { for (let k; (k = queue.shift());) { try { await one(k); } catch (e) { console.log('FAIL', k, e.message); } } }));
await browser.close(); server.close();
