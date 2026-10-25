// محرك المراجعة المستقل (plan-review): يحكم على مستند رسم منتهٍ (mizan-draw/1) وعلى طلب العميل فقط،
// ولا يقرأ شيئًا من حالة المولّد (لا ledger ولا mode ولا ترتيب). المولّد لا يقيّم نفسه هنا.
//
//  1) بوابات صلبة (نجاح/رسوب) لكل منها سبب عربي وقيمة مقيسة وعتبة ومصدر العتبة.
//  2) درجة 0–100 منفصلة عن البوابات، مفككة إلى مكوّنات (الحركة، الإضاءة، عمق الخصوصية، وضوح النطاقات،
//     جودة النسب، ملاءمة الأثاث)، ومعها AZIZ وMizan Score كمكوّنين بوزن حُدد بعد قياس ارتباطهما بالبوابات
//     على مجموعة الأدلة «قبل» (انظر EXTERNAL_WEIGHTS وdocs/research/plan-review-before.md).
//  3) reviewDesigns(docs, request) يرتّب: الناجح في البوابات أولًا ثم بالدرجة. rejectionTable للواجهة.
//
// كل الهندسة من analyzeDoc (dist/draw/digest.mjs): الغرف، والفتحات بجانبيها، ورسم الحركة عبر الأبواب،
// والوصول من المدخل أو من السلم. لا قيمة نظامية تُدّعى بلا مصدر محقق: كل عتبة تحمل `source` و`verified`.
import { briefMajlisDoor } from './shared-brief.mjs';
import { analyzeDoc, isWindowKind } from './draw/digest.mjs';
import { ROOM_TYPES } from './draw/catalog.mjs';
import { reviewDoc, wallRect, swingBlockers, GUIDELINES } from './draw/review.mjs';
import { pointInPolygon, ccw, sub, norm, dot } from './draw/geom.mjs';
import { docToLegacy } from './draw/export-legacy.mjs';
import { calculateMizanScore } from './mizan-score.mjs';
import { rankByDNA } from './design-dna.mjs';
import { validatePlot } from './planner.mjs';
import { extractRequirements } from './requirements.mjs';
import { archDifference, archSignature, THRESHOLDS as ARCH_THRESHOLDS, archSignatureV2, archDifferenceV2, explainDifference, SUBSTANTIVE_V2, DIM_AR as DIM_V2_AR } from './arch-difference.mjs';
import { checkStair, STAIR_RULES, stairClientRules } from './stair-geometry.mjs';
import { structuralPrecheck, PRECHECK_DISCLAIMER } from './structural-precheck.mjs';
import { circulationGate, CIRC_GATE_LIMITS } from './circulation-proof.mjs';
import { openingConsistency } from './draw/wall-geometry.mjs';
import { SAUDI_GATES, measureSaudiProgram } from './saudi-program.mjs';
import { SETBACK_NEIGHBOUR, SETBACK_FRONT, COVERAGE_MAX, GLAZING_MIN, frontSetbackFor } from './regulations-sa.mjs';
import { plotArea as polyAreaOf } from './site-parking.mjs';
import { clientGlazing, GLAZING_CLIENT_AR } from './glazing.mjs';

export const PLAN_REVIEW_VERSION = 'plan-review/1.5.0'; // الجولة الثالثة عشرة: بوابتا الارتدادات النظامية (الجار 1.5 م، الأمامي خُمس عرض الشارع) ونسبة البناء 75% بطبقة «اشتراط نظامي متحقق» بمصدرهما، وملاحظة الزجاج 8% النظامية المحتملة (لا بوابة)؛ // الجولة الثانية عشرة: بوابات البرنامج السعودي والموقع والمناخ (شرط العميل بوابة، والافتراضي ملاحظة)
export const UNVERIFIED_AR = 'قيمة تصميمية غير متحققة نظاميًا';
export const MIZAN_DEFAULT_AR = 'قيمة تصميمية افتراضية للميزان';
/**
 * (الجولة العاشرة، توجيه المالك) طبقة كل عتبة: شرط العميل يغلب الافتراضي دائمًا؛ والافتراضي لا يصير «نظاميًا» إلا بمصدر متحقق.
 *  client: ما كتبه العميل أو أدخله (الأعداد، المواضع، الأرض)؛ mizan-default: قيم الميزان الافتراضية (غير متحققة نظاميًا)؛
 *  regulation: اشتراط نظامي متحقق بمصدر (منذ الجولة الثانية عشرة: عدد المواقف PARKING)؛ functional: منطق وظيفي أو هندسي بلا عتبة رقمية.
 */
export const TIER_AR = Object.freeze({ client: 'شرط العميل', 'mizan-default': MIZAN_DEFAULT_AR, regulation: 'اشتراط نظامي متحقق', functional: 'منطق وظيفي (لا عتبة رقمية)' });
export const GATE_TIER = Object.freeze({
  REACH: 'functional', DAYLIGHT: 'mizan-default', MIN_WIDTH: 'mizan-default', HALL_ASPECT: 'mizan-default', WET_DOOR: 'mizan-default',
  GUEST_ROUTE: 'mizan-default', BED_MAJLIS: 'mizan-default', STAIRS: 'functional', STAIR_GEOMETRY: 'mizan-default', MAJLIS_PRIVACY: 'mizan-default',
  PLOT: 'client', PROGRAM: 'client', INTEGRITY: 'functional', DOOR_SWING: 'functional', WINDOW_SIZE: 'mizan-default', PLACEMENT: 'client', DISTINCT: 'mizan-default',
  // (الجولة الثالثة عشرة) اشتراطات نظامية متحققة (المستوى أ) بمصدرها: الارتدادات ونسبة البناء
  SETBACK_REG: 'regulation', COVERAGE: 'regulation',
  // (الجولة الحادية عشرة) البوابات «الثقيلة»: المراجعة الإنشائية المبدئية، والحركة الفعلية، والتطابق 2D/3D
  STRUCTURAL: 'mizan-default', CIRCULATION: 'functional', CONSISTENCY_2D3D: 'functional',
});
/** البوابات الثقيلة (أبطأ: شبكة مشي وأعمدة ومجسّم الجدران): reviewDesign يحسبها افتراضيًا؛ evaluateGates لا يحسبها إلا بطلب (heavy). */
export const HEAVY_GATES = Object.freeze(['STRUCTURAL', 'CIRCULATION', 'CONSISTENCY_2D3D']);

const MOMAH_URL = 'https://momah.gov.sa/sites/default/files/2024-07/ashtratat%20a%27nsha%20almbany%20alsknyt%20almnshwrt%20%60ly%20mwq%60%20alwzart%20.pdf';
const MOMAH_NOTE = 'اشتراطات إنشاء المباني السكنية (وزارة البلديات والإسكان 1446هـ) — النص المستخرج آليًا مشوّه في مواضع ولم يُطابَق يدويًا بعد (docs/research/competitors-saudi-2026-10-19.md)';

/**
 * أدنى عرض صافٍ لكل نوع غرفة (م). القيم مرشّحة من ملف الوزارة لكنها «يُراجع» في بحث المنافسين،
 * فتبقى كلها verified:false وتُعلَن «قيمة تصميمية غير متحققة نظاميًا» حتى يطابقها مهندس يدويًا.
 */
export const MIN_CLEAR_WIDTH = Object.freeze({
  living:   { min: 2.8, source: MOMAH_NOTE + ' — «معيشة أو طعام أو صالة: عرض 2.8م»', url: MOMAH_URL, verified: false },
  dining:   { min: 2.8, source: MOMAH_NOTE + ' — «معيشة أو طعام أو صالة: عرض 2.8م»', url: MOMAH_URL, verified: false },
  majlis:   { min: 2.8, source: MOMAH_NOTE + ' — المجلس عومل كفراغ معيشة (2.8م)؛ لا بند مستقل للمجلس', url: MOMAH_URL, verified: false },
  bedroom:  { min: 2.1, source: MOMAH_NOTE + ' — «نوم: عرض 2.1م»', url: MOMAH_URL, verified: false },
  master:   { min: 2.1, source: MOMAH_NOTE + ' — «نوم: عرض 2.1م»', url: MOMAH_URL, verified: false },
  service:  { min: 2.1, source: MOMAH_NOTE + ' — «غرفة سائق أو عاملة: عرض 2.1م»', url: MOMAH_URL, verified: false },
  office:   { min: 2.1, source: 'لا بند للمكتب؛ عومل كغرفة نوم (2.1م) — ' + MOMAH_NOTE, url: MOMAH_URL, verified: false },
  kitchen:  { min: 1.8, source: MOMAH_NOTE + ' — «مطبخ: عرض 1.8م»', url: MOMAH_URL, verified: false },
  bath:     { min: 1.4, source: MOMAH_NOTE + ' — «حمام: عرض 1.4م» (حمام فيه دش أو حوض)', url: MOMAH_URL, verified: false },
  wc:       { min: 1.0, source: MOMAH_NOTE + ' — «مرحاض: عرض 1م» (دورة مياه بلا دش ولا حوض)', url: MOMAH_URL, verified: false },
  corridor: { min: 0.9, source: MOMAH_NOTE + ' — «ممرات داخلية: عرض 0.90م»', url: MOMAH_URL, verified: false },
});

/** عتبات البوابات والدرجة التي لا مصدر نظاميًا لها: قيم تصميمية معلنة. */
export const DESIGN_THRESHOLDS = Object.freeze({
  hallAspectMax: { value: 2.5, source: 'تكليف المالك (نسبة الصالة ≤ 2.5:1)', verified: false },
  roomAspectGood: { value: 1.6, source: 'قيمة تصميمية للدرجة فقط', verified: false },
  roomAspectBad: { value: 3.0, source: 'قيمة تصميمية للدرجة فقط', verified: false },
  circulationBand: { value: [6, 15], source: 'نطاق تصميمي للدرجة فقط (نسبة الممرات والمداخل من الصافي)', verified: false },
  windowToFloor: { value: GUIDELINES.windowToFloor, source: 'GUIDELINES.windowToFloor في dist/draw/review.mjs (إرشادي)', verified: false },
  privacyDepthGood: { value: 3, source: 'قيمة تصميمية: ثلاثة أبواب بين مدخل الضيوف وغرفة النوم', verified: false },
  setbackTolerance: { value: 0.02, source: 'سماحية قياس 2 سم', verified: false },
  // أُضيفت بعد إثبات الرفض (scripts/defect-corpus.mjs، evidence/review-proof/): عيوب كانت تمرّ بدرجة مرتفعة
  windowToFloorMin: { value: 0.03, source: 'حد أدنى تصميمي للبوابة (نافذة صغيرة جدًا) = 30٪ من النسبة الإرشادية 10٪ (GUIDELINES.windowToFloor)؛ أدنى قيمة في بدائل after-4 الناجحة 4.9٪، ومرشحو المولّد يصلون إلى 3.5–3.9٪ لصالات كبيرة بنافذة واحدة (ملاحظة للمولّد، تبقى في مكوّن الإضاءة بالدرجة). المرجع الدولي IBC §1204.2 (8٪) غير متحقق من تبنيه في الكود السعودي', verified: false },
  orphanSpaceMin: { value: 1.0, source: 'فراغ مغلق بلا تسمية أكبر من 1 م² = غرفة مرسومة فوق أخرى أو بقايا جدران (أصغر منه فراغات تقنية)', verified: false },
  placementHalf: { value: 0.5, source: 'قيمة تصميمية متساهلة: «في الخلف» = مركز الغرفة في النصف الخلفي من عمق المبنى من شارع المدخل، و«في الأمام» = النصف الأمامي؛ و«على الشارع/يطل على الحوش الخلفي» = جدار خارجي ≥ 1 م يواجه تلك الجهة', verified: false },
  distinctMin: { value: ARCH_THRESHOLDS.cosmetic, source: 'dist/arch-difference.mjs: أقل من هذا = نفس التنظيم (نسخة معكوسة أو شكلية)؛ معايَر على أدلة «قبل» و«after-4»', verified: false },
});
/** قطع أثاث مثبتة (سباكة ومطبخ) إن اعترضت فتح باب فهو عيب في التصميم لا في ترتيب الأثاث. */
export const FIXED_FIXTURES = Object.freeze(['wc', 'basin', 'shower', 'bathtub', 'kitchen-run', 'stove', 'fridge']);

