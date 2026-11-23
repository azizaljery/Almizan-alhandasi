// اختبار الحياة اليومية داخل المنزل (قراءة فقط على مستند mizan-draw/1، بلا إعادة توليد ولا تغيير معرّفات).
// يحاكي بالهندسة المرسومة: دخول الضيوف، حركة الأسرة، نقل الطعام، الوصول إلى الحمامات، الحركة مع الأثاث، وانكشاف الفراغات الخاصة.
// الحدود في DAILY_LIMITS افتراضات تصميمية معلنة (ليست نصوصًا نظامية)؛ كل ما لا تتوفر بياناته «غير متحقق». لا أحمال ولا إنشاء.
// المخرج: بنود بنفس بنية reviewDesign (شدة: تحذير/معلومة فقط، سبب، موقع، حالة، دليل). لا شرط إلزامي جديد.
// المسارات تُحسب على رسم الأبواب: من مركز باب إلى مركز باب داخل الغرفة (خط مستقيم)، فهي تقدير لا مسار ملاحة مقاس بالسنتيمتر.
import { analyzeDoc } from './draw/digest.mjs';
import { isDoorKind } from './draw/catalog.mjs';
import { pointInPolygon } from './draw/geom.mjs';

export const DAILY_VERSION = 'daily-life/1';
/** افتراضات معلنة. تُعرض مع كل بند في evidence.assumptions. */
export const DAILY_LIMITS = Object.freeze({
  guestPathMax: 20, // أقصى طول مسار ضيف من باب الشارع إلى المجلس (م)
  familyPathMax: 25, // أقصى مشي من المدخل العائلي إلى أبعد غرفة (م، بين الأدوار يشمل طول الدرج)
  foodPathMax: 15, foodDoorsMax: 3, // نقل الطعام: أقصى طول وأقصى عدد أبواب
  bathPathMax: 12, // من غرفة النوم إلى أقرب حمام يخدمها (م)
  clearPassMin: .9, // أدنى عرض صافٍ لممر داخل غرفة بين بابين (م)
  doorZoneDepth: .9, // عمق منطقة الحركة أمام الباب (م)
  chairPull: .9, // فراغ سحب الكراسي حول طاولة الطعام (م)
  carryExtra: .05, // هامش نقل القطعة الكبيرة: أصغر أبعادها الثلاثة + هذا ≤ عرض أضيق باب في المسار
  sightMax: 12, // أبعد مسافة رؤية تُعدّ انكشافًا (م)، كما في الخصوصية الهندسية
  viewOffset: .7, // بُعد نقطة النظر داخل الغرفة عن الباب (م)
  stairTravelU: 2, // طول مسار الدرج = run × هذا للدرج U، وrun للمستقيم (تقدير)
});
export const DAILY_ASSUMPTIONS = Object.freeze([
  'الحدود الرقمية افتراضات تصميمية معلنة وليست نصوصًا نظامية.',
  'المسار خط مستقيم بين مراكز الأبواب داخل كل غرفة، لا مسار ملاحة دقيق.',
  'الأبواب العادية تُعدّ مغلقة في فحص الانكشاف إلا الباب المفحوص؛ الفتحات المفتوحة (قوس/منزلق) تُعدّ مفتوحة.',
  'اتجاه فتح الباب غير مرسوم بدقة؛ منطقة الحركة أمام الباب تُفحص من جهتيه.',
  'مواضع الأثاث هي ما في fixtures المستند فقط؛ غرفة بلا أثاث مرسوم «غير متحقق».',
]);

const r2 = v => Math.round(v * 100) / 100;
const num = v => String(r2(v)).replace('.', '٫');
const PRIV_NAME = /ملابس|خزانة/;
const GUEST_BATH_NAME = /ضيوف|رجال|نساء|زوار/;
const FURN_SKIP = new Set(['rug', 'plant', 'lawn', 'tree', 'pool', 'waterfall', 'planter', 'carport', 'pergola', 'bbq', 'fountain', 'car']);
const WET_FIX = new Set(['wc', 'basin', 'shower', 'bathtub']);

// ------------------------------------------------------------------------------------------ هندسة صغيرة
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a, b) => a.x * b.y - a.y * b.x;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segInter(p, p2, q, q2) { // تقاطع قطعتين (يُهمل اللمس الطرفي)
  const r = sub(p2, p), s = sub(q2, q), d = cross(r, s); if (Math.abs(d) < 1e-12) return false;
  const t = cross(sub(q, p), s) / d, u = cross(sub(q, p), r) / d, e = 1e-6;
  return t > e && t < 1 - e && u > e && u < 1 - e;
}
function rayHit(o, dir, segs, max = 30) { // أقرب تقاطع شعاع مع قطع، أو max
  let best = max;
  for (const [a, b] of segs) {
    const s = sub(b, a), d = cross(dir, s); if (Math.abs(d) < 1e-12) continue;
    const t = cross(sub(a, o), s) / d, u = cross(sub(a, o), dir) / d;
    if (t >= 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}
function ptSegDist(p, a, b) { const ab = sub(b, a), L2 = ab.x * ab.x + ab.y * ab.y || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / L2)); return Math.hypot(p.x - (a.x + t * ab.x), p.y - (a.y + t * ab.y)); }
function segSegDist(a, b, c, d) { if (segInter(a, b, c, d)) return 0; return Math.min(ptSegDist(a, c, d), ptSegDist(b, c, d), ptSegDist(c, a, b), ptSegDist(d, a, b)); }
/** مستطيل قطعة بقاعدة المستند: rot مع عقارب الساعة، العرض = (cos,-sin)، الأمام = (sin,cos). */
function fixCorners(f) { const s = Math.sin(f.rot || 0), c = Math.cos(f.rot || 0), u = { x: c, y: -s }, v = { x: s, y: c }; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: f.x + u.x * f.w / 2 * a + v.x * f.d / 2 * b, y: f.y + u.y * f.w / 2 * a + v.y * f.d / 2 * b })); }
function polyEdges(poly) { return poly.map((p, i) => [p, poly[(i + 1) % poly.length]]); }
function satOverlap(A, B) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], ax = { x: -(b.y - a.y), y: b.x - a.x };
    const pa = A.map(p => p.x * ax.x + p.y * ax.y), pb = B.map(p => p.x * ax.x + p.y * ax.y);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
  }
  return true;
}
/**
 * عرض أوسع ممر صافٍ بين نقطتين (بابين) داخل غرفة: شبكة 10 سم؛ لكل خلية حرة بعدها عن أقرب جدار أو قطعة أثاث؛ أوسع مسار = أكبر قيمة
 * لأدنى بُعد على المسار؛ العرض = ضعف ذلك البُعد. نقطتا البداية والنهاية قوسان بنصف قطر .45–.75 م أمام الباب (لا يُقاس باب نفسه).
 */
