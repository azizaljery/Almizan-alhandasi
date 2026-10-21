// هندسة السلم (الجولة العاشرة): قاعدة واحدة يستعملها المولّد (اختيار نوع السلم وموضعه داخل غرفته) والمراجع المستقل
// (بوابة STAIR_GEOMETRY في dist/plan-review.mjs) والرسم ثنائي الأبعاد والمجسّم (كلاهما من stairLayout في dist/draw/stairs3d.mjs).
//
//  - عدد القوائم من ارتفاع الدور الفعلي في المستند (فرق منسوبي الدورين، أو ارتفاع الدور، أو 3.3 م افتراضيًا معلنًا):
//    N = ⌈الارتفاع ÷ 0.18⌉، والنائمة ≥ 0.28 م، وعرض القلبة ≥ 1.0 م، والبسطة بعمق لا يقل عن عرض القلبة.
//  - النوع (مستقيم / L / U) يُختار مما يتسع فعلًا في غرفة السلم، ويُرسم ويُبنى كما هو.
//  - الوصول: أمام أول قائمة في الدور الأسفل، وبعد آخر قائمة في الدور الأعلى، ممر حر ≥ 0.9 م إلى باب أو فتحة غرفة السلم
//    (لا على فراغ مزدوج الارتفاع ولا خلف جدار)، وفتحة السلم في الدور الأعلى داخل غرفة السلم العلوية نفسها.
//
// كل الأرقام هنا «قيمة تصميمية افتراضية للميزان» غير متحققة نظاميًا: لم يُطابَق نص كود البناء السعودي (SBC) يدويًا بعد.
// إن ذكر العميل عرض الدرج نصًا فطلبه هو الحاكم (stairClientRules) والحد الافتراضي يصير ملاحظة لا رفضًا.
import { stairLayout, MAX_RISER } from './draw/stairs3d.mjs';
import { pointInPolygon, closestOnSegment, centroid, dist, dot, sub } from './draw/geom.mjs';

export const STAIR_GEOMETRY_VERSION = 'stair-geometry/1.1.0';
export const MIZAN_DEFAULT_AR = 'قيمة تصميمية افتراضية للميزان';
export const UNVERIFIED_AR = 'قيمة تصميمية غير متحققة نظاميًا';
const SRC = `${MIZAN_DEFAULT_AR} — ${UNVERIFIED_AR}؛ لم يُطابَق نص كود البناء السعودي يدويًا`;
/** حدود السلم: كل قيمة بطبقتها (mizan-default) ومصدرها. */
export const STAIR_RULES = Object.freeze({
  riserMax: { value: MAX_RISER, tier: 'mizan-default', label: MIZAN_DEFAULT_AR, source: SRC + ' (أعلى قائمة)', verified: false },
  treadMin: { value: 0.28, tier: 'mizan-default', label: MIZAN_DEFAULT_AR, source: SRC + ' (أقل نائمة)', verified: false },
  widthMin: { value: 1.0, tier: 'mizan-default', label: MIZAN_DEFAULT_AR, source: SRC + ' (أقل عرض صافٍ للقلبة)', verified: false },
  landingMin: { value: 'عرض القلبة', tier: 'mizan-default', label: MIZAN_DEFAULT_AR, source: SRC + ' (عمق البسطة ≥ عرض القلبة)', verified: false },
  passMin: { value: 0.9, tier: 'mizan-default', label: MIZAN_DEFAULT_AR, source: SRC + ' (ممر حر أمام أول قائمة وبعد آخرها؛ مثل أدنى عرض للممرات في MIN_WIDTH)', verified: false },
  floorDefault: { value: 3.3, tier: 'mizan-default', label: MIZAN_DEFAULT_AR, source: 'ارتفاع دور افتراضي حين لا منسوب للدور الأعلى في المستند', verified: false },
});
const TOL = 0.03, r2 = v => Math.round(v * 100) / 100;

