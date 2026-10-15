// توليد دورين (أرضي + علوي) من برنامج واحد. وحدة نقية بلا DOM.
//
// الطريقة (أبسط حل صادق، بلا محرك جديد):
//  1) يُقسَّم البرنامج: الأرضي = مجلس/طعام/مطبخ/أول صالة/دورة مياه ضيوف، والعلوي = غرف النوم والباقي. لا يُحذف شيء ولا تتغير مساحة.
//  2) تُضاف غرفة «سلم» بأبعاد ثابتة ومتطابقة (STAIR_W × STAIR_H، دون تدوير) إلى برنامج كل دور.
//  3) يُولَّد الأرضي بالمحرك الحالي على الأرض الحقيقية. ثم يُولَّد العلوي على «أرض افتراضية» مقاسها كتلة الأرضي نفسها
//     (فلا يتجاوز العلوي حدّ الأرضي)، ويُزاح العلوي بالإزاحة التي تجعل مستطيل السلم فيه مطابقًا لمستطيله في الأرضي.
//  4) لا يُقبل زوج مرشحين إلا إذا بقي العلوي كله داخل كتلة الأرضي بعد الإزاحة.
//  5) يُدمج الدوران في مستند mizan-draw/1 واحد، ويُضاف مجسّم السلم في الدور الأرضي (فتحة الدرج في الأعلى يشتقها المجسّم).
//
// حدود معلنة (تفاصيلها في notes وفي التقرير):
//  - دوران فقط، ولا يدعم ثلاثة أدوار. الأشكال المدعومة للكتلة: مستطيل فقط (شكل L/U/أجنحة يُستبعد لأن «داخل الكتلة» لا يُحسب لها بالمستطيل).
//  - السلم مستقيم بعرض STAIR_CLEAR وطول صعود STAIR_RUN؛ لم يُتحقق من اشتراطات كود السلالم.
//  - الفكرة الحرة (idea) تُطبَّق على الأرضي فقط؛ العلوي يأخذ تفضيلات الاكتشاف (discovery) دون الفكرة.
//  - باب المدخل الذي يولّده المحرك يُحذف من العلوي (لا باب إلى الهواء)، ويُعدّ السلم نقطة الوصول عند التحقق (انظر export-legacy).
//  - ترابط الحركة الفعلي (circulationNetwork) لم يُتحقق منه في العلوي لأنه يبدأ من باب المدخل؛ يُتحقق بدلًا منه أن كل فراغ يُوصل إليه من السلم عبر الأبواب.
//  - الأعمدة الإنشائية ومحاذاة الجدران بين الدورين غير مُتحقَّق منها.
import { defaultRooms } from './planner.mjs';
import { runMultiEngineDesign } from './multi-engine.mjs';
import { legacyToDoc } from './draw/import-legacy.mjs';
import { applyCommand } from './draw/doc.mjs';
import { docToLegacy } from './draw/export-legacy.mjs';

export const STAIR_NAME = 'سلم';
export const STAIR_W = 1.5, STAIR_H = 4.6;          // غرفة السلم الصافية (م)
export const STAIR_CLEAR = 1.2, STAIR_RUN = 4.0;    // عرض الدرج وطول صعوده داخل الغرفة
const TOL = 0.02;
const r3 = v => Math.round(v * 1000) / 1000;

/** خطأ بتفاصيل رقمية: code ثابت، details أرقام، message عربية للعميل. */
export class MultiFloorError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'MultiFloorError'; this.code = code; this.details = details; }
}

