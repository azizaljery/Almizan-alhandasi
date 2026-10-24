// محرك التعديل الموضعي (plan-edit): يعدّل المستند المعروض نفسه (mizan-draw/1) ولا يعيد توليد البيت.
//
// شرط المالك: «اختبر فهم الطلبات العربية الطويلة والتعديلات المتتابعة، مع إثبات عدم تغيير أجزاء لم يطلب
// العميل تعديلها». لذلك كل تعديل هنا عملية هندسية صغيرة على الجدران نفسها:
//   - الواجهة/المادة: حقل في المستند (doc.finish.facade) — الهندسة نفسها حرفيًا.
//   - تكبير/تصغير غرفة: يُزاح جدار واحد من جدرانها؛ يتغير معها الجار على تلك الجهة فقط (الممرات والصالة
//     والخدمة أولًا)، أو يُزاح الجدار الخارجي داخل خطوط الارتداد فلا تتغير غرفة أخرى.
//   - حذف غرفة: تُزال من الغلاف إن كانت على طرفه، أو تُدمج في جار (ممر/صالة أولًا)، أو تصير مخزنًا.
//   - إضافة غرفة: امتداد للغلاف على جهة حرة داخل الارتداد، أو اقتطاع من أكبر غرفة مناسبة في المنطقة نفسها.
//     لا تُحذف غرفة ولا مدخل قائم أبدًا.
//   - مبادلة غرفتين متقاربتي المساحة (لنقل غرفة إلى جهة أو بجوار أخرى)، وفتح/إغلاق المطبخ، وباب خارجي لغرفة.
//   - التراجع: من سجل الجلسة (تصميم سابق) مع إعادة تطبيق التعديلات المحلية المطلوب إبقاؤها.
// بعد كل تعديل: بوابات plan-review (لا بوابة كانت ناجحة ترسب)، وثبات كل غرفة أخرى مقيسًا (مساحة/مركز/فتحات).
// إن رسب المرشح يُجرَّب التالي؛ وإن لم يوجد حل موضعي يُقال ذلك صراحة (status:'fallback') ولا يُدّعى شيء.
import { invariants, regressions } from './change-guard.mjs';
const R20_GUARD_OFF = String(globalThis.process?.env?.R14_OFF || '').includes('r20guard');
import { analyzeDoc } from './draw/digest.mjs';
import { serialize, parseDoc, nextId, fitOpening, validateDoc } from './draw/doc.mjs';
import { mergeFinish } from './draw/doc.mjs';
import { normalizeAr } from './requirements.mjs';
import { verifyRules } from './rules.mjs';
import { evaluateGates } from './plan-review.mjs';
import { openingConsistency, clearOpeningsOfJunctions } from './draw/wall-geometry.mjs';
import { ROOM_TYPES } from './draw/catalog.mjs';
import { refreshParking } from './site-parking.mjs';

export const PLAN_EDIT_VERSION = 'plan-edit/1.0.0';
/** حدود «تغيّر دون طلب» (مثل أداة إثبات الحوار): مساحة > 5٪ أو إزاحة مركز > 0.5 م. */
export const KEEP = Object.freeze({ areaPct: 5, shift: .5 });

const E = .02;
const r2 = v => Math.round(v * 100) / 100, R3 = v => Math.round(v * 1000) / 1000;
const near = (a, b, e = E) => Math.abs(a - b) <= e;
const clone = v => JSON.parse(JSON.stringify(v));
const isV = w => Math.abs(w.a.x - w.b.x) < 1e-6, isH = w => Math.abs(w.a.y - w.b.y) < 1e-6;
const axisOfWall = w => isV(w) ? 'x' : isH(w) ? 'y' : null; // 'x' = خط رأسي x=ثابت (الامتداد على y)
const alongOf = (p, ax) => ax === 'x' ? p.y : p.x, acrossOf = (p, ax) => ax === 'x' ? p.x : p.y;
const PT = (ax, across, along) => ax === 'x' ? { x: R3(across), y: R3(along) } : { x: R3(along), y: R3(across) };
const spanOf = (w, ax) => { const s = alongOf(w.a, ax), t = alongOf(w.b, ax); return [Math.min(s, t), Math.max(s, t)]; };
const onLine = (w, ax, c) => axisOfWall(w) === ax && near(acrossOf(w.a, ax), c);
const other = ax => ax === 'x' ? 'y' : 'x';
const DOORISH = k => ['door', 'door2', 'slider', 'arch', 'garage'].includes(k);
const isWin = k => k === 'window' || k === 'window2';
class EditFail extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }
const fail = (code, msg) => { throw new EditFail(code, msg); };

// ------------------------------------------------------------------------------------------ قراءة المستند
/** جدول الغرف المسماة: المساحة والمركز والمستطيل (محاور الجدران والصافي) والشكل والفتحات والجيران لكل جهة. */
export function inspect(doc) {
  const A = analyzeDoc(doc), rooms = new Map();
  let unlabelled = 0, stubs = 0, gaps = 0, orphans = 0, dups = 0;
  for (const L of A.levels) {
    stubs += L.analysis.stubs.length; gaps += L.analysis.gaps.length; orphans += L.orphanLabels.length; dups += L.duplicates.length;
    const bySpace = new Map(L.rooms.map(r => [r.spaceId, r]));
    for (const r of L.rooms) {
      if (r.unlabelled) { if (r.area > .3) unlabelled++; continue; }
      const P = r.space.polygon, xs = P.map(p => p.x), ys = P.map(p => p.y), nx = (r.net || P).map(p => p.x), ny = (r.net || P).map(p => p.y);
      let doors = 0, windows = 0, arches = 0; const links = [];
      for (const op of L.openings) for (const s of op.sides || []) if (s.room.id === r.id) { if (op.window) windows++; else if (op.door) { doors++; if (op.kind === 'arch') arches++; links.push({ id: op.id, kind: op.kind, to: s.other }); } }
      const sides = { x0: [], x1: [], y0: [], y1: [] };
      const cl = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      for (const e of r.edges) {
        const ax = near(e.a.x, e.b.x, 1e-6) ? 'x' : near(e.a.y, e.b.y, 1e-6) ? 'y' : null; if (!ax) continue;
        const c = acrossOf(e.a, ax), s0 = Math.min(alongOf(e.a, ax), alongOf(e.b, ax)), s1 = Math.max(alongOf(e.a, ax), alongOf(e.b, ax));
        const key = ax === 'x' ? (near(c, cl.x0) ? 'x0' : near(c, cl.x1) ? 'x1' : null) : (near(c, cl.y0) ? 'y0' : near(c, cl.y1) ? 'y1' : null);
        const nb = e.outside || e.space === undefined ? 'outside' : (bySpace.get(e.space)?.unlabelled ? 'void' : bySpace.get(e.space)?.id || 'void');
        (key ? sides[key] : (sides.inner ||= [])).push({ ax, c, s0, s1, nb, len: s1 - s0, wallIds: e.wallIds });
      }
      rooms.set(r.id, { id: r.id, name: r.name, type: r.type, level: L.level.id, area: r.area, cx: r.centroid.x, cy: r.centroid.y, shape: r.shape, rect: clRect(P), cl, net: { x0: Math.min(...nx), x1: Math.max(...nx), y0: Math.min(...ny), y1: Math.max(...ny) }, doors, windows, arches, links, sides, label: r.label, inside: r.inside });
    }
  }
  const outline = A.levels.map(L => L.analysis.outlines.map(o => o.centerline.map(p => `${r2(p.x)},${r2(p.y)}`).join(' ')).sort().join('|')).join('#');
  const outlineVerts = A.levels[0] ? A.levels[0].analysis.outlines.reduce((s, o) => s + o.centerline.length, 0) : 0;
  return { rooms, unlabelled, stubs, gaps, orphans, dups, outline, outlineVerts, model: A };
}
const roomList = I => [...I.rooms.values()];
/** مستطيل بمحاور الجدران (لا بالصافي: اختلاف سماكات الجدران يكسر الصافي إلى مضلع بلا أن تكون الغرفة غير منتظمة). */
function clRect(P) {
  const q = P.filter((b, i) => { const a = P[(i + P.length - 1) % P.length], c = P[(i + 1) % P.length]; return Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > 1e-6; });
  return q.length === 4 && q.every((b, i) => { const c = q[(i + 1) % 4]; return Math.abs(b.x - c.x) < 1e-6 || Math.abs(b.y - c.y) < 1e-6; });
}
/** معرّف الغرفة عند نقطة في المستند قبل التعديل ('outside' خارج المبنى). */
const ownerAt = (I, level, p) => { const L = I.model.levelById.get(level), r = L?.roomAt(p); return r ? (r.unlabelled ? 'void:' + r.spaceId : r.id) : 'outside'; };
const wallById = (doc, id) => doc.walls.find(w => w.id === id);

// ------------------------------------------------------------------------------------------ أدوات الجدران
function openingsOf(doc, w) {
  const ax = axisOfWall(w), dir = Math.sign(alongOf(w.b, ax) - alongOf(w.a, ax)) || 1;
  return doc.openings.filter(o => o.wall === w.id).map(o => ({ o, pos: alongOf(w.a, ax) + dir * o.at, half: o.w / 2 }));
}
function placeOpening(w, o, pos) {
  const ax = axisOfWall(w), a = alongOf(w.a, ax), b = alongOf(w.b, ax), L = Math.abs(b - a);
  let at = Math.abs(pos - a);
  if (L < o.w + .1) return false;
  at = Math.max(o.w / 2 + .05, Math.min(L - o.w / 2 - .05, at));
  o.wall = w.id; o.at = R3(at); return true;
}
/**
 * يستبدل جدارًا على خطه بقطع: [{ from, to, across?, remove? }]. الفتحات تبقى في موضعها الفعلي على القطعة التي
 * تحويها (أو تُزاح داخلها قليلًا)، وما وقع في قطعة محذوفة يُحذف ويُعاد. يرمي إن تعذّر وضع فتحة.
 */
function replaceWall(doc, w, pieces, log) {
  const ax = axisOfWall(w), c = acrossOf(w.a, ax), inc = alongOf(w.b, ax) >= alongOf(w.a, ax);
  const ops = openingsOf(doc, w), made = [];
  doc.walls = doc.walls.filter(x => x !== w);
  pieces.forEach(p => {
    if (p.remove || p.to - p.from < .05) return;
    const nw = { ...clone(w), id: made.length ? nextId(doc, 'walls') : w.id };
    const cc = p.across ?? c;
    nw.a = PT(ax, cc, inc ? p.from : p.to); nw.b = PT(ax, cc, inc ? p.to : p.from);
    doc.walls.push(nw); made.push({ w: nw, p });
  });
  for (const { o, pos, half } of ops) {
    const host = made.find(m => pos >= m.p.from - 1e-6 && pos <= m.p.to + 1e-6) || made.find(m => pos - half < m.p.to && pos + half > m.p.from);
    const dead = pieces.find(p => p.remove && pos > p.from + 1e-6 && pos < p.to - 1e-6);
    if (dead || !host) { doc.openings = doc.openings.filter(x => x !== o); log?.removed?.push(clone(o)); continue; }
    if (!placeOpening(host.w, o, pos)) fail('OPENING_FIT', 'فتحة لا تتسع بعد التعديل.');
    if (Math.abs(alongOf(host.w.a, ax) + (inc ? 1 : -1) * o.at - pos) > .4) fail('OPENING_SHIFT', 'فتحة ستنزاح عن موضعها.');
  }
  return made.map(m => m.w);
}
/** يغيّر طرف جدار مع إبقاء فتحاته في مواضعها الفعلية (يرمي إن خرجت فتحة عن الجدار). */
function setEnd(doc, w, end, p) {
  const ax = axisOfWall(w), ops = openingsOf(doc, w);
  w[end] = { x: R3(p.x), y: R3(p.y) };
  const a = alongOf(w.a, ax), b = alongOf(w.b, ax), L = Math.abs(b - a), dir = Math.sign(b - a) || 1;
  if (L < .3) fail('WALL_SHORT', 'جدار سيصير أقصر من اللازم.');
  // الفتحة تبقى في موضعها الفعلي؛ إن قصر الجدار عنها تنزلق داخله (إن اتسع لها) لا تُحذف
  for (const { o, pos } of ops) { let at = (pos - a) * dir; if (L < o.w + .12) fail('OPENING_OFF', 'فتحة لا تتسع في جدارها بعد التعديل.'); at = Math.max(o.w / 2 + .05, Math.min(L - o.w / 2 - .05, at)); o.at = R3(at); }
}
function coverage(doc, level, ax, c, s0, s1, skip = new Set()) {
  const iv = doc.walls.filter(w => w.level === level && !skip.has(w.id) && onLine(w, ax, c)).map(w => spanOf(w, ax)).filter(([a, b]) => b > s0 + 1e-6 && a < s1 - 1e-6).sort((p, q) => p[0] - q[0]);
  const gaps = []; let at = s0;
  for (const [a, b] of iv) { if (a > at + E) gaps.push([at, a]); at = Math.max(at, b); if (at >= s1 - E) break; }
  if (at < s1 - E) gaps.push([at, s1]);
  return gaps;
}
function addWall(doc, level, a, b, t, kind = 'wall') {
  const w = { id: nextId(doc, 'walls'), level, a: { x: R3(a.x), y: R3(a.y) }, b: { x: R3(b.x), y: R3(b.y) }, t, h: null, kind };
  doc.walls.push(w); return w;
}
function addOpening(doc, w, kind, pos, width, extra = {}) {
  const ax = axisOfWall(w), a = alongOf(w.a, ax), b = alongOf(w.b, ax), dir = Math.sign(b - a) || 1;
  const DEF = { door: { h: 2.1, sill: 0 }, door2: { h: 2.1, sill: 0 }, arch: { h: 2.3, sill: 0 }, window: { h: 1.2, sill: 1 }, window2: { h: 1.5, sill: .8 } }[kind];
  const at = fitOpening(doc, w, (pos - a) * dir, width);
  const o = { id: nextId(doc, 'openings'), level: w.level, wall: w.id, kind, at: R3(at), w: width, h: DEF.h, sill: DEF.sill, swing: DOORISH(kind) ? 'in' : null, hinge: 'left', entry: false, ...extra };
  doc.openings.push(o); return o;
}
const wallAt = (doc, level, ax, c, s, margin = 0) => doc.walls.find(w => w.level === level && onLine(w, ax, c) && spanOf(w, ax)[0] <= s - margin + 1e-6 && spanOf(w, ax)[1] >= s + margin - 1e-6);

/**
 * يزيح ما على الخط (ax، c) بين s0 وs1 مسافة d (موجبة نحو +المحور)، أو يحذفه إن d === null.
 * الجدران العمودية التي تنتهي على الخط داخل المقطع تُمدّ أو تُقصّر، ويُغلق المقطع المزاح عند طرفيه بجدار إن لم
 * يغطّه جدار قائم. يعيد الشريط المكتسب/المفقود { ax, c0, c1, s0, s1 }.
 */
function moveSpan(doc, level, ax, c, s0, s1, d, { closureT = null, log = null, I = null } = {}) {
  // عند كل طرف: هل المنطقة خلف الطرف (بين الخط القديم والجديد) هي نفسها الكاسبة؟ عندها يُزال الجدار بينهما، وإلا يُغلق
  const ends = new Map();
  if (d !== null && I) {
    const sg = Math.sign(d);
    for (const s of [s0, s1]) {
      const inward = s === s0 ? 1 : -1;
      const gainer = ownerAt(I, level, PT(ax, c - sg * .3, s + inward * .3)), beyond = ownerAt(I, level, PT(ax, c + d / 2, s - inward * .3));
      ends.set(s, gainer === beyond ? 'remove' : 'ensure');
    }
  }
  const walls = doc.walls.filter(w => w.level === level && onLine(w, ax, c) && spanOf(w, ax)[1] > s0 + E && spanOf(w, ax)[0] < s1 - E);
  if (coverage(doc, level, ax, c, s0, s1).length) fail('NO_WALL', 'الحد بين الغرفتين ليس جدارًا متصلًا.');
  let movedT = null;
  for (const w of walls) {
    const [w0, w1] = spanOf(w, ax); movedT ??= w.t;
    const pieces = [];
    if (s0 > w0 + E) pieces.push({ from: w0, to: s0 });
    pieces.push(d === null ? { from: Math.max(w0, s0), to: Math.min(w1, s1), remove: true } : { from: Math.max(w0, s0), to: Math.min(w1, s1), across: c + d });
    if (w1 > s1 + E) pieces.push({ from: s1, to: w1 });
    replaceWall(doc, w, pieces, log);
  }
  // الجدران العمودية التي تنتهي على الخط داخل المقطع
  const ox = other(ax);
  for (const w of doc.walls.filter(x => x.level === level && axisOfWall(x) === ox)) {
    for (const end of ['a', 'b']) {
      const p = w[end], q = w[end === 'a' ? 'b' : 'a'];
      if (!near(acrossOf(p, ax), c, .003)) continue;
      const s = alongOf(p, ax); if (s <= s0 + E || s >= s1 - E) continue;
      if (d === null) fail('STEM', 'جدار سيبقى معلّقًا بعد الإزالة.');
      const qa = acrossOf(q, ax) - c;
      if (qa * d > 0 && Math.abs(qa) < Math.abs(d) + .3) fail('STEM_SHORT', 'جدار عمودي سيصير أقصر من اللازم.');
      setEnd(doc, w, end, PT(ax, c + d, s));
    }
  }
  if (d !== null) {
    for (const s of [s0, s1]) {
      const lo = Math.min(c, c + d), hi = Math.max(c, c + d);
      if (ends.get(s) === 'remove') { cutRange(doc, level, ox, s, lo, hi, log); continue; }
      for (const [g0, g1] of coverage(doc, level, ox, s, lo, hi)) addWall(doc, level, PT(ax, g0, s), PT(ax, g1, s), closureT ?? movedT ?? .12);
    }
    // خطوط الأبعاد: نقطة على المقطع المزاح تنتقل معه؛ وبُعد على امتداد الخط نفسه يُزاح كله إن وقع كله في المقطع وإلا يبقى
    const inSpan = p => near(acrossOf(p, ax), c, .01) && alongOf(p, ax) >= s0 - E && alongOf(p, ax) <= s1 + E;
    for (const dm of doc.dimensions || []) {
      const ia = inSpan(dm.a), ib = inSpan(dm.b), parallel = near(acrossOf(dm.a, ax), c, .01) && near(acrossOf(dm.b, ax), c, .01);
      if (parallel && ia !== ib) continue;
      if (ia) dm.a = PT(ax, acrossOf(dm.a, ax) + d, alongOf(dm.a, ax));
      if (ib) dm.b = PT(ax, acrossOf(dm.b, ax) + d, alongOf(dm.b, ax));
    }
  }
  return { ax, c0: Math.min(c, c + (d || 0)), c1: Math.max(c, c + (d || 0)), s0, s1 };
}
/** يحذف ما على الخط (ax، c) بين lo وhi (بلا شروط على الجدران العمودية). */
function cutRange(doc, level, ax, c, lo, hi, log) {
  for (const w of doc.walls.filter(x => x.level === level && onLine(x, ax, c) && spanOf(x, ax)[1] > lo + E && spanOf(x, ax)[0] < hi - E)) {
    const [w0, w1] = spanOf(w, ax), pieces = [];
    if (lo > w0 + E) pieces.push({ from: w0, to: lo });
    pieces.push({ from: Math.max(w0, lo), to: Math.min(w1, hi), remove: true });
    if (w1 > hi + E) pieces.push({ from: hi, to: w1 });
    replaceWall(doc, w, pieces, log);
  }
}
const inStrip = (p, st, m = 0) => st && (st.ax === 'x' ? p.x > st.c0 - m && p.x < st.c1 + m && p.y > st.s0 - m && p.y < st.s1 + m : p.y > st.c0 - m && p.y < st.c1 + m && p.x > st.s0 - m && p.x < st.s1 + m);
function dropFixtures(doc, level, test) {
  const before = doc.fixtures.length;
  doc.fixtures = doc.fixtures.filter(f => !(f.level === level && test(f)));
  return before - doc.fixtures.length;
}
const fixBox = f => { const c = Math.abs(Math.cos(f.rot || 0)), s = Math.abs(Math.sin(f.rot || 0)), hw = (f.w * c + f.d * s) / 2, hd = (f.w * s + f.d * c) / 2; return { x0: f.x - hw, x1: f.x + hw, y0: f.y - hd, y1: f.y + hd }; };
/** يزيل الأثاث الذي يقطعه جدار المستند الآن (بعد إزاحة جدار). */
function dropCutFixtures(doc, level) {
  const walls = doc.walls.filter(w => w.level === level);
  return dropFixtures(doc, level, f => { const b = fixBox(f); return walls.some(w => { const ax = axisOfWall(w); if (!ax) return false; const c = acrossOf(w.a, ax), [s0, s1] = spanOf(w, ax), t = w.t / 2; return ax === 'x' ? c + t > b.x0 + .02 && c - t < b.x1 - .02 && s1 > b.y0 && s0 < b.y1 : c + t > b.y0 + .02 && c - t < b.y1 - .02 && s1 > b.x0 && s0 < b.x1; }); });
}
/** نقطة داخل غرفة قديمة خارج شريط معيّن (لإعادة وضع تسمية فقدت مكانها). */
function anchorOutside(room, strip) {
  const cand = [room.label?.seed, { x: room.cx, y: room.cy }, room.inside].filter(Boolean);
  for (const p of cand) if (!inStrip(p, strip, .3)) return p;
  const n = room.net;
  for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) { const p = { x: n.x0 + (n.x1 - n.x0) * i / 10, y: n.y0 + (n.y1 - n.y0) * j / 10 }; if (!inStrip(p, strip, .3)) return p; }
  return null;
}