/** عرض الدرج كما كتبه العميل («درج عرض 1.2 م» / «عرض الدرج 90 سم»)، أو null. */
export function stairClientRules(text = '') {
  const t = String(text || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫,]/g, '.');
  const m = t.match(/(?:درج|سلم|الدرج|السلم)[^.،؛\n]{0,20}?عرض[هه]?\s*([\d.]+)\s*(سم|م|متر)?/) || t.match(/عرض\s*(?:ال)?(?:درج|سلم)\s*([\d.]+)\s*(سم|م|متر)?/);
  if (!m) return null;
  let v = parseFloat(m[1]); if (!Number.isFinite(v) || v <= 0) return null;
  if (m[2] === 'سم' || v > 10) v /= 100;
  return { widthMin: { value: r2(v), tier: 'client', label: 'طلب العميل', source: `نص العميل: «${m[0].trim()}»` } };
}

/** الارتفاع بين الدور ودور فوقه من المستند (مع مصدره). */
export function riseOf(levels, i) {
  const L = levels[i], U = levels[i + 1];
  const byElev = U && Number.isFinite(U.elevation) && Number.isFinite(L.elevation) ? U.elevation - L.elevation : NaN;
  if (byElev > 0.5) return { rise: byElev, source: 'فرق منسوبي الدورين في المستند' };
  if (Number.isFinite(L.height) && L.height > 0.5) return { rise: L.height, source: 'ارتفاع الدور في المستند' };
  return { rise: STAIR_RULES.floorDefault.value, source: `افتراضي ${STAIR_RULES.floorDefault.value} م (${MIZAN_DEFAULT_AR})` };
}
/** أقل عدد قوائم لا تعلو فيه القائمة عن الحد. */
export const risersFor = rise => Math.max(3, Math.ceil(rise / STAIR_RULES.riserMax.value - 1e-9));

const edgeLens = poly => poly.map((p, i) => dist(p, poly[(i + 1) % poly.length]));
/** قياس سلم كما يُرسم ويُبنى: القائمة، وأقل نائمة، وأقل عرض قلبة، وعمق البسطة، والبصمة، والفتحة، ونقطتا البدء والوصول. */
export function measureStair(stair, rise) {
  const lay = stairLayout(stair, rise);
  const treads = lay.steps.filter(s => s.type === 'tread'), landings = lay.steps.filter(s => s.type === 'landing');
  const tread = treads.length ? Math.min(...treads.map(s => Math.min(...edgeLens(s.poly)))) : 0;
  const width = treads.length ? Math.min(...treads.map(s => Math.max(...edgeLens(s.poly)))) : 0;
  const landing = landings.length ? Math.min(...landings.map(s => Math.min(...edgeLens(s.poly)))) : null;
  const first = lay.flights[0], last = lay.flights[lay.flights.length - 1];
  const dirOf = fl => { const da = fl.a1 - fl.a0, db = fl.b1 - fl.b0, l = Math.hypot(da, db) || 1; return { a: da / l, b: db / l }; };
  const d0 = dirOf(first), d1 = dirOf(last), P = STAIR_RULES.passMin.value / 2 + 0.05;
  const start = lay.toWorld(first.a0 - d0.a * P, first.b0 - d0.b * P), arrival = lay.toWorld(last.a1 + d1.a * P, last.b1 + d1.b * P);
  const pts = lay.steps.flatMap(s => s.poly);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { kind: lay.kind, N: lay.N, riser: lay.riser, tread, width, landing, steps: lay.steps, hole: lay.hole, start, arrival, flights: lay.flights.length,
    box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }, layout: lay };
}
/** مخالفات أبعاد السلم نفسه (القائمة، النائمة، العرض، البسطة). rules: STAIR_RULES مع ما طلبه العميل. */
export function dimensionProblems(m, rules = STAIR_RULES) {
  const out = [];
  if (m.riser > rules.riserMax.value + 1e-6) out.push(`القائمة ${r2(m.riser * 100)} سم أعلى من ${r2(rules.riserMax.value * 100)} سم`);
  if (m.tread < rules.treadMin.value - 1e-3) out.push(`النائمة ${r2(m.tread * 100)} سم أقل من ${r2(rules.treadMin.value * 100)} سم`);
  if (m.width < rules.widthMin.value - 1e-3) out.push(`عرض القلبة ${r2(m.width)} م أقل من ${rules.widthMin.value} م`);
  if (m.landing !== null && m.landing < m.width - 1e-3) out.push(`عمق البسطة ${r2(m.landing)} م أقل من عرض القلبة ${r2(m.width)} م`);
  return out;
}
/** الأنواع التي تتسع في غرفة صافية a×b (بالحدود الافتراضية): [{kind, need:[طول, عرض]}]. */
export function fitTypes(a, b, rise, rules = STAIR_RULES) {
  const N = risersFor(rise), t = rules.treadMin.value, w = Math.max(rules.widthMin.value, 0.9), out = [];
  const fits = (p, q) => (p <= a + TOL && q <= b + TOL) || (p <= b + TOL && q <= a + TOL);
  const sL = (N - 1) * t; if (fits(sL, w)) out.push({ kind: 'straight', need: [r2(sL), r2(w)] });
  const n1 = Math.ceil((N - 2) / 2), uL = n1 * t + w, uW = 2 * w + 0.1; if (fits(uL, uW)) out.push({ kind: 'U', need: [r2(uL), r2(uW)] });
  for (let k = 1; k <= N - 3; k++) { const p = k * t + w, q = w + (N - 2 - k) * t; if (fits(p, q)) { out.push({ kind: 'L', need: [r2(p), r2(q)] }); break; } }
  return out;
}

