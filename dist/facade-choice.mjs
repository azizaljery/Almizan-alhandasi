// (طلب المالك 2026-10-31) اختيار طراز الواجهة في ملف الاحتياجات: قراءة الطراز من كلام العميل، وسجل الاختيار بمصدره.
// وحدة نقية صغيرة بلا هندسة (يستوردها ملف شرعاء دون المولّد). لا يُرسل شيء منها إلى محرك التوزيع: الطراز لا يغيّر المسقط.
export const FACADE_CHOICES = Object.freeze(['classic', 'neoclassic', 'modern', 'najdi', 'auto']);
export const FACADE_CHOICE_AR = Object.freeze({ classic: 'كلاسيكي', neoclassic: 'نيوكلاسيكي', modern: 'حديث (معاصر)', najdi: 'نجدي معاصر (مقترح)', auto: 'اختر لي' });
// الترتيب مهم: «نيو كلاسيك» قبل «كلاسيك»
const VOCAB = [
  ['neoclassic', /(?<![؀-ۿa-z])(?:ال)?نيو ?[-ـ]? ?كلاسي?ك(?:ي|يه|ية)?(?![؀-ۿ])|neo-? ?classic(?:al)?/i],
  ['classic', /(?<![؀-ۿa-z])(?:ال|بال|و)?كلاسي?ك(?:ي|يه|ية)?(?![؀-ۿ])|(?<![a-z-])classic(?:al)?/i],
  ['modern', /(?<![؀-ۿa-z])(?:ال|بال|و)?(?:مودرن|حديث(?:ه|ة)?|عصري(?:ه|ة)?|معاصر(?:ه|ة)?)(?![؀-ۿ])|\b(?:modern|contemporary)\b/i],
  ['najdi', /(?<![؀-ۿa-z])(?:ال|بال|و)?(?:نجدي(?:ه|ة)?|سلماني(?:ه|ة)?)(?![؀-ۿ])|\b(?:najdi|salmani)\b/i],
];
const FACADE_CUE = /(?:واجه[هة]|واجهات|الواجه|طراز|ستايل|تصميم خارجي|الخارج|facade|elevation|exterior|style)/i;
/**
 * طراز الواجهة من نص العميل — فقط إن ذُكرت الواجهة/الطراز في الجملة نفسها (لا يُفهم «مطبخ حديث» طرازًا للواجهة).
 * يعيد { style, quote } أو null.
 */
export function facadeStyleFromText(text = '') {
  for (const clause of String(text).split(/[.،,؛;!?\n]+/)) {
    if (!FACADE_CUE.test(clause)) continue;
    for (const [id, re] of VOCAB) { const m = clause.match(re); if (m) return { style: id, quote: clause.trim().slice(0, 160) }; }
  }
  return null;
}
/** سجل الاختيار كما يحمله ملف الاحتياجات إلى جلسة التصميم: القيمة ومصدرها وأولويتها ونص العميل وتاريخ التغيير. */
export function facadeChoiceRecord(value, meta = {}, prev = null) {
  if (!FACADE_CHOICES.includes(value)) throw Error('طراز غير معروف: ' + value);
  const history = [...(prev?.history || []), ...(prev && prev.style !== value ? [{ style: prev.style, source: prev.source }] : [])].slice(-20);
  return { style: value, ornament: meta.ornament || prev?.ornament || 'medium', source: meta.source || 'client_answer', priority: 'flexible', ...(meta.originalText ? { originalText: meta.originalText } : {}), ...(meta.color ? { color: meta.color } : prev?.color ? { color: prev.color } : {}), history };
}
/** طراز محفوظ في المستند من طلب نصي سابق (plan-edit: «واجهة نجدية/سلمانية/كلاسيك/حديثة») ← أحد الطرز المرسومة أو null. */
export const RENDERED_STYLE_OF = Object.freeze({ classic: 'classic', neoclassic: 'neoclassic', modern: 'modern', najdi: 'najdi', salmani: 'najdi' });
/** الافتراضي حين لم يختر العميل: «اختر لي» بمصدر design_default — لا يحجب أي تصميم ولا يُعدّ طلبًا من العميل. */
export const DEFAULT_FACADE_CHOICE = Object.freeze({ style: 'auto', ornament: 'medium', source: 'design_default', priority: 'flexible', history: [] });

export default { FACADE_CHOICES, FACADE_CHOICE_AR, facadeStyleFromText, facadeChoiceRecord, DEFAULT_FACADE_CHOICE };
