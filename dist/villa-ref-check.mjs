// فاحص ما بعد التكييف: المرجع الجيد قد يفسد بعد التكييف، فكل ناتج يُفحص هندسيًا قبل أن يُبنى مستندًا.
// يقيس: اتصال الغرف، خصوصية الضيافة، طول المسار الفعلي (لا المسافة المباشرة) ونسبة الحركة، الإنارة الخارجية،
// الحدود المهنية القصوى/الدنيا لكل غرفة، موضع السلم وأبعاده، وتوافق الأعمدة الرأسية للمبللة بين الدورين.
// الحدود افتراضات تصميمية من الميزان؛ ليست اشتراطات نظامية.
import { exposure, sharedEdge, W_, H_, A_, r2 } from './villa-ref-core.mjs';
import { ROLE, AREA_CAP } from './villa-ref-units.mjs';

export const CHECK_LIMITS = Object.freeze({
  hall: { abs: 34, ratio: 1.62, minNetW: 4.5, narrowMinNetW: 3.3 },
  circShare: { warn: .27, max: .38 },
  walk: { good: 12, warn: 17 },            // طول المسار الفعلي من الصالة/السلم إلى باب الغرفة (م)
  corrRun: 11,                              // أطول ممر بلا انقطاع
  stairMin: { w: 2.45, h: 4.1 },
  wetStack: 2.5,
  bedMinNet: { bedroom: 11.5, master: 15 },
  wall: .22,
});
const HAB = new Set(['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'office', 'service']);
const net = r => ({ w: Math.max(0, W_(r) - CHECK_LIMITS.wall), h: Math.max(0, H_(r) - CHECK_LIMITS.wall) });
const netArea = r => { const n = net(r); return n.w * n.h; };
const mid = r => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
const doorPoint = d => (d.edge.axis === 'x' ? { x: d.edge.at, y: d.pos } : { x: d.pos, y: d.edge.at });

/** مخطط الأبواب → رسم بياني: عقد = غرف + 'OUT'، أحرف = أبواب. */
function graphOf(rooms, doors) {
  const g = new Map(rooms.map(r => [r.id, []])); g.set('OUT', []);
  for (const d of doors) {
    const b = d.b ?? 'OUT', p = doorPoint(d);
    if (!g.has(d.a)) continue; g.get(d.a).push({ to: b, p }); if (b !== 'OUT' && g.has(b)) g.get(b).push({ to: d.a, p }); else if (b === 'OUT') g.get('OUT').push({ to: d.a, p });
  }
  return g;
}
/** أقصر مسار مشي (م) بين نقاط الأبواب: داخل كل غرفة بخط مستقيم بين بابين متتاليين. src: معرّف غرفة تبدأ منها (من مركزها). */
function walkFrom(rooms, doors, srcId) {
  const byId = new Map(rooms.map(r => [r.id, r])), src = byId.get(srcId); if (!src) return new Map();
  // عقدة لكل باب: (باب، غرفة تقف فيها)
  const dist = new Map(), q = [{ room: srcId, at: mid(src), d: 0 }], best = new Map([[srcId, 0]]);
  const doorsOf = id => doors.filter(d => d.a === id || d.b === id);
  const at = new Map(); at.set(srcId, mid(src));
  // دايكسترا مبسّط على (غرفة): المسافة إلى باب الدخول إلى الغرفة التالية
  const pq = [{ room: srcId, pt: mid(src), d: 0 }]; const doorDist = new Map();
  while (pq.length) {
    pq.sort((a, b) => a.d - b.d); const cur = pq.shift();
    if (best.has(cur.room) && best.get(cur.room) < cur.d - 1e-9 && cur.room !== srcId) continue;
    for (const d of doorsOf(cur.room)) {
      const other = d.a === cur.room ? d.b : d.a; if (!other || other === 'OUT') continue;
      const p = doorPoint(d), nd = cur.d + Math.hypot(cur.pt.x - p.x, cur.pt.y - p.y);
      const key = d.a + '|' + d.b + '|' + d.pos;
      if (!doorDist.has(key) || doorDist.get(key) > nd) doorDist.set(key, nd);
      if (!best.has(other) || nd < best.get(other) - 1e-9) { best.set(other, nd); pq.push({ room: other, pt: p, d: nd }); }
    }
  }
  const out = new Map();
  for (const d of doors) { const key = d.a + '|' + d.b + '|' + d.pos; if (doorDist.has(key)) out.set(key, doorDist.get(key)); }
  return { rooms: best, doors: out };
}

/**
 * يفحص مستوى واحدًا. level: { lv, rooms, doors, upper }، env: { W, D }، P: البرنامج المهيأ.
 * يعيد { hard:[...], cost, metrics } حيث hard أسباب رفض.
 */
export function checkLevel(level, env, P, opts = {}) {
  const { narrow = false } = opts;
  const { rooms, doors, upper } = level, hard = [], soft = [], m = {};
  const L = CHECK_LIMITS, byId = new Map(rooms.map(r => [r.id, r]));
  const voids = rooms.filter(r => r.kind === 'terrace' || r.outdoor);
  const indoor = rooms.filter(r => !voids.includes(r));
  const graph = graphOf(rooms, doors);
  // الاتصال: كل غرفة مغلقة تُبلغ من الخارج (أرضي) أو من السلم/الصالة (علوي)
  const start = upper ? 'hall' : 'OUT', seen = new Set([start]), stack = [start];
  if (upper && !byId.has('hall')) hard.push('no-hall-upper');
  while (stack.length) { const n = stack.pop(); for (const e of graph.get(n) || []) if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); } }
  for (const r of indoor) if (!seen.has(r.id)) hard.push('unreachable:' + r.id);
  // الخصوصية
  for (const r of indoor) {
    const ds = doors.filter(d => d.a === r.id || d.b === r.id), others = ds.map(d => byId.get(d.a === r.id ? d.b : d.a)).filter(Boolean);
    if (r.zone === 'men' && r.kind === 'majlis') { if (others.some(o => o.zone !== 'men')) hard.push('men-majlis-to-family:' + r.id); }
    if (r.zone === 'men' && r.kind === 'lobby') { if (others.some(o => o.zone !== 'men')) hard.push('men-lobby-to-family:' + r.id); }
    if (r.kind === 'suite') { if (others.some(o => o.zone === 'men' || o.ckind === 'foyer' || o.kind === 'foyer')) hard.push('bed-on-entry:' + r.id); }
    if (r.kind === 'kitchen' && others.some(o => o.zone === 'men' || o.kind === 'majlis')) hard.push('kitchen-on-majlis');
    if (r.type === 'bath' && r.kind === 'bath' && ds.length && ds.every(d => (d.a === 'foyer' || d.b === 'foyer'))) soft.push(['bath-on-entry', 20]);
  }
  // الإنارة والتهوية: نافذة خارجية (حد الغلاف أو فراغ مكشوف) للغرف الرئيسية
  for (const r of indoor) {
    const habit = HAB.has(r.type) && !(r.type === 'living' && r.circ), ex = exposure(r, env.W, env.D, voids).filter(e => e.len >= 1.5);
    if (habit && !ex.length) hard.push('no-window:' + r.id);
    else if (r.type === 'bath' && !exposure(r, env.W, env.D, voids).some(e => e.len >= 1)) soft.push(['bath-blind', 3]);
    if (r.id === 'hall' && !upper === false && !exposure(r, env.W, env.D, voids).length) soft.push(['hall-blind', 14]);
  }
  // الحدود المهنية للغرف
  for (const r of indoor) {
    const n = net(r), a = n.w * n.h, short = Math.min(n.w, n.h), long = Math.max(n.w, n.h), role = r.type === 'master' ? 'master' : r.type === 'bedroom' ? 'bedroom' : r.kind;
    const cap = AREA_CAP[role] ?? (r.id === 'hall' ? L.hall.abs : null);
    if (role in ROLE && r.kind !== 'lobby') {
      if (cap && a > cap * 1.03) hard.push(`room-too-big:${r.id}:${r2(a)}`);
      if (long / Math.max(short, .1) > ROLE[role].ar + .12) soft.push([`ratio:${r.id}`, 30 * (long / short - ROLE[role].ar)]);
      if (long / Math.max(short, .1) > 2.2) hard.push('room-strip:' + r.id);
    }
    if ((r.type === 'bedroom' || r.type === 'master') && a < L.bedMinNet[r.type] - .2) soft.push([`bed-small:${r.id}`, 12 * (L.bedMinNet[r.type] - a)]);
    if (r.type === 'majlis' && short < 4.6) hard.push('majlis-narrow:' + r.id);
  }
  // الصالة
  const hall = byId.get('hall');
  if (hall) {
    const n = net(hall), a = n.w * n.h, ratio = Math.max(n.w, n.h) / Math.max(.1, Math.min(n.w, n.h)), minW = narrow ? L.hall.narrowMinNetW : L.hall.minNetW;
    m.hallArea = r2(a); m.hallRatio = r2(ratio);
    if (a > L.hall.abs + 1) hard.push('hall-oversized:' + r2(a));
    if (ratio > 2.2) hard.push('hall-strip:' + r2(ratio));
    else if (ratio > L.hall.ratio) soft.push(['hall-ratio', 40 * (ratio - L.hall.ratio)]);
    if (Math.min(n.w, n.h) < minW - .02) soft.push(['hall-narrow', 30 * (minW - Math.min(n.w, n.h))]);
  }
  // الحركة: حصة الممرات + طول المسار الفعلي
  const total = indoor.reduce((s, r) => s + netArea(r), 0), circ = indoor.filter(r => r.circ).reduce((s, r) => s + netArea(r), 0);
  m.circShare = r2(circ / Math.max(1, total));
  if (m.circShare > L.circShare.max + (opts.floors === 2 ? .1 : 0)) hard.push('circ-share:' + m.circShare);
  else if (m.circShare > L.circShare.warn) soft.push(['circ-share', 120 * (m.circShare - L.circShare.warn)]);
  const originId = upper ? (byId.has('stair') ? 'stair' : 'hall') : (byId.get('hall') ? 'hall' : 'foyer');
  const walk = walkFrom(rooms, doors, originId); m.walkMax = 0;
  for (const r of indoor.filter(r => r.kind === 'suite')) {
    const ds = doors.filter(d => (d.a === r.id || d.b === r.id)), best = Math.min(...ds.map(d => walk.doors?.get(d.a + '|' + d.b + '|' + d.pos) ?? 1e9));
    if (best < 1e8) { m.walkMax = Math.max(m.walkMax, best); if (best > L.walk.warn) soft.push([`walk:${r.id}`, 10 * (best - L.walk.warn)]); }
  }
  m.walkMax = r2(m.walkMax);
  const corrs = indoor.filter(r => r.ckind === 'corr'); m.corrRun = r2(Math.max(0, ...corrs.map(r => Math.max(W_(r), H_(r)))));
  if (m.corrRun > L.corrRun) soft.push(['corr-run', 6 * (m.corrRun - L.corrRun)]);
  // السلم
  const stair = byId.get('stair');
  if (stair) { const n = { w: Math.min(W_(stair), H_(stair)), h: Math.max(W_(stair), H_(stair)) }; if (n.w < L.stairMin.w || n.h < L.stairMin.h) hard.push('stair-size'); }
  m.rooms = indoor.length;
  const cost = soft.reduce((s, [, c]) => s + c, 0);
  return { hard, soft, cost, metrics: m };
}