// ------------------------------------------------------------------------------------------------ تقسيم البرنامج
/** يقسم الفراغات بين الدورين بالأنواع فقط. يعيد القائمتين (دون السلم) وملاحظات صريحة. */
export function splitProgram(rooms) {
  const ground = [], upper = [], notes = [];
  const baths = rooms.filter(r => r.type === 'bath').length, living = rooms.filter(r => r.type === 'living').length;
  let bathSeen = 0, livingSeen = 0;
  for (const r of rooms) {
    if (r.name === STAIR_NAME) throw new MultiFloorError('MULTI_NAME_CLASH', `اسم الفراغ «${STAIR_NAME}» محجوز للسلم؛ غيّر اسم هذا الفراغ.`);
    if (['majlis', 'dining', 'kitchen', 'service', 'storage'].includes(r.type)) ground.push(r);
    else if (r.type === 'living') { (livingSeen++ === 0 ? ground : upper).push(r); }
    else if (r.type === 'bath') { (bathSeen++ === 0 ? ground : upper).push(r); }
    else upper.push(r); // غرف النوم والمكتب والممرات الإضافية وأي نوع آخر
  }
  if (baths === 1) notes.push('طلبتَ دورة مياه واحدة فوضعتُها في الدور الأرضي (للضيوف)؛ الدور العلوي بلا دورة مياه.');
  if (living >= 2) notes.push('أول صالة في الدور الأرضي والباقي في العلوي كصالات عائلية.');
  return { ground, upper, notes };
}

/** مرساة السلم: الموضع والجانب نسبة إلى المدخل. تُثبَّت في الدورين معًا ليقع السلم في الركن نفسه من الكتلتين فتسهل مطابقتهما. */
export const ANCHORS = Object.freeze([{ position: 'front', side: 'left' }, { position: 'front', side: 'right' }, { position: 'back', side: 'left' }, { position: 'back', side: 'right' }]);
const stairRoom = (anchor = ANCHORS[0]) => ({ name: STAIR_NAME, type: 'storage', area: r3(STAIR_W * STAIR_H), position: anchor.position, side: anchor.side, dimensions: { width: STAIR_W, length: STAIR_H, allowRotation: false } });
const tally = (list, key) => { const o = {}; for (const x of list) { const k = key(x); o[k] = (o[k] || 0) + 1; } return o; };
const sum = (list, f) => list.reduce((a, v) => a + f(v), 0);

// ------------------------------------------------------------------------------------------------ أدوات هندسية
const stairOf = m => m.rooms.find(r => r.name === STAIR_NAME);
const shiftModel = (m, dx, dy) => ({
  ...m,
  rooms: m.rooms.map(r => ({ ...r, x: r3(r.x + dx), y: r3(r.y + dy) })),
  corridors: (m.corridors || []).map(r => ({ ...r, x: r3(r.x + dx), y: r3(r.y + dy) })),
  courtyards: (m.courtyards || []).map(r => ({ ...r, x: r3(r.x + dx), y: r3(r.y + dy) })),
  walls: m.walls.map(w => ({ ...w, x1: r3(w.x1 + dx), y1: r3(w.y1 + dy), x2: r3(w.x2 + dx), y2: r3(w.y2 + dy) })),
  building: { ...m.building, x: r3(m.building.x + dx), y: r3(m.building.y + dy) },
});
const within = (a, b, tol = TOL) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;
/** الأرض الافتراضية للعلوي: مقاسها كتلة الأرضي مع هامش n على كل جهة، وارتداداتها n، فتساوي كتلتها الجائزة كتلة الأرضي تمامًا. */
function virtualPlot(realPlot, B) {
  for (let n = 1; n <= 15; n++) {
    const width = r3(B.w + 2 * n), length = r3(B.h + 2 * n);
    if (width < 8 || length < 8 || width > 100 || length > 100) return null;
    if (B.w * B.h <= 0.9 * width * length - 1e-6) return { ...realPlot, width, length, streetSetback: n, neighborSetback: n, coverage: 0.9, maxBuiltArea: null };
  }
  return null;
}
/** باب يصل بين فراغ والخارج: لا يوجد في دور علوي. */
const stripEntryDoors = m => {
  const gone = new Set(m.openings.filter(o => o.type === 'door' && o.connects?.includes('outside')).map(o => o.id));
  return { model: { ...m, openings: m.openings.filter(o => !gone.has(o.id)) }, removed: gone.size };
};

