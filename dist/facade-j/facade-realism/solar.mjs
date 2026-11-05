// تحليل الاتجاه الشمسي للواجهة الأمامية (جهة المدخل) من مستند المرسم.
// الاتجاه الحقيقي لوجه جدار = (atan2(vx, vy) بالدرجات + doc.north) mod 360، حيث v اتجاه الواجهة الخارجي في المخطط
// (التعريف نفسه في draw/digest.mjs). التصنيف أدناه قواعد هندسية عامة لمناخ السعودية الحار (شمال الكرة الأرضية)،
// وليس حسابًا فلكيًا ولا اشتراطًا في كود: «غير متحقق» ضد أي مرجع رسمي.
const SIDE_VEC = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] };
export const bearingOf = (side, north = 0) => { const v = SIDE_VEC[side] || SIDE_VEC.s; return ((Math.atan2(v[0], v[1]) * 180 / Math.PI + (Number(north) || 0)) % 360 + 360) % 360; };
const C8 = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
export const compass8 = b => C8[Math.round((((b % 360) + 360) % 360) / 45) % 8];
// خطر الحرارة والوهج لكل قطاع 45°
const RISK = {
  'شمال': ['IDEAL_DIFFUSED_LIGHT', 0, 'ضوء منتشر هادئ؛ لا حاجة لتظليل خاص'],
  'شمال شرق': ['LOW', 1, 'شمس صباح مبكر فقط في الصيف'],
  'شرق': ['MODERATE_MORNING_SUN', 2, 'شمس صباحية مباشرة؛ يفيد ساتر رأسي أو لوفرات'],
  'جنوب شرق': ['MODERATE', 2, 'صباح ومنتصف النهار؛ يفيد حاجب أفقي'],
  'جنوب': ['HIGH_MIDDAY_SUN', 3, 'شمس عالية وقت الظهيرة صيفًا؛ يعالجها كابولي أو حاجب أفقي عميق'],
  'جنوب غرب': ['HIGH_AFTERNOON_SUN', 4, 'شمس عصر قوية؛ يلزم تظليل رأسي ومشربية'],
  'غرب': ['CRITICAL_WEST_GLARE', 5, 'أشد الاتجاهات حرارة ووهجًا؛ يلزم ساتر مثقب أو مشربية وتقليل الزجاج'],
  'شمال غرب': ['MODERATE_LOW_SUN', 3, 'شمس غروب منخفضة صيفًا؛ يفيد ساتر رأسي'],
};
/** @returns {{side,bearing,compass,risk,level,requiresSelfShading,note,advice:{styles:string[],screen:boolean,hint:string}}} */
export function analyzeSolar(doc) {
  const side = (Array.isArray(doc?.entries) && doc.entries[0]) || doc?.entry || 's', north = Number(doc?.north) || 0;
  const bearing = bearingOf(side, north), compass = compass8(bearing), [risk, level, note] = RISK[compass];
  const hot = level >= 3;
  return {
    side, bearing: Math.round(bearing), compass, risk, level, requiresSelfShading: hot, note,
    // أنماطنا الأنسب للظل الذاتي: روشان (H) وفتحات غائرة عميقة (N) وسلماني (S)؛ وللمعاصر: الساتر التموجي المثقب/دروة الظل
    advice: { styles: hot ? ['H', 'N', 'S'] : [], screen: hot, hint: hot ? 'الواجهة الأمامية تواجه ' + compass + ': ' + note : 'الواجهة الأمامية تواجه ' + compass + ': ' + note },
  };
}
