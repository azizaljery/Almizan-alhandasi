// طبقة المراجعة الموحّدة للمخطط الناتج نفسه (مستند mizan-draw/1): قراءة فقط، بلا إعادة توليد ولا تغيير معرّفات.
// تجمع نتائج الفحوص الموجودة فعلًا (سجل طلب العميل، اشتراطات البلدية، الخصوصية الهندسية، فحوص الرسم والحركة، الدرج،
// opening-aware، متطلبات requirement-evidence النصية، قفل الأجزاء، وعزيز لكل دور) في تقرير واحد: لكل ملاحظة
// معرّف وشدة وسبب وموقع على الرسم وحالة (مخالف/متحقق/غير متحقق) ودليل. ما لا يمكن قياسه «غير متحقق» ولا يُحسب نجاحًا أبدًا.
// التقرير مربوط بنسخة المخطط (planVersion = بصمة هندسية ثابتة): أي تعديل هندسي يُبطله؛ تغيير اللون أو التسمية لا يبطله.
// لا شروط إلزامية جديدة هنا: الإلزامي هو ما كان إلزاميًا أصلًا في المدقّق المستقل (design-impact.auditDoc) وسجل الطلب وقيود عزيز الصلبة.
// نقي: بلا DOM ولا شبكة.
import { analyzeDoc } from './draw/digest.mjs';
import { evaluateSaudiQuality } from './architect/saudi-quality.mjs';
import { reviewDoc } from './draw/review.mjs';
import { getById, parseDoc } from './draw/doc.mjs';
import { checkDoc, quality, PLAN_LIMITS } from './villa-layout.mjs';
import { verifyRequest } from './rules.mjs';
import { checkMunicipal } from './municipal-rules.mjs';
import { evaluatePrivacyKind, PRIVACY_KINDS } from './privacy-geometry.mjs';
import { checkStairs } from './draw/stair-check.mjs';
import { stairLayout } from './draw/stairs3d.mjs';
import { verifyLock } from './design-lock.mjs';
import { assessOpenings } from './opening-aware.mjs';
import { docToLegacy } from './draw/export-legacy.mjs';
import { legacyToDoc } from './draw/import-legacy.mjs';
import { evaluateRequirementEvidence } from './requirement-evidence.mjs';
import { normalizeArabic } from './requirement-tiers.mjs';
import { azizReviewLevels } from './integration/aziz-levels.mjs';
import { sha256 } from './integration/browser-crypto.mjs';
import { pointInPolygon } from './draw/geom.mjs';
import { ROOM_TYPES } from './draw/catalog.mjs';
import { analyzeDailyLife } from './daily-life.mjs';

export const REVIEW_VERSION = 'design-review/1';
export const DISCLAIMER = 'مراجعة آلية أولية؛ الاعتماد التنفيذي يحتاج المهندس المختص. لا يشمل الأحمال والأساسات والتسليح.';
export const SEVERITY = Object.freeze({ MANDATORY: 'mandatory', WARNING: 'warning', INFO: 'info' });
export const STATE = Object.freeze({ VIOLATED: 'violated', VERIFIED: 'verified', UNVERIFIED: 'unverified' });
export const SEVERITY_AR = Object.freeze({ mandatory: 'إلزامي', warning: 'تحذير', info: 'معلومة' });
export const STATE_AR = Object.freeze({ violated: 'مخالف', verified: 'متحقق', unverified: 'غير متحقق' });
export const SOURCE_AR = Object.freeze({ geometry: 'سلامة الرسم', access: 'الحركة والوصول', municipal: 'اشتراطات البلدية', request: 'طلب العميل', privacy: 'الخصوصية الهندسية', drawing: 'مراجعة الرسم', stairs: 'الدرج', openings: 'الفتحات (opening-aware)', requirement: 'متطلبات العميل النصية', locks: 'الأجزاء المقفلة', aziz: 'عزيز', levels: 'العلاقات بين الأدوار', daily: 'الحياة اليومية', review: 'المراجعة' });
/** مسارات التصميم الخمسة التي يجب أن تمرّ كلها عبر البوابة. */
export const ROUTES = Object.freeze(['first', 'alternative', 'merge', 'manual', 'chat']);
export const ROUTE_AR = Object.freeze({ first: 'التوليد الأول', alternative: 'بديل', merge: 'دمج', manual: 'تعديل يدوي', chat: 'تعديل بالمحادثة' });
/** مفتاح الإلزام: الافتراضي مطفأ (المراجعة تظهر ولا تمنع). يُشغَّل بـ requirements.tweaks.reviewEnforce أو globalThis.MIZAN_REVIEW_ENFORCE بعد موافقة المالك. */
export const REVIEW_SWITCH = { enforce: false };
export function reviewEnforced(requirements = null) {
  const v = requirements?.tweaks?.reviewEnforce ?? (typeof globalThis !== 'undefined' ? globalThis.MIZAN_REVIEW_ENFORCE : undefined) ?? REVIEW_SWITCH.enforce;
  return v === true || v === 'on';
}

const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const num = v => new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 }).format(v);

// ------------------------------------------------------------------------------------------ بصمة النسخة
function stable(v, depth = 0) {
  if (depth > 12) return '"…"';
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(r3(v)) : 'null';
  if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(x => stable(x, depth + 1)).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined && typeof v[k] !== 'function').map(k => JSON.stringify(k) + ':' + stable(v[k], depth + 1)).join(',') + '}';
  return 'null';
}
const P = p => (p ? [r3(p.x), r3(p.y)] : null);
const byId = (a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0);
/**
 * المدخل القانوني للبصمة الهندسية: الأدوار (المعرّف والمنسوب والارتفاع) والجدران (الإحداثيات والسماكة والارتفاع والنوع) والفتحات
 * (الموضع والعرض والارتفاع والعتبة والنوع والاتجاه) والتسميات (المعرّف والدور والنوع والموضع) والدرج والأعمدة والقطع الثابتة (بلا اللون)
 * والأرض والمدخل والشمال. لا تدخل فيه: الألوان والتشطيبات والأسماء المعروضة (إلا لغرف مقفلة) والعناوين والأبعاد المرسومة والنصوص.
 */
