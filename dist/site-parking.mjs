// (الجولة الثانية عشرة) مواقف السيارات في الموقع (قيمة تصميمية افتراضية للميزان؛ ما يطلبه العميل يغلبها): موقف أو موقفان بمقاس
// 2.7 × 5.5 م (عمودي على الشارع) أو 5.6 × 2.6 م (موازٍ له) داخل حدود الأرض على الشارع، خارج المبنى بهامش، ولا يسد ممر أي باب خارجي.
// تُرسم في المستند مناطق (zones) من نوع «garage» في الدور الأرضي: يرسمها المسقط ويضع المجسّم السيارات عليها، ويقيسها المراجع.
// المقاسات قيم تصميمية افتراضية للميزان (غير متحققة نظاميًا). أما العدد فاشتراط نظامي متحقق (المستوى أ):
// موقف واحد لأرض ≤ 400 م² وموقفان لما فوقها داخل حدود الملكية — PARKING_RULE أدناه بمصدره.

/** (الجولة الثانية عشرة) عدد المواقف النظامي: data/regulations-sa.json في فرع البحث dev/regulations (bdc31d4)، البند parking.spaces_per_villa. */
export const PARKING_RULE = Object.freeze({
  item: 'parking.spaces_per_villa', thresholdM2: 400, small: 1, large: 2, tier: 'regulation', level: 'official-confirmed',
  source: 'اشتراطات إنشاء المباني السكنية — وزارة البلديات والإسكان، قرار 4500943139/1 (1446هـ) §4-1.14؛ مؤكَّد في عكاظ والوطن والاقتصادية ومال (2024-07-15)',
  url: 'https://www.okaz.com.sa/ampArticle/2165939',
  note_ar: 'الحد الوطني؛ المخطط المعتمد أو الأمانة قد يغيّره.',
});
export const plotArea = poly => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); };
/** عدد المواقف المطلوب نظاميًا لأرض مساحتها area م². */
export const requiredParking = area => (area > PARKING_RULE.thresholdM2 ? PARKING_RULE.large : PARKING_RULE.small);
import { analyzeDoc } from './draw/digest.mjs';
import { wallRect } from './draw/review.mjs';
import { pointInPolygon, ccw } from './draw/geom.mjs';
import { nextId } from './draw/doc.mjs';

