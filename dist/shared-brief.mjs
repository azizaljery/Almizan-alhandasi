// (الجولة 21 — مقترح، مكيَّف من حزمة المالك kit-r21/src/brief.mjs) عقد الطلب الموحد بين المولّد والمراجع.
// السبب الجذري (docs/research/v3-diagnosis-r21.md §2، H6): المتطلبات لا تحمل نص العميل، فقرأ المولّد «طعام قريب من المجلس» من البنود
// بابًا مباشرًا بين المجلس والطعام، وقرأ المراجع النص الفارغ فعدّ الباب «طعامًا عائليًا» ورفض. الحل: قراءة واحدة بمعانٍ منفصلة ومصدر لكل قيد:
//   NEAR        — قرب أو تجاور («قريب من»، «جنب»، «بجانب»، «بجوار») — لا يفرض بابًا.
//   DIRECT_DOOR — باب مباشر صريح («المجلس يفتح على الطعام»، «باب بين المجلس والطعام»، «متصل بـ»، «المجلس على الطعام»).
//   GUEST_ACCESS— وظيفة طعام للضيوف مرتبطة بالمجلس يصلها الضيف دون عبور العائلة («مقلط»، «طعام الضيوف»، «سفرة الضيوف») — لا تفرض بابًا (01b).
//   FAR         — بعد أو فصل («بعيد عن»، «منفصل عن»).
// كل علاقة: { id, kind, from, to, level: HARD|SOFT, source: 'client'|'rule', quote }. لا تُستبدل أي قراءة أخرى في extractRequirements.
// وحدة نقية بلا أرقام حالات.

export const RELATIONS = Object.freeze({ NEAR: 'NEAR', DIRECT_DOOR: 'DIRECT_DOOR', GUEST_ACCESS: 'GUEST_ACCESS', FAR: 'FAR' });
export const LEVELS = Object.freeze({ HARD: 'HARD', SOFT: 'SOFT', ADVISORY: 'ADVISORY' });
export const SHARED_BRIEF_VERSION = 'mizan-shared-brief/r21.2'; // (01b) «مقلط» وظيفة لا باب، والعلاقات من المحلل

const norm = s => String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');

/** عدد التصاميم الذي طلبه العميل نصًا («ثلاثة تصاميم»، «5 بدائل»)؛ null إن لم يذكره. (من kit parseRequestedCount مع تطبيع التاء والهمزة) */
export function parseRequestedCount(text, maximum = 10) {
  const t = norm(text);
  const W = { واحد: 1, واحده: 1, اثنين: 2, اثنان: 2, ثنين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6 };
  const m = /(?:^|[\s،,:])(\d{1,2}|واحده|واحد|اثنين|اثنان|ثنين|ثلاثه|ثلاث|اربعه|اربع|خمسه|خمس|سته|ست)\s+(?:تصاميم|تصميمات|تصميم|بدائل|بديل|مخططات|اقتراحات|خيارات)(?=[\s،,.:]|$)/u.exec(t);
  // (تكامل شرعاء، قرار المالك 2026-10-31 — requestedDesignCount) صيغة المثنى العربية بلا عدد: «تصميمين/تصميمان/بديلين/مخططين/خيارين/اقتراحين» = 2
  if (!m) return /(?:^|[\s،,:])(?:تصميمين|تصميمان|بديلين|بديلان|مخططين|مخططان|خيارين|خياران|اقتراحين|اقتراحان)(?=[\s،,.:]|$)/u.test(t) && 2 <= maximum ? 2 : null;
  const n = /\d/.test(m[1]) ? Number(m[1]) : W[m[1]];
  return Number.isInteger(n) && n >= 1 && n <= maximum ? n : null;
}

