// المخطط ثنائي الأبعاد على الجوال: سماكة الخطوط لا تنزل عن حد مقروء، والنص ≥11px، ومسار الطباعة (sheet) لا يتأثر
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pens, renderPlan, fitView } from '../dist/draw/editor/render2d.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';

const doc = parseDoc(readFileSync(new URL('./fixtures/mobile-villa-b1.json', import.meta.url), 'utf8'));
function recorder() {
  const widths = new Set(), fonts = [];
  const ctx = new Proxy({}, { get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return s => ({ width: String(s).length * 6 }); if (k === 'createPattern' || k === 'createLinearGradient') return () => ({ addColorStop() {} }); if (k === 'canvas') return { width: 400, height: 400 }; return () => {}; }, set(t, k, v) { t[k] = v; if (k === 'lineWidth') widths.add(+v); if (k === 'font') fonts.push(String(v)); return true; } });
  return { ctx, widths, fonts };
}
const draw = (W, H, flags = {}) => { const r = recorder(); const view = fitView(((d) => { const b = { x0: 0, y0: 0, x1: 20, y1: 30 }; return b; })(), W, H); try { renderPlan(r.ctx, { doc, levelId: doc.levels[0].id, view, W, H, flags, dpr: 1 }); } catch (e) { r.err = e; } return r; };
const minPx = fonts => Math.min(...fonts.map(f => parseFloat(f.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 99)));

test('pens: الجوال يرفع الحد الأدنى للسماكة والافتراضي كما كان', () => {
  const a = pens(14), b = pens(14, true);
  assert.ok(b.thin >= 1 && b.medium >= 1.6 && b.thick >= 2.4 && b.heavy >= 3.2);
  assert.ok(b.thin >= a.thin && b.medium >= a.medium);
  assert.deepEqual(pens(30), pens(30, false));
  const big = pens(80, true), bigOff = pens(80); assert.ok(big.thick >= bigOff.thick);
});

test('الرسم على لوحة 390px: لا خطأ، أقل سماكة خط مرسوم ≥1، وأصغر خط نص ≥10px (الأبعاد/التسميات تتقلص لتناسب الفراغ ولا تنزل عن 10)؛ مسار الطباعة بلا حدود الجوال', () => {
  const m = draw(390, 700), desk = draw(1200, 800), sheet = draw(390, 700, { sheet: true });
  for (const r of [m, desk, sheet]) assert.equal(r.err, undefined, String(r.err?.stack));
  const pos = w => [...w].filter(x => x > 0);
  assert.ok(Math.min(...pos(m.widths)) >= 0.99, 'أرفع خط ' + Math.min(...pos(m.widths)));
  assert.ok(minPx(m.fonts.filter(f => /px/.test(f))) >= 10 - 1e-9 || m.fonts.length === 0, 'أصغر خط ' + minPx(m.fonts));
  assert.ok(Math.min(...pos(sheet.widths)) <= Math.min(...pos(m.widths)), 'الطباعة لم تُرفع بحد الجوال');
});