export function planFingerprintInput(doc, { lockedLabelIds = [] } = {}) {
  const locked = new Set(lockedLabelIds);
  return {
    levels: (doc.levels || []).map(l => [l.id, r3(l.elevation ?? 0), r3(l.height ?? 0)]),
    walls: (doc.walls || []).map(w => [w.id, w.level || '', P(w.a), P(w.b), r3(w.t ?? 0), w.h == null ? null : r3(w.h), w.kind || 'wall']).sort(byId),
    openings: (doc.openings || []).map(o => [o.id, o.level || '', o.wall, o.kind || '', r3(o.at ?? 0), r3(o.w ?? 0), r3(o.h ?? 0), r3(o.sill ?? 0), o.swing || '', o.hinge || '', !!o.entry]).sort(byId),
    labels: (doc.labels || []).map(l => [l.id, l.level || '', l.type || '', P(l.seed), locked.has(l.id) ? l.name || '' : '']).sort(byId),
    stairs: (doc.stairs || []).map(s => [s.id, s.level || '', s.kind || '', r3(s.x ?? 0), r3(s.y ?? 0), r3(s.rot ?? 0), r3(s.w ?? 0), r3(s.run ?? 0), !!s.flip, s.steps ?? null]).sort(byId),
    columns: (doc.columns || []).map(c => [c.id, c.level || '', r3(c.x ?? 0), r3(c.y ?? 0), r3(c.size ?? 0), !!c.round]).sort(byId),
    fixtures: (doc.fixtures || []).map(f => [f.id, f.level || '', f.kind || '', r3(f.x ?? 0), r3(f.y ?? 0), r3(f.rot ?? 0), r3(f.w ?? 0), r3(f.d ?? 0), r3(f.h ?? 0)]).sort(byId),
    zones: (doc.zones || []).map(z => [z.id, z.level || '', z.type || '', (z.polygon || []).map(P)]).sort(byId),
    site: { plot: doc.plot ?? null, entry: doc.entry ?? null, entries: doc.entries ?? null, streets: doc.streets ?? null, north: r3(doc.north ?? 0), parapet: r3(doc.roof?.parapet ?? 0) },
  };
}
/** يحسب نسخة المخطط: بصمة هندسته (geometryHash) ثم بصمة النسخة الكاملة planVersion التي تضم المتطلبات والأرض والأقفال. */
export function planVersion(doc, ctx = {}) {
  const lockedLabelIds = [...(ctx.locks || []).map(l => l.labelId).filter(Boolean), ...(ctx.requirements?.architect?.enabled ? (doc.labels || []).map(l => l.id) : [])];
  const geometryHash = 'geo:' + sha256(stable(planFingerprintInput(doc, { lockedLabelIds })));
  const requirementsHash = sha256(stable({ requirements: ctx.requirements || null, land: ctx.land || null, entry: ctx.entry || null, locks: (ctx.locks || []).map(l => l.key).sort() }));
  return { geometryHash, requirementsHash: 'req:' + requirementsHash, planVersion: 'pv:' + sha256(geometryHash + '|' + requirementsHash) };
}

// ------------------------------------------------------------------------------------------ تحديد المواقع
function makeLocator(doc, model) {
  const levelName = id => doc.levels.find(l => l.id === id)?.name || id;
  const poly = (levelId, pts, ref) => ({ type: 'polygon', levelId, points: pts.map(p => ({ x: r3(p.x), y: r3(p.y) })), ref });
  const wallAt = (w, at) => { const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1; return { x: w.a.x + (w.b.x - w.a.x) * at / L, y: w.a.y + (w.b.y - w.a.y) * at / L }; };
  function loc({ levelId = null, roomIds = [], wallIds = [], openingIds = [], stairIds = [], points = [], segments = [], label = '', scope = null } = {}) {
    const shapes = [], rooms = [], walls = [], ops = [], sts = [];
    let lvl = levelId;
    for (const id of roomIds) { const hit = model.roomIndex.get(id); if (hit?.room.net) { shapes.push(poly(hit.level.level.id, hit.room.net, id)); rooms.push(id); lvl ||= hit.level.level.id; } }
    for (const id of wallIds) { const w = doc.walls.find(x => x.id === id); if (w) { shapes.push({ type: 'segment', levelId: w.level, a: P0(w.a), b: P0(w.b), ref: id }); walls.push(id); lvl ||= w.level; } }
    for (const id of openingIds) {
      const o = doc.openings.find(x => x.id === id), w = o && doc.walls.find(x => x.id === o.wall); if (!o || !w) continue;
      shapes.push({ type: 'segment', levelId: w.level, a: P0(wallAt(w, o.at - o.w / 2)), b: P0(wallAt(w, o.at + o.w / 2)), ref: id }); ops.push(id); lvl ||= w.level;
    }
    for (const id of stairIds) {
      const s = doc.stairs.find(x => x.id === id); if (!s) continue; const li = doc.levels.findIndex(l => l.id === s.level), rise = (doc.levels[li + 1]?.elevation ?? 0) - (doc.levels[li]?.elevation ?? 0) || doc.levels[li]?.height || 3.2;
      let hole = null; try { hole = stairLayout(s, rise).hole; } catch { hole = null; }
      shapes.push(hole?.length >= 3 ? poly(s.level, hole, id) : { type: 'point', levelId: s.level, p: P0(s), ref: id }); sts.push(id); lvl ||= s.level;
    }
    for (const p of points) { const lv = p.level || lvl; shapes.push({ type: 'point', levelId: lv, p: P0(p) }); lvl ||= lv; }
    for (const sg of segments) { const lv = sg.level || lvl; shapes.push({ type: 'segment', levelId: lv, a: P0(sg.a), b: P0(sg.b) }); lvl ||= lv; }
    const xs = [], ys = [];
    for (const s of shapes) for (const p of s.points || [s.a, s.b, s.p].filter(Boolean)) { xs.push(p.x); ys.push(p.y); }
    return { scope: scope || (shapes.length ? (rooms.length ? 'room' : walls.length ? 'wall' : ops.length ? 'opening' : sts.length ? 'stair' : 'point') : lvl ? 'level' : 'plan'),
      levelId: lvl, levelName: lvl ? levelName(lvl) : null, roomIds: rooms, wallIds: walls, openingIds: ops, stairIds: sts, shapes, label,
      bbox: xs.length ? { x0: r3(Math.min(...xs)), y0: r3(Math.min(...ys)), x1: r3(Math.max(...xs)), y1: r3(Math.max(...ys)) } : null };
  }
  const P0 = p => ({ x: r3(p.x), y: r3(p.y) });
  /** معرّفات مختلطة (جدران/فتحات/تسميات/قطع/غرف) كما تعيدها مراجعة الرسم ← موقع. */
  function locOfIds(ids, extra = {}) {
    const out = { roomIds: [], wallIds: [], openingIds: [], stairIds: [], points: [] };
    for (const id of ids || []) {
      if (model.roomIndex.has(id)) { out.roomIds.push(id); continue; }
      const hit = getById(doc, id); if (!hit) continue;
      const { collection: c, item: it } = hit;
      if (c === 'walls') out.wallIds.push(id);
      else if (c === 'openings') out.openingIds.push(id);
      else if (c === 'stairs') out.stairIds.push(id);
      else if (c === 'labels') { const room = [...model.roomIndex.values()].find(x => x.room.labelIds?.includes(id)); if (room) out.roomIds.push(room.room.id); else out.points.push({ ...it.seed, level: it.level }); }
      else if (Number.isFinite(it.x)) out.points.push({ x: it.x, y: it.y, level: it.level });
    }
    return loc({ ...out, ...extra });
  }
  /** غرفة بالاسم (+ الدور معرّفًا أو اسمًا) ← معرّفها. */
  function roomIdByName(name, level) {
    for (const lv of model.levels) {
      if (level && lv.level.id !== level && lv.level.name !== level) continue;
      const r = lv.rooms.find(x => !x.unlabelled && x.name === name); if (r) return r.id;
    }
    return null;
  }
  return { loc, locOfIds, roomIdByName, levelName };
}

