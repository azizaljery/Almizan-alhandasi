// قائمة التصدير في المرسم: داخل النافذة بعروض 390/820/1024/1366 (لقطات)، ولا فيض أفقي، وكل بند يُنتج ملفًا غير فارغ
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module'; import { serve } from './serve.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const [dist, sessFile, shots, tag = 'after'] = process.argv.slice(2); mkdirSync(shots, { recursive: true });
const S = serve(dist, 8300 + Math.floor(Math.random() * 90)); const sess = readFileSync(sessFile, 'utf8');
const b = await chromium.launch(); let fails = 0; const say = (ok, m) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', m); };
for (const [W, H] of [[390, 844], [820, 1180], [1024, 768], [1366, 1024]]) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, acceptDownloads: true, hasTouch: W < 1100, locale: 'ar' }); const p = await ctx.newPage();
  await p.route(/googleapis|gstatic|workers\.dev/, r => r.abort()); p.on('pageerror', e => console.log('PAGEERROR', W, e.message));
  await p.goto(S.ORIGIN + '/home.html'); await p.evaluate(s => { localStorage.clear(); localStorage.setItem('mizan.design.session.v1', JSON.stringify(JSON.parse(s).session)); }, sess);
  await p.goto(S.ORIGIN + '/design.html'); await p.waitForTimeout(800); await p.click('#btnStudio'); await p.waitForURL(/studio/); await p.waitForTimeout(1500);
  const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  say(ov.sw <= ov.iw, `${W}: لا فيض أفقي (scrollWidth ${ov.sw} / ${ov.iw})`);
  await p.click('#btnExport'); await p.waitForTimeout(300);
  const m = await p.evaluate(() => { const r = document.getElementById('exportMenu').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: document.documentElement.clientWidth, vh: innerHeight, items: [...document.querySelectorAll('#exportMenu button')].map(x => { const q = x.getBoundingClientRect(); return { t: x.textContent, l: q.left, r: q.right, h: q.height }; }) }; });
  say(m.l >= 0 && m.r <= m.vw && m.t >= 0 && m.b <= m.vh, `${W}: القائمة داخل النافذة (${Math.round(m.l)}..${Math.round(m.r)} من ${m.vw})`);
  say(m.items.every(i => i.l >= 0 && i.r <= m.vw && i.h >= 44), `${W}: البنود الخمسة ظاهرة كاملة ولمسها ≥ 44 (${m.items.map(i => Math.round(i.h)).join(',')})`);
  await p.screenshot({ path: `${shots}/export-menu-${W}-${tag}.png` });
  if (W === 1366 || W === 390) {
    for (const kind of ['png', 'png3d', 'dxf', 'json', 'bundle']) {
      if (await p.locator('#exportMenu').isHidden()) await p.click('#btnExport');
      const dls = []; const on = d => dls.push(d); p.on('download', on);
      await p.click(`#exportMenu [data-export=${kind}]`);
      if (kind === 'bundle') { await p.waitForSelector('dialog button:has-text("تنزيل ZIP")', { timeout: 30000 }); await p.click('dialog button:has-text("تنزيل ZIP")'); }
      await p.waitForTimeout(kind === 'png3d' ? 6000 : 1500);
      p.off('download', on);
      const files = []; let k = 0; for (const d of dls) { const f = `${shots}/dl-${W}-${kind}-${k++}.bin`; await d.saveAs(f); const buf = readFileSync(f); const magic = buf.slice(0, 4).toString('latin1'); const type = magic.startsWith('\x89PNG') ? 'png' : magic.startsWith('PK') ? 'zip' : /SECTION/.test(buf.slice(0, 200).toString()) ? 'dxf' : (() => { try { const j = JSON.parse(buf.toString()); return j.schema || j.kind ? 'json:' + (j.schema || j.kind) : 'json'; } catch { return 'other'; } })(); files.push([d.suggestedFilename(), statSync(f).size, type]); }
      const want = { png: 'png', png3d: 'png', dxf: 'dxf', json: 'json', bundle: 'zip' }[kind], main = files.filter(([, , t]) => t.startsWith(want));
      say(main.length >= 1 && main.every(([, s]) => s > 0), `${W}: تصدير ${kind} ← ${JSON.stringify(files)}`);
      if (kind === 'bundle') await p.click('dialog button:has-text("إغلاق")').catch(() => {});
    }
  }
  await ctx.close();
}
await b.close(); S.close(); console.log('FAILS', fails); process.exit(fails ? 1 : 0);
