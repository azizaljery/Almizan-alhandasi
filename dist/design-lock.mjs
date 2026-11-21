// قفل الأجزاء المعتمدة: بعد أن يعتمد العميل غرفة (المجلس، المطبخ…) تُؤخذ لها «لقطة هندسية» من المستند نفسه:
// المضلع الصافي، الجدران المحيطة بسماكاتها، الأبواب والنوافذ (موضعًا وعرضًا ونوعًا واتجاه فتح)، القطع الثابتة، السلالم، وعلاقاتها (ما يفتح عليه كل باب وما يجاورها).
// وبعد أي تعديل (أي محرك، أي أداة) يُقارَن المستند الناتج باللقطة حرفيًا (سماح LOCK_TOL) فيخرج: محفوظ، أو مخالفات محددة بالأرقام.
// وحدة نقية بلا DOM ولا شبكة؛ لا تعتمد على أرقام الجدران والفتحات (تتغير بإعادة التوليد) بل على الإحداثيات والأنواع والأسماء.
import { analyzeDoc } from './draw/digest.mjs';
import { isDoorKind } from './draw/catalog.mjs';

export const LOCK_VERSION = 'design-lock/1';
/** سماح المطابقة الحرفية (م): نصف سنتمتر، أي أدنى من تدوير الإحداثيات في المستند (0.001 م) بخمسة أضعاف. */
export const LOCK_TOL = 0.005;
const r3 = v => Math.round(v * 1000) / 1000;
const near = (a, b, t = LOCK_TOL) => Math.abs(a - b) <= t;
const pnear = (a, b, t = LOCK_TOL) => near(a.x, b.x, t) && near(a.y, b.y, t);
const num = v => new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 }).format(v);

// ------------------------------------------------------------------------------------------ مضلعات وجدران
/** يحذف الرؤوس الواقعة على استقامة واحدة (تقسيم الأضلاع عند التقاطعات ليس تغييرًا). */
function simplify(poly) {
  let p = poly.map(q => ({ x: r3(q.x), y: r3(q.y) }));
  for (let changed = true; changed && p.length > 3;) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if (Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) < 1e-6) { p.splice(i, 1); changed = true; break; }
    }
  }
  return p;
}
const canon = poly => { // يبدأ من أدنى (x,y) فتتطابق المضلعات المتساوية مهما اختلف رأس البدء
  let k = 0; for (let i = 1; i < poly.length; i++) if (poly[i].x < poly[k].x - 1e-9 || (near(poly[i].x, poly[k].x, 1e-9) && poly[i].y < poly[k].y)) k = i;
  return [...poly.slice(k), ...poly.slice(0, k)];
};
const bbox = poly => { const xs = poly.map(p => p.x), ys = poly.map(p => p.y); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
const samePoly = (a, b) => a.length === b.length && a.every((p, i) => pnear(p, b[i]));

/** أضلاع الغرفة بعد دمج المتتالي المستقيم ذي السماكة نفسها: [{a,b,t,exterior}]. */
function roomWalls(room) {
  const E = room.edges.map(e => ({ a: { x: r3(e.a.x), y: r3(e.a.y) }, b: { x: r3(e.b.x), y: r3(e.b.y) }, t: r3(e.t), exterior: !!e.exterior }));
  const out = [];
  for (const e of E) {
    const last = out[out.length - 1];
    if (last && near(last.t, e.t, 1e-6) && last.exterior === e.exterior && pnear(last.b, e.a, 1e-6) && Math.abs((last.b.x - last.a.x) * (e.b.y - e.a.y) - (last.b.y - last.a.y) * (e.b.x - e.a.x)) < 1e-6) last.b = e.b;
    else out.push({ ...e });
  }
  if (out.length > 1) { const f = out[0], l = out[out.length - 1]; if (near(f.t, l.t, 1e-6) && f.exterior === l.exterior && pnear(l.b, f.a, 1e-6) && Math.abs((l.b.x - l.a.x) * (f.b.y - f.a.y) - (l.b.y - l.a.y) * (f.b.x - f.a.x)) < 1e-6) { l.b = f.b; out.shift(); } }
  const key = w => { const [p, q] = w.a.x < w.b.x - 1e-9 || (near(w.a.x, w.b.x, 1e-9) && w.a.y <= w.b.y) ? [w.a, w.b] : [w.b, w.a]; return { a: p, b: q, t: w.t, exterior: w.exterior }; };
  return out.map(key).sort((p, q) => p.a.x - q.a.x || p.a.y - q.a.y || p.b.x - q.b.x || p.b.y - q.b.y);
}

// ------------------------------------------------------------------------------------------ اللقطة
const dirOf = o => ({ x: r3(o.u.x), y: r3(o.u.y) });
function sideOf(op, room) { // الجهة المقابلة للباب: نوع الغرفة التي يفتح عليها أو «outside»
  const mine = op.sides.find(s => s.room.id === room.id); if (!mine) return null;
  const other = op.sides.find(s => s.room.id !== room.id);
  return other ? { name: other.room.name, type: other.room.type } : { name: 'الخارج', type: 'outside' };
}
/** كل الفتحات المتصلة بغرفة (أبوابًا ونوافذ) بإحداثيات عالمية: لا تتغير بتغيّر أرقام الجدران. */
function roomOpenings(lv, room) {
  const out = [];
  for (const op of lv.openings) {
    if (!op.sides.some(s => s.room.id === room.id)) continue;
    const o = op.o;
    out.push({ kind: o.kind, door: !!op.door, p: { x: r3(op.p.x), y: r3(op.p.y) }, dir: dirOf(op), w: r3(o.w), h: r3(o.h ?? 0), sill: r3(o.sill ?? 0), swing: o.swing ?? null, hinge: o.hinge ?? null, entry: !!o.entry, to: sideOf(op, room) });
  }
  return out.sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y || a.kind.localeCompare(b.kind));
}
function inPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < (poly[j].x - poly[i].x) * (p.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
  return c;
}
const fixtureOut = f => ({ kind: f.kind, x: r3(f.x), y: r3(f.y), rot: r3(f.rot || 0), w: r3(f.w ?? 0), d: r3(f.d ?? 0), color: f.color ?? null });
const stairOut = s => ({ kind: s.kind, x: r3(s.x), y: r3(s.y), rot: r3(s.rot || 0), w: r3(s.w ?? 0), run: r3(s.run ?? 0), flip: !!s.flip, steps: s.steps ?? null });
function neighbourTypes(lv, room) {
  const set = new Set();
  for (const e of room.edges) {
    if (e.exterior || !e.space) continue;
    const n = lv.rooms.find(r => r.spaceId === e.space); if (n && !n.unlabelled && Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) >= 0.5) set.add(n.type);
  }
  return [...set].sort();
}