export const BAY = Object.freeze({ perp: { w: 2.7, d: 5.5 }, para: { w: 5.6, d: 2.5 } });
const ANG = { s: 0, n: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
const rot = (p, a) => ({ x: Math.cos(a) * p.x - Math.sin(a) * p.y, y: Math.sin(a) * p.x + Math.cos(a) * p.y });
const r2 = v => Math.round(v * 100) / 100;

/**
 * يقترح مواقف السيارات لمستند (الدور الأرضي): يعيد { bays:[{ polygon, side, kind }], note_ar }. لا يعدّل المستند.
 * max: أقصى عدد (افتراضيًا 2).
 */
export function planParking(doc, { max = null, parallel = false } = {}) {
  const plot0 = doc.plot?.polygon; if (!plot0 || plot0.length < 3) return { bays: [], note_ar: 'لا مضلع أرض في المستند.' };
  const need = requiredParking(plotArea(plot0)); if (max == null) max = need;
  const plot = ccw(plot0.map(p => ({ x: p.x, y: p.y })));
  const model = analyzeDoc(doc), G = model.levels[0]; if (!G) return { bays: [], note_ar: 'لا دور أرضي.' };
  const entry = doc.entry || 's', streets = [...new Set([entry, ...(doc.streets || [])])].filter(s => ANG[s] !== undefined);
  // العوائق: الجدران الأرضية بهامش 0.25 م، وممرات الأبواب الخارجية (من الباب إلى حد الأرض على جهة الشارع، و1.8 م لغيرها)
  const wallBoxes = G.walls.filter(w => (w.kind || 'wall') !== 'fence').map(w => wallRect(w));
  const doors = G.openings.filter(op => op.door && op.sides.some(s => s.exterior)).map(op => { const s = op.sides.find(x => x.exterior); return { p: op.p, out: s.outward, w: op.w, entry: !!op.o.entry }; });
  const best = [], all = [];
  for (const side of streets) {
    const a = ANG[side], F = p => rot(p, a), Fi = p => rot(p, -a);
    const P = plot.map(F), ys = P.map(p => p.y), y0 = Math.min(...ys), xs = P.map(p => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const boxes = wallBoxes.map(r => r.map(F)).map(r => ({ x0: Math.min(...r.map(p => p.x)) - .25, x1: Math.max(...r.map(p => p.x)) + .25, y0: Math.min(...r.map(p => p.y)) - .25, y1: Math.max(...r.map(p => p.y)) + .25 }));
    for (const d of doors) {
      const p = F(d.p), o = rot(d.out, a), hw = d.w / 2 + .45;
      if (o.y < -.7) boxes.push({ x0: p.x - hw, x1: p.x + hw, y0: y0 - 1, y1: p.y + .2 }); // باب على الشارع: ممره إلى حد الأرض
      else { const q = { x: p.x + o.x * 1.8, y: p.y + o.y * 1.8 }; boxes.push({ x0: Math.min(p.x, q.x) - hw, x1: Math.max(p.x, q.x) + hw, y0: Math.min(p.y, q.y) - hw, y1: Math.max(p.y, q.y) + hw }); }
    }
    // (الجولة الرابعة عشرة) لا موقف يلاصق نافذة (0.5 م أمامها) — السيارة أمام نافذة المجلس أو الصالة عيب (المراجع المستقل r13)
    const wins = G.openings.filter(op => op.window && op.sides.some(s => s.exterior)).map(op => ({ p: op.p, out: op.sides.find(x => x.exterior).outward, w: op.w }));
    for (const wv of wins) { const p = F(wv.p), o = rot(wv.out, a), hw = wv.w / 2 + .2, q = { x: p.x + o.x * .5, y: p.y + o.y * .5 }; boxes.push({ x0: Math.min(p.x, q.x) - (Math.abs(o.x) > .7 ? 0 : hw), x1: Math.max(p.x, q.x) + (Math.abs(o.x) > .7 ? 0 : hw), y0: Math.min(p.y, q.y) - (Math.abs(o.x) > .7 ? hw : 0), y1: Math.max(p.y, q.y) + (Math.abs(o.x) > .7 ? hw : 0) }); }
    const inside = r => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].every(([x, y]) => pointInPolygon({ x, y }, P, 1e-6) && distToPoly({ x, y }, P) >= .08);
    // تجويف: المبنى على جانبي الموقف عند منتصف عمقه (0.8 م يمينه ويساره) — لا يُقبل
    const atB = (x, y) => !!G.roomAt(Fi({ x, y }));
    const niche = r => { const ym = (r.y0 + r.y1) / 2; return atB(r.x0 - .8, ym) && atB(r.x1 + .8, ym); };
    const hit = r => boxes.some(b => r.x0 < b.x1 && r.x1 > b.x0 && r.y0 < b.y1 && r.y1 > b.y0) || niche(r);
    // الحد الأمامي عند x: أدنى y للمضلع على ذلك العمود (أرض غير منتظمة)
    const frontAt = (xa, xb) => { let m = -Infinity; for (const x of [xa, (xa + xb) / 2, xb]) m = Math.max(m, minYAt(P, x)); return m; };
    const cands = [];
    // (الجولة الرابعة عشرة) عمودي على الشارع فقط (عمق 5.5 م) — الموازي في ارتداد ضحل لا يُقترح إلا بطلب العميل
    for (const kind of parallel ? ['perp', 'para'] : ['perp']) {
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
    for (const c of cands) all.push({ c, sc: score(c) });
    for (const c of cands) {
      const set = [c];
      const mate = cands.filter(o => o !== c && o.kind === c.kind && Math.abs(o.r.y0 - c.r.y0) < .3 && (Math.abs(o.r.x0 - c.r.x1 - .1) < .15 || Math.abs(c.r.x0 - o.r.x1 - .1) < .15)).sort((p, q) => score(q) - score(p))[0];
      if (mate && max >= 2) set.push(mate);
      const sc = set.reduce((t, x) => t + score(x), 0) + (set.length === 2 ? 6 : 0);
      if (!best.length || sc > best.sc) { best.length = 0; best.push(...set); best.sc = sc; }
      if (set.length === 2) break;
    }
  }
  // موقفان غير متجاورين (موضعان مختلفان على الواجهة أو على شارع آخر) إن لم يتسع زوج متجاور
  const world = c => { const q = [[c.r.x0, c.r.y0], [c.r.x1, c.r.y1]].map(([x, y]) => c.Fi({ x, y })); return { x0: Math.min(q[0].x, q[1].x) - .1, x1: Math.max(q[0].x, q[1].x) + .1, y0: Math.min(q[0].y, q[1].y) - .1, y1: Math.max(q[0].y, q[1].y) + .1 }; };
  const clash = (a, b) => { const A = world(a), B = world(b); return A.x0 < B.x1 && A.x1 > B.x0 && A.y0 < B.y1 && A.y1 > B.y0; };
  all.sort((p, q) => q.sc - p.sc);
  for (const { c } of all) { if (best.length >= max) break; if (!best.some(b => clash(b, c))) best.push(c); }
  const bays = best.map(c => ({ kind: c.kind, side: c.side, polygon: [[c.r.x0, c.r.y0], [c.r.x1, c.r.y0], [c.r.x1, c.r.y1], [c.r.x0, c.r.y1]].map(([x, y]) => { const q = c.Fi({ x, y }); return { x: r2(q.x), y: r2(q.y) }; }) }));
  const law = `المطلوب نظاميًا ${need === 1 ? 'موقف واحد' : 'موقفان'} لأرض ${need === 1 ? '≤' : '>'} 400 م² (${PARKING_RULE.source})`;
  return { bays, required: need, note_ar: bays.length ? `${bays.length === 1 ? 'موقف سيارة' : 'موقفا سيارتين'} ${bays[0].kind === 'perp' ? 'عمودي على الشارع' : 'موازٍ للشارع'} في الارتداد — ${law}؛ المقاسات قيمة تصميمية افتراضية للميزان.${bays.length < need ? ' لم يتسع إلا ' + bays.length + ' خارج المبنى وممرات الأبواب: نقص عن المطلوب نظاميًا.' : ''}` : `لم يتسع موقف سيارة في الارتداد خارج المبنى وممرات الأبواب — ${law}: نقص عن المطلوب نظاميًا.` };
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

/**
 * (الجولة الثانية عشرة) بعد تعديل يغيّر المبنى (توسعة، غرفة سائق…): موقف مرسوم صار داخل المبنى أو تحت غرفة يُعاد تخطيطه —
 * تُحذف مناطق «garage» وتُقترح من جديد على المبنى الجديد (يعدّل doc في مكانه). يعيد true إن أُعيدت.
 */
export function refreshParking(doc) {
  const old = (doc.zones || []).filter(z => z.type === 'garage'); if (!old.length) return false;
  let G; try { G = analyzeDoc(doc).levels.find(l => l.level.id === old[0].level); } catch { return false; }
  if (!G) return false;
  const hit = old.some(z => z.polygon.some(p => G.roomAt(p)) || G.rooms.some(r => pointInPolygon(r.inside, z.polygon, 0)));
  if (!hit) return false;
  doc.zones = doc.zones.filter(z => z.type !== 'garage');
  let pk; try { pk = planParking(doc); } catch { return true; }
  for (const b of pk.bays) doc.zones.push({ id: nextId(doc, 'zones'), level: old[0].level, name: old[0].name || 'موقف سيارة', type: 'garage', polygon: b.polygon });
  return true;
}
export default { planParking, refreshParking, BAY, PARKING_RULE, requiredParking };
