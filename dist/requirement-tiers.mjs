// Mizan three-tier classification of the client's own conditions.
//
// Every condition the client states (a hard input in the form, a choice from the
// "what I avoid" / lifestyle lists, a shape pick, or a clause in the free-text
// request) is placed in exactly one declared tier, by a deterministic rule that is
// shown to the client next to the row. Nothing here guesses intent: a condition is
// MANDATORY only when it is a hard input or the client's own wording carries an
// explicit obligation word; otherwise it is an IMPORTANT preference, or COSMETIC
// when it is a shape pick or a purely visual/taste remark.
//
// The tier says how much the condition matters. It never says whether the drawn
// plan satisfies it: that is the separate outcome, derived only from the evidence
// status computed by requirement-evidence.mjs (never promoted to a pass here).
// Pure and browser-safe: no imports, no DOM, no I/O.

export const TIER = Object.freeze({ MANDATORY: 'MANDATORY', IMPORTANT: 'IMPORTANT', COSMETIC: 'COSMETIC' });
export const TIER_ORDER = Object.freeze(['MANDATORY', 'IMPORTANT', 'COSMETIC']);
export const TIER_LABELS = Object.freeze({ MANDATORY: 'إلزامي', IMPORTANT: 'تفضيل مهم', COSMETIC: 'خيار شكلي' });

export const OUTCOME = Object.freeze({ MET: 'MET', NOT_MET: 'NOT_MET', UNPROVABLE: 'UNPROVABLE' });
export const OUTCOME_ORDER = Object.freeze(['MET', 'NOT_MET', 'UNPROVABLE']);
export const OUTCOME_LABELS = Object.freeze({ MET: 'مستوفى', NOT_MET: 'غير مستوفى', UNPROVABLE: 'غير قابل للإثبات' });

// Shown to the client verbatim so the classification is never a black box.
export const TIER_RULES = Object.freeze({
  MANDATORY: 'مدخل صلب أدخلته في النموذج (برنامج الغرف، عدد الأدوار، سقف المساحة)، أو عبارة في نصك فيها صيغة إلزام صريحة مثل «يجب» و«لازم» و«لا بد» و«ممنوع».',
  IMPORTANT: 'كل رغبة أخرى صرّحت بها: اختياراتك في «ما أتجنّبه» وأسلوب الحياة، وعبارات مثل «لا أريد» و«أفضّل» و«أبي» بلا صيغة إلزام.',
  COSMETIC: 'اختيار شكل الكتلة، أو عبارة تخص المظهر والذوق فقط (لون، واجهة، تشطيب، ديكور) بلا أثر وظيفي مذكور، أو عبارة وصفتها بنفسك بأنها «شكلية».',
});
export const OUTCOME_RULES = 'الحالة تُحسب من الدليل الهندسي فقط: «مستوفى» حين يطابق الرسم الشرط بقياس مباشر، «غير مستوفى» حين يخالفه الرسم، و«غير قابل للإثبات» حين لا يكفي النموذج الحالي (قياس بلا عتبة، أو بيانات ناقصة، أو ميزة غير مدعومة) لإثبات الاستيفاء أو نفيه. لا يُعد أي شرط مستوفى بالتخمين.';

export const normalizeArabic = value => String(value ?? '').toLowerCase()
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ').trim();

export const clip = (value, max = 90) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
};

// Evidence status -> the three client-facing outcomes. Only a direct "ENFORCED"
// is ever a met condition; a measurement without a verdict is not proof.
export function outcomeOfStatus(status) {
  if (status === 'ENFORCED') return OUTCOME.MET;
  if (status === 'NOT_MET') return OUTCOME.NOT_MET;
  return OUTCOME.UNPROVABLE;
}