function widestPass(net, obstacles, A, B, step = .1) {
  const xs = net.map(p => p.x), ys = net.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys), nx = Math.ceil((Math.max(...xs) - x0) / step) + 1, ny = Math.ceil((Math.max(...ys) - y0) / step) + 1;
  const edges = [...polyEdges(net), ...obstacles.flatMap(polyEdges)], clr = new Float32Array(nx * ny);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const q = { x: x0 + i * step, y: y0 + j * step };
    if (!pointInPolygon(q, net) || obstacles.some(o => pointInPolygon(q, o))) { clr[i * ny + j] = -1; continue; }
    let m = Infinity; for (const [a, b] of edges) { const d = ptSegDist(q, a, b); if (d < m) m = d; } clr[i * ny + j] = m;
  }
  const arc = P0 => { const out = []; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const d = Math.hypot(x0 + i * step - P0.x, y0 + j * step - P0.y); if (d >= .45 && d <= .75 && clr[i * ny + j] >= 0) out.push(i * ny + j); } return out; };
  const S = arc(A), T = new Set(arc(B)); if (!S.length || !T.size) return 0;
  const best = new Float32Array(nx * ny).fill(-1), heap = []; for (const c of S) { best[c] = clr[c]; heap.push(c); }
  let ans = 0;
  while (heap.length) {
    let bi = 0; for (let k = 1; k < heap.length; k++) if (best[heap[k]] > best[heap[bi]]) bi = k; const c = heap.splice(bi, 1)[0];
    if (T.has(c)) { ans = best[c]; break; }
    const i = Math.floor(c / ny), j = c % ny;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const n = a * ny + b; if (clr[n] < 0) continue; const v = Math.min(best[c], clr[n]); if (v > best[n]) { best[n] = v; heap.push(n); } }
  }
  return 2 * ans;
}
const inObb = (p, f) => pointInPolygon(p, fixCorners(f));

// ------------------------------------------------------------------------------------------ تصنيف الغرف
/** منطقة الغرفة: private (نوم) | private-bath | wing (ممر الجناح) | guest (مجلس) | guest-bath | family (صالة الأسرة) | shared (طعام) | service | entry | bath | neutral | outdoor */
function zoneOfRoom(r, lv) {
  const t = r.type, nm = String(r.name || '');
  const doorTypes = () => { const out = []; for (const op of lv.openings) { if (!op.door) continue; const me = op.sides.find(s => s.room.id === r.id); if (me && me.other !== 'outside') { const o = lv.roomsById.get(me.other); if (o) out.push(o); } } return out; };
  if (t === 'bedroom' || t === 'master') return 'private';
  if (t === 'majlis') return 'guest';
  if (t === 'entrance') return 'entry';
  if (t === 'dining') return 'shared';
  if (t === 'kitchen' || t === 'laundry' || t === 'service' || /خادمة|سائق/.test(nm)) return 'service';
  if (t === 'storage') return PRIV_NAME.test(nm) ? 'private-bath' : 'service';
  if (t === 'living') return 'family';
  if (t === 'balcony' || t === 'courtyard' || t === 'garage') return 'outdoor';
  if (t === 'bath') {
    const nb = doorTypes();
    if (nb.some(o => o.type === 'bedroom' || o.type === 'master')) return 'private-bath';
    if (GUEST_BATH_NAME.test(nm) || nb.some(o => o.type === 'majlis')) return 'guest-bath';
    return 'bath';
  }
  if (t === 'corridor') {
    if (/ضيوف|ضيافة/.test(nm)) return 'guest';
    const nb = doorTypes(); if (nb.some(o => o.type === 'bedroom' || o.type === 'master')) return 'wing';
    return 'neutral';
  }
  return 'neutral';
}

// ------------------------------------------------------------------------------------------ تحضير النموذج
function prepare(doc, model) {
  const rooms = new Map(), doors = new Map(), levelIdx = new Map(model.levels.map((l, i) => [l.level.id, i]));
  for (const lv of model.levels) for (const r of lv.rooms) { if (r.unlabelled) continue; rooms.set(`${lv.level.id}|${r.id}`, { key: `${lv.level.id}|${r.id}`, id: r.id, level: lv.level.id, name: r.name, type: r.type, zone: zoneOfRoom(r, lv), c: r.centroid, net: r.net, area: r.area, ref: r }); }
  for (const lv of model.levels) for (const op of lv.openings) {
    if (!op.door || !isDoorKind(op.kind)) continue;
    const key = r => (r ? `${lv.level.id}|${r.id}` : null), a = key(op.left), b = key(op.right);
    doors.set(op.id, { id: op.id, level: lv.level.id, kind: op.kind, p: op.p, w: op.w, entry: !!op.o.entry, a: a && rooms.has(a) ? a : null, b: b && rooms.has(b) ? b : null, u: op.u, n: op.n, plain: ['door', 'door2'].includes(op.kind), open: ['arch', 'slider'].includes(op.kind) });
  }
  // الدرج: كل درج يربط غرفة الدرج في دوره (أقرب غرفة من نوع «سلم» لإحداثيه) بنظيرتها في الدور التالي؛ وإلا غرفة النقطة نفسها
  const stairLinks = [];
  for (const s of doc.stairs || []) {
    const i = levelIdx.get(s.level), lo = model.levels[i], hi = model.levels[i + 1]; if (!lo || !hi) continue;
    const pick = lv => {
      const cand = lv.rooms.filter(r => r.type === 'stairs' && !r.unlabelled).sort((a, b) => dist(a.centroid, s) - dist(b.centroid, s))[0];
      return cand && dist(cand.centroid, s) < 4 ? cand : lv.roomAt({ x: s.x, y: s.y });
    };
    const a = pick(lo), b = pick(hi); if (!a || !b) continue;
    stairLinks.push({ id: s.id, a: `${lo.level.id}|${a.id}`, b: `${hi.level.id}|${b.id}`, p: { x: a.centroid.x, y: a.centroid.y }, len: (s.run || 3.5) * (s.kind === 'U' ? DAILY_LIMITS.stairTravelU : 1), w: s.w || null });
  }
  const adj = new Map(); // roomKey -> [{ door }]
  for (const d of doors.values()) for (const k of [d.a, d.b]) if (k) (adj.get(k) || adj.set(k, []).get(k)).push(d);
  const entries = [];
  const g0 = model.levels[0];
  if (g0) for (const e of g0.entries) { const d = doors.get(e.via); const inner = `${g0.level.id}|${e.room}`; if (d && rooms.has(inner)) entries.push({ door: d, room: rooms.get(inner), flagged: !!e.flagged, kind: e.kind }); }
  return { doc, model, rooms, doors, adj, stairLinks, entries };
}