// ------------------------------------------------------------------------------------------ التحقق من المرشح
const TYPE_W = { corridor: .6, entrance: .8, living: 2, storage: 1, laundry: 1.2, other: 2, bath: 2.5, service: 2.5, office: 3, dining: 3.5, kitchen: 4, bedroom: 5, master: 6, majlis: 6 };
/** تغيّر كل غرفة بين مستندين (بالمعرّف = التسمية)، وثبات الرسم، والبوابات الجديدة الراسبة. */
export function compareDocs(before, after, { scope = new Set(), request = {}, gates = true, Ib = null, byName = false } = {}) {
  const B0 = Ib || inspect(before), A0 = inspect(after), changed = [], why = [];
  // بعد إعادة التوليد تتغير المعرّفات: تُطابق الغرف بالاسم والدور (والأقرب مركزًا عند تكرار الاسم)
  const B = B0, A = byName ? rekey(B0, A0) : A0;
  if (A.unlabelled > B.unlabelled) why.push('ظهر فراغ بلا تسمية');
  if (A.stubs > B.stubs) why.push('جدار معلّق');
  if (A.orphans > B.orphans || A.dups > B.dups) why.push('تسمية خارج غرفتها');
  if (A.gaps > B.gaps) why.push('ثغرة في الجدران');
  for (const [id, b] of B.rooms) {
    const a = A.rooms.get(id);
    if (!a) { changed.push({ id, name: b.name, type: b.type, kind: 'removed', inScope: scope.has(id), areaBefore: r2(b.area) }); continue; }
    const pct = 100 * (a.area - b.area) / Math.max(.01, b.area), shift = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    const big = Math.abs(pct) > KEEP.areaPct || shift > KEEP.shift, ops = a.doors !== b.doors || a.windows !== b.windows || a.arches !== b.arches, shape = b.rect && !a.rect;
    if (big || ops || shape || a.name !== b.name) changed.push({ id, name: a.name, nameBefore: b.name, type: a.type, kind: big ? 'resized' : a.name !== b.name ? 'renamed' : ops ? 'openings' : 'shape', inScope: scope.has(id), areaBefore: r2(b.area), areaAfter: r2(a.area), areaPct: r2(pct), shift: r2(shift), shape: shape ? a.shape : undefined, doors: a.doors - b.doors, windows: a.windows - b.windows, big });
  }
  // الغرفة المانحة لا تُفرَّغ: تبقى فوق أدنى عرض ومساحة لنوعها، ولا تخسر أكثر من ثلثها (والممر نصفه)
  for (const c of changed) {
    if (c.inScope || c.kind !== 'resized' || !(c.areaPct < 0)) continue;
    const a = A.rooms.get(c.id), b = B.rooms.get(c.id), T = ROOM_TYPES[a.type] || ROOM_TYPES.other, wOf = r => Math.min(r.net.x1 - r.net.x0, r.net.y1 - r.net.y0), w = wOf(a);
    const circ = a.type === 'corridor' || a.type === 'entrance';
    if (w < wOf(b) - .01 && w < Math.max(T.minWidth || 0, circ ? 1.2 : 0) - 1e-6) why.push(`«${a.name}» يضيق إلى ${r2(w)} م`);
    // (الجولة العاشرة) فراغ كان أصلًا دون حده الأدنى ويخسر أقل من 5٪ لا يُرفض به المرشح (يُعلن تغيّره كغيره)
    else if (a.area < (T.minArea || 0) - 1e-6 && !(b.area < (T.minArea || 0) && a.area >= b.area * .95)) why.push(`«${a.name}» تصغر إلى ${r2(a.area)} م²`);
    else if (c.areaPct < (circ ? -50 : -34)) why.push(`«${a.name}» تخسر ${-c.areaPct}٪ من مساحتها`);
  }
  for (const [id, a] of A.rooms) if (!B.rooms.has(id)) changed.push({ id, name: a.name, type: a.type, kind: 'added', inScope: scope.has(id), areaAfter: r2(a.area) });
  let newFails = [];
  if (gates && !why.length) {
    // (الجولة الحادية عشرة) ومعها التطابق 2D/3D (سريع): تعديل لا يضع فتحة على تقاطع جدارين ولا فتحة يُسقطها المجسّم
    const gb = new Set(evaluateGates(before, request, undefined, { heavy: ['CONSISTENCY_2D3D'] }).filter(g => !g.ok).map(g => g.id));
    const ga = evaluateGates(after, request, undefined, { heavy: ['CONSISTENCY_2D3D'] }).filter(g => !g.ok && !gb.has(g.id));
    newFails = ga.map(g => ({ id: g.id, ar: g.ar, reasons: g.reasons_ar.slice(0, 2) }));
    if (newFails.length) why.push('بوابة راسبة: ' + newFails.map(g => g.ar + (g.reasons[0] ? ` (${g.reasons[0]})` : '')).join('، '));
  }
  let cost = 0;
  for (const c of changed) {
    if (c.inScope) continue;
    const w = TYPE_W[c.type] ?? 2;
    if (c.kind === 'removed' || c.kind === 'added') cost += 20;
    else if (c.big) cost += w * (1 + Math.min(4, Math.abs(c.areaPct || 0) / 25));
    else if (c.kind === 'shape') cost += c.type === 'corridor' || c.type === 'entrance' ? .5 : 1.5;
    else if (c.kind === 'openings') cost += .4;
    else if (c.kind === 'renamed') cost += 3;
    if (c.big && c.shape) cost += c.type === 'corridor' || c.type === 'entrance' ? .5 : 1.5;
  }
  const envelope = A.outline !== B.outline;
  if (envelope) cost += 1 + Math.max(0, A.outlineVerts - B.outlineVerts) * .3;
  return { ok: !why.length, why, changed, cost: r2(cost), envelope, I: A, newFails };
}
function rekey(B, A) {
  const out = new Map(), used = new Set(), list = [...A.rooms.values()];
  const pairs = [];
  for (const b of B.rooms.values()) for (const a of list) if (a.name === b.name && a.level === b.level) pairs.push({ b, a, d: Math.hypot(a.cx - b.cx, a.cy - b.cy) });
  pairs.sort((p, q) => p.d - q.d); const doneB = new Set();
  for (const { a, b } of pairs) if (!used.has(a.id) && !doneB.has(b.id)) { used.add(a.id); doneB.add(b.id); out.set(b.id, { ...a, id: b.id }); }
  for (const a of list) if (!used.has(a.id)) out.set('new:' + a.id, { ...a, id: 'new:' + a.id });
  return { ...A, rooms: out };
}
/** التغيّرات المعلنة للعميل: غير المطلوبة أولًا (ما تغيّر خارج النطاق فوق الحدين). */
export function describeChanges(changed) {
  const AR = c => c.kind === 'removed' ? `«${c.name}» أزيلت` : c.kind === 'added' ? `«${c.name}» أضيفت (${c.areaAfter} م²)` : c.kind === 'renamed' ? `«${c.nameBefore}» صارت «${c.name}»` : c.kind === 'openings' ? `«${c.name}»: تغيّرت فتحاتها فقط (أبواب ${c.doors >= 0 ? '+' : ''}${c.doors}، نوافذ ${c.windows >= 0 ? '+' : ''}${c.windows})` : c.kind === 'shape' ? `«${c.name}»: شكلها صار ${c.shape === 'L' ? 'على شكل L' : 'غير مستطيل'} بالمساحة نفسها تقريبًا` : (Math.abs(c.areaPct || 0) < .5 && c.shift > KEEP.shift ? `«${c.name}» انتقلت بالمساحة نفسها (${c.areaAfter} م²؛ انزاح مركزها ${c.shift} م)` : `«${c.name}» ${c.areaAfter > c.areaBefore ? 'كبرت' : 'صغرت'} من ${c.areaBefore} إلى ${c.areaAfter} م² (${c.areaPct > 0 ? '+' : ''}${c.areaPct}٪${c.shift > KEEP.shift ? `، وانزاح مركزها ${c.shift} م` : ''})`);
  return changed.map(c => ({ ...c, text_ar: AR(c) }));
}

