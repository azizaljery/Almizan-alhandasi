// لقطات بكاميرا مخصصة من لوحة facade-kit-site.html. node scripts/facade-kit-cam.mjs <out> name=a.png style=0|1|2 pos=x,y,z look=x,y,z [fov=34] [exp=1] [mono=1] [fixture=C1] [w=1000 h=700] ...
import { createServer } from 'node:http'; import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs'; import { extname, join, dirname, resolve, sep } from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..', 'dist'), fx = resolve(here, '..', 'tests', 'fixtures', 'facade');
const a = Object.fromEntries(process.argv.slice(3).map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; })), out = resolve(process.argv[2] || '.'); mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const srv = createServer((q, r) => { const p = new URL(q.url, 'http://x').pathname; const f = p === '/facade-realism/C1.json' ? join(fx, (a.fixture || 'C1') + '.json') : resolve(root, '.' + p); if ((f === root || f.startsWith(root + sep) || f.startsWith(fx)) && existsSync(f) && statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)); } else { r.writeHead(404); r.end(); } });
await new Promise(r => srv.listen(8154, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1500, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('http://localhost:8154/facade-kit-site.html?fixture=1'); if (a.exp) await pg.check('#exp'); if (a.mono) await pg.check('#mono');
await pg.waitForFunction(() => window.__KS?.ready, null, { timeout: 900000 }); await pg.waitForTimeout(500);
const styles = (a.style || '0,1,2').split(','), shots = a.shots ? JSON.parse(a.shots) : [{ name: a.name || 'cam.png', pos: a.pos, look: a.look, fov: a.fov }];
for (const sh of shots) for (const si of (sh.style ?? a.style ?? '0,1,2').toString().split(',')) {
  await pg.evaluate(({ si, pos, look, fov }) => { const v = window.__KV[+si]; if (pos) { const p = pos.split(',').map(Number), l = look.split(',').map(Number); v.camera.position.set(...p); v.camera.fov = Number(fov || 34); v.camera.near = .02; v.camera.updateProjectionMatrix(); v.camera.lookAt(...l); v.camera.updateMatrixWorld(); } v.render(); }, { si, pos: sh.pos, look: sh.look, fov: sh.fov });
  await (await pg.$$('canvas'))[+si].screenshot({ path: join(out, sh.name.replace('.png', `-${'ABC'[+si]}.png`)) });
}
console.log('done', errs.slice(0, 3)); await b.close(); srv.close();
