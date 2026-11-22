// واجهة المراجعة: شارة الحالة، قائمة الملاحظات بسببها وموقعها، «اعرض على الرسم» (تظليل الغرفة/الجدار/الفتحة)، «أعد المراجعة»،
// وإقرار الشروط الإلزامية غير المتحقق منها. RTL وتعمل على الجوال. تعرض فقط تقريرًا يطابق نسخة المخطط المعروضة فعلًا.
import { SEVERITY, STATE, SEVERITY_AR, STATE_AR, DISCLAIMER, ROUTE_AR, planVersion } from './design-review.mjs';

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v === null || v === undefined || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
};
const ORDER = f => (f.severity === SEVERITY.MANDATORY ? 0 : f.severity === SEVERITY.WARNING ? 3 : 6) + (f.state === STATE.VIOLATED ? 0 : f.state === STATE.UNVERIFIED ? 1 : 2);
export const sortFindings = list => [...list].sort((a, b) => ORDER(a) - ORDER(b) || a.id.localeCompare(b.id));
export const VERDICT_CLASS = Object.freeze({ blocked: 'bad', needs_decision: 'warn', clear_with_limits: 'ok' });
/** وصف الموقع نصًّا: «الدور الأول — غرفة نوم 2» أو «المخطط كله». */
export function locationText(loc) {
  if (!loc) return 'غير محدد';
  if (loc.scope === 'plan') return 'المخطط كله' + (loc.label && loc.label !== 'المخطط كله' ? ` (${loc.label})` : '');
  const bits = [loc.levelName, loc.label].filter(Boolean);
  return bits.join(' — ') || 'غير محدد';
}
const COLORS = { violated: ['#c0392b', 'rgba(192,57,43,.28)'], unverified: ['#8a6d1d', 'rgba(210,160,30,.26)'], verified: ['#1c7a4f', 'rgba(28,122,79,.22)'] };
/** يرسم تظليل موقع ملاحظة فوق مسقط canvas بعد renderPlan. toScreen(view, W, H, point) هو نفسه المستعمل في الرسم. */
export function drawFindingOverlay(ctx, finding, { view, W, H, levelId, toScreen }) {
  if (!finding?.location?.shapes?.length) return 0;
  const [stroke, fill] = COLORS[finding.state] || COLORS.unverified; let n = 0;
  ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.fillStyle = fill; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const s of finding.location.shapes) {
    if (s.levelId && s.levelId !== levelId) continue;
    if (s.type === 'polygon') { ctx.beginPath(); s.points.forEach((p, i) => { const q = toScreen(view, W, H, p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.closePath(); ctx.fill(); ctx.stroke(); n++; }
    else if (s.type === 'segment') { const a = toScreen(view, W, H, s.a), b = toScreen(view, W, H, s.b); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.lineWidth = 3; n++; }
    else if (s.type === 'point') { const q = toScreen(view, W, H, s.p); ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); n++; }
  }
  ctx.restore(); return n;
}
export const countText = c => `إلزامي: ${c.mandatory.violated} مخالف · ${c.mandatory.unverified} غير متحقق · ${c.mandatory.verified} متحقق`;

/**
 * يبني بطاقة المراجعة.
 * opts: { report, doc, ctx, stale, running, error, enforced, focusId, decided:Set, onRerun, onFocus(finding), onDecide(ids) }
 * التقرير لا يُعرض إن لم يطابق planVersion(doc, ctx): تظهر «التقرير قديم» بدلًا منه.
 */
export function reviewCard(opts) {
  const { report, doc, ctx, running = false, error = null, enforced = false, focusId = null, decided = new Set(), onRerun, onFocus, onDecide } = opts;
  const card = el('div', { class: 'card mz-review', id: 'reviewCard', 'aria-live': 'polite' });
  const head = el('div', { class: 'mzr-head' }, el('h2', {}, 'مراجعة الميزان الآلية'));
  card.append(head);
  const current = doc ? planVersion(doc, ctx || {}).planVersion : null;
  const matches = !!report && !!current && report.planVersion === current;
  if (error) { card.append(el('p', { class: 'mzr-note bad', role: 'status', 'data-review-state': 'error' }, 'تعذّرت المراجعة: ' + error), el('button', { type: 'button', class: 'btn', id: 'reviewRerun', onclick: onRerun }, 'أعد المراجعة')); return card; }
  if (!matches) {
    head.append(el('span', { class: 'mzr-badge warn', 'data-review-badge': 'stale' }, running ? 'جارٍ المراجعة' : 'قديم'));
    card.append(el('p', { class: 'mzr-note warn', role: 'status', 'data-review-state': running ? 'running' : 'stale' }, running ? 'التقرير قديم — جارٍ المراجعة…' : 'التقرير قديم — أعد المراجعة.'),
      running ? null : el('button', { type: 'button', class: 'btn', id: 'reviewRerun', onclick: onRerun }, 'أعد المراجعة'), el('p', { class: 'mzr-fine' }, DISCLAIMER));
    return card;
  }
  const S = report.summary, cls = VERDICT_CLASS[S.verdict] || 'warn';
  head.append(el('span', { class: 'mzr-badge ' + cls, 'data-review-badge': S.verdict }, S.verdict === 'blocked' ? 'مخالفات إلزامية' : S.verdict === 'needs_decision' ? 'يلزم قرارك' : 'لا مخالفة إلزامية'));
  card.append(el('p', { class: 'mzr-verdict ' + cls, 'data-review-state': 'fresh' }, S.verdictAr),
    el('p', { class: 'mzr-meta' }, [report.route ? `المسار: ${ROUTE_AR[report.route] || report.route}` : null, `النسخة ${report.planVersion.slice(3, 11)}`, enforced ? 'وضع الإلزام: مفعّل' : 'وضع الإرشاد: لا يمنع الاعتماد حاليًا'].filter(Boolean).join(' · ')),
    el('div', { class: 'mzr-counts' }, [['mandatory', 'إلزامي'], ['warning', 'تحذير'], ['info', 'معلومة']].map(([k, label]) => el('div', { class: 'mzr-count ' + k }, el('b', {}, label),
      el('span', { class: 'v' }, `${S.counts[k].violated} مخالف`), el('span', { class: 'u' }, `${S.counts[k].unverified} غير متحقق`), el('span', { class: 'k' }, `${S.counts[k].verified} متحقق`)))),
    el('p', { class: 'mzr-aziz', 'data-aziz': report.aziz.status }, report.aziz.status === 'ran' ? 'عزيز: راجع كل دور محليًا (تراكب الغرف وحدود المبنى وصلاحية المضلعات) ثم العلاقات بين الأدوار.' : 'عزيز: غير متاح — ' + (report.aziz.reason || '') + '. لم يراجع عزيز هذا المخطط؛ المراجعة المحلية وحدها.'));
  if (report.locks.count) card.append(el('p', { class: 'mzr-locks' }, `الأجزاء المقفلة: ${report.locks.kept} محفوظة حرفيًا${report.locks.violated ? ' · ' + report.locks.violated + ' تغيّرت' : ''} من ${report.locks.count}.`));
  const unv = report.findings.filter(f => f.severity === SEVERITY.MANDATORY && f.state === STATE.UNVERIFIED && !decided.has(f.id));
  if (unv.length) card.append(el('div', { class: 'mzr-decide' }, el('p', {}, `${unv.length} شرطًا إلزاميًا تعذّر التحقق منه. لا يُحسب نجاحًا، ويلزم قرارك الصريح عند الاعتماد.`),
    el('button', { type: 'button', class: 'btn', id: 'reviewDecide', onclick: () => onDecide?.(unv.map(f => f.id)) }, 'أقرّ بعلمي بأنها غير متحقق منها')));
  else if (decided.size) card.append(el('p', { class: 'mzr-note ok' }, `أقررتَ بعلمك بعدم التحقق من ${decided.size} شرطًا إلزاميًا؛ سيُسجَّل قرارك مع الاعتماد.`));
  const item = f => el('li', { class: `mzr-item ${f.severity} ${f.state}` + (f.id === focusId ? ' on' : ''), 'data-finding': f.id, 'data-severity': f.severity, 'data-state': f.state },
    el('div', { class: 'mzr-top' }, el('span', { class: 'pill sev ' + f.severity }, SEVERITY_AR[f.severity]), el('span', { class: 'pill st ' + f.state }, STATE_AR[f.state]), el('b', {}, f.title)),
    el('p', { class: 'mzr-why' }, f.reason),
    el('div', { class: 'mzr-where' }, el('span', {}, 'الموقع: ' + locationText(f.location)),
      f.location?.shapes?.length ? el('button', { type: 'button', class: 'btn mzr-show', onclick: () => onFocus?.(f) }, 'اعرض على الرسم') : null));
  const sorted = sortFindings(report.findings), issues = sorted.filter(f => f.state !== STATE.VERIFIED), good = sorted.filter(f => f.state === STATE.VERIFIED);
  card.append(el('ul', { class: 'mzr-list', id: 'reviewList' }, issues.map(item)));
  if (!issues.length) card.append(el('p', { class: 'mzr-note ok' }, 'لا ملاحظات مفتوحة. المراجعة أولية ولا تغني عن المهندس.'));
  if (good.length) card.append(el('details', { class: 'mzr-ok' }, el('summary', {}, `المتحقق منه (${good.length})`), el('ul', { class: 'mzr-list' }, good.map(item))));
  card.append(el('div', { class: 'mzr-actions' }, el('button', { type: 'button', class: 'btn', id: 'reviewRerun', onclick: onRerun }, 'أعد المراجعة')), el('p', { class: 'mzr-fine', id: 'reviewDisclaimer' }, report.disclaimer || DISCLAIMER));
  return card;
}
export default { reviewCard, drawFindingOverlay, locationText, sortFindings, countText };