// ------------------------------------------------------------------------------------------ بناء التقرير
const REVIEW_TITLES = Object.freeze({ GAP: 'ثغرة في الجدران', STUB: 'جدار معلّق', UNLABELLED_ROOM: 'غرفة بلا تسمية', ORPHAN_LABEL: 'تسمية خارج أي غرفة', DUPLICATE_LABEL: 'تسميات مكررة في غرفة', NO_ENTRY: 'لا باب مدخل', ENTRY_UNFLAGGED: 'باب المدخل غير معلَّم', NO_WINDOW: 'غرفة بلا نافذة خارجية', WINDOW_RATIO: 'نسبة النوافذ إلى الأرضية', MIN_AREA: 'مساحة دون الإرشاد', MIN_WIDTH: 'عرض دون الإرشاد', CORRIDOR_NARROW: 'ممر ضيق', BATH_PRIVACY: 'خصوصية دورة المياه', BEDROOM_FROM_ENTRY: 'غرفة نوم ظاهرة من المدخل', SWING_BLOCKED: 'فتح باب معترَض', FIXTURE_OVERLAP: 'تداخل قطع ثابتة', FIXTURE_OUTSIDE: 'قطعة خارج غرفتها', GARDEN_PLACEMENT: 'موضع الحديقة', ELEVATOR_ALIGN: 'محاذاة المصعد', STAIR_NARROW: 'درج ضيق', STAIR_STEPS: 'درجات الدرج', EXTERIOR_THIN: 'جدار خارجي رفيع', OPENING_NEAR_END: 'فتحة قرب طرف الجدار' });
const PRIVACY_CLAUSES = [/غرف (?:ال)?نوم.*(?:مكشوف|انكشاف)|(?:مكشوف|انكشاف).*غرف (?:ال)?نوم/, /ممر.*(?:مظلم|مضاء|اضاءه|ظلام)|(?:ظلام|مظلم).*ممر/, /مطبخ.*غرف (?:ال)?نوم.*(?:مواجه|مقابل|رؤيه)|(?:مواجه|مقابل|رؤيه).*مطبخ.*نوم/];
const OPEN_TYPES = new Set(Object.entries(ROOM_TYPES).filter(([, t]) => t.open).map(([k]) => k));
const WET = new Set(['bath', 'kitchen', 'laundry']);
const BEARING_TYPES = new Set(['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'office', 'service']);

function sampleInPoly(poly, step = .25) {
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y), out = [];
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) if (pointInPolygon({ x, y }, poly)) out.push({ x, y });
  return out;
}