/** كل الغرف المسمّاة القابلة للقفل في المستند: [{key, levelIndex, id, name, type, area, rect}]. */
export function lockableParts(doc) {
  const m = analyzeDoc(doc), out = [];
  for (const lv of m.levels) for (const r of lv.rooms) {
    if (r.unlabelled || !r.net) continue;
    const bb = bbox(simplify(r.net));
    out.push({ key: `${lv.levelIndex}:${r.id}`, levelIndex: lv.levelIndex, levelId: lv.level.id, id: r.id, name: r.name, type: r.type, area: r3(r.area), rect: { x0: r3(bb.x0), y0: r3(bb.y0), x1: r3(bb.x1), y1: r3(bb.y1) } });
  }
  return out;
}

/** لقطة هندسية لغرفة بمعرّف وسمها (label id) في المستند. ترمي إن لم توجد. */
export function snapshotPart(doc, labelId, { note = '' } = {}) {
  const m = analyzeDoc(doc);
  for (const lv of m.levels) {
    const room = lv.rooms.find(r => r.id === labelId && !r.unlabelled && r.net);
    if (!room) continue;
    const net = canon(simplify(room.net));
    const fixtures = (doc.fixtures || []).filter(f => f.level === lv.level.id && inPoly({ x: f.x, y: f.y }, room.net)).map(fixtureOut).sort((a, b) => a.x - b.x || a.y - b.y || a.kind.localeCompare(b.kind));
    const stairs = (doc.stairs || []).filter(s => s.level === lv.level.id && inPoly({ x: s.x, y: s.y }, room.net)).map(stairOut);
    return {
      v: LOCK_VERSION, key: `${lv.levelIndex}:${room.id}`, labelId: room.id, levelIndex: lv.levelIndex, levelId: lv.level.id, name: room.name, type: room.type,
      net, area: r3(room.area), walls: roomWalls(room), openings: roomOpenings(lv, room), fixtures, stairs, neighbours: neighbourTypes(lv, room), note: String(note || '').slice(0, 200),
    };
  }
  throw Object.assign(new Error('الغرفة المطلوب قفلها غير موجودة في المستند.'), { code: 'LOCK_PART_MISSING' });
}

