// مولّد بدائل بالتحسين: بحث محلي على مستند mizan-draw/1 يبحث عن بديل يرفع مجموع «مؤشر الخصوصية» و«المنطقة المناخية»
// دون كسر القيود (المساحات، كل فراغ يُوصل إليه عبر الأبواب، لا تداخل فتحات، لا تسميات يتيمة).
//  - العمليات: تبديل فراغين متقاربي المساحة (تبديل التسميتين عبر applyCommand update)، تبديل جهة باب المدخل
//    (delete + add-opening + set-plot)، وانعكاس المسقط (تحويل محسوب على نسخة لأن doc.mjs بلا أمر انعكاس).
//  - بعد كل عملية يُتحقق من المستند (parseDoc/validateDoc/analyzeDoc) ويُرفض البديل عند أي كسر.
//  - يعيد أفضل 3 بدائل مع ما تغيّر ولماذا بالأرقام. كل عتبة أدناه تقديرية غير معايرة (THRESHOLDS). نقي: لا DOM.
import { applyCommand, parseDoc, serialize, validateDoc, DrawError } from '../draw/doc.mjs';
import { analyzeDoc } from '../draw/digest.mjs';
import { ROOM_TYPES } from '../draw/catalog.mjs';
import { privacyIndex } from './privacy-index.mjs';
import { climateZoning } from './climate-zoning.mjs';
import { sub, norm, dot, dist, pt } from '../draw/geom.mjs';

export const OPTIMIZER_VERSION = 'variant-optimizer/1';
/** عتبات تقديرية غير معايرة. */
export const THRESHOLDS = Object.freeze({
  areaTolerance: 0.25,   // |a-b|/max(a,b) لتبديل فراغين «متماثلي المساحة»
  maxSwapPairs: 24,      // سقف أزواج التبديل المرشحة في كل خطوة
  beam: 2,               // عدد أفضل البدائل التي تتفرع منها الخطوة الثانية
  depth: 2,              // عمق البحث (عمليات متتالية)
  maxEvals: 70,          // سقف تقييمات البدائل في الاستدعاء الواحد
  minGain: 0.5,          // أقل تحسّن (نقاط من 200) يُعدّ به البديل «أفضل»
  entryMinWall: 0.4,     // م: فراغ على جانبي باب المدخل المنقول
});
const FIXED = new Set(['corridor', 'entrance', 'stairs', 'courtyard', 'balcony', 'other']);
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ التقييم والتحقق
/** يقيّم مستندًا: درجتا الخصوصية والمناخ ومجموعهما (0-200). */
export function evaluateDoc(doc) {
  const model = analyzeDoc(doc);
  const privacy = privacyIndex(doc, { model }), climate = climateZoning(doc, { model });
  return { privacy, climate, total: r2((privacy.score ?? 0) + (climate.score ?? 0)), model };
}
/** بصمة المساحات بالاسم من نموذج التحليل (للتحقق من قيد المساحات). */
const areasByName = model => { const m = new Map(); for (const lv of model.levels) for (const r of lv.rooms) if (!r.unlabelled) m.set(lv.level.id + '/' + r.name, r.area); return m; };

/** مشكلات مستند بذاته (بلا مقارنة): فتحات متداخلة، ثغرات، تسميات يتيمة، فراغ لا يُوصل إليه، حدود الكتالوج. */
export function docProblems(doc, model) {
  const problems = [];
  for (const i of validateDoc(doc)) if (i.code === 'OPENING_OVERLAP' || i.code === 'OPENING_OUTSIDE' || i.severity === 'error') problems.push(i.message);
  for (const lv of model.levels) {
    if (lv.analysis.gaps.length) problems.push(`ثغرات جدران في ${lv.level.name}.`);
    for (const l of lv.orphanLabels) problems.push(`التسمية «${l.name}» خارج أي غرفة في ${lv.level.name}.`);
    if (lv.duplicates.length) problems.push(`غرف بأكثر من تسمية في ${lv.level.name}.`);
    if (lv.seedKind) for (const r of lv.rooms) if (!lv.reach.has(r.id)) problems.push(`«${r.name}» لا يُوصل إليها عبر الأبواب.`);
    for (const r of lv.rooms) {
      const def = ROOM_TYPES[r.type]; if (!def || r.unlabelled) continue;
      if (def.minArea && r.area < def.minArea - 1e-6) problems.push(`«${r.name}» (${def.ar}) أصغر من حد الكتالوج ${def.minArea} م².`);
      if (def.windowRequired && !lv.openings.some(op => op.window && op.sides.some(s => s.room.id === r.id && s.exterior))) problems.push(`«${r.name}» (${def.ar}) بلا نافذة خارجية.`);
    }
  }
  return problems;
}