/** فحص الدورين معًا: تراص المبللة والسلم المتطابق. */
export function checkStack(levels) {
  const out = { hard: [], cost: 0, metrics: {} };
  if (levels.length < 2) return out;
  const [g, u] = levels, wet = lv => lv.rooms.filter(r => ['bath', 'kitchen', 'laundry'].includes(r.type)), gw = wet(g), uw = wet(u);
  let un = 0; for (const r of uw) { const c = mid(r); if (!gw.some(x => Math.hypot(mid(x).x - c.x, mid(x).y - c.y) <= CHECK_LIMITS.wetStack)) un++; }
  out.metrics.wetTotal = uw.length; out.metrics.wetUnstacked = un; out.cost += 5 * un;
  const sg = g.rooms.find(r => r.id === 'stair'), su = u.rooms.find(r => r.id === 'stair');
  if (sg && su && (Math.abs(sg.x0 - su.x0) > 1e-3 || Math.abs(sg.y0 - su.y0) > 1e-3 || Math.abs(sg.x1 - su.x1) > 1e-3 || Math.abs(sg.y1 - su.y1) > 1e-3)) out.hard.push('stair-misaligned');
  if (!sg || !su) out.hard.push('stair-missing');
  // ما يعلو الأرضي: العلوي داخل مسقط الأرضي
  for (const r of u.rooms) if (!['balcony'].includes(r.type) && !g.rooms.some(x => x.x0 <= r.x0 + 1e-3 && x.x1 >= r.x1 - 1e-3 && x.y0 <= r.y0 + 1e-3 && x.y1 >= r.y1 - 1e-3) && !g.rooms.some(x => Math.min(x.x1, r.x1) - Math.max(x.x0, r.x0) > 1e-3 && Math.min(x.y1, r.y1) - Math.max(x.y0, r.y0) > 1e-3)) out.hard.push('overhang:' + r.id);
  return out;
}