// ------------------------------------------------------------------------------------------ الممر الحر (شبكة)
function distToPoly(p, poly) { let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, closestOnSegment(p, poly[i], poly[(i + 1) % poly.length]).dist); return d; }
/**
 * هل يصل ممر حر بعرض pass من نقطة p داخل الغرفة (المضلع room) إلى إحدى الفتحات (targets: مقاطع على جدرانها)
 * متجنبًا العوائق (مضلعات)؟ شبكة 0.1 م؛ الخلية حرة إن بعدت عن حدود الغرفة والعوائق بنصف الممر.
 */
export function freePath(room, obstacles, p, targets, pass = STAIR_RULES.passMin.value) {
  const h = 0.1, c = pass / 2 - h / 2; // شبكة 0.1 م: نصف خلية سماحية قياس
  const xs = room.map(q => q.x), ys = room.map(q => q.y), x0 = Math.min(...xs), y0 = Math.min(...ys);
  const nx = Math.max(1, Math.ceil((Math.max(...xs) - x0) / h)), ny = Math.max(1, Math.ceil((Math.max(...ys) - y0) / h));
  const free = q => pointInPolygon(q, room) && distToPoly(q, room) >= c && obstacles.every(o => !pointInPolygon(q, o) && distToPoly(q, o) >= c);
  if (!free(p)) return { ok: false, why: 'start' };
  const cell = (i, j) => ({ x: x0 + (i + .5) * h, y: y0 + (j + .5) * h });
  const isT = q => targets.some(t => closestOnSegment(q, t.a, t.b).dist <= c + (t.t || 0.2) / 2 + 0.12);
  if (isT(p)) return { ok: true };
  const seen = new Uint8Array(nx * ny), state = new Int8Array(nx * ny).fill(-1); // -1 لم يُحسب، 0 مغلق، 1 حر
  const ok = (i, j) => { const k = j * nx + i; if (state[k] < 0) state[k] = free(cell(i, j)) ? 1 : 0; return state[k] === 1; };
  const si = Math.min(nx - 1, Math.max(0, Math.floor((p.x - x0) / h))), sj = Math.min(ny - 1, Math.max(0, Math.floor((p.y - y0) / h)));
  const q = [];
  // البدء من خلايا الجوار الحرة القريبة من p (p نفسها حرة)
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const i = si + di, j = sj + dj; if (i < 0 || j < 0 || i >= nx || j >= ny) continue; if (ok(i, j) && dist(cell(i, j), p) <= 0.25) { seen[j * nx + i] = 1; q.push(i, j); } }
  while (q.length) {
    const j = q.pop(), i = q.pop();
    if (isT(cell(i, j))) return { ok: true };
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const k = b * nx + a; if (seen[k] || !ok(a, b)) continue; seen[k] = 1; q.push(a, b); }
  }
  return { ok: false, why: 'path' };
}