/** يتحقق من بديل مقابل الأصل: لا مشكلة جديدة لم تكن في الأصل، وعدد الفراغات ومساحاتها بالاسم ضمن السماح. */
export function verifyVariant(baseModel, doc, { areaTolerance = THRESHOLDS.areaTolerance, baseProblems = null } = {}) {
  try { parseDoc(serialize(doc)); } catch (e) { return { ok: false, problems: ['مستند غير صالح: ' + e.message] }; }
  let model; try { model = analyzeDoc(doc); } catch (e) { return { ok: false, problems: ['تعذّر تحليل البديل: ' + e.message] }; }
  const known = new Set(baseProblems || docProblems(baseModel.doc, baseModel));
  const problems = docProblems(doc, model).filter(p => !known.has(p));
  const before = areasByName(baseModel), after = areasByName(model);
  if (before.size !== after.size) problems.push(`تغيّر عدد الفراغات المسمّاة (${before.size} → ${after.size}).`);
  for (const [k, a] of before) {
    const b = after.get(k);
    if (b === undefined) { problems.push(`الفراغ «${k.split('/')[1]}» لم يعد موجودًا.`); continue; }
    if (Math.abs(a - b) / Math.max(a, b, 1e-9) > areaTolerance + 1e-9) problems.push(`مساحة «${k.split('/')[1]}» تغيّرت من ${r1(a)} إلى ${r1(b)} م² (فوق السماح ${Math.round(areaTolerance * 100)}٪).`);
  }
  return { ok: !problems.length, problems, model };
}

// ------------------------------------------------------------------ العمليات
const apply = (doc, cmd) => { try { return applyCommand(doc, cmd).doc; } catch (e) { if (e instanceof DrawError) return null; throw e; } };
const wet = t => !!ROOM_TYPES[t]?.wet;

/** مرشحو تبديل الفراغات: أزواج متقاربة المساحة، من النوع نفسه من حيث الرطوبة، وغير ثابتة. */
function swapCandidates(model) {
  const out = [];
  for (const lv of model.levels) {
    // الفراغ الذي يحمل باب المدخل ثابت: تبديله يغيّر معنى المدخل لا التوزيع
    const entryRooms = new Set(lv.openings.filter(op => op.door && op.o.entry).flatMap(op => [op.left?.id, op.right?.id]).filter(Boolean));
    const rooms = lv.rooms.filter(r => !r.unlabelled && !FIXED.has(r.type) && r.label && !entryRooms.has(r.id));
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      if (a.type === b.type && a.name === b.name) continue;
      if (wet(a.type) !== wet(b.type)) continue;
      const diff = Math.abs(a.area - b.area) / Math.max(a.area, b.area);
      if (diff > THRESHOLDS.areaTolerance) continue;
      out.push({ a, b, diff });
    }
  }
  return out.sort((p, q) => p.diff - q.diff).slice(0, THRESHOLDS.maxSwapPairs);
}
function opSwap(doc, { a, b }) {
  let d = apply(doc, { type: 'update', id: a.label.id, patch: { name: b.name, type: b.type } });
  if (d) d = apply(d, { type: 'update', id: b.label.id, patch: { name: a.name, type: a.type } });
  return d && { doc: d, op: { kind: 'swap', text: `تبديل «${a.name}» (${r1(a.area)} م²) مع «${b.name}» (${r1(b.area)} م²)؛ الأثاث يحتاج إعادة توزيع.` } };
}