/** الغرف المعيشية التي يجب أن تكون لها نافذة خارجية أو على فناء (تكليف المالك + غرفة الخادمة لأنها غرفة نوم). */
export const HABITABLE_TYPES = Object.freeze(['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'office', 'service']);
const BED_TYPES = new Set(['bedroom', 'master']);
const SIDE_AR = { n: 'الشمال', s: 'الجنوب', e: 'الشرق', w: 'الغرب' };
const WET_TYPES = new Set(['bath']);                       // دورات المياه؛ الغسيل مستثنى (مجاورته للمطبخ مقبولة)
const NO_WET_DOOR = new Set(['kitchen', 'dining', 'majlis']);
const CIRC_TYPES = new Set(['corridor', 'entrance']);

export const GATES = Object.freeze([
  { id: 'REACH', ar: 'كل الغرف يُوصل إليها من المدخل' },
  { id: 'DAYLIGHT', ar: 'نافذة خارجية أو على فناء لكل غرفة معيشية' },
  { id: 'MIN_WIDTH', ar: 'أدنى عرض صافٍ لكل نوع غرفة' },
  { id: 'HALL_ASPECT', ar: 'نسبة طول الصالة إلى عرضها ≤ 2.5' },
  { id: 'WET_DOOR', ar: 'دورات المياه لا تفتح على المطبخ أو الطعام أو المجلس' },
  { id: 'GUEST_ROUTE', ar: 'مسار الضيوف إلى المجلس لا يمر بالصالة أو النوم' },
  { id: 'BED_MAJLIS', ar: 'لا غرفة نوم تفتح على المجلس مباشرة' },
  { id: 'STAIRS', ar: 'السلم يُوصل إليه عند وجود دورين' },
  { id: 'STAIR_GEOMETRY', ar: 'السلم يتسع في غرفته بقوائم ونوائم وعرض وبسطة سليمة، ويُوصل إليه أسفله وأعلاه' },
  { id: 'MAJLIS_PRIVACY', ar: 'المجلس لا يفتح إلا على مدخله أو مغاسله ودورة مياه الضيوف أو طعام الضيوف أو الخارج' },
  { id: 'PLOT', ar: 'المبنى داخل الأرض وخطوط الارتداد' },
  { id: 'PROGRAM', ar: 'أعداد الغرف المطلوبة موجودة فعلًا في الرسم' },
  { id: 'INTEGRITY', ar: 'كل فراغ مغلق غرفة واحدة مسمّاة (لا غرف متراكبة ولا جدران مفتوحة)' },
  { id: 'DOOR_SWING', ar: 'لا باب يصطدم فتحه بجدار أو بباب آخر أو بعمود' },
  { id: 'WINDOW_SIZE', ar: 'مساحة زجاج الغرفة المعيشية لا تقل عن الحد الأدنى من أرضيتها' },
  { id: 'PLACEMENT', ar: 'مواضع الغرف التي حددها العميل (في الأمام/في الخلف) محققة' },
  // (الجولة الثالثة عشرة) اشتراطات نظامية متحققة بمصدرها (data/regulations-sa.json، المستوى أ)
  { id: 'SETBACK_REG', ar: 'الارتدادات النظامية: ارتداد الجار لا يقل عن 1.5 م، والأمامي خُمس عرض الشارع ولا يقل عن 3 م (6 م لشوارع ≥ 30 م)' },
  { id: 'COVERAGE', ar: 'نسبة البناء في الدور الأرضي لا تتجاوز 75% من مساحة الأرض' },
  { id: 'STRUCTURAL', ar: 'لا ملاحظة جسيمة في المراجعة الإنشائية المبدئية (مراجعة مبدئية لا تصميم إنشائي)' },
  { id: 'CIRCULATION', ar: 'الحركة الفعلية مع الأثاث والدرج: كل غرفة تُبلغ مشيًا، ولا أثاث يسد ممرًا أو بابًا، ولا مرحاض في منطقة فتح الباب' },
  { id: 'CONSISTENCY_2D3D', ar: 'كل فتحة في المسقط موجودة في المجسّم بموضعها وعرضها (لا فتحة تعبر تقاطع جدران)' },
  // (الجولة الثانية عشرة) البرنامج السعودي والموقع والمناخ: بوابة إن طلبه العميل نصًا، وملاحظة إن كان قيمة افتراضية للميزان
  ...SAUDI_GATES,
]);
/** بوابة على مستوى مجموعة البدائل (reviewDesigns مع distinct): البديل ليس نسخة شكلية من بديل أعلى منه. */
export const SET_GATES = Object.freeze([{ id: 'DISTINCT', ar: 'البديل «مختلف معماريًا» (v2: بعدان جوهريان على الأقل من توزيع الوظائف والحركة والخصوصية والعلاقات) عن كل بديل أعلى منه' }]);
const GATE_AR = Object.fromEntries([...GATES, ...SET_GATES].map(g => [g.id, g.ar]));

/**
 * أوزان AZIZ وMizan Score في الدرجة. حُددت بعد قياس الارتباط على evidence/acceptance/before (39 بديلًا،
 * scripts/plan-review-run.mjs). كلاهما ضعيف الاتساق مع البوابات، فوُزن كل منهما 3 من 100 فقط:
 *  - مع عدد البوابات الراسبة: AZIZ r=-0.21 (داخل الحالة -0.20)، Mizan r=-0.28 (داخل الحالة -0.27) — ضعيف.
 *  - مع بوابة نسبة الصالة: r=-0.46 لكليهما — بإشارة معاكسة (يكافئان الصالة-الممر).
 *  - مع نسبة الحركة: 0.94 و0.90 — يقيسان الممرات أساسًا. وAZIZ↔Mizan r=0.96 (شبه متطابقين).
 *  - AZIZ بالبصمة = AZIZ المحايد حرفيًا حين لا إجابات اكتشاف (الأوزان لا تغيّر الترتيب).
 * يُعاد القياس بتشغيل السكربت، ويُعدَّل هذا الوزن يدويًا فقط بعد قراءة النتائج.
 */
export const EXTERNAL_WEIGHTS = Object.freeze({ aziz: 3, mizan: 3 });
export const EXTERNAL_MEASURED = Object.freeze({
  evidence: 'evidence/acceptance/before/*/alt-*.json', n: 39,
  aziz: { failsPearson: -0.21, failsWithinCase: -0.2, internalPearson: 0.48, hallAspectGate: -0.46, circulation: 0.94, verdict: 'غير متسق مع البوابات: وزن منخفض' },
  mizan: { failsPearson: -0.28, failsWithinCase: -0.27, internalPearson: 0.47, hallAspectGate: -0.46, circulation: 0.9, verdict: 'غير متسق مع البوابات: وزن منخفض' },
  azizVsMizan: 0.96,
});
export const SCORE_WEIGHTS = Object.freeze({ circulation: 15, daylight: 20, privacy: 20, zoning: 15, proportion: 15, furniture: 9, ...EXTERNAL_WEIGHTS });
export const COMPONENT_AR = Object.freeze({ circulation: 'نسبة الحركة', daylight: 'الإضاءة الطبيعية', privacy: 'عمق الخصوصية', zoning: 'وضوح النطاقات', proportion: 'جودة النسب', furniture: 'ملاءمة الأثاث', aziz: 'AZIZ (بصمة التصميم)', mizan: 'Mizan Score' });

const r2 = v => Math.round(v * 100) / 100;
const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const roomName = r => `«${r.name}»`;

// ------------------------------------------------------------------------------------------ helpers
function roomDoors(lv, room) {
  const out = [];
  for (const op of lv.openings) {
    if (!op.door) continue;
    const mine = op.sides.find(s => s.room.id === room.id);
    if (mine) out.push({ op, other: mine.other === 'outside' ? null : lv.roomsById.get(mine.other) || null, outside: mine.other === 'outside' || mine.exterior });
  }
  return out;
}
function daylightOf(lv, room) {
  let area = 0, count = 0;
  for (const op of lv.openings) {
    const glazed = op.window || op.kind === 'slider';
    if (!glazed) continue;
    if (op.sides.some(s => s.room.id === room.id && s.exterior)) { area += op.area; count++; }
  }
  return { count, area };
}
const hasFixture = (doc, lv, room, kinds) => doc.fixtures.some(f => f.level === lv.level.id && kinds.includes(f.kind) && lv.roomAt({ x: f.x, y: f.y })?.id === room.id);
function clearWidth(room) { return room.shape === 'rectangle' ? room.rect.w : Math.min(room.rect.w, room.eqWidth); }
function widthRule(doc, lv, room) {
  if (room.type === 'bath') return hasFixture(doc, lv, room, ['shower', 'bathtub']) ? { key: 'bath', ...MIN_CLEAR_WIDTH.bath } : { key: 'wc', ...MIN_CLEAR_WIDTH.wc };
  return MIN_CLEAR_WIDTH[room.type] ? { key: room.type, ...MIN_CLEAR_WIDTH[room.type] } : null;
}
/** ممر أو مدخل يفتح مباشرة على غرفة نوم: جزء من النطاق الخاص. */
function isPrivate(lv, room) {
  if (room.type === 'living' || BED_TYPES.has(room.type)) return true;
  if (CIRC_TYPES.has(room.type)) return roomDoors(lv, room).some(d => d.other && BED_TYPES.has(d.other.type));
  return false;
}
function bfs(lv, starts, allow = () => true) {
  const dist = new Map(), prev = new Map(), q = [];
  for (const s of starts) if (!dist.has(s)) { dist.set(s, 0); q.push(s); }
  while (q.length) {
    const id = q.shift();
    for (const e of lv.graph.get(id) || []) {
      if (dist.has(e.to)) continue;
      const room = lv.roomsById.get(e.to);
      if (!room || !allow(room)) continue;
      dist.set(e.to, dist.get(id) + 1); prev.set(e.to, id); q.push(e.to);
    }
  }
  const path = id => { const p = [id]; while (prev.has(p[0])) p.unshift(prev.get(p[0])); return p; };
  return { dist, path };
}
/** مداخل الضيوف: أبواب المدخل المعلَّمة (أو أي باب خارجي غير المرآب) في الدور الأرضي، وأي باب خارجي يفتح على مجلس. */
function guestStarts(lv) {
  const ids = new Set(lv.entries.map(e => e.room));
  for (const r of lv.rooms) if (r.type === 'majlis' && roomDoors(lv, r).some(d => d.outside && d.op.kind !== 'garage')) ids.add(r.id);
  return [...ids];
}

// --------------------------------------------------------------------------------------------- gates
const SWING_CACHE = new WeakMap();
/** معترضات فتح كل باب (swingBlockers) محسوبة مرة واحدة لكل نموذج: تستعملها بوابة فتح الأبواب ومكوّن الأثاث. */
function swingsOf(model) {
  if (!SWING_CACHE.has(model)) {
    const out = [];
    for (const lv of model.levels) for (const op of lv.openings) { const b = swingBlockers(model, lv, op); if (b.length) out.push({ lv, op, blockers: b }); }
    SWING_CACHE.set(model, out);
  }
  return SWING_CACHE.get(model);
}
function plotFrame(doc) {
  const poly = doc.plot?.polygon?.length >= 3 ? ccw(doc.plot.polygon.map(p => ({ x: p.x, y: p.y }))) : null;
  if (!poly) return null;
  const north = Number(doc.north) || 0, sb = doc.plot.setbacks || {};
  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length], u = norm(sub(b, a)), out = { x: u.y, y: -u.x };
    const bearing = ((Math.atan2(out.x, out.y) * 180 / Math.PI + north) % 360 + 360) % 360;
    const side = ['n', 'e', 's', 'w'][Math.round(bearing / 90) % 4];
    return { a, u, out, side, setback: Number(sb[side]) || 0 };
  });
  return { poly, edges };
}