// ------------------------------------------------------------------------------------------ أقصر مسار
/**
 * أقصر مسار من باب مدخل (دخولًا إلى غرفته) إلى أي غرفة هدف. forbid: دالة تمنع دخول غرفة (ما عدا الهدف).
 * يعيد { len, doors, arches, rooms[], points[], via[] } أو null. الحالة = (باب، الغرفة الداخلة)؛ الدرج يقفز بين غرفتين بتكلفة طوله.
 */
function shortestPath(P, startDoor, startRoom, targets, { forbid = () => false } = {}) {
  const tset = new Set(targets); const best = new Map(), prev = new Map();
  const sid = `${startDoor.id}>${startRoom.key}`; best.set(sid, 0); const pq = [{ id: sid, d: 0, door: startDoor, room: startRoom, via: null }];
  const info = new Map([[sid, { door: startDoor, room: startRoom, p: startDoor.p }]]);
  let found = null;
  while (pq.length) {
    pq.sort((x, y) => x.d - y.d); const cur = pq.shift(); if (cur.d > (best.get(cur.id) ?? Infinity) + 1e-9) continue;
    if (tset.has(cur.room.key)) { const fin = cur.d + dist(cur.at || cur.door.p, cur.room.c); if (!found || fin < found.total) found = { total: fin, id: cur.id }; if (!pq.some(x => x.d < (found?.total ?? Infinity))) break; }
    const here = cur.at || cur.door.p;
    for (const d of P.adj.get(cur.room.key) || []) {
      if (d.id === cur.door.id) continue;
      const other = d.a === cur.room.key ? d.b : d.a; if (!other) continue;
      const orm = P.rooms.get(other); if (forbid(orm) && !tset.has(other)) continue;
      const nd = cur.d + dist(here, d.p), id = `${d.id}>${other}`;
      if (nd < (best.get(id) ?? Infinity) - 1e-9) { best.set(id, nd); prev.set(id, cur.id); info.set(id, { door: d, room: orm, p: d.p }); pq.push({ id, d: nd, door: d, room: orm }); }
    }
    for (const s of P.stairLinks) {
      const other = s.a === cur.room.key ? s.b : s.b === cur.room.key ? s.a : null; if (!other) continue;
      const orm = P.rooms.get(other); if (!orm || (forbid(orm) && !tset.has(other))) continue;
      const nd = cur.d + dist(here, s.p) + s.len, id = `stair:${s.id}>${other}`;
      if (nd < (best.get(id) ?? Infinity) - 1e-9) { best.set(id, nd); prev.set(id, cur.id); info.set(id, { door: { id: 'stair:' + s.id, level: orm.level, p: s.p, w: s.w, stair: s }, room: orm, p: s.p, stair: s }); pq.push({ id, d: nd, door: { id: 'stair:' + s.id, p: s.p }, room: orm, at: s.p }); }
    }
  }
  if (!found) return null;
  const chain = []; for (let id = found.id; id; id = prev.get(id)) chain.unshift(id);
  const points = [], rooms = [], via = []; let doors = 0, arches = 0, stairLen = 0;
  for (const id of chain) {
    const it = info.get(id); rooms.push(it.room); if (it.stair) { points.push({ ...it.p, level: P.rooms.get(it.stair.a).level }, { ...it.p, level: it.room.level }); stairLen += it.stair.len; via.push({ stair: it.stair.id, w: it.stair.w }); continue; }
    points.push({ ...it.door.p, level: it.door.level }); if (!it.door.pseudo) via.push({ door: it.door.id, w: it.door.w, kind: it.door.kind });
    if (it.door.pseudo) continue; if (it.door.plain) doors++; else arches++;
  }
  const last = rooms[rooms.length - 1]; points.push({ ...last.c, level: last.level });
  return { len: found.total, doors, arches, stairLen, rooms, points, via, target: last };
}
const pathInfo = (p, label) => p ? { label, lengthM: r2(p.len), doors: p.doors, openings: p.arches, stairM: r2(p.stairLen), rooms: p.rooms.map(r => r.name), points: p.points.map(q => ({ x: r2(q.x), y: r2(q.y), level: q.level })) } : { label, lengthM: null };
const toSegments = p => { const out = []; for (let i = 1; i < p.points.length; i++) { const a = p.points[i - 1], b = p.points[i]; if (a.level === b.level && dist(a, b) > .01) out.push({ level: a.level, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }); } return out; };

// ------------------------------------------------------------------------------------------ البنود
const mk = (code, severity, state, title, reason, evidence, loc) => ({ code, severity, state, title, reason, evidence: { assumptions: DAILY_ASSUMPTIONS, limits: DAILY_LIMITS, ...evidence }, loc });
const names = rs => [...new Set(rs.map(r => r.name))].join('، ');

function guestOrigins(P) {
  const g = P.entries.filter(e => e.door.kind !== 'garage');
  const guest = g.filter(e => e.room.zone === 'guest' || /ضيوف/.test(e.room.name));
  return { guest: guest.length ? guest : g, family: (g.filter(e => !guest.includes(e)).length ? g.filter(e => !guest.includes(e)) : g), all: g, hasGuestEntry: guest.length > 0 };
}
const isPrivateFor = { guest: z => ['private', 'private-bath', 'wing', 'service', 'family'].includes(z), food: z => ['private', 'private-bath', 'wing'].includes(z), family: z => ['guest', 'guest-bath'].includes(z) };

