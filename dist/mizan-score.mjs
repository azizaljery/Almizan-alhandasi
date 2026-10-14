import { assessPlan, aggregateAxes, PLAN_EVIDENCE_VERSION } from './plan-evidence.mjs';
const clamp = value => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
// Mizan Score reuses plan-evidence.mjs's per-axis measurements as-is, only
// adding the fixed weights below and the missing-axis reweighting in
// aggregateAxes(); its own formula version tracks that combination.
export const MIZAN_SCORE_FORMULA_VERSION = 'mizan-score/1.0.0+' + PLAN_EVIDENCE_VERSION;

export function calculateMizanScore(model) {
  if (!model) return null;
  const e = assessPlan(model);
  const axis = (key, label, weight, evidence) => ({ key, label, weight, ...evidence });
  const axes = [
    axis('privacy', 'فصل حركة الضيافة والعائلة', 25, e.privacy),
    axis('movement', 'الحركة', 18, e.circulation),
    axis('access', 'اتصال الوصول', 10, e.access),
    axis('efficiency', 'استغلال المساحة', 15, e.efficiency),
    axis('daylight', 'الفراغات ذات النوافذ', 12, e.daylight),
    axis('ventilation', 'التهوية', 10, e.ventilation),
    axis('economy', 'الاقتصاد', 10, e.economy),
    axis('compliance', 'المطابقة النظامية', 10, e.compliance),
    axis('reference', 'المقارنة بمرجع محقق', 10, e.reference),
    axis('structural', 'التربة والنظام الإنشائي', 10, e.constructability),
    axis('acoustic', 'العزل الصوتي', 5, e.acoustic),
    axis('future', 'التوسع المستقبلي', 5, e.futureExpansion)
  ];
  const coverage = aggregateAxes(axes);
  const score = coverage.score === null ? null : Math.round(coverage.score * 10);
  return { score, normalized: score === null ? null : score / 10,
    grade: `مقارنة جزئية · ${coverage.evaluatedAxes} من ${coverage.totalAxes} محاور`, confidence: null, axes, coverage,
    strengths: axes.filter(a => a.score !== null && a.score >= 80).map(a => a.label),
    improvements: axes.filter(a => a.score !== null && a.score < 70).map(a => a.label), penalties: 0,
    formulaVersion: MIZAN_SCORE_FORMULA_VERSION,
    formula: 'متوسط موزون لدرجات المحاور المُقيَّمة فقط (من أصل 12 محورًا ذا وزن ثابت)، بعد إعادة توزيع الأوزان على المحاور المُقيَّمة وحدها، مضروبًا في 10 لإعطاء درجة من ١٠٠٠.',
    effect: 'عرض مقارنة بين مخططات هذا البرنامج فقط؛ لا يُستخدم لاختيار أو استبعاد أي بديل تلقائيًا ولا يغيّر عملية التوليد.',
    note: 'الدرجة جزئية، تُحسب من المحاور ذات البيانات فقط بعد إعادة توزيع أوزانها. الخصوصية مؤشر اشتراك المسارات، والنوافذ لا تثبت الإضاءة الفعلية. المحاور الناقصة غير مُقيّمة والثقة غير معايرة. لا يمثل هذا اعتمادًا هندسيًا.' };
}
export { clamp };
