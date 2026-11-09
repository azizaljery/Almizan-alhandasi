// محرك الكميات والتحقق للمرسم (AR-02): يحسب من مستند الرسم الحالي لا من نموذج التوليد.
// كل رقم يحمل درجة صدق: measured (مقيس من الهندسة) | estimated (تقدير بافتراض معلن) | unavailable (لا يمكن حسابه من الرسم).
// نقي: لا DOM.
import { docToLegacy } from './export-legacy.mjs';
import { quantities } from '../planner.mjs';
import { calculateMizanScore } from '../mizan-score.mjs';
import { computeStructure } from './structure.mjs';

export const GRADES = Object.freeze({ measured: 'مقيس', estimated: 'تقدير بافتراض معلن', unavailable: 'غير قابل للحساب' });
export const ASSUMPTIONS = Object.freeze({ faces: 2, blocksPerM2: 12.5 });
const r2 = v => Math.round(v * 100) / 100;

export const POOL_DEPTH_ASSUMED = 1.4;
/** كميات الحديقة من القطع الخارجية: المساحات مقيسة من أبعادها، والحجم بعمق مفترض معلن. */
function gardenRows(doc) {
  const by = k => (doc.fixtures || []).filter(f => f.kind === k);
  const carports = by('carport'), pergolas = by('pergola'), bbqs = by('bbq'), fountains = by('fountain');
  const pools = by('pool'), falls = by('waterfall'), lawns = by('lawn'), planters = by('planter');
  const area = l => r2(l.reduce((a, f) => a + f.w * f.d, 0));
  const rows = [];
  if (pools.length) {
    rows.push({ id: 'poolArea', label: 'مساحة المسبح (مرآة الماء + الحافة)', value: area(pools), unit: 'م²', grade: 'measured', basis: `${pools.length} مسبح بأبعاده في الرسم` });
    rows.push({ id: 'poolVolume', label: 'حجم المسبح التقريبي', value: r2(pools.reduce((a, f) => a + f.w * f.d * POOL_DEPTH_ASSUMED, 0)), unit: 'م³', grade: 'estimated', basis: `افتراض: عمق ${POOL_DEPTH_ASSUMED} م منتظم؛ الحفر والعزل والترشيح غير محسوبة` });
  }
  if (falls.length) rows.push({ id: 'waterfalls', label: 'الشلالات', value: falls.length, unit: 'عدد', grade: 'measured', basis: 'قطع الشلال في الرسم؛ المضخة والتدوير غير محسوبة' });
  if (lawns.length) rows.push({ id: 'lawnArea', label: 'مساحة العشب', value: area(lawns), unit: 'م²', grade: 'measured', basis: `${lawns.length} مسطح عشبي بأبعاده في الرسم` });
  if (carports.length) rows.push({ id: 'carportArea', label: 'مساحة مظلة السيارات', value: area(carports), unit: 'م²', grade: 'measured', basis: `${carports.length} مظلة بأبعادها في الرسم؛ الهيكل والتسقيف غير محسوبين، وعرض الموقف 2.7 م افتراض تصميمي غير متحقق نظاميًا` });
  if (pergolas.length) rows.push({ id: 'pergolaArea', label: 'مساحة البرجولة', value: area(pergolas), unit: 'م²', grade: 'measured', basis: `${pergolas.length} برجولة بأبعادها في الرسم؛ الهيكل غير محسوب` });
  if (bbqs.length) rows.push({ id: 'bbqCount', label: 'أركان الشواء', value: bbqs.length, unit: 'عدد', grade: 'measured', basis: 'قطع في الرسم؛ التجهيزات غير محسوبة' });
  if (fountains.length) rows.push({ id: 'fountainCount', label: 'النوافير', value: fountains.length, unit: 'عدد', grade: 'measured', basis: 'قطع في الرسم؛ المضخة والتدوير غير محسوبين' });
  if (planters.length) rows.push({ id: 'planterLength', label: 'أطوال أحواض الزراعة', value: r2(planters.reduce((a, f) => a + Math.max(f.w, f.d), 0)), unit: 'م', grade: 'measured', basis: `${planters.length} حوض` });
  return rows;
}

