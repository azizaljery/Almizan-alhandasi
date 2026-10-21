// إثبات الحركة الفعلية داخل المستند (mizan-draw/1): اتصال الغرف عبر الأبواب، ومسافات المشي الحقيقية من المدخل.
//
// ثلاث طبقات تُقارن ببعضها، وكلها من المستند نفسه:
//   (أ) رسم الأبواب: غرفة ↔ غرفة عبر فتحة من نوع باب (باب، باب مزدوج، منزلق، فتحة مفتوحة، مرآب)، والأدوار عبر الدرج.
//   (ب) شبكة مشي بدقة 10 سم: داخل الغرف الصافية + ممرات الأبواب فقط، مع خلوص جسم 0.25 م من كل جانب (ممر صافٍ ≥ 0.5 م)،
//       والدرج يصل خلية أول درجة في الدور السفلي بخلية آخر درجة في العلوي بطول المشي على الدرجات، وفتحة الدرج في العلوي محجوبة.
//   (ج) الشبكة نفسها مع الأثاث المرسوم عائقًا (عدا السجاد): «الحركة الفعلية».
// النتائج: أطوال المسارات الفعلية من المدخل إلى كل غرفة (إلى العتبة وإلى وسط الغرفة)، والغرف التي لا تُبلغ إلا عبر غرفة نوم أو حمام،
// ومسار الضيف هل يعبر منطقة العائلة، والممرات المسدودة، وعرض الأبواب (≥ 0.8 م قيمة تصميمية)، وخلوص فتح الأبواب (من review.mjs).
// القيم (0.8 م، 0.25 م، 2 م للممر المسدود) قيم تصميمية استرشادية لا اشتراطات نظامية متحقق منها.
//
// (الجولة الحادية عشرة) نُقلت المكتبة إلى dist/ لتستعملها بوابة الحركة في plan-review؛ السكربت scripts/circulation-proof.mjs واجهة سطر الأوامر.
// الاستعمال: node scripts/circulation-proof.mjs [مجلد المرحلة=evidence/acceptance/after-9] [--out evidence/circulation-proof/r9] [--png C7,C1] [--corpus]
import { analyzeDoc } from './draw/digest.mjs';
import { swingBlockers, fixtureRect } from './draw/review.mjs';
import { stairLayout } from './draw/stairs3d.mjs';
import { pointInPolygon } from './draw/geom.mjs';
import { isDoorKind } from './draw/catalog.mjs';
// منطقة الغرفة من اسمها ونوعها — القاعدة نفسها في dist/design-session.mjs (zoneOf)، منسوخة هنا لتجنب استيراد دائري
// (plan-review ← circulation-proof ← design-session ← plan-edit ← plan-review)
function zoneOf(label) {
  const n = label?.name || '', t = label?.type || '';
  if (/الرجال/.test(n) || (t === 'majlis' && !/النساء/.test(n))) return 'men';
  if (/النساء/.test(n)) return 'women';
  if (['kitchen', 'laundry', 'service'].includes(t) || /الخادمة|السائق|المخزن|الغسيل|مخزن/.test(n)) return 'service';
  return 'family';
}

export const CIRC_LIMITS = Object.freeze({ cell: 0.05, body: 0.25, bodyTight: 0.15, headroom: Infinity, doorMin: 0.8, deadEnd: 2.0, deadEndWarn: 3.0, detour: 2.2, doorFront: 0.6 });
/**
 * (الجولة الحادية عشرة) حدود بوابة الحركة في plan-review (قيم تصميمية افتراضية للميزان، غير متحققة نظاميًا):
 * ممر صافٍ ≥ 0.6 م مع الأثاث (جسم 0.3 م من كل جانب)، وشبكة 10 سم (أسرع؛ الخطأ ±5 سم)، وأمام كل باب منطقة حرة بعمق 0.6 م،
 * وباب دورة مياه الضيوف ≥ 0.8 م والمرحاض خارج منطقة فتحه وعرضه.
 */
export const CIRC_GATE_LIMITS = Object.freeze({ ...CIRC_LIMITS, cell: 0.1, body: 0.3, bodyTight: 0.15, guestWcDoorMin: 0.8 });
const FIXED_WET = new Set(['wc', 'basin', 'shower', 'bathtub']);
export const CIRC_NOTE = 'مسارات محسوبة من الرسم بخلوص جسم 0.25 م وعرض باب 0.8 م كقيم تصميمية استرشادية؛ ليست شهادة إخلاء ولا وصول شامل.';
const PRIVATE = new Set(['bedroom', 'master', 'bath']);
const FAMILY_CORE = new Set(['bedroom', 'master', 'living', 'kitchen', 'dining', 'laundry', 'service']);
const TRANSITIONAL = new Set(['corridor', 'entrance', 'bath', 'storage', 'other', 'stairs']);
const NOT_OBSTACLE = new Set(['rug', 'car', 'tree', 'plant']);
const r2 = v => Math.round(v * 100) / 100;
const SQ2 = Math.SQRT2;

class Heap { // أصغر أولًا
  constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, top = v[0], last = k.length - 1, lk = k[last], lv = v[last]; k.pop(); v.pop(); if (last > 0) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= last) break; if (c + 1 < last && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; } return top; }
  get size() { return this.k.length; }
}

/** المنطقة: men | women | family | shared. الصريحة من الاسم/النوع (قاعدة zoneOf في الموقع)، والانتقالية (ممر، مدخل، حمام، مخزن) من جيرانها:
 *  جيران رجال فقط → men؛ نساء (مع العائلة أو وحدهن) → women؛ رجال مع عائلة أو مع نساء → shared. */
function zones(model) {
  const z = new Map();
  for (const L of model.levels) for (const r of L.rooms) {
    const n = r.name || '', base = zoneOf(r.label || { name: n, type: r.type });
    if (base === 'men' || base === 'women') z.set(r.id, base);
    else if (/العائلة|الجناح|الغرف/.test(n) || FAMILY_CORE.has(r.type)) z.set(r.id, 'family');
    else if (TRANSITIONAL.has(r.type)) z.set(r.id, null);
    else z.set(r.id, 'family');
  }
  for (let pass = 0; pass < 3; pass++) for (const L of model.levels) for (const r of L.rooms) {
    if (z.get(r.id)) continue;
    const nb = new Set((L.graph.get(r.id) || []).map(e => z.get(e.to)).filter(v => v && v !== 'shared'));
    if (!nb.size) continue;
    if (nb.size === 1) z.set(r.id, [...nb][0]);
    else if (nb.has('men')) z.set(r.id, 'shared');
    else if (nb.has('women')) z.set(r.id, 'women');
  }
  for (const L of model.levels) for (const r of L.rooms) if (!z.get(r.id)) z.set(r.id, L.levelIndex > 0 ? 'family' : 'shared');
  return z;
}
const isGuest = z => z === 'men' || z === 'women';

