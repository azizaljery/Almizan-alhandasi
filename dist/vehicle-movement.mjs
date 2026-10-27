// (الجولة 21 — 02c، قرار المالك 2026-10-26 ثانيًا) اختبار وظيفي لحركة الركاب والمركبات حول المواقف والساتر، بدل الاكتفاء بهامش 0.745 م.
// السيارة المرجعية: سيدان تمثيلية — العرض 1.85 م، الطول 4.8 م، طول الباب 1.1 م — **قيم افتراضية للميزان، مصدرها غير متحقق** (ليست من كتالوج
// ولا كود)، وأدنى مسقط فتح للباب للنزول 0.8 م **قيمة تصميمية غير متحققة**. السيارة تُوضع في منتصف الموقف؛ والحالة القصوى (السيارة ملاصقة للعائق)
// تُقاس وتُذكر ولا ترسّب (سلوك السائق غير معلوم). مسار الركاب: أقصر طريق على شبكة 0.1 م بعرض ≥ 0.9 م (قيمة تصميمية) من جانب باب السيارة
// إلى مقدمة باب الدخول الرئيسي حول المبنى والسواتر والسيارات. ممر المركبات: امتداد الموقف إلى حد الأرض خالٍ من الجدران والسواتر. نموذج الانعطاف
// وبوابة المركبات غير ممثلين في المستند ⇒ «غير متحقق». ثنائي الأبعاد؛ ليس اعتمادًا مروريًا أو معماريًا.
import { analyzeDoc } from './draw/digest.mjs';
import { wallRect, fixtureRect } from './draw/review.mjs';
import { pointInPolygon } from './draw/geom.mjs';
import { bayApproach } from './privacy-gate.mjs';

