// (الجولة الثالثة عشرة) الاشتراطات النظامية المتحققة المربوطة بالكود — من بحث data/regulations-sa.json (docs/research/
// saudi-residential-regulations-2026-10-21.md). لا يُربط هنا إلا بند مستواه «أ» (نص رسمي + مصدر ثانٍ مستقل): ارتداد الجار 1.5 م،
// الارتداد الأمامي خُمس عرض الشارع (≥ 3 م، و≥ 6 م لشوارع ≥ 30 م)، ونسبة البناء 75%. عدد المواقف في dist/site-parking.mjs (PARKING_RULE).
// الزجاج 8% مستواه «ب» (OCR مشوّه + مصدر ثانوي): لا يُعدَّل به أي بوابة؛ «ملاحظة نظامية محتملة» فقط في المراجعة (plan-review).
// كل بند يحمل item (مفتاحه في ملف البحث) وsource وurl وlevel، والاختبار tests/regulations-sa.test.mjs يطابقه مع ملف البحث.
// القيمة الوطنية: المخطط المعتمد أو الأمانة قد يغيّرها (note_ar) — لا يُدّعى غير ذلك.

const M = 'اشتراطات إنشاء المباني السكنية — وزارة البلديات والإسكان، قرار 4500943139/1 (1446هـ)';
const OKAZ = 'https://www.okaz.com.sa/ampArticle/2165939';
const MOMAH = 'https://momah.gov.sa/sites/default/files/2024-07/ashtratat%20a%27nsha%20almbany%20alsknyt%20almnshwrt%20%60ly%20mwq%60%20alwzart%20.pdf';
export const REG_NOTE_AR = 'الحد الوطني؛ المخطط المعتمد أو الأمانة قد يغيّره.';
export const REG_TIER_AR = 'اشتراط نظامي متحقق';

/** ارتداد الجار (وممرات المشاة): لا يقل عن 1.5 م — المستوى أ. */
export const SETBACK_NEIGHBOUR = Object.freeze({
  item: 'setback.neighbour', value: 1.5, unit: 'm', tier: 'regulation', level: 'official-confirmed',
  source: M + ' §4-1.4؛ عكاظ حرفيًا «الارتداد جهة المجاورين وممرات المشاة لا يقل عن 1.5 متر»؛ الوطن «من 2 م إلى 1.5 م» (2024-07-15)',
  url: OKAZ, note_ar: REG_NOTE_AR,
});
/** الارتداد الأمامي: خُمس عرض الشارع ولا يقل عن 3 م (شوارع < 30 م)، ولا يقل عن 6 م لشوارع 30 م فأكثر — المستوى أ. */
export const SETBACK_FRONT = Object.freeze({
  item: 'setback.front.street_lt_30m', item30: 'setback.front.street_ge_30m', min: 3, min30: 6, wide: 30, ratio: 1 / 5, unit: 'm', tier: 'regulation', level: 'official-confirmed',
  source: M + ' §4-1.4 و§4-1.5؛ عكاظ حرفيًا (2024-07-15)', url: OKAZ, note_ar: REG_NOTE_AR,
  // الافتراض حين يجهل عرض الشارع: 3 م (قيمة تصميمية افتراضية للميزان تطابق النظامي لشوارع ≤ 15 م فقط)
  defaultValue: 3,
});
/** نسبة البناء القصوى للدور الأرضي (شاملًا الملاحق الأرضية) 75% من مساحة الأرض — المستوى أ. */
export const COVERAGE_MAX = Object.freeze({
  item: 'coverage.ground_floor_max', value: 75, unit: '%', tier: 'regulation', level: 'official-confirmed',
  source: M + ' §4-1.1؛ عكاظ والوطن والاقتصادية ومال (2024-07-15)', url: OKAZ, note_ar: REG_NOTE_AR,
});
/** الزجاج ≥ 8% من مساحة أرضية الغرفة — المستوى ب (OCR مشوّه + مصدر ثانوي): ملاحظة نظامية محتملة لا بوابة. */
export const GLAZING_MIN = Object.freeze({
  item: 'daylight.glazing_min_ratio', value: 8, unit: '%', tier: 'regulation-probable', level: 'official-ocr+secondary',
  source: M + ' §5-1-15.2 (النص المستخرج آليًا يُسقط اللام: «ألا تق… عن 8%») + mentorksa.com «لا تقل عن 8%»',
  url: MOMAH, note_ar: 'مستوى ب: لم يُطابَق النص الرسمي يدويًا؛ تُعرض ملاحظة محتملة ولا تُبدَّل بوابة الرفض (3%) حتى قرار المالك.',
});

