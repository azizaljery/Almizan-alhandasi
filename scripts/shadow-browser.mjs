// الظل في العرض ثلاثي الأبعاد: يُقاس من البكسلات (الظل مُفعّل مقابل معطّل) عند أوقات مختلفة، ويُتحقق أن اتجاهه عكس الشمس.
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import { existsSync } from 'node:fs'; import { join, normalize, extname } from 'node:path';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { serialize } from '../dist/draw/doc.mjs';
const root = new URL('../dist/', import.meta.url).pathname, out = process.argv[2] || '/tmp';
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => { const f = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))); if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const req = extractRequirements('', { counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 } });
const land = { width: 20, length: 30, streets: ['s'], entries: ['s'], floors: Number(process.env.FLOORS || 1) };
const design = await generateInitialDesign({ land, counts: req.counts, requirements: req });
const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 860 } })).newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.g|net::/.test(m.text())) errs.push(m.text()); });
await p.goto(base + '/home.html'); await p.evaluate(s => localStorage.setItem('mizan.studio.doc.v1', s), serialize(design.doc));
await p.goto(base + '/view3d.html'); await p.waitForFunction(() => globalThis.__mizanViewer?.built, null, { timeout: 90000 }); await p.waitForTimeout(800);
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
// مقياس الظل: نصوّر من أعلى (ثابت) مع الظل ثم بدونه؛ البكسلات الأغمق بوضوح = ظل. ونحسب مركز الظل بالنسبة لمركز المبنى.
async function measure(hour, day = 172) {
  await p.evaluate(([h, d]) => { document.getElementById('hour').value = h; document.getElementById('day').value = d; document.getElementById('hour').dispatchEvent(new Event('input')); }, [hour, day]);
  await p.waitForTimeout(250);
  return p.evaluate(async () => {
    const v = globalThis.__mizanViewer;
    const grab = () => new Promise(r => { v.renderNow?.(); v.renderer.render(v.scene, v.camera); const c = v.renderer.domElement; const w = c.width, h = c.height; const g = document.createElement('canvas'); g.width = 240; g.height = Math.round(240 * h / w); const x = g.getContext('2d'); x.drawImage(c, 0, 0, g.width, g.height); r({ d: x.getImageData(0, 0, g.width, g.height).data, w: g.width, h: g.height }); });
    v.markShadowDirty(); const on = await grab();
    v.renderer.shadowMap.enabled = false; v.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); const off = await grab();
    v.renderer.shadowMap.enabled = true; v.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); v.markShadowDirty(); v.renderer.render(v.scene, v.camera);
    let n = 0, sx = 0, sy = 0; const ratios = [];
    for (let i = 0; i < on.d.length; i += 4) { const a = on.d[i] + on.d[i + 1] + on.d[i + 2], b2 = off.d[i] + off.d[i + 1] + off.d[i + 2]; if (b2 - a > 45) { n++; ratios.push(a / Math.max(1, b2)); const k = i / 4; sx += k % on.w; sy += Math.floor(k / on.w); } }
    ratios.sort((x, y) => x - y);
    const s = v.sunState, dir = v.sunDirection();
    return { dark: ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1, frac: n / (on.w * on.h), cx: n ? sx / n / on.w : null, cy: n ? sy / n / on.h : null, alt: s.altitudeDeg, az: s.azimuthDeg, dir: [dir.x, dir.y, dir.z], txt: document.getElementById('sunTxt').textContent, R: v.sun.shadow.camera.right, map: v.sun.shadow.mapSize.x };
  });
}
await p.evaluate(() => { const v = globalThis.__mizanViewer; v.setMode('top'); });
await p.waitForTimeout(600);
const rows = [];
for (const h of [6, 7, 9, 12, 15, 17, 18]) { const m = await measure(h); rows.push([h, m]); console.log('h', h, JSON.stringify({ dark: +m.dark.toFixed(2), frac: +m.frac.toFixed(4), cx: m.cx && +m.cx.toFixed(2), cy: m.cy && +m.cy.toFixed(2), alt: +m.alt.toFixed(1), az: +m.az.toFixed(0), R: m.R, txt: m.txt })); await p.screenshot({ path: `${out}/top-${h}.png` }); }
await p.evaluate(() => globalThis.__mizanViewer.setMode('orbit')); await p.waitForTimeout(500);
for (const h of [8, 16]) { await measure(h); await p.screenshot({ path: `${out}/orbit-${h}.png` }); }
const byH = Object.fromEntries(rows);
check('ظل مرئي في الصباح والظهر والعصر', [7, 9, 12, 15, 17].every(h => byH[h].frac > .004), [7, 9, 12, 15, 17].map(h => h + ':' + byH[h].frac.toFixed(4)).join(' '));
check('ظل الصباح غرب المبنى وظل العصر شرقه (المسقط: الشرق يمين)', byH[7].cx !== null && byH[17].cx !== null && byH[7].cx < byH[17].cx, `7→${byH[7].cx?.toFixed(2)} 17→${byH[17].cx?.toFixed(2)}`);
check('ظل الظهر أقصر من ظل الصباح', byH[12].frac < byH[7].frac, `${byH[12].frac.toFixed(4)} < ${byH[7].frac.toFixed(4)}`);
check('الظل واضح: المظلل ≤ 0.65 من المضاء والشمس عالية، و≤ 0.75 والشمس منخفضة (ضوء الشمس على الأرض أضعف)', [9, 15].every(h => byH[h].dark <= .65) && [7, 17].every(h => byH[h].dark <= .75), [7, 9, 15, 17].map(h => h + ':' + byH[h].dark.toFixed(2)).join(' '));
const night = await measure(17.75, 355);
check('بعد الغروب (ديسمبر 17:45) لا شمس مباشرة ولا ظل', night.frac < .002 && /تحت الأفق/.test(night.txt), night.txt + ' ' + night.frac.toFixed(4));
const ds = await p.evaluate(() => { const v = globalThis.__mizanViewer; return { auto: v.renderer.shadowMap.autoUpdate, cast: v.sun.castShadow }; });
check('خريطة الظل تُعاد رسمها عند تغيّر الشمس (لا تبقى قديمة)', byH[7].cx !== byH[17].cx && ds.cast === false, JSON.stringify(ds));
check('بلا أخطاء كونسول', errs.length === 0, errs.join(' | '));
await b.close(); server.close();
console.log(results.every(Boolean) ? 'ALL PASS ' + results.length : 'SOME FAILED'); process.exit(results.every(Boolean) ? 0 : 1);