// ------------------------------------------------------------------------------------------ مراجع الغرف في الكلام
const NUMW = { واحد: 1, وحده: 1, اثنين: 2, ثنتين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8 };
const toNum = s => s in NUMW ? NUMW[s] : Number(s);
const NUM = '\\d+|واحد|اثنين|ثنتين|ثلاث|ثلاثه|اربع|اربعه|خمس|خمسه|ست|سته|سبع|سبعه|ثمان';
// كل مرجع: نمط في الكلام المطبَّع، ومطابقة غرفة المستند. الترتيب مهم (الأخص أولًا).
const REFS = [
  { key: 'numbered', re: new RegExp(`غرف(?:ه)? (?:ال)?نوم (?:رقم )?(${NUM})(?!\\s*(?:×|في|by|\\.\\d))|(?<![\\u0600-\\u06FF])غرفه (?:رقم )?(\\d+)(?!\\s*(?:×|في|by|\\.\\d))`), pick: (rooms, m) => { const n = toNum(m[1] || m[2]); return rooms.filter(r => r.name === `غرفة نوم ${n}`); }, label: m => `غرفة نوم ${toNum(m[1] || m[2])}` },
  { key: 'women', re: /مجلس (?:ال)?(?:نساء|حريم|نسوان)/, pick: rooms => rooms.filter(r => r.name === 'مجلس النساء'), label: () => 'مجلس النساء' },
  { key: 'men', re: /مجلس (?:ال)?رجال|(?<![؀-ۿ])(?:ال|بال|و|وال|لل)?مجلس(?![؀-ۿ])|majlis/, pick: rooms => rooms.filter(r => r.type === 'majlis' && r.name !== 'مجلس النساء'), label: () => 'المجلس' },
  { key: 'master', re: /ماستر|(?:غرفه (?:ال)?نوم )?(?:ال)?رئيسيه|master/, pick: rooms => rooms.filter(r => r.type === 'master'), label: () => 'غرفة النوم الرئيسية' },
  { key: 'dining', re: /(?:صاله |غرفه )?(?:ال)?طعام|(?:ال)?مقلط|(?:ال)?سفره|dining/, pick: rooms => rooms.filter(r => r.type === 'dining'), label: () => 'الطعام' },
  { key: 'hall', re: /(?<![؀-ۿ])(?:ال|بال|و|وال|لل)?صاله(?! (?:ال)?طعام)|living/, pick: rooms => { const l = rooms.filter(r => r.type === 'living'); const m = l.filter(r => r.name === 'الصالة'); return m.length ? m : l; }, label: () => 'الصالة' },
  { key: 'kitchen', re: /(?:ال)?مطبخ|kitchen/, pick: rooms => rooms.filter(r => r.type === 'kitchen'), label: () => 'المطبخ' },
  { key: 'office', re: /(?<![؀-ۿ])(?:ال|بال|و|وال|لل)?مكتب(?!ه)/, pick: rooms => rooms.filter(r => r.name === 'المكتب' || r.type === 'office'), label: () => 'المكتب' },
  { key: 'prayer', re: /مصلي|مصلا/, pick: rooms => rooms.filter(r => r.name === 'المصلى'), label: () => 'المصلى' },
  { key: 'maid', re: /خادمه|خدامه|شغاله|عامله/, pick: rooms => rooms.filter(r => r.name === 'غرفة الخادمة'), label: () => 'غرفة الخادمة' },
  { key: 'driver', re: /سائق|سواق/, pick: rooms => rooms.filter(r => r.name === 'غرفة السائق'), label: () => 'غرفة السائق' },
  { key: 'laundry', re: /غسيل|لاندري/, pick: rooms => rooms.filter(r => r.name === 'غرفة الغسيل' || r.type === 'laundry'), label: () => 'غرفة الغسيل' },
  { key: 'storage', re: /مخزن|مستودع/, pick: rooms => rooms.filter(r => r.name === 'المخزن' || r.type === 'storage' && !/ملابس/.test(r.name)), label: () => 'المخزن' },
  { key: 'person', re: /غرف(?:ه)? (?:ال)?(?:نوم )?(?:ال|لل|ل)?(بنت|بنتي|البنت|البنات|الولد|ولد|ولدي|العيال|عيال|الاولاد|اولاد|الاطفال|اطفال|الكبير|الصغير|الصغيره|الكبيره|الضيوف|ضيوف|ابوي|امي|الوالد|الوالده|جدتي|جدي)(?![؀-ۿ])/, pick: (rooms, m) => rooms.filter(r => normalizeAr(r.name).includes(normalizeAr(m[1]).replace(/^ال/, ''))), label: m => `غرفة ${m[1].replace(/^ال/, 'ال')}`, ambiguous: true },
];
/** المراجع المذكورة في عبارة (بترتيب ظهورها): [{ key, ids, label, index, ambiguous }]. */
export function roomRefs(t, rooms) {
  const out = [], taken = [];
  for (const R of REFS) {
    const re = new RegExp(R.re.source, 'g');
    for (const m of t.matchAll(re)) {
      const s = m.index, e = s + m[0].length;
      if (taken.some(([a, b]) => s < b && e > a)) continue;
      taken.push([s, e]);
      const hits = R.pick(rooms, m);
      out.push({ key: R.key, ids: hits.map(r => r.id), names: hits.map(r => r.name), label: R.label(m), index: s, end: e, ambiguous: !!R.ambiguous && hits.length !== 1 });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

// ------------------------------------------------------------------------------------------ فهم طلب التعديل
const VERB_BIG = /(?:كبر|كبرو|وسع|وسعو|زود|زيد) ?(?:لي )?/;
const SMALL = /(?<![؀-ۿ])(?:شوي|شويه|شوية|شوي شوي|قليل|قليلا|بسيط|حبه|حبتين|شوي بس)(?![؀-ۿ])/;
const DIMS_RE = /(\d+(?:\.\d+)?)\s*(?:م|متر|m)?\s*(?:×|في|by)\s*(\d+(?:\.\d+)?)/;
const ADD_KIND = { maid: 'maid', driver: 'driver', office: 'office', prayer: 'prayer', laundry: 'laundry', storage: 'storage' };
const NAME_OF_KIND = { maid: 'غرفة الخادمة', driver: 'غرفة السائق', office: 'المكتب', prayer: 'المصلى', laundry: 'غرفة الغسيل', storage: 'المخزن' };
const AR_KIND = { maid: 'غرفة خادمة', driver: 'غرفة سائق', office: 'مكتب', prayer: 'مصلى', laundry: 'غرفة غسيل', storage: 'مخزن', bedroom: 'غرفة نوم' };
const SCALE_KEY = { majlisScale: 'men', hallScale: 'hall', kitchenScale: 'kitchen', bedroomScale: 'master' };
const DIM_KEY = { majlis: 'men', master: 'master', hall: 'hall', dining: 'dining', kitchen: 'kitchen', bedroom: 'numbered' };

/**
 * يحوّل نص التعديل (والفهم العام `more` من extractRequirements) إلى نوايا تعديل موضعية على المستند.
 * يعيد { intents:[…], unhandled:[نص عربي], questions:[…], keep } — unhandled: ما فُهم ولا حل موضعيًا له.
 */
export function parseEdit(text, doc, { more = null, history = [], lastSubject = null } = {}) {
  const t = normalizeAr(text), I = inspect(doc), rooms = roomList(I), intents = [], unhandled = [], questions = [];
  const refs = roomRefs(t, rooms), used = new Set();
  const refOf = key => refs.find(r => r.key === key);
  const firstRoomRef = () => refs.find(r => !['person'].includes(r.key) || r.ids.length === 1);
  const keep = /(?:خل|خلي|خلو|اترك|ابق|ابقي|احتفظ|حافظ)(?: على)? ?(?:كل (?:شي|شيء)|الباقي|باقي|بقيه|التوزيع|هذا التوزيع|نفس)|(?:الباقي|والباقي) (?:لا|ما) (?:تلمس|تغير|تحرك)|لا تلمس/.test(t) || !!more?.keepLayout;
  const ask = (q, ref) => questions.push({ type: 'ambiguous-room', key: 'amb|' + (ref?.label || q), question_ar: q });
  // غرفة غير محددة أو غير موجودة: سؤال لا تخمين
  for (const r of refs) {
    if (r.key === 'person' && r.ids.length !== 1) {
      const beds = rooms.filter(x => x.type === 'bedroom').map(x => x.name).sort();
      ask(`أي غرفة تقصد بـ«${r.label}»؟ في المخطط ${beds.length ? beds.map(n => `«${n}»`).join(' و') : 'لا توجد غرف نوم ثانوية'} — اكتب اسمها أو رقمها (مثل «غرفة نوم 2») ولن أغيّر شيئًا قبلها.`, r);
    } else if (r.key === 'numbered' && !r.ids.length) {
      const beds = rooms.filter(x => x.type === 'bedroom').map(x => x.name).sort();
      ask(`لا توجد «${r.label}» في المخطط المعروض؛ الغرف الموجودة: ${beds.map(n => `«${n}»`).join(' و') || 'لا شيء'} — أيها تقصد؟`, r);
    }
  }
  if (questions.length) return { intents: [], unhandled, questions, keep, refs };

  // 0) (الجولة العاشرة) الأبواب والنوافذ: فتح باب بين غرفتين، سدّ باب، نقل باب، تكبير/تصغير/إضافة نافذة.
  // تُقرأ قبل الحذف والتكبير: «كبّر نافذة الصالة» لا تكبّر الصالة، و«شيل باب المطبخ» لا تحذف المطبخ
  const opRefs = ref => ref ? [ref] : [];
  const DOOR = '(?:ال)?(?:باب|ابواب|بابين)', WIN = '(?:ال)?(?:نافذه|نوافذ|شباك|شبابيك|دريشه|دريشات)';
  const doorAdd = new RegExp(`(?<![؀-ۿ])(?:افتح|افتحو|اضف|ضيف|سو|سوي|حط|اعمل|ابي|ابغي|نبي|ودي)(?: لي| لنا)? ${DOOR}(?: جديد)? (?:بين|من)`).test(t) || new RegExp(`(?<![؀-ۿ])(?:اربط|وصل) .+ ب${DOOR}`).test(t);
  const doorClose = new RegExp(`(?<![؀-ۿ])(?:سد|سدو|سكر|سكرو|اقفل|اغلق|الغ|الغي|شيل|احذف|امسح|ازل|بلاش)(?: لي)? ${DOOR}`).test(t);
  const doorMove = new RegExp(`(?<![؀-ۿ])(?:انقل|حرك|زحزح|غير مكان|بدل مكان|غير موقع)(?: لي)? ${DOOR}`).test(t);
  const winBig = new RegExp(`(?<![؀-ۿ])(?:كبر|كبرو|وسع|وسعو|زود|زيد|عرض)(?: لي)? ${WIN}`).test(t);
  const winSmall = new RegExp(`(?<![؀-ۿ])(?:صغر|صغرو|ضيق|قلل)(?: لي)? ${WIN}`).test(t);
  const winAdd = new RegExp(`(?<![؀-ۿ])(?:افتح|اضف|ضيف|سو|سوي|حط|اعمل|ابي|ابغي|نبي)(?: لي| لنا)? ${WIN}`).test(t);
  const winClose = new RegExp(`(?<![؀-ۿ])(?:سد|سكر|اقفل|الغ|الغي|شيل|احذف|امسح|بلاش)(?: لي)? ${WIN}`).test(t);
  const takeRef = r => { for (const id of r.ids) { used.add('room:' + id); used.add('resize:' + id); } };
  const one = r => r && r.ids.length === 1;
  if (doorAdd || doorClose || doorMove) {
    const rs = refs.filter(one);
    rs.forEach(takeRef);
    const lastDoor = lastSubject && String(lastSubject).startsWith('door:') ? String(lastSubject).slice(5) : null;
    if (doorAdd) {
      if (rs.length >= 2) intents.push({ op: 'door', action: 'add', a: rs[0].ids[0], b: rs[1].ids[0], aName: rs[0].names[0], bName: rs[1].names[0], text_ar: `باب بين «${rs[0].names[0]}» و«${rs[1].names[0]}»` });
      else questions.push({ type: 'ambiguous-door', key: 'door|add', question_ar: `بين أي غرفتين تريد الباب؟ اذكر الغرفتين (مثل «افتح باب بين المطبخ والطعام») ولن أغيّر شيئًا قبلها.` });
    } else if (doorClose) {
      if (rs.length >= 2) intents.push({ op: 'door', action: 'close', a: rs[0].ids[0], b: rs[1].ids[0], aName: rs[0].names[0], bName: rs[1].names[0], text_ar: `سدّ الباب بين «${rs[0].names[0]}» و«${rs[1].names[0]}»` });
      else if (rs.length === 1) intents.push({ op: 'door', action: 'close', a: rs[0].ids[0], aName: rs[0].names[0], b: /(?:خارج|برا|بره|الشارع|الحوش)/.test(t) ? 'outside' : null, text_ar: `سدّ باب «${rs[0].names[0]}»` });
      else if (lastDoor) intents.push({ op: 'door', action: 'close', openingId: lastDoor, text_ar: 'سدّ الباب الذي عُدّل في الطلب السابق' });
      else questions.push({ type: 'ambiguous-door', key: 'door|close', question_ar: 'أي باب تقصد؟ اذكر الغرفة أو الغرفتين (مثل «سد الباب بين المطبخ والصالة») ولن أغيّر شيئًا قبلها.' });
    } else if (doorMove) {
      const to = rs[1] && /(?:على|الى|جهه|ناحيه|صوب|يفتح|يطل)/.test(t.slice(rs[0].end, rs[1].index)) ? rs[1] : null;
      if (rs.length) intents.push({ op: 'door', action: 'move', a: rs[0].ids[0], aName: rs[0].names[0], to: to ? to.ids[0] : null, toName: to ? to.names[0] : null, end: /(?:الطرف|الزاويه|الركن|الجانب|الطرف الثاني|الجهه الثانيه)/.test(t) ? 'far' : null, text_ar: `نقل باب «${rs[0].names[0]}»${to ? ` ليفتح على «${to.names[0]}»` : ''}` });
      else if (lastDoor) intents.push({ op: 'door', action: 'move', openingId: lastDoor, text_ar: 'نقل الباب الذي عُدّل في الطلب السابق' });
      else questions.push({ type: 'ambiguous-door', key: 'door|move', question_ar: 'باب أي غرفة تريد نقله؟ اذكرها (مثل «انقل باب غرفة نوم 2») ولن أغيّر شيئًا قبلها.' });
    }
  } else if (winBig || winSmall || winAdd || winClose) {
    const rs = refs.filter(one); rs.forEach(takeRef);
    const amountW = t.match(/(\d+(?:\.\d+)?)\s*(?:م|متر|سم)(?![؀-ۿ²2])/);
    const width = amountW ? (/سم/.test(amountW[0]) ? +amountW[1] / 100 : +amountW[1]) : null;
    const action = winBig ? 'bigger' : winSmall ? 'smaller' : winClose ? 'close' : 'add';
    const AR = { bigger: 'تكبير نافذة', smaller: 'تصغير نافذة', close: 'سدّ نافذة', add: 'إضافة نافذة' };
    if (rs.length) intents.push({ op: 'window', action, a: rs[0].ids[0], aName: rs[0].names[0], width, text_ar: `${AR[action]} «${rs[0].names[0]}»${width ? ` (${width} م)` : ''}` });
    else questions.push({ type: 'ambiguous-window', key: 'window|' + action, question_ar: 'نافذة أي غرفة تقصد؟ اذكرها (مثل «كبّر نافذة الصالة») ولن أغيّر شيئًا قبلها.' });
  }
  if (questions.length) return { intents: [], unhandled, questions, keep, refs };
  const openingOnly = intents.some(i => i.op === 'door' || i.op === 'window');

  // 1) التراجع والإرجاع
  const undoVerb = /(?<![؀-ۿ])(?:رجع|رجعه|رجعها|رجعو|ارجع|ارجعي|ترجع|رد|ردها|رده|تراجع|الغ(?:ي)? (?:اخر |ال)?تعديل|ابي (?:ال)?(?:تصميم|مخطط) (?:ال)?(?:سابق|اول|قبل))/;
  const asFirst = /(?:مثل|زي|كما|نفس) ?(?:ما كان|ما كانت|كان|كانت)? ?(?:ال)?(?:اول|اولي|قبل|سابق|بالبدايه|في البدايه)|(?:مكانه|مكانها|موضعه|موضعها|حجمه|حجمها|مقاسه|مقاسها) (?:ال)?(?:اول|اولي|سابق|قديم|الاصلي)|(?:ال)?(?:اول|الاصلي)(?![؀-ۿ])/;
  // (الجولة العاشرة) الرجوع إلى نسخة بعينها: «ارجع للنسخة الثانية»، «ابي التصميم رقم 3»
  const ORD = { الاولي: 1, الاول: 1, الثانيه: 2, الثاني: 2, الثالثه: 3, الثالث: 3, الرابعه: 4, الرابع: 4, الخامسه: 5, الخامس: 5, السادسه: 6, السادس: 6, السابعه: 7, السابع: 7, الثامنه: 8, الثامن: 8, التاسعه: 9, التاسع: 9, العاشره: 10, العاشر: 10 };
  const verM = t.match(/(?:النسخه|نسخه|الاصدار|اصدار|التصميم|تصميم|المخطط|مخطط)\s*(?:رقم\s*)?(\d+|الاولي|الاول|الثانيه|الثاني|الثالثه|الثالث|الرابعه|الرابع|الخامسه|الخامس|السادسه|السادس|السابعه|السابع|الثامنه|الثامن|التاسعه|التاسع|العاشره|العاشر)(?![؀-ۿ\d])/);
  const verN = verM ? (Number(verM[1]) || ORD[verM[1]]) : null;
  if (!openingOnly && (undoVerb.test(t) || (verN && /(?<![؀-ۿ])(?:ابي|ابغي|نبي|خل|خلي|اعرض|رجعني|ارجعني|رجعنا|نرجع)(?![؀-ۿ])/.test(t)))) {
    const toFirst = verN ? verN === 1 : /(?:ال)?اول|بالبدايه|البدايه|الاصلي|الاصل/.test(t);
    const roomRef = refs.find(r => r.ids.length === 1 && !['person'].includes(r.key));
    const keepRe = /(?:مع (?:ال)?(?:ابقاء|احتفاظ|حفاظ) (?:على )?|بس خل |وخل |واترك |وابق |بس ابق |بس اترك )(.+)$/;
    const km = t.match(keepRe);
    if (verN && verN > 1) {
      const keepRefs = km ? roomRefs(km[1], rooms) : [];
      intents.push({ op: 'restore', to: 'version', version: verN, keepIds: keepRefs.flatMap(r => r.ids), keepLabels: keepRefs.map(r => r.label), text_ar: `الرجوع إلى النسخة ${verN}${keepRefs.length ? ` مع الإبقاء على تعديل ${keepRefs.map(r => `«${r.label}»`).join(' و')}` : ''}` });
      used.add('restore');
    } else if ((verN === 1 || /(?:تصميم|مخطط|توزيع|تعديل|نسخه)/.test(t)) && !(roomRef && !km && asFirst.test(t) && !/(?:تصميم|مخطط|توزيع|نسخه)/.test(t))) {
      const keepRefs = km ? roomRefs(km[1], rooms) : [];
      intents.push({ op: 'restore', to: toFirst ? 'first' : 'previous', keepIds: keepRefs.flatMap(r => r.ids), keepLabels: keepRefs.map(r => r.label), text_ar: km ? `الرجوع إلى ${toFirst ? 'التصميم الأول' : 'التصميم السابق'} مع الإبقاء على تعديل ${keepRefs.map(r => `«${r.label}»`).join(' و') || km[1]}` : `الرجوع إلى ${toFirst ? 'التصميم الأول' : 'التصميم السابق'}` });
      used.add('restore');
    } else if (roomRef && (asFirst.test(t) || !/مقفل|مغلق|مفتوح|\d/.test(t))) {
      intents.push({ op: 'revertRoom', id: roomRef.ids[0], name: roomRef.names[0], to: toFirst ? 'first' : 'previous', text_ar: `إرجاع «${roomRef.names[0]}» ${toFirst ? 'إلى ما كانت عليه في التصميم الأول' : 'إلى ما كانت عليه قبل آخر تعديل'}` });
      used.add('room:' + roomRef.ids[0]);
    } else if (!refs.length && !km && /(?<![؀-ۿ])(?:رجع|ارجع|ترجع|رد|تراجع)(?![؀-ۿ])/.test(t) && !/مقفل|مغلق|مسكر|مفتوح|\d/.test(t)) {
      // فعل الرجوع بلا ضمير ولا غرفة («رجّع مثل أول»، «تراجع»): الرجوع بالمخطط كله؛ «أول/الأصلي» = التصميم الأول
      intents.push({ op: 'restore', to: toFirst ? 'first' : 'previous', keepIds: [], keepLabels: [], text_ar: `الرجوع إلى ${toFirst ? 'التصميم الأول' : 'التصميم السابق'}` });
      used.add('restore');
    }
  }
  // 2) الواجهة
  const fac = more?.tweaks?.facade;
  if (fac && (fac.material || fac.style)) intents.push({ op: 'facade', material: fac.material || null, materialAr: fac.materialAr || null, style: fac.style || null, styleAr: fac.styleAr || null, scope: fac.scope || null, text_ar: `الواجهة: ${[fac.materialAr, fac.styleAr].filter(Boolean).join('، ')}` });
  // 3) فتح المطبخ وإغلاقه (ومنه «رجّعه مقفل» بضمير يعود على آخر غرفة عُدّلت)
  const pronounKitchen = /(?:رجعه|خله|خليه|رده|اقفله|سكره|افتحه|خليه|يكون) ?(?:مقفل|مغلق|مسكر|مفتوح)?/.test(t) && /مقفل|مغلق|مسكر|مفتوح/.test(t) && !refOf('kitchen') && lastSubject === 'kitchen';
  let openK = more?.prefs?.openKitchen;
  if (openK === undefined && more?.prefs?.kitchenOpenHall) openK = 'hall';
  if (openK === undefined && pronounKitchen) openK = !/مقفل|مغلق|مسكر/.test(t);
  if (openK !== undefined && (refOf('kitchen') || pronounKitchen)) intents.push({ op: 'kitchenOpen', open: openK === 'hall' ? true : !!openK, to: openK === 'hall' ? 'hall' : 'dining', text_ar: openK === 'hall' ? 'المطبخ مفتوح على الصالة' : openK ? 'المطبخ مفتوح على الطعام' : 'المطبخ مغلق بباب' });
  // 4) الحذف
  const delVerb = /(?<![؀-ۿ])[وف]?(?:احذف|احذفو|حذف|شيل|شيلو|امسح|الغ|الغي|ازل|ازيل|بلاش|ما ابي|ما ابغي|ما نبي|لا ابي|ما احتاج|ما نحتاج)(?: لي| لنا)? /;
  for (const k of more?.absent || []) {
    const key = { majlis: 'men', dining: 'dining', office: 'office', prayer: 'prayer', maid: 'maid', driver: 'driver', laundry: 'laundry', storage: 'storage' }[k];
    const hits = key ? (refOf(key)?.ids.length ? refOf(key).ids : REFS.find(R => R.key === key).pick(rooms)) : [];
    const ids = hits.map(h => typeof h === 'string' ? h : h.id);
    if (!ids.length) { intents.push({ op: 'none', text_ar: `بدون ${AR_KIND[k] || k}`, why_ar: 'غير موجود في المخطط المعروض أصلًا.' }); continue; }
    for (const id of ids.slice(0, 1)) { intents.push({ op: 'delete', id, name: I.rooms.get(id).name, kind: k, text_ar: `حذف «${I.rooms.get(id).name}»` }); used.add('room:' + id); }
  }
  if (delVerb.test(t) && !more?.absent?.length) {
    const r = refs.find(x => x.ids.length === 1 && x.index > t.search(delVerb));
    if (r && !used.has('room:' + r.ids[0])) { intents.push({ op: 'delete', id: r.ids[0], name: r.names[0], text_ar: `حذف «${r.names[0]}»` }); used.add('room:' + r.ids[0]); }
  }
  // 5) الإضافة (فراغ غير موجود) وعدد غرف النوم
  const deleted = new Set(intents.filter(i => i.op === 'delete').map(i => i.kind));
  for (const [k, v] of Object.entries(more?.extras || {})) {
    const kind = ADD_KIND[k]; if (!kind || deleted.has(k)) continue;
    const exists = rooms.some(r => r.name === NAME_OF_KIND[k]);
    if (exists) { const id = rooms.find(r => r.name === NAME_OF_KIND[k]).id; if (!used.has('room:' + id) && !refs.some(x => x.ids.includes(id) && x.index > 0 && /(?:اكبر|اصغر|كبر|صغر|وسع)/.test(t))) intents.push({ op: 'none', text_ar: AR_KIND[kind], why_ar: `«${NAME_OF_KIND[k]}» موجودة في المخطط أصلًا.`, ok: true }); continue; }
    const nearRule = (more.rules || []).find(r => (r.kind === 'near' || r.kind === 'adjacent') && (r.a === k || r.b === k));
    // قواعد الدور نفسه عن الفراغ المضاف («أضف مكتب في الخلف»): يُختار موضع الإضافة الذي يحققها من البداية
    // (لا إضافة في الأمام ثم تبديل يحتاج إذنًا)؛ وقاعدة الموضع تبقى نية مستقلة تُقاس بعد الإضافة
    const addRules = (more.rules || []).filter(r => ['place', 'near', 'adjacent'].includes(r.kind) && (r.a === k || r.b === k));
    intents.push({ op: 'add', kind, bath: !!(v && v.bath), ext: !!(v && v.ext), rules: addRules.length ? addRules : null, near: nearRule ? (nearRule.a === k ? nearRule.b : nearRule.a) : null, text_ar: `إضافة ${AR_KIND[kind]}${v && v.bath ? ' بحمام' : ''}${nearRule ? ` (${nearRule.text})` : ''}` });
    if (nearRule) used.add('rule:' + nearRule.text);
  }
  const beds = rooms.filter(r => r.type === 'bedroom' || r.type === 'master').length;
  const addBed = t.match(new RegExp(`(?<![\\u0600-\\u06FF])(?:زيد|زود|ضيف|اضف|ابي|ابغي|نبي|نبغي)(?: لي| لنا)? (?:(${NUM}) )?(?:غرف(?:ه|تين)? (?:ال)?نوم(?: (?:(${NUM})(?![\\d×])|وحده|زياده|اضافيه|ثانيه|كمان))?|غرف(?:ه|تين) (?:وحده|زياده|اضافيه|ثانيه)(?![\\u0600-\\u06FF]))`));
  const tc = more?.textCounts?.bedrooms;
  if (Number.isInteger(tc) && tc !== beds && !addBed) intents.push({ op: 'bedCount', n: tc, from: beds, text_ar: `${tc} غرف نوم` });
  else if (Number.isInteger(tc) && tc === beds && /رجع|ارجع|خلاص|خلها|خليها/.test(t)) intents.push({ op: 'none', ok: true, text_ar: `${tc} غرف نوم`, why_ar: `عدد غرف النوم في المخطط المعروض ${beds} أصلًا.` });
  else if (addBed && !/(?:غرفه|غرف) (?:ال)?(?:خادمه|سائق|غسيل|ملابس|طعام)/.test(t)) {
    const n = toNum(addBed[1] || addBed[2] || '1') || 1;
    intents.push({ op: 'bedCount', n: beds + n, from: beds, text_ar: `زيادة ${n === 1 ? 'غرفة نوم واحدة' : n + ' غرف نوم'}` });
  }
  // 6) المقاسات والتكبير والتصغير
  const resizeFor = (ref, spec, ar) => { if (!ref || !ref.ids.length) return false; const id = ref.ids[0]; if (used.has('resize:' + id)) return true; used.add('resize:' + id); used.add('room:' + id); intents.push({ op: 'resize', id, name: I.rooms.get(id).name, ...spec, text_ar: ar(I.rooms.get(id).name) }); return true; };
  // مقاس صريح بعد مرجع غرفة («غرفة نوم ٢ تكون ٤×٥»، «كبّر المجلس ٦×٧»)
  for (const r of refs) {
    if (r.ids.length !== 1) continue;
    const tail = t.slice(r.end, r.end + 40).split(/[،,.؛]| و(?:ال|خل|ابي)/)[0], m = tail.match(DIMS_RE);
    if (m) { const a = +m[1], b = +m[2]; resizeFor(r, { target: { w: Math.min(a, b), l: Math.max(a, b) }, tol: more?.dims?.[Object.keys(DIM_KEY).find(k => DIM_KEY[k] === r.key)]?.tol ?? .35 }, n => `«${n}» ${m[1]}×${m[2]} م`); }
  }
  for (const [k, dm] of Object.entries(more?.dims || {})) { const r = refOf(DIM_KEY[k]); if (r && r.ids.length === 1) resizeFor(r, { target: { w: dm.w, l: dm.l }, tol: dm.tol ?? .35 }, n => `«${n}» ${dm.w}×${dm.l} م`); }
  for (const [k, a] of Object.entries(more?.areas || {})) { if (more?.dims?.[k]) continue; const r = refOf(DIM_KEY[k]); if (r && r.ids.length === 1) resizeFor(r, { area: a }, n => `«${n}» ${a} م²`); }
  // أكبر/أصغر/أوسع/كبّر/صغّر + «شوي» + «بمقدار متر»
  const amountM = t.match(/(?:بمقدار|بحدود|حوالي)? ?(\d+(?:\.\d+)?|نص|متر)\s*(?:م|متر)(?![؀-ۿ²2])/);
  const amount = amountM ? (amountM[1] === 'نص' ? .5 : amountM[1] === 'متر' ? 1 : +amountM[1]) : null;
  const small = SMALL.test(t);
  for (const r of refs) {
    if (r.ids.length !== 1 || used.has('resize:' + r.ids[0])) continue;
    const win = t.slice(Math.max(0, r.index - 14), r.end + 22);
    const big = new RegExp(`(?:اكبر|اوسع|اعرض|اطول)(?![\\u0600-\\u06FF])|(?<![\\u0600-\\u06FF])(?:${VERB_BIG.source})`).test(win) && !/(?:اكبر|كبر) (?:من|مثل)/.test(win);
    const smaller = /(?:اصغر|اضيق|اقصر)(?![؀-ۿ])|(?<![؀-ۿ])(?:صغر|ضيق|قصر|نقص)/.test(win);
    if (!big && !smaller) continue;
    const wide = /اوسع|اعرض|وسع|ضيق|اضيق/.test(win) ? 'width' : /اطول|اقصر|طول|قصر/.test(win) ? 'length' : null;
    const f = big ? (small ? 1.12 : 1.2) : (small ? .9 : .85);
    resizeFor(r, amount ? { amount: big ? amount : -amount, along: wide } : { factor: f, along: wide }, n => `«${n}» ${big ? (wide === 'width' ? 'أوسع' : 'أكبر') : (wide === 'width' ? 'أضيق' : 'أصغر')}${small ? ' قليلًا' : ''}${amount ? ` بمقدار ${amount} م` : ''}`);
  }
  for (const [k, v] of Object.entries(more?.tweaks || {})) if (SCALE_KEY[k] && typeof v === 'number') {
    const r = refOf(SCALE_KEY[k]); if (!r || r.ids.length !== 1 || used.has('resize:' + r.ids[0])) continue;
    resizeFor(r, { factor: v > 1 ? (small ? 1.12 : 1.2) : (small ? .9 : .85) }, n => `«${n}» ${v > 1 ? 'أكبر' : 'أصغر'}`);
  }
  // 7) مدخل خارجي مستقل لغرفة
  if (/(?:مدخل|باب) (?:مستقل|خاص|خارجي|منفصل)|(?:مدخل|باب) (?:من|على|ل) ?(?:برا|بره|الخارج|الشارع|الحوش)/.test(t)) {
    const r = refs.find(x => x.ids.length === 1 && ['women', 'office', 'maid', 'driver', 'men', 'prayer'].includes(x.key));
    if (r) { intents.push({ op: 'extDoor', id: r.ids[0], name: r.names[0], text_ar: `«${r.names[0]}» بمدخل خارجي مستقل` }); used.add('pref:familyEntrance'); used.add('pref:guestEntrance'); if (r.key === 'women') used.add('pref:womenSeparate'); used.add('room:' + r.ids[0]); }
  }
  // 8) القواعد المكانية: تُتحقق على المعروض؛ ما لم يتحقق يُجرَّب له تبديل موضعي
  for (const rule of more?.rules || []) {
    if (used.has('rule:' + rule.text)) continue;
    if (['place', 'adjacent', 'near', 'far', 'apart'].includes(rule.kind)) intents.push({ op: 'rule', rule, text_ar: rule.text });
    else unhandled.push(rule.text);
  }
  // ما فُهم ولم يُغطَّ بنية موضعية: تفضيلات بنيوية (حمام لكل غرفة، بلا ممرات…) ← إعادة توليد صريحة
  const PREF_LOCAL = new Set(['openKitchen', 'kitchenOpenHall', 'familyEntrance', 'guestEntrance', 'big_majlis', 'big_hall', 'big_kitchen', 'big_master']);
  for (const [k, v] of Object.entries(more?.prefs || {})) {
    if (PREF_LOCAL.has(k)) { if (k.startsWith('big_') && !intents.some(i => i.op === 'resize')) { const key = { big_majlis: 'men', big_hall: 'hall', big_kitchen: 'kitchen', big_master: 'master' }[k]; const r = refOf(key); if (r && r.ids.length === 1) resizeFor(r, { factor: 1.2 }, n => `«${n}» أكبر`); } if ((k === 'familyEntrance' || k === 'guestEntrance') && !used.has('pref:' + k)) unhandled.push(k === 'familyEntrance' ? 'مدخل مستقل للعائلة/النساء' : 'مجلس الرجال بمدخل مستقل'); continue; }
    if (k === 'floors') { unhandled.push(v === 2 ? 'دوران' : 'دور واحد'); continue; }
    if (v && used.has('pref:' + k)) continue;
    if (v) unhandled.push({ allEnsuite: 'حمام لكل غرفة', sharedBaths: 'حمامات مشتركة', masterDressing: 'غرفة ملابس للرئيسية', bathsOffHall: 'دورات المياه لا تفتح على الصالة', noCorridors: 'بلا ممرات', elderlyRoom: 'غرفة لكبار السن قرب الصالة', womenSeparate: 'مجلس النساء منفصل' }[k] || k);
  }
  for (const [k, v] of Object.entries(more?.tweaks || {})) if (typeof v === 'number' && !SCALE_KEY[k] && !['bedroomScale'].includes(k)) unhandled.push(k === 'envScale' ? 'المبنى أصغر' : k);
  if (more?.tweaks?.bedroomScale && !refs.some(r => r.key === 'master' || r.key === 'numbered')) unhandled.push('غرف النوم أكبر');
  for (const [k, v] of Object.entries(more?.textCounts || {})) if (k !== 'bedrooms' && Number.isInteger(v)) unhandled.push(`عدد ${k} = ${v}`);
  return { intents, unhandled, questions, keep, refs };
}

// ------------------------------------------------------------------------------------------ العمليات
// rules: قواعد الطلب المتراكمة في الجلسة (من التصميم الأول والتعديلات السابقة) — لا يكسر تعديلٌ موضعي بندًا كان متحققًا
const ctxOf = (doc, req) => ({ request: { counts: req?.counts || {}, rules: (req?.rules || []).filter(r => r && r.kind && r.a), ignore: req?.ignoreRule || null, entry: req?.entry || doc.entry || 's' }, entry: req?.entry || doc.entry || 's' });
// فراغات القواعد لكل نوع غرفة: الحذف والإرجاع والقاعدة الجديدة عن الفراغ نفسه تُسقط بنوده السابقة عمدًا (العميل طلب ذلك)
const SUBJ_OF_TYPE = { kitchen: ['kitchen', 'laundry', 'storage', 'servicedoor'], dining: ['dining'], master: ['master', 'bedrooms', 'onebed'], bedroom: ['bedrooms', 'kids', 'onebed', 'elderly'], majlis: ['majlis', 'majlis_w', 'guestwc'], office: ['office'], service: ['maid', 'driver'], other: ['prayer'], living: ['hall'] };
function ignoreFor(it, doc) {
  if (it.op === 'rule' && it.rule?.a) { const a = it.rule.a; return r => r.a === a || r.b === a; }
  if (['revertRoom', 'delete'].includes(it.op) && it.id) { let t = null; try { t = inspect(doc).rooms.get(it.id)?.type; } catch { t = null; } const keys = new Set(SUBJ_OF_TYPE[t] || []); if (it.kind) keys.add(it.kind); return r => keys.has(r.a) || keys.has(r.b); }
  return null;
}
const PREFER = new Set(['corridor', 'entrance', 'living', 'storage', 'laundry', 'service', 'other']);
/** يجرّب المرشحين، ويختار الأقل كلفة مما ينجح في الفحص والبوابات ويحقق الطلب مقيسًا. */
const DONOR_FREE = new Set(['corridor', 'entrance', 'storage', 'laundry']);
/** سؤال الإذن: ما الذي سيتغير في غيرها لو نُفّذ. */
function consentAsk(it, consent, strict) {
  const side = describeChanges(consent.cmp.changed.filter(x => !x.inScope && x.kind !== 'openings' && x.kind !== 'added')).map(x => x.text_ar);
  const what = it.text_ar.replace(/[«»]/g, '');
  return { ok: false, ask: strict === 'all' ? `طلبت ألا ألمس بقية البيت، وتحقيق «${what}» يحتاج: ${side.join('؛ ')}. أنفّذه بهذا، ولا تبقيه كما هو؟` : `تحقيق «${what}» يحتاج تغيير غرفة لم تذكرها: ${side.join('؛ ')}. أنفّذه بهذا؟ (قل «نعم» أو «لا»)`, why_ar: `يحتاج تغيير غرفة أخرى (${side.join('؛ ')})؛ لم أغيّر شيئًا قبل موافقتك.` };
}
function choose(before, cands, { scope, request, check, strict = false }) {
  const Ib = inspect(before), tried = [];
  let best = null, consent = null;
  // بنود الطلب السابقة المتحققة في المعروض (مثل «الخادمة قرب المطبخ»): مرشح يكسر أحدها لا يُنفَّذ ولا يُعرض للإذن
  const prior = (request?.rules || []).filter(r => !(request.ignore && request.ignore(r)));
  let okBefore = [];
  if (prior.length) { try { const v = verifyRules(before, prior, { entry: request.entry || 's' }); okBefore = prior.filter((_, i) => v[i]?.ok); } catch { okBefore = []; } }
  for (const c of cands) {
    if (!c || !c.doc) continue;
    let cmp; try { cmp = compareDocs(before, c.doc, { scope, request, Ib }); } catch (e) { tried.push({ desc: c.desc, why: [e.message] }); continue; }
    if (!cmp.ok) { tried.push({ desc: c.desc, why: cmp.why }); continue; }
    if (okBefore.length) { let broke = null; try { const v = verifyRules(c.doc, okBefore, { entry: request.entry || 's' }); broke = okBefore.find((_, i) => !v[i]?.ok) || null; } catch { broke = null; } if (broke) { tried.push({ desc: c.desc, why: [`يكسر بندًا سابقًا من طلبك (${broke.text || broke.kind})`] }); continue; } }
    const got = check ? check(cmp.I, c) : { ok: true };
    if (!got.ok) { tried.push({ desc: c.desc, why: [got.why] }); continue; }
    const cost = cmp.cost + (c.penalty || 0);
    // «والباقي لا تلمسه»: مرشح يغيّر غرفة أخرى لا يُنفَّذ، بل يُعرض على العميل ليوافق
    // غرفة لم يذكرها العميل لا تتغير بلا إذنه: الممر والمدخل والمخزن والغسيل مانحون مقبولون معلَنون، وما عداها
    // (غرفة نوم، طعام، حمام…) يُعرض على العميل ليوافق أولًا؛ و«لا تلمس الباقي» لا يقبل أي مانح
    const blocked = x => !x.inScope && ['resized', 'removed', 'shape', 'renamed'].includes(x.kind) && (strict === 'all' || (strict === 'free' && !DONOR_FREE.has(x.type)));
    if (strict && strict !== 'none' && cmp.changed.some(blocked)) { if (!consent || cost < consent.cost) consent = { ...c, cmp, cost, measured: got.measured }; continue; }
    if (!best || cost < best.cost - 1e-9) best = { ...c, cmp, cost, measured: got.measured };
  }
  return { best, tried, consent };
}
function build(doc, fn) {
  const d = clone(doc);
  try {
    const meta = fn(d) || {}; sanitizeOpenings(doc, d); dropStaleDims(d);
    // (الجولة الحادية عشرة) فتحة صار التعديل يضعها على تقاطع جدارين (أو على وجهه) تنزلق على جدارها إلى أقرب موضع سليم —
    // فقط الفتحات التي لم تكن فيها مشكلة قبل التعديل (لا يُمس غيرها)
    { const was = new Set(openingConsistency(doc).issues.map(i => i.id)), now = openingConsistency(d).issues.map(i => i.id).filter(id => !was.has(id));
      if (now.length) clearOpeningsOfJunctions(d, { only: now }); }
    // (الجولة العاشرة) المرشح يجب أن يكون مستندًا صالحًا (لا جدار شبه معدوم، ولا فتحة بلا جدار) — كما يفحصه parseDoc
    const bad = validateDoc(d).filter(x => x.severity === 'error'); if (bad.length) fail('INVALID', 'مستند غير صالح: ' + bad.map(x => x.code).join('،'));
    // (الجولة الثانية عشرة) موقف مرسوم صار تحت المبنى بعد التعديل: يُعاد تخطيط المواقف على المبنى الجديد
    refreshParking(d);
    return { doc: d, ...meta };
  } catch (e) { return { doc: null, err: e.message }; }
}
/** خط بُعد لم تعد نهايتاه على جدار (بعد حذف أو إزاحة) يُحذف بدل أن يقيس شيئًا غير موجود. */
function dropStaleDims(doc) {
  const onWall = (p, level) => doc.walls.some(w => { if (w.level !== level) return false; const ax = axisOfWall(w); if (!ax) return false; const [a, b] = spanOf(w, ax); return near(acrossOf(p, ax), acrossOf(w.a, ax), .03) && alongOf(p, ax) >= a - .03 && alongOf(p, ax) <= b + .03; });
  doc.dimensions = (doc.dimensions || []).filter(dm => onWall(dm.a, dm.level) && onWall(dm.b, dm.level));
}
/**
 * بعد أي تعديل هندسي: نافذة كانت على الخارج وصارت بين غرفتين تنزلق على جدارها إلى جزء خارجي أو تُحذف؛ وباب داخلي
 * صار يفتح على الخارج يُرفض به المرشح (لا يُنشأ مدخل لم يُطلب).
 */
function sanitizeOpenings(before, after) {
  const side = (doc) => { const m = analyzeDoc(doc), out = new Map(); for (const L of m.levels) for (const op of L.openings) out.set(op.id, { ext: op.sides.some(x => x.other === 'outside') || op.sides.length < 2, op }); return out; };
  const B = side(before), A = side(after);
  for (const [id, a] of A) {
    const b = B.get(id); if (!b) continue;
    if (a.op.window && b.ext && !a.ext) {
      const o = after.openings.find(x => x.id === id), w = wallById(after, o.wall), ax = axisOfWall(w), L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), at0 = o.at;
      let ok = false;
      for (let k = 1; k <= 40 && !ok; k++) for (const sg of [1, -1]) {
        const at = at0 + sg * k * .2; if (at - o.w / 2 < .1 || at + o.w / 2 > L - .1) continue;
        o.at = R3(at); const t = side(after).get(id); if (t?.ext && t.op.sides.some(x => b.op.sides.some(y => y.room.id === x.room.id))) { ok = true; break; }
      }
      if (!ok) after.openings = after.openings.filter(x => x.id !== id);
      void ax;
    }
    if (a.op.door && !b.ext && a.ext && !a.op.o.entry) fail('DOOR_OUT', 'باب داخلي سيفتح على الخارج');
  }
}

// -------------------------------------------------- تكبير/تصغير
const SIDES = ['x0', 'x1', 'y0', 'y1'];
/** جهة من الغرفة على خط حدها: مقطع متصل من حوافها (الغرفة غير المستطيلة تُعدَّل بجهة مستقيمة متصلة فقط). */
const sideGeom = (R, s) => {
  const ax = s[0], c = R.cl[s], out = s.endsWith('1') ? 1 : -1;
  const es = (R.sides[s] || []).slice().sort((a, b) => a.s0 - b.s0);
  if (!es.length) return null;
  let s0 = es[0].s0, s1 = es[0].s1;
  for (const e of es.slice(1)) { if (e.s0 > s1 + E) return null; s1 = Math.max(s1, e.s1); }
  return { ax, c, s0, s1, out };
};
const sideLen = (R, s) => { const G = sideGeom(R, s); return G ? G.s1 - G.s0 : 0; };
const netLen = (R, s) => s[0] === 'x' ? R.net.y1 - R.net.y0 : R.net.x1 - R.net.x0;
const netDims = R => { const wx = R.net.x1 - R.net.x0, wy = R.net.y1 - R.net.y0; return { wx, wy, short: wx <= wy ? 'x' : 'y', w: Math.min(wx, wy), l: Math.max(wx, wy) }; };
const snap = v => Math.sign(v) * Math.ceil(Math.abs(v) / .05 - 1e-9) * .05;
/** إزاحة جهة واحدة من الغرفة R مسافة g (موجبة = تكبير للخارج). */
function moveSide(doc, I, R, s, g, extT = null, span = null) {
  const G0 = sideGeom(R, s); if (!G0) fail('SIDE', 'جهة غير مستقيمة');
  const G = span ? { ...G0, s0: span[0], s1: span[1] } : G0, d = G.out * g;
  const nbs = R.sides[s].filter(e => e.s1 > G.s0 + E && e.s0 < G.s1 - E).map(e => e.nb), exterior = nbs.every(n => n === 'outside');
  // جدار الغلاف عند الإغلاق بسماكة الجدار الخارجي
  const t = exterior ? (doc.walls.find(w => w.level === R.level && onLine(w, G.ax, G.c))?.t || .25) : null;
  const strip = moveSpan(doc, R.level, G.ax, G.c, G.s0, G.s1, d, { closureT: t ?? extT, I });
  // التسميات التي صارت في الشريط: تُعاد إلى جزء غرفتها الباقي
  for (const l of doc.labels) if (l.level === R.level && l.id !== R.id && inStrip(l.seed, strip, .05)) { const o = I.rooms.get(l.id); const p = o ? anchorOutside(o, strip) : null; if (!p) fail('LABEL', 'تسمية فقدت غرفتها.'); l.seed = { x: R3(p.x), y: R3(p.y) }; }
  dropFixtures(doc, R.level, f => g > 0 && inStrip(f, strip, 0) && !(R.label && near(f.x, R.label.seed.x, 0)));
  dropCutFixtures(doc, R.level);
  return { strip, losers: [...new Set(nbs.filter(n => n !== 'outside' && n !== 'void'))], exterior };
}
/**
 * (الجولة العاشرة) إزاحة سلسلة جدارين: جيران الغرفة R على جهة s (شريط رفيع مثل غرفة ملابس وحمام، أو مغاسل ودورة مياه)
 * ينتقلون كما هم مسافة g بخطّي جدرانهم معًا، فتكبر R وتصغر الغرفة التي بعدهم — لا يضيق الجار ولا يختفي.
 * الشرط: جهة R داخلية كلها، والجيران مستطيلات تتصل امتداداتهم بلا فجوة وخطهم البعيد واحد.
 */
function chainShift(doc, I, R, s, g) {
  const G = sideGeom(R, s); if (!G) fail('SIDE', 'جهة غير مستقيمة');
  const segs = R.sides[s] || []; if (!segs.length || segs.some(e => e.nb === 'outside' || e.nb === 'void')) fail('CHAIN_EXT', 'جهة خارجية');
  const N = [...new Set(segs.map(e => e.nb))].map(id => I.rooms.get(id));
  if (N.some(n => !n || !n.rect || n.level !== R.level)) fail('CHAIN_SHAPE', 'جار غير مستطيل');
  const far = N[0].cl[s]; if (N.some(n => !near(n.cl[s], far, .02))) fail('CHAIN_FAR', 'خط الجيران البعيد غير واحد');
  const opp = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' }[s];
  if (N.some(n => !near(n.cl[opp], G.c, .02))) fail('CHAIN_NEAR', 'الجيران لا يلاصقون الغرفة');
  // امتداد الشريط على الخط: اتحاد امتدادات الجيران (قد يتجاوز R، مثل غرفة ملابس تمتد بجانب الممر)
  const ext = N.map(n => G.ax === 'x' ? [n.cl.y0, n.cl.y1] : [n.cl.x0, n.cl.x1]).sort((a, b) => a[0] - b[0]);
  let n0 = ext[0][0], n1 = ext[0][1]; for (const [a, b] of ext.slice(1)) { if (a > n1 + E) fail('CHAIN_GAP', 'فجوة بين الجيران'); n1 = Math.max(n1, b); }
  if (n0 > G.s0 + E || n1 < G.s1 - E) fail('CHAIN_SHORT', 'الجيران لا يغطون الجهة');
  const width = Math.abs(far - G.c); if (width > 3.2) fail('CHAIN_WIDE', 'الجار ليس شريطًا رفيعًا');
  const d = G.out * g, lv = R.level;
  // النمو: الخط البعيد أولًا (يتسع الشريط مؤقتًا) ثم القريب؛ التصغير: القريب أولًا ثم البعيد — فلا يتقاطع الخطان
  const lines = g > 0 ? [far, G.c] : [G.c, far];
  let curI = I; const strips = [];
  for (const c of lines) {
    const st = moveSpan(doc, lv, G.ax, c, n0, n1, d, { I: curI });
    strips.push(st);
    for (const l of doc.labels) if (l.level === lv && inStrip(l.seed, st, .05)) { const o = curI.rooms.get(l.id); if (o && o.id !== R.id && !N.some(n => n.id === o.id)) { const p = anchorOutside(o, st); if (!p) fail('LABEL', 'تسمية فقدت غرفتها.'); l.seed = { x: R3(p.x), y: R3(p.y) }; } }
    curI = inspect(doc);
  }
  // تسميات الجيران وأثاثهم ينتقلون معهم
  for (const n of N) { const l = doc.labels.find(x => x.id === n.id); if (l) l.seed = PT(G.ax, acrossOf(l.seed, G.ax) + d, alongOf(l.seed, G.ax)); }
  for (const f of doc.fixtures) if (f.level === lv && N.some(n => f.x > n.net.x0 && f.x < n.net.x1 && f.y > n.net.y0 && f.y < n.net.y1)) { if (G.ax === 'x') f.x = R3(f.x + d); else f.y = R3(f.y + d); }
  dropCutFixtures(doc, lv);
  const beyond = [...new Set(N.flatMap(n => (n.sides[s] || []).map(e => e.nb)).filter(x => x !== 'outside' && x !== 'void'))];
  return { strip: strips[strips.length - 1], losers: g > 0 ? beyond : [R.id], exterior: false, chain: { moved: N.map(n => n.id), beyond } };
}
/** أقصى إزاحة للخارج لجهة خارجية حتى خط الارتداد (وجه الجدار الخارجي). */
function maxOut(doc, R, s) {
  const P = doc.plot?.polygon; if (!P?.length) return Infinity;
  const sb = doc.plot.setbacks || {}, xs = P.map(p => p.x), ys = P.map(p => p.y), G = sideGeom(R, s); if (!G) return 0;
  const t = (doc.walls.find(w => w.level === R.level && onLine(w, G.ax, G.c))?.t || .25) / 2;
  if (Number(doc.north) % 360) return Infinity; // أرض مدوّرة: يُترك الحكم لبوابة الأرض
  const lim = { x0: Math.min(...xs) + (sb.w || 0), x1: Math.max(...xs) - (sb.e || 0), y0: Math.min(...ys) + (sb.s || 0), y1: Math.max(...ys) - (sb.n || 0) }[s];
  return s.endsWith('1') ? lim - (G.c + t) : (G.c - t) - lim;
}
/** مرشحو التعديل: كل جهة (أو جهتان لمقاس صريح)، بالمسافة اللازمة لتحقيق المطلوب. */
function resizeCands(doc, I, R, spec, scopeIds = new Set([R.id])) {
  const out = [];
  const clampOut = (s, g, RR = R, base = doc) => { if (g <= 0 || !(RR.sides[s] || []).every(e => e.nb === 'outside')) return g; const m = maxOut(base, RR, s); return g > m ? Math.floor(m / .01) * .01 : g; };
  const one = (s, g, base = doc, BI = I, BR = R, tag = '') => { g = clampOut(s, g, BR, base); if (Math.abs(g) < .05) return null; const r = build(base, d => { const m = moveSide(d, BI, BR, s, g); return { desc: `${tag}${s}:${g > 0 ? '+' : ''}${r2(g)}`, moves: [...(base.moves || []), { s, g, exterior: m.exterior, losers: m.losers }] }; }); return r.doc ? r : null; };
  if (spec.target) {
    // (الجولة العاشرة) المقاس في الاتجاهين (6×7 قد يكون 6 عرضًا أو 7 عرضًا — يُجرَّب الاثنان)، ومحور ضمن السماحية لا يُلمس،
    // ولكل محور: جهة واحدة، أو الجهتان مناصفة، أو «الخارجية أولًا» (حتى خط الارتداد ثم الباقي من الجهة الأخرى)، أو إزاحة
    // سلسلة جدارين (الجار الرفيع ينتقل كما هو وتصغر الغرفة التي بعده) — وبالمقدار الكامل أو الأدنى الذي يبلغ السماحية
    const D = netDims(R), tol = spec.tol ?? .35;
    const orients = [{ x: D.short === 'x' ? spec.target.w : spec.target.l, y: D.short === 'y' ? spec.target.w : spec.target.l }];
    if (Math.abs(spec.target.w - spec.target.l) > .05) orients.push({ x: orients[0].y, y: orients[0].x });
    let any = false;
    for (const want of orients) {
      const axes = [];
      for (const ax of ['x', 'y']) { const cur = ax === 'x' ? D.wx : D.wy, dlt = want[ax] - cur; if (Math.abs(dlt) > tol + 1e-9) axes.push({ ax, dlt }); }
      if (!axes.length) return { already: true, cands: [] };
      any = true;
      // الأدنى الذي يبلغ السماحية: إزاحة صغيرة (6 سم فأكثر) لا تُقرَّب إلى 5 سم أعلى فتأخذ من الجار أكثر من اللازم
      const minAmt = dlt => { const m = Math.abs(dlt) - tol + .01; return Math.sign(dlt) * (m < .1 ? R3(Math.max(.06, m)) : snap(m)); };
      const amounts = ({ dlt }) => [...new Set([snap(dlt), minAmt(dlt)].filter(g => Math.abs(g) >= .05))];
      const opts = a => {
        const o = [], s0 = `${a.ax}0`, s1 = `${a.ax}1`;
        for (const g of amounts(a)) {
          o.push([[s0, g]], [[s1, g]]);
          if (Math.abs(g) >= .6) o.push([[s0, snap(g / 2)], [s1, snap(g / 2)]]);
          for (const [se, so] of [[s0, s1], [s1, s0]]) if (g > 0 && (R.sides[se] || []).length && R.sides[se].every(e => e.nb === 'outside')) { const e = Math.floor(Math.min(g, maxOut(doc, R, se)) / .01) * .01; if (e >= .05 && g - e >= .05) o.push([[se, r2(e)], [so, snap(g - e)]]); }
          o.push([['chain:' + s0, g]], [['chain:' + s1, g]]);
        }
        return o;
      };
      const applyOpt = (base, BI, BR, moves, prior = []) => {
        let cur = { doc: base, moves: prior }, ci = BI, cr = BR;
        for (const [s0, g] of moves) {
          const chain = s0.startsWith('chain:'), s = chain ? s0.slice(6) : s0;
          const gg = chain ? g : clampOut(s, g, cr, cur.doc); if (Math.abs(gg) < .03) return null;
          const r = build(cur.doc, d => { const m = chain ? chainShift(d, ci, cr, s, gg) : moveSide(d, ci, cr, s, gg); return { moves: [...cur.moves, { s, g: gg, exterior: m.exterior, losers: m.losers, chain: chain ? m.chain : null }] }; });
          if (!r.doc) return null; cur = r; ci = inspect(r.doc); cr = ci.rooms.get(R.id); if (!cr || !cr.rect) return null;
        }
        return { ...cur, desc: moves.map(([s, g]) => `${s}:${r2(g)}`).join('|'), I: ci, R: cr };
      };
      // المتبقي عن المقاس المطلوب كلفةٌ صغيرة: الأدق أولًا متى تساوت التغييرات
      const resid = c => { const Dn = netDims(c.R); return .6 * (Math.abs(Dn.wx - want.x) + Math.abs(Dn.wy - want.y)); };
      let level1 = opts(axes[0]).map(o => applyOpt(doc, I, R, o)).filter(Boolean).map(c => ({ ...c, penalty: resid(c) }));
      if (axes.length === 1) { out.push(...level1); continue; }
      // المحور الثاني على أفضل أربعة من الأول (بكلفة تقديرية سريعة)
      // المرشح الصالح أولًا (لا يضيّق جارًا تحت حده) ثم الأقل كلفة — فلا تزاحم المرشحاتُ الراسبة السلسلةَ الصالحة الأغلى
      const quick = c => { try { const k = compareDocs(doc, c.doc, { scope: scopeIds, gates: false, Ib: I }); return k.cost + (k.ok ? 0 : 100) + (c.penalty || 0); } catch { return 999; } };
      level1 = level1.map(c => ({ c, k: quick(c) })).sort((a, b) => a.k - b.k).slice(0, 5).map(x => x.c);
      for (const c1 of level1) for (const o of opts(axes[1])) { const c2 = applyOpt(c1.doc, c1.I, c1.R, o, c1.moves || []); if (c2) out.push({ ...c2, desc: c1.desc + ' + ' + c2.desc, moves: c2.moves, penalty: resid(c2) }); }
    }
    if (!any) return { already: true, cands: [] };
    return { cands: out };
  }
  let sides = SIDES;
  const D = netDims(R);
  if (spec.along === 'width') sides = D.short === 'x' ? ['x0', 'x1'] : ['y0', 'y1'];
  if (spec.along === 'length') sides = D.short === 'x' ? ['y0', 'y1'] : ['x0', 'x1'];
  for (const s of sides) {
    let g;
    if (spec.amount) g = spec.amount;
    else { const f = spec.factor ?? (spec.area ? spec.area / R.area : 1); g = (f - 1) * R.area / Math.max(.5, Math.min(netLen(R, s), sideLen(R, s) - .1)); }
    g = snap(g); if (Math.abs(g) < .05) continue;
    const c = one(s, g); if (c) out.push(c);
    // تكبير بنتوء خارجي: الجزء الخارجي وحده من الجهة يُزاح للخارج (الغرفة تصير غير مستطيلة؛ يُفضَّل غيره)
    const G = sideGeom(R, s), extE = (R.sides[s] || []).filter(e => e.nb === 'outside' && e.len >= 2.2);
    if (g > 0 && G && extE.length && extE.reduce((a, e) => a + e.len, 0) < G.s1 - G.s0 - .3) for (const e of extE) {
      const f = spec.factor ?? (spec.area ? spec.area / R.area : 1), gg = Math.min(snap(spec.amount || (f - 1) * R.area / (e.len - .25)), maxOut(doc, R, s));
      if (gg > 2.4 || gg < .1) continue;
      const r = build(doc, d => { const m = moveSide(d, I, R, s, gg, null, [e.s0, e.s1]); return { desc: `bump:${s}:${r2(e.s0)}`, moves: [{ s, g: gg, exterior: true, losers: m.losers, bump: true }] }; });
      if (r.doc) out.push({ ...r, penalty: 2 });
    }
  }
  return { cands: out };
}
function doResize(doc, it, req) {
  const I = inspect(doc), R = I.rooms.get(it.id); if (!R) return { ok: false, why_ar: `«${it.name}» غير موجودة في المخطط المعروض.` };
  if (!R.rect && it.target) return { ok: false, why_ar: `«${R.name}» ليست مستطيلة؛ لا أضبط مقاس غرفة غير منتظمة موضعيًا.` };
  const { request } = ctxOf(doc, req);
  const D0 = netDims(R);
  // جناح الغرفة نفسها (حمامها وغرفة ملابسها) من نطاق الطلب: «الرئيسية ٥×٦» قد تأخذ من حمامها لا من غرفة أخرى؛
  // (الجولة العاشرة) والجناح أيضًا كل غرفة صغيرة (حمام/خزانة/ملابس) لا يُدخل إليها إلا من الغرفة نفسها
  const privateTo = x => ['bath', 'storage'].includes(x.type) && x.links.length > 0 && x.links.every(l => l.to === R.id);
  const suite = roomList(I).filter(x => x.id !== R.id && ((R.type === 'master' ? /^(?:حمام الرئيسية|غرفة (?:ال)?ملابس)$/.test(x.name) : /^غرفة نوم (\d+)$/.test(R.name) && x.name === `حمام غرفة ${R.name.match(/(\d+)$/)[1]}`) || privateTo(x)));
  const scopeR = new Set([R.id, ...suite.map(x => x.id)]);
  const { cands, already } = resizeCands(doc, I, R, it, scopeR);
  const measure = Rn => { const D = netDims(Rn); return { before: { w: r2(D0.w), l: r2(D0.l), area: r2(R.area) }, after: { w: r2(D.w), l: r2(D.l), area: r2(Rn.area) }, ratio: r2(Rn.area / R.area) }; };
  if (already) return { ok: true, already: true, doc, measured: measure(R), why_ar: `«${R.name}» مقاسها الصافي ${r2(D0.w)}×${r2(D0.l)} م ضمن السماحية أصلًا؛ لم أغيّر شيئًا.` };
  const check = (Ia) => {
    const Rn = Ia.rooms.get(R.id); if (!Rn) return { ok: false, why: 'الغرفة اختفت' };
    const m = measure(Rn);
    // غرف الجناح تبقى صالحة: لا تضيق تحت حد نوعها ولا تختفي
    for (const x of suite) { const y = Ia.rooms.get(x.id); if (!y) return { ok: false, why: `«${x.name}» اختفت` }; const T = ROOM_TYPES[y.type] || ROOM_TYPES.other, w = Math.min(y.net.x1 - y.net.x0, y.net.y1 - y.net.y0); if (w < (T.minWidth || 0) - 1e-6 && w < Math.min(x.net.x1 - x.net.x0, x.net.y1 - x.net.y0) - .01) return { ok: false, why: `«${x.name}» تضيق إلى ${r2(w)} م` }; }
    if (it.target) { const D = netDims(Rn), tol = it.tol ?? .35; return { ok: Math.abs(D.w - it.target.w) <= tol && Math.abs(D.l - it.target.l) <= tol, measured: m, why: `المقاس ${r2(D.w)}×${r2(D.l)}` }; }
    const want = it.factor ?? (it.area ? it.area / R.area : null);
    if (it.amount) return { ok: Math.sign(Rn.area - R.area) === Math.sign(it.amount) && Math.abs(Rn.area - R.area) > .3, measured: m, why: 'الاتجاه' };
    // الاتجاه أولًا: «أكبر» يعني أكبر فعلًا (لا يكفي أن يتغير)، ثم بلوغ ثلثي المطلوب على الأقل
    const k = Rn.area / R.area; return { ok: want > 1 ? k >= 1 + (want - 1) * .9 : k <= 1 - (1 - want) * .9, measured: m, why: `النسبة ${r2(k)}` };
  };
  const strict = req?.strict || false;
  let { best, tried, consent } = choose(doc, cands, { scope: scopeR, request, check, strict });
  let note = '';
  // «أوسع» تعني في الكلام الدارج «أرحب» أيضًا: إن تعذّر التوسيع في العرض يُجرَّب الطول (ويُقال ذلك)
  if (!best && it.along) { const alt = resizeCands(doc, I, R, { ...it, along: null }, scopeR).cands; const r = choose(doc, alt, { scope: scopeR, request, check, strict }); if (r.best) { best = r.best; note = `تعذّر التوسيع في العرض (${[...new Set(tried.flatMap(x => x.why))].slice(0, 1).join('') || 'يلزمه تغيير غرفة أخرى'}) فكُبّرت في الطول`; } tried = [...tried, ...r.tried]; consent ||= r.consent; }
  if (globalThis.__peDebug) console.error('RESIZE tried', cands.length, tried.map(x => x.desc + ': ' + x.why.join('|')).slice(0, 40), 'best', best?.desc, best?.cost, 'consent', consent?.desc, consent?.cost);
  if (!best && consent) return consentAsk(it, consent, strict);
  if (!best) return { ok: false, why_ar: `لم أجد جدارًا يمكن إزاحته لـ«${R.name}» دون كسر بوابة أو تغيير غير مقبول (${tried.length} محاولة: ${[...new Set(tried.flatMap(x => x.why))].slice(0, 2).join('، ') || 'لا مرشح'}).`, tried };
  const ext = (best.moves || []).filter(m => m.exterior).length;
  const nameOf = id => I.rooms.get(id)?.name || id;
  return { ok: true, doc: best.doc, cmp: best.cmp, measured: best.measured, how_ar: [note, ...(best.moves || []).map(m => m.chain ? `انتقلت ${m.chain.moved.map(id => `«${nameOf(id)}»`).join(' و')} كما هي ${Math.abs(r2(m.g))} م (جداراها معًا)${m.chain.beyond.length ? `، فتغيّرت ${m.chain.beyond.map(id => `«${nameOf(id)}»`).join(' و')}` : ''}` : m.exterior ? `أُزيح الجدار الخارجي ${m.g > 0 ? 'للخارج' : 'للداخل'} ${Math.abs(r2(m.g))} م (داخل خطوط الارتداد)` : `أُزيح الجدار المشترك مع ${m.losers.map(id => `«${nameOf(id)}»`).join(' و')} ${Math.abs(r2(m.g))} م`)].filter(Boolean).join('، '), envelope: ext > 0 };
}

// -------------------------------------------------- الحذف
function removeEdges(doc, R, list) { for (const e of list) moveSpan(doc, R.level, e.ax, e.c, e.s0, e.s1, null); }
function doDelete(doc, it, req) {
  const I = inspect(doc), R = I.rooms.get(it.id); if (!R) return { ok: false, why_ar: `«${it.name}» غير موجودة في المخطط.` };
  const { request } = ctxOf(doc, req), cands = [];
  // (أ) إزالتها من الغلاف إن كانت على طرفه: تُزال جدرانها الخارجية، وأبوابها إلى الجيران تُسد
  const allEdges = Object.values(R.sides).flat();
  const extE = allEdges.filter(e => e.nb === 'outside');
  if (extE.length) cands.push({ ...build(doc, d => {
    const ids = new Set(); for (const e of allEdges) if (e.nb !== 'outside') for (const w of e.wallIds) ids.add(w);
    // أبواب الغرفة على جدرانها المشتركة تصير أبوابًا إلى الخارج: تُحذف
    const Lm = I.model.levelById.get(R.level);
    for (const op of Lm.openings) if (op.door && op.sides.some(s => s.room.id === R.id)) d.openings = d.openings.filter(o => o.id !== op.id);
    for (const op of Lm.openings) if (op.window && op.sides.some(s => s.room.id === R.id)) d.openings = d.openings.filter(o => o.id !== op.id);
    removeEdges(d, R, extE);
    d.labels = d.labels.filter(l => l.id !== R.id);
    dropFixtures(d, R.level, f => f.x > R.net.x0 && f.x < R.net.x1 && f.y > R.net.y0 && f.y < R.net.y1);
    return { desc: 'remove-from-envelope', how_ar: `أُزيلت «${R.name}» من المبنى نفسه (كانت على طرف الغلاف)، فصغر المسطح ${r2(R.area)} م² ولم تتغير غرفة أخرى` };
  }), penalty: 0 });
  // (ب) دمجها في جار يشاركها جدارًا (الممرات والصالة أولًا)
  const byNb = new Map(); for (const e of allEdges) if (e.nb !== 'outside' && e.nb !== 'void') { if (!byNb.has(e.nb)) byNb.set(e.nb, []); byNb.get(e.nb).push(e); }
  for (const [nb, edges] of byNb) {
    const N = I.rooms.get(nb); if (!N || ['bath', 'stairs'].includes(N.type) || edges.reduce((s, e) => s + e.len, 0) < 1) continue;
    cands.push({ ...build(doc, d => {
      const ids = new Set(edges.flatMap(e => e.wallIds));
      void ids;
      removeEdges(d, R, edges);
      d.labels = d.labels.filter(l => l.id !== R.id);
      dropFixtures(d, R.level, f => f.x > R.net.x0 && f.x < R.net.x1 && f.y > R.net.y0 && f.y < R.net.y1);
      return { desc: 'merge:' + N.name, mergedInto: N.id, how_ar: `أُدمجت مساحة «${R.name}» في «${N.name}» بإزالة الجدار بينهما` };
    }), penalty: PREFER.has(N.type) ? 0 : 1 });
  }
  // (ج) تحويلها مخزنًا في مكانها (لا يتغير شيء آخر)
  if (R.type !== 'storage') cands.push({ ...build(doc, d => {
    const l = d.labels.find(x => x.id === R.id); l.name = 'المخزن'; l.type = 'storage';
    dropFixtures(d, R.level, f => f.x > R.net.x0 && f.x < R.net.x1 && f.y > R.net.y0 && f.y < R.net.y1);
    return { desc: 'storage', how_ar: `صار مكان «${R.name}» مخزنًا بالمقاس نفسه (${r2(R.area)} م²)`, toStorage: true };
  }), penalty: R.area > 8 ? 3.5 : 1.5 });
  const req2 = { ...request, counts: { ...request.counts } };
  if (R.type === 'majlis' && req2.counts.majlis) req2.counts.majlis--;
  if ((R.type === 'bedroom' || R.type === 'master') && req2.counts.bedrooms) req2.counts.bedrooms--;
  if (R.type === 'dining' && req2.counts.dining) req2.counts.dining--;
  const check = Ia => { const gone = !Ia.rooms.has(R.id) || Ia.rooms.get(R.id).name !== R.name; return { ok: gone, why: 'ما زالت موجودة' }; };
  const { best, tried, consent } = choose(doc, cands, { scope: new Set([R.id]), request: req2, check, strict: req?.strict || false });
  if (!best && consent) return consentAsk(it, consent, req?.strict);
  if (!best) return { ok: false, why_ar: `تعذّر حذف «${R.name}» موضعيًا: ${[...new Set(tried.flatMap(x => x.why))].slice(0, 2).join('، ')}` };
  return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar, toStorage: !!best.toStorage, removedRoom: { id: R.id, name: R.name, area: r2(R.area) } };
}

// -------------------------------------------------- الإضافة
const ADD_SPEC = {
  laundry: { name: 'غرفة الغسيل', type: 'laundry', w: 2.2, d: 2.6, hosts: ['kitchen', 'service', 'storage', 'dining'], door: 'host', win: .8 },
  storage: { name: 'المخزن', type: 'storage', w: 1.8, d: 2.2, hosts: ['kitchen', 'service', 'laundry'], door: 'host', win: 0 },
  prayer: { name: 'المصلى', type: 'other', w: 3.0, d: 3.4, hosts: ['majlis', 'entrance', 'corridor', 'living'], door: 'host', win: 1.2 },
  office: { name: 'المكتب', type: 'office', w: 3.0, d: 3.4, hosts: ['entrance', 'corridor', 'living', 'majlis'], door: 'host', win: 1.4 },
  maid: { name: 'غرفة الخادمة', type: 'service', w: 3.0, d: 3.2, hosts: ['kitchen', 'service', 'laundry'], door: 'host', win: 1.2, bath: { name: 'حمام الخادمة', w: 1.6 } },
  // السائق: بابه إلى الخارج؛ يُلصق بمنطقة الخدمة أو الاستقبال لا بجناح النوم (خصوصية العائلة)
  driver: { name: 'غرفة السائق', type: 'service', w: 3.0, d: 3.2, hosts: ['kitchen', 'service', 'laundry', 'storage', 'majlis', 'entrance', 'dining', 'corridor', 'other'], door: 'outside', win: 1.2, bath: { name: 'حمام السائق', w: 1.6 } },
  bedroom: { name: null, type: 'bedroom', w: 3.6, d: 4.0, hosts: ['corridor', 'living'], door: 'host', win: 1.6, bath: { name: null, w: 1.7 } },
};
const PRIVATE_NAME = /الجناح|الغرف|الملابس|الرئيسية|غرفة نوم|حمام غرفة/;
const hostOk = (spec, kind, N) => spec.hosts === '*' ? true : spec.hosts.includes(N.type) && !(kind === 'driver' && PRIVATE_NAME.test(N.name)) && !(kind === 'bedroom' && /الرجال|الضيوف|العائله|العائلة|النساء/.test(N.name)) && !(kind === 'prayer' && N.type === 'living') && !(['maid', 'laundry', 'storage'].includes(kind) && /الرجال|النساء/.test(N.name));
/** امتداد للغلاف: كتلة جديدة ملاصقة لجدار خارجي لغرفة مضيفة، داخل خطوط الارتداد، لا تسد بابًا ولا مدخلًا. */
function extensionCands(doc, I, kind, spec, opts) {
  const out = [], tExt = Math.max(...doc.walls.filter(w => w.t >= .2).map(w => w.t), .25), tInt = .12;
  const bathW = opts.bath && spec.bath ? spec.bath.w : 0;
  const Wn = spec.w + (bathW ? bathW + tInt : 0);
  for (const H of roomList(I)) {
    if (!hostOk(spec, kind, H)) continue;
    for (const s of SIDES) for (const e of H.sides[s]) {
      if (e.nb !== 'outside' || e.len < (spec.door === 'host' ? 1.3 : .5)) continue;
      const out1 = s.endsWith('1') ? 1 : -1, ax = e.ax, c = e.c;
      const hostWall = doc.walls.find(w => w.level === H.level && onLine(w, ax, c) && spanOf(w, ax)[0] <= e.s0 + E && spanOf(w, ax)[1] >= e.s0);
      const tH = hostWall?.t || tExt;
      // اتجاهان للكتلة (العرض على امتداد الجدار، أو العمق)
      const room = maxOut(doc, H, s) + tH / 2; // المسافة من محور الجدار إلى خط الارتداد
      // الحمام بجانب الغرفة على امتداد الجدار، أو خلفها (كتلة أضيق وأعمق) حين لا يتسع الجدار
      for (const [along, depth0, stack] of [[Wn, spec.d, false], ...(bathW ? [[spec.w, spec.d + 1.6 + tInt, true]] : [[spec.d, spec.w, false]])]) {
        // عمق الكتلة لا يتجاوز خط الارتداد؛ يُقبل تقليله حتى 85٪ من المقاس التصميمي
        const depth = Math.min(depth0, Math.floor((room - tExt - tH / 2) * 100) / 100);
        if (depth < Math.max(depth0 * .75, kind === 'storage' ? 1.4 : kind === 'laundry' ? 1.8 : 2.4)) continue;
        const Wc = along + tExt, Dc = depth + tExt / 2 + tH / 2;
        // مواضع: محاذاة لطرفي حد المضيف ووسطه
        const runGaps = s0 => coverage(doc, H.level, ax, c, s0, s0 + Wc);
        // مواضع: محاذاة لطرفي حد المضيف ووسطه، وتجاوزه إلى جاره مع بقاء 1.3 م على المضيف للباب (تترك نافذته)
        // (الجولة السابعة) ومواضع تشارك جدارًا عموديًا قائمًا خارج المضيف (امتداد سابق كغرفة الغسيل): الكتلة تلاصقه فلا
        // يبقى بينهما شق، ويُستعمل جداره نفسه
        const near = doc.walls.filter(w => w.level === H.level && axisOfWall(w) === other(ax) && (out1 > 0 ? Math.max(acrossOf(w.a, other(ax)) === undefined ? 0 : 0, ...[w.a, w.b].map(q => acrossOf(q, ax))) > c + E : Math.min(...[w.a, w.b].map(q => acrossOf(q, ax))) < c - E)).map(w => alongOf(w.a, ax)).filter(v => v > e.s0 - Wc && v < e.s1 + Wc);
        for (const p0 of [e.s0, e.s1 - Wc, (e.s0 + e.s1) / 2 - Wc / 2, e.s0 - Wc + 1.3, e.s1 - 1.3, ...near.flatMap(v => [v, v - Wc])]) {
          const q0 = R3(p0), q1 = R3(p0 + Wc);
          if (runGaps(q0).length) continue; // الكتلة يجب أن تستند إلى جدار خارجي متصل
          if (spec.door === 'host' && Math.min(q1, e.s1) - Math.max(q0, e.s0) < 1.25) continue;
          out.push({ H, s, e, ax, c, out1, q0, q1, Wc, Dc, tExt, tInt, along, depth, rotated: along !== Wn && !stack, stack, tH });
        }
      }
    }
  }
  return out.map(g => ({ g, penalty: 0 }));
}
function buildExtension(doc, I, kind, spec, opts, g, label) {
  return build(doc, d => {
    const { H, ax, c, out1, q0, q1, Dc, tExt, tInt } = g, ox = other(ax), lv = H.level, c2 = R3(c + out1 * Dc);
    // لا تتقاطع الكتلة مع أي جدار قائم (عدا خط الاستناد)
    const lo = Math.min(c, c2), hi = Math.max(c, c2);
    for (const w of d.walls.filter(x => x.level === lv)) {
      const wa = axisOfWall(w); if (!wa) continue;
      const [a0, a1] = spanOf(w, wa), cc = acrossOf(w.a, wa);
      if (wa === ax) { const inner = out1 > 0 ? cc > c + E && cc < c2 + E : cc < c - E && cc > c2 - E; if (inner && a1 > q0 + E && a0 < q1 - E) fail('CLASH', 'الكتلة تتقاطع مع المبنى (' + w.id + ')'); }
      // جدار عمودي على خط حافة الكتلة نفسه (جدار امتداد ملاصق) يُشارَك ولا يُعد تقاطعًا
      else if (cc > q0 + E && cc < q1 - E && a1 > lo + E && a0 < hi - E) fail('CLASH', 'الكتلة تتقاطع مع المبنى (' + w.id + ')');
    }
    // لا شقّ ضيق بين الكتلة وجزء آخر من المبنى (فراغ أقل من 1.3 م بين المحورين لا يُمشى فيه ولا يضيء، ويحجب نوافذ الجار)
    {
      const B = ax === 'x' ? { x0: lo, x1: hi, y0: q0, y1: q1 } : { x0: q0, x1: q1, y0: lo, y1: hi };
      // جدار يقع كله في جهة المضيف (داخل خط الاستناد) لا يصنع شقًا خارجيًا مع الكتلة (درجة في الواجهة لا شق)
      const inner = w => { const v = [w.a, w.b].map(q => acrossOf(q, ax)); return out1 > 0 ? Math.max(...v) <= c + E : Math.min(...v) >= c - E; };
      for (const w of d.walls.filter(x => x.level === lv && !inner(x))) {
        const sx0 = Math.min(w.a.x, w.b.x), sx1 = Math.max(w.a.x, w.b.x), sy0 = Math.min(w.a.y, w.b.y), sy1 = Math.max(w.a.y, w.b.y);
        const gap = Math.hypot(Math.max(0, sx0 - B.x1, B.x0 - sx1), Math.max(0, sy0 - B.y1, B.y0 - sy1));
        if (gap > .05 && gap < 1.3) fail('SLIVER', `شق ضيق ${r2(gap)} م بين الكتلة والمبنى`);
      }
    }
    // فتحات جدار الاستناد في المقطع: الأبواب ممنوعة (لا يُسد مدخل)، والنوافذ تُنقل خارج المقطع أو تُحذف
    const removed = [], shifted = [];
    for (const w of d.walls.filter(x => x.level === lv && onLine(x, ax, c))) for (const { o, pos, half } of openingsOf(d, w)) {
      if (pos + half <= q0 + .05 || pos - half >= q1 - .05) continue;
      if (DOORISH(o.kind)) fail('DOOR_BLOCKED', 'الكتلة تسد بابًا قائمًا');
      // النافذة تنزلق خارج الكتلة على الجدار نفسه إن اتسع (تبقى للغرفة نفسها، وتتحقق منها البوابة)، وإلا تُحذف
      const [w0, w1] = spanOf(w, ax), dir = Math.sign(alongOf(w.b, ax) - alongOf(w.a, ax)) || 1;
      const opts = [q0 - half - .12, q1 + half + .12].filter(p => p - half >= w0 + .1 && p + half <= w1 - .1).sort((a, b) => Math.abs(a - pos) - Math.abs(b - pos));
      const clash = p => openingsOf(d, w).some(x => x.o !== o && Math.abs(x.pos - p) < x.half + half + .05);
      const p = opts.find(x => !clash(x));
      if (p !== undefined) { o.at = R3((p - alongOf(w.a, ax)) * dir); shifted.push(o.id); continue; }
      // لا مكان بعرضها: تصغر حتى 0.8 م في أوسع جزء باقٍ من الجدار نفسه
      const free = [[w0 + .1, q0 - .12], [q1 + .12, w1 - .1]].map(([a, b]) => [a, b, b - a]).filter(x => x[2] >= .8).sort((a, b) => b[2] - a[2])[0];
      const mid = free && (free[0] + free[1]) / 2, nw = free && Math.min(o.w, free[2]);
      if (free && !openingsOf(d, w).some(x => x.o !== o && Math.abs(x.pos - mid) < x.half + nw / 2 + .05)) { o.w = R3(nw); o.at = R3((mid - alongOf(w.a, ax)) * dir); shifted.push(o.id); }
      else { d.openings = d.openings.filter(x => x !== o); removed.push(clone(o)); }
    }
    const P = (acr, al) => PT(ax, acr, al);
    // جدار جانبي على خط جدار قائم يغطيه كله (امتداد سابق ملاصق): لا يُكرَّر
    const sideWall = q => { if (!coverage(d, lv, other(ax), q, lo, hi).length) return; addWall(d, lv, P(c, q), P(c2, q), tExt); };
    sideWall(q0); sideWall(q1);
    const outer = addWall(d, lv, P(c2, q0), P(c2, q1), tExt);
    const bathW = opts.bath && spec.bath && !g.rotated && !g.stack ? spec.bath.w : 0;
    // الحمام في الطرف البعيد عن المضيف (أو أي طرف للسائق)
    let rq0 = q0, rq1 = q1, bq0 = null, bq1 = null;
    if (g.stack && opts.bath) {
      // الحمام خلف الغرفة: جدار موازٍ لخط الاستناد يفصلهما، وباب الحمام فيه
      const split = R3(c + out1 * (g.tH / 2 + spec.d + tInt / 2)), mid = (q0 + q1) / 2;
      const pw = addWall(d, lv, P(split, q0), P(split, q1), tInt);
      addOpening(d, pw, 'door', mid, .75);
      d.labels.push({ id: nextId(d, 'labels'), level: lv, name: label.bath, type: 'bath', seed: P((split + c2) / 2, mid) });
      d.labels.push({ id: nextId(d, 'labels'), level: lv, name: label.name, type: spec.type, seed: P((c + split) / 2, mid) });
      if (spec.door === 'host') {
        const m0 = Math.max(q0, g.e.s0) + .1, m1 = Math.min(q1, g.e.s1) - .1; if (m1 - m0 < 1) fail('NO_DOOR', 'لا مكان لباب إلى المضيف');
        const hw = wallAt(d, lv, ax, c, (m0 + m1) / 2, .5); if (!hw) fail('NO_DOOR', 'لا جدار للباب'); addOpening(d, hw, 'door', (m0 + m1) / 2, .9);
      }
      const sides = [wallAt(d, lv, ox, q0, (c + split) / 2, .5), wallAt(d, lv, ox, q1, (c + split) / 2, .5)];
      if (spec.door !== 'host') addOpening(d, sides[0], 'door', (c + split) / 2, .9, { entry: true });
      if (spec.win) try { addOpening(d, sides[spec.door !== 'host' ? 1 : 0], 'window', (c + split) / 2, Math.min(spec.win, Math.abs(split - c) - .6)); } catch { /* تحكم بها البوابة */ }
      try { addOpening(d, outer, 'window', mid, .6); } catch { /* حمام بلا نافذة */ }
      return { desc: `ext-stack:${H.name}:${g.s}:${r2(q0)}`, how_ar: `أُضيفت ${label.name} وحمامها خلفها امتدادًا للمبنى ملاصقة لـ«${H.name}»${spec.door === 'host' ? ' وبابها إليها' : ' وبابها إلى الخارج'} (داخل خطوط الارتداد)`, removedOpenings: removed, host: H.id };
    }
    if (bathW) {
      const hostMid = (Math.max(q0, g.e.s0) + Math.min(q1, g.e.s1)) / 2, bathAtEnd = hostMid < (q0 + q1) / 2;
      const split = bathAtEnd ? R3(q1 - tExt / 2 - bathW - tInt / 2) : R3(q0 + tExt / 2 + bathW + tInt / 2);
      const sw = addWall(d, lv, P(c, split), P(c2, split), tInt);
      if (bathAtEnd) { rq1 = split; bq0 = split; bq1 = q1; } else { rq0 = split; bq0 = q0; bq1 = split; }
      addOpening(d, sw, 'door', (lo + hi) / 2 + (out1 > 0 ? .1 : -.1), .75);
      d.labels.push({ id: nextId(d, 'labels'), level: lv, name: label.bath, type: 'bath', seed: P((c + c2) / 2, (bq0 + bq1) / 2) });
    }
    const roomMid = (rq0 + rq1) / 2;
    d.labels.push({ id: nextId(d, 'labels'), level: lv, name: label.name, type: spec.type, seed: P((c + c2) / 2, roomMid) });
    // الباب: إلى المضيف عبر جدار الاستناد، أو إلى الخارج (السائق) على الجدار البعيد
    if (spec.door === 'host') {
      const m0 = Math.max(rq0, g.e.s0) + .1, m1 = Math.min(rq1, g.e.s1) - .1; if (m1 - m0 < 1) fail('NO_DOOR', 'لا مكان لباب إلى المضيف');
      const hw = wallAt(d, lv, ax, c, (m0 + m1) / 2, .5); if (!hw) fail('NO_DOOR', 'لا جدار للباب');
      addOpening(d, hw, 'door', (m0 + m1) / 2, .9);
    } else {
      addOpening(d, outer, 'door', rq0 + Math.min(.9, (rq1 - rq0) / 2), .9, { entry: true });
    }
    if (spec.win) {
      const span = rq1 - rq0, wpos = spec.door === 'host' ? roomMid : rq1 - Math.min(.9, span / 3);
      try { addOpening(d, outer, spec.win >= 1.2 ? 'window' : 'window', wpos, Math.min(spec.win, span - 1.2 > .6 ? spec.win : .8)); }
      catch { const side = wallAt(d, lv, ox, bathW && bq0 === q0 ? q1 : q0, (c + c2) / 2, .5); if (side) addOpening(d, side, 'window', (c + c2) / 2, Math.min(spec.win, Dc - .6)); }
      if (bathW) try { addOpening(d, outer, 'window', (bq0 + bq1) / 2, .6); } catch { /* حمام بلا نافذة: يُقبل */ }
    }
    return { desc: `ext:${H.name}:${g.s}:${r2(q0)}`, how_ar: `أُضيفت ${label.name}${label.bath ? ` وحمامها` : ''} امتدادًا للمبنى ${spec.door === 'host' ? `ملاصقة لـ«${H.name}» وبابها إليها` : `ملاصقة لـ«${H.name}» وبابها إلى الخارج`} (داخل خطوط الارتداد)`, removedOpenings: removed, host: H.id };
  });
}
/** اقتطاع من غرفة مانحة: شريط كامل على إحدى جهاتها أو ركن، بجدار جديد وباب إليها. */
function carveCands(doc, I, kind, spec, opts, label) {
  const out = [];
  const needA = spec.w * spec.d;
  for (const D of roomList(I)) {
    // المانح من منطقة الفراغ نفسها: الخدمة من الخدمة؛ والصالة/الممر للمصلى والمكتب وغرفة النوم فقط
    if (!D.rect || !(spec.hosts === '*' || spec.hosts.includes(D.type) || (['living', 'corridor'].includes(D.type) && ['prayer', 'office', 'bedroom'].includes(kind)))) continue;
    if (D.area < needA + (D.type === 'living' ? 18 : D.type === 'kitchen' ? 9 : 6)) continue;
    // مصلى للضيوف «قرب المجلس» لا يُقتطع من الصالة العائلية: بابه إليها فيعبر الضيف القسم العائلي
    if (kind === 'prayer' && opts.near === 'majlis' && ['living', 'corridor'].includes(D.type)) continue;
    for (const s of SIDES) {
      const G = sideGeom(D, s), habitable = spec.win > 0;
      const extHere = D.sides[s].some(e => e.nb === 'outside');
      const depth = spec.d + .12;
      for (const corner of ['lo', 'hi', 'full']) {
        const len = corner === 'full' ? G.s1 - G.s0 : spec.w + .12;
        if (len > G.s1 - G.s0 - (corner === 'full' ? 0 : 1.2)) continue;
        if (corner === 'full' && (len < spec.w * .8 || len > spec.w * 1.7)) continue;
        const p0 = corner === 'hi' ? G.s1 - len : G.s0, p1 = p0 + len;
        out.push(build(doc, d => {
          const lv = D.level, cIn = R3(G.c - G.out * depth), ox = other(G.ax);
          if (habitable && !extHere) {
            // نافذة: يجب أن يلامس الركن جدارًا خارجيًا على الجهة العمودية
            const endSide = corner === 'lo' ? (G.ax === 'x' ? 'y0' : 'x0') : corner === 'hi' ? (G.ax === 'x' ? 'y1' : 'x1') : null;
            if (!endSide || !D.sides[endSide].some(e => e.nb === 'outside')) fail('DARK', 'الغرفة الجديدة بلا جدار خارجي');
          }
          const par = addWall(d, lv, PT(G.ax, cIn, p0), PT(G.ax, cIn, p1), .12);
          if (corner !== 'full') addWall(d, lv, PT(G.ax, cIn, corner === 'lo' ? p1 : p0), PT(G.ax, G.c, corner === 'lo' ? p1 : p0), .12);
          addOpening(d, par, 'door', (p0 + p1) / 2, .9);
          const seed = PT(G.ax, (G.c + cIn) / 2, (p0 + p1) / 2);
          d.labels.push({ id: nextId(d, 'labels'), level: lv, name: label.name, type: spec.type, seed });
          const lab = d.labels.find(l => l.id === D.id);
          const strip = { ax: G.ax, c0: Math.min(cIn, G.c), c1: Math.max(cIn, G.c), s0: p0, s1: p1 };
          if (inStrip(lab.seed, strip, .3)) { const p = anchorOutside(D, strip); lab.seed = { x: R3(p.x), y: R3(p.y) }; }
          dropFixtures(d, lv, f => inStrip(f, strip, .2)); dropCutFixtures(d, lv);
          if (spec.win) {
            const ew = extHere ? wallAt(d, lv, G.ax, G.c, (p0 + p1) / 2, spec.win / 2 + .1) : wallAt(d, lv, ox, corner === 'lo' ? p0 : p1, (G.c + cIn) / 2, .5);
            if (ew) try { addOpening(d, ew, 'window', extHere ? (p0 + p1) / 2 : (G.c + cIn) / 2, Math.min(spec.win, (extHere ? len : depth) - .5)); } catch { /* تحكم بها البوابة */ }
          }
          return { desc: `carve:${D.name}:${s}:${corner}`, how_ar: `اقتُطعت ${label.name} من «${D.name}» بجدار جديد وباب إليها`, donor: D.id };
        }));
      }
    }
  }
  return out.filter(c => c.doc).map(c => ({ ...c, penalty: .5 }));
}
function nextBedName(I) { let n = 2; const names = new Set(roomList(I).map(r => r.name)); while (names.has(`غرفة نوم ${n}`)) n++; return n; }
// (الجولة السابعة) مقاس مدمج للفراغ المضاف حين لا يتسع المقاس التصميمي بجوار المضيف المطلوب: مصلى لشخصين أو ثلاثة 2.5 × 2.8 م،
// ومكتب 2.6 × 3.0 م — يُجرَّب قبل إعادة توزيع البيت كله، ويُقال المقاس في الرد
const ADD_COMPACT = { prayer: { w: 2.5, d: 2.8 }, office: { w: 2.6, d: 3.0 } };
function doAdd(doc, it, req) {
  const I = inspect(doc), spec0 = ADD_SPEC[it.kind]; if (!spec0) return { ok: false, why_ar: 'نوع غير مدعوم' };
  const { request, entry } = ctxOf(doc, req);
  const n = it.kind === 'bedroom' ? nextBedName(I) : null;
  const ens = it.kind === 'bedroom' && !!(req?.prefs?.allEnsuite);
  const label = { name: it.kind === 'bedroom' ? `غرفة نوم ${n}` : spec0.name, bath: it.kind === 'bedroom' ? (ens ? `حمام غرفة ${n}` : null) : it.bath && spec0.bath ? spec0.bath.name : null };
  const opts = { bath: !!label.bath, near: it.near || null };
  const req2 = { ...request, counts: { ...request.counts } };
  const nearR = it.near ? [{ id: 'N', kind: 'near', a: it.kind, b: it.near, text: 'قرب', level: 'must' }] : null;
  // كل قواعد الدور عن المضاف أولًا (الموضع والقرب معًا)؛ إن لم يحققها موضع، القرب وحده كما كان
  const allR = it.rules?.length ? it.rules.map((r, i) => ({ ...r, id: 'A' + i, level: r.level || 'must' })) : null;
  const scope = new Set(); // المضاف جديد: ما تغيّر غيره يُحسب
  const attempt = spec => {
    const cands = extensionCands(doc, I, it.kind, spec, opts).map(({ g, penalty }) => ({ ...buildExtension(doc, I, it.kind, spec, opts, g, label), at: `${g.H.name}:${g.s}:${r2(g.q0)}`, penalty: penalty + (g.s && doc.entry && compassSide(g.s) === (entry || 's') ? .6 : 0) }));
    if (!opts.bath) cands.push(...carveCands(doc, I, it.kind, spec, opts, label));
    const checkWith = rule => Ia => {
      const r = [...Ia.rooms.values()].find(x => x.name === label.name); if (!r) return { ok: false, why: 'لم تُنشأ' };
      if (r.area < spec.w * spec.d * .7) return { ok: false, why: 'أصغر من اللازم' };
      if (rule) for (const v of verifyRules(Ia.model.doc, rule, { entry })) if (!v.ok) return { ok: false, why: v.why };
      return { ok: true, measured: { area: r2(r.area) } };
    };
    const okCands = cands.filter(c => c.doc);
    let res = allR ? choose(doc, okCands, { scope, request: req2, check: checkWith(allR), strict: req?.strict || false }) : { best: null, tried: [], consent: null };
    if (!res.best && !res.consent) res = choose(doc, okCands, { scope, request: req2, check: checkWith(nearR), strict: req?.strict || false });
    if (globalThis.__peDebug) console.error('ADD tried', spec.w + '×' + spec.d, cands.length, res.tried.map(x => x.desc + ': ' + x.why.join('|')).slice(0, 40), cands.filter(c => !c.doc).map(c => c.err + ' @' + c.at).slice(0, 60));
    return res;
  };
  let { best, tried, consent } = attempt(spec0), compact = null;
  if (!best && !consent && ADD_COMPACT[it.kind]) {
    const sc = { ...spec0, ...ADD_COMPACT[it.kind] }, r = attempt(sc);
    if (r.best || r.consent) { ({ best, consent } = r); compact = sc; } tried = [...tried, ...r.tried];
  }
  if (!best && consent) return consentAsk({ text_ar: it.text_ar || `إضافة ${label.name}` }, consent, req?.strict);
  if (!best) return { ok: false, why_ar: `لم أجد موضعًا لـ${label.name} داخل خطوط الارتداد ولا غرفة مناسبة أقتطع منها دون كسر بوابة (${[...new Set(tried.flatMap(x => x.why))].slice(0, 3).join('، ') || 'لا مرشح'}).` };
  const how = compact ? `${best.how_ar} — بمقاس مدمج ${compact.w}×${compact.d} م لأن المقاس المعتاد ${spec0.w}×${spec0.d} م لا يتسع بجوارها` : best.how_ar;
  return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: how, removedOpenings: best.removedOpenings || [], added: label };
}
const compassSide = s => ({ x0: 'w', x1: 'e', y0: 's', y1: 'n' }[s]);