/** أفضل مسار من مجموعة مداخل إلى هدف: يفضَّل ما يتجنب المناطق الممنوعة، ثم الأقصر. */
function bestPath(P, origins, targetKey, zoneForbid) {
  let clean = null, any = null;
  for (const o of origins) {
    const a = shortestPath(P, o.door, o.room, [targetKey], { forbid: r => zoneForbid(r.zone) });
    if (a && (!clean || a.len < clean.len)) clean = a;
    const b = shortestPath(P, o.door, o.room, [targetKey]);
    if (b && (!any || b.len < any.len)) any = b;
  }
  return { clean, any };
}
const crossed = (p, zoneForbid, targetKey, startKey) => p.rooms.filter(r => zoneForbid(r.zone) && r.key !== targetKey && r.key !== startKey);

function guestItems(P, out) {
  const O = guestOrigins(P), majlis = [...P.rooms.values()].filter(r => r.type === 'majlis' || (r.zone === 'guest' && r.type !== 'corridor'));
  const fb = isPrivateFor.guest;
  if (!O.all.length) { out.push(mk('guest-path', 'info', 'unverified', 'مسار الضيف من باب الشارع', 'غير متحقق: لا باب مدخل على الدور الأرضي لقياس مسار الضيف.', {}, { label: 'مسار الضيف' })); return; }
  if (!majlis.length) out.push(mk('guest-path', 'info', 'unverified', 'مسار الضيف إلى المجلس', 'غير متحقق: لا مجلس مسمّى في المخطط.', {}, { label: 'مسار الضيف' }));
  for (const m of majlis) {
    const { clean, any } = bestPath(P, O.guest, m.key, fb), p = clean || any, label = `مسار الضيف إلى ${m.name}`;
    if (!p) { out.push(mk('guest-majlis:' + m.id, 'warning', 'violated', label, `«${m.name}» لا يصل إليها مسار أبواب من مدخل الدور الأرضي.`, { paths: [pathInfo(null, label)] }, { roomIds: [m.id], label })); continue; }
    const x = clean ? [] : crossed(p, fb, m.key), bad = x.length > 0, long = p.len > DAILY_LIMITS.guestPathMax;
    const reason = bad ? `الضيف يعبر مناطق الأسرة/الخدمة: ${names(x)} (الطول ${num(p.len)} م، ${p.doors} أبواب).` : long ? `مسار الضيف ${num(p.len)} م أطول من الافتراض المعلن (${DAILY_LIMITS.guestPathMax} م).` : `الضيف يصل من ${O.hasGuestEntry ? 'مدخل الضيوف' : 'باب الشارع'} إلى «${m.name}» دون عبور مناطق الأسرة: ${num(p.len)} م و${p.doors} أبواب.`;
    out.push(mk('guest-majlis:' + m.id, 'warning', bad || long ? 'violated' : 'verified', label, reason, { paths: [pathInfo(p, label)], crossed: x.map(r => r.name), originGuestEntry: O.hasGuestEntry }, { roomIds: [m.id, ...x.map(r => r.id)], segments: toSegments(p), label }));
  }
  const gb = [...P.rooms.values()].filter(r => r.zone === 'guest-bath' && r.level === P.model.levels[0].level.id);
  if (!gb.length) out.push(mk('guest-bath', 'info', 'unverified', 'وصول الضيف إلى دورة مياه الضيوف', 'غير متحقق: لا دورة مياه ضيوف محددة بالتسمية أو بالجوار المباشر للمجلس.', {}, { label: 'دورة مياه الضيوف' }));
  for (const b of gb) {
    const { clean, any } = bestPath(P, O.guest, b.key, fb), p = clean || any, label = `مسار الضيف إلى ${b.name}`;
    if (!p) { out.push(mk('guest-bath:' + b.id, 'warning', 'violated', label, `«${b.name}» لا يصل إليها مسار أبواب من مدخل الدور الأرضي.`, {}, { roomIds: [b.id], label })); continue; }
    const x = clean ? [] : crossed(p, fb, b.key), bad = x.length > 0;
    out.push(mk('guest-bath:' + b.id, 'warning', bad ? 'violated' : 'verified', label, bad ? `الضيف يعبر مناطق الأسرة للوصول إلى «${b.name}»: ${names(x)}.` : `دورة مياه الضيوف «${b.name}» تُبلَغ دون عبور مناطق الأسرة: ${num(p.len)} م و${p.doors} أبواب.`, { paths: [pathInfo(p, label)], crossed: x.map(r => r.name) }, { roomIds: [b.id, ...x.map(r => r.id)], segments: toSegments(p), label }));
  }
}

function familyItems(P, out) {
  const O = guestOrigins(P); if (!O.all.length) { out.push(mk('family-path', 'info', 'unverified', 'مسار الأسرة', 'غير متحقق: لا باب مدخل على الدور الأرضي.', {}, { label: 'مسار الأسرة' })); return; }
  const fb = isPrivateFor.family, all = [...P.rooms.values()];
  const groups = [['living', 'الصالة', all.filter(r => r.type === 'living' && !/علوية/.test(r.name)).slice(0, 1)], ['kitchen', 'المطبخ', all.filter(r => r.type === 'kitchen').slice(0, 2)], ['bedrooms', 'غرف النوم', all.filter(r => r.zone === 'private')]];
  for (const [code, label, targets] of groups) {
    if (!targets.length) { out.push(mk('family-' + code, 'info', 'unverified', `مسار الأسرة إلى ${label}`, `غير متحقق: لا ${label} مسمّاة في المخطط.`, {}, { label })); continue; }
    const rows = targets.map(t => { const { clean, any } = bestPath(P, O.family, t.key, fb); const p = clean || any; return { t, p, crossed: p && !clean ? crossed(p, fb, t.key) : [] }; });
    const lost = rows.filter(r => !r.p), bad = rows.filter(r => r.p && r.crossed.length), long = rows.filter(r => r.p && r.p.len > DAILY_LIMITS.familyPathMax);
    const worst = rows.filter(r => r.p).sort((a, b) => b.p.len - a.p.len)[0];
    const title = `مسار الأسرة من المدخل إلى ${label}`;
    const state = lost.length || bad.length || long.length ? 'violated' : 'verified';
    const reason = lost.length ? `لا يصل مسار أبواب من مدخل الأسرة إلى: ${names(lost.map(r => r.t))}.` : bad.length ? `مسار الأسرة يعبر مناطق الضيوف: ${bad.map(r => `«${r.t.name}» عبر ${names(r.crossed)}`).join('؛ ')}.` : long.length ? `أطول مسار ${num(worst.p.len)} م (الافتراض ${DAILY_LIMITS.familyPathMax} م): ${names(long.map(r => r.t))}.` : `من المدخل العائلي إلى ${label}: أطولها ${num(worst.p.len)} م (${worst.p.doors} أبواب) دون عبور مناطق الضيوف.`;
    const shown = (lost.length ? lost : bad.length ? bad : long.length ? long : [worst]).filter(r => r.p);
    out.push(mk('family-' + code, 'warning', state, title, reason, { paths: rows.filter(r => r.p).map(r => pathInfo(r.p, `إلى ${r.t.name}`)), unreachable: lost.map(r => r.t.name) }, { roomIds: [...targets.map(t => t.id)], segments: shown.flatMap(r => toSegments(r.p)), label: title }));
  }
}