export const REGULATIONS = Object.freeze({ SETBACK_NEIGHBOUR, SETBACK_FRONT, COVERAGE_MAX, GLAZING_MIN });

/**
 * الارتداد الأمامي المطلوب لعرض شارع (م). يعيد { value, tier, known, why_ar }:
 *  عرض معلوم → خُمس العرض ولا يقل عن 3 م (أو 6 م لشوارع ≥ 30 م) بطبقة «اشتراط نظامي متحقق»؛
 *  عرض مجهول → 3 م بطبقة «قيمة تصميمية افتراضية للميزان» (يُسأل العميل عن عرض الشارع).
 */
export function frontSetbackFor(streetWidth) {
  const w = Number(streetWidth);
  if (!(w > 0)) return { value: SETBACK_FRONT.defaultValue, tier: 'mizan-default', known: false, why_ar: `عرض الشارع غير معلوم: ${SETBACK_FRONT.defaultValue} م (قيمة تصميمية افتراضية للميزان؛ النظامي خُمس عرض الشارع ولا يقل عن 3 م، و6 م لشوارع ≥ 30 م)` };
  const v = Math.round(Math.max(w >= SETBACK_FRONT.wide ? SETBACK_FRONT.min30 : SETBACK_FRONT.min, w * SETBACK_FRONT.ratio) * 100) / 100;
  return { value: v, tier: 'regulation', known: true, why_ar: `شارع ${w} م: الارتداد الأمامي ${v} م (${w >= SETBACK_FRONT.wide ? 'لا يقل عن 6 م لشوارع ≥ 30 م' : 'خُمس عرض الشارع ولا يقل عن 3 م'} — ${REG_TIER_AR})` };
}
/** سؤال الحوار حين يجهل عرض الشارع (يُعرض مع الطلب لا كتعارض). */
export const STREET_WIDTH_QUESTION_AR = 'عرض الشارع كم متر؟ رسمت الآن ارتدادًا أماميًا 3 م (قيمة تصميمية افتراضية للميزان)؛ الاشتراط النظامي خُمس عرض الشارع ولا يقل عن 3 م، و6 م للشوارع 30 م فأكثر.';
export function streetWidthQuestion(land = {}) {
  if (!Array.isArray(land.streets) || !land.streets.length) return null;
  if (Number(land.streetWidth) > 0) return null;
  return { type: 'street-width', key: 'land.streetWidth', soft: true, question_ar: STREET_WIDTH_QUESTION_AR };
}
/** يقرأ جواب «عرض الشارع 20 م» / «الشارع 15» / «20» (أرقام عربية أو هندية). يعيد العرض بالمتر أو null. */
export function parseStreetWidthAnswer(text = '') {
  const t = String(text).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
  const m = t.match(/(?:عرض\s*)?(?:ال)?شارع\w*\s*(?:عرضه?\s*)?(?:=|:)?\s*(\d+(?:[.,]\d+)?)\s*(?:م|متر|مترًا)?/) || t.match(/^(\d+(?:[.,]\d+)?)\s*(?:م|متر|مترًا)?$/);
  if (!m) return null;
  const w = Number(m[1].replace(',', '.'));
  return w >= 4 && w <= 120 ? w : null;
}

export default { REGULATIONS, SETBACK_NEIGHBOUR, SETBACK_FRONT, COVERAGE_MAX, GLAZING_MIN, frontSetbackFor, streetWidthQuestion, parseStreetWidthAnswer, REG_NOTE_AR, REG_TIER_AR };
