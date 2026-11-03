// أداة قياس خارج المستودع: التقاط متسلسل بمتصفح واحد. الاستخدام: node capture.cjs <مجلد-الإخراج> <ملف-الإعدادات.json>
const { createServer } = require('node:http');
const { readFileSync, existsSync, mkdirSync, statSync, writeFileSync, appendFileSync } = require('node:fs');
const { extname, join } = require('node:path');
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const DIST = '/home/claude/wt-final/dist', FIX = '/home/claude/wt-final/tests/fixtures/facade', HARN = __dirname;
const outDir = process.argv[2], cfgFile = process.argv[3];
mkdirSync(outDir, { recursive: true });
const log = m => { appendFileSync(join(outDir, 'log.txt'), m + '\n'); };
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const PORT = 8163, ORIGIN = 'http://localhost:' + PORT;
const srv = createServer((req, res) => {
  const p = new URL(req.url, ORIGIN).pathname;
  let f;
  if (p === '/measure.html') f = join(HARN, 'measure.html');
  else if (p === '/facade-realism/C1.json') f = join(FIX, 'C1.json');
  else f = join(DIST, p);
  if (!f.startsWith(DIST) && !f.startsWith(FIX) && !f.startsWith(HARN)) { res.writeHead(403); res.end(); return; }
  if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); }
  else { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const cfgs = JSON.parse(readFileSync(cfgFile, 'utf8'));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    for (const c of cfgs) {
      const t0 = Date.now();
      const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      const qs = Object.entries(c.q).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
      await page.goto(`${ORIGIN}/measure.html?${qs}`);
      await page.waitForFunction(() => globalThis.__FR?.ready === true, null, { timeout: 900000 });
      const info = await page.evaluate(() => globalThis.__FR);
      if (info.error) { log(`ERR ${c.name}: ${info.error}`); results.push({ name: c.name, error: info.error }); await page.close(); continue; }
      const file = join(outDir, c.name + '.png');
      await (await page.$('#fr')).screenshot({ path: file });
      const rec = { name: c.name, q: c.q, file, secs: Math.round((Date.now() - t0) / 1000), errs, ...info };
      results.push(rec);
      log(`OK ${c.name} ${rec.secs}s glError=${info.glError}`);
      await page.close();
    }
  } finally {
    await browser.close(); srv.close();
  }
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 1));
  writeFileSync(join(outDir, 'DONE'), 'done ' + new Date().toISOString() + '\n');
  log('ALL DONE');
})().catch(e => { log('FATAL ' + (e?.stack || e)); writeFileSync(join(outDir, 'DONE'), 'fatal\n'); process.exit(1); });