// إشارات الباب المباشر والضيافة بين المجلس والطعام (بعد التطبيع)
const GUEST_RE = /مقلط|مقالط|طعام (?:ال)?ضيوف|سفره (?:ال)?ضيوف/;
const DOOR_RE = /(?:المجلس|مجلس الرجال) (?:يفتح علي|يفتح على|متصل ب|علي|على) ?(?:ال)?(?:طعام|سفره)|(?:الطعام|السفره) (?:يفتح علي|يفتح على|متصل ب) ?(?:ال)?مجلس|باب (?:مباشر )?بين (?:ال)?مجلس (?:و)?(?:ال)?(?:طعام|سفره)/;
const quoteOf = (text, re) => { const m = re.exec(norm(text)); return m ? m[0] : null; };

/**
 * (الجولة 21 — 01b، قرار المالك 2026-10-26: «وحّد تفسير مجلس رجال بمقلط») القراءة الوحيدة لعلاقة المجلس بالطعام من نص العميل — يستدعيها
 * محلل المتطلبات (requirements.mjs) فتُحفظ قيودًا مهيكلة بمصدرها في الطلب، ويبني منها العقد، ولا يعيد المولّد أو المراجع تفسير النص:
 *   «مقلط/طعام الضيوف/سفرة الضيوف» ⇐ GUEST_ACCESS: **وظيفة طعام للضيوف مرتبطة بالمجلس** يصلها الضيف دون عبور العائلة؛ الباب المباشر والغرفة
 *     المنفصلة «غير محددين» (unspecified) — لا يُفرضان لفظًا (كانت «مقلط» تُقرأ بابًا مباشرًا في المراجع: H3).
 *   «المجلس يفتح على الطعام/باب بين المجلس والطعام/متصل بـ» ⇐ DIRECT_DOOR: باب مباشر صريح.
 *   «قريب من المجلس» ⇐ NEAR (من بنود القرب في المحلل) — ليس بابًا.
 */
export function readGuestRelations(text = '') {
  const t = norm(text), out = [];
  if (GUEST_RE.test(t)) out.push({ id: 'guest-dining-client', kind: RELATIONS.GUEST_ACCESS, from: 'majlis', to: 'dining', level: LEVELS.HARD, source: 'client', quote: quoteOf(text, GUEST_RE), function: 'guest_dining', directDoor: 'unspecified', separateRoom: 'unspecified' });
  if (DOOR_RE.test(t)) out.push({ id: 'majlis-dining-door-client', kind: RELATIONS.DIRECT_DOOR, from: 'majlis', to: 'dining', level: LEVELS.HARD, source: 'client', quote: quoteOf(text, DOOR_RE), directDoor: 'required' });
  return out;
}
/**
 * يبني العقد الموحد من نص العميل ومن قراءة extractRequirements (البنود والمقاسات وعلاقات المجلس بالطعام) دون حذف أي منها.
 * المقاسات: { room, width, length, tolerance, quote, source } — السماحية كما قرأها المحلل (لا تُصفَّر).
 */
