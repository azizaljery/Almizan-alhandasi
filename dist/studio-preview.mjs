// Architectural Studio presentation. Read-only projections of the existing planner model.
// No synthetic floor plans, no new geometry engine and no changes to AZIZ decisions.
import { buildPlanSVG } from './plan-view.mjs';
import { quantities, footprint, validatePlot, DIRECTIONS } from './planner.mjs';
import { reviewPlan } from './audit.mjs';
import { calculateMizanScore } from './mizan-score.mjs';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const format = (value, digits = 1) => Number(value).toLocaleString('ar-SA', { maximumFractionDigits: digits });
const finite = value => Number.isFinite(value) ? value : 0;

export function planPreviewURL(model) {
  if (!model?.rooms?.length || !model?.building) throw Error('لا يمكن عرض رسم دون نموذج هندسي صالح.');
  // The same authoritative SVG is used by the full 2D viewer and exports.
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildPlanSVG(model));
}

export function studioMetrics(model) {
  const q = quantities(model), review = reviewPlan(model), score = calculateMizanScore(model);
  return {
    footprint: finite(q.footprint),
    rooms: finite(q.rooms),
    circulation: finite(q.circulation),
    reserve: finite(q.reserve),
    doors: finite(q.doors),
    windows: finite(q.windows),
    roomCount: model.rooms.length,
    windowless: finite(review.occupiedWithoutWindows),
    warnings: review.issues.filter(issue => issue.level === 'warn').length,
    score: score.score,
    grade: score.grade,
  };
}

export function siteOverviewHTML(rawPlot, program) {
  const plot = validatePlot(rawPlot), allowed = footprint(plot);
  const scale = Math.min(290 / plot.width, 158 / plot.length);
  const x = 180 - plot.width * scale / 2, y = 22 + (158 - plot.length * scale) / 2;
  const total = (program || []).reduce((sum, room) => sum + (Number.isFinite(room.area) ? room.area : 0), 0);
  const footprintLimit = Math.min(allowed.area, plot.maxBuiltArea ?? Infinity);
  const rect = (x0, y0, w, h, fill, stroke, dash = '') => '<rect x="' + x0.toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.7"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  const drawing = '<svg viewBox="0 0 360 222" role="img" aria-label="حدود الأرض والارتدادات والمساحة الممكنة للبناء؛ لا يوجد توزيع غرف قبل التوليد" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="360" height="222" rx="16" fill="#f7f4ed"/>' +
    '<path d="M0 20H360M0 50H360M0 80H360M0 110H360M0 140H360M0 170H360M30 0V222M60 0V222M90 0V222M120 0V222M150 0V222M180 0V222M210 0V222M240 0V222M270 0V222M300 0V222M330 0V222" stroke="#e5e2d9" stroke-width=".5"/>' +
    rect(x, y, plot.width * scale, plot.length * scale, '#e9dfcc', '#917a55') +
    rect(x + allowed.x * scale, y + allowed.y * scale, allowed.w * scale, allowed.h * scale, '#d7e8dc', '#2e6853', '5 3') +
    '<text x="180" y="200" font-size="12" fill="#385a48" text-anchor="middle">المساحة الممكنة للبناء داخل الارتدادات</text>' +
    '<text x="18" y="20" font-size="12" fill="#3a594c" font-weight="bold">N ↑</text></svg>';
  const risk = total > footprintLimit
    ? '<p class="studio-site-risk">صافي الغرف المطلوب أكبر من سقف البناء المتاح قبل الجدران والممرات؛ قد لا يوجد حل صالح.</p>'
    : '<p class="studio-site-note">هذه حدود أرض وبناء فقط، وليست مخطط غرف. يُنشئ المحرك توزيع الغرف بعد التوليد.</p>';
  return '<div class="studio-site-diagram">' + drawing + '</div>' +
    '<div class="studio-site-facts"><div><span>الأرض</span><b>' + format(plot.width, 0) + ' × ' + format(plot.length, 0) + ' م</b></div>' +
    '<div><span>سقف الكتلة المتاح</span><b>' + format(footprintLimit) + ' م²</b></div>' +
    '<div><span>صافي الغرف المطلوبة</span><b>' + format(total) + ' م²</b></div>' +
    '<div><span>البرنامج / المدخل</span><b>' + format((program || []).length, 0) + ' فراغ · ' + escapeHTML(DIRECTIONS[plot.entry]) + '</b></div>' +
    risk + '</div>';
}