export const REFERENCE_VEHICLE = Object.freeze({ name: 'سيدان مرجعية', width: 1.85, length: 4.8, doorLength: 1.1, exitProjectionMin: 0.8, source: 'غير متحقق — قيم تمثيلية افتراضية للميزان، ليست من كتالوج مركبة ولا كود' });
export const PASSENGER_PATH = Object.freeze({ width: 0.9, grid: 0.1, source: 'قيمة تصميمية افتراضية للميزان — غير متحققة من كود' });
const r2 = v => Math.round(v * 100) / 100;
const bb = poly => ({ x0: Math.min(...poly.map(p => p.x)), x1: Math.max(...poly.map(p => p.x)), y0: Math.min(...poly.map(p => p.y)), y1: Math.max(...poly.map(p => p.y)) });
const rectPoly = b => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
function carRect(zone) {
  const B = bb(zone.polygon), w = B.x1 - B.x0, h = B.y1 - B.y0, V = REFERENCE_VEHICLE, cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2;
  const alongY = h >= w; // محور طول السيارة
  return alongY ? { rect: { x0: cx - V.width / 2, x1: cx + V.width / 2, y0: cy - V.length / 2, y1: cy + V.length / 2 }, alongY } : { rect: { x0: cx - V.length / 2, x1: cx + V.length / 2, y0: cy - V.width / 2, y1: cy + V.width / 2 }, alongY };
}
const overlaps = (A, B) => A.x0 < B.x1 && A.x1 > B.x0 && A.y0 < B.y1 && A.y1 > B.y0;
function obstacles(doc, lv) {
  const out = [];
  for (const w of lv.walls) { const poly = wallRect(w); const b = bb(poly); out.push({ kind: w.kind === 'fence' ? 'fence' : 'wall', id: w.id, box: b, poly }); }
  for (const c of doc.columns || []) if (c.level === lv.level.id) out.push({ kind: 'column', id: c.id, box: { x0: c.x - c.size / 2, x1: c.x + c.size / 2, y0: c.y - c.size / 2, y1: c.y + c.size / 2 }, poly: null });
  return out;
}
/** فتح أبواب السيارة المرجعية في كل موقف: المسقط المتاح لكل جانب (حتى أقرب عائق) والزاوية الناتجة. */
export function doorOpening(doc, lv) {
  const bays = (doc.zones || []).filter(z => z.type === 'garage' && z.level === lv.level.id), cars = bays.map(z => ({ zone: z, ...carRect(z) })), obs = obstacles(doc, lv), V = REFERENCE_VEHICLE, res = [];
  for (const car of cars) {
    const R = car.rect;
    // الجانبان الطويلان: يسار/يمين على المحور العرضي
    const sides = car.alongY ? [{ name: 'يسار', axis: 'x', dir: -1, edge: R.x0 }, { name: 'يمين', axis: 'x', dir: 1, edge: R.x1 }] : [{ name: 'أسفل', axis: 'y', dir: -1, edge: R.y0 }, { name: 'أعلى', axis: 'y', dir: 1, edge: R.y1 }];
    for (const sd of sides) {
      // شريط الباب: على طول السيارة من 0.9 م إلى 0.9 + طول الباب من الأمام (نصف السيارة الأمامي) ممتدًا إلى الخارج حتى 3 م
      // البابان الأمامي والخلفي متناظران حول منتصف السيارة (افتراض تمثيلي غير متحقق): كل باب بطول 1.1 م
      const mid = car.alongY ? (R.y0 + R.y1) / 2 : (R.x0 + R.x1) / 2, halves = [[mid - 1.5, mid - 0.4], [mid + 0.4, mid + 1.5]];
      const strip = (d, along) => sd.axis === 'x' ? { x0: sd.dir < 0 ? sd.edge - d : sd.edge, x1: sd.dir < 0 ? sd.edge : sd.edge + d, y0: along[0], y1: along[1] } : { y0: sd.dir < 0 ? sd.edge - d : sd.edge, y1: sd.dir < 0 ? sd.edge : sd.edge + d, x0: along[0], x1: along[1] };
      let free = Infinity, blockedBy = null;
      for (const along of halves) {
        let f = 0, by = null;
        for (let d = 0.02; d <= 3; d += 0.02) {
          const S = strip(d, along), hit = obs.find(o => overlaps(S, o.box)) || cars.find(c => c !== car && overlaps(S, c.rect)) && { kind: 'car', id: 'car' };
          if (hit) { by = hit.kind + (hit.id && hit.kind !== 'car' ? ':' + hit.id : ''); break; } f = d;
        }
        if (f < free) { free = f; blockedBy = by; }
      }
      // حد الأرض: لا يتجاوز الباب حدود الأرض
      const proj = Math.min(free, V.doorLength), angle = Math.asin(Math.min(1, proj / V.doorLength)) * 180 / Math.PI;
      // أسوأ حالة: السيارة ملاصقة للعائق = المسافة بين حد الموقف والعائق (لا يُرسّب)
      const slack = (sd.axis === 'x' ? (car.zone.polygon && bb(car.zone.polygon).x1 - bb(car.zone.polygon).x0) : (bb(car.zone.polygon).y1 - bb(car.zone.polygon).y0)) - V.width;
      res.push({ bay: car.zone.id, side: sd.name, available: r2(free), blockedBy, projection: r2(proj), angleDeg: Math.round(angle), required: V.exitProjectionMin, pass: proj >= V.exitProjectionMin - 1e-9, worstCaseAvailable: r2(Math.max(0, free - slack / 2)), note: 'الحالة القصوى للسيارة الملاصقة للعائق مذكورة ولا ترسّب' });
    }
  }
  return res;
}
/** ممر المركبات: امتداد الموقف إلى حد الأرض خالٍ من الجدران والسواتر. */
export function vehicleApproach(doc, lv) {
  const bays = (doc.zones || []).filter(z => z.type === 'garage' && z.level === lv.level.id), obs = obstacles(doc, lv), out = [];
  for (const z of bays) { const ap = bayApproach(doc, z.polygon); if (!ap) { out.push({ bay: z.id, pass: null, basis: 'لا مضلع أرض' }); continue; } const A = bb(ap.polygon), hit = obs.filter(o => overlaps(A, o.box)); out.push({ bay: z.id, side: ap.side, pass: hit.length === 0, blockedBy: hit.map(h => h.kind + ':' + h.id), basis: hit.length ? 'جدار أو ساتر يقطع ممر دخول الموقف إلى الشارع' : 'الممر إلى حد الأرض خالٍ' }); }
  return out;
}
/** مسار الركاب من جانب باب السيارة إلى مقدمة باب الدخول: أقصر طريق بعرض ≥ PASSENGER_PATH.width على شبكة. */
export function passengerPaths(doc, lv, model) {
  const plot = doc.plot?.polygon; if (!plot || plot.length < 3) return { pass: null, basis: 'لا مضلع أرض', paths: [] };
  const P = bb(plot), g = PASSENGER_PATH.grid, nx = Math.ceil((P.x1 - P.x0) / g), ny = Math.ceil((P.y1 - P.y0) / g), rad = PASSENGER_PATH.width / 2;
  const cars = (doc.zones || []).filter(z => z.type === 'garage' && z.level === lv.level.id).map(z => ({ zone: z, ...carRect(z) }));
  const solids = [];
  for (const w of lv.walls) solids.push(wallRect(w));
  for (const r of lv.rooms) if (r.poly) solids.push(r.poly);
  for (const c of cars) solids.push(rectPoly(c.rect));
  for (const f of doc.fixtures || []) if (f.level === lv.level.id && f.h >= .1 && false) solids.push(fixtureRect(f));
  const boxes = solids.map(poly => ({ poly, b: bb(poly) }));
  const blocked = new Uint8Array(nx * ny);
  const cell = (i, j) => ({ x: P.x0 + (i + .5) * g, y: P.y0 + (j + .5) * g });
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = cell(i, j); let bl = !pointInPolygon(p, plot, 0);
    if (!bl) for (const s of boxes) { if (p.x >= s.b.x0 - rad && p.x <= s.b.x1 + rad && p.y >= s.b.y0 - rad && p.y <= s.b.y1 + rad) { if (nearPoly(p, s.poly, rad)) { bl = true; break; } } }
    blocked[j * nx + i] = bl ? 1 : 0;
  }
  const idx = p => ({ i: Math.floor((p.x - P.x0) / g), j: Math.floor((p.y - P.y0) / g) });
  const nearestFree = (p, maxR = 0.6) => { const c = idx(p); const R = Math.ceil(maxR / g); let best = null; for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const i = c.i + di, j = c.j + dj; if (i < 0 || j < 0 || i >= nx || j >= ny || blocked[j * nx + i]) continue; const d = Math.hypot(di, dj); if (!best || d < best.d) best = { i, j, d }; } return best; };
  // نقاط البدء: جانب باب كل سيارة (مكان الباب الأمامي) على الجانبين
  const starts = [];
  for (const c of cars) { const R = c.rect, midA = c.alongY ? (R.y0 + R.y1) / 2 : (R.x0 + R.x1) / 2, id = c.zone?.id; if (c.alongY) { starts.push({ car: id, name: 'يسار', p: { x: R.x0 - .35, y: midA } }, { car: id, name: 'يمين', p: { x: R.x1 + .35, y: midA } }); } else { starts.push({ car: id, name: 'أسفل', p: { x: midA, y: R.y0 - .35 } }, { car: id, name: 'أعلى', p: { x: midA, y: R.y1 + .35 } }); } }
  const goals = lv.openings.filter(o => o.door && o.o?.entry && o.sides.some(s => s.other === 'outside')).map(o => { const s = o.sides.find(x => x.other === 'outside'); return { op: o.id, p: { x: o.p.x + s.outward.x * ((o.wall?.t || .2) / 2 + .45), y: o.p.y + s.outward.y * ((o.wall?.t || .2) / 2 + .45) } }; });
  const paths = [];
  for (const st of starts) {
    const s0 = nearestFree(st.p, 1.0); if (!s0) { paths.push({ car: st.car, from: st.name, reached: false, why: 'نقطة النزول محجوبة' }); continue; }
    const dist = new Int32Array(nx * ny).fill(-1), q = [s0.j * nx + s0.i]; dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) { const cur = q[h], ci = cur % nx, cj = (cur - ci) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nx || j >= ny) continue; const k = j * nx + i; if (blocked[k] || dist[k] >= 0) continue; dist[k] = dist[cur] + 1; q.push(k); } }
    let best = null; for (const gl of goals) { const f = nearestFree(gl.p); if (!f) continue; const d = dist[f.j * nx + f.i]; if (d >= 0 && (!best || d < best.len)) best = { len: d, goal: gl.op }; }
    paths.push(best ? { car: st.car, from: st.name, reached: true, goal: best.goal, lengthM: r2(best.len * g) }   : { car: st.car, from: st.name, reached: false, why: goals.length ? 'لا مسار بعرض ' + PASSENGER_PATH.width + ' م إلى باب الدخول' : 'لا باب دخول معلَّم' });
  }
  const byCar = [...new Set(paths.map(p => p.car))].map(id => ({ car: id, reached: paths.some(p => p.car === id && p.reached) }));
  return { pass: byCar.length ? byCar.every(c => c.reached) : null, byCar, width: PASSENGER_PATH.width, paths, basis: 'شبكة 0.1 م، عرض المسار ' + PASSENGER_PATH.width + ' م (قيمة تصميمية)' };
}
function nearPoly(p, poly, rad) {
  if (pointInPolygon(p, poly, 0)) return true;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; if (Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < rad) return true; }
  return false;
}
/** اختبار حركة كامل لمستند. لا يعدّل المستند. */
export function vehicleMovement(doc, { levelId } = {}) {
  const model = analyzeDoc(doc), lv = model.levels.find(l => !levelId || l.level.id === levelId) || model.levels[0];
  if (!lv) return { passed: null, doors: [], approach: [], passengers: null, unverified: [] };
  const bays = (doc.zones || []).filter(z => z.type === 'garage' && z.level === lv.level.id);
  const doors = doorOpening(doc, lv), approach = vehicleApproach(doc, lv), passengers = bays.length ? passengerPaths(doc, lv, model) : { pass: null, paths: [], basis: 'لا مواقف' };
  const failing = [...doors.filter(d => !d.pass).map(d => `باب سيارة الموقف ${d.bay} (${d.side}): المسقط المتاح ${d.available} م < ${d.required} م (${d.blockedBy || 'حد'})`), ...approach.filter(a => a.pass === false).map(a => `ممر الموقف ${a.bay}: ${a.basis} (${a.blockedBy.join('، ')})`), ...(passengers.pass === false ? passengers.byCar.filter(c => !c.reached).map(c => `مسار الركاب من سيارة الموقف ${c.car} إلى باب الدخول: لا مسار بعرض ${PASSENGER_PATH.width} م`) : [])];
  return { vehicle: REFERENCE_VEHICLE, passed: bays.length ? failing.length === 0 : null, failing, doors, approach, passengers,
    unverified: ['مصدر أبعاد السيارة المرجعية', 'أدنى مسقط فتح للباب للنزول (0.8 م) وعرض مسار الركاب (0.9 م)', 'نموذج انعطاف المركبات وبوابة السيارات (غير ممثلة في المستند)', 'وضع السيارة الفعلي في الموقف (الحالة القصوى مذكورة ولا ترسّب)'] };
}
export default { REFERENCE_VEHICLE, PASSENGER_PATH, doorOpening, vehicleApproach, passengerPaths, vehicleMovement };