export function reviewDesign(doc, ctx = {}) {
  if (!doc || !Array.isArray(doc.levels) || !Array.isArray(doc.walls)) throw Error('REVIEW_BAD_DOC: يلزم مستند mizan-draw/1.');
  const req = ctx.requirements || {}, land = ctx.land || {}, entry = ctx.entry || land?.entries?.[0] || doc.plot?.entry || 's', locks = ctx.locks || [];
  const ver = planVersion(doc, ctx);
  const findings = [], used = new Set();
  let model; try { model = analyzeDoc(doc); } catch (e) { model = null; findings.push(base('geometry', 'analyze', SEVERITY.MANDATORY, STATE.UNVERIFIED, 'تحليل المخطط', 'تعذّر تحليل المخطط: ' + (e.message || e), {}, { scope: 'plan', levelId: null, levelName: null, roomIds: [], wallIds: [], openingIds: [], stairIds: [], shapes: [], label: 'المخطط كله', bbox: null })); }
  function base(source, code, severity, state, title, reason, evidence, location) {
    let id = `${source}:${code}`, k = 2; while (used.has(id)) id = `${source}:${code}#${k++}`; used.add(id);
    return { id, source, sourceLabel: SOURCE_AR[source] || (source === 'architect' ? 'جودة التوزيع السكني' : source), severity, severityAr: SEVERITY_AR[severity], state, stateAr: STATE_AR[state], title, reason, evidence: evidence ?? {}, location };
  }
  const L = model ? makeLocator(doc, model) : null;
  const add = (source, code, severity, state, title, reason, evidence, location) => findings.push(base(source, code, severity, state, title, reason, evidence, location));
  const planLoc = label => L.loc({ scope: 'plan', label });
  const guard = (source, label, severity, fn) => { try { fn(); } catch (e) { add(source, 'error', severity, STATE.UNVERIFIED, label, `تعذّر القياس: ${e.message || e}. لا يُحسب هذا الفحص متحققًا.`, {}, planLoc(label)); } };

  if (model) {
    if (req.architect?.enabled) guard('architect', 'جودة التوزيع المتفق عليها', SEVERITY.MANDATORY, () => {
      const report = evaluateSaudiQuality(doc, req.architect, { model });
      for (const c of report.checks.filter(c => c.state !== 'na')) add('architect', c.id, SEVERITY.MANDATORY,
        c.state === 'pass' ? STATE.VERIFIED : c.state === 'fail' ? STATE.VIOLATED : STATE.UNVERIFIED, c.title, c.reason, c.evidence,
        c.roomIds.length ? L.loc({ roomIds: c.roomIds, label: c.title }) : planLoc(c.title));
    });
    // 1) سلامة الرسم (إلزامي: كما في المدقّق المستقل)
    guard('geometry', 'سلامة الرسم', SEVERITY.MANDATORY, () => {
      const c = checkDoc(doc);
      if (c.ok) add('geometry', 'closure', SEVERITY.MANDATORY, STATE.VERIFIED, 'سلامة الرسم', `كل غرفة مغلقة ولها تسمية واحدة (${c.spaces} فراغًا).`, { spaces: c.spaces }, planLoc('المخطط كله'));
      else c.problems.forEach((p, i) => {
        const ids = [...p.matchAll(/«(.+?)»/g)].flatMap(m => doc.labels.filter(l => l.name === m[1]).map(l => l.id));
        add('geometry', 'problem' + (i ? '-' + i : ''), SEVERITY.MANDATORY, STATE.VIOLATED, 'سلامة الرسم', p, { problem: p }, ids.length ? L.locOfIds(ids) : planLoc('المخطط كله'));
      });
    });

    // 2) الوصول إلى كل غرفة (إلزامي)
    guard('access', 'الوصول إلى الغرف', SEVERITY.MANDATORY, () => {
      let bad = 0, checked = 0;
      for (const lv of model.levels) {
        if (!lv.rooms.length) continue;
        if (!lv.seedKind) { bad++; add('access', 'no-seed-' + lv.level.id, SEVERITY.MANDATORY, STATE.UNVERIFIED, 'الوصول إلى الغرف', `غير متحقق: ${lv.level.name} بلا باب مدخل ولا درج صاعد إليه، فلا نقطة بدء لقياس الوصول.`, { levelId: lv.level.id }, L.loc({ levelId: lv.level.id, scope: 'level', label: lv.level.name })); continue; }
        for (const r of lv.rooms) {
          if (r.unlabelled || OPEN_TYPES.has(r.type)) continue; checked++;
          if (!lv.reach.has(r.id)) { bad++; add('access', 'unreachable-' + r.id, SEVERITY.MANDATORY, STATE.VIOLATED, 'الوصول إلى الغرف', `«${r.name}» (${lv.level.name}) لا يصل إليها باب من ${lv.seedKind === 'entry' ? 'المدخل' : 'الدرج'}.`, { roomId: r.id, levelId: lv.level.id }, L.loc({ roomIds: [r.id], label: r.name })); }
        }
      }
      if (!bad) add('access', 'all', SEVERITY.MANDATORY, STATE.VERIFIED, 'الوصول إلى الغرف', `كل الغرف المسمّاة (${checked}) يصل إليها باب من المدخل أو الدرج.`, { checked }, planLoc('المخطط كله'));
    });

    // 3) اشتراطات البلدية (إلزامي كما في المدقّق المستقل؛ «يُراجع» = غير متحقق)
    guard('municipal', 'اشتراطات البلدية', SEVERITY.MANDATORY, () => {
      const m = checkMunicipal(doc, land || {});
      const exteriorOf = side => { const segs = []; if (Number(doc.north) % 360 !== 0 && doc.north) return segs; model.levels.forEach(lv => { for (const r of lv.rooms) for (const e of r.edges) if (e.exterior && e.side === ({ n: 'n', s: 's', e: 'e', w: 'w' })[side]) segs.push({ level: lv.level.id, a: e.a, b: e.b }); }); return segs.slice(0, 40); };
      for (const it of m.items) {
        if (it.verdict === 'na') continue;
        const state = it.verdict === 'ok' ? STATE.VERIFIED : it.verdict === 'fail' ? STATE.VIOLATED : STATE.UNVERIFIED;
        let location;
        if (it.ids?.length) location = L.loc({ roomIds: it.ids, label: it.title });
        else if (it.id === 'entry_ped') location = L.loc({ openingIds: doc.openings.filter(o => o.entry).map(o => o.id), label: it.title });
        else if (it.id === 'stair' && doc.stairs.length) location = L.loc({ stairIds: doc.stairs.map(s => s.id), label: it.title });
        else if (/^setback_/.test(it.id) && it.rows?.length) { const segs = it.rows.filter(r => r.verdict !== 'ok').flatMap(r => exteriorOf(r.side)); location = segs.length ? L.loc({ segments: segs, label: it.title }) : planLoc(it.title); }
        else location = planLoc(it.title);
        add('municipal', it.id, SEVERITY.MANDATORY, state, it.title, it.text || it.rule || '', { verdict: it.verdict, required: it.required ?? null, actual: it.actual ?? null, source: it.source || null, ruleStatus: it.ruleStatus || null }, location);
      }
    });

    // 4) سجل طلب العميل (إلزامي ما لم يكن قاعدة مخصّصة؛ الخصوصية تُقاس بقسمها)
    guard('request', 'طلب العميل', SEVERITY.MANDATORY, () => {
      const ledger = verifyRequest(doc, req, { entry }), soft = new Set((req.rules || []).filter(r => r.custom).map(r => r.id));
      for (const x of ledger) {
        if (/^PV-/.test(x.id || '')) continue;
        const state = x.unverified ? STATE.UNVERIFIED : x.ok ? STATE.VERIFIED : STATE.VIOLATED;
        const ids = (x.where || []).map(w => L.roomIdByName(w.name, w.level)).filter(Boolean);
        add('request', String(x.id || x.text), soft.has(x.id) ? SEVERITY.WARNING : SEVERITY.MANDATORY, state, x.text, x.ok ? (x.evidence || 'متحقق من الرسم.') : (x.why || 'لم يتحقق.'), { kind: x.kind || null }, ids.length ? L.loc({ roomIds: ids, label: x.text }) : planLoc(x.text));
      }
    });

    // 5) الخصوصية الهندسية (privacy-geometry): إلزامية إن طلبها العميل بصيغة إلزام، تحذير إن طلبها، معلومة إن لم يطلبها
    guard('privacy', 'الخصوصية الهندسية', SEVERITY.WARNING, () => {
      const asked = new Map((req.privacy || []).map(p => [p.kind, p]));
      for (const kind of PRIVACY_KINDS) {
        const g = evaluatePrivacyKind(doc, kind), a = asked.get(kind);
        const severity = a ? (a.must ? SEVERITY.MANDATORY : SEVERITY.WARNING) : SEVERITY.INFO;
        const state = g.status === 'PASS' ? STATE.VERIFIED : g.status === 'FAIL' ? STATE.VIOLATED : STATE.UNVERIFIED;
        const ids = (g.where || []).map(w => L.roomIdByName(w.name, w.level)).filter(Boolean);
        const segments = (g.marks || []).map(mk => ({ level: mk.level, a: mk.a, b: mk.b }));
        const points = segments.filter(s => s.a.x === s.b.x && s.a.y === s.b.y).map(s => ({ ...s.a, level: s.level }));
        const lines = segments.filter(s => !(s.a.x === s.b.x && s.a.y === s.b.y));
        add('privacy', kind, severity, state, a?.text || kind, g.detail, { status: g.status, requested: !!a, must: !!a?.must, marks: g.marks || [] }, ids.length || segments.length ? L.loc({ roomIds: ids, points, segments: lines, label: a?.text || kind }) : planLoc(a?.text || kind));
      }
    });

    // 6) مراجعة الرسم (draw/review.mjs): الخطأ إلزامي، وحدود الرفض في quality (غرف رئيسية أضيق من الحد، غرفة نوم بلا نافذة) إلزامية
    guard('drawing', 'مراجعة الرسم', SEVERITY.WARNING, () => {
      const issues = reviewDoc(doc, { model });
      let mandatoryFromReview = 0;
      for (const i of issues) {
        if (i.code === 'UNREACHABLE_ROOM') continue; // يقيسه قسم الوصول
        const isReject = i.severity === 'error' || (i.code === 'MIN_WIDTH' && /غرفة نوم|مجلس|صالة|مطبخ/.test(i.message)) || (i.code === 'NO_WINDOW' && /غرفة نوم/.test(i.message));
        const severity = isReject ? SEVERITY.MANDATORY : i.severity === 'warning' ? SEVERITY.WARNING : SEVERITY.INFO;
        if (isReject) mandatoryFromReview++;
        add('drawing', i.id, severity, STATE.VIOLATED, REVIEW_TITLES[i.code] || i.code, i.message, { code: i.code, fix: i.fix?.label || null }, i.targetIds.length ? L.locOfIds(i.targetIds, { label: REVIEW_TITLES[i.code] || i.code }) : planLoc(REVIEW_TITLES[i.code] || i.code));
      }
      // حد الرفض بنسب الغرف (quality): يُذكر فقط إن لم يفسّره بند أعلاه
      const bedrooms = doc.labels.filter(l => l.type === 'bedroom' || l.type === 'master').length, q = quality(doc, { bedrooms });
      const heavy = [];
      for (const lv of q.metrics?.levels || []) for (const r of lv.rooms || []) if (['bedroom', 'master', 'majlis'].includes(r.type) && r.ratio > PLAN_LIMITS.rejectRatio) heavy.push({ name: r.name, level: lv.id, ratio: r.ratio });
      if (heavy.length) add('drawing', 'ratio-reject', SEVERITY.MANDATORY, STATE.VIOLATED, 'نسبة غرفة فوق حد الرفض', heavy.map(h => `«${h.name}» نسبة الطول إلى العرض ${num(h.ratio)} (الحد ${PLAN_LIMITS.rejectRatio})`).join('؛ ') + '.', { heavy }, L.loc({ roomIds: heavy.map(h => L.roomIdByName(h.name, h.level)).filter(Boolean), label: 'نسبة الغرفة' }));
      else if (q.reject && !mandatoryFromReview) add('drawing', 'quality-reject', SEVERITY.MANDATORY, STATE.VIOLATED, 'حد الرفض في جودة المخطط', 'تجاوز المخطط حد الرفض في مقياس الجودة، ولا سبب منفرد معروف الموقع.', { reject: true }, planLoc('المخطط كله'));
      else if (!q.reject) add('drawing', 'quality-reject', SEVERITY.MANDATORY, STATE.VERIFIED, 'حد الرفض في جودة المخطط', 'لا تجاوز لحدود الرفض (نسب الغرف، عروض الغرف الرئيسية، نوافذ غرف النوم).', { reject: false }, planLoc('المخطط كله'));
    });

    // 7) الدرج: أحكام SBC 201 العامة (الاستثناءات غير متحقق منها فلا يُجعل شيء منها إلزاميًا)
    guard('stairs', 'الدرج', SEVERITY.WARNING, () => {
      if (!doc.stairs?.length) return;
      const sc = checkStairs(doc); let allOk = true;
      for (const s of sc.stairs) for (const c of s.checks) {
        if (c.status === 'ok') continue; allOk = false;
        add('stairs', `${s.id}:${c.id}`, c.status === 'fail' ? SEVERITY.WARNING : SEVERITY.INFO, c.status === 'fail' ? STATE.VIOLATED : STATE.UNVERIFIED, `الدرج: ${c.label}`, `${s.levelName}: ${c.label} ${c.valueAr} مقابل ${c.limitAr} (${c.clause}) — ${c.status === 'fail' ? 'لا يحقق الحكم العام؛ الاستثناءات السكنية غير متحقق منها' : 'لم يُقس'}.`, { clause: c.clause, value: c.value, limit: c.limit, source: sc.source }, L.loc({ stairIds: [s.id], label: s.levelName }));
      }
      if (allOk) add('stairs', 'ok', SEVERITY.INFO, STATE.VERIFIED, 'الدرج', `كل أبعاد الدرج تحقق الأحكام العامة (${sc.source}).`, {}, L.loc({ stairIds: doc.stairs.map(s => s.id), label: 'الدرج' }));
    });

    // 8) opening-aware لكل دور (قراءة من النموذج المحوَّل لكل دور)
    guard('openings', 'الفتحات', SEVERITY.INFO, () => {
      for (const lv of model.levels) {
        if (!doc.walls.some(w => w.level === lv.level.id)) continue;
        let m; try { m = docToLegacy(doc, { level: lv.level.id }).model; } catch (e) { add('openings', 'unavailable-' + lv.level.id, SEVERITY.INFO, STATE.UNVERIFIED, 'فحص الفتحات', `غير متحقق: تعذّر تحويل ${lv.level.name} للفحص (${e.message}).`, {}, L.loc({ levelId: lv.level.id, scope: 'level', label: lv.level.name })); continue; }
        const a = assessOpenings(m);
        for (const ax of Object.values(a.axes || {})) {
          const rooms = (ax.exposedRoomIds || (ax.evidence || []).map(e => e.roomId).filter(Boolean)).filter(id => model.roomIndex.has(id));
          const bad = ax.status !== 'unavailable' && Number.isFinite(ax.score) && ax.score < 100;
          const state = ax.status === 'unavailable' || ax.status === 'estimated' && !bad ? STATE.UNVERIFIED : bad ? STATE.VIOLATED : STATE.VERIFIED;
          const loc = rooms.length && state !== STATE.VERIFIED ? L.loc({ roomIds: [...new Set(rooms)], label: ax.label }) : L.loc({ levelId: lv.level.id, scope: 'level', label: lv.level.name });
          add('openings', `${ax.key}:${lv.level.id}`, bad ? SEVERITY.WARNING : SEVERITY.INFO, state, ax.label, `${lv.level.name}: ${ax.detail}`, { status: ax.status, score: ax.score ?? null }, loc);
        }
      }
    });

    // 9) متطلبات العميل النصية غير المربوطة بقياس (requirement-evidence): تظهر «غير متحقق» ولا تُحسب نجاحًا
    guard('requirement', 'متطلبات العميل النصية', SEVERITY.WARNING, () => {
      if (!ctx.idea) return;
      const gi = model.levels.findIndex(l => doc.walls.some(w => w.level === l.level.id)); if (gi < 0) return;
      const ev = evaluateRequirementEvidence({ model: docToLegacy(doc, { level: model.levels[gi].level.id }).model, idea: ctx.idea, discovery: ctx.discovery || {} });
      const covered = (req.privacy || []).map(p => String(p.text || '')).filter(Boolean);
      const norm = s => String(s).replace(/\s+/g, ' ').trim();
      for (const row of ev.rows) {
        if (!/^cond:/.test(row.id) || !row.tier) continue;
        if (covered.some(t => norm(t).includes(norm(row.title)) || norm(row.title).includes(norm(t)))) continue;
        // عبارة تخص أحد فحوص الخصوصية الهندسية الثلاثة تُقاس في قسمها؛ لا يُكرَّر «غير متحقق» لها هنا
        const n = normalizeArabic(row.title);
        if (PRIVACY_CLAUSES.some(re => re.test(n))) continue;
        const sev = row.tier === 'MANDATORY' ? SEVERITY.MANDATORY : row.tier === 'IMPORTANT' ? SEVERITY.WARNING : SEVERITY.INFO;
        const state = row.status === 'ENFORCED' ? STATE.VERIFIED : row.status === 'NOT_MET' ? STATE.VIOLATED : STATE.UNVERIFIED;
        add('requirement', row.id, sev, state, row.title, row.evidence, { tier: row.tier, status: row.status, tierBasis: row.tierBasis || null }, planLoc(row.title));
      }
    });

    // 10) قفل الأجزاء المعتمدة
    guard('locks', 'الأجزاء المقفلة', SEVERITY.MANDATORY, () => {
      for (const l of locks) {
        const r = verifyLock(doc, l, model);
        add('locks', l.key, SEVERITY.MANDATORY, r.status === 'kept' ? STATE.VERIFIED : STATE.VIOLATED, `جزء مقفل: ${l.name}`, r.status === 'kept' ? `«${l.name}» بقيت حرفيًا كما اعتمدها العميل.` : `«${l.name}» اعتمدها العميل وتغيّرت: ` + r.violations.map(v => v.detail).slice(0, 3).join(' | '), { key: l.key, violations: r.violations.map(v => ({ kind: v.kind, detail: v.detail })) }, L.loc({ roomIds: roomIdOfLock(model, l), label: l.name }));
      }
    });

    // 11) عزيز لكل دور ثم العلاقات بين الأدوار
    guard('aziz', 'عزيز', SEVERITY.INFO, () => {
      const az = ctxAziz(doc, model, ctx.azizRunner);
      if (az.status !== 'ran') { add('aziz', 'unavailable', SEVERITY.INFO, STATE.UNVERIFIED, 'عزيز: غير متاح', `عزيز: غير متاح — ${az.reason || 'تعذّر التشغيل'}. المراجعة المحلية وحدها هي المعتمدة، ولم يراجع عزيز هذا المخطط.`, { reason: az.reason || null }, planLoc('عزيز')); return; }
      for (const lv of az.levels) {
        if (!lv.evaluated) { add('aziz', 'level-' + lv.levelId, SEVERITY.INFO, STATE.UNVERIFIED, `عزيز: ${lv.levelName}`, `غير متحقق: ${lv.note || 'لم يُقيَّم هذا الدور'}.`, { levelId: lv.levelId }, L.loc({ levelId: lv.levelId, scope: 'level', label: lv.levelName })); continue; }
        if (lv.ok) { add('aziz', 'level-' + lv.levelId, SEVERITY.INFO, STATE.VERIFIED, `عزيز: ${lv.levelName}`, `${lv.levelName}: ${lv.rooms} غرفة بلا تراكب ولا خروج عن حدود المبنى ومضلعاتها صالحة.`, { rooms: lv.rooms }, L.loc({ levelId: lv.levelId, scope: 'level', label: lv.levelName })); continue; }
        lv.violations.forEach((v, i) => add('aziz', `${v.code}:${lv.levelId}:${i}`, SEVERITY.MANDATORY, STATE.VIOLATED, `عزيز: ${v.code}`, `${lv.levelName}: ${v.description}`, { code: v.code, evidence: v.evidence }, L.loc({ roomIds: v.roomIds, levelId: lv.levelId, label: v.code })));
      }
    });
    guard('levels', 'العلاقات بين الأدوار', SEVERITY.WARNING, () => reviewLevelRelations(doc, model, L, add, planLoc));

    // 12) الحياة اليومية (daily-life): مسارات الضيف والأسرة والطعام والحمامات والأثاث والانكشاف. تحذير/معلومة فقط؛ لا شرط إلزامي جديد.
    guard('daily', 'الحياة اليومية', SEVERITY.INFO, () => {
      const dl = analyzeDailyLife(doc, { model });
      for (const it of dl.items) {
        const severity = it.severity === 'warning' ? SEVERITY.WARNING : SEVERITY.INFO;
        const state = it.state === 'violated' ? STATE.VIOLATED : it.state === 'verified' ? STATE.VERIFIED : STATE.UNVERIFIED;
        const lc = it.loc || {}, ids = (lc.roomIds || []).filter(id => model.roomIndex.has(id));
        const location = ids.length || (lc.segments || []).length || (lc.points || []).length ? L.loc({ roomIds: ids, segments: lc.segments || [], points: lc.points || [], label: lc.label || it.title }) : planLoc(lc.label || it.title);
        add('daily', it.code, severity, state, it.title, it.reason, it.evidence, location);
      }
    });
  }

  // ------------------------------------------------------------------------------------------ الملخص
  const counts = { mandatory: { violated: 0, unverified: 0, verified: 0 }, warning: { violated: 0, unverified: 0, verified: 0 }, info: { violated: 0, unverified: 0, verified: 0 } };
  for (const f of findings) counts[f.severity][f.state]++;
  const lockInfo = { count: locks.length, kept: findings.filter(f => f.source === 'locks' && f.state === STATE.VERIFIED).length, violated: findings.filter(f => f.source === 'locks' && f.state === STATE.VIOLATED).length, keys: locks.map(l => ({ key: l.key, labelId: l.labelId, name: l.name, type: l.type, levelIndex: l.levelIndex })) };
  const azF = findings.filter(f => f.source === 'aziz');
  const aziz = !azF.length ? { status: 'unavailable', reason: 'لم تُشغَّل' } : azF.some(f => f.id === 'aziz:unavailable') ? { status: 'unavailable', reason: azF.find(f => f.id === 'aziz:unavailable').evidence.reason } : { status: 'ran', engine: 'AZIZ evaluateHardConstraints (محلي)', levels: azF.filter(f => /^aziz:level-|^aziz:[A-Z_]+:/.test(f.id)).length };
  const blocked = counts.mandatory.violated > 0, needsDecision = !blocked && counts.mandatory.unverified > 0;
  const summary = { counts, verdict: blocked ? 'blocked' : needsDecision ? 'needs_decision' : 'clear_with_limits',
    verdictAr: blocked ? `مخالفات إلزامية (${counts.mandatory.violated}): لا يُعتمد المخطط` : needsDecision ? `شروط إلزامية غير متحقق منها (${counts.mandatory.unverified}): تلزم موافقتك الصريحة على كل منها` : 'لا مخالفة إلزامية مقيسة؛ ما بقي تحذيرات أو غير متحقق غير إلزامي. المراجعة أولية.',
    total: findings.length };
  return {
    version: REVIEW_VERSION, route: ctx.route || null, routeAr: ROUTE_AR[ctx.route] || null, ...ver, disclaimer: DISCLAIMER,
    docTitle: doc.title || '', levels: doc.levels.map(l => ({ id: l.id, name: l.name })), findings, summary, locks: lockInfo, aziz,
    readOnly: true, idsPreserved: true,
  };
}