// -------------------------------------------------- مبادلة غرفتين (لقاعدة مكانية)
const SWAP_T = new Set(['kitchen', 'dining', 'office', 'other', 'service', 'laundry', 'storage']);
function swapLabels(doc, a, b, I) {
  return build(doc, d => {
    const la = d.labels.find(l => l.id === a.id), lb = d.labels.find(l => l.id === b.id);
    const sa = la.seed, sb = lb.seed; la.seed = sb; lb.seed = sa;
    // الأثاث يُنقل مع غرفته (بفرق المركزين) ويُحذف ما لا يتسع
    const inR = (f, R) => f.x > R.net.x0 && f.x < R.net.x1 && f.y > R.net.y0 && f.y < R.net.y1;
    const fa = d.fixtures.filter(f => f.level === a.level && inR(f, a)), fb = d.fixtures.filter(f => f.level === b.level && inR(f, b));
    for (const f of fa) { f.x = R3(f.x + b.cx - a.cx); f.y = R3(f.y + b.cy - a.cy); }
    for (const f of fb) { f.x = R3(f.x + a.cx - b.cx); f.y = R3(f.y + a.cy - b.cy); }
    const bad = f => { const B = fixBox(f), R = fa.includes(f) ? b : a; return B.x0 < R.net.x0 - .02 || B.x1 > R.net.x1 + .02 || B.y0 < R.net.y0 - .02 || B.y1 > R.net.y1 + .02; };
    d.fixtures = d.fixtures.filter(f => !((fa.includes(f) || fb.includes(f)) && bad(f)));
    void I;
    return { desc: `swap:${a.name}<->${b.name}`, how_ar: `تبادلت «${a.name}» و«${b.name}» موضعيهما (الجدران نفسها)` };
  });
}
/** يضيف بابًا أو فتحة بين غرفتين متجاورتين إن لم يكن بينهما باب. */
function linkRooms(doc, I, aId, bId, kind = 'door') {
  const A = I.rooms.get(aId), B = I.rooms.get(bId); if (!A || !B) return false;
  if (A.links.some(l => l.to === bId)) return true;
  const e = Object.values(A.sides).flat().filter(x => x.nb === bId).sort((p, q) => q.len - p.len)[0]; if (!e || e.len < 1.1) return false;
  const w = wallAt(doc, A.level, e.ax, e.c, (e.s0 + e.s1) / 2, .5); if (!w) return false;
  try { addOpening(doc, w, kind, (e.s0 + e.s1) / 2, kind === 'arch' ? Math.min(1.6, e.len - .4) : .9); return true; } catch { return false; }
}
// -------------------------------------------------- (الجولة العاشرة) عكس شريط من الغرف
/**
 * الأشرطة التي تقع فيها الغرفة A: صف غرف بعمق A نفسه (على المحور العرضي) تملأ مستطيلًا كاملًا، ومقسوم بجدران كاملة
 * العمق إلى شرائح (مثل الشريط الأمامي: المجلس | مدخل الرجال ودورة المياه | مدخل العائلة).
 * يعيد [{ ax, lv, b0, b1, c0, c1, ids, slices }] — ax محور الصف (الشرائح مرتبة عليه)، وb0..b1 امتداده، وc0..c1 عمقه.
 */