// ---- Signals (applied to normalized text: alef/ya/ta-marbuta unified, no tashkeel) ----
// "مطلوب" is deliberately absent: it also means "the requested size/amount" and would
// over-promote ordinary wishes to mandatory.
const MUST = /(?:^|[^ء-ي])(?:ال)?(?:يجب|يلزم|لازم|لا ?بد|ضروري|الزامي|شرط اساسي|شرط لازم|ممنوع|يمنع|لا يجوز|ابدا|اشترط)(?![ء-ي])|(?:^|[^a-z])(?:must|required|mandatory|never|non-negotiable)(?![a-z])/;
const NEGATED_MUST = /(?:^|\s)(?:مو|مب|مش|ليس|لا|ما)\s+(?:من\s+)?(?:ال)?(?:لازم|ضروري|يجب|يلزم|شرط)/;
const COSMETIC_LABEL = /(?:^|[^ء-ي])(?:شكلي|شكليه|جمالي|جماليه|تجميلي)(?![ء-ي])/;
const COSMETIC_WORDS = /(?:لون|الوان|واجهه|تشطيب|ديكور|طراز|زخرف|مظهر|جمال|فخامه|ستايل|style|facade|colou?r|finish|look)/;
// A remark that touches function (rooms, routes, openings, sun, privacy...) is never
// treated as purely cosmetic even if it also mentions a visual word.
const STRUCTURAL = /(?:غرف|نوم|ممر|مسار|ضيوف|ضيافه|مجلس|مطبخ|نافذ|نوافذ|شباك|شمس|غرب|شرق|شمال|جنوب|شارع|جار|ارتداد|خصوص|عزل|مساحه|ابعاد|دور|مدخل|باب|حمام|تهويه|اضاءه|ضوء|توسع|سلم|مواقف|حركه|مسبح|فناء|باحه)/;
const CONDITION_MARKER = /(?:اريد|ابي|ابغي|ابغا|نريد|ودي|احب|افضل|ارغب|يهمني|يهمنا|لا اريد|لا ابي|ما ابي|ما ابغي|ما احب|بدون|دون|تجنب|اتجنب|بعيد|قريب|يجب|لازم|لا ?بد|ضروري|ممنوع|يمنع|want|need|must|avoid|without|prefer|don't|dont)/;

// A plain refusal ("لا أريد ...", "ما أبي ..."). It stays an IMPORTANT preference (the
// client did not use an obligation word) but is flagged `asMandatory` so it is treated
// as equivalent to a mandatory condition, and the client is told so on the row.
const REFUSAL_WISH = /(?:^|\s)(?:لا|ما)\s+(?:اريد|ابي|ابغي|ابغا|نريد|ودي|احب|ارغب)(?![ء-ي])/;
export const isRefusalWish = normalized => REFUSAL_WISH.test(normalized);
export const AS_MANDATORY_LABEL = 'بمثابة إلزامي';
export const AS_MANDATORY_RULE = 'النفي الصريح («لا أريد» و«ما أبي») يبقى «تفضيل مهم» لأنه بلا صيغة إلزام، لكنه يُعامل بمثابة الإلزامي، وتُوسَم صفوفه بـ«بمثابة إلزامي».';

// Split free text into clauses, on punctuation and on a conjunction that starts a
// new request ("... و أبي ..."). Original wording is kept for display.
export function splitClauses(text) {
  return String(text ?? '')
    .split(/[،,؛;.!؟?\n]+|\s+و(?=\s*(?:[أا]ب[يى]|[أا]بغ[ىاي]|[أا]ريد|[أا]حب|[أا]رغب|ودي|نريد|لا\s|ما\s))/)
    .map(clause => clause.trim())
    .filter(clause => clause.length >= 3);
}

export const isConditionClause = clause => clause.length >= 6 && CONDITION_MARKER.test(normalizeArabic(clause));

export const hasMustSignal = text => {
  const n = normalizeArabic(text);
  return MUST.test(n) && !NEGATED_MUST.test(n);
};

/** Classify one clause of the client's own wording. Deterministic; declared in TIER_RULES. */
export function classifyClause(clause, { fallbackBasis = null } = {}) {
  const text = String(clause ?? '').trim();
  const n = normalizeArabic(text);
  const quote = '«' + clip(text) + '»';
  if (MUST.test(n) && !NEGATED_MUST.test(n)) {
    return { tier: TIER.MANDATORY, basis: 'صيغة إلزام صريحة في نصك: ' + quote + '.' };
  }
  if (COSMETIC_LABEL.test(n) || (COSMETIC_WORDS.test(n) && !STRUCTURAL.test(n))) {
    return { tier: TIER.COSMETIC, basis: 'عبارة تخص المظهر أو الذوق فقط بلا أثر وظيفي مذكور، أو وصفتها بأنها شكلية: ' + quote + '.' };
  }
  if (isRefusalWish(n)) {
    return { tier: TIER.IMPORTANT, asMandatory: true, basis: 'نفي صريح في نصك: ' + quote + '. لم نصنّفه «إلزامي» لأنه خلا من صيغة إلزام، لكنه يُعامل بمثابة الإلزامي.' };
  }
  return { tier: TIER.IMPORTANT, basis: fallbackBasis || ('رغبة صريحة في نصك بلا صيغة إلزام: ' + quote + '.') };
}

/**
 * Tier for a condition identified by a topic pattern. Looks at the client's own
 * clauses about that topic: an explicit obligation anywhere wins (MANDATORY);
 * otherwise a pick from a fixed list or any stated wish is IMPORTANT, and only a
 * purely visual remark is COSMETIC. Returns null when the client said nothing
 * about the topic and made no matching choice.
 */
export function tierForTopic({ clauses = [], topic, choice = null, fallbackBasis = null } = {}) {
  const matches = clauses.filter(clause => topic.test(normalizeArabic(clause))).map(clause => classifyClause(clause, { fallbackBasis }));
  const mandatory = matches.find(item => item.tier === TIER.MANDATORY);
  if (mandatory) return mandatory;
  const refusal = matches.find(item => item.asMandatory);
  if (refusal) return refusal;
  if (choice) return { tier: TIER.IMPORTANT, basis: choice.basis };
  return matches.find(item => item.tier === TIER.IMPORTANT) || matches[0] || null;
}

/** Counts per tier and outcome over tiered rows only; untiered engine checks are reported apart. */
export function summarizeTiers(rows = []) {
  const blank = () => ({ MET: 0, NOT_MET: 0, UNPROVABLE: 0, total: 0 });
  const tiers = Object.fromEntries(TIER_ORDER.map(tier => [tier, blank()]));
  const outcomes = blank();
  let other = 0;
  for (const row of rows) {
    if (!row || !Object.hasOwn(tiers, row.tier)) { other++; continue; }
    const outcome = row.outcome || outcomeOfStatus(row.status);
    tiers[row.tier][outcome]++; tiers[row.tier].total++;
    outcomes[outcome]++; outcomes.total++;
  }
  return { tiers, outcomes, other };
}

export default { TIER, TIER_ORDER, TIER_LABELS, OUTCOME, OUTCOME_ORDER, OUTCOME_LABELS, TIER_RULES, OUTCOME_RULES,
  AS_MANDATORY_LABEL, AS_MANDATORY_RULE, isRefusalWish, normalizeArabic, clip, outcomeOfStatus, splitClauses, isConditionClause, hasMustSignal, classifyClause, tierForTopic, summarizeTiers };