/** عدد التكوينات المتميزة بنيويًا: بصمة هيكلية خشنة (نوع الكتلة، موضع الفناء، موضع السلم والمدخل، ترتيب الجناحين). */
export function structureKey(levels, env) {
  const g = levels[0], q = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  const pos = r => `${q((r.x0 + r.x1) / 2 / env.W, 3)}${q((r.y0 + r.y1) / 2 / env.D, 3)}`;
  const parts = [];
  const voids = g.rooms.filter(r => r.kind === 'terrace' || r.outdoor).map(r => 'v' + pos(r)).sort().join('');
  const stair = g.rooms.find(r => r.id === 'stair'), foyer = g.rooms.find(r => r.id === 'foyer'), hall = g.rooms.find(r => r.id === 'hall');
  parts.push(voids, stair ? 's' + pos(stair) : '', foyer ? 'f' + pos(foyer) : '', hall ? 'h' + pos(hall) : '');
  for (const k of ['men', 'women']) { const r = g.rooms.find(x => x.kind === 'majlis' && x[k]); if (r) parts.push(k[0] + pos(r)); }
  const kit = g.rooms.find(r => r.type === 'kitchen'); if (kit) parts.push('k' + pos(kit));
  const m = levels.flatMap(l => l.rooms).find(r => r.master); if (m) parts.push('M' + pos(m));
  return parts.join('.');
}