function bandsOf(I, A) {
  const out = [];
  for (const ax of ['x', 'y']) {
    const c0 = ax === 'x' ? A.cl.y0 : A.cl.x0, c1 = ax === 'x' ? A.cl.y1 : A.cl.x1;
    const acr = r => ax === 'x' ? [r.cl.y0, r.cl.y1] : [r.cl.x0, r.cl.x1], alg = r => ax === 'x' ? [r.cl.x0, r.cl.x1] : [r.cl.y0, r.cl.y1];
    const S = new Map(roomList(I).filter(r => r.level === A.level && r.rect && acr(r)[0] >= c0 - E && acr(r)[1] <= c1 + E).map(r => [r.id, r]));
    const comp = new Set([A.id]), queue = [A];
    while (queue.length) { const r = queue.shift(); for (const e of Object.values(r.sides).flat()) if (S.has(e.nb) && !comp.has(e.nb)) { comp.add(e.nb); queue.push(S.get(e.nb)); } }
    const rs = [...comp].map(id => S.get(id) || A);
    const b0 = Math.min(...rs.map(r => alg(r)[0])), b1 = Math.max(...rs.map(r => alg(r)[1]));
    const sum = rs.reduce((s, r) => s + (r.cl.x1 - r.cl.x0) * (r.cl.y1 - r.cl.y0), 0);
    if (Math.abs(sum - (b1 - b0) * (c1 - c0)) > .005 * (b1 - b0) * (c1 - c0)) continue;
    const cuts = [...new Set(rs.flatMap(r => alg(r).map(v => R3(v))))].sort((a, b) => a - b).filter(p => !rs.some(r => alg(r)[0] < p - E && alg(r)[1] > p + E));
    if (cuts.length < 3) continue;
    const slices = cuts.slice(0, -1).map((p, i) => ({ s0: p, s1: cuts[i + 1], ids: rs.filter(r => alg(r)[0] >= p - E && alg(r)[1] <= cuts[i + 1] + E).map(r => r.id) }));
    out.push({ ax, lv: A.level, b0, b1, c0, c1, ids: [...comp], slices });
  }
  return out;
}
const PRIVATE_T = new Set(['bedroom', 'master']);
/** هل يصح باب بين غرفتين (بعد العكس)؟ المجلس لا يفتح على الصالة العائلية ولا غرف النوم، وغرفة النوم لا تفتح على الطعام والمطبخ والمجلس. */
function doorOk(X, Y) {
  if (!X || !Y) return true;
  const t = [X.type, Y.type], has = k => t.includes(k), guest = r => r.type === 'majlis' || /الرجال|الضيوف/.test(r.name);
  if ((guest(X) && (Y.type === 'living' || PRIVATE_T.has(Y.type) || Y.type === 'kitchen')) || (guest(Y) && (X.type === 'living' || PRIVATE_T.has(X.type) || X.type === 'kitchen'))) return false;
  if (t.some(x => PRIVATE_T.has(x)) && (has('dining') || has('kitchen') || has('majlis'))) return false;
  if (has('bath') && !t.some(x => PRIVATE_T.has(x) || x === 'corridor' || x === 'entrance' || x === 'living' || x === 'service')) return false;
  return true;
}
/**
 * يعكس الشريط حول منتصفه (الشرائح بترتيب معكوس، وكل شريحة معكوسة)، فتبقى علاقات الغرف داخله كما هي؛ والأبواب على حدود
 * الشريط مع ما خلفه تُعاد تعليقًا: تبقى على جارها القديم إن بقي ملاصقًا، أو تنتقل إلى جار جديد مناسب، أو تُسد إن كان
 * الجار الجديد غير مناسب (المجلس لا يفتح على الصالة العائلية). الجدران خارج الشريط لا تُمس.
 */
