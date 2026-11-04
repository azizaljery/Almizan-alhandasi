// تجربة اللوحة من جلسة تصميم (design.html?facade-kit=1): توليد A/B/C، تنزيل PNG وGLB، تبديل التصميم، والجوال.
// الاستخدام: node scripts/facade-kit-e2e.mjs [مجلد-الإخراج]
import { createServer } from 'node:http'; import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs'; import { extname, join, dirname, resolve, sep } from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..', 'dist'), fx = resolve(here, '..', 'tests', 'fixtures', 'facade'), out = resolve(process.argv[2] || '.'); mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' };
const srv = createServer((q, r) => { const f = resolve(root, '.' + new URL(q.url, 'http://x').pathname); if ((f === root || f.startsWith(root + sep)) && existsSync(f) && statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)); } else { r.writeHead(404); r.end(); } });
await new Promise(r => srv.listen(8152, r));
const doc = readFileSync(join(fx, 'C1.json'), 'utf8'), res = {}, errs = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
async function run(name, ctxOpts) {
  const ctx = await b.newContext({ acceptDownloads: true, ...ctxOpts }), pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(name + ': ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text().slice(0, 200)); });
  await pg.addInitScript(d => { const s = { v: 1, current: 0, createdAt: 1730000000000, designs: [{ doc: d, version: 1 }, { doc: d, version: 2 }], input: {}, dna: null }; try { localStorage.setItem('mizan.design.session.v1', JSON.stringify(s)); } catch {} }, doc);
  await pg.goto('http://localhost:8152/design.html?facade-kit=1'); const host = await pg.waitForSelector('#facade-kit-preview', { timeout: 60000 }).catch(() => null);
  res[name] = { panel: !!host };
  if (!host) { res[name].body = (await pg.textContent('body')).slice(0, 300); await ctx.close(); return; }
  await pg.waitForFunction(() => document.querySelector('#facade-kit-preview button'), null, { timeout: 60000 });
  for (const st of ['A', 'B', 'C']) {
    await pg.click(`#facade-kit-preview button:has-text("البديل ${st}")`); await pg.waitForFunction(() => /معاينة غير معتمدة|تعذّر/.test(document.querySelector('#facade-kit-preview p:last-of-type')?.textContent || document.querySelector('#facade-kit-preview').textContent), null, { timeout: 300000 });
    res[name][st] = (await pg.textContent('#facade-kit-preview')).replace(/\s+/g, ' ').slice(-90);
    await (await pg.$('#facade-kit-preview canvas')).screenshot({ path: join(out, `${name}-${st}.png`) });
    if (st === 'A' && name === 'desktop') {
      const [dp] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#facade-kit-png')]); await dp.saveAs(join(out, 'download.png')); res.png = { name: dp.suggestedFilename(), bytes: statSync(join(out, 'download.png')).size };
      const [dg] = await Promise.all([pg.waitForEvent('download', { timeout: 120000 }), pg.click('#facade-kit-glb')]); await dg.saveAs(join(out, 'download.glb')); const gb = readFileSync(join(out, 'download.glb')); res.glb = { name: dg.suggestedFilename(), bytes: gb.length, magic: gb.subarray(0, 4).toString(), version: gb.readUInt32LE(4), declaredLength: gb.readUInt32LE(8) };
    }
  }
  res[name].hScroll = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  await pg.screenshot({ path: join(out, `${name}-page.png`), fullPage: false }); await ctx.close();
}
await run('desktop', { viewport: { width: 1280, height: 900 } });
await run('mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await b.close(); srv.close(); res.errors = errs.slice(0, 8); writeFileSync(join(out, 'e2e.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