/** يبني قائمة أقفال من معرّفات تسميات؛ تكرار المعرّف يُهمل. */
export function createLocks(doc, labelIds, opts = {}) {
  const seen = new Set(), locks = [];
  for (const id of labelIds) { if (seen.has(id)) continue; seen.add(id); locks.push(snapshotPart(doc, id, opts)); }
  return locks;
}
/** يقفل بالاسم/النوع: كل الغرف التي تطابق الشرط (مثل type==='majlis'). */
export function lockWhere(doc, predicate, opts = {}) {
  return createLocks(doc, lockableParts(doc).filter(predicate).map(p => p.id), opts);
}

// ------------------------------------------------------------------------------------------ التحقق
const VIOL = Object.freeze({
  missing: 'حُذفت الغرفة أو لم يعد لها موضعها', moved: 'تحركت', resized: 'تغيّر مقاسها', reshaped: 'تغيّر شكلها',
  renamed: 'تغيّر اسمها أو نوعها', wall: 'تغيّر جدارها', door_removed: 'حُذف باب', door_moved: 'تحرك باب', door_added: 'أُضيف باب', door_changed: 'تغيّر باب',
  window_removed: 'حُذفت نافذة', window_moved: 'تحركت نافذة', window_added: 'أُضيفت نافذة', window_changed: 'تغيّرت نافذة',
  relation: 'تغيّرت علاقتها', fixture: 'تغيّرت قطعة ثابتة فيها', stair: 'تغيّر السلم فيها',
});
export const LOCK_VIOLATION_LABELS = VIOL;
const v = (kind, detail, before = null, after = null) => ({ kind, label: VIOL[kind], detail, before, after });
const fmtP = p => `(${num(p.x)}، ${num(p.y)})`;
const rectText = bb => `${num(bb.x1 - bb.x0)}×${num(bb.y1 - bb.y0)} م عند (${num(bb.x0)}، ${num(bb.y0)})`;
const openName = o => (o.door ? (o.kind === 'arch' ? 'فتحة' : 'باب') : 'نافذة') + ` ${num(o.w)} م عند ${fmtP(o.p)}`;

function findRoom(model, snap) {
  const lv = model.levels[snap.levelIndex]; if (!lv) return { lv: null, exact: null, byName: null };
  let exact = null, byName = null, overlap = null, ovArea = 0;
  for (const r of lv.rooms) {
    if (r.unlabelled || !r.net) continue;
    const net = canon(simplify(r.net));
    if (samePoly(net, snap.net)) exact = r;
    if (r.name === snap.name && r.type === snap.type && (!byName || Math.abs(r.area - snap.area) < Math.abs(byName.area - snap.area))) byName = r;
  }
  if (!exact && !byName) { // غرفة تتراكب مع موضعها القديم (أغلب المساحة)
    const bb0 = bbox(snap.net);
    for (const r of lv.rooms) { if (r.unlabelled || !r.net) continue; const b = bbox(r.net), w = Math.min(b.x1, bb0.x1) - Math.max(b.x0, bb0.x0), h = Math.min(b.y1, bb0.y1) - Math.max(b.y0, bb0.y0); if (w > 0 && h > 0 && w * h > ovArea) { ovArea = w * h; overlap = r; } }
  }
  return { lv, exact, byName, overlap: ovArea > 0.5 * snap.area ? overlap : null };
}

/**
 * يقارن مستندًا بلقطة قفل. يعيد { key, name, status: 'kept'|'violated', violations:[{kind,label,detail,before,after}] }.
 * «kept» تعني: المضلع الصافي نفسه، الجدران المحيطة نفسها بسماكاتها، الفتحات نفسها (موضعًا ونوعًا وعرضًا واتجاهًا)، القطع نفسها، العلاقات نفسها.
 */