export function computeDocQuantities(doc) {
  const levels = [];
  for (const lvl of doc.levels) {
    if (!doc.walls.some(w => w.level === lvl.id)) { levels.push({ id: lvl.id, name: lvl.name, empty: true }); continue; }
    try {
      const { model, report } = docToLegacy(doc, { level: lvl.id });
      const q = quantities(model);
      let score = null; try { score = calculateMizanScore(model); } catch { /* غير قابل */ }
      levels.push({ id: lvl.id, name: lvl.name, q, report, score, model });
    } catch (e) { levels.push({ id: lvl.id, name: lvl.name, error: e.message }); }
  }
  let structure = null; try { structure = computeStructure(doc); } catch { /* غير قابل */ }
  const ok = levels.filter(l => l.q);
  const sum = k => ok.reduce((a, l) => a + (l.q[k] || 0), 0);
  const rows = [
    { id: 'footprint', label: 'مساحة المسقط (حسب المحيط المرسوم)', value: r2(sum('footprint')), unit: 'م²', grade: 'measured', basis: 'مجموع مساحات محيط الأدوار المحوّلة' },
    { id: 'rooms', label: 'مساحة الغرف المسمّاة', value: r2(sum('rooms')), unit: 'م²', grade: 'measured', basis: 'مساحة صافية من الجدران' },
    { id: 'circulation', label: 'مساحة الممرات', value: r2(sum('circulation')), unit: 'م²', grade: 'measured', basis: 'كل فراغ سُمّي «ممر» في الرسم؛ يشمل أي حيّز محجوز مغلق داخله' },
    { id: 'wallArea', label: 'مساحة الجدران بعد خصم الفتحات (وجه واحد)', value: r2(sum('wallArea')), unit: 'م²', grade: 'measured', basis: 'طول × ارتفاع كل جدار ناقص فتحاته' },
    { id: 'wallVolume', label: 'حجم الجدران', value: r2(sum('wallVolume')), unit: 'م³', grade: 'measured', basis: 'مساحة الجدار الصافية × السماكة' },
    { id: 'doors', label: 'الأبواب', value: sum('doors'), unit: 'عدد', grade: 'measured', basis: 'فتحات الأبواب في الرسم' },
    { id: 'windows', label: 'النوافذ', value: sum('windows'), unit: 'عدد', grade: 'measured', basis: 'فتحات النوافذ في الرسم' },
    { id: 'finishArea', label: 'مساحة التشطيب الداخلي', value: r2(sum('wallArea') * ASSUMPTIONS.faces), unit: 'م²', grade: 'estimated', basis: `افتراض: وجهان لكل جدار (×${ASSUMPTIONS.faces}) دون خصم الجدران الخارجية` },
    { id: 'blocks', label: 'عدد البلوك التقريبي', value: Math.round(sum('wallArea') * ASSUMPTIONS.blocksPerM2), unit: 'قطعة', grade: 'estimated', basis: `افتراض: بلوك 20×40 سم = ${ASSUMPTIONS.blocksPerM2} قطعة/م² بلا هدر` },
    ...(structure && structure.totals.columns ? [
      { id: 'concreteColumns', label: 'خرسانة الأعمدة (تحجيم أولي)', value: structure.totals.concrete.columns, unit: 'م³', grade: 'estimated', basis: `${structure.totals.columns} عمود بمقاسات محسوبة بالأحمال؛ افتراضات معلنة في تبويب «الإنشاء»` },
      { id: 'concreteBeams', label: 'خرسانة الجسور (تحجيم أولي)', value: structure.totals.concrete.beams, unit: 'م³', grade: 'estimated', basis: `${structure.totals.beams} بحر، عمق من ACI 318 بحسب البحر والاستمرارية` },
      { id: 'concreteSlabs', label: 'خرسانة البلاطات (تحجيم أولي)', value: structure.totals.concrete.slabs, unit: 'م³', grade: 'estimated', basis: 'سماكة أسوأ لوح × مساحة محيط الدور' },
    ] : []),
    ...gardenRows(doc),
    { id: 'rebar', label: 'حديد التسليح', value: null, unit: '', grade: 'unavailable', basis: 'يحتاج تصميمًا إنشائيًا تفصيليًا (قص وانحناء وتفاصيل) غير موجود في الرسم' },
    { id: 'mep', label: 'الكهرباء والسباكة والتكييف', value: null, unit: '', grade: 'unavailable', basis: 'لا توجد دوائر ولا نقاط في الرسم' },
    { id: 'cost', label: 'التكلفة', value: null, unit: '', grade: 'unavailable', basis: 'لا توجد أسعار معتمدة في النظام؛ لا يُقدَّر رقم بلا مصدر' },
  ];
  const perRoom = [];
  for (const l of ok) for (const r of l.model.rooms) perRoom.push({ level: l.name, name: r.name, type: r.type, area: r2(r.w * r.h), w: r2(r.w), h: r2(r.h) });
  return { levels, rows, perRoom, assumptions: ASSUMPTIONS };
}
