// محرك الكميات والتحقق للمرسم (AR-02): يحسب من مستند الرسم الحالي لا من نموذج التوليد.
// كل رقم يحمل درجة صدق: measured (مقيس من الهندسة) | estimated (تقدير بافتراض معلن) | unavailable (لا يمكن حسابه من الرسم).
// نقي: لا DOM.
import { docToLegacy } from './export-legacy.mjs';
import { quantities } from '../planner.mjs';
import { calculateMizanScore } from '../mizan-score.mjs';

export const GRADES = Object.freeze({ measured: 'مقيس', estimated: 'تقدير بافتراض معلن', unavailable: 'غير قابل للحساب' });
export const ASSUMPTIONS = Object.freeze({ faces: 2, blocksPerM2: 12.5 });
const r2 = v => Math.round(v * 100) / 100;

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
    { id: 'concrete', label: 'الخرسانة والتسليح', value: null, unit: '', grade: 'unavailable', basis: 'يحتاج تصميمًا إنشائيًا (أحمال وتربة) غير موجود في الرسم' },
    { id: 'mep', label: 'الكهرباء والسباكة والتكييف', value: null, unit: '', grade: 'unavailable', basis: 'لا توجد دوائر ولا نقاط في الرسم' },
    { id: 'cost', label: 'التكلفة', value: null, unit: '', grade: 'unavailable', basis: 'لا توجد أسعار معتمدة في النظام؛ لا يُقدَّر رقم بلا مصدر' },
  ];
  const perRoom = [];
  for (const l of ok) for (const r of l.model.rooms) perRoom.push({ level: l.name, name: r.name, type: r.type, area: r2(r.w * r.h), w: r2(r.w), h: r2(r.h) });
  return { levels, rows, perRoom, assumptions: ASSUMPTIONS };
}