function gateResult(id, ok, value, threshold, reasons, extra = {}) {
  const tier = extra.tier || GATE_TIER[id] || 'functional';
  return { id, ar: GATE_AR[id], ok, value, threshold, reasons_ar: reasons, ...extra, tier, tier_ar: TIER_AR[tier] };
}
const norm_ar = t => String(t || '').replace(/[ةه]/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
const REQ_CACHE = new Map();
function requestRules(request) {
  if (Array.isArray(request.rules)) return request.rules;
  if (!request.text) return [];
  if (!REQ_CACHE.has(request.text)) { let v; try { v = extractRequirements(request.text, { counts: request.counts || {} }).rules || []; } catch { v = []; } if (REQ_CACHE.size > 64) REQ_CACHE.clear(); REQ_CACHE.set(request.text, v); }
  return REQ_CACHE.get(request.text);
}
/** هل طلب العميل أن يفتح المجلس على الطعام (مقلط/طعام الضيوف/الطعام بجانب المجلس)؟ حينها يغلب طلبه الافتراضي. */
export function majlisDiningAsked(request = {}) {
  if (request.majlisDining) return true; // تعديل صريح من العميل («افتح باب بين المجلس والطعام»)
  // (الجولة 21 — مقترح) العقد الموحد: الباب المباشر أو طعام الضيوف وحدهما يطلبان الباب؛ «قريب/جنب» (NEAR) لا يفرض بابًا. المولّد يقرأ الدالة نفسها
  if (request.brief?.version) return briefMajlisDoor(request.brief);
  const t = norm_ar(request.text);
  if (/مقلط|مقالط|طعام (?:ال)?ضيوف|سفره (?:ال)?ضيوف|المجلس (?:علي|يفتح علي|متصل ب|جنب|بجانب|بجوار) ?(?:ال)?(?:طعام|سفره)|(?:الطعام|السفره) (?:علي|يفتح علي|متصل ب|جنب|بجانب|بجوار) ?(?:ال)?مجلس/.test(t)) return true;
  return requestRules(request).some(r => ['adjacent', 'near'].includes(r.kind) && !r.negated && r.mode !== 'avoid' && ((r.a === 'dining' && /^majlis/.test(r.b || '')) || (r.b === 'dining' && /^majlis/.test(r.a || ''))));
}
/** هل حدد العميل مقاس المجلس نصًا (مجلس 5×6)؟ حينها لا يُفرض العرض الافتراضي. */
const majlisDimsAsked = request => /مجلس[^،.\n]{0,14}\d+(?:\.\d+)?\s*[×xX*]\s*\d/.test(norm_ar(request.text));
/** (الجولة العاشرة) أدنى عرض صافٍ للمجلس قيمة افتراضية للميزان (لا يكفي 2.8 م للجلسة المتقابلة)؛ (الجولة الحادية عشرة) ومجلس النساء كذلك — ملاحظة هنا، والمولّد يفرضها ما لم يحدد العميل غيرها. */
export const MAJLIS_MIN_WIDTH = Object.freeze({ min: 4.2, tier: 'mizan-default', label: MIZAN_DEFAULT_AR, source: 'جلستان متقابلتان (0.8 م لكل منهما) وممر 2.6 م بينهما — ' + MIZAN_DEFAULT_AR + '، ' + UNVERIFIED_AR, verified: false });

export function evaluateGates(doc, request = {}, model = null, opts = {}) {
  // (الجولة الثالثة عشرة) الذاكرة الاختيارية نفسها (globalThis.__mizanGenCache): البوابات حتمية للمستند والطلب والخيارات — محرك التعديل
  // الموضعي يقيّم مرشحين كثرًا بها في الاختبارات
  const hook = globalThis.__mizanGenCache; if (!hook) return evaluateGates0(doc, request, model || analyzeDoc(doc), opts);
  let key; try { key = 'rv|eg|' + PLAN_REVIEW_VERSION + '|' + JSON.stringify([doc, request, opts]); } catch { return evaluateGates0(doc, request, model || analyzeDoc(doc), opts); }
  const hit = hook.get(key); if (hit) return hit;
  const out = evaluateGates0(doc, request, model || analyzeDoc(doc), opts); try { hook.set(key, out); } catch { /* لا يُخزَّن */ } return out;
}
function evaluateGates0(doc, request = {}, model = analyzeDoc(doc), { heavy = false } = {}) {
  const gates = [];
  const ground = model.levels[0];
  const allRooms = model.levels.flatMap(lv => lv.rooms.map(room => ({ lv, room })));
  // الفراغ المزدوج الارتفاع (نوع void) ليس غرفة يُدخل إليها ولا مسطحًا: لا يدخل في البوابات
  const real = allRooms.filter(({ room }) => !room.unlabelled && !ROOM_TYPES[room.type]?.void);

  // 1) الوصول
  {
    const bad = [];
    for (const { lv, room } of real) {
      if (!lv.seedKind) { bad.push(`${roomName(room)} (${lv.level.name}): لا مدخل ولا سلم يصل إلى هذا الدور`); continue; }
      if (!lv.reach.has(room.id)) bad.push(`${roomName(room)} (${lv.level.name}) لا يصل إليها مسار أبواب من ${lv.seedKind === 'entry' ? 'المدخل' : 'السلم'}`);
    }
    if (!ground?.entries.length) bad.unshift('لا باب مدخل إلى الخارج في الدور الأرضي');
    gates.push(gateResult('REACH', !bad.length, { unreachable: bad.length, rooms: real.length }, 'صفر غرف معزولة', bad, { source: 'منطق وظيفي (لا عتبة رقمية)' }));
  }
  // 2) الإضاءة
  {
    const bad = [], seen = [];
    for (const { lv, room } of real) {
      if (!HABITABLE_TYPES.includes(room.type)) continue;
      const d = daylightOf(lv, room); seen.push(room.id);
      if (!d.count) bad.push(`${roomName(room)} بلا نافذة على الخارج أو على فناء`);
    }
    gates.push(gateResult('DAYLIGHT', !bad.length, { withoutWindow: bad.length, checked: seen.length }, '≥ نافذة واحدة', bad, { source: 'تكليف المالك؛ ' + UNVERIFIED_AR }));
  }
  // 3) أدنى عرض صافٍ
  {
    const bad = [], measured = [], notes = [];
    for (const { lv, room } of real) {
      const rule = widthRule(doc, lv, room); if (!rule) continue;
      const w = clearWidth(room); measured.push({ room: room.id, type: rule.key, width: r2(w), min: rule.min });
      if (w < rule.min - 1e-6) bad.push(`عرض ${roomName(room)} ${r2(w)} م أقل من ${rule.min} م (${UNVERIFIED_AR})`);
      // المجلس: عرض الجلسة المتقابلة (افتراضي للميزان) ما لم يحدد العميل مقاسه
      // المجلس الرئيسي: عرض الجلسة المتقابلة قيمة افتراضية للميزان — ملاحظة لا رفض هنا (المولّد يفرضها ما لم يتعارض مع بند صريح من الطلب)
      else if (room.type === 'majlis' && !majlisDimsAsked(request) && w < MAJLIS_MIN_WIDTH.min - 0.05) notes.push(`عرض ${roomName(room)} ${r2(w)} م أقل من ${MAJLIS_MIN_WIDTH.min} م لجلسة متقابلة (${MIZAN_DEFAULT_AR}؛ ملاحظة)`);
    }
    const worst = measured.reduce((m, x) => (!m || x.width - x.min < m.width - m.min ? x : m), null);
    gates.push(gateResult('MIN_WIDTH', !bad.length, { violations: bad.length, tightest: worst }, { ...Object.fromEntries(Object.entries(MIN_CLEAR_WIDTH).map(([k, v]) => [k, v.min])), majlisSeating: majlisDimsAsked(request) ? 'طلب العميل مقاس المجلس' : MAJLIS_MIN_WIDTH.min }, bad,
      { source: MOMAH_NOTE + ' ؛ وعرض المجلس ' + MAJLIS_MIN_WIDTH.min + ' م (ملاحظة): ' + MAJLIS_MIN_WIDTH.source, url: MOMAH_URL, verified: false, label: UNVERIFIED_AR, notes_ar: notes }));
  }
  // 4) نسبة الصالة
  {
    const max = DESIGN_THRESHOLDS.hallAspectMax.value, bad = [], ratios = [];
    for (const { room } of real) {
      if (room.type !== 'living') continue;
      const ratio = room.rect.w > 0 ? room.rect.l / room.rect.w : Infinity; ratios.push({ room: room.id, ratio: r2(ratio) });
      if (ratio > max + 1e-6) bad.push(`${roomName(room)} ${r2(room.rect.w)}×${r2(room.rect.l)} م نسبتها ${r2(ratio)}:1 أكبر من ${max}:1 — تعمل ممرًا لا صالة`);
    }
    gates.push(gateResult('HALL_ASPECT', !bad.length, { worst: ratios.reduce((m, x) => Math.max(m, x.ratio), 0), halls: ratios }, `≤ ${max}:1`, bad, { source: DESIGN_THRESHOLDS.hallAspectMax.source + '؛ ' + UNVERIFIED_AR }));
  }
  // 5) أبواب دورات المياه
  {
    const bad = [];
    for (const { lv, room } of real) {
      if (!WET_TYPES.has(room.type)) continue;
      for (const d of roomDoors(lv, room)) if (d.other && NO_WET_DOOR.has(d.other.type)) bad.push(`${roomName(room)} تفتح مباشرة على ${roomName(d.other)} (${ROOM_TYPES[d.other.type].ar})`);
    }
    gates.push(gateResult('WET_DOOR', !bad.length, { violations: bad.length }, 'صفر أبواب', bad, { source: 'تكليف المالك؛ ' + UNVERIFIED_AR }));
  }
  // 6) مسار الضيوف إلى المجلس
  {
    const majlis = ground ? ground.rooms.filter(r => r.type === 'majlis') : [];
    const bad = [], routes = [];
    if (ground && majlis.length) {
      const starts = guestStarts(ground).filter(id => !isPrivate(ground, ground.roomsById.get(id)));
      const forbidden = r => isPrivate(ground, r) || ['kitchen', 'service', 'laundry'].includes(r.type) || WET_TYPES.has(r.type) || r.type === 'storage';
      const clean = bfs(ground, starts, r => !forbidden(r) || r.type === 'majlis');
      const any = bfs(ground, guestStarts(ground));
      for (const m of majlis) {
        const ok = clean.dist.has(m.id);
        const anyPath = any.dist.has(m.id) ? any.path(m.id) : null;
        const through = anyPath ? anyPath.map(id => ground.roomsById.get(id)).filter(r => r && r.id !== m.id && forbidden(r)) : [];
        routes.push({ majlis: m.id, clean: ok, doors: ok ? clean.dist.get(m.id) : null, shortest: anyPath, through: through.map(r => r.id) });
        if (!ok) bad.push(anyPath ? `الوصول إلى ${roomName(m)} من مدخل الضيوف يمر عبر ${through.map(roomName).join('، ') || 'فراغ خاص'}` : `${roomName(m)} لا مسار إليه من أي مدخل`);
      }
    }
    gates.push(gateResult('GUEST_ROUTE', !bad.length, { routes }, 'مسار نظيف لكل مجلس', bad, { source: 'تكليف المالك + AlKhateeb et al. (فصل نطاق الضيوف) — ' + UNVERIFIED_AR, applicable: majlis.length > 0 }));
  }
  // 7) غرفة نوم على المجلس
  {
    const bad = [];
    for (const { lv, room } of real) {
      if (room.type !== 'majlis') continue;
      for (const d of roomDoors(lv, room)) if (d.other && BED_TYPES.has(d.other.type)) bad.push(`${roomName(d.other)} تفتح مباشرة على ${roomName(room)}`);
    }
    gates.push(gateResult('BED_MAJLIS', !bad.length, { violations: bad.length }, 'صفر أبواب', bad, { source: 'تكليف المالك؛ ' + UNVERIFIED_AR }));
  }
  // 8) السلم
  {
    const two = model.levels.length >= 2, bad = [];
    let value = { levels: model.levels.length };
    if (two) {
      const st = ground.stairs;
      if (!st.length) bad.push('مستند بدورين بلا سلم في الدور الأرضي');
      for (const s of st) {
        if (!s.room) bad.push(`السلم ${s.id} لا يقع داخل أي فراغ مغلق`);
        else if (!ground.reach.has(s.room)) bad.push(`السلم ${s.id} في ${roomName(ground.roomsById.get(s.room))} ولا يصل إليه مسار من المدخل`);
        else value = { ...value, stair: s.id, room: s.room, doorsFromEntry: ground.reach.get(s.room).doors };
      }
      for (const lv of model.levels.slice(1)) if (lv.seedKind !== 'stair') bad.push(`${lv.level.name}: لا سلم يهبط إلى فراغ فيه`);
    }
    gates.push(gateResult('STAIRS', !bad.length, value, 'سلم في فراغ موصول بالمدخل', bad, { source: 'منطق وظيفي', applicable: two }));
  }
  // 8ب) هندسة السلم (الجولة العاشرة): الأبعاد من ارتفاع الدور الفعلي، والنوع يتسع في غرفته، والوصول أسفله وأعلاه، والفتحة العلوية
  {
    const client = stairClientRules(request.text), rules = { ...STAIR_RULES, ...(client || {}) };
    const bad = [], values = [];
    for (let li = 0; li < model.levels.length; li++) for (const s of doc.stairs.filter(x => x.level === model.levels[li].level.id)) {
      const res = checkStair(model, s, li, rules);
      values.push({ stair: s.id, ...res.value });
      for (const p of res.problems) bad.push(`السلم ${s.id}${res.value?.room ? ` في «${res.value.room}»` : ''}: ${p}`);
    }
    const thr = { riserMax: rules.riserMax.value, treadMin: rules.treadMin.value, widthMin: rules.widthMin.value, landing: 'عمق البسطة ≥ عرض القلبة', pass: rules.passMin.value };
    gates.push(gateResult('STAIR_GEOMETRY', !bad.length, { stairs: values }, thr, bad, { source: `dist/stair-geometry.mjs — ${STAIR_RULES.riserMax.source}`, label: client ? 'عرض الدرج من طلب العميل؛ والباقي ' + MIZAN_DEFAULT_AR : MIZAN_DEFAULT_AR,
      tiers: Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, v.tier])), applicable: doc.stairs.length > 0 }));
  }
  // 8ج) خصوصية المجلس (الجولة العاشرة): أبوابه إلى مدخله/ممره أو مغاسله أو دورة مياه الضيوف أو طعام الضيوف أو الخارج فقط —
  //     لا إلى الصالة أو الطعام العائلي أو المطبخ أو النوم أو المجلس الآخر؛ إلا الطعام إن طلبه العميل («مقلط»، «المجلس على الطعام»)
  //     (الجولة السابعة عشرة) و«مقهوي» الضيافة (غرفة تحضير قهوة تُفتح على المجلس، وقد يُفتح بابها الآخر على المطبخ للتقديم)
  {
    const asked = majlisDiningAsked(request), bad = [], seen = [];
    const guestDining = r => r.type === 'dining' && /ضيوف|مقلط|ضياف|الرجال/.test(r.name || '');
    for (const { lv, room } of real) {
      if (room.type !== 'majlis') continue;
      for (const d of roomDoors(lv, room)) {
        if (!d.other || d.outside) continue;
        const o = d.other, okType = ['entrance', 'corridor'].includes(o.type) ? !isPrivate(lv, o) && !/الغرف|الجناح/.test(o.name || '') : o.type === 'bath' ? true : o.type === 'dining' ? (guestDining(o) || asked) : o.type === 'storage' && /^مقهوي/.test(o.name || '') ? true : false; // (الجولة السابعة عشرة) المقهوي فراغ خدمة الضيافة نفسها (تحضير القهوة)، لا فراغ عائلي
        seen.push({ majlis: room.id, other: o.id, type: o.type, ok: okType });
        if (!okType) bad.push(`${roomName(room)} يفتح مباشرة على ${roomName(o)} (${ROOM_TYPES[o.type]?.ar || o.type})${o.type === 'dining' ? ' — طعام عائلي؛ اذكر «مقلط» أو «المجلس على الطعام» إن أردته' : ''}`);
      }
    }
    gates.push(gateResult('MAJLIS_PRIVACY', !bad.length, { doors: seen, clientAskedDining: asked }, 'أبواب المجلس إلى مدخله أو مغاسله أو طعام الضيوف أو الخارج فقط', bad,
      { source: 'تكليف المالك (المجلس مستقل عن العائلة) — ' + MIZAN_DEFAULT_AR + (asked ? '؛ والطعام مسموح لأن العميل طلبه (شرط العميل يغلب)' : ''), applicable: real.some(({ room }) => room.type === 'majlis') }));
  }
  // 9) الأرض والارتداد
  {
    const frame = plotFrame(doc), bad = [];
    let worst = 0;
    if (!frame) bad.push('لا مضلع أرض في المستند');
    else {
      const tol = DESIGN_THRESHOLDS.setbackTolerance.value;
      const pts = [];
      for (const w of doc.walls) for (const p of wallRect(w)) pts.push({ p, what: `الجدار ${w.id}` });
      for (const { room } of real) for (const p of room.net) pts.push({ p, what: roomName(room) });
      const hits = new Map();
      for (const { p, what } of pts) {
        let over = pointInPolygon(p, frame.poly, 1e-9) ? 0 : Infinity;
        for (const e of frame.edges) { const inside = -dot(sub(p, e.a), e.out); over = Math.max(over, e.setback - inside); }
        if (over > tol) { worst = Math.max(worst, over); if (!hits.has(what)) hits.set(what, over); }
      }
      for (const [what, over] of hits) bad.push(Number.isFinite(over) ? `${what} يتجاوز خط الارتداد بـ ${r2(over)} م` : `${what} خارج حدود الأرض`);
    }
    gates.push(gateResult('PLOT', !bad.length, { maxOverrun: Number.isFinite(worst) ? r2(worst) : 'خارج الأرض', setbacks: doc.plot?.setbacks || null }, 'داخل الارتداد (سماحية 2 سم)', bad.slice(0, 6).concat(bad.length > 6 ? [`و${bad.length - 6} عناصر أخرى`] : []),
      { source: 'الارتدادات من مستند الأرض نفسه (doc.plot.setbacks)؛ ارتداد الجار والأمامي نظاميان في بوابة SETBACK_REG (الجولة الثالثة عشرة)' }));
  }
  // 9ب) (الجولة الثالثة عشرة) الارتدادات النظامية — تُقاس من المسافة الفعلية بين الجدران وحد الأرض، لا من قيم المستند: ارتداد الجار
  //     (وممرات المشاة) ≥ 1.5 م، والأمامي على شارع المدخل خُمس عرض الشارع ولا يقل عن 3 م (6 م لشوارع ≥ 30 م) حين يُعرف العرض؛ وإلا
  //     3 م قيمة تصميمية افتراضية (ملاحظة لا رسوب). الشوارع الجانبية/الخلفية (max(2, w/5)) مستواها «ب» فلا تُقاس.
  {
    const frame = plotFrame(doc), bad = [], notes = [], sides = {};
    if (frame) {
      const streets = new Set(doc.streets || [doc.entry || 's']), entry = doc.entry || 's';
      const pts = []; for (const w of doc.walls) for (const p of wallRect(w)) pts.push(p);
      const front = frontSetbackFor(doc.plot?.streetWidth);
      for (const e of frame.edges) {
        let clear = Infinity; for (const p of pts) clear = Math.min(clear, -dot(sub(p, e.a), e.out));
        if (!pts.length) clear = null;
        const kind = e.side === entry ? 'front' : streets.has(e.side) ? 'street' : 'neighbour';
        const req = kind === 'neighbour' ? { value: SETBACK_NEIGHBOUR.value, tier: 'regulation' } : kind === 'front' ? front : null;
        const cur = sides[e.side]; if (!cur || (clear !== null && clear < cur.clear)) sides[e.side] = { kind, clear: clear === null ? null : r2(clear), required: req ? req.value : null, tier: req ? req.tier : 'n/a' };
        if (clear === null || !req) continue;
        const tol = DESIGN_THRESHOLDS.setbackTolerance.value;
        if (clear < req.value - tol) {
          const msg = `جهة ${SIDE_AR[e.side]}: المبنى على ${r2(clear)} م من حد الأرض والمطلوب ${req.value} م`;
          if (req.tier === 'regulation') bad.push(msg + (kind === 'front' ? ` (شارع ${doc.plot.streetWidth} م)` : ' (ارتداد الجار)')); else notes.push(msg + ' (عرض الشارع غير معلوم: ' + MIZAN_DEFAULT_AR + ')');
        }
      }
      if (!front.known) notes.push(front.why_ar);
    }
    gates.push(gateResult('SETBACK_REG', !bad.length, { sides, streetWidth: doc.plot?.streetWidth ?? null, frontRequired: frame ? frontSetbackFor(doc.plot?.streetWidth).value : null }, `الجار ≥ ${SETBACK_NEIGHBOUR.value} م؛ الأمامي max(${SETBACK_FRONT.min}, عرض الشارع/5) و≥ ${SETBACK_FRONT.min30} م لشوارع ≥ ${SETBACK_FRONT.wide} م`, bad,
      { tier: 'regulation', applicable: !!frame, notes_ar: notes, regulation: { neighbour: SETBACK_NEIGHBOUR, front: SETBACK_FRONT }, source: `${SETBACK_NEIGHBOUR.source} — ${SETBACK_NEIGHBOUR.url} (${SETBACK_NEIGHBOUR.note_ar})` }));
  }
  // 9ج) (الجولة الثالثة عشرة) نسبة البناء: مسقط الدور الأرضي (الغلاف الخارجي للجدران) ≤ 75% من مساحة الأرض — المستوى أ
  {
    const G = model.levels[0], plot = doc.plot?.polygon?.length >= 3 ? doc.plot.polygon : null;
    const built = G ? G.analysis.outlines.reduce((a, o) => a + o.area, 0) : 0, land = plot ? polyAreaOf(plot) : 0;
    const ratio = land > 0 ? built / land : null, ok = ratio === null || ratio <= COVERAGE_MAX.value / 100 + 1e-6;
    gates.push(gateResult('COVERAGE', ok, { built: r2(built), plot: r2(land), ratioPct: ratio === null ? null : r2(100 * ratio) }, `≤ ${COVERAGE_MAX.value}٪`, ok ? [] : [`مسقط الدور الأرضي ${r2(built)} م² = ${r2(100 * ratio)}٪ من الأرض (${r2(land)} م²)، أكثر من ${COVERAGE_MAX.value}٪`],
      { tier: 'regulation', applicable: ratio !== null, regulation: COVERAGE_MAX, source: `${COVERAGE_MAX.source} — ${COVERAGE_MAX.url} (${COVERAGE_MAX.note_ar})` }));
  }
  // 10) البرنامج المطلوب
  {
    const c = request.counts || {}, bad = [];
    const have = {
      bedrooms: real.filter(({ room }) => BED_TYPES.has(room.type)).length,
      majlis: real.filter(({ room }) => room.type === 'majlis').length,
      kitchens: real.filter(({ room }) => room.type === 'kitchen').length,
      halls: real.filter(({ room }) => room.type === 'living').length,
      dining: real.filter(({ room }) => room.type === 'dining').length,
      baths: real.filter(({ room }) => room.type === 'bath').length,
    };
    const AR = { bedrooms: 'غرف النوم', majlis: 'المجالس', kitchens: 'المطابخ', halls: 'الصالات', dining: 'غرف الطعام', baths: 'دورات المياه' };
    for (const k of Object.keys(AR)) if (Number.isInteger(c[k]) && have[k] < c[k]) bad.push(`${AR[k]}: المطلوب ${c[k]} والمرسوم ${have[k]}`);
    gates.push(gateResult('PROGRAM', !bad.length, { requested: c, drawn: have }, 'المرسوم ≥ المطلوب', bad, { source: 'طلب العميل (request.counts)', applicable: Object.keys(c).length > 0 }));
  }
  // 11) سلامة الرسم: غرفتان على فراغ واحد، تسمية خارج أي غرفة، فراغ مغلق كبير بلا تسمية، ثغرات جدران
  {
    const bad = [], min = DESIGN_THRESHOLDS.orphanSpaceMin.value;
    for (const lv of model.levels) {
      for (const d of lv.duplicates) bad.push(`${lv.level.name}: فراغ واحد عليه ${d.labelIds.length} غرف (${d.labelIds.map(id => '«' + (doc.labels.find(l => l.id === id)?.name || id) + '»').join('، ')}) — غرف متراكبة`);
      for (const l of lv.orphanLabels) bad.push(`${lv.level.name}: «${l.name}» خارج أي فراغ مغلق`);
      for (const r of lv.rooms) if (r.unlabelled && r.area >= min) bad.push(`${lv.level.name}: فراغ مغلق ${r2(r.area)} م² بلا تسمية (غرفة مرسومة فوق أخرى أو جدار زائد)`);
      for (const g of lv.analysis.gaps || []) bad.push(`${lv.level.name}: ثغرة ${r2(g.dist * 100)} سم في الجدران`);
    }
    gates.push(gateResult('INTEGRITY', !bad.length, { violations: bad.length }, `صفر تراكب، صفر فراغات > ${min} م² بلا تسمية`, bad.slice(0, 6).concat(bad.length > 6 ? [`و${bad.length - 6} أخرى`] : []), { source: 'منطق الرسم (analyzeDoc)؛ ' + DESIGN_THRESHOLDS.orphanSpaceMin.source }));
  }
  // 12) فتح الأبواب: جدار أو باب أو عمود في مسار فتح الباب = رسوب؛ قطعة سباكة/مطبخ مثبتة = ملاحظة (strict يجعلها رسوبًا)
  {
    const bad = [], fixedHits = [];
    for (const { op, blockers: bl } of swingsOf(model)) {
      const hard = bl.filter(b => b.kind !== 'fixture');
      const fixed = bl.filter(b => b.kind === 'fixture' && FIXED_FIXTURES.includes(doc.fixtures.find(f => f.id === b.id)?.kind));
      const where = op.sides.map(s => roomName(s.room)).join(' ↔ ') || 'الخارج';
      if (hard.length) bad.push(`الباب ${op.id} (${where}) يصطدم فتحه بـ ${hard.map(b => (b.kind === 'wall' ? 'الجدار ' : b.kind === 'door' ? 'الباب ' : 'العمود ') + b.id).join('، ')}`);
      if (fixed.length) fixedHits.push(`الباب ${op.id} (${where}) يصطدم فتحه بقطعة مثبتة: ${fixed.map(b => doc.fixtures.find(f => f.id === b.id)?.kind + ' ' + b.id).join('، ')}`);
    }
    const strict = !!request.strict;
    const fail = strict ? [...bad, ...fixedHits] : bad;
    gates.push(gateResult('DOOR_SWING', !fail.length, { blocked: bad.length, fixedFixtureBlocked: fixedHits.length }, 'صفر أبواب يعترض فتحها جدار أو باب أو عمود', fail, { source: 'هندسة فتح الباب من dist/draw/review.mjs (swingBlockers)', notes_ar: strict ? [] : fixedHits }));
  }
  // 13) حجم النوافذ: الغرفة المعيشية التي لها نافذة خارجية لا يقل زجاجها عن الحد الأدنى من أرضيتها
  {
    const min = DESIGN_THRESHOLDS.windowToFloorMin.value, bad = [], ratios = [], notes = [];
    const entry = doc.entry || 's';
    // (الجولة الثالثة عشرة، قرار المالك) نسبة الزجاج اختيار العميل: ما طلبه (prefs.glazing من كلامه) يُعرض بجانب المحقق معلومةً؛ لا نطاق افتراضي
    let glz = request.glazing || request.prefs?.glazing || null;
    if (!glz && request.text) { try { glz = extractRequirements(request.text, { counts: request.counts || {} }).prefs?.glazing || null; } catch { glz = null; } }
    for (const { lv, room } of real) {
      if (!HABITABLE_TYPES.includes(room.type)) continue;
      const d = daylightOf(lv, room); if (!d.count) continue; // بلا نافذة: بوابة الإضاءة تتولاه
      const ratio = room.area > 0 ? d.area / room.area : 0, pct = r2(100 * ratio);
      const ext = (room.edges || []).filter(e => e.exterior && e.length >= .5), extLen = r2(ext.reduce((a, e) => a + e.length, 0));
      const facing = ext.some(e => e.side === entry) && !ext.some(e => e.side !== entry) ? 'street' : 'garden';
      const want = clientGlazing({ type: room.type, name: room.name }, glz);
      ratios.push({ room: room.id, name: roomName(room), ratio: r2(ratio), pct, glass: r2(d.area), requested: want, facing, exteriorLength: extLen, meetsRequest: want === null ? null : pct >= want - .5 });
      if (ratio < min - 1e-9) bad.push(`زجاج ${roomName(room)} ${r2(d.area)} م² = ${pct}٪ من أرضيتها (${r2(room.area)} م²)، أقل من ${100 * min}٪ (${UNVERIFIED_AR})`);
      else if (want !== null && pct < want - .5) notes.push(`زجاج ${roomName(room)} ${pct}٪ من أرضيتها وطلب العميل ${want}٪ (${GLAZING_CLIENT_AR}؛ جدارها الخارجي ${extLen} م)`);
    }
    gates.push(gateResult('WINDOW_SIZE', !bad.length, { worst: ratios.reduce((m, x) => Math.min(m, x.ratio), Infinity), rooms: ratios.length, requestedRooms: ratios.filter(x => x.requested !== null).length, belowRequest: ratios.filter(x => x.meetsRequest === false).length, ratios }, `≥ ${100 * min}٪ من الأرضية (رفض)؛ النسبة لكل غرفة معلومة، وما طلبه العميل بجانبها`, bad,
      { source: DESIGN_THRESHOLDS.windowToFloorMin.source + '؛ نسبة الزجاج اختيار العميل (prefs.glazing، dist/glazing.mjs) — لا نطاق افتراضي؛ مرجع: 8٪ من اشتراطات الوزارة §5-1-15.2 (المستوى ب، غير مطابَق يدويًا) — ليس بوابة', notes_ar: notes }));
  }
  // 14) المواضع التي طلبها العميل نصًا (في الأمام / في الخلف)، مقيسة من المستند وحده
  {
    const { rules, unchecked } = placementRules(request);
    const bad = [], checked = [];
    for (const r of rules) {
      const res = checkPlacement(doc, model, r);
      if (!res) { unchecked.push(r.text); continue; }
      checked.push({ text: r.text, depth: res.depth, ok: res.ok });
      if (!res.ok) bad.push(`${r.text}: ${res.why}`);
    }
    gates.push(gateResult('PLACEMENT', !bad.length, { checked, unchecked }, 'كل موضع مطلوب محقق', bad, { source: 'نص طلب العميل (extractRequirements) + ' + DESIGN_THRESHOLDS.placementHalf.source, applicable: checked.length > 0 }));
  }
  // 15) (الجولة الثانية عشرة) البرنامج السعودي والموقع والمناخ — مقيسة من المستند؛ الطبقة من الطلب: شرط العميل يرسب، والافتراضي ملاحظة
  for (const g of measureSaudiProgram(doc, request, model)) {
    // اشتراط نظامي متحقق بمصدر (المواقف): يرسب كبوابة كشرط العميل، وطبقته «اشتراط نظامي متحقق» بمصدره
    if (g.regulation) { const ok = g.pass || !g.applicable; gates.push(gateResult(g.id, ok, { pass: g.pass, ...g.value }, g.ar, g.reasons_ar, { tier: 'regulation', applicable: g.applicable, source: `${g.regulation.source} — ${g.regulation.url} (${g.regulation.note_ar})` })); continue; }
    const tier = g.clientAsked ? 'client' : 'mizan-default', ok = g.pass || !g.clientAsked || !g.applicable;
    gates.push(gateResult(g.id, ok, { pass: g.pass, ...g.value }, g.ar, g.clientAsked ? g.reasons_ar : [], { tier, applicable: g.applicable, notes_ar: g.clientAsked ? [] : g.reasons_ar.map(x => `${x} (${MIZAN_DEFAULT_AR}؛ ملاحظة)`),
      source: g.clientAsked ? 'طلب العميل نصًا' : MIZAN_DEFAULT_AR + '، ' + UNVERIFIED_AR }));
  }
  const want = heavy === true ? HEAVY_GATES : Array.isArray(heavy) ? heavy : [];
  for (const id of want) gates.push(heavyGate(id, doc, request));
  return gates;
}