/**
 * مكوّنات الأرضية الحرة (ممر ≥ pass) في الغرفة بعد العوائق: يعيد لكل فتحة رقم المكوّن الذي يلامسها (أو -1)، ومكوّن النقطة p.
 * يكشف سلمًا يقطع الطريق بين بابين للغرفة نفسها (مسار العائلة يمر بغرفة السلم).
 */
export function freeComponents(room, obstacles, targets, p = null, pass = STAIR_RULES.passMin.value) {
  const h = 0.1, c = pass / 2 - h / 2; // شبكة 0.1 م: نصف خلية سماحية قياس
  const xs = room.map(q => q.x), ys = room.map(q => q.y), x0 = Math.min(...xs), y0 = Math.min(...ys);
  const nx = Math.max(1, Math.ceil((Math.max(...xs) - x0) / h)), ny = Math.max(1, Math.ceil((Math.max(...ys) - y0) / h));
  const cell = (i, j) => ({ x: x0 + (i + .5) * h, y: y0 + (j + .5) * h });
  const free = q => pointInPolygon(q, room) && distToPoly(q, room) >= c && obstacles.every(o => !pointInPolygon(q, o) && distToPoly(q, o) >= c);
  const comp = new Int32Array(nx * ny).fill(-2); // -2 لم يُحسب، -1 مغلق
  for (let k = 0; k < nx * ny; k++) comp[k] = free(cell(k % nx, Math.floor(k / nx))) ? -3 : -1;
  let n = 0;
  for (let k = 0; k < nx * ny; k++) {
    if (comp[k] !== -3) continue;
    const st = [k]; comp[k] = n;
    while (st.length) { const a = st.pop(), i = a % nx, j = (a - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const u = i + di, v = j + dj; if (u < 0 || v < 0 || u >= nx || v >= ny) continue; const b = v * nx + u; if (comp[b] === -3) { comp[b] = n; st.push(b); } } }
    n++;
  }
  const touch = t => { const s = new Set(); for (let k = 0; k < nx * ny; k++) if (comp[k] >= 0 && closestOnSegment(cell(k % nx, Math.floor(k / nx)), t.a, t.b).dist <= c + (t.t || 0.2) / 2 + 0.12) s.add(comp[k]); return s; };
  const tc = targets.map(touch);
  let pc = -1;
  if (p) { let best = Infinity; for (let k = 0; k < nx * ny; k++) if (comp[k] >= 0) { const d = dist(cell(k % nx, Math.floor(k / nx)), p); if (d < best && d <= 0.25) { best = d; pc = comp[k]; } } }
  return { targets: tc, start: pc };
}
/** هل تتصل كل فتحات الغرفة (ونقطة البدء إن وُجدت) بمكوّن حر واحد؟ يعيد الفتحات المعزولة. */
function cutOff(room, obstacles, targets, p, pass) {
  if (targets.length < (p ? 1 : 2)) return [];
  const { targets: tc, start } = freeComponents(room, obstacles, targets, p, pass);
  const ref = p ? start : [...tc[0]][0];
  if (ref === undefined || ref < 0) return targets.map(t => t);
  return targets.filter((t, i) => !tc[i].has(ref));
}