const CARDINAL = { n: 'n', s: 's', e: 'e', w: 'w' };
/** مرشحو تبديل جهة المدخل: باب المدخل الرئيسي في الأرضي إلى جدار خارجي آخر للفراغ نفسه على جهة شارع. */
function entryCandidates(doc, model) {
  const lv = model.levels[0]; if (!lv) return [];
  const entries = lv.openings.filter(op => op.door && op.o.entry && ((op.left && !op.right) || (!op.left && op.right)));
  const out = [];
  for (const op of entries) {
    const room = op.left || op.right;
    for (const e of room.edges) {
      if (!e.exterior || !CARDINAL[e.side] || e.wallIds.includes(op.wall.id)) continue;
      if (Array.isArray(doc.streets) && doc.streets.length && !doc.streets.includes(e.side)) continue;
      if (e.length < op.w + 2 * THRESHOLDS.entryMinWall) continue;
      out.push({ op, room, edge: e, side: e.side });
    }
  }
  return out;
}
function opEntry(doc, { op, room, edge, side }) {
  const wall = doc.walls.find(w => w.id === edge.wallIds[0]); if (!wall) return null;
  const mid = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
  const at = Math.round(dot(sub(mid, wall.a), norm(sub(wall.b, wall.a))) * 1000) / 1000;
  let d = apply(doc, { type: 'delete', ids: [op.id] });
  if (d) d = apply(d, { type: 'add-opening', wall: wall.id, kind: op.kind, at, w: op.w, h: op.h, entry: true, swing: op.o.swing || undefined, hinge: op.o.hinge });
  if (d) {
    const oldSide = op.sides.find(s => s.exterior)?.compass;
    const entries = Array.isArray(doc.entries) && doc.entries.length ? [...new Set(doc.entries.map(s => (s === oldSide ? side : s)))] : undefined;
    d = apply(d, { type: 'set-plot', entry: side, ...(entries ? { entries } : {}) }) || apply(d, { type: 'set-plot', entry: side }) || d;
  }
  const AR = { n: 'الشمالية', s: 'الجنوبية', e: 'الشرقية', w: 'الغربية' };
  return d && { doc: d, op: { kind: 'entry', text: `نقل باب مدخل «${room.name}» إلى واجهته ${AR[side]}.` } };
}

/** انعكاس المسقط حول محور رأسي يمرّ بمنتصف الأرض (أو منتصف الجدران). التحويل محسوب على نسخة ثم يُتحقق منه. */
export function mirrorDoc(doc) {
  const d = structuredClone(doc);
  const xs = (d.plot?.polygon?.length ? d.plot.polygon : d.walls.flatMap(w => [w.a, w.b])).map(p => p.x);
  if (!xs.length) return null;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const R = p => pt({ x: 2 * cx - p.x, y: p.y });
  // الجدران: تبديل الطرفين مع الانعكاس يحفظ «يسار الجدار» (جهة فتح الباب) كما هي فيزيائيًا
  const len = new Map(d.walls.map(w => [w.id, dist(w.a, w.b)]));
  for (const w of d.walls) { const a = R(w.b), b = R(w.a); w.a = a; w.b = b; }
  for (const o of d.openings) { const L = len.get(o.wall); if (L !== undefined) o.at = Math.round((L - o.at) * 1000) / 1000; o.hinge = o.hinge === 'right' ? 'left' : 'right'; }
  for (const l of d.labels) l.seed = R(l.seed);
  for (const z of d.zones) z.polygon = z.polygon.map(R);
  for (const f of d.fixtures) { const p = R(f); f.x = p.x; f.y = p.y; f.rot = -(f.rot || 0); }
  for (const s of d.stairs) { const p = R(s); s.x = p.x; s.y = p.y; s.rot = -(s.rot || 0); s.flip = !s.flip; }
  for (const c of d.columns) { const p = R(c); c.x = p.x; c.y = p.y; }
  for (const m of d.dimensions) { m.a = R(m.a); m.b = R(m.b); }
  for (const t of d.texts) { t.at = R(t.at); t.rot = -(t.rot || 0); }
  if (d.plot?.polygon) { d.plot.polygon = d.plot.polygon.map(R); if (d.plot.setbacks) d.plot.setbacks = { ...d.plot.setbacks, e: d.plot.setbacks.w, w: d.plot.setbacks.e }; }
  const flip = s => (s === 'e' ? 'w' : s === 'w' ? 'e' : s);
  if (d.entry) d.entry = flip(d.entry);
  if (Array.isArray(d.entries)) d.entries = d.entries.map(flip);
  if (Array.isArray(d.streets)) d.streets = d.streets.map(flip);
  return { doc: d, op: { kind: 'mirror', text: 'انعكاس المسقط (مرآة شرق/غرب) مع بقاء الشمال الحقيقي.' } };
}

// ------------------------------------------------------------------ البحث
/** جيران مستند: كل العمليات المرشحة مع التحقق. يعيد [{ doc, op, model }]. */
function neighbours(doc, baseModel, model, { skipMirror = false } = {}) {
  const list = [];
  for (const c of swapCandidates(model)) { const r = opSwap(doc, c); if (r) list.push(r); }
  for (const c of entryCandidates(doc, model)) { const r = opEntry(doc, c); if (r) list.push(r); }
  if (!skipMirror) { const r = mirrorDoc(doc); if (r) list.push(r); }
  return list;
}