// تفاصيل مساعدة -------------------------------------------------------------------------------------------------
function roomIdOfLock(model, l) { const lv = model.levels[l.levelIndex]; const r = lv?.rooms.find(x => x.id === l.labelId) || lv?.rooms.find(x => !x.unlabelled && x.name === l.name && x.type === l.type); return r ? [r.id] : []; }
function ctxAziz(doc, model, runner) { try { return (runner || azizReviewLevels)(doc, { model }); } catch (e) { return { status: 'unavailable', reason: String(e?.message || e).slice(0, 240), levels: [] }; } }

/** العلاقات بين الأدوار: الدرج وفتحاته وارتفاعاته، الأعمدة المبللة، دعم الغرف العلوية، محاذاة الأعمدة. تحذيرات (لا شروط إلزامية جديدة). */
function reviewLevelRelations(doc, model, L, add, planLoc) {
  const levels = model.levels;
  if (levels.length < 2) { if (doc.stairs?.length) add('levels', 'single-level-stair', SEVERITY.INFO, STATE.UNVERIFIED, 'علاقات الأدوار', 'في المخطط درج لكن دور واحد فقط؛ لا علاقة بين أدوار تُقاس.', {}, planLoc('الدرج')); return; }
  // المناسيب: منسوب كل دور = مجموع ارتفاعات ما تحته
  let z = 0, badLevels = [];
  doc.levels.forEach(l => { if (Math.abs((l.elevation ?? 0) - z) > .011) badLevels.push(l); z += l.height || 0; });
  if (badLevels.length) add('levels', 'elevations', SEVERITY.WARNING, STATE.VIOLATED, 'مناسيب الأدوار', badLevels.map(l => `${l.name}: منسوبها ${num(l.elevation ?? 0)} م لا يساوي مجموع ارتفاعات ما تحتها`).join('؛ ') + '.', { levels: badLevels.map(l => l.id) }, L.loc({ levelId: badLevels[0].id, scope: 'level', label: badLevels[0].name }));
  else add('levels', 'elevations', SEVERITY.INFO, STATE.VERIFIED, 'مناسيب الأدوار', 'منسوب كل دور = مجموع ارتفاعات الأدوار التي تحته.', { levels: doc.levels.map(l => [l.id, l.elevation, l.height]) }, planLoc('الأدوار'));
  // الدرج وفتحته: لكل درج في دور غير أعلى: فتحة الدرج (hole) داخل غرفة واحدة في الدور الأعلى بلا جدار يقطعها
  doc.levels.forEach((lvl, i) => {
    const next = levels[i + 1]; const sts = doc.stairs.filter(s => s.level === lvl.id);
    for (const s of sts) {
      if (!next) { add('levels', `stair-top-${s.id}`, SEVERITY.INFO, STATE.UNVERIFIED, 'الدرج في الدور الأعلى', `الدرج ${s.id} في ${lvl.name} ولا دور فوقه؛ لم تُقس فتحته.`, { stairId: s.id }, L.loc({ stairIds: [s.id], label: lvl.name })); continue; }
      if (!next.rooms.length) { add('levels', `stair-landing-${s.id}`, SEVERITY.WARNING, STATE.UNVERIFIED, 'فتحة الدرج في الدور الأعلى', `غير متحقق: ${next.level.name} بلا غرف مغلقة لقياس هبوط الدرج فيها.`, { stairId: s.id }, L.loc({ stairIds: [s.id], label: s.id })); continue; }
      let hole = null, rise = (doc.levels[i + 1].elevation ?? 0) - (lvl.elevation ?? 0) || lvl.height || 3.2;
      try { hole = stairLayout(s, rise).hole; } catch { hole = null; }
      if (!hole || hole.length < 3) { add('levels', `stair-landing-${s.id}`, SEVERITY.WARNING, STATE.UNVERIFIED, 'فتحة الدرج في الدور الأعلى', `غير متحقق: تعذّر حساب فتحة الدرج ${s.id}.`, { stairId: s.id }, L.loc({ stairIds: [s.id], label: s.id })); continue; }
      const pts = sampleInPoly(hole, .2), rooms = new Set(); let outside = 0, inWall = 0;
      const walls = doc.walls.filter(w => w.level === next.level.id);
      const nearWall = p => walls.some(w => { const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / L2)); return Math.hypot(p.x - (w.a.x + t * dx), p.y - (w.a.y + t * dy)) < (w.t || .2) / 2 - .01; });
      for (const p of pts) { const r = next.roomAt(p); if (!r) outside++; else rooms.add(r.id); if (nearWall(p)) inWall++; }
      // جدار يقطع الفتحة بين عيّنات الشبكة: نقيس على امتداد كل جدار نفسه
      for (const w of walls) { const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), n = Math.max(2, Math.ceil(len / .05)); let hit = 0; for (let k = 0; k <= n; k++) { const q = { x: w.a.x + (w.b.x - w.a.x) * k / n, y: w.a.y + (w.b.y - w.a.y) * k / n }; if (pointInPolygon(q, hole)) hit += len / n; } if (hit > .3) inWall++; }
      const where = L.loc({ stairIds: [s.id], roomIds: [...rooms], levelId: lvl.id, label: `فتحة الدرج ${s.id}` });
      if (!pts.length) add('levels', `stair-landing-${s.id}`, SEVERITY.WARNING, STATE.UNVERIFIED, 'فتحة الدرج في الدور الأعلى', 'غير متحقق: فتحة الدرج أصغر من أن تُقاس بالعيّنات.', { stairId: s.id }, where);
      else if (outside || inWall || rooms.size > 1) add('levels', `stair-landing-${s.id}`, SEVERITY.WARNING, STATE.VIOLATED, 'فتحة الدرج في الدور الأعلى', `فتحة الدرج ${s.id} من ${lvl.name} ${outside ? 'تقع جزئيًا خارج أي غرفة' : ''}${inWall ? (outside ? ' و' : '') + 'يقطعها جدار' : ''}${rooms.size > 1 ? ((outside || inWall) ? ' و' : '') + 'تمتد على أكثر من غرفة' : ''} في ${next.level.name}.`, { stairId: s.id, outside, inWall, rooms: [...rooms] }, where);
      else add('levels', `stair-landing-${s.id}`, SEVERITY.WARNING, STATE.VERIFIED, 'فتحة الدرج في الدور الأعلى', `فتحة الدرج ${s.id} تهبط كاملة داخل غرفة واحدة في ${next.level.name} بلا جدار يقطعها.`, { stairId: s.id, room: [...rooms][0] }, where);
    }
    if (next && !sts.length && !doc.stairs.some(s => s.level === lvl.id)) add('levels', `no-stair-${lvl.id}`, SEVERITY.WARNING, STATE.UNVERIFIED, 'الدرج بين الأدوار', `غير متحقق: لا درج مرسوم في ${lvl.name} يصل إلى ${next.level.name}.`, { levelId: lvl.id }, L.loc({ levelId: lvl.id, scope: 'level', label: lvl.name }));
  });
  // الأعمدة المبللة: الغرف المبللة العلوية فوق مبللة (المعيار نفسه في quality: مركزها ضمن 2.5 م) — توافق مساقط لا مسارات مواسير
  const wet = lv => lv.rooms.filter(r => !r.unlabelled && WET.has(r.type));
  for (let i = 1; i < levels.length; i++) {
    const below = wet(levels[i - 1]), above = wet(levels[i]); if (!above.length) continue;
    const un = above.filter(u => !below.some(g => Math.hypot(u.centroid.x - g.centroid.x, u.centroid.y - g.centroid.y) <= 2.5));
    if (!below.length) add('levels', `wet-${levels[i].level.id}`, SEVERITY.WARNING, STATE.UNVERIFIED, 'الأعمدة المبللة', `غير متحقق: لا غرف مبللة في ${levels[i - 1].level.name} للمقارنة.`, {}, L.loc({ roomIds: above.map(r => r.id), label: 'غرف مبللة علوية' }));
    else if (un.length) add('levels', `wet-${levels[i].level.id}`, SEVERITY.WARNING, STATE.VIOLATED, 'الأعمدة المبللة', `${un.length} من ${above.length} غرف مبللة في ${levels[i].level.name} لا تعلو غرفة مبللة في ${levels[i - 1].level.name} (المقيس: بُعد المراكز ≤ 2.5 م؛ مسارات المواسير غير ممثلة في الرسم): ${un.map(r => '«' + r.name + '»').join('، ')}.`, { rooms: un.map(r => r.id) }, L.loc({ roomIds: un.map(r => r.id), label: 'غرف مبللة غير متراصة' }));
    else add('levels', `wet-${levels[i].level.id}`, SEVERITY.INFO, STATE.VERIFIED, 'الأعمدة المبللة', `كل الغرف المبللة في ${levels[i].level.name} (${above.length}) تعلو غرفة مبللة في ${levels[i - 1].level.name} (مقيس بتقارب المراكز فقط).`, {}, L.loc({ roomIds: above.map(r => r.id), label: 'غرف مبللة علوية' }));
  }
  // دعم الغرف العلوية: نسبة مساحة الغرفة العلوية الواقعة فوق مسقط الدور الأدنى (قياس مساقط؛ لا تحقق إنشائي)
  for (let i = 1; i < levels.length; i++) {
    const outs = (levels[i - 1].analysis.outlines || []).map(o => o.polygon);
    if (!outs.length) { add('levels', `support-${levels[i].level.id}`, SEVERITY.WARNING, STATE.UNVERIFIED, 'دعم الغرف العلوية', `غير متحقق: لا مسقط مغلق في ${levels[i - 1].level.name}.`, {}, L.loc({ levelId: levels[i].level.id, scope: 'level', label: levels[i].level.name })); continue; }
    const over = [];
    for (const r of levels[i].rooms) {
      if (r.unlabelled || !r.net || OPEN_TYPES.has(r.type) || !BEARING_TYPES.has(r.type)) continue;
      const pts = sampleInPoly(r.net, .25); if (!pts.length) continue;
      const out = pts.filter(p => !outs.some(o => pointInPolygon(p, o))).length, share = out / pts.length;
      if (share > .02) over.push({ id: r.id, name: r.name, share: r2(share), area: r2(share * r.area) });
    }
    if (over.length) add('levels', `support-${levels[i].level.id}`, SEVERITY.WARNING, STATE.VIOLATED, 'دعم الغرف العلوية', `غرف في ${levels[i].level.name} تبرز عن مسقط ${levels[i - 1].level.name}: ` + over.map(o => `«${o.name}» نحو ${num(o.area)} م²`).join('؛ ') + '. قياس مساقط فقط، لا تحقق إنشائي.', { over }, L.loc({ roomIds: over.map(o => o.id), label: 'بروز علوي' }));
    else add('levels', `support-${levels[i].level.id}`, SEVERITY.INFO, STATE.VERIFIED, 'دعم الغرف العلوية', `كل الغرف الرئيسية في ${levels[i].level.name} تقع ضمن مسقط ${levels[i - 1].level.name} (قياس مساقط فقط).`, {}, L.loc({ levelId: levels[i].level.id, scope: 'level', label: levels[i].level.name }));
  }
  // محاذاة الأعمدة بين الأدوار
  const cols = doc.columns || [];
  if (!cols.length) add('levels', 'columns', SEVERITY.INFO, STATE.UNVERIFIED, 'محاذاة الأعمدة', 'غير متحقق: لا أعمدة مرسومة في المخطط، فلا محاذاة تُقاس. لا ادعاء في الإنشاء.', {}, planLoc('الأعمدة'));
  else {
    const mis = [];
    for (let i = 1; i < doc.levels.length; i++) for (const c of cols.filter(c => c.level === doc.levels[i].id)) if (!cols.some(d => d.level === doc.levels[i - 1].id && Math.hypot(d.x - c.x, d.y - c.y) <= .15)) mis.push(c);
    if (mis.length) add('levels', 'columns', SEVERITY.WARNING, STATE.VIOLATED, 'محاذاة الأعمدة', `${mis.length} عمودًا علويًا لا عمود تحته ضمن 15 سم. المقيس إحداثيات الأعمدة المرسومة فقط.`, { columns: mis.map(c => c.id) }, L.loc({ points: mis.map(c => ({ x: c.x, y: c.y, level: c.level })), label: 'أعمدة غير محاذية' }));
    else add('levels', 'columns', SEVERITY.INFO, STATE.VERIFIED, 'محاذاة الأعمدة', 'كل عمود علوي يعلو عمودًا في الدور الأدنى (ضمن 15 سم). لا تحقق إنشائي.', {}, planLoc('الأعمدة'));
  }
}