/**
 * (الجولة الحادية عشرة) البوابات الثقيلة، كل منها بطبقتها:
 *  STRUCTURAL: الملاحظات الجسيمة في dist/structural-precheck.mjs (حدودها قيم تصميمية افتراضية للميزان؛ ليست تصميمًا إنشائيًا).
 *  CIRCULATION: dist/circulation-proof.mjs بحدود البوابة (ممر ≥ 0.6 م مع الأثاث، منطقة حرة 0.6 م أمام الأبواب، باب دورة مياه الضيوف ≥ 0.8 م،
 *               المرحاض خارج منطقة فتح الباب) — لكل سبب طبقته: منطق وظيفي (لا يُبلغ مشيًا، اصطدام بالباب) أو قيمة افتراضية للميزان.
 *  CONSISTENCY_2D3D: dist/draw/wall-geometry.mjs (الباني نفسه الذي يبني المجسّم): فتحة يُسقطها المجسّم أو يزيحها > 5 سم أو تعبر تقاطعًا = رسوب.
 */
export function heavyGate(id, doc, request = {}) {
  if (id === 'STRUCTURAL') {
    let rep; try { rep = structuralPrecheck(doc); } catch (e) { return gateResult(id, false, null, 'صفر ملاحظات جسيمة', ['تعذّرت المراجعة الإنشائية المبدئية: ' + e.message], { source: 'dist/structural-precheck.mjs' }); }
    const serious = rep.findings.filter(f => f.severity === 'serious'), warn = rep.findings.filter(f => f.severity === 'warn');
    return gateResult(id, !serious.length, { serious: serious.length, warn: warn.length, codes: [...new Set(serious.map(f => f.code))] }, 'صفر ملاحظات جسيمة', serious.map(f => f.message),
      { source: 'dist/structural-precheck.mjs (PRECHECK_LIMITS) — ' + MIZAN_DEFAULT_AR + '، ' + UNVERIFIED_AR, label: PRECHECK_DISCLAIMER, notes_ar: warn.slice(0, 8).map(f => f.message), applicable: true });
  }
  if (id === 'CIRCULATION') {
    let g; try { g = circulationGate(doc); } catch (e) { return gateResult(id, false, null, 'كل غرفة تُبلغ مشيًا', ['تعذّر حساب الحركة الفعلية: ' + e.message], { source: 'dist/circulation-proof.mjs' }); }
    const tiers = [...new Set(g.fails.map(f => f.tier))];
    return gateResult(id, g.ok, { fails: g.fails.length, codes: [...new Set(g.fails.map(f => f.code))], counts: g.counts }, { passage: CIRC_GATE_LIMITS.body * 2, doorFront: CIRC_GATE_LIMITS.doorFront, guestWcDoor: CIRC_GATE_LIMITS.guestWcDoorMin },
      g.fails.map(f => `${f.message} [${TIER_AR[f.tier] || f.tier}]`), { source: 'dist/circulation-proof.mjs (CIRC_GATE_LIMITS) — الحدود الرقمية ' + MIZAN_DEFAULT_AR + '، ' + UNVERIFIED_AR, tiers: Object.fromEntries(g.fails.map(f => [f.code, f.tier])), tier: tiers.includes('mizan-default') && !tiers.includes('functional') ? 'mizan-default' : 'functional', notes_ar: g.notes.slice(0, 8).map(f => f.message) });
  }
  if (id === 'CONSISTENCY_2D3D') {
    let c; try { c = openingConsistency(doc); } catch (e) { return gateResult(id, false, null, 'صفر فتحات مفقودة', ['تعذّر بناء جدران المجسّم: ' + e.message], { source: 'dist/draw/wall-geometry.mjs' }); }
    const AR = { DROPPED: 'لا وجود لها في المجسّم', CROSSES_JUNCTION: 'تعبر تقاطع جدارين', SHIFTED: 'منزاحة في المجسّم', RESIZED: 'مقصوصة العرض في المجسّم' };
    const major = c.issues.filter(i => i.major), minor = c.issues.filter(i => !i.major);
    return gateResult(id, c.ok, { major: major.length, minor: minor.length }, 'صفر فتحات مفقودة أو منزاحة > 5 سم', major.map(i => `الفتحة ${i.id} (${i.kind}) ${AR[i.code] || i.code}${i.by ? ` بـ ${r2(i.by * 100)} سم` : ''}`),
      { source: 'dist/draw/wall-geometry.mjs (باني جدران المجسّم نفسه)', notes_ar: minor.map(i => `الفتحة ${i.id} ${AR[i.code] || i.code}${i.by ? ` ${r2(i.by * 100)} سم` : ''}`) });
  }
  throw Error('بوابة غير معروفة: ' + id);
}