/** شبكة المشي لكل الأدوار في فهرس واحد. */
function buildGrid(doc, model, { furniture, K }) {
  const pts = doc.walls.flatMap(w => [w.a, w.b]);
  const x0 = Math.min(...pts.map(p => p.x)) - 0.5, y0 = Math.min(...pts.map(p => p.y)) - 0.5, x1 = Math.max(...pts.map(p => p.x)) + 0.5, y1 = Math.max(...pts.map(p => p.y)) + 0.5;
  const c = K.cell, nx = Math.ceil((x1 - x0) / c), ny = Math.ceil((y1 - y0) / c), per = nx * ny, nL = model.levels.length;
  const room = new Int32Array(per * nL).fill(-1);   // فهرس الغرفة، -1 = ليس داخل غرفة
  const free = new Uint8Array(per * nL);
  const roomList = [];
  const P = i => { const li = Math.floor(i / per), j = i % per; return { li, x: x0 + (j % nx + 0.5) * c, y: y0 + (Math.floor(j / nx) + 0.5) * c }; };
  const idx = (li, x, y) => { const gx = Math.floor((x - x0) / c), gy = Math.floor((y - y0) / c); if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) return -1; return li * per + gy * nx + gx; };
  model.levels.forEach((L, li) => {
    for (const r of L.rooms) {
      if (!r.net?.length || r.type === 'void') continue;
      const ri = roomList.length; roomList.push({ r, li });
      const xs = r.net.map(p => p.x), ys = r.net.map(p => p.y);
      for (let gy = Math.max(0, Math.floor((Math.min(...ys) - y0) / c)); gy <= Math.min(ny - 1, Math.ceil((Math.max(...ys) - y0) / c)); gy++)
        for (let gx = Math.max(0, Math.floor((Math.min(...xs) - x0) / c)); gx <= Math.min(nx - 1, Math.ceil((Math.max(...xs) - x0) / c)); gx++) {
          const p = { x: x0 + (gx + 0.5) * c, y: y0 + (gy + 0.5) * c };
          if (!pointInPolygon(p, r.net) || r.space?.holes?.some(h => pointInPolygon(p, h))) continue;
          const i = li * per + gy * nx + gx; if (room[i] >= 0 && roomList[room[i]].r.area < r.area) continue;
          room[i] = ri; free[i] = 1;
        }
    }
    // ممرات الأبواب عبر سماكة الجدار
    for (const op of L.openings) {
      if (!op.door) continue;
      const t = op.wall.t ?? 0.2;
      for (let s = -op.w / 2 + c / 2; s < op.w / 2; s += c / 2) for (let q = -(t / 2 + 0.12); q <= t / 2 + 0.12; q += c / 2) {
        const p = { x: op.p.x + op.u.x * s + op.n.x * q, y: op.p.y + op.u.y * s + op.n.y * q }, i = idx(li, p.x, p.y); if (i >= 0) free[i] = 1;
      }
    }
    // الأثاث
    if (furniture) for (const f of doc.fixtures || []) {
      if (f.level !== L.level.id || NOT_OBSTACLE.has(f.kind) || (f.h ?? 1) < 0.1) continue;
      // خلية محجوبة إن وقع مركزها داخل قطعة الأثاث (لا تكبير للقطعة بنصف خلية؛ الخطأ ±2.5 سم متماثل)
      const poly = fixtureRect(f), xs = poly.map(p => p.x), ys = poly.map(p => p.y);
      for (let gy = Math.floor((Math.min(...ys) - y0) / c); gy <= Math.ceil((Math.max(...ys) - y0) / c); gy++) for (let gx = Math.floor((Math.min(...xs) - x0) / c); gx <= Math.ceil((Math.max(...xs) - x0) / c); gx++) {
        if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) continue;
        if (pointInPolygon({ x: x0 + (gx + 0.5) * c, y: y0 + (gy + 0.5) * c }, poly)) free[li * per + gy * nx + gx] = 0;
      }
    }
  });
  // الدرج (كما يبنيه المجسّم): درجات الدور السفلي كتل مصمتة من الأرض (emitStair)، وفتحة البلاطة في العلوي محاطة بدرابزين،
  // فكلاهما عائق للمشي وللعرض، عدا الدرجة الأولى (سفليًا) والأخيرة (علويًا). الوصلة من «نقطة الاقتراب» أمام حافة الدرجة الأولى
  // إلى «نقطة الخروج» بعد حافة الأخيرة، وكل منهما تُطلب ضمن 0.8 م داخل غرفة الدرج في دورها أو في فتحة باب.
  // K.headroom (افتراضيًا ∞) يسمح بالمرور تحت درجات سطحها أعلى من headroom + 0.3 م لو صار الدرج معلّقًا.
  const links = [], noWalk = new Uint8Array(per * nL);
  const paint = (li, poly, fn) => { const xs = poly.map(p => p.x), ys = poly.map(p => p.y); for (let x = Math.min(...xs); x <= Math.max(...xs) + 1e-9; x += c / 2) for (let y = Math.min(...ys); y <= Math.max(...ys) + 1e-9; y += c / 2) if (pointInPolygon({ x, y }, poly)) { const i = idx(li, x, y); if (i >= 0) fn(i, { x, y }); } };
  for (const s of doc.stairs || []) {
    const li = model.levels.findIndex(L => L.level.id === s.level); if (li < 0 || li + 1 >= nL) continue;
    const rise = (doc.levels[li + 1].elevation ?? 3.2) - (doc.levels[li].elevation ?? 0) || 3.2;
    let lay; try { lay = stairLayout(s, rise); } catch { continue; }
    const steps = lay.steps, first = steps[0].poly, last = steps[steps.length - 1].poly;
    const inFirst = p => pointInPolygon(p, first), inLast = p => pointInPolygon(p, last);
    const high = p => steps.some(st => st.top - 0.3 >= K.headroom && pointInPolygon(p, st.poly));
    // السفلي: الفتحة (ما بين القلبتين والبسطة) والدرجات عدا الأولى
    paint(li, lay.hole, (i, p) => { if (!inFirst(p) && !high(p)) free[i] = 0; });
    for (const st of steps.slice(1)) paint(li, st.poly, (i, p) => { if (!inFirst(p) && !high(p)) free[i] = 0; });
    // العلوي: الفتحة عدا الدرجة الأخيرة
    paint(li + 1, lay.hole, (i, p) => { if (!inLast(p)) free[i] = 0; });
    const cen = poly => ({ x: poly.reduce((a, p) => a + p.x, 0) / poly.length, y: poly.reduce((a, p) => a + p.y, 0) / poly.length });
    const cs = steps.map(st => cen(st.poly));
    const edge = (k, toward) => { // منتصف حافة الدرجة k في اتجاه toward (وحدة)، ثم 0.15 م خارجها
      const cc = cs[k], d = Math.hypot(toward.x, toward.y) || 1, u = { x: toward.x / d, y: toward.y / d };
      const half = Math.max(...steps[k].poly.map(p => (p.x - cc.x) * u.x + (p.y - cc.y) * u.y));
      return { x: cc.x + u.x * (half + 0.15), y: cc.y + u.y * (half + 0.15) };
    };
    const n = cs.length, approach = edge(0, { x: cs[0].x - cs[1].x, y: cs[0].y - cs[1].y }), exit = edge(n - 1, { x: cs[n - 1].x - cs[n - 2].x, y: cs[n - 1].y - cs[n - 2].y });
    const roomAtCell = (L, p) => { const i = idx(L, p.x, p.y); return i >= 0 ? room[i] : -1; };
    let len = 0; for (let k = 1; k < n; k++) len += Math.hypot(cs[k].x - cs[k - 1].x, cs[k].y - cs[k - 1].y);
    links.push({ stair: s.id, from: approach, to: exit, li, len: Math.hypot(len, rise), fromRoom: roomAtCell(li, cs[0]), toRoom: roomAtCell(li + 1, cs[n - 1]), first, last, hole: lay.hole }); // طول المشي على الميل
  }
  // خلوص الجسم: مسافة كل خلية حرة عن أقرب خلية محجوبة (Dijkstra بالمسافات 1 و√2)
  const N = per * nL, clear = new Float64Array(N).fill(Infinity), h = new Heap();
  for (let i = 0; i < N; i++) if (!free[i]) { clear[i] = 0; h.push(0, i); }
  const nbr = (i, f) => { const li = Math.floor(i / per), j = i % per, gx = j % nx, gy = Math.floor(j / nx); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X = gx + dx, Y = gy + dy; if (X < 0 || Y < 0 || X >= nx || Y >= ny) continue; f(li * per + Y * nx + X, dx && dy ? SQ2 : 1, dx, dy); } };
  while (h.size) { const i = h.pop(), d = clear[i]; nbr(i, (k, w) => { if (clear[k] > d + w) { clear[k] = d + w; h.push(d + w, k); } }); }
  // الخلية الحرة على بعد (d) خلايا من أقرب محجوبة؛ مركزها يبعد (d − 0.5)·c عن حافتها
  const walk = new Uint8Array(N); for (let i = 0; i < N; i++) walk[i] = free[i] && !noWalk[i] && (clear[i] - 0.5) * c >= K.body - 1e-6 ? 1 : 0;
  return { x0, y0, nx, ny, per, c, room, free, walk, clear, roomList, P, idx, links, nbr };
}

