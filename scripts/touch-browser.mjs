// فحص اللمس: سحب 1:1، قرص بإصبعين حول منتصفهما، قرص لوحة اللمس دون قفز، ودوران ثلاثي الأبعاد ناعم.
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist'), out = process.argv[2] || '/tmp/claude-0/home-shots';
await mkdir(out, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => { const f = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
import { generateInitialDesign, SharaSession } from '../dist/home-flow.mjs';
import { createSession } from '../dist/design-session.mjs';
const land = { length: 30, width: 20, streets: ['s'], entries: ['s'] }, counts = { bedrooms: 4, majlis: 2, baths: 5, kitchens: 1, halls: 1, dining: 1 };
const disc = new SharaSession().discovery(), first = await generateInitialDesign({ land, rooms: null, discovery: disc, counts });
const ses = JSON.stringify(createSession({ land, counts, discovery: disc, result: first }));
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(s => localStorage.setItem('mizan.design.session.v1', s), ses);
await p.goto(base + '/design.html'); await p.waitForSelector('#plan'); await p.waitForTimeout(500);
const cdp = await ctx.newCDPSession(p);
const box = await p.locator('#plan').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: i })) });
const V = () => p.evaluate(() => ({ ...globalThis.__mizanDesign.view }));
// سحب بإصبع واحد 1:1
let v0 = await V();
await touch('touchStart', [{ x: cx, y: cy }]); for (let i = 1; i <= 10; i++) await touch('touchMove', [{ x: cx + i * 12, y: cy }]); await touch('touchEnd', []);
let v1 = await V();
check('السحب بإصبع واحد يتبع الإصبع 1:1', Math.abs((v0.cx - v1.cx) * v0.scale - 120) < 3, `${((v0.cx - v1.cx) * v0.scale).toFixed(1)} px`);
await p.waitForTimeout(900);
// قرص بإصبعين: المسافة 100 → 200 = ضعف التكبير، والنقطة الوسطى ثابتة
v0 = await V();
const midWorld = { x: (0) / v0.scale + v0.cx, y: v0.cy };
await touch('touchStart', [{ x: cx - 50, y: cy }, { x: cx + 50, y: cy }]);
for (let i = 1; i <= 20; i++) { const h = 50 + i * 2.5; await touch('touchMove', [{ x: cx - h, y: cy }, { x: cx + h, y: cy }]); }
await touch('touchEnd', []);
v1 = await V();
const ratio = v1.scale / v0.scale, after = { x: v1.cx, y: v1.cy };
check('القرص بإصبعين يكبّر بنسبة المسافة تمامًا', Math.abs(ratio - 2) < .06, ratio.toFixed(3));
check('النقطة تحت الإصبعين تبقى في مكانها', Math.hypot(after.x - midWorld.x, after.y - midWorld.y) * v1.scale < 3, (Math.hypot(after.x - midWorld.x, after.y - midWorld.y) * v1.scale).toFixed(2) + ' px');
// قرص لوحة اللمس (ctrlKey): حدث صغير لا يقفز
v0 = await V(); await p.mouse.move(cx, cy); await p.evaluate(({ x, y }) => { const c = document.getElementById('plan'); c.dispatchEvent(new WheelEvent('wheel', { deltaY: -4, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); }, { x: cx, y: cy });
await p.waitForTimeout(600); v1 = await V();
check('حدث قرص صغير = تكبير صغير (لا قفز)', v1.scale / v0.scale > 1.02 && v1.scale / v0.scale < 1.08, (v1.scale / v0.scale).toFixed(3));
// العرض ثلاثي الأبعاد: الدوران ناعم
await p.evaluate(() => localStorage.setItem('mizan.studio.doc.v1', JSON.stringify(globalThis.__mizanDesign.doc)));
await p.goto(base + '/view3d.html'); await p.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 30000 }); await p.waitForTimeout(800);
const b3 = await p.locator('#threeHost').boundingBox(), x3 = b3.x + b3.width / 2, y3 = b3.y + b3.height / 2;
const az0 = await p.evaluate(() => globalThis.__mizanViewer.orbit.az);
await touch('touchStart', [{ x: x3, y: y3 }]);
const track = [];
for (let i = 1; i <= 15; i++) { await touch('touchMove', [{ x: x3 + i * 10, y: y3 }]); track.push(await p.evaluate(() => globalThis.__mizanViewer.orbit.az)); }
await touch('touchEnd', []);
await p.waitForTimeout(1500);
const az1 = await p.evaluate(() => globalThis.__mizanViewer.orbit.az), steps = track.map((a, i) => Math.abs(a - (i ? track[i - 1] : az0)));
const expected = 150 * 4.36 / Math.max(600, b3.width) * .85;
check('الدوران باللمس بحساسية هادئة (سحب 150 بكسل ≈ زاوية محسوبة، مع استمرار خفيف)', az0 - az1 >= expected * .95 && az0 - az1 < expected * 2.2, `${((az0 - az1) * 180 / Math.PI).toFixed(1)}° مقابل ${(expected * 180 / Math.PI).toFixed(1)}°`);
check('لا قفزات بين الإطارات أثناء السحب', Math.max(...steps) < .05, (Math.max(...steps) * 180 / Math.PI).toFixed(2) + '° أقصى خطوة');
check('بلا أخطاء', errs.length === 0, errs.join(' | '));
await b.close(); server.close(); process.exit(results.every(Boolean) ? 0 : 1);