function reflectBand(doc, I, band) {
  return build(doc, d => {
    const { ax, lv, b0, b1, c0, c1 } = band, oax = other(ax); // ax 'x': الشريط أفقي، جدرانه القاطعة رأسية (axisOfWall = 'x')
    const al = p => alongOf(p, oax), ac = p => acrossOf(p, oax); // على امتداد الشريط وعرضه
    const M = v => R3(b0 + b1 - v);
    const refl = p => oax === 'x' ? { x: R3(p.x), y: M(p.y) } : { x: M(p.x), y: R3(p.y) };
    const inside = (p, m = E) => al(p) >= b0 - m && al(p) <= b1 + m && ac(p) >= c0 - m && ac(p) <= c1 + m;
    // تصنيف الجدران: حدود الشريط (موازية له على c0/c1)، ونهايتاه (قاطعة على b0/b1)، وداخله (تُعكس)
    const isBoundary = w => axisOfWall(w) === oax && (near(acrossOf(w.a, oax), c0) || near(acrossOf(w.a, oax), c1));
    const isEnd = w => axisOfWall(w) === ax && (near(acrossOf(w.a, ax), b0) || near(acrossOf(w.a, ax), b1));
    const interior = d.walls.filter(w => w.level === lv && inside(w.a) && inside(w.b) && !isBoundary(w) && !isEnd(w));
    if (!interior.length) fail('BAND_EMPTY', 'لا جدار داخل الشريط');
    const intIds = new Set(interior.map(w => w.id));
    // فتحات الحدود والنهايتين: موضعها المطلق قبل العكس
    const absPos = o => { const w = wallById(d, o.wall), axw = axisOfWall(w); if (!axw) return null; const dir = Math.sign(alongOf(w.b, axw) - alongOf(w.a, axw)) || 1; return { w, axw, c: acrossOf(w.a, axw), pos: alongOf(w.a, axw) + dir * o.at }; };
    const Lm = I.model.levelById.get(lv), opSides = new Map(Lm.openings.map(op => [op.id, op]));
    const bandSet = new Set(band.ids);
    const moved = [];
    for (const o of d.openings.filter(x => x.level === lv || interior.some(w => w.id === x.wall))) {
      if (intIds.has(o.wall)) { if (o.hinge) o.hinge = o.hinge === 'left' ? 'right' : 'left'; continue; }
      const P0 = absPos(o); if (!P0) continue;
      const w = P0.w;
      if (isBoundary(w) && P0.pos > b0 + E && P0.pos < b1 - E) moved.push({ o, line: P0.axw, c: P0.c, pos: M(P0.pos), wasPos: P0.pos, kind: 'boundary' });
      else if (isEnd(w) && P0.pos > c0 + E && P0.pos < c1 - E) {
        const op = opSides.get(o.id), ext = !op || op.sides.some(s => s.other === 'outside') || op.sides.length < 2;
        if (ext) moved.push({ o, line: P0.axw, c: near(P0.c, b0) ? b1 : b0, pos: P0.pos, wasPos: P0.pos, kind: 'end' });
        else moved.push({ o, line: P0.axw, c: P0.c, pos: P0.pos, wasPos: P0.pos, kind: 'endInner' });
      }
    }
    for (const w of interior) { const a = refl(w.a), b = refl(w.b); w.a = a; w.b = b; }
    // إعادة استضافة فتحات الحدود والنهايتين على الجدار الذي يغطي موضعها الجديد على الخط نفسه
    for (const m of moved) {
      const host = d.walls.find(w => w.level === lv && onLine(w, m.line, m.c) && spanOf(w, m.line)[0] <= m.pos - m.o.w / 2 - .05 + 1e-6 && spanOf(w, m.line)[1] >= m.pos + m.o.w / 2 + .05 - 1e-6);
      if (!host) { if (isWin(m.o.kind)) { d.openings = d.openings.filter(x => x !== m.o); continue; } fail('BAND_HOST', 'لا جدار يستضيف فتحة بعد العكس'); }
      const dir = Math.sign(alongOf(host.b, m.line) - alongOf(host.a, m.line)) || 1;
      m.o.wall = host.id; m.o.at = R3((m.pos - alongOf(host.a, m.line)) * dir);
      if (m.kind !== 'endInner' && m.o.hinge) m.o.hinge = m.o.hinge === 'left' ? 'right' : 'left';
    }
    for (const l of d.labels) if (l.level === lv && inside(l.seed, 0) && bandSet.has(l.id)) l.seed = refl(l.seed);
    for (const f of d.fixtures) if (f.level === lv && inside(f, 0)) { const p = refl(f); f.x = p.x; f.y = p.y; f.rot = oax === 'y' ? Math.PI - (f.rot || 0) : -(f.rot || 0); }
    // إعادة تعليق الأبواب على الحدود والنهايتين
    const Ia = inspect(d), La = Ia.model.levelById.get(lv), dropped = [], rehung = [];
    for (const m of moved) {
      if (!d.openings.includes(m.o) || !DOORISH(m.o.kind) && m.o.kind !== 'arch') continue;
      const before = opSides.get(m.o.id), after = La.openings.find(op => op.id === m.o.id);
      if (!before || !after) continue;
      const bandB = before.sides.find(s => bandSet.has(s.room.id)), bandA = after.sides.find(s => bandSet.has(s.room.id));
      if (!bandB || !bandA || bandB.room.id !== bandA.room.id) continue;
      const Y0 = bandB.other, Y1 = bandA.other;
      if (Y0 === Y1) continue;
      const X = Ia.rooms.get(bandA.room.id);
      // الجار القديم ما زال ملاصقًا على الخط نفسه؟ يُنقل الباب إلى الجزء المشترك
      const seg = Y0 !== 'outside' ? Object.values(X.sides).flat().filter(e => e.nb === Y0 && e.ax === m.line && near(e.c, m.c) && e.len >= m.o.w + .3).sort((p, q) => q.len - p.len)[0] : null;
      if (seg) { const w = wallAt(d, lv, m.line, m.c, (seg.s0 + seg.s1) / 2, m.o.w / 2 + .05); if (w) { const pos = Math.max(seg.s0 + m.o.w / 2 + .15, Math.min(seg.s1 - m.o.w / 2 - .15, m.pos)), dir = Math.sign(alongOf(w.b, m.line) - alongOf(w.a, m.line)) || 1; m.o.wall = w.id; m.o.at = R3((pos - alongOf(w.a, m.line)) * dir); rehung.push({ id: m.o.id, from: Y0, to: Y0 }); continue; } }
      if (Y1 !== 'outside' && doorOk(X, Ia.rooms.get(Y1))) { rehung.push({ id: m.o.id, from: Y0, to: Y1 }); continue; }
      if (Y1 === 'outside' && !m.o.entry) fail('DOOR_OUT', 'باب داخلي سيفتح على الخارج');
      d.openings = d.openings.filter(x => x !== m.o); dropped.push({ id: m.o.id, from: X.id, to: Y0 });
    }
    const nm = id => I.rooms.get(id)?.name || id;
    const order = band.slices.map(s => s.ids.map(nm).join('+'));
    return { desc: `reflect:${ax}:${r2(b0)}-${r2(b1)}`, how_ar: `عُكس الشريط ${ax === 'x' ? 'الأفقي' : 'الرأسي'} (${order.join(' | ')}) حول منتصفه فصار ترتيبه (${[...order].reverse().join(' | ')})، والجدران خارجه كما هي${rehung.filter(r => r.to !== r.from).length ? `؛ وصار ${rehung.filter(r => r.to !== r.from).map(r => `باب كان إلى «${nm(r.from)}» يفتح على «${Ia.rooms.get(r.to)?.name || r.to}»`).join('، ')}` : ''}${dropped.length ? `؛ وسُدّ ${dropped.map(x => `باب «${nm(x.from)}» إلى «${nm(x.to)}»`).join('، ')}` : ''}`, band };
  });
}
function doRule(doc, it, req) {
  const { request, entry } = ctxOf(doc, req), rule = { ...it.rule, id: 'E', level: it.rule.level || 'must' };
  const v0 = verifyRules(doc, [rule], { entry })[0];
  if (v0.ok) return { ok: true, already: true, doc, why_ar: `«${rule.text}» متحقق في المخطط المعروض كما هو (مقيس)؛ لم أغيّر شيئًا.` };
  if (!['place', 'adjacent', 'near'].includes(rule.kind)) return { ok: false, fallback: true, why_ar: `«${rule.text}» غير متحقق، ولا تعديل موضعي له.` };
  const I = inspect(doc), rooms = roomList(I);
  const SUBJ = { kitchen: r => r.type === 'kitchen', dining: r => r.type === 'dining', office: r => r.name === 'المكتب', prayer: r => r.name === 'المصلى', maid: r => r.name === 'غرفة الخادمة', driver: r => r.name === 'غرفة السائق', laundry: r => r.name === 'غرفة الغسيل', storage: r => r.name === 'المخزن' };
  // (الجولة العاشرة) فراغات لا تُبادل بغرفة أخرى لكن يمكن عكس شريطها: المجلس، والرئيسية، والصالة، ومجلس النساء
  const BAND_SUBJ = { majlis: r => r.type === 'majlis' && r.name !== 'مجلس النساء', majlis_w: r => r.name === 'مجلس النساء', master: r => r.type === 'master', hall: r => r.name === 'الصالة', ...SUBJ };
  const A = rooms.filter(r => SUBJ[rule.a]?.(r)), AB = rooms.filter(r => BAND_SUBJ[rule.a]?.(r));
  if (!A.length && !AB.length) return { ok: false, fallback: true, why_ar: `«${rule.text}»: لا تبديل موضعي لهذا الفراغ (يبقى في موضعه إلا بإعادة توزيع).` };
  const cands = [];
  // عكس الشريط الذي فيه الفراغ (الشريط الأمامي مثلًا) — ونطاق الطلب: الفراغ وجناح الضيافة معه والحركة في الشريط
  const bandScope = new Set(AB.map(a => a.id));
  for (const a of AB) for (const band of bandsOf(I, a)) {
    const c = reflectBand(doc, I, band); if (!c.doc) { if (globalThis.__peDebug) console.error('BAND fail', c.err); continue; }
    for (const id of band.ids) { const r = I.rooms.get(id); if (r && (['corridor', 'entrance'].includes(r.type) || (/الرجال|الضيوف/.test(r.name) && a.type === 'majlis') || (rule.a === 'master' && /الرئيسية|ملابس/.test(r.name)))) bandScope.add(id); }
    cands.push({ ...c, penalty: 1 });
  }
  for (const a of A) for (const b of rooms) {
    if (b.id === a.id || !SWAP_T.has(b.type) || b.level !== a.level) continue;
    const k = b.area / a.area; if (k < .7 || k > 1.43) continue;
    const c = swapLabels(doc, a, b, I); if (!c.doc) continue;
    if (rule.kind === 'adjacent' || rule.kind === 'near') { const Ic = inspect(c.doc), bb = roomList(Ic).find(r => SUBJ[rule.b]?.(r) || (rule.b === 'majlis' && r.type === 'majlis' && r.name !== 'مجلس النساء') || (rule.b === 'hall' && r.name === 'الصالة')); if (bb) linkRooms(c.doc, Ic, a.id, bb.id, rule.a === 'kitchen' && req?.prefs?.openKitchen ? 'arch' : 'door'); }
    cands.push({ ...c, swapped: [a.id, b.id] });
  }
  const check = Ia => { const v = verifyRules(Ia.model.doc, [rule], { entry })[0]; return { ok: v.ok, why: v.why }; };
  const { best, tried, consent } = choose(doc, cands, { scope: new Set([...A.map(a => a.id), ...bandScope]), request, check, strict: req?.strict || false });
  if (globalThis.__peDebug) console.error('RULE tried', cands.length, tried.map(x => x.desc + ': ' + x.why.join('|')).slice(0, 20), 'best', best?.desc, 'consent', consent?.desc);
  if (!best && consent) return { ...consentAsk({ text_ar: rule.text }, consent, req?.strict), fallback: true };
  if (!best) return { ok: false, fallback: true, why_ar: `«${rule.text}» غير متحقق في المعروض، ولا تبديل موضعي بين غرفتين متقاربتين في المساحة ولا عكس شريط يحققه دون كسر بوابة${tried.length ? ` (${tried.length} محاولة: ${[...new Set(tried.flatMap(x => x.why))].slice(0, 2).join('، ')})` : ''}.` };
  return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar, swapped: best.swapped };
}