// ------------------------------------------------------------------------------------------ الفحص على المستند
const shrinkIn = (pts, poly) => { const c = centroid(poly); return pts.every(p => { const d = sub(c, p), l = Math.hypot(d.x, d.y) || 1; return pointInPolygon({ x: p.x + d.x / l * TOL, y: p.y + d.y / l * TOL }, poly); }); };
const isVoid = r => r?.type === 'void';
/** فتحات (أبواب وفتحات مفتوحة) غرفة إلى غير الفراغ المزدوج، كمقاطع. allow(other) يقرر الطرف المقبول. */
function roomTargets(lv, room, allow = () => true) {
  const out = [];
  for (const op of lv.openings) {
    if (!op.door) continue;
    const mine = op.sides.find(s => s.room.id === room.id); if (!mine) continue;
    const other = mine.other === 'outside' ? null : lv.roomsById.get(mine.other);
    if (isVoid(other) || !allow(other)) continue;
    const half = op.w / 2;
    out.push({ a: { x: op.p.x - op.u.x * half, y: op.p.y - op.u.y * half }, b: { x: op.p.x + op.u.x * half, y: op.p.y + op.u.y * half }, t: op.wall.t, op, other });
  }
  return out;
}
/** نقطة p خارج الغرفة room: هل تصل إليها عبر فتحة في جدار room تقابل p (الخط من p إلى الغرفة يمر داخل عرض الفتحة)؟ */
function crossesOpening(targets, p) {
  return targets.some(t => { const u = sub(t.b, t.a), L = Math.hypot(u.x, u.y) || 1, s = dot(sub(p, t.a), { x: u.x / L, y: u.y / L }); return s >= 0.25 && s <= L - 0.25; });
}
/**
 * فحص سلم واحد في المستند (model من analyzeDoc): يعيد { ok, problems[], value }.
 * li: فهرس دور السلم. rules: STAIR_RULES بعد ما طلبه العميل. ground reach: الفتحات المقبولة في الأسفل نحو غرف موصولة.
 */