export function buildSharedBrief(text = '', extracted = {}) {
  const relations = [];
  const add = r => relations.push({ id: r.id || `rel-${relations.length + 1}`, level: LEVELS.SOFT, source: 'client', quote: null, ...r });
  // (01b) القيود المهيكلة من المحلل إن وُجدت (القراءة الوحيدة)، وإلا الدالة نفسها على النص (مستدعٍ قديم بلا محلل)
  for (const r of Array.isArray(extracted.relations) ? extracted.relations : readGuestRelations(text)) add(r);
  for (const r of extracted.rules || []) {
    if (r.negated || r.mode === 'avoid') continue;
    const kind = r.kind === 'near' || r.kind === 'adjacent' ? RELATIONS.NEAR : r.kind === 'far' || r.kind === 'apart' ? RELATIONS.FAR : null;
    if (!kind || !r.a || !r.b) continue;
    add({ id: r.id, kind, from: r.a, to: r.b, level: r.level === 'must' ? LEVELS.HARD : LEVELS.SOFT, source: 'client', quote: r.quote || r.text || null, adjacent: r.kind === 'adjacent' });
  }
  const dimensions = Object.entries(extracted.dims || {}).filter(([, d]) => d && d.w > 0 && d.l > 0)
    .map(([room, d]) => ({ room, width: Math.min(d.w, d.l), length: Math.max(d.w, d.l), tolerance: Number.isFinite(d.tol) ? d.tol : .05, quote: d.quote || null, source: 'client' }));
  return Object.freeze({ version: SHARED_BRIEF_VERSION, text: String(text || ''), relations: Object.freeze(relations.map(r => Object.freeze(r))), dimensions: Object.freeze(dimensions), requestedCount: parseRequestedCount(text) });
}
/** العقد الموحد لطلب: المحفوظ فيه، أو يُبنى من نصه وبنوده (للمستدعين القدامى) مرة واحدة لكل طلب. المولّد والمراجع يقرآن هذه الدالة نفسها. */
const BRIEF_MEMO = new WeakMap();
export const briefOf = req => {
  if (req?.brief?.version === SHARED_BRIEF_VERSION) return req.brief;
  if (req && typeof req === 'object') { if (!BRIEF_MEMO.has(req)) BRIEF_MEMO.set(req, buildSharedBrief(req.text || req.idea || '', req)); return BRIEF_MEMO.get(req); }
  return buildSharedBrief('', {});
};
/** (حزمة المالك shared-brief.mjs canonicalBrief/assertSharedBrief، مكيَّفتان) العقد الواحد للمولّد والمراجع، والتحقق أنهما الكائن نفسه. */
export const canonicalBrief = req => briefOf(req);
export function assertSharedBrief(generatorBrief, reviewerBrief) { if (!generatorBrief || generatorBrief !== reviewerBrief) throw Error('Generator/reviewer briefs differ'); return true; }
const isMajlis = x => /^majlis/.test(String(x || '')), isDining = x => String(x || '') === 'dining';
const pairMD = r => (isMajlis(r.from) && isDining(r.to)) || (isDining(r.from) && isMajlis(r.to));
/** هل طلب العميل بابًا مباشرًا أو طعامًا للضيوف بين المجلس والطعام؟ (NEAR وحده لا يكفي) */
// (01b) الباب المباشر من نص صريح فقط (DIRECT_DOOR)؛ «مقلط» (GUEST_ACCESS) وظيفة طعام للضيوف لا باب — وكان يُعدّ بابًا هنا
const OFF_01B = String(globalThis.process?.env?.R14_OFF || '').split(',').includes('r21maqlat'); // مفتاح القياس فقط: سلوك 01
export const briefMajlisDoor = brief => (brief?.relations || []).some(r => (r.kind === RELATIONS.DIRECT_DOOR || (OFF_01B && r.kind === RELATIONS.GUEST_ACCESS)) && pairMD(r));
/** (01b) هل طلب العميل وظيفة طعام للضيوف مرتبطة بالمجلس («مقلط»)؟ تُقاس بوصول الضيف دون عبور العائلة (GUEST_DINING) لا بباب. */
export const briefGuestDining = brief => (brief?.relations || []).some(r => r.kind === RELATIONS.GUEST_ACCESS && pairMD(r));
/** طلب المراجعة من العقد نفسه (kit sharedReviewRequest): النص والعقد معًا، فلا يعيد المراجع تفسير الطلب بقراءة أخرى. */
export function sharedReviewRequest(requirements, land, counts) {
  const brief = briefOf(requirements);
  return { text: brief.text, brief, counts: { ...(counts || {}), ...(requirements?.counts || {}) }, land: land || {}, prefs: requirements?.prefs || {} };
}
export default { RELATIONS, LEVELS, SHARED_BRIEF_VERSION, parseRequestedCount, readGuestRelations, buildSharedBrief, briefOf, canonicalBrief, assertSharedBrief, briefMajlisDoor, briefGuestDining, sharedReviewRequest };