// ------------------------------------------------------------------------------------------------ بناء المستند
function mergeUpper(doc, upperDoc, stairRect) {
  let out = doc;
  const run = c => { const r = applyCommand(out, c); out = r.doc; return r.ids; };
  const L2 = run({ type: 'add-level', name: 'الدور الأول' })[0];
  const wallMap = new Map();
  for (const w of upperDoc.walls) wallMap.set(w.id, run({ type: 'add-wall', level: L2, a: w.a, b: w.b, t: w.t, h: w.h, kind: w.kind })[0]);
  for (const o of upperDoc.openings) {
    if (!wallMap.has(o.wall)) continue;
    run({ type: 'add-opening', wall: wallMap.get(o.wall), kind: o.kind, at: o.at, w: o.w, h: o.h, sill: o.sill, swing: o.swing, hinge: o.hinge, entry: o.entry });
  }
  for (const l of upperDoc.labels) run({ type: 'add-label', level: L2, name: l.name, roomType: l.type, seed: l.seed });
  // تسمية السلم بنوعه الحقيقي في الدورين، ثم مجسّم الدرج في الأرضي
  for (const l of out.labels.filter(x => x.name === STAIR_NAME && x.type !== 'stairs')) run({ type: 'update', id: l.id, patch: { type: 'stairs' } });
  run({ type: 'add-stair', level: out.levels[0].id, kind: 'straight', x: r3(stairRect.x + stairRect.w / 2), y: r3(stairRect.y + (stairRect.h - STAIR_RUN) / 2), rot: 0, w: STAIR_CLEAR, run: STAIR_RUN });
  return out;
}

/** فحص صدق المستند الناتج: لكل دور validateModel (الأرضي كما هو؛ العلوي بالوصول من السلم) وتطابق مستطيل السلم. */
export function verifyFloors(doc) {
  const problems = [], stairs = [];
  for (const lv of doc.levels) {
    let r;
    try { r = docToLegacy(doc, { level: lv.id }); } catch (e) { problems.push(`${lv.name}: ${e.message}`); continue; }
    for (const v of r.report.validation) problems.push(`${lv.name}: ${v}`);
    const s = r.model.rooms.find(x => x.name === STAIR_NAME) || r.model.corridors.find(x => x.name === STAIR_NAME);
    if (!s) problems.push(`${lv.name}: لا توجد غرفة سلم.`); else stairs.push({ level: lv.id, x: s.x, y: s.y, w: s.w, h: s.h });
  }
  if (stairs.length === doc.levels.length) {
    const a = stairs[0];
    for (const b of stairs.slice(1)) if (['x', 'y', 'w', 'h'].some(k => Math.abs(a[k] - b[k]) > TOL)) problems.push(`السلم غير متطابق بين الدورين (${a.level} ≠ ${b.level}).`);
  }
  return { ok: !problems.length, problems, stairs };
}

// ------------------------------------------------------------------------------------------------ التوليد
/**
 * @param {{plot:object, land:object, rooms:object[], discovery:object, idea?:string, seed?:number}} p
 *   plot: أرض المحرك (دور واحد) من normalizeLand؛ land: أرض العميل؛ rooms: برنامج كامل (يُقسَّم هنا).
 * @param {{ toDoc: (model, land)=>{doc,report} }} hooks  تحويل نموذج إلى مستند (يمرّره home-flow لتجنب الاستيراد الدائري)
 * @returns {{ doc, report, notes, selectedIndex, strategy, floors, tried, program }}
 */