function foodItems(P, out) {
  const all = [...P.rooms.values()], k = all.find(r => r.type === 'kitchen' && r.level === P.model.levels[0].level.id) || all.find(r => r.type === 'kitchen');
  if (!k) { out.push(mk('food', 'info', 'unverified', 'نقل الطعام من المطبخ', 'غير متحقق: لا مطبخ مسمّى في المخطط.', {}, { label: 'نقل الطعام' })); return; }
  const fb = isPrivateFor.food, targets = [...all.filter(r => r.type === 'dining'), ...all.filter(r => r.type === 'majlis')];
  if (!targets.length) { out.push(mk('food', 'info', 'unverified', 'نقل الطعام إلى الطعام والمجلس', 'غير متحقق: لا غرفة طعام ولا مجلس مسمّى.', {}, { label: 'نقل الطعام' })); return; }
  for (const t of targets) {
    const sd = [...(P.adj.get(k.key) || [])][0]; if (!sd) { out.push(mk('food:' + t.id, 'warning', 'violated', `نقل الطعام إلى ${t.name}`, `المطبخ «${k.name}» بلا باب.`, {}, { roomIds: [k.id, t.id], label: 'نقل الطعام' })); continue; }
    const run = forbidFn => shortestPath(P, { ...sd, id: 'k:' + sd.id, p: k.c, level: k.level, plain: false, pseudo: true }, k, [t.key], { forbid: forbidFn });
    const clean = run(r => fb(r.zone)), any = clean || run(() => false), p = clean || any, label = `نقل الطعام من ${k.name} إلى ${t.name}`;
    if (!p) { out.push(mk('food:' + t.id, 'warning', 'violated', label, `لا مسار أبواب داخلي من المطبخ إلى «${t.name}» (قد تُخدم من الخارج؛ المسار الخارجي غير مقيس).`, {}, { roomIds: [k.id, t.id], label })); continue; }
    const x = clean ? [] : crossed(p, fb, t.key, k.key), long = p.len > DAILY_LIMITS.foodPathMax, many = p.doors > DAILY_LIMITS.foodDoorsMax;
    const bad = x.length > 0 || long || many;
    const reason = x.length ? `الطعام يمر عبر مناطق خاصة: ${names(x)} (${num(p.len)} م، ${p.doors} أبواب).` : long || many ? `مسار الطعام ${num(p.len)} م و${p.doors} أبواب (الافتراض ≤ ${DAILY_LIMITS.foodPathMax} م و≤ ${DAILY_LIMITS.foodDoorsMax} أبواب).` : `من المطبخ إلى «${t.name}»: ${num(p.len)} م و${p.doors} أبواب دون عبور مناطق خاصة.`;
    out.push(mk('food:' + t.id, 'warning', bad ? 'violated' : 'verified', label, reason, { paths: [pathInfo(p, label)], crossed: x.map(r => r.name) }, { roomIds: [k.id, t.id, ...x.map(r => r.id)], segments: toSegments(p), label }));
  }
}

function bathItems(P, out) {
  const all = [...P.rooms.values()], beds = all.filter(r => r.zone === 'private'), baths = all.filter(r => ['private-bath', 'bath', 'guest-bath'].includes(r.zone) && r.type === 'bath');
  if (!beds.length) { out.push(mk('baths', 'info', 'unverified', 'وصول غرف النوم إلى الحمامات', 'غير متحقق: لا غرف نوم مسمّاة.', {}, { label: 'الحمامات' })); return; }
  const rows = beds.map(b => {
    const sd = [...(P.adj.get(b.key) || [])][0]; if (!sd) return { b, p: null, why: 'لا باب' };
    const fbd = r => r.zone === 'guest' || r.zone === 'guest-bath' || (r.zone === 'private' && r.key !== b.key), usable = baths.filter(x => x.zone !== 'guest-bath');
    const run = fn => shortestPath(P, { ...sd, id: 'b:' + sd.id, p: b.c, level: b.level, plain: false, pseudo: true }, b, usable.map(x => x.key), { forbid: fn });
    const clean = run(fbd), any = clean || run(() => false), p = clean || any;
    return { b, p, crossed: p && !clean ? p.rooms.filter(r => fbd(r) && r.key !== p.target.key && r.key !== b.key) : [] };
  });
  const lost = rows.filter(r => !r.p), bad = rows.filter(r => r.p && r.crossed.length), long = rows.filter(r => r.p && r.p.len > DAILY_LIMITS.bathPathMax);
  const state = lost.length || bad.length || long.length ? 'violated' : 'verified', worst = rows.filter(r => r.p).sort((a, b) => b.p.len - a.p.len)[0];
  const reason = lost.length ? `لا يصل مسار أبواب إلى حمام من: ${names(lost.map(r => r.b))}.` : bad.length ? `الطريق إلى الحمام يعبر المجلس أو غرفة نوم أخرى: ${bad.map(r => `«${r.b.name}» عبر ${names(r.crossed)}`).join('؛ ')}.` : long.length ? `أبعد حمام ${num(worst.p.len)} م (الافتراض ${DAILY_LIMITS.bathPathMax} م): ${names(long.map(r => r.b))}.` : `كل غرف النوم (${rows.length}) تصل إلى حمام يخدمها دون عبور المجلس أو غرفة نوم أخرى؛ أبعدها ${num(worst.p.len)} م.`;
  const shown = (lost.length ? [] : bad.length ? bad : long.length ? long : [worst]).filter(r => r.p);
  out.push(mk('baths', 'warning', state, 'وصول غرف النوم إلى الحمامات', reason, { paths: rows.filter(r => r.p).map(r => pathInfo({ ...r.p }, `من ${r.b.name} إلى ${r.p.target.name}`)), unreachable: lost.map(r => r.b.name) }, { roomIds: [...lost, ...bad, ...long].map(r => r.b.id), segments: shown.flatMap(r => toSegments(r.p)), label: 'وصول غرف النوم إلى الحمامات' }));
}