export function verifyLock(doc, snap, model = analyzeDoc(doc)) {
  const base = { key: snap.key, labelId: snap.labelId, name: snap.name, type: snap.type, levelIndex: snap.levelIndex };
  const { lv, exact, byName, overlap } = findRoom(model, snap);
  if (!lv) return { ...base, status: 'violated', violations: [v('missing', `الدور رقم ${snap.levelIndex + 1} لم يعد موجودًا.`)] };
  if (!exact) {
    const cand = byName || overlap, bb0 = bbox(snap.net);
    if (!cand) return { ...base, status: 'violated', violations: [v('missing', `«${snap.name}» (${rectText(bb0)}) لم تعد موجودة في موضعها ولا بالاسم نفسه.`, rectText(bb0), null)] };
    const bb1 = bbox(simplify(cand.net)), w0 = bb0.x1 - bb0.x0, h0 = bb0.y1 - bb0.y0, w1 = bb1.x1 - bb1.x0, h1 = bb1.y1 - bb1.y0;
    const sameSize = near(w0, w1) && near(h0, h1), sameSizeRot = near(w0, h1) && near(h0, w1);
    const kind = sameSize ? 'moved' : sameSizeRot ? 'moved' : 'resized';
    const dx = r3((bb1.x0 + bb1.x1) / 2 - (bb0.x0 + bb0.x1) / 2), dy = r3((bb1.y0 + bb1.y1) / 2 - (bb0.y0 + bb0.y1) / 2);
    const detail = kind === 'moved' ? `«${snap.name}» انتقلت ${num(Math.hypot(dx, dy))} م (من ${rectText(bb0)} إلى ${rectText(bb1)}).` : `«${snap.name}» تغيّر مقاسها من ${num(w0)}×${num(h0)} م إلى ${num(w1)}×${num(h1)} م (${num(snap.area)} ← ${num(cand.area)} م²).`;
    return { ...base, status: 'violated', violations: [v(kind, detail, rectText(bb0), rectText(bb1))] };
  }
  const violations = [];
  if (exact.name !== snap.name || exact.type !== snap.type) violations.push(v('renamed', `«${snap.name}» (${snap.type}) صارت «${exact.name}» (${exact.type}).`, snap.name, exact.name));
  // الجدران
  const now = roomWalls(exact), used = new Set();
  for (const w of snap.walls) {
    const i = now.findIndex((x, k) => !used.has(k) && pnear(x.a, w.a) && pnear(x.b, w.b) && near(x.t, w.t, 0.002) && x.exterior === w.exterior);
    if (i < 0) { const alt = now.find((x, k) => !used.has(k) && pnear(x.a, w.a) && pnear(x.b, w.b)); violations.push(v('wall', alt ? `سماكة جدار (${fmtP(w.a)}→${fmtP(w.b)}) من ${num(w.t)} إلى ${num(alt.t)} م.` : `جدار (${fmtP(w.a)}→${fmtP(w.b)}) لم يعد كما كان.`, w, alt || null)); } else used.add(i);
  }
  for (let k = 0; k < now.length; k++) if (!used.has(k)) violations.push(v('wall', `جدار جديد أو مختلف (${fmtP(now[k].a)}→${fmtP(now[k].b)}) على حدود «${snap.name}».`, null, now[k]));
  // الفتحات
  const ops = roomOpenings(lv, exact), usedO = new Set();
  const closeO = (a, b) => a.kind === b.kind && pnear(a.p, b.p) && near(a.w, b.w) && near(a.h, b.h, 0.01) && near(a.sill, b.sill, 0.01) && a.swing === b.swing && a.hinge === b.hinge && a.entry === b.entry;
  for (const o of snap.openings) {
    const i = ops.findIndex((x, k) => !usedO.has(k) && closeO(x, o));
    const nm = o.door ? 'door' : 'window';
    if (i >= 0) {
      usedO.add(i);
      if (o.to && ops[i].to && (o.to.type !== ops[i].to.type)) violations.push(v('relation', `${openName(o)} كان يفتح على «${o.to.name}» (${o.to.type}) وصار يفتح على «${ops[i].to.name}» (${ops[i].to.type}).`, o.to, ops[i].to));
      continue;
    }
    const mv = ops.findIndex((x, k) => !usedO.has(k) && x.door === o.door && pnear(x.p, o.p, 0.4));
    if (mv >= 0) { usedO.add(mv); const same = near(ops[mv].w, o.w) && ops[mv].kind === o.kind; violations.push(v(same ? `${nm}_moved` : `${nm}_changed`, `${openName(o)} ${same ? 'تحرك إلى' : 'تغيّر إلى'} ${openName(ops[mv])}.`, o, ops[mv])); }
    else violations.push(v(`${nm}_removed`, `${openName(o)} حُذف.`, o, null));
  }
  ops.forEach((x, k) => { if (!usedO.has(k)) violations.push(v(`${x.door ? 'door' : 'window'}_added`, `${openName(x)} أُضيف.`, null, x)); });
  // القطع والسلالم
  const fx = (doc.fixtures || []).filter(f => f.level === lv.level.id && inPoly({ x: f.x, y: f.y }, exact.net)).map(fixtureOut);
  const fkey = f => `${f.kind}|${f.x}|${f.y}|${f.rot}|${f.w}|${f.d}`;
  const fa = new Map(); for (const f of snap.fixtures) fa.set(fkey(f), (fa.get(fkey(f)) || 0) + 1);
  for (const f of fx) fa.set(fkey(f), (fa.get(fkey(f)) || 0) - 1);
  const fdiff = [...fa].filter(([, n]) => n !== 0);
  if (fdiff.length) violations.push(v('fixture', `تغيّرت القطع الثابتة داخل «${snap.name}» (${fdiff.length} فرق).`, snap.fixtures.length, fx.length));
  const st = (doc.stairs || []).filter(s => s.level === lv.level.id && inPoly({ x: s.x, y: s.y }, exact.net)).map(stairOut);
  if (JSON.stringify(st) !== JSON.stringify(snap.stairs)) violations.push(v('stair', `تغيّر السلم داخل «${snap.name}».`, snap.stairs.length, st.length));
  // العلاقات (الجوار بالنوع)
  const nb = neighbourTypes(lv, exact);
  if (JSON.stringify(nb) !== JSON.stringify(snap.neighbours)) violations.push(v('relation', `تغيّر ما يجاور «${snap.name}»: كان [${snap.neighbours.join('، ')}] وصار [${nb.join('، ')}].`, snap.neighbours, nb));
  return { ...base, status: violations.length ? 'violated' : 'kept', violations };
}

