import { assessPlan, aggregateAxes } from './plan-evidence.mjs';
const clamp = value => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

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
    note: 'الدرجة جزئية، تُحسب من المحاور ذات البيانات فقط بعد إعادة توزيع أوزانها. الخصوصية مؤشر اشتراك المسارات، والنوافذ لا تثبت الإضاءة الفعلية. المحاور الناقصة غير مُقيّمة والثقة غير معايرة. لا يمثل هذا اعتمادًا هندسيًا.' };
}
export { clamp };