// ------------------------------------------------------------------------------------------- placement
const SUBJECT_ROOMS = {
  kitchen: r => r.type === 'kitchen',
  majlis: r => r.type === 'majlis' && !/نساء|النساء|حريم/.test(r.name),
  majlis_w: r => r.type === 'majlis' && /نساء|النساء|حريم/.test(r.name),
  dining: r => r.type === 'dining',
  hall: r => r.type === 'living',
  master: r => r.type === 'master',
  bedrooms: r => BED_TYPES.has(r.type),
  kids: r => r.type === 'bedroom' && !/كبار|والد|أم|ام|أب|اب|جد|ضيوف/.test(r.name),
  maid: r => r.type === 'service' && /خادم|عامل|شغال/.test(r.name),
  driver: r => r.type === 'service' && /سائق|سواق/.test(r.name),
  office: r => r.type === 'office',
};
const PLURAL = new Set(['bedrooms', 'kids']);
const RULE_CACHE = new Map(); // نص الطلب ← قواعد الموضع (المولّد يراجع عشرات المرشحين للطلب نفسه)
/** قواعد الموضع من نص الطلب (أو request.rules إن مُرّرت): أمام/خلف فقط، الملزمة منها. */
function placementRules(request) {
  let rules = Array.isArray(request.rules) ? request.rules : null;
  if (!rules && request.text) {
    if (!RULE_CACHE.has(request.text)) { let v; try { v = extractRequirements(request.text, { counts: request.counts || {} }).rules || []; } catch { v = []; } if (RULE_CACHE.size > 64) RULE_CACHE.clear(); RULE_CACHE.set(request.text, v); }
    rules = RULE_CACHE.get(request.text);
  }
  const out = [], unchecked = [];
  for (const r of rules || []) {
    if (r.kind !== 'place' || (r.level && r.level !== 'must')) continue;
    if (!['front', 'back'].includes(r.side) || r.mode === 'avoid' || r.negated) { unchecked.push(r.text || `${r.a} ${r.side}`); continue; }
    if (!SUBJECT_ROOMS[r.a]) { unchecked.push(r.text || r.a); continue; }
    out.push(r);
  }
  return { rules: out, unchecked };
}
/** عمق مركز الغرفة (0 = واجهة شارع المدخل، 1 = الخلف) داخل صندوق غرف الدور. */
function depthFrame(doc, lv) {
  const side = doc.entry || (doc.entries || [])[0] || 's';
  const bearing = { n: 0, e: 90, s: 180, w: 270 }[side] ?? 180, th = (bearing - (Number(doc.north) || 0)) * Math.PI / 180;
  const f = { x: Math.sin(th), y: Math.cos(th) }, proj = p => p.x * f.x + p.y * f.y;
  const ps = lv.rooms.filter(r => !r.unlabelled).flatMap(r => r.net.map(proj));
  const hi = Math.max(...ps), lo = Math.min(...ps);
  const depth = p => (hi - proj(p)) / Math.max(1e-9, hi - lo);
  depth.front = f;
  return depth;
}
function checkPlacement(doc, model, rule) {
  const pick = SUBJECT_ROOMS[rule.a];
  const found = model.levels.map(lv => ({ lv, rooms: lv.rooms.filter(r => !r.unlabelled && pick(r)) })).filter(x => x.rooms.length);
  if (!found.length) return null; // غياب الغرفة شأن بوابة البرنامج
  const { lv, rooms } = found[0], depth = depthFrame(doc, lv), half = DESIGN_THRESHOLDS.placementHalf.value;
  const names = rooms.map(roomName).join('، ');
  // «على الشارع» / «يطل على الحوش الخلفي» (touch): للغرفة جدار خارجي (≥ 1 م) يواجه تلك الجهة فعلًا
  if (rule.mode === 'touch') {
    const f = depth.front, want = rule.side === 'front' ? f : { x: -f.x, y: -f.y };
    const faces = rooms.some(r => r.edges.some(e => e.exterior && e.length >= 1 && e.out.x * want.x + e.out.y * want.y > Math.SQRT1_2));
    return { ok: faces, depth: r2(Math.min(...rooms.map(r => depth(r.centroid)))), why: `لا جدار خارجي لـ${names} يواجه ${rule.side === 'front' ? 'الشارع' : 'الخلف'}` };
  }
  // الجمع (غرف النوم): متوسط العمق موزونًا بالمساحة؛ المفرد: يكفي أن تحقق إحدى غرف النوع الموضع (أعمق واحدة للخلف، أقربها للأمام)
  let d;
  if (PLURAL.has(rule.a)) { const A = rooms.reduce((s, r) => s + r.area, 0); d = rooms.reduce((s, r) => s + depth(r.centroid) * r.area, 0) / A; }
  else { const ds = rooms.map(r => depth(r.centroid)); d = rule.side === 'back' ? Math.max(...ds) : Math.min(...ds); }
  const ok = rule.side === 'back' ? d >= half - 1e-9 : d <= half + 1e-9;
  return { ok, depth: r2(d), why: `${names} على عمق ${r2(100 * d)}٪ من الواجهة (${rule.side === 'back' ? 'المطلوب ≥' : 'المطلوب ≤'} ${100 * half}٪)` };
}