export function checkStair(model, stair, li, rules = STAIR_RULES) {
  const lv = model.levels[li], up = model.levels[li + 1], problems = [];
  const { rise, source: riseSource } = riseOf(model.doc.levels, li);
  let m; try { m = measureStair(stair, rise); } catch (e) { return { ok: false, problems: [`تعذّر قياس السلم: ${e.message}`], value: null }; }
  problems.push(...dimensionProblems(m, rules));
  const value = { kind: m.kind, risers: m.N, riser: r2(m.riser), tread: r2(m.tread), width: r2(m.width), landing: m.landing === null ? null : r2(m.landing), rise: r2(rise), riseSource };
  // غرفة السلم: الغرفة التي فيها مركز البصمة؛ البصمة كلها داخلها
  const allPts = m.steps.flatMap(s => s.poly), mid = { x: (m.box.x0 + m.box.x1) / 2, y: (m.box.y0 + m.box.y1) / 2 };
  const S = lv.roomAt(mid);
  if (!S) return { ok: false, problems: [...problems, 'السلم لا يقع داخل فراغ مغلق'], value };
  value.room = S.name; value.roomSize = [r2(S.rect.w), r2(S.rect.l)];
  const types = fitTypes(S.rect.w, S.rect.l, rise, rules); value.fits = types.map(t => t.kind);
  if (!types.length) problems.push(`غرفة السلم «${S.name}» ${r2(S.rect.w)}×${r2(S.rect.l)} م لا يتسع فيها سلم مستقيم ولا L ولا U بقائمة ≤ ${rules.riserMax.value * 100} سم ونائمة ≥ ${rules.treadMin.value * 100} سم وعرض ≥ ${rules.widthMin.value} م`);
  if (!shrinkIn(allPts, S.net)) problems.push(`السلم (${m.kind}) لا يتسع داخل «${S.name}» ${r2(S.rect.w)}×${r2(S.rect.l)} م (يخرج من جدرانها)`);
  // الوصول في الدور الأسفل: أمام أول قائمة ممر حر إلى فتحة نحو غرفة موصولة من المدخل
  const steps = m.steps.map(s => s.poly);
  const reachOk = other => !other || lv.reach.has(other.id);
  const tg = roomTargets(lv, S, reachOk);
  const Bs = lv.roomAt(m.start);
  if (!Bs || isVoid(Bs)) problems.push('لا أرضية أمام أول قائمة (البدء خارج المبنى أو على فراغ)');
  else if (Bs.id === S.id) { const fp = freePath(S.net, steps, m.start, tg, rules.passMin.value); if (!fp.ok) problems.push(fp.why === 'start' ? `لا مساحة وقوف حرة (${rules.passMin.value} م) أمام أول قائمة داخل «${S.name}»` : `لا ممر حر بعرض ${rules.passMin.value} م من أول قائمة إلى باب «${S.name}»`); }
  else if (!crossesOpening(roomTargets(lv, S, o => o && o.id === Bs.id), m.start)) problems.push(`أول قائمة تواجه جدار «${Bs.name}» بلا فتحة`);
  // السلم لا يقطع طريقًا: كل أبواب غرفة السلم متصلة ببعضها (وبأول قائمة) بممر حر ≥ pass حول القلبات
  { const all = roomTargets(lv, S), iso = cutOff(S.net, steps, all, Bs && Bs.id === S.id ? m.start : null, rules.passMin.value);
    if (iso.length) problems.push(`السلم يقطع الطريق في «${S.name}»: لا ممر حر بعرض ${rules.passMin.value} م إلى ${iso.map(t => t.other ? `باب «${t.other.name}»` : 'الباب الخارجي').join('، ')}`); }
  // الدور الأعلى: فتحة السلم داخل غرفة السلم العلوية، والوصول بعد آخر قائمة إلى ممر حر
  if (up) {
    const hc = centroid(m.hole), SU = up.roomAt(hc);
    if (!SU || isVoid(SU)) problems.push('فتحة السلم في الدور العلوي لا تقع في غرفة سلم');
    else {
      value.upperRoom = SU.name;
      if (SU.type !== 'stairs') problems.push(`فتحة السلم في الدور العلوي تقع في «${SU.name}» لا في غرفة سلم`);
      if (!shrinkIn(m.hole, SU.net)) problems.push(`فتحة السلم لا تتسع داخل «${SU.name}» في الدور العلوي (تتجاوز جدرانها)`);
      const A = up.roomAt(m.arrival), tgU = roomTargets(up, SU);
      if (!A || isVoid(A)) problems.push('آخر قائمة تصل إلى فراغ مزدوج أو خارج المبنى في الدور العلوي');
      else if (A.id === SU.id) { const fp = freePath(SU.net, [m.hole], m.arrival, tgU, rules.passMin.value); if (!fp.ok) problems.push(fp.why === 'start' ? `لا مساحة وصول حرة (${rules.passMin.value} م) بعد آخر قائمة في الدور العلوي` : `لا ممر حر بعرض ${rules.passMin.value} م من آخر قائمة إلى باب «${SU.name}» في الدور العلوي`); }
      else if (!crossesOpening(roomTargets(up, SU, o => o && o.id === A.id), m.arrival)) problems.push(`آخر قائمة تواجه جدار «${A.name}» في الدور العلوي بلا فتحة`);
      // بسطة الوصول العلوية متصلة بكل فتحات غرفة السلم العلوية (لا جيب معزول بالفتحة)
      { const iso = cutOff(SU.net, [m.hole], tgU, A && A.id === SU.id ? m.arrival : null, rules.passMin.value);
        if (iso.length) problems.push(`فتحة السلم تعزل في الدور العلوي ${iso.map(t => t.other ? `باب «${t.other.name}»` : 'بابًا').join('، ')} عن بسطة الوصول`); }
    }
  }
  return { ok: !problems.length, problems, value, measured: m };
}

/**
 * يختار للمولّد سلمًا يتسع ويُوصل إليه في غرفته (world rect صافية للغرفة من model): يجرب الأنواع والاتجاهات والأعراض
 * والمواضع، ويعيد أول سلم يجتاز checkStair بأفضل ترتيب (أعرض، ثم U فمستقيم فـL، ثم prefer). null إن لم يتسع شيء.
 * prefer(box) → رقم أصغر أفضل (مثل البعد عن الرئيسية حين «الماستر بعيدة عن الدرج»).
 */
