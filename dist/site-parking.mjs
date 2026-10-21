// (الجولة الثانية عشرة) مواقف السيارات في الموقع (قيمة تصميمية افتراضية للميزان؛ ما يطلبه العميل يغلبها): موقف أو موقفان بمقاس
// 2.7 × 5.5 م (عمودي على الشارع) أو 5.6 × 2.6 م (موازٍ له) داخل حدود الأرض على الشارع، خارج المبنى بهامش، ولا يسد ممر أي باب خارجي.
// تُرسم في المستند مناطق (zones) من نوع «garage» في الدور الأرضي: يرسمها المسقط ويضع المجسّم السيارات عليها، ويقيسها المراجع.
// لا رقم نظامي هنا: المقاسات قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا).
import { analyzeDoc } from './draw/digest.mjs';
import { wallRect } from './draw/review.mjs';
import { pointInPolygon, ccw } from './draw/geom.mjs';

export const BAY = Object.freeze({ perp: { w: 2.7, d: 5.5 }, para: { w: 5.6, d: 2.5 } });
const ANG = { s: 0, n: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
const rot = (p, a) => ({ x: Math.cos(a) * p.x - Math.sin(a) * p.y, y: Math.sin(a) * p.x + Math.cos(a) * p.y });
const r2 = v => Math.round(v * 100) / 100;

/**
 * يقترح مواقف السيارات لمستند (الدور الأرضي): يعيد { bays:[{ polygon, side, kind }], note_ar }. لا يعدّل المستند.
 * max: أقصى عدد (افتراضيًا 2).
 */
export function planParking(doc, { max = 2 } = {}) {
  const plot0 = doc.plot?.polygon; if (!plot0 || plot0.length < 3) return { bays: [], note_ar: 'لا مضلع أرض في المستند.' };
  const plot = ccw(plot0.map(p => ({ x: p.x, y: p.y })));
  const model = analyzeDoc(doc), G = model.levels[0]; if (!G) return { bays: [], note_ar: 'لا دور أرضي.' };
  const entry = doc.entry || 's', streets = [...new Set([entry, ...(doc.streets || [])])].filter(s => ANG[s] !== undefined);
  // العوائق: الجدران الأرضية بهامش 0.25 م، وممرات الأبواب الخارجية (من الباب إلى حد الأرض على جهة الشارع، و1.8 م لغيرها)
  const wallBoxes = G.walls.filter(w => (w.kind || 'wall') !== 'fence').map(w => wallRect(w));
  const doors = G.openings.filter(op => op.door && op.sides.some(s => s.exterior)).map(op => { const s = op.sides.find(x => x.exterior); return { p: op.p, out: s.outward, w: op.w, entry: !!op.o.entry }; });
  const best = [];
  for (const side of streets) {
    const a = ANG[side], F = p => rot(p, a), Fi = p => rot(p, -a);
    const P = plot.map(F), ys = P.map(p => p.y), y0 = Math.min(...ys), xs = P.map(p => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const boxes = wallBoxes.map(r => r.map(F)).map(r => ({ x0: Math.min(...r.map(p => p.x)) - .25, x1: Math.max(...r.map(p => p.x)) + .25, y0: Math.min(...r.map(p => p.y)) - .25, y1: Math.max(...r.map(p => p.y)) + .25 }));
    for (const d of doors) {
      const p = F(d.p), o = rot(d.out, a), hw = d.w / 2 + .45;
      if (o.y < -.7) boxes.push({ x0: p.x - hw, x1: p.x + hw, y0: y0 - 1, y1: p.y + .2 }); // باب على الشارع: ممره إلى حد الأرض
      else { const q = { x: p.x + o.x * 1.8, y: p.y + o.y * 1.8 }; boxes.push({ x0: Math.min(p.x, q.x) - hw, x1: Math.max(p.x, q.x) + hw, y0: Math.min(p.y, q.y) - hw, y1: Math.max(p.y, q.y) + hw }); }
    }
    const inside = r => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].every(([x, y]) => pointInPolygon({ x, y }, P, 1e-6) && distToPoly({ x, y }, P) >= .08);
    const hit = r => boxes.some(b => r.x0 < b.x1 && r.x1 > b.x0 && r.y0 < b.y1 && r.y1 > b.y0);
    // الحد الأمامي عند x: أدنى y للمضلع على ذلك العمود (أرض غير منتظمة)
    const frontAt = (xa, xb) => { let m = -Infinity; for (const x of [xa, (xa + xb) / 2, xb]) m = Math.max(m, minYAt(P, x)); return m; };
    const cands = [];
    for (const kind of ['perp', 'para']) {
      const { w, d } = BAY[kind];
      for (let x = x0 + .15; x + w <= x1 - .15 + 1e-9; x += .1) {
        const fy = frontAt(x, x + w); if (!Number.isFinite(fy)) continue;
        const r = { x0: x, x1: x + w, y0: fy + .1, y1: fy + .1 + d };
        if (!inside(r) || hit(r)) continue;
        cands.push({ r, kind, side, F, Fi, fam: Math.min(...doors.filter(q => q.entry).map(q => Math.hypot(F(q.p).x - (x + w / 2), F(q.p).y - fy)), 99) });
      }
    }
    // مجموعة من موقفين متجاورين (أو واحد): العمودي أولًا، ثم البعد عن باب العائلة، ثم القرب من طرف الأرض (يبقى وسط الواجهة حرًا)
    const score = c => (c.kind === 'perp' ? 10 : 0) + Math.min(c.fam, 8) * .3 + Math.min(c.r.x0 - x0, x1 - c.r.x1) * -.2 + (side === entry ? 2 : 0);
    cands.sort((p, q) => score(q) - score(p));
    for (const c of cands) {
      const set = [c];
      const mate = cands.filter(o => o !== c && o.kind === c.kind && Math.abs(o.r.y0 - c.r.y0) < .3 && (Math.abs(o.r.x0 - c.r.x1 - .1) < .15 || Math.abs(c.r.x0 - o.r.x1 - .1) < .15)).sort((p, q) => score(q) - score(p))[0];
      if (mate && max >= 2) set.push(mate);
      const sc = set.reduce((t, x) => t + score(x), 0) + (set.length === 2 ? 6 : 0);
      if (!best.length || sc > best.sc) { best.length = 0; best.push(...set); best.sc = sc; }
      if (set.length === 2) break;
    }
  }
  const bays = best.map(c => ({ kind: c.kind, side: c.side, polygon: [[c.r.x0, c.r.y0], [c.r.x1, c.r.y0], [c.r.x1, c.r.y1], [c.r.x0, c.r.y1]].map(([x, y]) => { const q = c.Fi({ x, y }); return { x: r2(q.x), y: r2(q.y) }; }) }));
  return { bays, note_ar: bays.length ? `${bays.length === 1 ? 'موقف سيارة' : 'موقفا سيارتين'} ${bays[0].kind === 'perp' ? 'عمودي على الشارع' : 'موازٍ للشارع'} في الارتداد (قيمة تصميمية افتراضية للميزان).` : 'لم يتسع موقف سيارة في الارتداد خارج المبنى وممرات الأبواب (قيمة تصميمية افتراضية للميزان لم تتحقق).' };
}
function minYAt(P, x) {
  let m = Infinity;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) { if (a.x === b.x && Math.abs(a.x - x) < 1e-9) m = Math.min(m, a.y, b.y); continue; } const t = (x - a.x) / (b.x - a.x); m = Math.min(m, a.y + t * (b.y - a.y)); }
  return m;
}
function distToPoly(p, P) {
  let d = Infinity;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)); d = Math.min(d, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)); }
  return d;
}

export default { planParking, BAY };