function nearestWalk(G, li, p, maxR = 1.2, roomIdx = null) {
  let best = -1, bd = Infinity; const r = Math.ceil(maxR / G.c);
  const gx = Math.floor((p.x - G.x0) / G.c), gy = Math.floor((p.y - G.y0) / G.c);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = gx + dx, Y = gy + dy; if (X < 0 || Y < 0 || X >= G.nx || Y >= G.ny) continue; const i = li * G.per + Y * G.nx + X; if (!G.walk[i] || (roomIdx !== null && G.room[i] !== roomIdx && G.room[i] !== -1)) continue; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
  return best;
}

function dijkstra(G, seeds) {
  const N = G.walk.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), h = new Heap();
  for (const s of seeds) if (s >= 0 && G.walk[s]) { dist[s] = 0; h.push(0, s); }
  const linkFrom = new Map(), at = (li, p, ri) => nearestWalk(G, li, p, 0.8, ri >= 0 ? ri : null);
  for (const l of G.links) { const a = at(l.li, l.from, l.fromRoom), b = at(l.li + 1, l.to, l.toRoom); l.a = a; l.b = b; if (a >= 0 && b >= 0) { (linkFrom.get(a) || linkFrom.set(a, []).get(a)).push({ to: b, w: l.len }); (linkFrom.get(b) || linkFrom.set(b, []).get(b)).push({ to: a, w: l.len }); } }
  while (h.size) {
    const i = h.pop(), d = dist[i];
    G.nbr(i, (k, w, dx, dy) => {
      if (!G.walk[k]) return;
      if (dx && dy && (!G.walk[i + dx] || !G.walk[i + dy * G.nx])) return; // لا قطع للزوايا
      const nd = d + w * G.c; if (nd < dist[k]) { dist[k] = nd; prev[k] = i; h.push(nd, k); }
    });
    for (const e of linkFrom.get(i) || []) { const nd = d + e.w; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = i; h.push(nd, e.to); } }
  }
  return { dist, prev };
}