// ------------------------------------------------------------------------------------------ الأثاث
function furnitureByRoom(P) {
  const by = new Map(); const fx = (P.doc.fixtures || []);
  for (const f of fx) {
    const lv = P.model.levelById.get(f.level), r = lv?.roomAt({ x: f.x, y: f.y }); if (!r) continue;
    const key = `${f.level}|${r.id}`; if (!P.rooms.has(key)) continue; (by.get(key) || by.set(key, []).get(key)).push(f);
  }
  return by;
}
function furnitureItems(P, out) {
  const by = furnitureByRoom(P), want = ['bedroom', 'master', 'majlis', 'living', 'dining'];
  const rooms = [...P.rooms.values()], furnished = rooms.filter(r => (by.get(r.key) || []).some(f => !FURN_SKIP.has(f.kind) && !WET_FIX.has(f.kind)));
  const missing = rooms.filter(r => want.includes(r.type) && !furnished.includes(r));
  if (!furnished.length) { for (const [c, t] of [['clearance', 'الممر الصافي حول الأثاث'], ['doorzone', 'منطقة الحركة أمام الأبواب'], ['chairs', 'سحب الكراسي'], ['move', 'نقل قطع الأثاث الكبيرة']]) out.push(mk('furniture-' + c, 'info', 'unverified', t, 'غير متحقق: لا مواضع أثاث مرسومة في المستند.', {}, { label: t })); return; }
  const obst = r => (by.get(r.key) || []).filter(f => !FURN_SKIP.has(f.kind) || f.kind === 'plant').map(f => ({ f, c: fixCorners(f) }));
  const note = missing.length ? ` غير متحقق من: ${names(missing)} (لا أثاث مرسوم فيها).` : '';
  // 1) الممر الصافي بين بابين داخل الغرفة: أوسع مسار على شبكة 10 سم (أكبر دائرة تمر بين البابين حول الأثاث والجدران)
  const bad = [], okRows = [];
  for (const r of furnished) {
    const ds = (P.adj.get(r.key) || []).filter(d => d.kind !== 'garage'); if (ds.length < 2) continue;
    const ob = obst(r); let worst = Infinity, at = null;
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
      if (dist(ds[i].p, ds[j].p) < 1.2) continue;
      const w = widestPass(r.net, ob.map(o => o.c), ds[i].p, ds[j].p); if (w < worst) { worst = w; at = { a: ds[i].p, b: ds[j].p }; }
    }
    if (worst === Infinity) continue; (worst < DAILY_LIMITS.clearPassMin ? bad : okRows).push({ r, w: r2(worst), at });
  }
  const t1 = 'الممر الصافي حول الأثاث';
  if (!bad.length && !okRows.length) out.push(mk('furniture-clearance', 'info', 'unverified', t1, 'غير متحقق: لا غرفة مؤثثة بين بابين لقياس ممر عبرها.' + note, {}, { label: t1 }));
  else out.push(mk('furniture-clearance', 'info', bad.length ? 'violated' : 'verified', t1, bad.length ? `ممر أضيق من ${num(DAILY_LIMITS.clearPassMin)} م بين البابين: ${bad.map(x => `«${x.r.name}» ${num(x.w)} م`).join('؛ ')}.${note}` : `أضيق ممر صافٍ بين أبواب الغرف المؤثثة ${num(Math.min(...okRows.map(x => x.w)))} م (≥ ${num(DAILY_LIMITS.clearPassMin)}).${note}`, { rooms: [...bad, ...okRows].map(x => ({ room: x.r.name, clearM: x.w })) }, { roomIds: bad.map(x => x.r.id), segments: bad.map(x => ({ level: x.r.level, a: x.at.a, b: x.at.b })), label: t1 }));
  // 2) منطقة الحركة أمام الباب
  const hit = [];
  for (const d of P.doors.values()) {
    if (d.kind === 'garage' || d.open) continue;
    for (const [sk, sgn] of [[d.a, 1], [d.b, -1]]) {
      const r = sk && P.rooms.get(sk); if (!r || r.type === 'bath') continue; const ob = obst(r).filter(o => !WET_FIX.has(o.f.kind)); if (!ob.length) continue;
      const nn = { x: d.n.x * sgn, y: d.n.y * sgn }, u = d.u, hw = d.w / 2, dp = DAILY_LIMITS.doorZoneDepth;
      const zone = [{ x: d.p.x - u.x * hw, y: d.p.y - u.y * hw }, { x: d.p.x + u.x * hw, y: d.p.y + u.y * hw }, { x: d.p.x + u.x * hw + nn.x * dp, y: d.p.y + u.y * hw + nn.y * dp }, { x: d.p.x - u.x * hw + nn.x * dp, y: d.p.y - u.y * hw + nn.y * dp }];
      const o = ob.find(x => satOverlap(zone, x.c)); if (o) hit.push({ d, r, f: o.f, zone });
    }
  }
  const t2 = 'منطقة الحركة أمام الأبواب';
  out.push(mk('furniture-doorzone', 'info', hit.length ? 'violated' : 'verified', t2, hit.length ? `قطع تدخل منطقة ${num(DAILY_LIMITS.doorZoneDepth)} م أمام باب: ${hit.slice(0, 6).map(h => `${h.f.kind} في «${h.r.name}»`).join('؛ ')}${hit.length > 6 ? ` (+${hit.length - 6})` : ''}.${note}` : `لا قطعة أثاث تدخل منطقة ${num(DAILY_LIMITS.doorZoneDepth)} م أمام أبواب الغرف المؤثثة.${note}`, { hits: hit.map(h => ({ opening: h.d.id, room: h.r.name, piece: h.f.id, kind: h.f.kind })) }, { roomIds: [...new Set(hit.map(h => h.r.id))], segments: hit.map(h => ({ level: h.d.level, a: { x: h.d.p.x - h.d.u.x * h.d.w / 2, y: h.d.p.y - h.d.u.y * h.d.w / 2 }, b: { x: h.d.p.x + h.d.u.x * h.d.w / 2, y: h.d.p.y + h.d.u.y * h.d.w / 2 } })), label: t2 }));
  // 3) سحب الكراسي حول طاولة الطعام
  const tables = []; for (const r of rooms) for (const f of by.get(r.key) || []) if (f.kind === 'dining-table') tables.push({ r, f });
  const t3 = 'سحب الكراسي حول طاولة الطعام';
  if (!tables.length) out.push(mk('furniture-chairs', 'info', 'unverified', t3, 'غير متحقق: لا طاولة طعام مرسومة.' + note, {}, { label: t3 }));
  else {
    const rows = tables.map(({ r, f }) => {
      const s = Math.sin(f.rot || 0), c = Math.cos(f.rot || 0), u = { x: c, y: -s }, v = { x: s, y: c }, P0 = { x: f.x, y: f.y }, ob = obst(r).filter(o => o.f.id !== f.id && o.f.kind !== 'chair'), walls = polyEdges(r.net);
      const sides = [[u, f.w / 2, f.d], [{ x: -u.x, y: -u.y }, f.w / 2, f.d], [v, f.d / 2, f.w], [{ x: -v.x, y: -v.y }, f.d / 2, f.w]].map(([dir, off, len]) => {
        const perp = { x: -dir.y, y: dir.x }; let blocked = false;
        for (let a = -len / 2 + .1; a <= len / 2 - .1 + 1e-9 && !blocked; a += .2) for (let t = .1; t <= DAILY_LIMITS.chairPull + 1e-9; t += .2) {
          const q = { x: P0.x + dir.x * (off + t) + perp.x * a, y: P0.y + dir.y * (off + t) + perp.y * a };
          if (!pointInPolygon(q, r.net) || ob.some(o => pointInPolygon(q, o.c))) { blocked = true; break; }
        }
        return !blocked;
      });
      const longFree = Math.max(+sides[0] + +sides[1], 0), free = sides.filter(Boolean).length; void walls;
      const longSides = f.w >= f.d ? [sides[2], sides[3]] : [sides[0], sides[1]];
      return { r, f, free, longOk: longSides.filter(Boolean).length, longFree };
    });
    const bad = rows.filter(x => x.longOk < 2);
    out.push(mk('furniture-chairs', 'info', bad.length ? 'violated' : 'verified', t3, bad.length ? `فراغ سحب ${num(DAILY_LIMITS.chairPull)} م لا يتوفر على الضلعين الطويلين لطاولة «${bad.map(x => x.r.name).join('، ')}».${note}` : `يتوفر فراغ سحب ${num(DAILY_LIMITS.chairPull)} م على الضلعين الطويلين لكل طاولة طعام (${rows.length}).${note}`, { tables: rows.map(x => ({ room: x.r.name, freeSides: x.free })) }, { roomIds: bad.map(x => x.r.id), label: t3 }));
  }
  // 4) نقل القطعة الكبيرة من المدخل إلى غرفتها: أضيق باب (والدرج) في المسار مقابل أصغر أبعاد القطعة
  const O = guestOrigins(P), t4 = 'نقل قطع الأثاث الكبيرة إلى غرفها';
  if (!O.all.length) { out.push(mk('furniture-move', 'info', 'unverified', t4, 'غير متحقق: لا باب مدخل على الدور الأرضي.', {}, { label: t4 })); return; }
  const fails = [], oks = [];
  for (const r of furnished) {
    const big = (by.get(r.key) || []).filter(f => !FURN_SKIP.has(f.kind) && !WET_FIX.has(f.kind)).map(f => ({ f, m: Math.min(f.w, f.d, f.h || 9) })).sort((a, b) => b.m - a.m)[0]; if (!big) continue;
    let best = null; for (const o of O.all) { const p = shortestPath(P, o.door, o.room, [r.key]); if (p && (!best || p.len < best.len)) best = p; }
    if (!best) continue;
    const ws = best.via.map(v => v.w).filter(Number.isFinite), narrow = Math.min(...ws, 9), need = big.m + DAILY_LIMITS.carryExtra;
    (narrow >= need - 1e-9 ? oks : fails).push({ r, f: big.f, need: r2(need), narrow: r2(narrow), p: best });
  }
  out.push(mk('furniture-move', 'info', fails.length ? 'violated' : oks.length ? 'verified' : 'unverified', t4, fails.length ? `قطع قد لا تمر: ${fails.map(x => `${x.f.kind} إلى «${x.r.name}» (يلزم ${num(x.need)} م، أضيق باب ${num(x.narrow)} م)`).join('؛ ')}.${note}` : oks.length ? `أكبر قطعة في كل غرفة مؤثثة (${oks.length}) تمر عبر أضيق باب في مسارها (قياس مبسط بأصغر أبعاد القطعة).${note}` : 'غير متحقق: لا قطعة كبيرة بمسار محسوب.', { checks: [...fails, ...oks].map(x => ({ room: x.r.name, piece: x.f.kind, needM: x.need, narrowestM: x.narrow })) }, { roomIds: fails.map(x => x.r.id), segments: fails.flatMap(x => toSegments(x.p)), label: t4 }));
}