// -------------------------------------------------- المطبخ مفتوح/مغلق، والمدخل الخارجي
function doKitchenOpen(doc, it, req) {
  const I = inspect(doc), rooms = roomList(I), K = rooms.find(r => r.type === 'kitchen');
  const T = rooms.find(r => it.to === 'hall' ? r.name === 'الصالة' || r.type === 'living' : r.type === 'dining');
  if (!K || !T) return { ok: false, why_ar: `لا يوجد ${!K ? 'مطبخ' : it.to === 'hall' ? 'صالة' : 'طعام'} في المخطط.` };
  const { request } = ctxOf(doc, req);
  const shared = Object.values(K.sides).flat().filter(e => e.nb === T.id);
  if (!shared.length) return { ok: false, fallback: true, why_ar: `«المطبخ» لا يجاور «${T.name}» في المعروض؛ فتحه عليه يحتاج نقل أحدهما.` };
  const links = K.links.filter(l => l.to === T.id);
  const want = it.open ? 'arch' : 'door';
  if (links.length && links.every(l => (l.kind === 'arch') === it.open)) return { ok: true, already: true, doc, why_ar: `المطبخ ${it.open ? 'مفتوح' : 'مغلق'} على «${T.name}» أصلًا.` };
  const c = build(doc, d => {
    if (links.length) for (const l of links) { const o = d.openings.find(x => x.id === l.id); o.kind = want; const w = wallById(d, o.wall), L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y); const nw = it.open ? Math.min(1.6, L - .3) : .9; o.w = nw; o.h = it.open ? 2.3 : 2.1; o.at = R3(Math.max(nw / 2 + .05, Math.min(L - nw / 2 - .05, o.at))); }
    else if (!linkRooms(d, I, K.id, T.id, want)) fail('NO_WALL', 'لا جدار مشترك يكفي لفتحة');
    return { desc: 'kitchen-' + want, how_ar: it.open ? `صار الباب بين المطبخ و«${T.name}» فتحة مفتوحة` : `صارت الفتحة بين المطبخ و«${T.name}» بابًا يُغلق` };
  });
  const check = Ia => { const k = Ia.rooms.get(K.id), ls = k.links.filter(l => l.to === T.id); return { ok: ls.length > 0 && ls.every(l => (l.kind === 'arch') === it.open), why: 'الفتحة' }; };
  const { best, tried } = choose(doc, [c], { scope: new Set([K.id, T.id]), request, check });
  if (!best) return { ok: false, why_ar: 'تعذّر: ' + [...new Set(tried.flatMap(x => x.why))].join('، ') };
  return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar };
}
function doExtDoor(doc, it, req) {
  const I = inspect(doc), R = I.rooms.get(it.id); if (!R) return { ok: false, why_ar: `«${it.name}» غير موجودة.` };
  const { request } = ctxOf(doc, req);
  const Lm = I.model.levelById.get(R.level), own = Lm.openings.filter(op => op.door && op.sides.some(s => s.room.id === R.id && s.other === 'outside'));
  if (own.length) return { ok: true, already: true, doc, why_ar: `«${R.name}» لها باب خارجي أصلًا.` };
  const cands = [];
  for (const s of SIDES) for (const e of R.sides[s]) {
    if (e.nb !== 'outside' || e.len < 1.4) continue;
    for (const f of [.3, .5, .7]) cands.push(build(doc, d => {
      const pos = e.s0 + (e.s1 - e.s0) * f, w = wallAt(d, R.level, e.ax, e.c, pos, .6); if (!w) fail('NO_WALL');
      // النافذة التي تشغل الموضع تُزاح لا تُحذف
      addOpening(d, w, 'door', pos, .9, { entry: true });
      return { desc: `extdoor:${s}:${f}`, how_ar: `أُضيف لـ«${R.name}» باب خارجي مستقل على جدارها ${{ x0: 'الغربي', x1: 'الشرقي', y0: 'الجنوبي', y1: 'الشمالي' }[s]}` };
    }));
  }
  if (!cands.length) return { ok: false, fallback: true, why_ar: `«${R.name}» لا تلامس جدارًا خارجيًا يتسع لباب؛ المدخل المستقل يحتاج نقلها إلى طرف المبنى.` };
  const check = Ia => ({ ok: Ia.model.levelById.get(R.level).openings.some(op => op.door && op.sides.some(s => s.room.id === R.id && s.other === 'outside')), why: 'لا باب خارجي' });
  const { best, tried } = choose(doc, cands, { scope: new Set([R.id]), request, check });
  if (!best) return { ok: false, why_ar: 'تعذّر: ' + [...new Set(tried.flatMap(x => x.why))].slice(0, 2).join('، ') };
  return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar };
}

// -------------------------------------------------- (الجولة العاشرة) الأبواب والنوافذ
const KIND_AR_OP = { door: 'باب', door2: 'باب مزدوج', slider: 'باب منزلق', arch: 'فتحة مفتوحة', garage: 'باب كراج', window: 'نافذة', window2: 'نافذة' };
/** الفتحات بين غرفتين (أو غرفة والخارج) من التحليل: [{ op, other }] */
function openingsBetween(I, aId, bId = null, test = op => op.door) {
  const A = I.rooms.get(aId); if (!A) return [];
  const L = I.model.levelById.get(A.level);
  return L.openings.filter(op => test(op) && op.sides.some(s => s.room.id === aId && (bId === null || s.other === bId))).map(op => ({ op, other: op.sides.find(s => s.room.id === aId).other }));
}
/** المقطع المشترك الأطول بين غرفتين (على جدار واحد مستقيم) أو بين غرفة والخارج. */
const sharedEdges = (R, nb) => Object.values(R.sides).flat().filter(e => e.nb === nb).sort((p, q) => q.len - p.len);
/** يضع فتحة على مقطع (ax، c، s0..s1) في أقرب موضع حر إلى pos، بعيدًا عن الفتحات الأخرى؛ يعيد الفتحة أو null. */
function placeOnSegment(doc, lv, seg, kind, width, pos, extra = {}, ignore = null) {
  const lo = seg.s0 + width / 2 + .15, hi = seg.s1 - width / 2 - .15; if (hi < lo - 1e-6) return null;
  const tries = [Math.max(lo, Math.min(hi, pos))]; for (let k = 1; k <= 30; k++) for (const sg of [1, -1]) { const p = tries[0] + sg * k * .1; if (p >= lo - 1e-6 && p <= hi + 1e-6) tries.push(p); }
  for (const p of tries) {
    const w = wallAt(doc, lv, seg.ax, seg.c, p, width / 2 + .02); if (!w) continue;
    if (openingsOf(doc, w).some(x => x.o !== ignore && Math.abs(x.pos - p) < x.half + width / 2 + .1)) continue;
    const dir = Math.sign(alongOf(w.b, seg.ax) - alongOf(w.a, seg.ax)) || 1;
    if (ignore) { ignore.wall = w.id; ignore.at = R3((p - alongOf(w.a, seg.ax)) * dir); return ignore; }
    return addOpening(doc, w, kind, p, width, extra);
  }
  return null;
}
function doDoor(doc, it, req) {
  const I = inspect(doc), { request } = ctxOf(doc, req), nm = id => id === 'outside' ? 'الخارج' : I.rooms.get(id)?.name || id;
  const A = it.a ? I.rooms.get(it.a) : null;
  if (it.a && !A) return { ok: false, why_ar: `«${it.aName}» غير موجودة في المخطط.` };
  const linkCheck = (aId, bId, want) => Ia => { const ok = openingsBetween(Ia, aId, bId).length > 0; return { ok: ok === want, why: want ? 'لا باب بينهما' : 'ما زال بينهما باب' }; };
  if (it.action === 'add') {
    const B = I.rooms.get(it.b); if (!B) return { ok: false, why_ar: `«${it.bName}» غير موجودة في المخطط.` };
    const ex = openingsBetween(I, A.id, B.id);
    if (ex.length) return { ok: true, already: true, doc, subjectDoor: ex[0].op.id, why_ar: `بين «${A.name}» و«${B.name}» ${KIND_AR_OP[ex[0].op.kind] || 'باب'} أصلًا؛ لم أغيّر شيئًا.` };
    const seg = sharedEdges(A, B.id)[0];
    if (!seg) return { ok: false, why_ar: `«${A.name}» و«${B.name}» لا تتجاوران في المخطط؛ الباب بينهما يحتاج نقل إحداهما.` };
    if (seg.len < 1.1) return { ok: false, why_ar: `الجدار المشترك بين «${A.name}» و«${B.name}» ${r2(seg.len)} م فقط ولا يتسع لباب.` };
    if (!doorOk(A, B) && !req?.consent) return { ok: false, ask: `باب بين «${A.name}» و«${B.name}» يكشف ${A.type === 'majlis' || B.type === 'majlis' ? 'القسم العائلي للضيوف' : 'غرفة النوم على فراغ مشترك'}؛ أنفّذه مع ذلك؟ (قل «نعم» أو «لا»)`, why_ar: 'يحتاج موافقتك؛ لم أغيّر شيئًا.' };
    let made = null;
    const c = build(doc, d => { made = placeOnSegment(d, A.level, seg, 'door', .9, (seg.s0 + seg.s1) / 2); if (!made) fail('NO_ROOM', 'لا موضع حرًا لباب على الجدار المشترك'); return { desc: 'door-add', how_ar: `أُضيف باب عرضه 0.9 م في الجدار المشترك بين «${A.name}» و«${B.name}» (طوله ${r2(seg.len)} م)`, subjectDoor: made.id }; });
    // (الجولة الحادية عشرة) باب بين المجلس والطعام طلبه العميل نصًا في هذا التعديل: شرط العميل يغلب افتراض خصوصية المجلس
    const asked = [A.type, B.type].includes('majlis') && [A.type, B.type].includes('dining') ? { ...request, majlisDining: true } : request;
    const { best, tried } = choose(doc, [c].filter(x => x.doc), { scope: new Set([A.id, B.id]), request: asked, check: linkCheck(A.id, B.id, true) });
    if (!best) return { ok: false, why_ar: `تعذّر فتح باب بين «${A.name}» و«${B.name}»: ${[...new Set(tried.flatMap(x => x.why))].slice(0, 2).join('، ') || c.err || 'لا مرشح'}` };
    return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar, subjectDoor: best.subjectDoor };
  }
  if (it.action === 'close') {
    let list = it.openingId ? (() => { const L = I.model.levels.flatMap(l => l.openings); const op = L.find(o => o.id === it.openingId); return op ? [{ op, other: op.sides[1]?.room.id || 'outside' }] : []; })() : openingsBetween(I, A.id, it.b ?? null);
    if (it.openingId && !list.length) return { ok: false, why_ar: 'الباب المقصود لم يعد في المخطط.' };
    if (!list.length) return { ok: true, already: true, doc, why_ar: `لا باب ${it.b ? `بين «${A.name}» و«${nm(it.b)}»` : `لـ«${A.name}»`} أصلًا؛ لم أغيّر شيئًا.` };
    if (list.length > 1 && !it.b) return { ok: false, ask: `لـ«${A.name}» ${list.length} أبواب: ${list.map(x => `إلى «${nm(x.other)}»`).join('، ')} — أيها تقصد؟`, why_ar: 'أكثر من باب؛ لم أغيّر شيئًا.', question: true };
    const ids = new Set(list.map(x => x.op.id)), names = list.map(x => `${KIND_AR_OP[x.op.kind] || 'باب'} ${x.op.sides.map(s => `«${s.room.name}»`).join(' و')}${x.op.sides.length < 2 ? ' إلى الخارج' : ''}`);
    const c = build(doc, d => { d.openings = d.openings.filter(o => !ids.has(o.id)); return { desc: 'door-close', how_ar: `سُدّ ${names.join('، ')} (صار جدارًا متصلًا)` }; });
    const scope = new Set(list.flatMap(x => x.op.sides.map(s => s.room.id)));
    const check = Ia => ({ ok: [...ids].every(id => !Ia.model.levels.some(l => l.openings.some(o => o.id === id))), why: 'ما زال الباب' });
    const { best, tried } = choose(doc, [c].filter(x => x.doc), { scope, request, check });
    if (!best) return { ok: false, why_ar: `لم أسدّ ${names.join('، ')}: ${[...new Set(tried.flatMap(x => x.why))].slice(0, 2).join('، ') || c.err}` };
    return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar };
  }
  if (it.action === 'move') {
    // الباب المقصود: المعرّف من الطلب السابق، أو باب الغرفة إلى حركتها (ممر/مدخل/صالة) أولًا
    const CIRC = new Set(['corridor', 'entrance', 'living']);
    let list, R = A;
    if (it.openingId) {
      const op = I.model.levels.flatMap(l => l.openings).find(o => o.id === it.openingId);
      if (!op) return { ok: false, why_ar: 'الباب المقصود لم يعد في المخطط.' };
      const side = op.sides.find(s => !CIRC.has(s.room.type)) || op.sides[0]; R = I.rooms.get(side.room.id);
      list = [{ op, other: side.other }];
    } else list = openingsBetween(I, A.id);
    if (!list.length || !R) return { ok: false, why_ar: `${A ? `«${A.name}»` : 'الغرفة'} بلا باب أنقله.` };
    list.sort((p, q) => (CIRC.has(I.rooms.get(q.other)?.type) ? 1 : 0) - (CIRC.has(I.rooms.get(p.other)?.type) ? 1 : 0));
    const cur = list[0], o0 = cur.op;
    const cands = [];
    if (it.to) {
      const T = I.rooms.get(it.to); if (!T) return { ok: false, why_ar: `«${it.toName}» غير موجودة.` };
      if (openingsBetween(I, R.id, T.id).length) return { ok: true, already: true, doc, why_ar: `باب «${R.name}» يفتح على «${T.name}» أصلًا.` };
      const seg = sharedEdges(R, T.id)[0];
      if (!seg || seg.len < 1.1) return { ok: false, why_ar: `«${R.name}» لا تشترك مع «${T.name}» في جدار يتسع لباب.` };
      cands.push(build(doc, d => { const o = d.openings.find(x => x.id === o0.id); const p = placeOnSegment(d, R.level, seg, o.kind, Math.min(o.w, seg.len - .4), (seg.s0 + seg.s1) / 2, {}, o); if (!p) fail('NO_ROOM', 'لا موضع'); return { desc: 'door-move-to', how_ar: `نُقل ${KIND_AR_OP[o0.kind] || 'الباب'} «${R.name}» من «${nm(cur.other)}» إلى الجدار المشترك مع «${T.name}»`, subjectDoor: o0.id }; }));
    } else {
      // على الجدار المشترك نفسه مع الجار نفسه: أبعد موضع ممكن عن الموضع الحالي (0.6 م على الأقل)
      const seg = sharedEdges(R, cur.other).find(e => { const p = acrossOf(o0.p, e.ax); return near(p, e.c, .05) && alongOf(o0.p, e.ax) >= e.s0 - .05 && alongOf(o0.p, e.ax) <= e.s1 + .05; });
      if (seg) {
        const pos0 = alongOf(o0.p, seg.ax), lo = seg.s0 + o0.w / 2 + .15, hi = seg.s1 - o0.w / 2 - .15;
        for (const target of [hi, lo]) if (Math.abs(target - pos0) >= .6) cands.push({ ...build(doc, d => { const o = d.openings.find(x => x.id === o0.id); const p = placeOnSegment(d, R.level, seg, o.kind, o.w, target, {}, o); if (!p) fail('NO_ROOM', 'لا موضع'); return { desc: 'door-slide', how_ar: `انتقل ${KIND_AR_OP[o0.kind] || 'الباب'} «${R.name}» إلى «${nm(cur.other)}» على الجدار نفسه ${r2(Math.abs(target - pos0))} م نحو ${seg.ax === 'x' ? (target > pos0 ? 'الشمال' : 'الجنوب') : (target > pos0 ? 'الشرق' : 'الغرب')}`, subjectDoor: o0.id }; }), penalty: it.end === 'far' ? 0 : Math.abs(Math.abs(target - pos0) - 1) * .1 });
      }
      // أو إلى جدار مشترك آخر مع الجار نفسه أو مع حركة أخرى
      for (const e of Object.values(R.sides).flat()) {
        if (e === seg || e.nb === 'outside' || e.nb === 'void' || e.len < 1.2) continue;
        const N = I.rooms.get(e.nb); if (!N || (e.nb !== cur.other && !CIRC.has(N.type))) continue;
        if (!doorOk(R, N)) continue;
        cands.push({ ...build(doc, d => { const o = d.openings.find(x => x.id === o0.id); const p = placeOnSegment(d, R.level, e, o.kind, Math.min(o.w, e.len - .4), (e.s0 + e.s1) / 2, {}, o); if (!p) fail('NO_ROOM', 'لا موضع'); return { desc: 'door-move:' + N.name, how_ar: `نُقل ${KIND_AR_OP[o0.kind] || 'الباب'} «${R.name}» إلى جدارها المشترك مع «${N.name}»`, subjectDoor: o0.id }; }), penalty: 1 });
      }
    }
    const check = Ia => { const Lx = Ia.model.levels.flatMap(l => l.openings), op = Lx.find(x => x.id === o0.id); return { ok: !!op && Math.hypot(op.p.x - o0.p.x, op.p.y - o0.p.y) >= .5 && op.sides.some(s => s.room.id === R.id), why: 'الباب لم ينتقل' }; };
    const { best, tried } = choose(doc, cands.filter(c => c.doc), { scope: new Set([R.id, cur.other, ...(it.to ? [it.to] : [])]), request, check });
    if (!best) return { ok: false, why_ar: `لم أجد موضعًا آخر لباب «${R.name}» دون كسر بوابة (${[...new Set(tried.flatMap(x => x.why))].slice(0, 2).join('، ') || 'الجدار المشترك لا يتسع لموضع آخر'}).` };
    return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar, subjectDoor: best.subjectDoor };
  }
  return { ok: false, why_ar: 'عملية باب غير معروفة' };
}
function doWindow(doc, it, req) {
  const I = inspect(doc), { request } = ctxOf(doc, req), R = I.rooms.get(it.a); if (!R) return { ok: false, why_ar: `«${it.aName}» غير موجودة.` };
  const L = I.model.levelById.get(R.level);
  const wins = L.openings.filter(op => op.window && op.sides.some(s => s.room.id === R.id && s.exterior));
  // الخارج: الهواء الطلق أو فراغ مكشوف (حوش داخلي، شرفة)
  const openNb = nb => nb === 'outside' || !!ROOM_TYPES[I.rooms.get(nb)?.type]?.open;
  const extEdges = Object.values(R.sides).flat().filter(e => openNb(e.nb) && e.len >= 1);
  const segOf = op => extEdges.find(e => near(acrossOf(op.p, e.ax), e.c, .05) && alongOf(op.p, e.ax) >= e.s0 - .05 && alongOf(op.p, e.ax) <= e.s1 + .05);
  const scope = new Set([R.id]);
  if (it.action === 'bigger' || it.action === 'smaller') {
    if (!wins.length) return { ok: false, why_ar: `«${R.name}» بلا نافذة خارجية${extEdges.length ? '؛ قل «أضف نافذة» إن أردت واحدة' : ' ولا تلامس جدارًا خارجيًا'}.` };
    // المجال الحر حول كل نافذة على مقطعها الخارجي: بعيدًا 0.3 م عن الأركان و0.1 م عن الفتحات الأخرى؛ تُكبَّر التي يتسع لها
    // جدارها أكثر (الأعرض عند التساوي)
    const room = op => { const seg = segOf(op); if (!seg) return null; const pos0 = alongOf(op.p, seg.ax); let lo = seg.s0 + .3, hi = seg.s1 - .3; for (const x of L.openings) { if (x.id === op.id || !near(acrossOf(x.p, seg.ax), seg.c, .05) || Math.abs(x.u.x) > .5 !== Math.abs(op.u.x) > .5) continue; const p = alongOf(x.p, seg.ax); if (p < seg.s0 - .05 || p > seg.s1 + .05) continue; if (p < pos0) lo = Math.max(lo, p + x.w / 2 + .1); else hi = Math.min(hi, p - x.w / 2 - .1); } return { op, seg, pos0, lo, hi, free: hi - lo }; };
    const opts = wins.map(room).filter(Boolean);
    if (!opts.length) return { ok: false, why_ar: 'نوافذ الغرفة ليست على جدار خارجي مستقيم.' };
    const wantOf = op => it.width ? it.width : it.action === 'bigger' ? Math.min(op.w * 1.5, op.w + .8) : Math.max(.6, op.w * .7);
    // «نافذة الصالة» بالمفرد = نافذتها الرئيسية (الأعرض) متى اتسع جدارها لزيادة 0.3 م على الأقل، وإلا التي يتسع لها جدارها أكثر
    const gain = o => Math.min(wantOf(o.op), o.free) - o.op.w, rank = o => gain(o) >= .3 ? 100 + o.op.w : gain(o);
    opts.sort((p, q) => it.action === 'bigger' ? rank(q) - rank(p) : q.op.w - p.op.w);
    const { op: main, seg, pos0, lo, hi } = opts[0], want = wantOf(main);
    if (it.action === 'bigger' && want <= main.w + .05) return { ok: true, already: true, doc, why_ar: `نافذة «${R.name}» ${r2(main.w)} م أصلًا.` };
    const free = hi - lo, width = r2(Math.min(want, free));
    // (الجولة الحادية عشرة) «كبّر» بلا عرض محدد: تكبير ملموس (≥ 0.3 م و≥ 15٪) أو لا شيء — كان يقبل 0.15 م ويقول «نُفّذ»
    const minGain = it.width ? .15 : Math.max(.3, main.w * .15);
    if (it.action === 'bigger' && width < main.w + minGain - 1e-6) return { ok: false, why_ar: `لا مجال لتكبير ملموس لنافذة «${R.name}»: المقطع الحر حولها ${r2(free)} م وهي ${r2(main.w)} م (أقصى زيادة ${r2(Math.max(0, free - main.w))} م).` };
    const c = build(doc, d => {
      const o = d.openings.find(x => x.id === main.id), w = wallById(d, o.wall), axw = axisOfWall(w), dir = Math.sign(alongOf(w.b, axw) - alongOf(w.a, axw)) || 1;
      const center = Math.max(lo + width / 2, Math.min(hi - width / 2, pos0));
      const host = wallAt(d, R.level, seg.ax, seg.c, center, width / 2 + .02); if (!host) fail('NO_WALL', 'لا جدار واحد يتسع للنافذة');
      const dir2 = Math.sign(alongOf(host.b, axw) - alongOf(host.a, axw)) || 1; void dir;
      o.wall = host.id; o.w = width; o.at = R3((center - alongOf(host.a, axw)) * dir2);
      return { desc: 'window-' + it.action, how_ar: `${it.action === 'bigger' ? 'كُبّرت' : 'صُغّرت'} نافذة «${R.name}» من ${r2(main.w)} إلى ${width} م (الارتفاع نفسه، على الجدار نفسه)`, measured: { before: r2(main.w), after: width } };
    });
    const check = Ia => { const op = Ia.model.levels.flatMap(l => l.openings).find(x => x.id === main.id); return { ok: !!op && (it.action === 'bigger' ? op.w > main.w + .1 : op.w < main.w - .1), why: 'العرض لم يتغير' }; };
    const { best, tried } = choose(doc, [c].filter(x => x.doc), { scope, request, check });
    if (!best) return { ok: false, why_ar: `تعذّر: ${[...new Set(tried.flatMap(x => x.why))].slice(0, 2).join('، ') || c.err}` };
    return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar, measured: c.measured };
  }
  if (it.action === 'add') {
    if (!extEdges.length) return { ok: false, why_ar: `«${R.name}» لا تلامس جدارًا خارجيًا؛ النافذة تحتاج نقلها إلى طرف المبنى.` };
    const cands = [];
    for (const e of [...extEdges].sort((p, q) => q.len - p.len)) { const width = r2(Math.min(it.width || 1.4, e.len - .8)); if (width < .6) continue; cands.push(build(doc, d => { const o = placeOnSegment(d, R.level, e, 'window', width, (e.s0 + e.s1) / 2); if (!o) fail('NO_ROOM', 'لا موضع حر'); return { desc: 'window-add', how_ar: `أُضيفت نافذة ${width} م في الجدار الخارجي لـ«${R.name}»` }; })); }
    const n0 = wins.length, check = Ia => ({ ok: Ia.model.levelById.get(R.level).openings.filter(op => op.window && op.sides.some(s => s.room.id === R.id && s.exterior)).length > n0, why: 'لم تُضف' });
    const { best, tried } = choose(doc, cands.filter(x => x.doc), { scope, request, check });
    if (!best) return { ok: false, why_ar: `لا موضع حرًا لنافذة في جدران «${R.name}» الخارجية (${[...new Set(tried.flatMap(x => x.why))].slice(0, 1).join('') || 'الجدران مشغولة بفتحات'}).` };
    return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar };
  }
  if (it.action === 'close') {
    if (!wins.length) return { ok: true, already: true, doc, why_ar: `«${R.name}» بلا نافذة أصلًا.` };
    if (wins.length > 1) return { ok: false, ask: `لـ«${R.name}» ${wins.length} نوافذ؛ أيها تقصد (مثل «النافذة الشرقية»)؟`, why_ar: 'أكثر من نافذة؛ لم أغيّر شيئًا.', question: true };
    if ((ROOM_TYPES[R.type] || {}).windowRequired && !req?.consent) return { ok: false, ask: `«${R.name}» تحتاج نافذة للإضاءة والتهوية، وهذه نافذتها الوحيدة؛ أسدّها مع ذلك؟`, why_ar: 'يحتاج موافقتك؛ لم أغيّر شيئًا.' };
    const id = wins[0].id, c = build(doc, d => { d.openings = d.openings.filter(o => o.id !== id); return { desc: 'window-close', how_ar: `سُدّت نافذة «${R.name}»` }; });
    const { best, tried } = choose(doc, [c].filter(x => x.doc), { scope, request, check: Ia => ({ ok: !Ia.model.levels.some(l => l.openings.some(o => o.id === id)), why: 'ما زالت' }) });
    if (!best) return { ok: false, why_ar: `تعذّر: ${[...new Set(tried.flatMap(x => x.why))].slice(0, 2).join('، ')}` };
    return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar };
  }
  return { ok: false, why_ar: 'عملية نافذة غير معروفة' };
}