/** @returns {{ note, entrances[], rooms[], findings[], doors[], counts }} */
export function circulationProof(doc, opts = {}) {
  const K = { ...CIRC_LIMITS, ...(opts.limits || {}) };
  const model = analyzeDoc(doc), Z = zones(model), findings = [];
  const add = (severity, code, message, elements = [], extra = {}) => findings.push({ severity, code, message, elements, ...extra });
  const roomById = new Map(model.levels.flatMap(L => L.rooms.map(r => [r.id, { r, L }])));

  // ---- (أ) رسم الأبواب متعدد الأدوار
  const adj = new Map();
  for (const L of model.levels) for (const [id, es] of L.graph) adj.set(id, [...es]);
  for (const s of doc.stairs || []) {
    const li = model.levels.findIndex(L => L.level.id === s.level); if (li < 0 || li + 1 >= model.levels.length) continue;
    const lower = model.levels[li].roomAt({ x: s.x, y: s.y }), rise = 3.2;
    let lay; try { lay = stairLayout(s, rise); } catch { lay = null; }
    const last = lay?.steps[lay.steps.length - 1]?.poly, top = last ? { x: last.reduce((a, p) => a + p.x, 0) / 4, y: last.reduce((a, p) => a + p.y, 0) / 4 } : { x: s.x, y: s.y };
    const upper = model.levels[li + 1].roomAt(top);
    if (lower && upper) { adj.get(lower.id).push({ to: upper.id, via: s.id, stair: true }); adj.get(upper.id).push({ to: lower.id, via: s.id, stair: true }); }
  }
  const G0 = model.levels[0];
  const ents = G0.entries.map(e => ({ ...e, zone: Z.get(e.room), name: roomById.get(e.room)?.r.name }));
  if (!ents.length) add('serious', 'NO_ENTRANCE', 'لا باب خارجي في الدور الأرضي: لا يمكن الدخول إلى المبنى.');
  const famEnt = ents.find(e => e.zone === 'family') || ents.find(e => e.zone === 'shared') || ents.find(e => e.zone === 'women') || ents[0];
  const guestEnt = ents.find(e => e.zone === 'men' && e !== famEnt) || null;
  const bfs = (starts, avoid = () => false) => { const seen = new Map(starts.map(s => [s, [s]])), q = [...starts]; while (q.length) { const id = q.shift(); for (const e of adj.get(id) || []) if (!seen.has(e.to) && !avoid(e.to)) { seen.set(e.to, [...seen.get(id), e.to]); q.push(e.to); } } return seen; };
  const allStarts = [...new Set(ents.map(e => e.room))];
  const reachG = bfs(allStarts);

  // ---- (ب)(ج) الشبكتان
  const grids = { bare: buildGrid(doc, model, { furniture: false, K }), furn: buildGrid(doc, model, { furniture: true, K }) };
  const entranceSeeds = (G, e) => { const op = G0.openings.find(o => o.id === e.via); if (!op) return []; const out = []; for (let s = -op.w / 2; s <= op.w / 2; s += G.c) { const i = G.idx(0, op.p.x + op.u.x * s, op.p.y + op.u.y * s); if (i >= 0 && G.walk[i]) out.push(i); } return out; };
  const runs = {};
  for (const [k, G] of Object.entries(grids)) {
    runs[k] = {};
    for (const e of ents) runs[k][e.via] = dijkstra(G, entranceSeeds(G, e));
  }
  const roomIndex = new Map(grids.furn.roomList.map((x, i) => [x.r.id, i]));
  const pathRooms = (G, prev, i) => { const seq = [], cells = []; for (let k = i, guard = 0; k >= 0 && guard < 200000; k = prev[k], guard++) { cells.push(k); const ri = G.room[k]; if (ri >= 0) { const id = G.roomList[ri].r.id; if (seq[seq.length - 1] !== id) seq.push(id); } } return { seq: seq.reverse(), cells: cells.reverse() }; };
  const measure = (G, run, r, li) => {
    if (!run) return null;
    const ri = roomIndex.get(r.id); let thr = Infinity, thrCell = -1;
    for (let i = li * G.per; i < (li + 1) * G.per; i++) if (G.room[i] === ri && run.dist[i] < thr) { thr = run.dist[i]; thrCell = i; }
    if (!Number.isFinite(thr)) return { reachable: false };
    const target = r.label?.seed && pointInPolygon(r.label.seed, r.net) ? r.label.seed : r.centroid;
    // أقرب خلية مبلوغة داخل الغرفة إلى مركزها
    let best = -1, bd = Infinity; for (let i = li * G.per; i < (li + 1) * G.per; i++) { if (G.room[i] !== ri || !Number.isFinite(run.dist[i])) continue; const p = G.P(i), d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2; if (d < bd) { bd = d; best = i; } }
    const pr = pathRooms(G, run.prev, best);
    return { reachable: true, toThreshold: r2(thr), toCenter: r2(run.dist[best]), centerGap: r2(Math.sqrt(bd)), via: pr.seq, cells: pr.cells };
  };

  const rooms = [];
  for (const L of model.levels) for (const r of L.rooms) {
    if (r.unlabelled || r.type === 'void' || r.area < 0.8) continue;
    const z = Z.get(r.id), graph = reachG.has(r.id);
    // المدخل: للضيوف أقرب مدخل ضيوف يبلغها، وللعائلة المدخل الرئيسي؛ وإن لم يبلغها فأقرب مدخل يبلغها
    const pref = z === 'men' ? ents.filter(e => e.zone === 'men') : z === 'women' ? [...ents.filter(e => e.zone === 'women'), ...(famEnt ? [famEnt] : [])] : famEnt ? [famEnt] : [];
    const score = e => { const m = measure(grids.bare, runs.bare[e.via], r, L.levelIndex); return m?.reachable ? m.toCenter : Infinity; };
    const pick = list => list.map(e => ({ e, d: score(e) })).filter(x => Number.isFinite(x.d)).sort((a, b) => a.d - b.d)[0]?.e;
    // العائلة لا تُحوَّل بصمت إلى مدخل آخر: إن لم يبلغها مدخلها بخلوص 0.5 م تبقى منه وتُعلن «ممرًا ضيقًا»
    const from = pick(pref) || (z === 'family' ? famEnt : pick(ents)) || pref[0] || famEnt;
    const altFrom = z === 'family' && famEnt && from === famEnt && !Number.isFinite(score(famEnt)) ? pick(ents.filter(e => e !== famEnt)) : null;
    const bare = from ? measure(grids.bare, runs.bare[from.via], r, L.levelIndex) : null, furn = from ? measure(grids.furn, runs.furn[from.via], r, L.levelIndex) : null;
    const straight = from ? (() => { const op = G0.openings.find(o => o.id === from.via); const c = r.centroid; return r2(Math.hypot(c.x - op.p.x, c.y - op.p.y)); })() : null;
    rooms.push({ id: r.id, name: r.name, type: r.type, level: L.level.id, zone: z, from: from?.name || null, fromOpening: from?.via || null, graphReachable: graph, graphPath: graph ? reachG.get(r.id).map(id => roomById.get(id)?.r.name) : null,
      bare: bare && { reachable: bare.reachable, toThreshold: bare.toThreshold, toCenter: bare.toCenter }, actual: furn && { reachable: furn.reachable, toThreshold: furn.toThreshold, toCenter: furn.toCenter, via: furn.via?.map(id => roomById.get(id)?.r.name) },
      straight, detour: furn?.reachable && straight ? r2(furn.toCenter / Math.max(1, straight)) : null, _cells: furn?.cells || null, _via: furn?.via || null, _bareCells: bare?.cells || null, _bareVia: bare?.via || null, _prefOk: pref.includes(from), altFrom: altFrom?.name || null });
  }
  // الدرج: بلوغ أول درجة من المدخل، واتصال أعلاه ببقية الدور — بخلوص 0.5 م، ثم بخلوص أضيق (0.3 م) لتمييز «ضيق» (تنبيه) عن «مسدود» (جسيم)
  const suppressed = new Set();
  let tight = null;
  const tightGrid = () => tight || (tight = (() => { const T = buildGrid(doc, model, { furniture: false, K: { ...K, body: K.bodyTight } }); return { T, r: dijkstra(T, entranceSeeds(T, famEnt)) }; })());
  const reachedRoom = (G, ri, dist) => { for (let i = 0; i < G.room.length; i++) if (G.room[i] === ri && Number.isFinite(dist[i])) return true; return false; };
  const stairState = (G, run, l) => {
    const startOk = l.a >= 0 && Number.isFinite(run.dist[l.a]);
    const upperLv = model.levels[l.li + 1], upperRooms = rooms.filter(x => x.level === upperLv.level.id && x.graphReachable && x.type !== 'stairs');
    const fromTop = l.b >= 0 ? dijkstra(G, [l.b]) : null;
    const cut = fromTop ? upperRooms.filter(x => !reachedRoom(G, roomIndex.get(x.id), fromTop.dist)) : upperRooms;
    return { startOk, lowerReached: l.fromRoom >= 0 && reachedRoom(G, l.fromRoom, run.dist), arriveOk: l.b >= 0 && !cut.length, cut, upperLv };
  };
  if (famEnt) for (const l of grids.bare.links) {
    const G = grids.bare, st = stairState(G, runs.bare[famEnt.via], l), lowerRoom = l.fromRoom >= 0 ? G.roomList[l.fromRoom].r : null;
    if (st.startOk && st.arriveOk) continue;
    const T = tightGrid(), tl = T.T.links.find(x => x.stair === l.stair), tst = tl ? stairState(T.T, T.r, tl) : null;
    if (!st.startOk && (lowerRoom ? st.lowerReached || l.a < 0 : true)) {
      const ok = tst?.startOk;
      add(ok ? 'warn' : 'serious', 'STAIR_ACCESS', ok
        ? `الاقتراب من أول درجة في الدرج ${l.stair} ضيق (ممر صافٍ بين ${K.bodyTight * 2} و${K.body * 2} م): حافة الدرجة الأولى ملاصقة لجدار ولا يُقترب منها إلا من جزء ضيق من الفتحة.`
        : `لا يمكن الاقتراب من أول درجة في الدرج ${l.stair}${lowerRoom ? ' داخل «' + lowerRoom.name + '»' : ''} حتى بممر ${K.bodyTight * 2} م: حافة الدرجة الأولى ملاصقة لجدار، والفتحة المؤدية إلى غرفة الدرج تقابل جانب الدرج لا بدايته.`, [l.stair, ...(lowerRoom ? [lowerRoom.id] : [])]);
    }
    if (!st.arriveOk) {
      const ok = tst?.arriveOk, cut = (tl && tl.b >= 0 ? tst.cut : st.cut);
      if (ok) add('warn', 'STAIR_ARRIVAL', `الخروج من أعلى الدرج ${l.stair} إلى بقية ${st.upperLv.level.name} يمر بموضع ضيق (بين ${K.bodyTight * 2} و${K.body * 2} م) بين فتحة الدرج والجدار: لا بسطة وصول كافية.`, [l.stair]);
      else if (tl && tl.b >= 0) add('serious', 'STAIR_ARRIVAL', `أعلى الدرج ${l.stair} في ${st.upperLv.level.name} لا يتصل ببقية الدور حتى بممر ${K.bodyTight * 2} م: آخر درجة تقابل جدارًا، وموضع الوصول جيب تفصله فتحة الدرج عن ${cut.slice(0, 3).map(x => '«' + x.name + '»').join('، ')}${cut.length > 3 ? ` و${cut.length - 3} غيرها` : ''}.`, [l.stair, ...cut.map(x => x.id)]);
      else add('serious', 'STAIR_ARRIVAL_BLOCKED', `لا موضع قدم صالح بعد آخر درجة في الدرج ${l.stair} في ${st.upperLv.level.name}: حافتها ملاصقة لجدار ولا فتحة أمامها.`, [l.stair]);
    }
    for (const x of rooms.filter(x => x.level === st.upperLv.level.id || x.type === 'stairs')) suppressed.add(x.id);
  }
  // ممرات ضيقة: ما لا يُبلغ بخلوص 0.5 م يُقاس بخلوص 0.3 م من مدخله نفسه، ويُحدد موضع الاختناق (أول خلية على المسار الضيق لا تتسع لـ 0.5 م)
  const narrowRooms = rooms.filter(x => x.bare && !x.bare.reachable && x.graphReachable && x.fromOpening);
  const tightRuns = new Map();
  const narrowAt = new Map();
  if (narrowRooms.length && famEnt) {
    const T = tightGrid().T;
    for (const x of narrowRooms) {
      const e = ents.find(q => q.via === x.fromOpening);
      if (!tightRuns.has(e.via)) tightRuns.set(e.via, e === famEnt ? tight.r : dijkstra(T, entranceSeeds(T, e)));
      const L = model.levels.find(q => q.level.id === x.level), r = L.rooms.find(q => q.id === x.id), m = measure(T, tightRuns.get(e.via), r, L.levelIndex);
      if (!m?.reachable) continue;
      x.tight = { clearance: K.bodyTight * 2, toThreshold: m.toThreshold, toCenter: m.toCenter, via: m.via.map(id => roomById.get(id)?.r.name) };
      if (suppressed.has(x.id)) continue;
      // الاختناق: الخلية التي تلي آخر خلية على المسار الضيق يبلغها المشي بخلوص 0.5 م من المدخل نفسه
      const bd = runs.bare[e.via]?.dist; let lastOk = -1; if (bd) m.cells.forEach((i, j) => { if (Number.isFinite(bd[i])) lastOk = j; });
      const pinch = m.cells[Math.min(m.cells.length - 1, lastOk + 1)];
      const p = pinch !== undefined ? T.P(pinch) : null, ri = pinch !== undefined ? T.room[pinch] : -1;
      const key = p ? `${Math.round(p.x * 2) / 2},${Math.round(p.y * 2) / 2},${p.li}` : 'x';
      (narrowAt.get(key) || narrowAt.set(key, { p, where: ri >= 0 ? T.roomList[ri].r.name : 'فتحة باب', from: e.name, rooms: [] }).get(key)).rooms.push(x);
    }
  }
  for (const { p, where, from, rooms: rs } of narrowAt.values()) add('warn', 'NARROW_PASSAGE', `من «${from}» لا يُبلغ ${rs.map(x => '«' + x.name + '»').join('، ')} إلا عبر ممر صافٍ بين ${K.bodyTight * 2} و${K.body * 2} م${p ? ` ${where === 'فتحة باب' ? 'في فتحة باب' : `في «${where}»`} عند (${r2(p.x)}، ${r2(p.y)})` : ''}${rs.some(x => x.altFrom) ? ` (يُبلغ بخلوص كافٍ من «${rs.find(x => x.altFrom).altFrom}»)` : ''}.`, rs.map(x => x.id), { at: p && { x: r2(p.x), y: r2(p.y) }, rooms: rs.map(x => x.name) });
  const blocked = new Map();
  for (const x of rooms) {
    if (x.type === 'courtyard') continue;
    if (!x.graphReachable) { add('serious', 'UNREACHABLE', `«${x.name}» (${x.level}) لا يُبلغ من أي مدخل عبر الأبواب والدرج.`, [x.id]); continue; }
    if (suppressed.has(x.id)) continue; // ما يتبع درجًا معيبًا أُعلن في ملاحظة الدرج نفسها
    if (x.bare && !x.bare.reachable) { if (!x.tight) add('serious', 'NO_WALKABLE_PATH', `«${x.name}» متصلة بالأبواب لكن لا مسار إليها حتى بخلوص ${K.bodyTight * 2} م.`, [x.id]); }
    else if (x.actual && !x.actual.reachable) {
      // أول خلية على المسار الفارغ تصير غير صالحة مع الأثاث، والأثاث الذي يضيّقها
      // نقطة الانقطاع: الخلية التي تلي آخر خلية على المسار الفارغ يبلغها المشي مع الأثاث، ثم الأثاث الأقرب إلى المتر التالي من المسار
      const Gf = grids.furn, Gb = grids.bare, cells = x._bareCells || [], fd = runs.furn[x.fromOpening]?.dist;
      let k = -1; if (fd) { let last = -1; cells.forEach((i, j) => { if (Number.isFinite(fd[i])) last = j; }); k = last + 1 < cells.length ? last + 1 : -1; }
      const cell = k >= 0 ? cells[k] : undefined;
      let culprits = [], where = null;
      if (cell !== undefined) {
        const win = cells.slice(Math.max(0, k - 2), k + Math.round(1.2 / Gb.c)).map(i => Gb.P(i));
        const p = Gb.P(cell), li = Math.floor(cell / Gb.per); where = { x: r2(p.x), y: r2(p.y), room: Gb.room[cell] >= 0 ? Gb.roomList[Gb.room[cell]].r.name : 'فتحة باب' };
        const dRect = (q, f) => { const R = fixtureRect(f); if (pointInPolygon(q, R)) return 0; let m = Infinity; for (let k = 0; k < 4; k++) { const a = R[k], b = R[(k + 1) % 4], L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2, t = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / L2)); m = Math.min(m, Math.hypot(q.x - a.x - t * (b.x - a.x), q.y - a.y - t * (b.y - a.y))); } return m; };
        const near = (doc.fixtures || []).filter(f => f.level === model.levels[li].level.id && !NOT_OBSTACLE.has(f.kind) && (f.h ?? 1) >= 0.1).map(f => ({ f, d: Math.min(...win.map(q => dRect(q, f))) })).filter(o => o.d <= K.body + 0.05).sort((a, b) => a.d - b.d);
        culprits = near.filter(o => o.d <= near[0]?.d + 0.1).map(o => o.f);
      }
      const key = culprits.map(f => f.id).join('+') || 'unknown';
      (blocked.get(key) || blocked.set(key, { culprits, where, rooms: [] }).get(key)).rooms.push(x);
    }
    if (x.detour && x.detour > K.detour && x.actual.toCenter > 12) add('info', 'LONG_DETOUR', `المشي من «${x.from}» إلى «${x.name}» ${x.actual.toCenter} م مقابل ${x.straight} م خطًا مستقيمًا (×${x.detour}).`, [x.id]);
  }

  const KIND_AR = { 'sofa-3': 'كنبة', 'majlis-sofa': 'جلسة مجلس', wc: 'مرحاض', basin: 'مغسلة', shower: 'دش', wardrobe: 'دولاب', 'bed-double': 'سرير', 'bed-single': 'سرير', 'dining-table': 'طاولة طعام', 'kitchen-run': 'خزائن مطبخ', nightstand: 'كومودينو', 'coffee-table': 'طاولة', desk: 'مكتب', tv: 'تلفاز' };
  for (const { culprits, where, rooms: rs } of blocked.values()) {
    const what = culprits.length ? culprits.map(f => `${KIND_AR[f.kind] || f.kind} ${f.id}`).join(' و') : 'أثاث';
    add('warn', 'BLOCKED_BY_FURNITURE', `${what} يضيّق المسار ${where ? `${where.room === 'فتحة باب' ? 'في فتحة باب' : `في «${where.room}»`} عند (${where.x}، ${where.y}) ` : ''}إلى أقل من ${K.body * 2} م، فلا تُبلغ مشيًا مع الأثاث المرسوم: ${rs.map(x => '«' + x.name + '»').join('، ')}.`, [...culprits.map(f => f.id), ...rs.map(x => x.id)], { at: where, rooms: rs.map(x => x.name) });
  }

  // ---- غرف لا تُبلغ إلا عبر غرفة نوم أو حمام
  for (const x of rooms) {
    if (!x.graphReachable) continue;
    const alt = bfs(allStarts, id => id !== x.id && PRIVATE.has(roomById.get(id)?.r.type));
    if (alt.has(x.id)) continue;
    const path = reachG.get(x.id), through = path.slice(0, -1).filter(id => PRIVATE.has(roomById.get(id)?.r.type)).map(id => roomById.get(id).r);
    const ensuite = ['bath', 'storage'].includes(x.type) && through.length === 1 && ['bedroom', 'master'].includes(through[0].type);
    const viaBath = through.some(r => r.type === 'bath');
    add(ensuite ? 'info' : viaBath ? 'serious' : (['bedroom', 'master', 'living', 'kitchen', 'majlis', 'dining'].includes(x.type) ? 'serious' : 'warn'), ensuite ? 'ENSUITE' : 'THROUGH_PRIVATE',
      ensuite ? `«${x.name}» تابعة لـ«${through[0].name}» ولا تُبلغ إلا منها (ملحق خاص — طبيعي).` : `«${x.name}» لا تُبلغ إلا عبر ${through.map(r => '«' + r.name + '»').join(' ثم ')}.`, [x.id, ...through.map(r => r.id)]);
  }

  // ---- مسار الضيف: من مدخل الرجال إلى فراغاتهم، ومن مدخل النساء (أو العائلة) إلى فراغاتهن
  const guestRooms = rooms.filter(x => isGuest(x.zone) && x.level === G0.level.id && x.graphReachable);
  if (guestRooms.some(x => x.zone === 'men' && x.type === 'majlis') && !guestEnt) add('info', 'NO_GUEST_ENTRANCE', `لا مدخل مستقل للرجال؛ مسار المجلس يبدأ من «${famEnt?.name}».`);
  for (const x of guestRooms) {
    const via = x._via || x._bareVia; if (!via) continue;
    if (x.zone === 'men' && guestEnt && !x._prefOk && x.type === 'majlis') add('serious', 'GUEST_NO_OWN_ENTRY', `«${x.name}» لا تُبلغ من مدخل الرجال؛ أقرب وصول إليها من «${x.from}».`, [x.id]);
    const startHall = via[0] && roomById.get(via[0])?.r.type === 'entrance' ? via[0] : null;
    if (startHall && Z.get(startHall) === 'family' && via.length > 1) add('info', 'GUEST_VIA_FAMILY_ENTRANCE', `«${x.name}» تُبلغ من «${roomById.get(startHall).r.name}».`, [x.id, startHall]);
    const crossed = via.filter(id => id !== x.id && id !== startHall && Z.get(id) === 'family').map(id => roomById.get(id).r);
    const shared = via.filter(id => id !== x.id && Z.get(id) === 'shared').map(id => roomById.get(id).r);
    const len = x.actual?.reachable ? x.actual.toCenter : x.bare?.toCenter;
    if (crossed.length) add(x.zone === 'men' ? 'serious' : 'warn', 'GUEST_CROSSES_FAMILY', `مسار ${x.zone === 'men' ? 'الضيوف الرجال' : 'الضيفات'} من «${x.from}» إلى «${x.name}» (${len} م) يعبر منطقة العائلة: ${crossed.map(r => '«' + r.name + '»').join('، ')}.`, [x.id, ...crossed.map(r => r.id)]);
    else if (shared.length && x.zone === 'men') add('warn', 'GUEST_SHARED_HALL', `مسار الضيوف إلى «${x.name}» يمر بفراغ مشترك مع العائلة: ${shared.map(r => '«' + r.name + '»').join('، ')}.`, [x.id, ...shared.map(r => r.id)]);
  }

  // ---- الممرات المسدودة
  for (const L of model.levels) for (const r of L.rooms) {
    if (!['corridor', 'entrance'].includes(r.type) || r.area < 1.5) continue;
    const doors = L.openings.filter(o => o.door && (o.left?.id === r.id || o.right?.id === r.id));
    const G = grids.bare, ri = roomIndex.get(r.id); if (ri === undefined) continue;
    // أبعد نقطة في الممر عن أقرب باب فيه (مشيًا)
    const seeds = []; for (const o of doors) for (let s = -o.w / 2; s <= o.w / 2; s += G.c) { const i = G.idx(L.levelIndex, o.p.x + o.u.x * s, o.p.y + o.u.y * s); if (i >= 0 && G.walk[i]) seeds.push(i); }
    for (const st of doc.stairs || []) { const li = model.levels.findIndex(q => q.level.id === st.level); if (li === L.levelIndex || li + 1 === L.levelIndex) { const i = nearestWalk(G, L.levelIndex, { x: st.x, y: st.y }, 3); if (i >= 0 && G.room[i] === ri) seeds.push(i); } }
    const run = dijkstra(G, seeds); let far = 0, farP = null;
    for (let i = L.levelIndex * G.per; i < (L.levelIndex + 1) * G.per; i++) if (G.room[i] === ri && Number.isFinite(run.dist[i]) && run.dist[i] > far) { far = run.dist[i]; farP = G.P(i); }
    const narrow = r.eqWidth < 1.8;
    if (doors.length <= 1 && narrow && r.rect.l >= K.deadEnd) add(r.rect.l >= K.deadEndWarn ? 'warn' : 'info', 'DEAD_END', `الممر «${r.name}» (${L.level.name}) بباب واحد وطول ${r2(r.rect.l)} م: ممر مسدود.`, [r.id], { length: r2(r.rect.l) });
    else if (narrow && far > K.deadEnd) add(far > K.deadEndWarn ? 'warn' : 'info', 'DEAD_END_STUB', `في الممر «${r.name}» (${L.level.name}) امتداد ${r2(far)} م بعد آخر باب بلا مخرج (عند ${r2(farP.x)}، ${r2(farP.y)}).`, [r.id], { length: r2(far) });
  }

  // ---- الأبواب: العرض والخلوص
  const doors = [];
  for (const L of model.levels) for (const op of L.openings) {
    if (!op.door) continue;
    const blockers = ['door', 'door2'].includes(op.kind) ? swingBlockers(model, L, op) : [];
    const rec = { id: op.id, level: L.level.id, kind: op.kind, w: op.w, between: [op.left?.name || 'الخارج', op.right?.name || 'الخارج'], entry: !!op.o.entry, swingBlockedBy: blockers };
    doors.push(rec);
    if (op.w < K.doorMin - 1e-6 && op.kind !== 'garage') add('warn', 'DOOR_NARROW', `الباب ${op.id} بين ${rec.between.map(n => '«' + n + '»').join(' و')} عرضه ${r2(op.w)} م (< ${K.doorMin} م قيمة تصميمية).`, [op.id], { value: op.w });
    if (blockers.length) add('warn', 'DOOR_SWING', `فتح الباب ${op.id} بين ${rec.between.map(n => '«' + n + '»').join(' و')} يصطدم بـ ${blockers.map(b => b.kind + ' ' + b.id).join('، ')}.`, [op.id, ...blockers.map(b => b.id)]);
  }

  // ---- (الجولة الحادية عشرة) خلوص الأبواب نفسها:
  //  • دورة المياه: لا مرحاض ولا مغسلة ولا دش داخل منطقة فتح بابها (عرض الباب × عمقه من جهة الحمام) — WC_DOOR_CLASH
  //  • أي باب أو فتحة: لا قطعة أثاث (عدا السجاد) في المنطقة الحرة أمامه بعمق doorFront من الجهتين — FURNITURE_AT_DOOR
  //  • باب دورة مياه الضيوف (الرجال/النساء/الضيوف) ≥ guestWcDoorMin — GUEST_WC_DOOR
  const zoneRect = (op, inward, depth, shrink = 0.02) => { const hw = op.w / 2 - shrink, t = (op.wall.t ?? 0.2) / 2 + shrink; return [{ x: op.p.x + op.u.x * -hw + inward.x * t, y: op.p.y + op.u.y * -hw + inward.y * t }, { x: op.p.x + op.u.x * hw + inward.x * t, y: op.p.y + op.u.y * hw + inward.y * t }, { x: op.p.x + op.u.x * hw + inward.x * (t + depth), y: op.p.y + op.u.y * hw + inward.y * (t + depth) }, { x: op.p.x + op.u.x * -hw + inward.x * (t + depth), y: op.p.y + op.u.y * -hw + inward.y * (t + depth) }]; };
  const overlaps = (A, B) => { for (const P of [A, B]) for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ax = { x: -(b.y - a.y), y: b.x - a.x }; const pa = A.map(q => q.x * ax.x + q.y * ax.y), pb = B.map(q => q.x * ax.x + q.y * ax.y); if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= 1e-6) return false; } return true; };
  const FIX_AR = { wc: 'المرحاض', basin: 'المغسلة', shower: 'الدش', bathtub: 'حوض الاستحمام' };
  for (const L of model.levels) {
    const fx = (doc.fixtures || []).filter(f => f.level === L.level.id && !NOT_OBSTACLE.has(f.kind) && (f.h ?? 1) >= 0.1).map(f => ({ f, R: fixtureRect(f) }));
    for (const op of L.openings) {
      if (!op.door || op.kind === 'garage') continue;
      for (const sd of op.sides) {
        const inward = { x: -sd.outward.x, y: -sd.outward.y }, room = sd.room;
        if (room.type === 'bath' && ['door', 'door2'].includes(op.kind)) {
          const Z = zoneRect(op, inward, op.w), hit = fx.filter(x => FIXED_WET.has(x.f.kind) && overlaps(Z, x.R));
          if (hit.length) add('serious', 'WC_DOOR_CLASH', `${hit.map(x => FIX_AR[x.f.kind] + ' ' + x.f.id).join(' و')} داخل منطقة فتح باب «${room.name}» (${op.id}، عرضه ${r2(op.w)} م): الباب لا يُفتح كاملًا أو لا يبقى ممر للدخول.`, [op.id, ...hit.map(x => x.f.id)], { tier: 'functional' });
        }
        const Zf = zoneRect(op, inward, K.doorFront), hitF = fx.filter(x => !FIXED_WET.has(x.f.kind) && overlaps(Zf, x.R));
        if (hitF.length) add('serious', 'FURNITURE_AT_DOOR', `${hitF.map(x => `${x.f.kind} ${x.f.id}`).join(' و')} في المنطقة الحرة أمام ${op.kind === 'arch' ? 'فتحة' : 'باب'} ${op.id} من جهة «${room.name}» (عمق ${K.doorFront} م): الأثاث يسد المدخل.`, [op.id, ...hitF.map(x => x.f.id)], { tier: 'mizan-default' });
      }
      const wcSide = op.sides.find(sd => sd.room.type === 'bath' && /الضيوف|الرجال|النساء/.test(sd.room.name || ''));
      if (wcSide && K.guestWcDoorMin && op.w < K.guestWcDoorMin - 1e-6) add('serious', 'GUEST_WC_DOOR', `باب «${wcSide.room.name}» (${op.id}) عرضه ${r2(op.w)} م، أقل من ${K.guestWcDoorMin} م (قيمة تصميمية افتراضية للميزان لباب دورة مياه الضيوف).`, [op.id], { tier: 'mizan-default', value: op.w });
    }
  }

  const rank = { serious: 3, warn: 2, info: 1 };
  findings.sort((a, b) => rank[b.severity] - rank[a.severity]);
  const counts = { serious: 0, warn: 0, info: 0 }; for (const f of findings) counts[f.severity]++;
  return { note: CIRC_NOTE, limits: K, entrances: ents.map(e => ({ opening: e.via, room: e.name, zone: e.zone, role: e === famEnt ? 'main' : e === guestEnt ? 'guest' : 'other' })), rooms, doors, findings, counts,
    _grid: grids.furn };
}