/** يتحقق من مجموعة أقفال: { ok, kept:[…], violated:[…], results }. */
export function verifyLocks(doc, locks = []) {
  const model = analyzeDoc(doc), results = locks.map(l => verifyLock(doc, l, model));
  return { ok: results.every(r => r.status === 'kept'), kept: results.filter(r => r.status === 'kept'), violated: results.filter(r => r.status === 'violated'), results, checked: results.length, tolerance: LOCK_TOL };
}

/** مجموعة معرّفات الجدران/الفتحات/القطع التي لا يجوز للمحرر الجراحي لمسها (تُحسب من المستند الحالي وأقفاله). */
export function protectedIds(doc, locks = []) {
  const model = analyzeDoc(doc), walls = new Set(), openings = new Set(), fixtures = new Set(), stairs = new Set(), rooms = new Set();
  for (const snap of locks) {
    const { exact } = findRoom(model, snap); if (!exact) continue;
    const lv = model.levels[snap.levelIndex]; rooms.add(exact.id);
    for (const e of exact.edges) for (const id of e.wallIds || []) walls.add(id);
    for (const op of lv.openings) if (op.sides.some(s => s.room.id === exact.id)) openings.add(op.id);
    for (const f of doc.fixtures || []) if (f.level === lv.level.id && inPoly({ x: f.x, y: f.y }, exact.net)) fixtures.add(f.id);
    for (const s of doc.stairs || []) if (s.level === lv.level.id && inPoly({ x: s.x, y: s.y }, exact.net)) stairs.add(s.id);
  }
  return { walls, openings, fixtures, stairs, rooms };
}

/** جملة عربية تصف نتيجة التحقق. */
export function describeLockResult(res) {
  if (!res.checked) return 'لا أجزاء مقفلة.';
  if (res.ok) return `الأجزاء المقفلة (${res.checked}) بقيت حرفيًا: الموضع والمقاس والجدران والأبواب والنوافذ والعلاقات (سماح ${num(LOCK_TOL * 1000)} مم).`;
  return `${res.violated.length} من ${res.checked} أجزاء مقفلة تغيّرت: ` + res.violated.map(r => `«${r.name}»: ${r.violations.map(x => x.label).join('، ')}`).join(' ؛ ');
}

export default { LOCK_VERSION, LOCK_TOL, lockableParts, snapshotPart, createLocks, lockWhere, verifyLock, verifyLocks, protectedIds, describeLockResult, LOCK_VIOLATION_LABELS };