// --------------------------------------------------------------------------------------------- score
function zoneOf(lv, room) {
  if (room.type === 'majlis') return 'guest';
  if (BED_TYPES.has(room.type)) return 'private';
  if (['living', 'dining', 'kitchen'].includes(room.type)) return 'family';
  return null;
}
function bboxOf(rooms) {
  if (!rooms.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rooms) for (const p of r.net) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, area: (x1 - x0) * (y1 - y0) };
}
function overlapRatio(a, b) {
  if (!a || !b) return 0;
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1e-9, Math.min(a.area, b.area));
}

export function scoreComponents(doc, request = {}, model = analyzeDoc(doc)) {
  const comp = {}, detail = {};
  const real = model.levels.flatMap(lv => lv.rooms.filter(r => !r.unlabelled && !ROOM_TYPES[r.type]?.void).map(room => ({ lv, room })));
  const indoor = real.filter(({ room }) => !ROOM_TYPES[room.type]?.open);
  const net = indoor.reduce((s, { room }) => s + room.area, 0);

  // الحركة: نسبة الممرات والمداخل من الصافي، داخل النطاق = 1
  const circ = indoor.filter(({ room }) => CIRC_TYPES.has(room.type)).reduce((s, { room }) => s + room.area, 0);
  const pct = net > 0 ? 100 * circ / net : 0;
  const [lo, hi] = DESIGN_THRESHOLDS.circulationBand.value;
  comp.circulation = pct < lo ? clamp01(pct / lo) : pct > hi ? clamp01(1 - (pct - hi) / 15) : 1;
  detail.circulation = { pct: r2(pct), band: [lo, hi] };

  // الإضاءة: نسبة الزجاج إلى الأرضية لكل غرفة معيشية مقابل 10٪ الإرشادية
  const hab = real.filter(({ room }) => HABITABLE_TYPES.includes(room.type));
  const t = DESIGN_THRESHOLDS.windowToFloor.value;
  const per = hab.map(({ lv, room }) => { const d = daylightOf(lv, room); return { room: room.id, ratio: r2(room.area > 0 ? d.area / room.area : 0) }; });
  comp.daylight = per.length ? per.reduce((s, x) => s + clamp01(x.ratio / t), 0) / per.length : null;
  detail.daylight = { target: t, rooms: per };

  // عمق الخصوصية: أبواب من مدخل الضيوف إلى كل غرفة نوم، ومن المجلس إلى أقرب غرفة نوم
  const ground = model.levels[0];
  const depths = [];
  if (ground) {
    const starts = guestStarts(ground);
    const fromEntry = bfs(ground, starts), majlis = ground.rooms.filter(r => r.type === 'majlis').map(r => r.id);
    const fromMajlis = majlis.length ? bfs(ground, majlis) : null;
    const good = DESIGN_THRESHOLDS.privacyDepthGood.value;
    for (const lv of model.levels) for (const room of lv.rooms) {
      if (!BED_TYPES.has(room.type)) continue;
      if (lv !== ground) { depths.push({ room: room.id, entry: 'دور علوي', score: 1 }); continue; }
      const de = fromEntry.dist.get(room.id), dm = fromMajlis ? fromMajlis.dist.get(room.id) : undefined;
      const s1 = de === undefined ? 0 : clamp01((de - 1) / (good - 1));
      const s2 = dm === undefined ? (fromMajlis ? 1 : s1) : clamp01((dm - 1) / (good - 1));
      depths.push({ room: room.id, entry: de ?? null, majlis: dm ?? null, score: r2((s1 + s2) / 2) });
    }
  }
  comp.privacy = depths.length ? depths.reduce((s, x) => s + x.score, 0) / depths.length : null;
  detail.privacy = { bedrooms: depths };

  // وضوح النطاقات: تداخل الصناديق المحيطة لنطاق الضيوف مع الخاص ومع العائلة، وأبواب مباشرة ضيوف↔خاص
  if (ground) {
    const by = { guest: [], family: [], private: [] };
    for (const r of ground.rooms) { const z = zoneOf(ground, r); if (z) by[z].push(r); }
    const bb = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, bboxOf(v)]));
    const gp = overlapRatio(bb.guest, bb.private), gf = overlapRatio(bb.guest, bb.family);
    let cross = 0;
    for (const r of by.guest) for (const d of roomDoors(ground, r)) if (d.other && (zoneOf(ground, d.other) === 'private' || isPrivate(ground, d.other))) cross++;
    comp.zoning = by.guest.length ? clamp01(1 - 0.6 * gp - 0.2 * gf - 0.3 * cross) : clamp01(1 - 0.3 * overlapRatio(bb.family, bb.private));
    detail.zoning = { guestPrivateOverlap: r2(gp), guestFamilyOverlap: r2(gf), guestToPrivateDoors: cross };
  } else comp.zoning = null;

  // جودة النسب: نسبة الطول إلى العرض والعرض مقابل حد الكتالوج التصميمي
  const g = DESIGN_THRESHOLDS.roomAspectGood.value, b = DESIGN_THRESHOLDS.roomAspectBad.value;
  const props = hab.map(({ room }) => {
    const ratio = room.rect.w > 0 ? room.rect.l / room.rect.w : b;
    const a = ratio <= g ? 1 : clamp01(1 - (ratio - g) / (b - g));
    const cat = ROOM_TYPES[room.type]?.minWidth || 0;
    const w = cat ? clamp01(clearWidth(room) / cat) : 1;
    return { room: room.id, ratio: r2(ratio), score: r2(a * w) };
  });
  comp.proportion = props.length ? props.reduce((s, x) => s + x.score, 0) / props.length : null;
  detail.proportion = { rooms: props };

  // الأثاث: قطع خارج الغرف أو متداخلة، وأبواب يعترض فتحها شيء (من مراجع الرسم المستقل review.mjs)
  if (doc.fixtures?.length) {
    const rv = reviewDoc(doc, { model, only: ['FIXTURE_OUTSIDE', 'FIXTURE_OVERLAP'] });
    const n = c => rv.filter(i => i.code === c).length;
    // SWING_BLOCKED بنفس منطق review.mjs (باب واحد لكل مسألة، وزوج البابين المتعارضين يُعدّ مرة) من ذاكرة المعترضات
    let swingBlocked = 0; const seen = new Set();
    for (const { op, blockers } of swingsOf(model)) {
      const fresh = blockers.filter(b => !(b.kind === 'door' && seen.has([b.id, op.id].sort().join())));
      blockers.filter(b => b.kind === 'door').forEach(b => seen.add([b.id, op.id].sort().join()));
      if (fresh.length) swingBlocked++;
    }
    const issues = { outside: n('FIXTURE_OUTSIDE'), overlap: n('FIXTURE_OVERLAP'), swingBlocked };
    comp.furniture = clamp01(1 - (issues.outside + issues.overlap + issues.swingBlocked) / 6);
    detail.furniture = { fixtures: doc.fixtures.length, ...issues };
  } else { comp.furniture = null; detail.furniture = { fixtures: 0, note: 'لا أثاث في الرسم: المكوّن غير مُقيَّم' }; }
  return { comp, detail };
}