/** نسخة قابلة للحفظ (بلا خلايا الشبكة). */
export const serializable = rep => ({ ...rep, _grid: undefined, rooms: rep.rooms.map(({ _cells, _via, _bareCells, _bareVia, _prefOk, ...x }) => x) });


/**
 * (الجولة الحادية عشرة) بوابة الحركة الفعلية لـ plan-review: تشغيل circulationProof بحدود البوابة (CIRC_GATE_LIMITS)
 * وتصنيف النتائج إلى رسوب (ما يمنع المشي فعلًا أو يصطدم بالأبواب) وملاحظات. لكل رسوب طبقته: منطق وظيفي أو قيمة افتراضية للميزان.
 */
export const CIRC_GATE_FAIL = Object.freeze({
  NO_ENTRANCE: 'functional', UNREACHABLE: 'functional', NO_WALKABLE_PATH: 'functional', STAIR_ACCESS: 'functional', STAIR_ARRIVAL: 'functional', STAIR_ARRIVAL_BLOCKED: 'functional',
  THROUGH_PRIVATE: 'functional', GUEST_CROSSES_FAMILY: 'mizan-default', GUEST_NO_OWN_ENTRY: 'mizan-default',
  BLOCKED_BY_FURNITURE: 'mizan-default', WC_DOOR_CLASH: 'functional', FURNITURE_AT_DOOR: 'mizan-default', GUEST_WC_DOOR: 'mizan-default',
});
export function circulationGate(doc, limits = {}) {
  const rep = circulationProof(doc, { limits: { ...CIRC_GATE_LIMITS, ...limits } });
  const fails = rep.findings.filter(f => CIRC_GATE_FAIL[f.code] && (f.severity === 'serious' || f.code === 'BLOCKED_BY_FURNITURE')).map(f => ({ code: f.code, tier: f.tier || CIRC_GATE_FAIL[f.code], message: f.message, elements: f.elements }));
  const notes = rep.findings.filter(f => f.severity === 'warn' && !fails.some(x => x.message === f.message)).map(f => ({ code: f.code, message: f.message }));
  return { ok: !fails.length, fails, notes, counts: rep.counts, limits: rep.limits };
}
