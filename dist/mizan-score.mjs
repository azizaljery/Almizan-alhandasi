import { quantities } from './planner.mjs';
import { reviewPlan } from './audit.mjs';

const clamp = value => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

// Mizan Score is a transparent comparative heuristic, not a code approval.
// Ownership: product-quality measurement only. It does not select the canonical candidate.
export function calculateMizanScore(model, { confidence = 0.72 } = {}) {
  if (!model) return null;
  const review = reviewPlan(model);
  const q = quantities(model);
  const plotArea = model.plot.width * model.plot.length;
  const occupied = model.rooms.filter(room => ['bedroom', 'living', 'majlis', 'dining'].includes(room.type));
  const withWindows = occupied.filter(room => model.openings.some(o => o.type === 'window' && o.roomId === room.id)).length;
  const routes = [...review.routes.guests, ...review.routes.family, ...review.routes.service].filter(route => route.metres !== null);
  const avgRoute = mean(routes.map(route => route.metres));
  const guestConflict = review.issues.some(issue => issue.text.includes('الضيوف والعائلة'));
  const privacy = clamp((occupied.length ? withWindows / occupied.length * 100 : 55) - (guestConflict ? 28 : 0) - (review.occupiedWithoutWindows * 10));
  const movement = clamp((avgRoute ? 100 - Math.max(0, avgRoute - 8) * 6 : 55) - (guestConflict ? 12 : 0));
  const efficiency = clamp(q.footprint ? q.rooms / q.footprint * 100 : 0);
  const coverage = clamp(plotArea ? q.footprint / plotArea / Math.max(model.plot.coverage || .75, .1) * 100 : 0);
  const daylight = clamp(occupied.length ? withWindows / occupied.length * 100 : 0);
  const ventilation = daylight;
  const economy = clamp(100 - (q.circulation / Math.max(q.footprint, 1) * 220) - (q.doors + q.windows) * 1.2);
  const compliance = clamp(100 - review.issues.filter(issue => issue.level === 'warn').length * 14 - (model.warnings?.length || 0) * 3);
  const axes = [
    { key: 'privacy', label: 'الخصوصية', score: privacy, weight: 25, detail: guestConflict ? 'يوجد اشتراك مرصود بين حركة الضيوف والعائلة.' : 'لا يوجد تعارض ضيافة/عائلة مرصود في الفحص.' },
    { key: 'movement', label: 'الحركة', score: movement, weight: 18, detail: avgRoute ? `متوسط المسارات المحسوبة ${avgRoute.toFixed(1)} م.` : 'لا توجد مسارات كافية لحساب المتوسط.' },
    { key: 'efficiency', label: 'استغلال المساحة', score: efficiency, weight: 15, detail: `صافي الغرف ${q.rooms.toFixed(1)} م² من كتلة ${q.footprint.toFixed(1)} م².` },
    { key: 'daylight', label: 'الإضاءة الطبيعية', score: daylight, weight: 12, detail: `${withWindows} من ${occupied.length} فراغات مأهولة لها نافذة مرسومة.` },
    { key: 'ventilation', label: 'التهوية', score: ventilation, weight: 10, detail: 'مؤشر أولي يعتمد على الفتحات الخارجية؛ لا يغني عن دراسة ميكانيكية.' },
    { key: 'economy', label: 'الاقتصاد', score: economy, weight: 10, detail: 'يوازن الممرات وعدد الفتحات كإشارة مقارنة أولية.' },
    { key: 'compliance', label: 'المطابقة الأولية', score: compliance, weight: 10, detail: 'فحص الارتدادات والتداخلات والتنبيهات داخل النموذج فقط.' },
  ];
  const score = Math.round(axes.reduce((sum, axis) => sum + axis.score * axis.weight, 0) / 100 * 10);
  const penalty = review.issues.filter(issue => issue.level === 'warn').length * 8;
  const finalScore = Math.max(0, Math.min(1000, score - penalty));
  return {
    score: finalScore,
    normalized: finalScore / 10,
    grade: finalScore >= 850 ? 'ممتاز' : finalScore >= 700 ? 'جيد جدًا' : finalScore >= 550 ? 'جيد' : 'يحتاج تحسين',
    confidence: Math.round(clamp(confidence * 100)),
    axes,
    strengths: axes.filter(axis => axis.score >= 80).map(axis => axis.label),
    improvements: axes.filter(axis => axis.score < 70).map(axis => axis.label),
    penalties: penalty,
    note: 'مؤشر Mizan Score مقارنة حسابية من نموذج الدور الأرضي الحالي. لا يمثل اعتمادًا بلديًا أو إنشائيًا، ولا يحل محل تقرير التربة والكود والمخططات التنفيذية.',
  };
}

export { clamp };