/** AZIZ (rankByDNA) وMizan Score على المستند نفسه بعد تحويله إلى النموذج القديم. null مع سبب إن تعذّر. */
export function externalScores(doc, request = {}) {
  const out = { aziz: null, mizan: null, notes: [] };
  const mizans = [];
  for (const lv of doc.levels) {
    try { const s = calculateMizanScore(docToLegacy(doc, { level: lv.id }).model)?.score; if (Number.isFinite(s)) mizans.push(s); }
    catch (e) { out.notes.push(`Mizan Score تعذّر في ${lv.name}: ${e.message}`); }
  }
  if (mizans.length) out.mizan = r2(mizans.reduce((a, b) => a + b, 0) / mizans.length / 10); // 0..1000 → 0..100
  try {
    const land = request.land || {};
    const xs = (doc.plot?.polygon || []).map(p => p.x), ys = (doc.plot?.polygon || []).map(p => p.y);
    const width = Number(land.width) || (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
    const length = Number(land.length) || (ys.length ? Math.max(...ys) - Math.min(...ys) : 0);
    const streets = land.streets || doc.streets || [doc.entry || 's'];
    const plot = validatePlot({ width, length, floors: 1, streets: Object.fromEntries(streets.map(s => [s, true])), entry: (land.entries || doc.entries || [doc.entry || streets[0]])[0] });
    const model = { ...docToLegacy(doc, { level: doc.levels[0].id }).model, strategy: 'review' };
    const dna = rankByDNA({ plot, rooms: [], discovery: request.discovery || {}, idea: request.text || '', counts: request.counts || {}, models: [model] });
    const s = dna.rows[0]?.score;
    if (Number.isFinite(s)) out.aziz = s;
    if (doc.levels.length > 1) out.notes.push('AZIZ يُحسب للدور الأرضي فقط كما في مسار الفيلا.');
  } catch (e) { out.notes.push('AZIZ تعذّر: ' + e.message); }
  return out;
}

// ----------------------------------------------------------------------------------------- public API
/**
 * مراجعة مستند واحد.
 * @param {object} doc  mizan-draw/1
 * @param {{ text?: string, counts?: object, land?: object, discovery?: object }} request
 * @param {{ external?: boolean, strict?: boolean }} [opts]  external:false يتخطى AZIZ وMizan (أسرع، للاختبارات)؛
 *   strict:true يجعل اصطدام فتح الباب بقطعة سباكة/مطبخ مثبتة رسوبًا (لا ملاحظة)
 */
export function reviewDesign(doc, request = {}, opts = {}) {
  // (الجولة الثالثة عشرة) ذاكرة اختيارية يحقنها المضيف (globalThis.__mizanGenCache، حزمة الاختبارات): المراجعة حتمية للمستند والطلب
  // نفسيهما، والبوابات الثقيلة غالية؛ المفتاح «rv|» + الإصدار + المستند والطلب والخيارات كاملة (المضيف يبصمها)
  const hook = globalThis.__mizanGenCache; if (!hook) return reviewDesign0(doc, request, opts);
  let key; try { key = 'rv|' + PLAN_REVIEW_VERSION + '|' + JSON.stringify([doc, request, opts]); } catch { return reviewDesign0(doc, request, opts); }
  const hit = hook.get(key); if (hit) return hit;
  const out = reviewDesign0(doc, request, opts); try { hook.set(key, out); } catch { /* لا يُخزَّن */ } return out;
}
function reviewDesign0(doc, request = {}, { external = true, strict = false, heavy = true } = {}) {
  const model = analyzeDoc(doc);
  const gates = evaluateGates0(doc, strict ? { ...request, strict: true } : request, model, { heavy });
  const passed = gates.every(g => g.ok);
  const { comp, detail } = scoreComponents(doc, request, model);
  const ext = external ? externalScores(doc, request) : { aziz: null, mizan: null, notes: ['AZIZ وMizan غير محسوبين (external:false)'] };
  comp.aziz = ext.aziz === null ? null : clamp01(ext.aziz / 100);
  comp.mizan = ext.mizan === null ? null : clamp01(ext.mizan / 100);
  let sum = 0, wsum = 0;
  const breakdown = Object.keys(SCORE_WEIGHTS).map(k => {
    const v = comp[k], w = SCORE_WEIGHTS[k];
    if (v !== null && v !== undefined) { sum += v * w; wsum += w; }
    return { id: k, ar: COMPONENT_AR[k], value: v === null || v === undefined ? null : r2(v * 100), weight: w, detail: detail[k] ?? (k === 'aziz' ? { raw: ext.aziz } : k === 'mizan' ? { raw0to100: ext.mizan } : null) };
  });
  for (const b of breakdown) b.effectiveWeight = b.value === null ? 0 : r2(100 * b.weight / wsum);
  const score = wsum ? r2(100 * sum / wsum) : null;
  const rejectReasons_ar = gates.filter(g => !g.ok).flatMap(g => g.reasons_ar.map(r => `${g.ar}: ${r}`));
  return { version: PLAN_REVIEW_VERSION, gates, passed, failedGates: gates.filter(g => !g.ok).map(g => g.id), score, breakdown, rejectReasons_ar, external: ext, regulatoryNotes_ar: regulatoryNotes(gates) };
}
/**
 * (الجولة الثالثة عشرة) «ملاحظة نظامية محتملة»: بنود مستواها «ب» (نص رسمي بـOCR مشوّه + مصدر ثانوي) لا تُبدَّل بها بوابة ولا يُرفض بها
 * بديل — تُعرض للمالك ليقرر. الآن: الزجاج ≥ 8% من أرضية الغرفة المعيشية (بوابة الرفض WINDOW_SIZE تبقى 3%).
 */
export function regulatoryNotes(gates) {
  const out = [], ws = gates.find(g => g.id === 'WINDOW_SIZE');
  if (ws?.value?.ratios?.length) {
    // (قرار المالك) رقم الوزارة 8٪ مرجع بمستوى تحققه لا بوابة؛ الحكم على كل غرفة بهدفها المرن (ملاحظة في البوابة نفسها)
    const below = ws.value.ratios.filter(x => x.ratio < GLAZING_MIN.value / 100 - 1e-9);
    if (below.length) out.push({ id: 'GLAZING_REF', kind: 'مرجع نظامي (ليس بوابة)', level: GLAZING_MIN.level, item: GLAZING_MIN.item, rooms: below.map(x => ({ room: x.room, name: x.name || x.room, ratioPct: r2(100 * x.ratio), requested: x.requested ?? null })),
      text_ar: `مرجع نظامي (المستوى ب، لم يُطابَق يدويًا؛ ليس بوابة): اشتراطات الوزارة §5-1-15.2 تذكر ${GLAZING_MIN.value}٪ من أرضية الغرفة؛ دون هذا الرقم هنا: ${below.map(x => `${x.name || x.room} ${r2(100 * x.ratio)}٪${x.requested != null ? ` (طلب العميل ${x.requested}٪)` : ''}`).join('، ')}. نسبة الزجاج اختيار العميل (لا قيمة افتراضية)، وبوابة الرفض ${100 * DESIGN_THRESHOLDS.windowToFloorMin.value}٪ كما هي.`, source: GLAZING_MIN.source, url: GLAZING_MIN.url });
  }
  return out;
}

/** يراجع عدة مستندات ويرتّبها: الناجح في كل البوابات أولًا، ثم الأعلى درجة. يحفظ index الأصلي. */
export function reviewDesigns(docs, request = {}, opts = {}) {
  const rows = docs.map((doc, index) => ({ index, title: doc.title || `بديل ${index + 1}`, ...reviewDesign(doc, request, opts) }));
  const order = (a, b) => (b.passed - a.passed) || (a.failedGates.length - b.failedGates.length) || ((b.score ?? -1) - (a.score ?? -1)) || a.index - b.index;
  rows.sort(order);
  // (الجولة الحادية عشرة) opts.distinct === true: المقياس الوظيفي v2 — يُقبل البديل فقط إن كان «مختلفًا معماريًا» (بعدان جوهريان
  // على الأقل) عن كل بديل مقبول أعلى منه؛ «اختلاف جزئي» لا يكفي. ويُرفق لكل زوج الشرح العربي (explainDifference).
  // opts.distinct رقمًا أو 'v1': المقياس القديم v1 (للتوافق فقط)
  if (opts.distinct === true || opts.distinct === 'v2') {
    const sig = new Map(rows.map(r => [r.index, archSignatureV2(docs[r.index])]));
    const kept = [];
    for (const r of rows) {
      const cmp = kept.map(k => ({ k, d: archDifferenceV2(sig.get(r.index), sig.get(k.index)) }));
      const worst = cmp.sort((x, y) => x.d.substantive.length - y.d.substantive.length || x.d.total - y.d.total)[0];
      const ok = !worst || cmp.every(c => c.d.verdict === 'distinct');
      const ex = worst ? explainDifference(worst.d) : null;
      const pairs = cmp.map(c => ({ other: c.k.index, verdict: c.d.verdict, verdict_ar: c.d.verdict_ar, substantive: c.d.substantive, dims: { zoning: c.d.zoning, circulation: c.d.circulation, privacy: c.d.privacy, relations: c.d.relations }, total: c.d.total }));
      const g = { id: 'DISTINCT', ar: GATE_AR.DISTINCT, ok, value: worst ? { nearest: worst.k.index, verdict: worst.d.verdict, substantive: worst.d.substantive, zoning: worst.d.zoning, circulation: worst.d.circulation, privacy: worst.d.privacy, relations: worst.d.relations, total: worst.d.total, pairs } : null,
        threshold: `بعدان جوهريان على الأقل (${Object.entries(SUBSTANTIVE_V2).map(([k, v]) => `${DIM_V2_AR[k]} ≥ ${v}`).join('، ')})`,
        reasons_ar: ok ? [] : [`${worst.d.verdict_ar} مع «${worst.k.title}» — الأبعاد الجوهرية: ${worst.d.substantive.map(k => DIM_V2_AR[k]).join('، ') || 'لا شيء'} (المطلوب بعدان على الأقل)`],
        explanation_ar: ex ? ex.text : null, source: 'dist/arch-difference.mjs (archDifferenceV2، معايَر على 42 حكمًا من المساقط) — ' + MIZAN_DEFAULT_AR, tier: 'mizan-default', tier_ar: TIER_AR['mizan-default'] };
      r.gates = [...r.gates, g];
      if (!ok) { r.passed = false; r.failedGates = [...r.failedGates, 'DISTINCT']; r.rejectReasons_ar = [...r.rejectReasons_ar, `${g.ar}: ${g.reasons_ar[0]}`]; }
      else if (r.passed) kept.push(r);
    }
    rows.sort(order);
  } else if (opts.distinct) {
    const min = opts.distinct === true ? DESIGN_THRESHOLDS.distinctMin.value : Number(opts.distinct);
    const sig = new Map(rows.map(r => [r.index, archSignature(docs[r.index])]));
    const kept = [];
    for (const r of rows) {
      const near = kept.map(k => ({ k, d: archDifference(sig.get(r.index), sig.get(k.index)) })).sort((x, y) => x.d.total - y.d.total)[0];
      const ok = !near || near.d.total >= min;
      const g = { id: 'DISTINCT', ar: GATE_AR.DISTINCT, ok, value: near ? { nearest: near.k.index, total: near.d.total, adjacency: near.d.adjacency, circulation: near.d.circulation, zoning: near.d.zoning } : null, threshold: `≥ ${min}`,
        reasons_ar: ok ? [] : [`تنظيمه نسخة شكلية من «${near.k.title}» (الاختلاف المعماري ${near.d.total} < ${min}: تجاور ${near.d.adjacency}، حركة ${near.d.circulation}، نطاقات ${near.d.zoning})`],
        source: 'dist/arch-difference.mjs — ' + DESIGN_THRESHOLDS.distinctMin.source, tier: 'mizan-default', tier_ar: TIER_AR['mizan-default'] };
      r.gates = [...r.gates, g];
      if (!ok) { r.passed = false; r.failedGates = [...r.failedGates, 'DISTINCT']; r.rejectReasons_ar = [...r.rejectReasons_ar, `${g.ar}: ${g.reasons_ar[0]}`]; }
      else if (r.passed) kept.push(r);
    }
    rows.sort(order);
  }
  return rows;
}

/** جدول الرفض للواجهة: عمود لكل بوابة، صف لكل بديل، مع أسباب الرفض بالعربية. */
export function rejectionTable(reviews) {
  return {
    columns: [{ id: 'label', ar: 'البديل' }, ...GATES.map(g => ({ id: g.id, ar: g.ar })), { id: 'score', ar: 'الدرجة' }, { id: 'verdict', ar: 'الحكم' }],
    rows: reviews.map(r => ({
      index: r.index, label: r.label || `بديل ${r.index + 1}`, passed: r.passed, score: r.score,
      cells: Object.fromEntries(r.gates.map(g => [g.id, { ok: g.ok, applicable: g.applicable !== false, text: g.ok ? (g.applicable === false ? 'لا ينطبق' : 'ناجح') : g.reasons_ar[0] }])),
      verdict: r.passed ? 'مقبول' : `مرفوض (${r.failedGates.length} بوابة)`,
      reasons_ar: r.rejectReasons_ar,
    })),
  };
}

// ------------------------------------------------------------------------------------------ statistics
export function pearson(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pairs.length; if (n < 3) return null;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n, my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? r2(sxy / Math.sqrt(sxx * syy)) : null;
}
const ranks = v => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
export function spearman(xs, ys) {
  const keep = xs.map((x, i) => Number.isFinite(x) && Number.isFinite(ys[i]));
  return pearson(ranks(xs.filter((_, i) => keep[i])), ranks(ys.filter((_, i) => keep[i])));
}

export default { PLAN_REVIEW_VERSION, TIER_AR, GATE_TIER, HEAVY_GATES, heavyGate, MAJLIS_MIN_WIDTH, majlisDiningAsked, GATES, SET_GATES, FIXED_FIXTURES, MIN_CLEAR_WIDTH, DESIGN_THRESHOLDS, SCORE_WEIGHTS, EXTERNAL_WEIGHTS, evaluateGates, scoreComponents, externalScores, reviewDesign, reviewDesigns, rejectionTable, pearson, spearman };