/**
 * يبحث عن أفضل بدائل تحسّن (خصوصية + مناخ) دون كسر القيود.
 * @returns {{ version, base:{privacy,climate,total}, variants:[{ rank, ops:[{kind,text}], doc, privacy, climate, total, gain, changes:[string], why:string }], evaluated:number, rejected:number, note:string }}
 */
export function optimizeVariants(doc, options = {}) {
  const T = { ...THRESHOLDS, ...(options.thresholds || {}) };
  const base = evaluateDoc(doc);
  const baseProblems = docProblems(doc, base.model);
  const seen = new Set([serialize(doc)]);
  const results = []; let evaluated = 0, rejected = 0;
  const explore = (fromDoc, fromModel, ops, depth) => {
    if (depth > T.depth || evaluated >= T.maxEvals) return [];
    const level = [];
    for (const n of neighbours(fromDoc, base.model, fromModel, { skipMirror: ops.some(o => o.kind === 'mirror') })) {
      if (evaluated >= T.maxEvals) break;
      const key = serialize(n.doc); if (seen.has(key)) continue; seen.add(key);
      const v = verifyVariant(base.model, n.doc, { areaTolerance: T.areaTolerance, baseProblems });
      if (!v.ok) { rejected++; continue; }
      evaluated++;
      const ev = evaluateDoc(n.doc);
      const item = { doc: n.doc, ops: [...ops, n.op], privacy: ev.privacy, climate: ev.climate, total: ev.total, model: ev.model };
      level.push(item); results.push(item);
    }
    level.sort((a, b) => b.total - a.total);
    for (const it of level.slice(0, T.beam)) explore(it.doc, it.model, it.ops, depth + 1);
  };
  explore(doc, base.model, [], 1);
  const ranked = results.filter(r => r.total - base.total >= T.minGain).sort((a, b) => b.total - a.total || a.ops.length - b.ops.length);
  // تنويع: بديل لا يزيد على بديل مختار إلا بعمليات لا تكسب شيئًا يُستبعد (مهيمَن عليه)
  const chosen = [];
  for (const r of ranked) {
    if (chosen.length >= 3) break;
    const texts = r.ops.map(o => o.text);
    if (chosen.some(c => c.total >= r.total - 1e-9 && c.ops.every(o => texts.includes(o.text)))) continue;
    chosen.push(r);
  }
  const variants = chosen.map((r, i) => {
    const changes = diffCriteria(base, r);
    return {
      rank: i + 1, ops: r.ops, doc: r.doc,
      privacy: r.privacy.score, climate: r.climate.score, total: r.total, gain: r2(r.total - base.total),
      before: { privacy: base.privacy.score, climate: base.climate.score, total: base.total },
      changes, why: changes.length ? changes.join(' ') : 'لم يتغيّر أي معيار جزئي بشكل ملحوظ.',
      violationsBefore: base.privacy.violations.length, violationsAfter: r.privacy.violations.length,
    };
  });
  return {
    version: OPTIMIZER_VERSION, base: { privacy: base.privacy.score, climate: base.climate.score, total: base.total }, variants, evaluated, rejected,
    note: variants.length ? `بحث محلي محدود (${evaluated} بديلًا مقبولًا، ${rejected} مرفوضًا بالقيود)؛ الدرجات تقديرية غير معايرة والبدائل تحتاج مراجعة مهندس.` : `لم يجد البحث المحلي (${evaluated} بديلًا مقبولًا، ${rejected} مرفوضًا) بديلًا يحسّن المجموع بأكثر من ${T.minGain} نقطة؛ التصميم الحالي هو الأفضل ضمن عمليات التبديل والانعكاس ونقل المدخل.`,
  };
}

/** ما الذي تغيّر بالأرقام: معايير الخصوصية والمناخ التي اختلفت نقاطها. */
function diffCriteria(base, v) {
  const out = [];
  const pairs = [['الخصوصية', base.privacy.criteria, v.privacy.criteria], ['المناخ', base.climate.criteria, v.climate.criteria]];
  for (const [what, before, after] of pairs) for (const c of after) {
    const b = before.find(x => x.id === c.id); if (!b) continue;
    const d = (c.earned ?? 0) - (b.earned ?? 0);
    if (Math.abs(d) >= 0.5) out.push(`${what} — ${c.label}: ${r1(b.earned ?? 0)} → ${r1(c.earned ?? 0)} من ${c.weight} (${d > 0 ? '+' : ''}${r1(d)}).`);
  }
  return out;
}

export default { OPTIMIZER_VERSION, THRESHOLDS, optimizeVariants, evaluateDoc, verifyVariant, mirrorDoc };