// ------------------------------------------------------------------------------------------ الاعتماد
/** قرار صريح على بند إلزامي غير متحقق: { id, accept:true, note }. تقبل أيضًا قائمة معرّفات. */
const decisionIds = decisions => new Set((decisions || []).map(d => (typeof d === 'string' ? d : d?.accept === false ? null : d?.id)).filter(Boolean));
/** يعيد قائمة ما يمنع الاعتماد: مخالفات إلزامية، تقرير قديم، وبنود إلزامية غير متحقق منها بلا قرار صريح. */
export function approvalBlockers(report, { currentVersion = null, decisions = [] } = {}) {
  const blockers = [], ok = decisionIds(decisions);
  if (currentVersion && report.planVersion !== currentVersion) blockers.push({ code: 'REPORT_STALE', message: 'التقرير يخص نسخة أخرى من المخطط؛ أعد المراجعة.', findings: [] });
  const viol = report.findings.filter(f => f.severity === SEVERITY.MANDATORY && f.state === STATE.VIOLATED);
  if (viol.length) blockers.push({ code: 'MANDATORY_VIOLATED', message: `${viol.length} مخالفة لشرط إلزامي.`, findings: viol.map(f => ({ id: f.id, title: f.title, reason: f.reason, location: f.location })) });
  const unv = report.findings.filter(f => f.severity === SEVERITY.MANDATORY && f.state === STATE.UNVERIFIED && !ok.has(f.id));
  if (unv.length) blockers.push({ code: 'MANDATORY_UNVERIFIED_NEEDS_DECISION', message: `${unv.length} شرطًا إلزاميًا تعذّر التحقق منه ويحتاج قرارًا صريحًا.`, findings: unv.map(f => ({ id: f.id, title: f.title, reason: f.reason, location: f.location })) });
  return blockers;
}
/**
 * اعتماد نسخة: يُرفض (refused) إن وُجدت مخالفة إلزامية، أو كان التقرير المرفق قديمًا (لنسخة أخرى)، أو بقي شرط إلزامي غير متحقق بلا قرار صريح.
 * لا يتغيّر المستند. النجاح يعيد approval مربوطًا بالنسخة وبالقرارات المقبولة؛ ليس اعتمادًا تنفيذيًا.
 */
