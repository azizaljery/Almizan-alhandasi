// مجموعة المخططات المعيبة عمدًا (defect corpus) لإثبات أن المراجع المستقل (dist/plan-review.mjs) يرفض فعلًا ولا يكتفي
// بخفض الدرجة. نأخذ بدائل حقيقية ناجحة من evidence/acceptance/after-4/*/alt-*.json ونطبّق على كل منها تحويرًا مضبوطًا
// واحدًا ينتج عيبًا معروفًا مسبقًا، ونوسمه بالبوابة (أو البوابات) التي يجب أن ترسب.
//
//   expected : البوابة التي يجب أن ترسب (الكشف = رسوبها، لا مجرد رفض عام).
//   allowed  : بوابات قد ترسب معها بحكم البناء نفسه (مثلًا غرفة السلم المعزولة ترسب في الوصول أيضًا)؛ تُعرض ولا تُعدّ خطأً.
//   set      : عيب على مستوى مجموعة البدائل (زوج متطابق معكوس) يُقاس بـ reviewDesigns لا بمراجعة مستند واحد.
//
// لا يقرأ المراجعُ شيئًا من هنا: يرى المستند المحوَّر وطلب العميل فقط، تمامًا كما يرى مخرجات المولّد.
// الاستعمال (يكتب التقرير والمستندات في evidence/review-proof/):
//   node scripts/defect-corpus.mjs [--reviewer <مسار وحدة plan-review بديلة>] [--tag before|after] [--no-write]
// أرقام «قبل» (detection-before.json) من المراجع 1.0.0: git show de87f42:dist/plan-review.mjs > dist/.plan-review-baseline.mjs
//   ثم --reviewer dist/.plan-review-baseline.mjs --tag before (الملف المؤقت لا يُودَع).
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { swingBlockers } from '../dist/draw/review.mjs';
import { CASES } from './acceptance-cases.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const TOL = 0.01;
const r3 = v => Math.round(v * 1000) / 1000;
const clone = d => JSON.parse(JSON.stringify(d));
const BED = ['bedroom', 'master'];
/** مستطيل عمليًا: مساحتها ≈ مستطيلها الأصغر (قد يصنّفها التحليل «غير منتظمة» لنتوءات صغيرة عند الأبواب). */
const boxy = r => r.shape === 'rectangle' || r.area >= 0.95 * r.rect.w * r.rect.l;