// -------------------------------------------------- الواجهة
/** مادة الواجهة ← مادة المجسّم (dist/draw/scene3d.mjs يقرأ doc.finish.facade.base). ما لا مادة له في المجسّم يُحفظ وينتظر العرض. */
export const FACADE_RENDER = Object.freeze({ stone: 'stone', plaster: 'render' });
function doFacade(doc, it) {
  const d = clone(doc), base = it.material ? FACADE_RENDER[it.material] || null : null;
  d.finish = mergeFinish(d.finish, base ? { facade: { base } } : {});
  // (الجولة الثامنة عشرة) نطاق المادة: ما حدده العميل، وإلا الافتراضي «كل الواجهات الظاهرة والدروة» موسومًا ويُسأل عنه
  const scope = it.material ? (it.scope || 'all') : null;
  d.finish.facade = { ...(d.finish.facade || {}), ...(it.material ? { material: it.material, materialAr: it.materialAr, scope, scopeAsked: !!it.scope } : {}), ...(it.style ? { style: it.style, styleAr: it.styleAr } : {}) };
  const rendered = !!base, pending = [];
  const where = scope === 'front' ? 'على الواجهة الأمامية (المطلة على الشارع) فقط' : scope === 'all+fence' ? 'على كل الواجهات الظاهرة والدروة والسور' : 'على كل الواجهات الظاهرة والدروة (الافتراضي)';
  const ask = it.material && !it.scope ? ' — الواجهة الأمامية فقط أم كل الواجهات والدروة والسور؟ قل لي إن أردت غير الافتراضي' : '';
  if (it.material && !base) pending.push({ text: `الواجهة: ${it.materialAr}`, why: `حُفظت المادة «${it.materialAr}» في المستند، والمجسّم لا يملك خامة «${it.materialAr}» بعد فيعرض اللياسة حتى تُضاف.` });
  if (it.style) pending.push({ text: `طراز الواجهة: ${it.styleAr}`, why: `حُفظ الطراز «${it.styleAr}» في المستند؛ تفاصيل الطراز (الزخارف والفتحات) لا تُرسم في المجسّم بعد.` });
  return { ok: true, doc: d, geometryIdentical: true, rendered, pending, how_ar: `${rendered ? `صارت واجهة المجسّم ${it.materialAr} ${where}` : 'حُفظ طلب الواجهة في المستند'}، والمخطط نفسه حرفيًا (لم يتحرك جدار)${rendered ? ask : ''}` };
}

// ------------------------------------------------------------------------------------------ التراجع
/** آخر تصميم في السجل تختلف فيه الغرفة عن الحالي (أو الأول). history: [{ doc(serialized), edit }] من الأقدم. */
function revertTarget(history, curDoc, id, to) {
  if (!history.length) return null;
  if (to === 'first') return { index: 0, doc: parseDoc(history[0].doc) };
  const Rc = inspect(curDoc).rooms.get(id);
  for (let i = history.length - 1; i >= 0; i--) { const d = parseDoc(history[i].doc), R = d && inspect(d).rooms.get(id); if (!R || !Rc) continue; if (Math.abs(R.area - Rc.area) / Rc.area > .05 || Math.hypot(R.cx - Rc.cx, R.cy - Rc.cy) > .5) return { index: i, doc: d }; }
  return null;
}
function doRevertRoom(doc, it, req, history) {
  const I = inspect(doc), Rc = I.rooms.get(it.id); if (!Rc) return { ok: false, why_ar: `«${it.name}» غير موجودة.` };
  const tg = revertTarget(history, doc, it.id, it.to); if (!tg) return { ok: true, already: true, doc, why_ar: `«${Rc.name}» في موضعها ${it.to === 'first' ? 'الأول' : 'السابق'} أصلًا؛ لم أغيّر شيئًا.` };
  const T = inspect(tg.doc).rooms.get(it.id) || roomList(inspect(tg.doc)).find(r => r.name === Rc.name);
  if (!T) return { ok: false, why_ar: `«${Rc.name}» لم تكن في ذلك التصميم.` };
  if (Math.abs(T.area - Rc.area) / Rc.area <= .05 && Math.hypot(T.cx - Rc.cx, T.cy - Rc.cy) <= .5) return { ok: true, already: true, doc, why_ar: `«${Rc.name}» في موضعها ${it.to === 'first' ? 'الأول' : 'السابق'} أصلًا (مقيس)؛ لم أغيّر شيئًا.` };
  const { request } = ctxOf(doc, req);
  // (أ) غرفة الآن في موضعها القديم: تبادل
  const occ = roomList(I).find(r => r.id !== Rc.id && Math.hypot(r.cx - T.cx, r.cy - T.cy) <= .6 && Math.abs(r.area - T.area) / T.area <= .1);
  const cands = [];
  if (occ) cands.push(swapLabels(doc, Rc, occ, I));
  // (ب) في مكانها نفسه بمقاس مختلف: إعادة كل جهة إلى خطها القديم
  if (Rc.rect && T.rect && Math.hypot(T.cx - Rc.cx, T.cy - Rc.cy) < Math.min(T.net.x1 - T.net.x0, T.net.y1 - T.net.y0) / 2) {
    cands.push(build(doc, d => { let ci = I, cr = Rc; for (const s of SIDES) { const g = (T.cl[s] - cr.cl[s]) * (s.endsWith('1') ? 1 : -1); if (Math.abs(g) < .03) continue; moveSide(d, ci, cr, s, R3(g)); ci = inspect(d); cr = ci.rooms.get(Rc.id); if (!cr) fail('GONE'); } return { desc: 'restore-sides', how_ar: `أُعيدت جدران «${Rc.name}» إلى خطوطها السابقة` }; }));
  }
  const check = Ia => { const r = Ia.rooms.get(Rc.id); return { ok: !!r && Math.hypot(r.cx - T.cx, r.cy - T.cy) <= .5 && Math.abs(r.area - T.area) / T.area <= .05, why: 'لم تعد إلى موضعها' }; };
  const { best } = choose(doc, cands.filter(c => c.doc), { scope: new Set([Rc.id]), request, check });
  if (best) return { ok: true, doc: best.doc, cmp: best.cmp, how_ar: best.how_ar };
  return { ok: false, restore: { index: tg.index, keepExcept: it.id }, why_ar: `«${Rc.name}» تغيّر موضعها بإعادة توزيع سابقة؛ لا إرجاع موضعي لها وحدها.` };
}

// ------------------------------------------------------------------------------------------ التنفيذ
/**
 * ينفّذ النوايا بالترتيب على المستند. history: تصاميم الجلسة من الأقدم (آخرها المعروض) مع سجل تعديلها.
 * يعيد { status: 'local'|'clarify'|'fallback'|'restore', doc, results:[…], changed:[…], unchanged, … }.
 */
export function applyEdits(doc0, parsed, { req = null, history = [] } = {}) {
  const { intents, unhandled, questions } = parsed;
  if (questions?.length) return { status: 'clarify', questions, doc: doc0, results: [] };
  if (unhandled?.length) return { status: 'fallback', unhandled, why_ar: `لا تعديل موضعي لـ: ${unhandled.map(u => `«${u}»`).join('، ')}`, doc: doc0, results: [] };
  let doc = clone(doc0);
  const results = [], pending = [];
  req = { ...(req || {}), strict: parsed.keep ? 'all' : req?.consent ? 'none' : 'free' };
  let restore = null, fallback = null;
  // الرجوع إلى تصميم سابق (كله أو مع الإبقاء على تعديلات): يُبنى من السجل ثم تُعاد التعديلات المحلية المطلوبة
  const restoreFail = [];
  for (const it of intents.filter(i => i.op === 'restore')) {
    // النسخة برقمها في الجلسة (version)؛ السجل القديم بلا أرقام: ترتيبه + 1
    const verOf = (h, i) => h.version ?? i + 1;
    let idx = it.to === 'first' ? 0 : it.to === 'version' ? history.findIndex((h, i) => verOf(h, i) === it.version) : Math.max(0, history.length - 2);
    if (it.to === 'version' && idx < 0) { restoreFail.push({ op: 'restore', text_ar: it.text_ar, ok: false, why_ar: `النسخة ${it.version} غير محفوظة في الجلسة (المحفوظ: ${history.map((h, i) => verOf(h, i)).join('، ') || 'لا شيء'}).`, intent: it }); continue; }
    if (it.to === 'version' && idx === history.length - 1) { restoreFail.push({ op: 'restore', text_ar: it.text_ar, ok: true, already: true, why_ar: `النسخة ${it.version} هي المعروضة الآن؛ لم أغيّر شيئًا.`, intent: it }); continue; }
    restore = { index: idx, version: it.to === 'version' ? it.version : verOf(history[idx] || {}, idx), keepIds: it.keepIds || [], keepOnly: true };
  }
  if (restoreFail.length && !restore && intents.every(i => i.op === 'restore')) return restoreFail.every(r => r.ok) ? { status: 'local', doc: clone(doc0), results: restoreFail, pending: [], changed: [], unchanged: true, geometryIdentical: true } : { status: 'clarify', questions: restoreFail.map(r => ({ type: 'ambiguous-version', key: 'version|' + r.intent.version, question_ar: r.why_ar + ' أي نسخة تقصد؟' })), doc: doc0, results: restoreFail };
  const reqBase = req;
  for (const it of intents) {
    if (it.op === 'restore') continue;
    let r;
    req = { ...reqBase, ignoreRule: ignoreFor(it, doc) };
    try {
      if (it.op === 'facade') { r = doFacade(doc, it); pending.push(...r.pending); }
      else if (it.op === 'resize') r = doResize(doc, it, req);
      else if (it.op === 'delete') r = doDelete(doc, it, req);
      else if (it.op === 'add') r = doAdd(doc, it, req);
      else if (it.op === 'bedCount') {
        if (it.n > it.from) { r = { ok: true, doc }; for (let k = it.from; k < it.n; k++) { const x = doAdd(r.doc, { op: 'add', kind: 'bedroom' }, req); if (!x.ok) { r = x; break; } r = { ...x, how_ar: [r.how_ar, x.how_ar].filter(Boolean).join('، ') }; } }
        else {
          // تقليل العدد: آخر غرفة أضيفت تعديلًا محليًا تُسحب بالرجوع إلى ما قبلها (المستند السابق حرفيًا)
          const back = [...history].reverse().findIndex(h => h.edit?.intents?.some(x => (x.op === 'bedCount' && x.n > x.from) || (x.op === 'add' && x.kind === 'bedroom')));
          if (back >= 0) { const i = history.length - 1 - back; restore = { index: i - 1, keepIds: [], reason: 'bedCount' }; r = { ok: true, deferred: true, how_ar: 'سحب غرفة النوم التي أضيفت في التعديل السابق بالرجوع إلى المخطط الذي قبله' }; }
          else { const I = inspect(doc), last = roomList(I).filter(x => x.type === 'bedroom').sort((a, b) => b.name.localeCompare(a.name, 'ar', { numeric: true }))[0]; r = last ? doDelete(doc, { op: 'delete', id: last.id, name: last.name }, req) : { ok: false, why_ar: 'لا غرفة نوم ثانوية تُحذف' }; }
        }
      }
      else if (it.op === 'rule') r = doRule(doc, it, req);
      else if (it.op === 'kitchenOpen') r = doKitchenOpen(doc, it, req);
      else if (it.op === 'extDoor') r = doExtDoor(doc, it, req);
      else if (it.op === 'door') r = doDoor(doc, it, req);
      else if (it.op === 'window') r = doWindow(doc, it, req);
      else if (it.op === 'revertRoom') { r = doRevertRoom(doc, it, req, history); if (!r.ok && r.restore) restore = { index: r.restore.index, keepIds: [], dropRoom: it.id, room: it.name }; }
      else if (it.op === 'none') r = { ok: it.ok !== false, already: true, doc, why_ar: it.why_ar };
      else r = { ok: false, why_ar: 'نية غير معروفة' };
    } catch (e) { r = { ok: false, why_ar: 'خطأ داخلي في التعديل الموضعي: ' + e.message }; }
    if (r.ok && r.doc && !r.deferred) doc = r.doc;
    if (!r.ok && r.fallback) fallback = { why_ar: r.why_ar };
    results.push({ op: it.op, text_ar: it.text_ar, ok: !!r.ok, ask: r.ask || null, question: !!r.question, already: !!r.already, how_ar: r.how_ar || null, why_ar: r.why_ar || null, measured: r.measured || null, restore: !!(restore && (it.op === 'revertRoom' || it.op === 'bedCount') && !r.ok) || !!r.deferred, intent: it, removedOpenings: r.removedOpenings || [], envelope: !!r.envelope, subjectDoor: r.subjectDoor || null });
  }
  const asks = results.filter(r => !r.ok && r.ask);
  if (asks.length && !results.some(r => r.ok && !r.already)) return { status: 'clarify', questions: asks.map(r => ({ type: r.question ? 'ambiguous-opening' : 'needs-consent', key: (r.question ? 'which|' : 'consent|') + r.text_ar, question_ar: r.ask })), doc: doc0, results };
  if (restore) return { status: 'restore', restore, results, pending, doc };
  if (fallback && !results.some(x => x.ok && !x.already)) return { status: 'fallback', why_ar: fallback.why_ar, results, doc: doc0 };
  // (الجولة العشرون، توجيه المالك رابعًا) حارس التغيير الشامل: التعديل الموضعي لا يُعتمد إن أسقط شرطًا كان متحققًا في المخطط (الصالة ≥ المجلس،
  // دورة مياه العائلة، ضوء الغرف، الوصول، الخصوصية، المخالفات الإلزامية) — إلا ما يطلبه العميل نفسه (حذف غرفة من نوعها)، أو بموافقته الصريحة
  if (!R20_GUARD_OFF && results.some(r => r.ok && !r.already)) {
    const deleted = new Set(intents.filter(i => i.op === 'delete' || (i.op === 'bedCount' && i.n < i.from)).map(i => 'COUNT_' + String(i.kind || i.type || (i.op === 'bedCount' ? 'bedroom' : '')).toUpperCase()));
    const reg = regressions(invariants(doc0, req || {}), invariants(doc, req || {})).filter(x => !(intents.some(i => i.op === 'delete' || i.op === 'bedCount') && x.id.startsWith('COUNT_')) && !deleted.has(x.id));
    if (reg.length && !reqBase?.consent) return { status: 'fallback', guard: reg, why_ar: 'لم أعتمد التعديل الموضعي لأنه يُفسد شروطًا أخرى كانت متحققة في المخطط: ' + reg.map(x => x.ar).join('؛ ') + '.', results, doc: doc0 };
  }
  const cmp = compareDocs(doc0, doc, { gates: false });
  return { status: 'local', doc, results, pending, changed: describeChanges(cmp.changed), envelope: cmp.envelope, unchanged: serialize(doc) === serialize(doc0), geometryIdentical: JSON.stringify([doc.walls, doc.openings, doc.labels]) === JSON.stringify([doc0.walls, doc0.openings, doc0.labels]) };
}

/**
 * هل تحقق ما طلبته النوايا في مستند آخر (مثل ناتج إعادة التوليد)؟ المطابقة بالاسم لأن المعرّفات تتغير.
 * يعيد [{ text_ar, ok, why_ar }].
 */
export function measureIntents(before, after, intents, { entry = 's' } = {}) {
  const B = roomList(inspect(before)), A = roomList(inspect(after)), byName = (L, n) => L.find(r => r.name === n);
  return intents.map(it => {
    const res = (ok, why) => ({ text_ar: it.text_ar, ok: !!ok, why_ar: why });
    try {
      if (it.op === 'resize') {
        const b = byName(B, it.name), a = byName(A, it.name); if (!a || !b) return res(false, 'الغرفة غير موجودة بعد التعديل');
        if (it.target) { const D = netDims(a), tol = it.tol ?? .35; return res(Math.abs(D.w - it.target.w) <= tol && Math.abs(D.l - it.target.l) <= tol, `المقاس ${r2(D.w)}×${r2(D.l)} م`); }
        const k = a.area / b.area, want = it.factor ?? (it.area ? it.area / b.area : it.amount > 0 ? 1.05 : .95);
        return res(want > 1 ? k >= 1 + (want - 1) * .9 : k <= 1 - (1 - want) * .9, `المساحة ${r2(b.area)} ← ${r2(a.area)} م² (×${r2(k)})`);
      }
      if (it.op === 'delete') return res(!byName(A, it.name), byName(A, it.name) ? 'ما زالت موجودة' : '');
      if (it.op === 'add') return res(A.some(r => r.name === NAME_OF_KIND[it.kind] || (it.kind === 'bedroom' && r.type === 'bedroom' && !byName(B, r.name))), '');
      if (it.op === 'bedCount') return res(A.filter(r => r.type === 'bedroom' || r.type === 'master').length === it.n, '');
      if (it.op === 'rule') { const v = verifyRules(after, [{ ...it.rule, id: 'M' }], { entry })[0]; return res(v.ok, v.why); }
      if (it.op === 'kitchenOpen') { const K = A.find(r => r.type === 'kitchen'), T = A.find(r => it.to === 'hall' ? r.type === 'living' : r.type === 'dining'); const ls = K && T ? K.links.filter(l => l.to === T.id) : []; return res(ls.length && ls.every(l => (l.kind === 'arch') === it.open), ''); }
      if (it.op === 'extDoor') { const I = inspect(after), R = roomList(I).find(r => r.name === it.name); const L = R && I.model.levelById.get(R.level); return res(!!L && L.openings.some(op => op.door && op.sides.some(x => x.room.id === R.id && x.other === 'outside')), ''); }
      if (it.op === 'none' || it.op === 'facade') return res(true, '');
      if (it.op === 'door' && it.action === 'add') { const Ia = inspect(after), a = roomList(Ia).find(r => r.name === it.aName), b = roomList(Ia).find(r => r.name === it.bName); return res(!!a && !!b && openingsBetween(Ia, a.id, b.id).length > 0, ''); }
    } catch (e) { return res(false, e.message); }
    return res(false, 'غير مقيس');
  });
}

/** إعادة تطبيق نوايا محلية مسجلة على مستند (للتراجع مع الإبقاء على تعديلات لاحقة). */
export function replayIntents(doc, intents, { req = null } = {}) {
  const ok = [], lost = [];
  let cur = doc;
  for (const it0 of intents) {
    if (!['facade', 'resize', 'delete', 'add', 'kitchenOpen', 'extDoor', 'rule', 'bedCount', 'door', 'window'].includes(it0.op)) continue;
    // المعرّف من مستند آخر: تُحل الغرفة باسمها في هذا المستند
    let it = it0;
    if (it0.id && it0.name) { const I = inspect(cur), r = I.rooms.get(it0.id); if (!r || r.name !== it0.name) { const m = roomList(I).find(x => x.name === it0.name); if (!m) { lost.push({ text: it0.text_ar, why: `«${it0.name}» غير موجودة` }); continue; } it = { ...it0, id: m.id }; } }
    for (const [k, kn] of [['a', 'aName'], ['b', 'bName'], ['to', 'toName']]) if (it[k] && it[kn]) { const I = inspect(cur), r = I.rooms.get(it[k]); if (!r || r.name !== it[kn]) { const m = roomList(I).find(x => x.name === it[kn]); if (m) it = { ...it, [k]: m.id }; } }
    const res = applyEdits(cur, { intents: [it], unhandled: [], questions: [] }, { req });
    const r = res.results[0];
    if (res.status === 'local' && r?.ok) { cur = res.doc; ok.push(it.text_ar); } else lost.push({ text: it.text_ar, why: r?.why_ar || res.why_ar || '' });
  }
  return { doc: cur, ok, lost };
}

export default { PLAN_EDIT_VERSION, KEEP, inspect, compareDocs, describeChanges, roomRefs, parseEdit, applyEdits, replayIntents, measureIntents, FACADE_RENDER };
/** للاختبار والتشخيص فقط. */
export const __test = { tryMove: (doc, id, s, g) => { const I = inspect(doc), R = I.rooms.get(id); return build(doc, d => { moveSide(d, I, R, s, g); }); }, sideGeom, moveSpan };