export function approveDesign(doc, ctx = {}, { report = null, decisions = [] } = {}) {
  const now = planVersion(doc, ctx), fresh = reviewDesign(doc, ctx);
  const stale = !!report && report.planVersion !== now.planVersion;
  const blockers = approvalBlockers(fresh, { decisions });
  if (stale) blockers.unshift({ code: 'REPORT_STALE', message: 'التقرير المرفق يخص نسخة أخرى من المخطط؛ أُعيدت المراجعة على النسخة الحالية.', findings: [] });
  if (blockers.length) return { status: 'refused', refused: true, reasons: blockers, report: fresh, staleReport: stale };
  const ok = decisionIds(decisions);
  return { status: 'approved', refused: false, reasons: [], report: fresh, approval: { planVersion: fresh.planVersion, geometryHash: fresh.geometryHash, route: ctx.route || null, acceptedUnverified: fresh.findings.filter(f => f.severity === SEVERITY.MANDATORY && f.state === STATE.UNVERIFIED && ok.has(f.id)).map(f => ({ id: f.id, title: f.title, reason: f.reason })), disclaimer: DISCLAIMER } };
}

// ------------------------------------------------------------------------------------------ البوابة الواحدة
const GATE_LOG = [];
/** يمسح سجل البوابة (للاختبارات). */
export function gateLogReset() { GATE_LOG.length = 0; }
export const gateLog = () => GATE_LOG.map(x => ({ ...x }));
/**
 * نقطة العبور الوحيدة: كل ناتج هندسي (أول، بديل، دمج، يدوي، محادثة) يمرّ هنا قبل أن يُعرض أو يُعتمد.
 * تعيد التقرير ولا تغيّر المستند ولا معرّفاته. مسار غير معروف يُرفض فلا يُنسى مسار.
 */