// ------------------------------------------------------------------------------------------ الانكشاف
function exposureItems(P, out) {
  const O = guestOrigins(P), levels = P.model.levels;
  const wallSegs = lvId => {
    const lv = P.model.levelById.get(lvId), segs = [];
    for (const w of lv.walls) {
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y); if (L < 1e-6) continue; const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
      const gaps = lv.openings.filter(op => op.wall.id === w.id && op.door).map(op => ({ id: op.id, open: ['arch', 'slider'].includes(op.kind), lo: op.o.at - op.w / 2, hi: op.o.at + op.w / 2 }));
      segs.push({ w, u, L, gaps });
    }
    return segs;
  };
  /** قطع الجدران مع فتح الفتحات المفتوحة والباب المفحوص فقط. */
  const blockers = (lvId, openIds) => {
    const out = [];
    for (const { w, u, L, gaps } of wallSegs(lvId)) {
      const cuts = gaps.filter(g => g.open || openIds.has(g.id)).sort((a, b) => a.lo - b.lo); let at = 0;
      for (const g of cuts) { if (g.lo > at) out.push([{ x: w.a.x + u.x * at, y: w.a.y + u.y * at }, { x: w.a.x + u.x * g.lo, y: w.a.y + u.y * g.lo }]); at = Math.max(at, g.hi); }
      if (at < L) out.push([{ x: w.a.x + u.x * at, y: w.a.y + u.y * at }, { x: w.b.x, y: w.b.y }]);
    }
    return out;
  };
  const lvId = levels[0]?.level.id; if (!lvId) return;
  const privDoors = [...P.doors.values()].filter(d => d.level === lvId && [d.a, d.b].some(k => k && ['private', 'private-bath'].includes(P.rooms.get(k)?.zone)));
  const privOf = d => [d.a, d.b].map(k => k && P.rooms.get(k)).find(r => r && ['private', 'private-bath'].includes(r.zone));
  const scan = (view, openIds, from, label, code) => {
    const segs = blockers(lvId, openIds), seen = [];
    for (const d of privDoors) {
      const room = privOf(d); if (!room) continue;
      const inside = { x: d.p.x + (d.a === room.key ? d.n.x : -d.n.x) * .25, y: d.p.y + (d.a === room.key ? d.n.y : -d.n.y) * .25 };
      const o2 = new Set([...openIds, d.id]), sg = blockers(lvId, o2);
      if (dist(view, inside) > DAILY_LIMITS.sightMax || dist(view, inside) < .3) continue;
      const own = sg; if (!own.some(([a, b]) => segInter(view, inside, a, b))) seen.push({ room, d, dist: r2(dist(view, inside)) });
    }
    void segs; return seen;
  };
  // 1) من باب مدخل الضيوف/الشارع
  const entryTitle = 'انكشاف الغرف الخاصة من مدخل الضيوف';
  if (!O.guest.length) out.push(mk('exposure-entry', 'info', 'unverified', entryTitle, 'غير متحقق: لا باب مدخل على الدور الأرضي.', {}, { label: entryTitle }));
  else {
    const seenAll = [], views = [];
    for (const e of O.guest) { const d = e.door, side = d.a === e.room.key ? 1 : -1, view = { x: d.p.x + d.n.x * side * DAILY_LIMITS.viewOffset, y: d.p.y + d.n.y * side * DAILY_LIMITS.viewOffset }; views.push(view); for (const s of scan(view, new Set([d.id]), d.p)) seenAll.push({ ...s, view }); }
    const uniq = [...new Map(seenAll.map(s => [s.d.id, s])).values()];
    out.push(mk('exposure-entry', 'warning', uniq.length ? 'violated' : 'verified', entryTitle, uniq.length ? `من ${O.hasGuestEntry ? 'مدخل الضيوف' : 'باب الشارع'} يُرى باب مفتوح لـ: ${names(uniq.map(s => s.room))} (خط نظر مباشر ≤ ${DAILY_LIMITS.sightMax} م).` : `لا خط نظر مباشر من ${O.hasGuestEntry ? 'مدخل الضيوف' : 'باب الشارع'} إلى أبواب غرف النوم أو حماماتها الخاصة.`, { seen: uniq.map(s => ({ room: s.room.name, opening: s.d.id, distM: s.dist })), views }, { roomIds: uniq.map(s => s.room.id), segments: uniq.map(s => ({ level: lvId, a: s.view, b: s.d.p })), points: views.map(v => ({ ...v, level: lvId })), label: entryTitle }));
  }
  // 2) من باب المجلس
  const majTitle = 'انكشاف الغرف الخاصة من باب المجلس';
  const mdoors = [...P.doors.values()].filter(d => d.level === lvId && [d.a, d.b].some(k => k && P.rooms.get(k)?.type === 'majlis') && !(d.a && d.b && P.rooms.get(d.a)?.type === 'majlis' && P.rooms.get(d.b)?.type === 'majlis'));
  const inner = mdoors.filter(d => d.a && d.b);
  if (!inner.length) { out.push(mk('exposure-majlis', 'info', 'unverified', majTitle, 'غير متحقق: لا باب يصل المجلس بفراغ داخلي (بابه الوحيد على الخارج أو لا مجلس).', {}, { label: majTitle })); return; }
  const seen = [], views = [];
  for (const d of inner) { const mk_ = P.rooms.get(d.a)?.type === 'majlis' ? d.a : d.b, side = d.a === mk_ ? 1 : -1, view = { x: d.p.x + d.n.x * side * DAILY_LIMITS.viewOffset, y: d.p.y + d.n.y * side * DAILY_LIMITS.viewOffset }; views.push(view); for (const s of scan(view, new Set([d.id]), d.p)) seen.push({ ...s, view }); }
  const uniq = [...new Map(seen.map(s => [s.d.id, s])).values()];
  out.push(mk('exposure-majlis', 'warning', uniq.length ? 'violated' : 'verified', majTitle, uniq.length ? `من داخل المجلس عند فتح بابه يُرى باب مفتوح لـ: ${names(uniq.map(s => s.room))}.` : 'عند فتح باب المجلس لا خط نظر مباشر إلى أبواب غرف النوم أو حماماتها الخاصة.', { seen: uniq.map(s => ({ room: s.room.name, opening: s.d.id, distM: s.dist })), views }, { roomIds: uniq.map(s => s.room.id), segments: uniq.map(s => ({ level: lvId, a: s.view, b: s.d.p })), points: views.map(v => ({ ...v, level: lvId })), label: majTitle }));
}

