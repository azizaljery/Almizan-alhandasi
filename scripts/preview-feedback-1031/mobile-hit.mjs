// حارس المرسم على الجوال: لا تمرير أفقي، الأزرار مرئية كاملة، لا تداخل نقاط النقر، ثم رسم/تصدير/تبديل الوضع.
// الاستخدام: node mobile-hit.mjs <dist> <مجلد لقطات> [W=390] [H=844]  — يخرج بـ 1 عند أي فشل.
import { mkdirSync } from 'node:fs'; import { createRequire } from 'node:module'; import { serve } from './serve.mjs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const [dist, shots, W = '390', H = '844'] = process.argv.slice(2); mkdirSync(shots, { recursive: true });
const w = +W, h = +H; const S = serve(dist, 8600 + Math.floor(Math.random() * 90));
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 700, isMobile: w < 700, acceptDownloads: true, locale: 'ar' });
const p = await ctx.newPage(); await p.route(/workers\.dev|googleapis|gstatic/, r => r.abort()); p.on('pageerror', e => console.log('PAGEERROR', e.message));
let fails = 0; const out = {}; const check = (ok, m) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', m); };
await p.goto(S.ORIGIN + '/studio.html'); await p.waitForTimeout(1500);
async function hitAll(label) {
  await p.evaluate(() => window.scrollTo(0, 0)); // الفحص عند أول الصفحة (على الجوال تتمرر الصفحة في «مقسوم»)
  const r = await p.evaluate(() => {
    const sels = ['#rail button', '#zoomIn', '#zoomOut', '#zoomFit', '#tgSnap', '#tgGrid', '#tgDims', '#modeToggle', '#btnExport', '#btnSave', '#undo', '#redo'];
    const res = []; for (const s of sels) for (const e of document.querySelectorAll(s)) {
      const cs = getComputedStyle(e); if (cs.display === 'none' || e.offsetParent === null && cs.position !== 'fixed') continue;
      const r = e.getBoundingClientRect(); const id = e.id || e.dataset.tool || s;
      const inView = r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5;
      let scrollerOk = true, c = e.parentElement; // الزر قد يكون داخل حاوية تمرير: يُحتسب بعد scrollIntoView
      e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const q = e.getBoundingClientRect();
      const top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      res.push({ id, x: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), inView, hit: top === e || e.contains(top) });
    } return { res, sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth };
  });
  out[label] = r; console.log(label, 'scrollWidth', r.sw, 'body', r.bw, 'inner', r.iw);
  for (const x of r.res) if (!x.hit || (x.id === 'modeToggle' && !x.inView)) console.log('  BAD', JSON.stringify(x));
  check(r.sw <= r.iw, label + ' بلا تمرير أفقي للصفحة (' + r.sw + ' ≤ ' + r.iw + ')');
  check(r.res.every(x => x.hit), label + ' elementFromPoint يرجع الزر نفسه لكل الأزرار (' + r.res.filter(x => x.hit).length + '/' + r.res.length + ')');
  const mt = r.res.find(x => x.id === 'modeToggle'); check(mt && (mt.inView || (w > 600 && label !== 'simple')), label + ' #modeToggle كامل داخل الشاشة ' + JSON.stringify(mt));
  // تداخل مستطيلات الأدوات الظاهرة مع التكبير
  const ov = await p.evaluate(() => { const A = [...document.querySelectorAll('#rail button, #modeToggle')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()); const Z = [...document.querySelectorAll('.floaters .fl')].map(e => e.getBoundingClientRect());
    const rail = document.getElementById('rail').getBoundingClientRect(); let n = 0; for (const z of Z) { if (z.width && !(z.right <= rail.left || z.left >= rail.right || z.bottom <= rail.top || z.top >= rail.bottom)) n++; } return n; });
  check(ov === 0, label + ' أزرار التكبير لا تتقاطع مع شريط الأدوات (' + ov + ')');
}
await p.screenshot({ path: shots + '/01-initial.png' });
const wel = await p.evaluate(() => { const e = document.getElementById('welcome'); return e && !e.hidden ? Object.assign({}, e.getBoundingClientRect().toJSON()) : null; }); out.welcome = wel; console.log('welcome', JSON.stringify(wel));
await hitAll('simple');
// (1101) عرض «مقسوم» على الجوال: لوحة الرسم بحجم عملي، وشريط المجسّم لا يتراكب ولا يُغطّى، وكل أزراره تُنقر
if (w < 700) {
  const sp = await p.evaluate(() => { const bars = [...document.querySelectorAll('#threeBar > *')].filter(e => e.offsetParent).map(e => { e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { id: e.id || e.className, ok: t === e || e.contains(t) }; }); return { bars: bars.map(x => x.id + ':' + x.ok).join(','), badHit: bars.filter(x => !x.ok).length, nb: bars.length }; });
  const doc = await p.evaluate(() => { window.scrollTo(0, 0); const A = e => { const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top + scrollY, b: q.bottom + scrollY }; }; const X = (a, b) => a.l < b.r - .5 && a.r > b.l + .5 && a.t < b.b - .5 && a.b > b.t + .5;
    const P = A(document.getElementById('planCanvas')), H = A(document.getElementById('threeHost')); const bars = [...document.querySelectorAll('#threeBar > *')].filter(e => e.offsetParent).map(A); return { planH: P.b - P.t, ovHost: bars.filter(q => X(q, H)).length, ovPlan: bars.filter(q => X(q, P)).length, n: bars.length }; });
  console.log('SPLIT', JSON.stringify(sp), JSON.stringify(doc)); out.split = { sp, doc };
  check(doc.planH >= 320, 'عرض «مقسوم»: لوحة الرسم بحجم عملي (' + Math.round(doc.planH) + ' ≥ 320)');
  check(doc.n >= 4 && doc.ovHost === 0 && doc.ovPlan === 0, 'شريط المجسّم لا يتقاطع مع لوحة المجسّم ولا الرسم (' + doc.n + ' عناصر، تقاطع ' + doc.ovHost + '/' + doc.ovPlan + ')');
  check(sp.badHit === 0 && sp.nb >= 4, 'elementFromPoint لكل أزرار شريط المجسّم يرجع الزر نفسه (' + sp.bars + ')');
  await p.evaluate(() => window.scrollTo(0, 0));
}
// رسم غرفة بالمس/الفأرة
const tap = async (x, y) => { if (w < 700) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
const wb = await p.$('#welcome:not([hidden]) [data-start=rect], #welcome:not([hidden]) [data-start=wall]'); if (wb) { const bx = await wb.boundingBox(); await tap(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.waitForTimeout(300); }
await p.click('#rail [data-tool=rect]'); const cv = await (await p.$('#planCanvas')).boundingBox();
const x0 = cv.x + cv.width * .25, y0 = cv.y + cv.height * .3, x1 = cv.x + cv.width * .7, y1 = cv.y + cv.height * .65;
await tap(x0, y0); await p.waitForTimeout(150); await tap(x1, y1); await p.waitForTimeout(500);
const st = () => p.evaluate(() => { const d = globalThis.__mizanStudio?.doc; const L = d?.levels?.[0] || d; return JSON.stringify(d ?? null).length + ':' + (L?.walls?.length ?? '?'); });
const walls = await p.evaluate(() => { const d = globalThis.__mizanStudio?.doc; const n = o => o ? JSON.stringify(o).length : 0; return { walls: (d?.levels || []).reduce((a, l) => a + (l.walls?.length || 0), 0) + (d?.walls?.length || 0) }; });
console.log('WALLS', walls.walls); check(walls.walls >= 4, 'رسم الغرفة بلمسة أنتج ' + walls.walls + ' جدران (≥4)');
await p.click('#rail [data-tool=select]'); await tap((x0 + x1) / 2, y0); await p.waitForTimeout(300); await p.screenshot({ path: shots + '/02-room-drawn.png' });
const sel = await p.evaluate(() => document.querySelector('#tab-props')?.innerText?.length || 0); check(sel > 20, 'تحرير: لوحة الخصائص تعرض عند اللمس (' + sel + ' حرفًا)');
// تصدير
await p.click('#btnExport'); await p.waitForTimeout(300); await p.screenshot({ path: shots + '/03-export-menu.png' });
const m = await p.evaluate(() => { const r = document.getElementById('exportMenu').getBoundingClientRect(); const bs = [...document.querySelectorAll('#exportMenu button')].map(e => { const q = e.getBoundingClientRect(); return [q.left, q.right, q.top, q.bottom]; }); return { l: r.left, r: r.right, t: r.top, b: r.bottom, iw: innerWidth, ih: innerHeight, bs, sh: document.getElementById('exportMenu').scrollHeight, ch: document.getElementById('exportMenu').clientHeight }; });
out.menu = m; check(m.l >= 0 && m.r <= m.iw && m.t >= 0 && m.b <= m.ih, 'قائمة التصدير كاملة غير مقصوصة ' + JSON.stringify([Math.round(m.l), Math.round(m.r), Math.round(m.t), Math.round(m.b)]) + ' scroll ' + m.sh + '/' + m.ch);
check(m.sh <= m.ch + 4, 'قائمة التصدير بلا حاجة للتمرير الداخلي');
const dlp = p.waitForEvent('download', { timeout: 8000 }); await p.click('#exportMenu [data-export=dxf]'); const dl = await dlp; const f = shots + '/test.dxf'; await dl.saveAs(f); check((await import('node:fs')).statSync(f).size > 500, 'تنزيل DXF ' + (await import('node:fs')).statSync(f).size + ' بايت');
await p.keyboard.press('Escape'); await p.mouse.click(5, h - 5).catch(() => {});
// الوضع المتقدم
await p.evaluate(() => document.getElementById('modeToggle').scrollIntoView({ inline: 'nearest' }));
const mtc = await p.evaluate(() => { const r = document.getElementById('modeToggle').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await tap(mtc[0], mtc[1]); await p.waitForTimeout(400); const mode1 = await p.evaluate(() => document.getElementById('app').dataset.mode); check(mode1 !== 'simple', 'نقر #modeToggle بإحداثيات الشاشة فتح المتقدم (' + mode1 + ')');
await p.screenshot({ path: shots + '/04-advanced.png' }); await hitAll('advanced');
const mtc2 = await p.evaluate(() => { document.getElementById('modeToggle').scrollIntoView({ inline: 'nearest' }); const r = document.getElementById('modeToggle').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await tap(mtc2[0], mtc2[1]); await p.waitForTimeout(400); const mode2 = await p.evaluate(() => document.getElementById('app').dataset.mode); check(mode2 === 'simple', 'العودة إلى البسيط (' + mode2 + ')');
await p.screenshot({ path: shots + '/05-back-simple.png' }); await hitAll('simple-again');
// (1101) صفحة المخرجات بلا فيض أفقي (كان 431 بدل 390): نفس المستند المرسوم في التخزين
await p.goto(S.ORIGIN + '/final.html'); await p.waitForTimeout(2000);
const fin = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, secs: document.querySelectorAll('.sec').length })); console.log('FINAL', JSON.stringify(fin));
check(fin.secs >= 3 && fin.sw <= w, 'final.html: scrollWidth ' + fin.sw + ' ≤ ' + w + ' (' + fin.secs + ' أقسام)');
await p.screenshot({ path: shots + '/06-final.png', fullPage: true });
require('node:fs').writeFileSync(shots + '/measure.json', JSON.stringify(out, null, 1));
await b.close(); S.close(); console.log('FAILS', fails); process.exit(fails ? 1 : 0);