export function studioCardsHTML(models, selectedModel, strategyNames = {}, evaluations = []) {
  if (!Array.isArray(models) || !models.length) return '';
  const metrics = models.map(studioMetrics);
  const bestScore = Math.max(...metrics.map(m => m.score));
  const leastCorridors = Math.min(...metrics.map(m => m.circulation));
  return models.map((model, index) => {
    const m = metrics[index], selected = model === selectedModel;
    const title = strategyNames[model.strategy] || model.architecture?.tag || 'بديل ' + (index + 1);
    const intro = model.architecture?.idea || 'بديل معماري ناتج من توزيع الغرف الفعلي.';
    const scoreLabel = m.score === bestScore ? '<span class="studio-ribbon">الأعلى حسابيًا في Mizan Score</span>' : '';
    const selectedLabel = selected ? '<span class="studio-ribbon studio-ribbon-selected">اختيار محرك AZIZ</span>' : '';
    const corridorLabel = m.circulation === leastCorridors ? '<span class="studio-ribbon studio-ribbon-corridor">الأقل ممرات</span>' : '';
    const reviewLabel = evaluations[index] ? '<span class="studio-evaluation">تقييم القرار المساند: ' + format(evaluations[index].score, 0) + '/100 · عوائق: ' + format(evaluations[index].blockers?.length || 0, 0) + '</span>' : '';
    return '<article class="studio-alternative' + (selected ? ' selected' : '') + '" data-studio-card="' + index + '">' +
      '<div class="studio-plan-preview"><img loading="lazy" decoding="async" src="' + planPreviewURL(model) + '" alt="' + escapeHTML('مخطط تصوري حقيقي للبديل ' + title + '، يتضمن الغرف والجدران والأبواب والنوافذ من النموذج الهندسي نفسه') + '">' +
      '<span class="studio-plan-caption">المسقط الفعلي من المحرك · 2D</span></div>' +
      '<div class="studio-alternative-body"><div class="studio-ribbons">' + selectedLabel + scoreLabel + corridorLabel + '</div>' +
      '<h3>' + escapeHTML(title) + '</h3><p class="studio-alternative-intro">' + escapeHTML(intro) + '</p>' +
      '<div class="studio-score-line"><strong>' + format(m.score, 0) + '<small> / 1000</small></strong><span>Mizan Score<br><small>مؤشر أولي، لا اعتماد هندسي</small></span></div>' +
      '<dl class="studio-facts"><div><dt>المساحة المبنية</dt><dd>' + format(m.footprint) + ' م²</dd></div>' +
      '<div><dt>صافي الغرف</dt><dd>' + format(m.rooms) + ' م²</dd></div>' +
      '<div><dt>الممرات</dt><dd>' + format(m.circulation) + ' م²</dd></div>' +
      '<div><dt>الغرف بلا نافذة خارجية</dt><dd>' + format(m.windowless, 0) + '</dd></div>' +
      '<div><dt>الأبواب / النوافذ</dt><dd>' + format(m.doors, 0) + ' / ' + format(m.windows, 0) + '</dd></div>' +
      '<div><dt>تنبيهات التخطيط</dt><dd>' + format(m.warnings, 0) + '</dd></div></dl>' +
      reviewLabel +
      '<div class="studio-card-actions"><button type="button" class="small-button" data-preview="' + index + '">تكبير المخطط والتفاصيل</button>' +
      '<button type="button" class="small-button studio-select" data-alternative="' + index + '" aria-pressed="' + selected + '">' + (selected ? 'هذا المخطط معروض الآن' : 'اعرض في 2D و3D والكميات') + '</button></div></div></article>';
  }).join('');
}