export function chooseStair(model, li, roomPoint, { level, prefer = null, rules = STAIR_RULES, accept = null, maxAccept = 8 } = {}) {
  const lv = model.levels[li], S = lv.roomAt(roomPoint); if (!S) return null;
  const { rise } = riseOf(model.doc.levels, li), N = risersFor(rise);
  const xs = S.net.map(p => p.x), ys = S.net.map(p => p.y), R = { x0: Math.min(...xs) + TOL, x1: Math.max(...xs) - TOL, y0: Math.min(...ys) + TOL, y1: Math.max(...ys) - TOL };
  const cands = [];
  const widths = [1.2, 1.1, 1.0].filter(w => w >= rules.widthMin.value - 1e-9);
  for (const kind of ['U', 'straight', 'L']) for (const w of widths) for (let ri = 0; ri < 4; ri++) for (const flip of kind === 'straight' ? [false] : [false, true]) {
    const rot = ri * Math.PI / 2;
    const runs = kind === 'U' ? [0.30, 0.29, 0.28].map(t => Math.ceil((N - 2) / 2) * t + w)
      : kind === 'straight' ? [0.30, 0.29, 0.28].map(t => (N - 1) * t)
        : Array.from({ length: 31 }, (_, i) => 2 + i * 0.1);
    for (const run of runs) {
      const base = { kind, x: 0, y: 0, rot, w, run: r2(run), flip, steps: N };
      let m0; try { m0 = measureStair(base, rise); } catch { continue; }
      if (dimensionProblems(m0, rules).length) continue;
      const bw = m0.box.x1 - m0.box.x0, bh = m0.box.y1 - m0.box.y0;
      if (bw > R.x1 - R.x0 + 1e-6 || bh > R.y1 - R.y0 + 1e-6) continue;
      const ox = [R.x0 - m0.box.x0, R.x1 - m0.box.x1, (R.x0 + R.x1) / 2 - (m0.box.x0 + m0.box.x1) / 2];
      const oy = [R.y0 - m0.box.y0, R.y1 - m0.box.y1, (R.y0 + R.y1) / 2 - (m0.box.y0 + m0.box.y1) / 2];
      for (const dx of ox) for (const dy of oy) {
        const st = { ...base, x: Math.round((dx) * 1000) / 1000, y: Math.round((dy) * 1000) / 1000 };
        const box = { x0: m0.box.x0 + dx, x1: m0.box.x1 + dx, y0: m0.box.y0 + dy, y1: m0.box.y1 + dy };
        const tread = m0.tread;
        cands.push({ st, rank: [-w, ['U', 'straight', 'L'].indexOf(kind), prefer ? prefer(box) : 0, -Math.min(tread, 0.30)] });
      }
    }
  }
  cands.sort((a, b) => { for (let i = 0; i < a.rank.length; i++) { const d = a.rank[i] - b.rank[i]; if (Math.abs(d) > 1e-9) return d; } return 0; });
  const seen = new Set();
  for (const c of cands) {
    const k = JSON.stringify(c.st); if (seen.has(k)) continue; seen.add(k);
    const res = checkStair(model, c.st, li, rules);
    // (الجولة الحادية عشرة) accept: فحص إضافي من المستدعي (المشي الفعلي من المدخل عبر الدرج إلى كل الدور العلوي)؛ يُجرَّب حتى maxAccept
    if (res.ok && (!accept || maxAccept-- <= 0 ? !accept : accept({ ...c.st, level }))) return { stair: { ...c.st, level }, check: res };
    if (res.ok && accept && maxAccept < 0) break;
  }
  return null;
}

export default { STAIR_GEOMETRY_VERSION, STAIR_RULES, MIZAN_DEFAULT_AR, stairClientRules, riseOf, risersFor, measureStair, dimensionProblems, fitTypes, freePath, freeComponents, checkStair, chooseStair };