/**
 * يقيس الحياة اليومية في مستند. يعيد { version, items, assumptions }؛ كل بند: code, severity (warning|info), state (verified|violated|unverified),
 * title, reason, evidence (فيه paths بنقاطها وأطوالها وأبوابها)، loc = معطيات موقع (roomIds, segments, points, label) يحوّلها reviewDesign إلى location.
 * لا يغيّر المستند ولا يولّد شيئًا.
 */
export function analyzeDailyLife(doc, { model = null } = {}) {
  if (!doc || !Array.isArray(doc.levels) || !Array.isArray(doc.walls)) throw Error('DAILY_BAD_DOC: يلزم مستند mizan-draw/1.');
  const m = model || analyzeDoc(doc), P = prepare(doc, m), items = [];
  const run = (name, fn) => { try { fn(P, items); } catch (e) { items.push(mk('error-' + name, 'info', 'unverified', 'الحياة اليومية: ' + name, `غير متحقق: تعذّر القياس (${e.message || e}).`, {}, { label: name })); } };
  run('الضيوف', guestItems); run('الأسرة', familyItems); run('الطعام', foodItems); run('الحمامات', bathItems); run('الأثاث', furnitureItems); run('الانكشاف', exposureItems);
  return { version: DAILY_VERSION, items, assumptions: DAILY_ASSUMPTIONS, limits: DAILY_LIMITS };
}
export default { DAILY_VERSION, DAILY_LIMITS, DAILY_ASSUMPTIONS, analyzeDailyLife };
