// (الجولة 21 — مقترح، مكيَّف من حزمة المالك kit-r21/src/brief.mjs) عقد الطلب الموحد بين المولّد والمراجع.
// السبب الجذري (docs/research/v3-diagnosis-r21.md §2، H6): المتطلبات لا تحمل نص العميل، فقرأ المولّد «طعام قريب من المجلس» من البنود
// بابًا مباشرًا بين المجلس والطعام، وقرأ المراجع النص الفارغ فعدّ الباب «طعامًا عائليًا» ورفض. الحل: قراءة واحدة بمعانٍ منفصلة ومصدر لكل قيد:
//   NEAR        — قرب أو تجاور («قريب من»، «جنب»، «بجانب»، «بجوار») — لا يفرض بابًا.
//   DIRECT_DOOR — باب مباشر صريح («المجلس يفتح على الطعام»، «باب بين المجلس والطعام»، «متصل بـ»، «المجلس على الطعام»).
//   GUEST_ACCESS— طعام للضيوف يصله الضيف دون عبور العائلة («مقلط»، «طعام الضيوف»، «سفرة الضيوف»).
//   FAR         — بعد أو فصل («بعيد عن»، «منفصل عن»).
// كل علاقة: { id, kind, from, to, level: HARD|SOFT, source: 'client'|'rule', quote }. لا تُستبدل أي قراءة أخرى في extractRequirements.
// وحدة نقية بلا أرقام حالات.

export const RELATIONS = Object.freeze({ NEAR: 'NEAR', DIRECT_DOOR: 'DIRECT_DOOR', GUEST_ACCESS: 'GUEST_ACCESS', FAR: 'FAR' });
export const LEVELS = Object.freeze({ HARD: 'HARD', SOFT: 'SOFT', ADVISORY: 'ADVISORY' });
export const SHARED_BRIEF_VERSION = 'mizan-shared-brief/r21.1';

const norm = s => String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');

/** عدد التصاميم الذي طلبه العميل نصًا («ثلاثة تصاميم»، «5 بدائل»)؛ null إن لم يذكره. (من kit parseRequestedCount مع تطبيع التاء والهمزة) */
export function parseRequestedCount(text, maximum = 10) {
  const t = norm(text);
  const W = { واحد: 1, واحده: 1, اثنين: 2, اثنان: 2, ثنين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6 };
  const m = /(?:^|[\s،,:])(\d{1,2}|واحده|واحد|اثنين|اثنان|ثنين|ثلاثه|ثلاث|اربعه|اربع|خمسه|خمس|سته|ست)\s+(?:تصاميم|تصميمات|تصميم|بدائل|بديل|مخططات|اقتراحات|خيارات)(?=[\s،,.:]|$)/u.exec(t);
  if (!m) return null;
  const n = /\d/.test(m[1]) ? Number(m[1]) : W[m[1]];
  return Number.isInteger(n) && n >= 1 && n <= maximum ? n : null;
}

// إشارات الباب المباشر والضيافة بين المجلس والطعام (بعد التطبيع)
const GUEST_RE = /مقلط|مقالط|طعام (?:ال)?ضيوف|سفره (?:ال)?ضيوف/;
const DOOR_RE = /(?:المجلس|مجلس الرجال) (?:يفتح علي|يفتح على|متصل ب|علي|على) ?(?:ال)?(?:طعام|سفره)|(?:الطعام|السفره) (?:يفتح علي|يفتح على|متصل ب) ?(?:ال)?مجلس|باب (?:مباشر )?بين (?:ال)?مجلس (?:و)?(?:ال)?(?:طعام|سفره)/;
const quoteOf = (text, re) => { const m = re.exec(norm(text)); return m ? m[0] : null; };

/**
 * يبني العقد الموحد من نص العميل ومن قراءة extractRequirements (البنود والمقاسات) دون حذف أي منها.
 * المقاسات: { room, width, length, tolerance, quote, source } — السماحية كما قرأها المحلل (لا تُصفَّر).
 */
export function buildSharedBrief(text = '', extracted = {}) {
  const relations = [];
  const add = r => relations.push({ id: r.id || `rel-${relations.length + 1}`, level: LEVELS.SOFT, source: 'client', quote: null, ...r });
  const t = norm(text);
  if (GUEST_RE.test(t)) add({ kind: RELATIONS.GUEST_ACCESS, from: 'majlis', to: 'dining', level: LEVELS.HARD, quote: quoteOf(text, GUEST_RE) });
  if (DOOR_RE.test(t)) add({ kind: RELATIONS.DIRECT_DOOR, from: 'majlis', to: 'dining', level: LEVELS.HARD, quote: quoteOf(text, DOOR_RE) });
  for (const r of extracted.rules || []) {
    if (r.negated || r.mode === 'avoid') continue;
    const kind = r.kind === 'near' || r.kind === 'adjacent' ? RELATIONS.NEAR : r.kind === 'far' || r.kind === 'apart' ? RELATIONS.FAR : null;
    if (!kind || !r.a || !r.b) continue;
    add({ id: r.id, kind, from: r.a, to: r.b, level: r.level === 'must' ? LEVELS.HARD : LEVELS.SOFT, source: 'client', quote: r.quote || r.text || null, adjacent: r.kind === 'adjacent' });
  }
  const dimensions = Object.entries(extracted.dims || {}).filter(([, d]) => d && d.w > 0 && d.l > 0)
    .map(([room, d]) => ({ room, width: Math.min(d.w, d.l), length: Math.max(d.w, d.l), tolerance: Number.isFinite(d.tol) ? d.tol : .05, quote: d.quote || null, source: 'client' }));
  return Object.freeze({ version: SHARED_BRIEF_VERSION, text: String(text || ''), relations: Object.freeze(relations), dimensions: Object.freeze(dimensions), requestedCount: parseRequestedCount(text) });
}
/** العقد الموحد لطلب: المحفوظ فيه، أو يُبنى من نصه وبنوده (للمستدعين القدامى). المولّد والمراجع يقرآن هذه الدالة نفسها. */
export const briefOf = req => req?.brief?.version === SHARED_BRIEF_VERSION ? req.brief : buildSharedBrief(req?.text || req?.idea || '', req || {});
const isMajlis = x => /^majlis/.test(String(x || '')), isDining = x => String(x || '') === 'dining';
const pairMD = r => (isMajlis(r.from) && isDining(r.to)) || (isDining(r.from) && isMajlis(r.to));
/** هل طلب العميل بابًا مباشرًا أو طعامًا للضيوف بين المجلس والطعام؟ (NEAR وحده لا يكفي) */
export const briefMajlisDoor = brief => (brief?.relations || []).some(r => (r.kind === RELATIONS.DIRECT_DOOR || r.kind === RELATIONS.GUEST_ACCESS) && pairMD(r));
/** طلب المراجعة من العقد نفسه (kit sharedReviewRequest): النص والعقد معًا، فلا يعيد المراجع تفسير الطلب بقراءة أخرى. */
export function sharedReviewRequest(requirements, land, counts) {
  const brief = briefOf(requirements);
  return { text: brief.text, brief, counts: { ...(counts || {}), ...(requirements?.counts || {}) }, land: land || {}, prefs: requirements?.prefs || {} };
}
export default { RELATIONS, LEVELS, SHARED_BRIEF_VERSION, parseRequestedCount, buildSharedBrief, briefOf, briefMajlisDoor, sharedReviewRequest };
