// (الجولة التاسعة عشرة — شرط المالك) معيار «مختلف معماريًا» و«بديل جديد» مجمّدًا قبل أدلة الحالات المحجوزة. الوثيقة:
// docs/research/arch-difference-criterion-r19.md. القياس نفسه dist/arch-difference.mjs (archDifferenceV2، الإصدار المذكور أدناه)؛ هذا الملف
// يثبّت الأبعاد والعتبات والقاعدة، ولا يُغيَّر بعد التجميد في هذه الجولة (بصمته في evidence/acceptance/after-19/FREEZE.json).
import { archSignatureV2, archDifferenceV2, ARCH_DIFF_V2_VERSION, DIMENSIONS_V2, SUBSTANTIVE_V2 } from './arch-difference.mjs';

export const ARCH_CRITERION_R19 = Object.freeze({
  version: 'arch-criterion/r19.1',
  measure: ARCH_DIFF_V2_VERSION,
  // الأبعاد المحتسبة (من المستند المرسوم، لكل دور، الأرضي 0.6 والعلوي 0.4):
  //  zoning: موضع نطاقات الوظائف (ضيافة/عائلة/نوم/خدمة) في العمق والعرض وعلى الشارع/الحديقة، وتجاور النطاقات (رسم التجاور)
  //  circulation: رسم الأبواب والحركة: نوع التوزيع، وقطع الممرات، وعمق غرف النوم بالخطوات، وحلقات الحركة، وتسلسل المداخل
  //  privacy: تدرج النطاقات من الأعم إلى الأخص بالأبواب، وفصل الضيوف عن العائلة، والوصول إلى مجلس النساء
  //  relations: علاقات الضيافة والعائلة والخدمة (المجلس↔الطعام، المطبخ↔الطعام، المدخل↔الصالة، الخادمة↔المطبخ…) بمستوى الاتصال
  dimensions: DIMENSIONS_V2,
  thresholds: SUBSTANTIVE_V2, // البعد «جوهري» إن بلغ عتبته
  distinctMinSubstantive: 2, // «مختلف معماريًا» = بعدان جوهريان على الأقل
  // لا تُحتسب بذاتها: الإحداثيات والإزاحة، والقياس (تكبير/تصغير المقاسات)، والانعكاس، والواجهة ومادتها، وشكل الغلاف، وموضع السلم
  notCounted: ['translation', 'scale', 'mirror', 'facade', 'envelope', 'stairPosition'],
  // «بديل جديد» = مختلف معماريًا عن كل بديل للحالة نفسها في المرحلة السابقة، ومعروض بحالة غير «محجوب» وبلا مخالفة إلزامية
  newAlternative: 'distinct-from-every-previous-alternative-of-the-same-case',
});
/** حكم المعيار المجمّد على مستندين (أو توقيعين). */
export function sameOrDifferent(a, b) {
  const d = archDifferenceV2(a.version ? a : archSignatureV2(a), b.version ? b : archSignatureV2(b));
  const substantive = ARCH_CRITERION_R19.dimensions.filter(k => d[k] >= ARCH_CRITERION_R19.thresholds[k]);
  return { different: substantive.length >= ARCH_CRITERION_R19.distinctMinSubstantive, substantive, dims: Object.fromEntries(ARCH_CRITERION_R19.dimensions.map(k => [k, d[k]])), total: d.total, verdict: d.verdict };
}
export default { ARCH_CRITERION_R19, sameOrDifferent };