export function reviewGate({ route, doc, ctx = {} }) {
  if (!ROUTES.includes(route)) throw Error('GATE_UNKNOWN_ROUTE: ' + route);
  const report = reviewDesign(doc, { ...ctx, route });
  GATE_LOG.push({ route, planVersion: report.planVersion, geometryHash: report.geometryHash });
  if (GATE_LOG.length > 500) GATE_LOG.splice(0, GATE_LOG.length - 500);
  return report;
}
/** سياق المراجعة من جلسة التصميم. */
export function ctxOfSession(session) {
  const input = session?.input || {};
  return { requirements: input.requirements || null, land: input.land || null, entry: input.land?.entries?.[0] || null, idea: input.idea || '', discovery: input.discovery || null, locks: session?.locks || [] };
}
/** ختم مختصر على تصميم في الجلسة: يمرّ عبر البوابة ويحفظ نسخة التقرير وملخصه (لا الملاحظات كلها) ليبقى حجم الجلسة صغيرًا. */
export function stampDesign(session, index, route) {
  const d = session.designs?.[index]; if (!d) return null;
  try {
    const doc = parseDoc(d.doc), report = reviewGate({ route, doc, ctx: ctxOfSession(session) });
    d.review = { v: REVIEW_VERSION, route, planVersion: report.planVersion, geometryHash: report.geometryHash, verdict: report.summary.verdict, counts: report.summary.counts };
    return report;
  } catch (e) {
    d.review = { v: REVIEW_VERSION, route, planVersion: null, error: String(e?.message || e).slice(0, 200) }; // الفشل يُسجَّل ولا يكسر مسار التصميم؛ الواجهة تعرضه «تعذّرت المراجعة»
    return null;
  }
}
/** هل تقرير الجلسة المحفوظ للتصميم يخص نسخته الحالية فعلًا؟ */
export function storedReviewMatches(session, index, doc) {
  const d = session.designs?.[index]; if (!d?.review) return false;
  return d.review.planVersion === planVersion(doc, ctxOfSession(session)).planVersion;
}
/** مراجعة نموذج قديم (المحرر الهندسي legacy) بعد تعديل يدوي: يُحوَّل إلى مستند للقراءة فقط ثم يمرّ عبر البوابة. */
export function reviewLegacyModel(model, ctx = {}, route = 'manual') {
  let doc;
  try { doc = legacyToDoc(model, { title: 'نموذج المحرر الهندسي' }).doc; }
  catch (e) { throw Error('REVIEW_LEGACY_CONVERT: ' + (e.message || e)); }
  return reviewGate({ route, doc, ctx });
}

export default { REVIEW_VERSION, DISCLAIMER, ROUTES, reviewDesign, planVersion, approveDesign, approvalBlockers, reviewGate, stampDesign, storedReviewMatches, reviewLegacyModel, ctxOfSession, reviewEnforced };