// ------------------------------------------------------------------------------------------- loading
export function requestFor(caseId) {
  const C = CASES.find(c => c.id === caseId);
  return { text: C.text, counts: C.counts, land: { floors: 1, ...C.land } };
}
/** البدائل الناجحة (المستندات الأصلية) لمرحلة: [{ case, file, doc, request }] بترتيب ثابت. */
export const BASE_STAGE = 'after-16'; // (الجولة السادسة عشرة: after-16) // (الجولة الخامسة عشرة: after-15) // (الجولة الرابعة عشرة: after-14) // (الجولة الثالثة عشرة: after-13؛ الثانية عشرة) البدائل التي تجتاز البوابات الثقيلة وDISTINCT v2 وبنود البرنامج السعودي والمواقف النظامية
export function loadBase(stage = BASE_STAGE) {
  const dir = ROOT + `evidence/acceptance/${stage}/`, out = [];
  for (const C of CASES) {
    if (!existsSync(dir + C.id)) continue;
    const files = readdirSync(dir + C.id).filter(f => /^alt-\d+\.json$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    for (const f of files) out.push({ case: C.id, file: f, doc: JSON.parse(readFileSync(dir + C.id + '/' + f, 'utf8')), request: requestFor(C.id) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------ geometry
const ids = (doc, coll, prefix) => {
  doc.counters = doc.counters || {};
  let n = doc.counters[coll] || 0;
  for (const it of doc[coll]) { const k = parseInt(String(it.id).slice(1), 10); if (Number.isFinite(k)) n = Math.max(n, k); }
  doc.counters[coll] = n + 1;
  return prefix + (n + 1);
};
const wlen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
const unit = w => { const L = wlen(w); return { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }; };
const isV = w => Math.abs(w.a.x - w.b.x) < TOL, isH = w => Math.abs(w.a.y - w.b.y) < TOL;
const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < TOL;
function onSegment(p, w) {
  const u = unit(w), L = wlen(w), d = { x: p.x - w.a.x, y: p.y - w.a.y }, t = d.x * u.x + d.y * u.y, off = Math.abs(d.x * u.y - d.y * u.x);
  return off < TOL && t > TOL && t < L - TOL;
}
/** صندوق خط المحور لغرفة مستطيلة (من حوافها في التحليل). */
export function boxOf(room) {
  const xs = room.edges.flatMap(e => [e.a.x, e.b.x]), ys = room.edges.flatMap(e => [e.a.y, e.b.y]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function splitWall(doc, w, p) {
  const t = (p.x - w.a.x) * unit(w).x + (p.y - w.a.y) * unit(w).y;
  const w2 = { ...clone(w), id: ids(doc, 'walls', 'w'), a: { x: r3(p.x), y: r3(p.y) }, b: { ...w.b } };
  w.b = { x: r3(p.x), y: r3(p.y) };
  doc.walls.push(w2);
  for (const o of doc.openings.filter(o => o.wall === w.id)) {
    if (o.at > t) { o.wall = w2.id; o.at = r3(o.at - t); if (o.at - o.w / 2 < 0.05) o.at = r3(o.w / 2 + 0.05); }
    else if (o.at + o.w / 2 > t - 0.05) o.at = r3(t - o.w / 2 - 0.05);
  }
  return w2;
}
function moveEndpoint(doc, w, which, p) {
  const old = { ...w[which] }; w[which] = { x: r3(p.x), y: r3(p.y) };
  if (which === 'a') { const u = unit({ a: old, b: w.b }), d = { x: p.x - old.x, y: p.y - old.y }, s = d.x * u.x + d.y * u.y; for (const o of doc.openings.filter(o => o.wall === w.id)) o.at = r3(o.at - s); }
  const L = wlen(w);
  doc.openings = doc.openings.filter(o => o.wall !== w.id || (o.at - o.w / 2 > 0.02 && o.at + o.w / 2 < L - 0.02));
}
/**
 * يزيح ضلعًا واحدًا لغرفة مستطيلة إلى الداخل (side: x0|x1|y0|y1) حتى الإحداثي newC، مع تقسيم الجدار المشترك عند ركني
 * الغرفة، ومدّ جدران T التي تلتقي بالضلع، وتقصير جدار الركن المعلّق، ونقل التسمية وحذف أثاث الغرفة الواقع في الشريط.
 */
export function moveSide(doc, levelId, room, side, newC) {
  const B = boxOf(room), vertical = side[0] === 'x', c = B[side];
  const lo = vertical ? B.y0 : B.x0, hi = vertical ? B.y1 : B.x1;
  const along = p => (vertical ? p.y : p.x), across = p => (vertical ? p.x : p.y);
  const at = (a, k) => (vertical ? { x: k, y: a } : { x: a, y: k });
  const inward = side.endsWith('0') ? newC > c : newC < c;
  if (!inward) throw Error('moveSide: الإزاحة إلى الداخل فقط');
  const lv = w => w.level === levelId;
  let line = doc.walls.filter(w => lv(w) && (vertical ? isV(w) : isH(w)) && Math.abs(across(w.a) - c) < TOL && Math.min(along(w.a), along(w.b)) < hi - TOL && Math.max(along(w.a), along(w.b)) > lo + TOL);
  for (const cut of [lo, hi]) {
    for (const w of [...line]) {
      const a0 = Math.min(along(w.a), along(w.b)), a1 = Math.max(along(w.a), along(w.b));
      if (cut > a0 + TOL && cut < a1 - TOL) { const w2 = splitWall(doc, w, at(cut, c)); line.push(w2); }
    }
  }
  line = line.filter(w => { const m = (along(w.a) + along(w.b)) / 2; return m > lo && m < hi; });
  const moved = new Set(line.map(w => w.id));
  // جدران T من خارج الغرفة تنتهي على الضلع: تمتد حتى الخط الجديد
  for (const w of doc.walls) {
    if (!lv(w) || moved.has(w.id)) continue;
    for (const k of ['a', 'b']) { const p = w[k]; if (Math.abs(across(p) - c) < TOL && along(p) > lo + TOL && along(p) < hi - TOL) moveEndpoint(doc, w, k, at(along(p), newC)); }
  }
  for (const w of line) { for (const k of ['a', 'b']) w[k] = at(along(w[k]), newC); }
  // الركنان: إن لم يبقَ عند الركن القديم إلا جدار الضلع العمودي فهو جدار معلّق؛ يُقصَّر حتى الخط الجديد
  for (const cut of [lo, hi]) {
    const P = at(cut, c);
    const incident = doc.walls.filter(w => lv(w) && !moved.has(w.id) && (near(w.a, P) || near(w.b, P) || onSegment(P, w)));
    if (incident.length === 1 && !onSegment(P, incident[0])) { const w = incident[0]; moveEndpoint(doc, w, near(w.a, P) ? 'a' : 'b', at(cut, newC)); }
  }
  // التسمية والأثاث
  const nb = { ...B, [side]: newC }, inBox = p => p.x > nb.x0 + 0.05 && p.x < nb.x1 - 0.05 && p.y > nb.y0 + 0.05 && p.y < nb.y1 - 0.05;
  for (const l of doc.labels.filter(l => l.level === levelId && room.labelIds.includes(l.id))) if (!inBox(l.seed)) l.seed = { x: r3((nb.x0 + nb.x1) / 2), y: r3((nb.y0 + nb.y1) / 2) };
  const inOld = p => p.x > B.x0 && p.x < B.x1 && p.y > B.y0 && p.y < B.y1;
  doc.fixtures = doc.fixtures.filter(f => f.level !== levelId || !inOld(f) || (inBox(f) && fixtureInside(f, nb)));
  return nb;
}
function fixtureInside(f, b) {
  const hw = f.w / 2, hd = f.d / 2, c = Math.abs(Math.cos(f.rot || 0)), s = Math.abs(Math.sin(f.rot || 0));
  const ex = hw * c + hd * s, ey = hw * s + hd * c;
  return f.x - ex > b.x0 && f.x + ex < b.x1 && f.y - ey > b.y0 && f.y + ey < b.y1;
}
/** يزيح كل عناصر الدور (أو المستند) بمتجه ثابت. */
export function translate(doc, dx, dy) {
  const mv = p => p && { ...p, x: r3(p.x + dx), y: r3(p.y + dy) };
  for (const w of doc.walls) { w.a = mv(w.a); w.b = mv(w.b); }
  for (const l of doc.labels) l.seed = mv(l.seed);
  for (const c of ['fixtures', 'stairs', 'columns']) for (const it of doc[c] || []) { it.x = r3(it.x + dx); it.y = r3(it.y + dy); }
  for (const d of doc.dimensions || []) { d.a = mv(d.a); d.b = mv(d.b); }
  for (const t of doc.texts || []) if (Number.isFinite(t.x)) { t.x = r3(t.x + dx); t.y = r3(t.y + dy); }
  return doc;
}
/** انعكاس أفقي حول محور الأرض الرأسي: نفس المخطط مقلوبًا يمينًا ويسارًا (لا يغيّر شيئًا معماريًا). */
export function mirrorX(doc) {
  const d = clone(doc), xs = d.plot.polygon.map(p => p.x), X = Math.min(...xs) + Math.max(...xs);
  const mx = p => p && { ...p, x: r3(X - p.x) };
  for (const w of d.walls) { w.a = mx(w.a); w.b = mx(w.b); }
  for (const o of d.openings) o.swing = o.swing === 'out' ? 'in' : 'out'; // عمودي الجدار يُقلب بالانعكاس
  for (const l of d.labels) l.seed = mx(l.seed);
  for (const f of d.fixtures) { f.x = r3(X - f.x); f.rot = r3(Math.PI - (f.rot || 0)); }
  for (const s of d.stairs) { s.x = r3(X - s.x); s.rot = r3(Math.PI - (s.rot || 0)); s.flip = !s.flip; }
  for (const c of d.columns || []) c.x = r3(X - c.x);
  for (const m of d.dimensions || []) { m.a = mx(m.a); m.b = mx(m.b); }
  d.plot.polygon = d.plot.polygon.map(mx).reverse();
  const sb = d.plot.setbacks || {}; d.plot.setbacks = { ...sb, e: sb.w, w: sb.e };
  const sw = s => ({ e: 'w', w: 'e' }[s] || s);
  d.streets = (d.streets || []).map(sw); d.entries = (d.entries || []).map(sw); d.entry = sw(d.entry);
  return d;
}

// --------------------------------------------------------------------------------------- model helpers
const roomsOf = (m, pred) => m.levels.flatMap(lv => lv.rooms.filter(r => !r.unlabelled && pred(r, lv)).map(room => ({ lv, room })));
const doorsOf = (lv, room) => lv.openings.filter(o => o.door && o.sides.some(s => s.room.id === room.id));
const extWindowsOf = (lv, room) => lv.openings.filter(o => (o.window || o.kind === 'slider') && o.sides.some(s => s.room.id === room.id && s.exterior));
/** الحواف المشتركة بين غرفتين (خط المحور) مع جدارها، الأطول أولًا. */
function sharedEdges(a, b) {
  return a.edges.filter(e => e.space === b.spaceId).map(e => ({ e, len: e.length, wall: e.wallIds[0] })).sort((p, q) => q.len - p.len);
}
function wallAtOf(doc, wallId, p) { const w = doc.walls.find(x => x.id === wallId), u = unit(w); return (p.x - w.a.x) * u.x + (p.y - w.a.y) * u.y; }
/** يضيف بابًا على حافة مشتركة دون تداخل مع فتحات الجدار، ويختار اتجاه فتح لا يعترضه شيء. */
function addDoorOnEdge(doc, levelId, edge, kind = 'door', width = 0.8) {
  const w = doc.walls.find(x => x.id === edge.wall); if (!w) return null;
  const s0 = wallAtOf(doc, w.id, edge.e.a), s1 = wallAtOf(doc, w.id, edge.e.b), lo = Math.min(s0, s1) + 0.2, hi = Math.max(s0, s1) - 0.2;
  const ww = Math.min(width, hi - lo); if (ww < 0.6) return null;
  const others = doc.openings.filter(o => o.wall === w.id);
  let fallback = null;
  for (const f of [0.5, 0.3, 0.7, 0.15, 0.85, 0, 1]) {
    const at = lo + ww / 2 + (hi - lo - ww) * f;
    if (others.some(o => Math.abs(o.at - at) < (o.w + ww) / 2 + 0.05)) continue;
    const o = { id: ids(doc, 'openings', 'o'), level: levelId, wall: w.id, kind, at: r3(at), w: ww, h: 2.1, sill: 0, swing: 'in', hinge: 'left', entry: false };
    doc.openings.push(o);
    if (kind !== 'door') return o;
    // اتجاه فتح لا يعترضه شيء؛ وإلا لا يعترضه جدار ولا باب (حتى لا يتولد عيب فتح باب غير مقصود)
    for (const ov of [{ swing: 'in', hinge: 'left' }, { swing: 'out', hinge: 'left' }, { swing: 'in', hinge: 'right' }, { swing: 'out', hinge: 'right' }]) {
      Object.assign(o, ov);
      const m = analyzeDoc(doc), L = m.levelById.get(levelId), op = L.openings.find(x => x.id === o.id), b = op ? swingBlockers(m, L, op) : [{}];
      if (!b.length) return o;
      if (!fallback && !b.some(x => x.kind !== 'fixture')) fallback = { at: o.at, ...ov };
    }
    doc.openings = doc.openings.filter(x => x.id !== o.id);
  }
  if (!fallback) return null;
  const o = { id: ids(doc, 'openings', 'o'), level: levelId, wall: w.id, kind, at: fallback.at, w: ww, h: 2.1, sill: 0, swing: fallback.swing, hinge: fallback.hinge, entry: false };
  doc.openings.push(o); return o;
}
const removeOpenings = (doc, list) => { const s = new Set(list.map(o => o.id || o)); doc.openings = doc.openings.filter(o => !s.has(o.id)); };
/** عمق مركز الغرفة من الشارع (0 = الواجهة، 1 = الخلف) داخل صندوق المبنى، للأرض التي مدخلها جنوبي (كل حالات القبول). */
function depthOf(m, room) {
  const lv = m.levels[0], xs = lv.rooms.flatMap(r => r.net.map(p => p.y));
  const y0 = Math.min(...xs), y1 = Math.max(...xs);
  return (room.centroid.y - y0) / Math.max(1e-9, y1 - y0);
}

/** هل بقي كل ما كان موصولًا موصولًا، وكل غرفة لها نافذة خارجية بنافذتها؟ (لتحوير لا يحدث عيبًا جانبيًا غير مقصود) */
function intact(base, d, target = null) {
  const HAB = ['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'office', 'service'];
  const stat = m => m.levels.flatMap(lv => lv.rooms.filter(r => !r.unlabelled).map(r => ({ id: r.id, reach: lv.reach.has(r.id), win: HAB.includes(r.type) && extWindowsOf(lv, r).length > 0, shape: r.shape })));
  const before = new Map(stat(analyzeDoc(base)).map(x => [x.id, x]));
  // وغرف الجوار تبقى بشكلها (المستطيل لا يصير L) حتى لا يتولد عيب عرض جانبي غير مقصود
  return stat(analyzeDoc(d)).every(x => { const o = before.get(x.id); return !o || ((!o.reach || x.reach) && (!o.win || x.win) && (x.id === target || o.shape !== 'rectangle' || x.shape === 'rectangle')); });
}

// -------------------------------------------------------------------------------------------- mutations
// كل تحوير: (doc, ctx) => { doc, note } أو null إن لم ينطبق على هذا البديل. ctx = { model, request, case }.
const M = [];
const def = (id, ar, expected, allowed, apply, extra = {}) => M.push({ id, ar, expected, allowed, apply, ...extra });

def('no-window-bedroom', 'حذف نوافذ غرفة نوم (بلا نافذة خارجية)', ['DAYLIGHT'], ['WINDOW_SIZE'], (doc, { model }) => {
  for (const { lv, room } of roomsOf(model, r => r.type === 'bedroom')) {
    const wins = extWindowsOf(lv, room); if (!wins.length || wins.some(o => o.door)) continue;
    removeOpenings(doc, wins); return { note: `حُذفت ${wins.length} نافذة من «${room.name}»`, target: room.id };
  }
  return null;
});
def('window-interior-only', 'نافذة غرفة النوم على ممر داخلي لا على الخارج (خفي)', ['DAYLIGHT'], ['WINDOW_SIZE'], (doc, { model }) => {
  for (const { lv, room } of roomsOf(model, r => r.type === 'bedroom')) {
    const wins = extWindowsOf(lv, room); if (!wins.length || wins.some(o => o.door)) continue;
    const corr = lv.rooms.find(r => ['corridor', 'living'].includes(r.type) && sharedEdges(room, r).some(x => x.len > 1.6));
    if (!corr) continue;
    const e = sharedEdges(room, corr)[0], w = doc.walls.find(x => x.id === e.wall);
    const s0 = wallAtOf(doc, w.id, e.e.a), s1 = wallAtOf(doc, w.id, e.e.b), lo = Math.min(s0, s1) + 0.2, hi = Math.max(s0, s1) - 0.2;
    const free = [0.5, 0.25, 0.75].map(f => lo + 0.7 + (hi - lo - 1.4) * f).find(at => !doc.openings.some(o => o.wall === w.id && Math.abs(o.at - at) < (o.w + 1.4) / 2 + 0.05));
    if (free === undefined || hi - lo < 1.6) continue;
    removeOpenings(doc, wins);
    doc.openings.push({ id: ids(doc, 'openings', 'o'), level: lv.level.id, wall: w.id, kind: 'window', at: r3(free), w: 1.4, h: 1.2, sill: 1, swing: 'in', hinge: 'left', entry: false });
    return { note: `نوافذ «${room.name}» الخارجية حُذفت ووُضعت نافذة على «${corr.name}» الداخلي`, target: room.id };
  }
  return null;
});
def('window-too-small', 'نافذة غرفة النوم صغيرة جدًا (0.5×0.5 م) (خفي)', ['WINDOW_SIZE'], [], (doc, { model }) => {
  for (const { lv, room } of roomsOf(model, r => BED.includes(r.type))) {
    const wins = extWindowsOf(lv, room); if (!wins.length || wins.some(o => o.door)) continue;
    for (const w of wins) { const o = doc.openings.find(x => x.id === w.id); o.kind = 'window'; o.w = 0.5; o.h = 0.5; o.sill = 1.4; }
    for (const w of wins.slice(1)) removeOpenings(doc, [w.id]);
    return { note: `نافذة «${room.name}» صارت 0.5×0.5 م (${r3(0.25 / room.area * 100)}٪ من الأرضية)`, target: room.id };
  }
  return null;
});
def('hall-strip', 'الصالة شريط طويل (نسبة > 2.5:1)', ['HALL_ASPECT'], ['MIN_WIDTH', 'MAJLIS_PRIVACY'], (doc, { model }) => {
  for (const { lv, room } of roomsOf(model, r => r.type === 'living' && boxy(r))) {
    const B = boxOf(room), wx = B.x1 - B.x0, wy = B.y1 - B.y0, long = Math.max(wx, wy), target = Math.max(2.95, long / 2.75);
    if (long / target <= 2.55) continue;
    const sides = wx < wy ? ['x1', 'x0'] : ['y1', 'y0'];
    for (const side of sides) {
      const d = clone(doc), nc = side.endsWith('0') ? B[side] + ((wx < wy ? wx : wy) - target) : B[side] - ((wx < wy ? wx : wy) - target);
      moveSide(d, lv.level.id, room, side, r3(nc));
      const r2_ = analyzeDoc(d).levels[0].rooms.find(r => r.labelIds.includes(room.id));
      if (r2_ && r2_.rect.l / r2_.rect.w > 2.5 && intact(doc, d, room.id)) { Object.assign(doc, d); return { note: `«${room.name}» ضُيّقت إلى ${r3(r2_.rect.w)}×${r3(r2_.rect.l)} م`, target: room.id }; }
    }
  }
  return null;
});
function narrow(type, width, label) {
  return (doc, { model }) => {
    const pick = roomsOf(model, r => (Array.isArray(type) ? type.includes(r.type) : r.type === type) && boxy(r)).sort((p, q) => q.room.rect.l - p.room.rect.l);
    for (const { lv, room } of pick) {
      const B = boxOf(room), wx = B.x1 - B.x0, wy = B.y1 - B.y0, net = Math.min(room.rect.w, room.rect.l);
      if (net - width < 0.2) continue;
      const sides = wx < wy ? ['x1', 'x0'] : ['y1', 'y0'];
      // العرض الصافي المستهدف = width (الإزاحة تُحسب من العرض الصافي لا من محور الجدار)
      for (const side of sides) {
        const d = clone(doc), nc = side.endsWith('0') ? B[side] + (net - width) : B[side] - (net - width);
        moveSide(d, lv.level.id, room, side, r3(nc));
        const m2 = analyzeDoc(d), L2 = m2.levelById.get(lv.level.id), rr = L2.rooms.find(r => r.labelIds.includes(room.id));
        if (!rr || Math.min(rr.rect.w, rr.rect.l) > width + 0.02 || !L2.reach.has(rr.id) || !intact(doc, d, room.id)) continue;
        Object.assign(doc, d); return { note: `${label} «${room.name}» صار عرضه ${r3(Math.min(rr.rect.w, rr.rect.l))} م`, target: room.id };
      }
    }
    return null;
  };
}
def('bedroom-narrow', 'غرفة نوم أضيق من الحد الأدنى (1.9 م)', ['MIN_WIDTH'], [], narrow('bedroom', 1.9, 'غرفة النوم'));
def('corridor-075', 'ممر بعرض 0.75 م (خفي)', ['MIN_WIDTH'], ['DOOR_SWING'], narrow('corridor', 0.75, 'الممر'));
function wetOnto(target) {
  return (doc, { model }) => {
    for (const { lv, room } of roomsOf(model, r => r.type === 'bath')) {
      const other = lv.rooms.find(r => r.type === target && sharedEdges(room, r).some(x => x.len >= 1.1));
      if (!other) continue;
      const d = clone(doc); removeOpenings(d, doorsOf(lv, room));
      const o = addDoorOnEdge(d, lv.level.id, sharedEdges(room, other)[0], 'door', 0.8); if (!o) continue;
      Object.assign(doc, d); return { note: `باب «${room.name}» نُقل ليفتح على «${other.name}»`, target: room.id };
    }
    return null;
  };
}
def('wc-door-kitchen', 'دورة مياه تفتح على المطبخ', ['WET_DOOR'], [], wetOnto('kitchen'));
def('wc-door-majlis', 'دورة مياه تفتح على المجلس', ['WET_DOOR'], [], wetOnto('majlis'));
def('wc-door-dining', 'دورة مياه تفتح على الطعام (خفي)', ['WET_DOOR'], [], wetOnto('dining'));
def('guest-through-hall', 'الوصول إلى المجلس عبر صالة العائلة', ['GUEST_ROUTE'], ['MAJLIS_PRIVACY'], (doc, { model }) => {
  for (const { lv, room } of roomsOf(model, r => r.type === 'majlis')) {
    const fam = lv.rooms.filter(r => r.type === 'living' || (r.type === 'corridor' && doorsOf(lv, r).some(o => o.sides.some(s => s.other !== 'outside' && BED.includes(lv.roomsById.get(s.other)?.type)))));
    const via = fam.find(r => sharedEdges(room, r).some(x => x.len >= 1.2));
    if (!via) continue;
    const own = o => { const s = o.sides.find(x => x.room.id === room.id); return s.other !== 'outside' && lv.roomsById.get(s.other)?.type === 'bath'; };
    const d = clone(doc); removeOpenings(d, doorsOf(lv, room).filter(o => !own(o)));
    const o = addDoorOnEdge(d, lv.level.id, sharedEdges(room, via)[0], 'door', 0.9); if (!o) continue;
    const m2 = analyzeDoc(d), L2 = m2.levelById.get(lv.level.id);
    if (L2.rooms.some(r => !r.unlabelled && !L2.reach.has(r.id))) continue; // لا عزل جانبي
    Object.assign(doc, d); return { note: `أبواب «${room.name}» الخاصة حُذفت وصار الدخول إليه من «${via.name}»`, target: room.id };
  }
  return null;
});
def('bedroom-door-majlis', 'غرفة نوم تفتح على المجلس', ['BED_MAJLIS'], ['MAJLIS_PRIVACY'], (doc, { model }) => {
  for (const { lv, room } of roomsOf(model, r => BED.includes(r.type))) {
    const mj = lv.rooms.find(r => r.type === 'majlis' && sharedEdges(room, r).some(x => x.len >= 1.2));
    if (!mj) continue;
    const o = addDoorOnEdge(doc, lv.level.id, sharedEdges(room, mj)[0], 'door', 0.9); if (!o) continue;
    return { note: `باب جديد بين «${room.name}» و«${mj.name}»`, target: room.id };
  }
  // لا غرفة نوم تجاور المجلس: يُفتح باب من ممر النوم على المجلس فيصير المجلس ممرًا إلى النوم (غرفة نوم على المجلس عبر ممرها)
  return null;
});
def('unreachable-room', 'غرفة نوم بلا باب (معزولة)', ['REACH'], [], (doc, { model }) => {
  for (const { lv, room } of roomsOf(model, r => r.type === 'bedroom')) {
    const ds = doorsOf(lv, room); if (!ds.length) continue;
    removeOpenings(doc, ds); return { note: `حُذفت أبواب «${room.name}» (${ds.length})`, target: room.id };
  }
  return null;
});
def('no-front-door', 'لا باب مدخل إلى الخارج (خفي)', ['REACH'], ['GUEST_ROUTE', 'STAIRS'], (doc, { model }) => {
  const lv = model.levels[0], ext = lv.openings.filter(o => o.door && o.sides.some(s => s.other === 'outside'));
  if (!ext.length) return null;
  removeOpenings(doc, ext); return { note: `حُذفت كل الأبواب الخارجية (${ext.length})` };
});
def('swing-blocked', 'باب يصطدم فتحه بجدار أو بباب آخر', ['DOOR_SWING'], [], (doc, { model }) => {
  for (const lv of model.levels) for (const op of lv.openings.filter(o => o.kind === 'door')) {
    const L = wlen(op.wall);
    for (const at of [op.o.at, op.o.w / 2 + 0.06, L - op.o.w / 2 - 0.06]) for (const ov of [{ swing: 'in', hinge: 'left' }, { swing: 'in', hinge: 'right' }, { swing: 'out', hinge: 'left' }, { swing: 'out', hinge: 'right' }]) {
      if (at === op.o.at && ov.swing === op.o.swing && ov.hinge === op.o.hinge) continue;
      if (doc.openings.some(o => o.wall === op.wall.id && o.id !== op.id && Math.abs(o.at - at) < (o.w + op.o.w) / 2 + 0.02)) continue;
      const b = swingBlockers(model, lv, op, { ...ov, at });
      if (b.some(x => x.kind === 'wall' || x.kind === 'door')) {
        const d = clone(doc), o = d.openings.find(x => x.id === op.id); Object.assign(o, ov, { at: r3(at) });
        const L2 = analyzeDoc(d).levelById.get(lv.level.id).openings.find(x => x.id === op.id);
        if (!intact(doc, d) || !L2 || L2.sides.map(x => x.room.id).sort().join() !== op.sides.map(x => x.room.id).sort().join()) continue;
        Object.assign(doc, d);
        return { note: `الباب ${op.id} يُفتح نحو ${b.filter(x => x.kind !== 'fixture').map(x => (x.kind === 'wall' ? 'الجدار ' : 'الباب ') + x.id).join('، ')}`, target: op.id };
      }
    }
  }
  return null;
});
def('overlap-label', 'غرفتان على فراغ واحد (تسمية غرفة النوم داخل غرفة مجاورة)', ['INTEGRITY'], ['PROGRAM', 'DAYLIGHT', 'MIN_WIDTH', 'HALL_ASPECT'], (doc, { model }) => {
  for (const { lv, room } of roomsOf(model, r => r.type === 'bedroom')) {
    const nb = lv.rooms.find(r => !r.unlabelled && r.id !== room.id && ['bedroom', 'living', 'corridor'].includes(r.type) && sharedEdges(room, r).length);
    if (!nb) continue;
    const l = doc.labels.find(x => x.id === room.id); l.seed = { x: r3(nb.inside.x + 0.3), y: r3(nb.inside.y + 0.3) };
    return { note: `تسمية «${room.name}» نُقلت داخل «${nb.name}»: فراغ واحد عليه غرفتان، والفراغ الأصلي بلا تسمية`, target: room.id };
  }
  return null;
});
def('overlap-walls', 'غرفة مرسومة فوق غرفة أخرى (جدران متقاطعة)', ['INTEGRITY'], ['REACH', 'DAYLIGHT', 'MIN_WIDTH', 'PROGRAM', 'HALL_ASPECT', 'WET_DOOR', 'DOOR_SWING', 'BED_MAJLIS', 'GUEST_ROUTE'], (doc, { model }) => {
  for (const { lv, room } of roomsOf(model, r => r.type === 'bedroom' && r.shape === 'rectangle')) {
    const B = boxOf(room), wx = B.x1 - B.x0, wy = B.y1 - B.y0;
    const sh = wx < wy ? { x: wx * 0.45, y: 0 } : { x: 0, y: wy * 0.45 };
    for (const s of [sh, { x: -sh.x, y: -sh.y }]) {
      const b = { x0: B.x0 + s.x, x1: B.x1 + s.x, y0: B.y0 + s.y, y1: B.y1 + s.y };
      const d = clone(doc), P = [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
      for (let i = 0; i < 4; i++) d.walls.push({ id: ids(d, 'walls', 'w'), level: lv.level.id, a: { x: r3(P[i].x), y: r3(P[i].y) }, b: { x: r3(P[(i + 1) % 4].x), y: r3(P[(i + 1) % 4].y) }, t: 0.12, h: null, kind: 'wall' });
      if (P.some(p => !doc.plot.polygon.length || p.x < 0 || p.y < 0)) continue;
      Object.assign(doc, d); return { note: `نسخة من جدران «${room.name}» أُزيحت ${r3(Math.hypot(s.x, s.y))} م فوق الغرفة المجاورة`, target: room.id };
    }
  }
  return null;
});
def('setback-front', 'المبنى يتجاوز خط الارتداد الأمامي', ['PLOT'], [], (doc, { model }) => {
  const ys = doc.walls.map(w => Math.min(w.a.y, w.b.y)), y0 = Math.min(...doc.plot.polygon.map(p => p.y)), sb = doc.plot.setbacks?.s || 0;
  const over = Math.min(...ys) - (y0 + sb); translate(doc, 0, -(over + 0.8));
  return { note: `المبنى أُزيح ${r3(over + 0.8)} م نحو الشارع فتجاوز الارتداد الأمامي (${sb} م) بنحو 0.8 م` };
});
def('setback-side', 'جدار جانبي خارج خط الارتداد الجانبي', ['PLOT'], [], (doc, { model }) => {
  const xs = doc.walls.flatMap(w => [w.a.x, w.b.x]), px = doc.plot.polygon.map(p => p.x), x1 = Math.max(...px), sb = doc.plot.setbacks?.e || 0;
  if (Math.min(...doc.plot.polygon.map(p => p.x)) !== 0 || doc.plot.polygon.length !== 4) return null; // الأرض المستطيلة فقط
  const over = (x1 - sb) - Math.max(...xs); translate(doc, over + 1.0, 0);
  return { note: `المبنى أُزيح ${r3(over + 1)} م شرقًا فتجاوز الارتداد الجانبي (${sb} م) بنحو متر` };
});
def('delete-requested-bedroom', 'حذف غرفة نوم طلبها العميل (تحويلها مخزنًا)', ['PROGRAM'], [], (doc, { model, request }) => {
  if (!Number.isInteger(request.counts?.bedrooms)) return null;
  const t = roomsOf(model, r => r.type === 'bedroom')[0]; if (!t) return null;
  const l = doc.labels.find(x => x.id === t.room.id); l.type = 'storage'; l.name = 'مخزن';
  doc.fixtures = doc.fixtures.filter(f => !(f.level === t.lv.level.id && t.lv.roomAt({ x: f.x, y: f.y })?.id === t.room.id));
  return { note: `«${t.room.name}» حُذفت من البرنامج (صارت مخزنًا)`, target: t.room.id };
});
def('delete-requested-majlis', 'حذف المجلس المطلوب (إزالة تسميته)', ['PROGRAM'], ['INTEGRITY'], (doc, { model, request }) => {
  if (!Number.isInteger(request.counts?.majlis)) return null;
  const t = roomsOf(model, r => r.type === 'majlis')[0]; if (!t) return null;
  doc.labels = doc.labels.filter(x => x.id !== t.room.id);
  return { note: `تسمية «${t.room.name}» حُذفت: المجلس المطلوب لم يعد في الرسم`, target: t.room.id };
});
def('kitchen-front', 'المطبخ في النصف الأمامي والطلب يقول «المطبخ في الخلف»', ['PLACEMENT'], ['WET_DOOR', 'DAYLIGHT', 'MIN_WIDTH', 'GUEST_ROUTE', 'BED_MAJLIS'], (doc, { model, request }) => {
  if (!/المطبخ في الخلف/.test(request.text || '')) return null;
  const k = roomsOf(model, r => r.type === 'kitchen')[0]; if (!k) return null;
  const front = roomsOf(model, r => ['dining', 'bedroom', 'office', 'service'].includes(r.type) && r.area >= 9).filter(x => depthOf(model, x.room) < 0.45).sort((p, q) => depthOf(model, p.room) - depthOf(model, q.room))[0];
  if (!front) return null;
  const a = doc.labels.find(x => x.id === k.room.id), b = doc.labels.find(x => x.id === front.room.id);
  [a.type, b.type, a.name, b.name] = [b.type, a.type, b.name, a.name];
  const inRoom = (f, r) => f.level === k.lv.level.id && k.lv.roomAt({ x: f.x, y: f.y })?.id === r.id;
  doc.fixtures = doc.fixtures.filter(f => !inRoom(f, k.room) && !inRoom(f, front.room));
  return { note: `المطبخ بودّل مع «${front.room.name}» فصار في الواجهة (عمق ${r3(depthOf(model, front.room))})`, target: k.room.id };
});
def('bedrooms-front', 'غرف النوم في النصف الأمامي والطلب يقول «الغرف في الخلف»', ['PLACEMENT'], ['WET_DOOR', 'DAYLIGHT', 'MIN_WIDTH', 'GUEST_ROUTE', 'BED_MAJLIS', 'HALL_ASPECT', 'MAJLIS_PRIVACY'], (doc, { model, request }) => {
  if (!/الغرف في الخلف/.test(request.text || '')) return null;
  const beds = roomsOf(model, r => BED.includes(r.type)).sort((p, q) => depthOf(model, q.room) - depthOf(model, p.room));
  const front = roomsOf(model, r => ['majlis', 'living', 'dining', 'kitchen'].includes(r.type)).sort((p, q) => depthOf(model, p.room) - depthOf(model, q.room));
  const n = Math.min(beds.length, front.length); if (!n) return null;
  for (let i = 0; i < n; i++) {
    const a = doc.labels.find(x => x.id === beds[i].room.id), b = doc.labels.find(x => x.id === front[i].room.id);
    [a.type, b.type, a.name, b.name] = [b.type, a.type, b.name, a.name];
  }
  doc.fixtures = [];
  return { note: `${n} غرف نوم بودّلت مع فراغات النهار الأمامية فصار النوم في الواجهة`, target: beds[0].room.id };
});
def('stairs-room-closed', 'غرفة السلم بلا باب (السلم معزول)', ['STAIRS'], ['REACH', 'STAIR_GEOMETRY'], (doc, { model }) => {
  if (model.levels.length < 2) return null;
  const lv = model.levels[0], s = lv.stairs.find(x => x.room); if (!s) return null;
  const room = lv.roomsById.get(s.room); const ds = doorsOf(lv, room);
  if (!ds.length || room.type === 'living') return null;
  removeOpenings(doc, ds); return { note: `حُذفت أبواب «${room.name}» التي فيها السلم`, target: room.id };
});
def('stairs-deleted', 'دوران بلا سلم في الأرضي', ['STAIRS'], ['REACH'], (doc, { model }) => {
  if (model.levels.length < 2) return null;
  const st = doc.stairs.filter(s => s.level === model.levels[0].level.id); if (!st.length) return null;
  doc.stairs = doc.stairs.filter(s => !st.includes(s));
  return { note: 'حُذف السلم من الدور الأرضي والدور الأول باقٍ' };
});
def('stairs-moved-out', 'السلم خارج المبنى (لا فراغ مغلق حوله)', ['STAIRS'], ['REACH', 'STAIR_GEOMETRY'], (doc, { model }) => {
  if (model.levels.length < 2) return null;
  const s = doc.stairs.find(x => x.level === model.levels[0].level.id); if (!s) return null;
  const xs = doc.walls.flatMap(w => [w.a.x, w.b.x]); s.x = r3(Math.min(...xs) - 0.9);
  return { note: 'السلم نُقل خارج جدران المبنى' };
});
// (الجولة العاشرة) سلم قصير: سلم مستقيم بطول 3.0 م لدور ارتفاعه ≥ 3 م (يحتاج ≈ 4.8 م بنائمة 28 سم) — نائمة أقل من الحد
def('stair-too-short', 'سلم مستقيم قصير (3.0 م) لا تتسع نوائمه لارتفاع الدور', ['STAIR_GEOMETRY'], ['STAIRS', 'REACH'], (doc, { model }) => {
  if (model.levels.length < 2) return null;
  const s = doc.stairs.find(x => x.level === model.levels[0].level.id); if (!s) return null;
  s.kind = 'straight'; s.run = 3.0; delete s.steps;
  return { note: 'السلم صار مستقيمًا بطول 3.0 م في غرفته نفسها', target: s.id };
});
// (الجولة العاشرة) سلم ضيق: عرض القلبة 0.8 م
def('stair-narrow', 'قلبة السلم بعرض 0.8 م (خفي)', ['STAIR_GEOMETRY'], ['STAIRS', 'REACH'], (doc, { model }) => {
  if (model.levels.length < 2) return null;
  const s = doc.stairs.find(x => x.level === model.levels[0].level.id); if (!s) return null;
  s.w = 0.8; return { note: 'عرض قلبة السلم 0.8 م', target: s.id };
});
// (الجولة العاشرة) المجلس يفتح على الطعام العائلي أو الصالة أو المطبخ (والعميل لم يطلب «مقلط»)
def('majlis-door-family', 'المجلس يفتح على الطعام العائلي أو الصالة أو المطبخ', ['MAJLIS_PRIVACY'], ['GUEST_ROUTE', 'DOOR_SWING', 'WET_DOOR'], (doc, { model }) => {
  for (const { lv, room } of roomsOf(model, r => r.type === 'majlis')) {
    // (الجولة الثانية عشرة) «صالة الطعام والمقلط» طعام ضيوف يفتح على المجلس بالتصميم (المقلط) — ليس عيبًا؛ العيب فتح المجلس على فراغ عائلي
    for (const t of ['living', 'kitchen', 'dining']) {
      const o = lv.rooms.find(r => r.type === t && !/المقلط|الضيوف/.test(r.name || '') && sharedEdges(room, r).some(x => x.len >= 1.4));
      if (!o) continue;
      const e = sharedEdges(room, o).sort((a, b) => b.len - a.len)[0];
      if (!addDoorOnEdge(doc, lv.level.id, e, 'door', 0.9)) continue;
      return { note: `باب جديد بين «${room.name}» و«${o.name}»`, target: room.id };
    }
  }
  return null;
});
// ---- (الجولة الحادية عشرة) عيوب البوابات الثقيلة
// نافذة على تقاطع جدار داخلي مع الواجهة: المجسّم يزيحها أو يُسقطها، وعمود التقاطع داخل الفتحة
def('opening-junction', 'نافذة تعبر تقاطع جدار داخلي مع الواجهة', ['CONSISTENCY_2D3D'], ['STRUCTURAL', 'DAYLIGHT', 'WINDOW_SIZE', 'CIRCULATION'], (doc, { model }) => {
  for (const lv of model.levels) for (const op of lv.openings.filter(o => o.window && o.sides.some(x => x.exterior))) {
    const w = op.wall, L = wlen(w), u = unit(w);
    for (const v of doc.walls.filter(x => x.level === lv.level.id && x.id !== w.id)) for (const e of [v.a, v.b]) {
      const sAt = (e.x - w.a.x) * u.x + (e.y - w.a.y) * u.y, off = Math.abs((e.x - w.a.x) * -u.y + (e.y - w.a.y) * u.x);
      if (off > 0.02 || sAt < op.o.w / 2 + 0.3 || sAt > L - op.o.w / 2 - 0.3 || Math.abs(sAt - op.o.at) > 3) continue;
      if (doc.openings.some(o => o.wall === w.id && o.id !== op.id && Math.abs(o.at - sAt) < (o.w + op.o.w) / 2 + 0.05)) continue;
      const o = doc.openings.find(x => x.id === op.id); o.at = r3(sAt);
      return { note: `النافذة ${op.id} نُقلت فصار منتصفها على تقاطع الجدار ${v.id} مع ${w.id}`, target: op.id };
    }
  }
  return null;
});
// مرحاض داخل منطقة فتح باب دورة المياه (أمام الباب مباشرة)
def('wc-at-door', 'المرحاض أمام باب دورة المياه داخل منطقة فتحه', ['CIRCULATION'], ['DOOR_SWING'], (doc, { model }) => {
  for (const lv of model.levels) for (const op of lv.openings.filter(o => o.kind === 'door')) {
    const sd = op.sides.find(x => x.room.type === 'bath'); if (!sd) continue;
    const f = doc.fixtures.find(x => x.level === lv.level.id && x.kind === 'wc' && sd.room.net && lv.roomAt({ x: x.x, y: x.y })?.id === sd.room.id); if (!f) continue;
    const inward = { x: -sd.outward.x, y: -sd.outward.y }, d = (op.wall.t ?? 0.2) / 2 + 0.45;
    f.x = r3(op.p.x + inward.x * d); f.y = r3(op.p.y + inward.y * d);
    return { note: `المرحاض ${f.id} نُقل أمام الباب ${op.id} داخل «${sd.room.name}»`, target: f.id };
  }
  return null;
});
// كنبة أمام باب أو فتحة الصالة/المجلس تسد المدخل
def('sofa-at-door', 'كنبة أو جلسة أمام باب الصالة أو المجلس تسد المدخل', ['CIRCULATION'], ['DOOR_SWING'], (doc, { model }) => {
  for (const lv of model.levels) for (const op of lv.openings.filter(o => o.door && o.kind !== 'garage')) {
    for (const sd of op.sides) {
      if (!['living', 'majlis'].includes(sd.room.type)) continue;
      const f = doc.fixtures.find(x => x.level === lv.level.id && ['sofa-3', 'majlis-sofa'].includes(x.kind) && lv.roomAt({ x: x.x, y: x.y })?.id === sd.room.id); if (!f) continue;
      const inward = { x: -sd.outward.x, y: -sd.outward.y }, d = (op.wall.t ?? 0.2) / 2 + 0.55;
      f.x = r3(op.p.x + inward.x * d); f.y = r3(op.p.y + inward.y * d); f.rot = Math.atan2(op.u.y, op.u.x);
      return { note: `${f.kind} ${f.id} نُقلت أمام ${op.kind === 'arch' ? 'الفتحة' : 'الباب'} ${op.id} في «${sd.room.name}»`, target: f.id };
    }
  }
  return null;
});
// عيب على مستوى المجموعة: البديل الثاني نسخة معكوسة من الأول (مع أسماء غرف مبدّلة) — ليس بديلًا معماريًا
def('mirror-pair', 'بديل معكوس مطابق لبديل آخر', ['DISTINCT'], [], (doc) => {
  const m = mirrorX(doc), beds = m.labels.filter(l => l.type === 'bedroom');
  if (beds.length >= 2) [beds[0].name, beds[1].name] = [beds[1].name, beds[0].name];
  m.title = (m.title || '') + ' (معكوس)';
  return { note: 'البديل نفسه معكوسًا يمينًا ويسارًا مع تبديل اسمي غرفتين', pairWithBase: true, replace: m };
}, { set: true });
def('mirror-nudged-pair', 'بديل معكوس مع إزاحة جدار داخلي 0.3 م (خفي)', ['DISTINCT'], [], (doc) => {
  const m = mirrorX(doc), model = analyzeDoc(m);
  const t = roomsOf(model, r => r.type === 'bedroom' && r.shape === 'rectangle')[0];
  if (t) { const B = boxOf(t.room); const side = (B.x1 - B.x0) < (B.y1 - B.y0) ? 'y1' : 'x1'; moveSide(m, t.lv.level.id, t.room, side, r3(B[side] - 0.3)); }
  m.title = (m.title || '') + ' (معكوس معدّل)';
  return { note: 'البديل نفسه معكوسًا مع تقصير غرفة نوم 0.3 م', pairWithBase: true, replace: m };
}, { set: true });

export const MUTATIONS = Object.freeze(M);

/**
 * يبني المجموعة: لكل تحوير يمرّ على البدائل الناجحة بالتناوب بين الحالات ويأخذ حتى perType تطبيقات ناجحة.
 * يعيد [{ id, mutation, ar, expected, allowed, set, case, file, request, doc, base, note }].
 */
export function buildCorpus({ stage = BASE_STAGE, perType = 3, base = loadBase(stage) } = {}) {
  const byCase = new Map(); for (const b of base) { if (!byCase.has(b.case)) byCase.set(b.case, []); byCase.get(b.case).push(b); }
  const order = []; for (let i = 0; order.length < base.length; i++) for (const list of byCase.values()) if (list[i]) order.push(list[i]);
  const out = [];
  for (const mu of MUTATIONS) {
    let n = 0;
    for (const b of order) {
      if (n >= perType) break;
      const doc = clone(b.doc);
      let res; try { res = mu.apply(doc, { model: analyzeDoc(b.doc), request: b.request, case: b.case }); } catch (e) { res = null; }
      if (!res) continue;
      const finalDoc = res.replace || doc;
      finalDoc.title = `${b.case}/${b.file.replace('.json', '')} — ${mu.ar}`;
      out.push({ id: `${mu.id}@${b.case}-${b.file.replace('.json', '')}`, mutation: mu.id, ar: mu.ar, expected: mu.expected, allowed: mu.allowed, set: !!mu.set, case: b.case, file: b.file, request: b.request, doc: finalDoc, base: b.doc, note: res.note, target: res.target || null });
      n++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- evaluation
export const DISTINCT_DEFAULT = true; // عتبة plan-review المعايرة (arch-difference THRESHOLDS.cosmetic)
/** يقيّم المجموعة بوحدة مراجعة معيّنة (الحالية أو نسخة سابقة) ويعيد الصفوف والملخص. */
export function evaluateCorpus(corpus, reviewer, { clean = loadBase(BASE_STAGE) } = {}) {
  const { reviewDesign, reviewDesigns } = reviewer;
  const rows = [];
  for (const c of corpus) {
    let r;
    if (c.set) {
      // الزوج متطابق تنظيميًا: أيهما رُتّب ثانيًا هو «النسخة»؛ الكشف = رفض أحدهما بشرط الاختلاف
      const both = reviewDesigns([c.base, c.doc], c.request, { external: false, distinct: DISTINCT_DEFAULT });
      r = both.find(x => x.failedGates.includes('DISTINCT')) || both.find(x => x.index === 1);
    } else r = reviewDesign(c.doc, c.request, { external: false });
    const fired = r.failedGates;
    rows.push({ id: c.id, mutation: c.mutation, ar: c.ar, case: c.case, file: c.file, expected: c.expected, allowed: c.allowed, note: c.note,
      passed: r.passed, fired, detected: c.expected.every(g => fired.includes(g)), rejected: !r.passed,
      unexpected: fired.filter(g => !c.expected.includes(g) && !c.allowed.includes(g)), score: r.score, reasons: r.rejectReasons_ar.slice(0, 4) });
  }
  const cleanRows = clean.map(b => { const r = reviewDesign(b.doc, b.request, { external: false }); return { id: `${b.case}/${b.file}`, passed: r.passed, fired: r.failedGates, score: r.score }; });
  // البدائل الأصلية كمجموعة: هل يرفض شرط الاختلاف أي بديل حقيقي؟
  const cleanSets = [...new Set(clean.map(b => b.case))].map(id => { const docs = clean.filter(b => b.case === id); const rv = reviewDesigns(docs.map(d => d.doc), docs[0].request, { external: false, distinct: DISTINCT_DEFAULT }); return { case: id, rejectedAsDuplicate: rv.filter(x => x.failedGates.includes('DISTINCT')).map(x => docs[x.index].file) }; });
  return { rows, clean: cleanRows, cleanSets, summary: summarize(rows, cleanRows) };
}
const mean = a => (a.length ? Math.round(100 * a.reduce((s, x) => s + x, 0) / a.length) / 100 : null);
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
export function summarize(rows, cleanRows) {
  const types = [...new Set(rows.map(r => r.mutation))];
  const gates = [...new Set(rows.flatMap(r => [...r.expected, ...r.fired]))];
  const perType = types.map(t => { const rs = rows.filter(r => r.mutation === t); return { mutation: t, ar: rs[0].ar, expected: rs[0].expected, n: rs.length, detected: rs.filter(r => r.detected).length, rejected: rs.filter(r => r.rejected).length, meanScore: mean(rs.map(r => r.score)), fired: Object.fromEntries(gates.map(g => [g, rs.filter(r => r.fired.includes(g)).length]).filter(([, v]) => v)) }; });
  const ds = rows.map(r => r.score), cs = cleanRows.map(r => r.score);
  return {
    n: rows.length, detected: rows.filter(r => r.detected).length, rejected: rows.filter(r => r.rejected).length,
    cleanN: cleanRows.length, cleanPassed: cleanRows.filter(r => r.passed).length,
    perType, gates,
    confusion: Object.fromEntries(types.map(t => [t, Object.fromEntries(gates.map(g => [g, rows.filter(r => r.mutation === t && r.fired.includes(g)).length]))])),
    scores: { defective: { mean: mean(ds), min: Math.min(...ds), p50: q(ds, 0.5), max: Math.max(...ds) }, clean: { mean: mean(cs), min: Math.min(...cs), p50: q(cs, 0.5), max: Math.max(...cs) },
      defectivePassed: rows.filter(r => r.passed).map(r => ({ id: r.id, score: r.score })), defectiveAboveCleanMin: rows.filter(r => r.score >= Math.min(...cs)).length },
  };
}

// --------------------------------------------------------------------------------------------------- CLI
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const reviewerPath = opt('--reviewer'), tag = opt('--tag') || 'after', write = !argv.includes('--no-write');
  const reviewer = await import(reviewerPath ? pathToFileURL(reviewerPath).href : '../dist/plan-review.mjs');
  const corpus = buildCorpus();
  const res = evaluateCorpus(corpus, reviewer);
  const OUT = ROOT + 'evidence/review-proof/';
  if (write) {
    mkdirSync(OUT + 'corpus', { recursive: true });
    if (tag === 'after') for (const c of corpus) writeFileSync(OUT + 'corpus/' + c.id.replace(/[@/]/g, '__') + '.json', JSON.stringify({ id: c.id, mutation: c.mutation, ar: c.ar, expected: c.expected, allowed: c.allowed, set: c.set, case: c.case, file: c.file, note: c.note, target: c.target, request: c.request, doc: c.doc }));
    writeFileSync(OUT + `detection-${tag}.json`, JSON.stringify({ reviewer: reviewer.PLAN_REVIEW_VERSION, tag, ...res }, null, 1));
  }
  const s = res.summary;
  console.log(`المراجع ${reviewer.PLAN_REVIEW_VERSION} (${tag}): ${s.n} مستندًا معيبًا — كُشف بالبوابة المتوقعة ${s.detected}، رُفض ${s.rejected}؛ النظيفة ${s.cleanPassed}/${s.cleanN} ناجحة`);
  for (const t of s.perType) console.log(`  ${t.mutation.padEnd(26)} ${t.detected}/${t.n} كشف، ${t.rejected}/${t.n} رفض، متوسط الدرجة ${t.meanScore}  ${JSON.stringify(t.fired)}`);
  console.log('الدرجات:', JSON.stringify(s.scores));
  for (const r of res.rows.filter(r => !r.detected || r.unexpected.length)) console.log('  ↯', r.id, 'أُطلق', r.fired.join('+') || '—', r.unexpected.length ? 'غير متوقع: ' + r.unexpected.join('+') : '');
  console.log('مجموعات نظيفة رُفض فيها بديل كمكرر:', JSON.stringify(res.cleanSets.filter(x => x.rejectedAsDuplicate.length)));
}