export async function generateTwoFloors({ plot, land, rooms, discovery, idea = '', seed = 1, toDoc }) {
  const { ground, upper, notes } = splitProgram(rooms);
  if (!ground.length) throw new MultiFloorError('MULTI_EMPTY_GROUND', 'لا فراغات تُوضع في الدور الأرضي (مجلس أو مطبخ أو طعام أو صالة). أضف واحدًا منها.', { ground: 0, upper: upper.length });
  if (!upper.length) throw new MultiFloorError('MULTI_EMPTY_UPPER', 'لا فراغات تُوضع في الدور العلوي (غرف نوم أو دورات مياه إضافية أو صالة ثانية).', { ground: ground.length, upper: 0 });
  const areaG = sum(ground, r => r.area) + stairRoom().area, areaU = sum(upper, r => r.area) + stairRoom().area;
  const tried = [];
  let groundFailure = null;

  for (const anchor of ANCHORS) {
    const tag = `${anchor.position === 'front' ? 'أمام' : 'خلف'}/${anchor.side === 'left' ? 'يسار' : 'يمين'}`;
    const groundProgram = [...ground, stairRoom(anchor)], upperProgram = [...upper, stairRoom(anchor)];
    let g;
    try { g = await runMultiEngineDesign({ plot, rooms: groundProgram, idea, discovery, seed }); }
    catch (e) { groundFailure = String(e.message || e).slice(0, 300); tried.push({ anchor: tag, why: 'لا توزيع للأرضي مع السلم في هذا الموضع' }); continue; }
    // الأرضي: المختار أولًا ثم البقية؛ المستطيل فقط
    const order = [g.selectedIndex, ...g.models.map((_, i) => i).filter(i => i !== g.selectedIndex)].filter(i => g.models[i].shape === 'rect' && stairOf(g.models[i]));
    if (!order.length) { tried.push({ anchor: tag, why: 'لا كتلة مستطيلة للأرضي', shapes: g.models.map(m => m.shape) }); continue; }
    for (const gi of order) {
      const gm = g.models[gi], B = gm.building, Sg = stairOf(gm);
      // الأرضي يُحوَّل ويُفحص أولًا: مرشح لا يجتاز التحقق كرسم لا داعي لتوليد علوي له
      let gd;
      try {
        gd = toDoc(gm, land);
        const probe = docToLegacy(gd.doc);
        if (probe.report.validation.length || !probe.model.rooms.some(r => r.name === STAIR_NAME)) { tried.push({ anchor: tag, ground: gi, why: 'الأرضي لا يجتاز التحقق بعد تحويله إلى رسم', problems: probe.report.validation.slice(0, 2) }); continue; }
      } catch (e) { tried.push({ anchor: tag, ground: gi, why: 'تعذّر تحويل الأرضي: ' + (e.message || e) }); continue; }
      const vp = virtualPlot(plot, B);
      if (!vp) { tried.push({ anchor: tag, ground: gi, why: 'كتلة الأرضي لا تُحوَّل إلى أرض افتراضية صالحة' }); continue; }
      let u;
      try { u = await runMultiEngineDesign({ plot: vp, rooms: upperProgram, idea: '', discovery, seed }); }
      catch (e) { tried.push({ anchor: tag, ground: gi, why: 'العلوي لا يتسع داخل كتلة الأرضي', required: r3(areaU), building: r3(B.w * B.h) }); continue; }
      const uOrder = [u.selectedIndex, ...u.models.map((_, i) => i).filter(i => i !== u.selectedIndex)].filter(i => u.models[i].shape === 'rect' && stairOf(u.models[i]));
      for (const ui of uOrder) {
        const um = u.models[ui], Su = stairOf(um);
        if (Math.abs(Su.w - Sg.w) > TOL || Math.abs(Su.h - Sg.h) > TOL) { tried.push({ anchor: tag, ground: gi, upper: ui, why: 'مقاس السلم اختلف' }); continue; }
        const dx = r3(Sg.x - Su.x), dy = r3(Sg.y - Su.y), b = um.building;
        const moved = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
        if (!within(moved, B)) { tried.push({ anchor: tag, ground: gi, upper: ui, why: 'بعد مطابقة السلم يخرج العلوي من كتلة الأرضي', overhang: r3(Math.max(B.x - moved.x, moved.x + moved.w - B.x - B.w, B.y - moved.y, moved.y + moved.h - B.y - B.h, 0)) }); continue; }
        // نموذج العلوي بأرض الأرضي الحقيقية (للتحويل فقط)، بلا باب مدخل
        const { model: noEntry, removed } = stripEntryDoors(shiftModel(um, dx, dy));
        const upperModel = { ...noEntry, plot: gm.plot, footprint: gm.footprint };
        try {
          const ud = legacyToDoc(upperModel, { title: 'الدور العلوي' });
          const doc = mergeUpper(gd.doc, ud.doc, { x: Sg.x, y: Sg.y, w: Sg.w, h: Sg.h });
          const check = verifyFloors(doc);
          if (!check.ok) { tried.push({ anchor: tag, ground: gi, upper: ui, why: 'فشل التحقق بعد الدمج', problems: check.problems.slice(0, 3) }); continue; }
          const report = { ...gd.report, upper: ud.report, areaMismatch: [...gd.report.areaMismatch, ...ud.report.areaMismatch.map(x => ({ ...x, name: 'العلوي: ' + x.name }))], unmatched: [...gd.report.unmatched, ...ud.report.unmatched.map(x => 'العلوي: ' + x)] };
          return {
            doc, report, selectedIndex: gi, strategy: gm.strategy, floors: 2, anchor: tag,
            notes: [...notes, `دوران: الأرضي ${ground.length} فراغ والعلوي ${upper.length} فراغ، والسلم (${STAIR_W}×${STAIR_H} م) في الموضع نفسه على الدورين (${tag}).`,
              ...(removed ? ['حُذف باب المدخل المولَّد من الدور العلوي؛ الوصول إليه من السلم.'] : []),
              'الفكرة الحرة طُبِّقت على الدور الأرضي فقط؛ لم يُتحقق منها في العلوي.',
              'لم يُتحقق من مسار الحركة الفعلي في العلوي ولا من اشتراطات كود السلالم ولا من أعمدة الإنشاء.'],
            tried, program: { ground: groundProgram.map(r => r.name), upper: upperProgram.map(r => r.name), areaGround: r3(areaG), areaUpper: r3(areaU) },
          };
        } catch (e) { tried.push({ anchor: tag, ground: gi, upper: ui, why: 'تعذّر الدمج: ' + (e.message || e) }); }
      }
    }
  }
  if (tried.length && tried.every(t => t.why.startsWith('لا توزيع للأرضي'))) throw new MultiFloorError('MULTI_GROUND_FAILED', `لم أجد توزيعًا للدور الأرضي على أرض ${plot.width}×${plot.length} م: فراغاته مع السلم ${r3(areaG)} م² قبل الجدران والممرات، ولم ينجح أي موضع للسلم (أمام/خلف، يمين/يسار). الدور العلوي لم يُجرَّب.`, { floor: 'ground', required: r3(areaG), upperRequired: r3(areaU), plot: { width: plot.width, length: plot.length }, reason: groundFailure });
  throw new MultiFloorError('MULTI_NO_ALIGNED_PAIR', `لم أجد توزيعين يتطابق فيهما موضع السلم ويبقى العلوي داخل كتلة الأرضي بعد ${tried.length} محاولة: الأرضي ${r3(areaG)} م² والعلوي ${r3(areaU)} م² (مع السلم، قبل الجدران والممرات) على أرض ${plot.width}×${plot.length} م. لم أغيّر شيئًا من برنامجك.`, { attempts: tried.length, required: { ground: r3(areaG), upper: r3(areaU) }, reasons: tally(tried, t => `${t.anchor || ''}: ${t.why}`), tried: tried.slice(0, 12) });
}

/** برنامج افتراضي من أعداد (للاختبارات والتشخيص). */
export const programFromCounts = counts => defaultRooms(counts);

export default { STAIR_NAME, STAIR_W, STAIR_H, MultiFloorError, splitProgram, generateTwoFloors, verifyFloors };
