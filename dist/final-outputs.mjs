// مخرجات التصميم النهائي (SHARA Final Design) من مستند المرسم: المخطط، الإنشائي، الكميات والتكلفة بأسعار العميل،
// أسباب الاختيار، وكتاب المشروع. نقي: لا DOM ولا تخزين. لا يُذكر سعر بلا مصدر: السعر يدخله العميل، وما لم يُسعَّر يُعلَن.
import { planSvg } from './draw/export-studio.mjs';
import { planSheet } from './draw/plan-sheet.mjs';
import { computeDocQuantities, GRADES } from './draw/quantities-doc.mjs';
import { computeStructure } from './draw/structure.mjs';
import { structureSheetSvg } from './draw/structure-sheet.mjs';
import { reviewDoc } from './draw/review.mjs';
import { geometryFingerprint } from './design-dna.mjs';
import { roomTypeName } from './draw/catalog.mjs';
import { isCostUnpriced, UNPRICED_TOTAL_AR } from './field-guards.mjs';
import { privacyIndex } from './intel/privacy-index.mjs';
import { climateZoning } from './intel/climate-zoning.mjs';

/** حالة الأنظمة قبل أي حساب: تُعلن صراحة ولا تُعرض كصفر صامت. */
export const NOT_COMPUTED_AR = 'لم تُحسب الأنظمة الهندسية بعد لهذا المخطط';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r2 = v => Math.round(v * 100) / 100;

/** بنود الكميات القابلة للتسعير ووحدة كل منها؛ الباقي (حجم الجدران مثلًا) معلومة لا بند شراء. */
export const BILLABLE = Object.freeze([
  { id: 'rooms', label: 'أرضيات الغرف', unit: 'م²' },
  { id: 'finishArea', label: 'تشطيب الجدران الداخلية', unit: 'م²' },
  { id: 'blocks', label: 'بلوك الجدران', unit: 'قطعة' },
  { id: 'doors', label: 'الأبواب', unit: 'عدد' },
  { id: 'windows', label: 'النوافذ', unit: 'عدد' },
  { id: 'concreteColumns', label: 'خرسانة الأعمدة', unit: 'م³' },
  { id: 'concreteBeams', label: 'خرسانة الجسور', unit: 'م³' },
  { id: 'concreteSlabs', label: 'خرسانة البلاطات', unit: 'م³' },
]);

/** التكلفة = الكمية × سعر الوحدة (يدخله العميل). الاحتياط والضريبة نسبتان يدخلهما العميل أيضًا؛ الفارغ يعني «غير مُضمَّن». */
export function computeCost(rows, rates = {}, { reservePct = null, vatPct = null } = {}) {
  const num = v => (v === '' || v === null || v === undefined ? null : (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null));
  const items = BILLABLE.map(b => {
    const row = rows.find(r => r.id === b.id), qty = row && row.value !== null ? row.value : null, rate = num(rates[b.id]);
    return { ...b, qty, grade: row?.grade || 'unavailable', rate, cost: qty !== null && rate !== null ? r2(qty * rate) : null };
  });
  const priced = items.filter(i => i.cost !== null), subtotal = r2(priced.reduce((s, i) => s + i.cost, 0));
  const res = num(reservePct), vat = num(vatPct);
  const reserve = res !== null ? r2(subtotal * res / 100) : null;
  const vatBase = subtotal + (reserve || 0), vatAmt = vat !== null ? r2(vatBase * vat / 100) : null;
  return { items, pricedCount: priced.length, totalCount: items.length, subtotal, reservePct: res, reserve, vatPct: vat, vat: vatAmt, total: r2(vatBase + (vatAmt || 0)), complete: priced.length === items.length };
}

/** كل ما تعرضه صفحة المخرجات وكتاب المشروع، من مستند واحد. */
/** مقاس لوحة المسقط الافتراضي في الكتاب (أفقية). قرار المالك: A3 افتراضًا، وA1 متاح بالخيار sheet. */
export const DEFAULT_SHEET = 'A3';

export function buildFinalData(doc, { dna = null, rates = {}, reservePct = null, vatPct = null, snapshot3d = null, now = new Date(), levelFilter = null, sheet = DEFAULT_SHEET, owner = null, office = null } = {}) {
  const day = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  const fingerprint = geometryFingerprint(doc);
  const quantities = computeDocQuantities(doc), structure = computeStructure(doc);
  const levels = doc.levels.filter(l => !levelFilter || levelFilter.includes(l.id)).map((lv, i) => ({
    id: lv.id, name: lv.name,
    // لوحة المسقط المعماري (A3 افتراضًا) بأعمدة التحجيم الأولي إن وُجدت؛ والمسقط البسيط يبقى للتصدير فقط
    ...planSheetOf(doc, lv, { sheet, date: day, fingerprint, sheetNo: 'A-' + String(i + 1).padStart(2, '0'), columns: structure.levels.find(x => x.id === lv.id)?.columns || null, owner, office }),
    planSimple: planSvg(doc, lv),
    structure: structure.levels.find(x => x.id === lv.id)?.columns ? structureSheetSvg(doc, structure, { levelId: lv.id, fingerprint, date: day, sheetNo: 'S-' + String(i + 1).padStart(2, '0') }) : null,
  }));
  const scored = quantities.levels.find(l => l.score);
  const score = scored ? scored.score : null, scoreLevel = scored ? scored.name : null;
  const validation = quantities.levels.flatMap(l => (l.report?.validation || []).map(v => ({ level: l.name, text: typeof v === 'string' ? v : (v.message || String(v)) })));
  let review = []; try { review = reviewDoc(doc); } catch { /* ... */ }
  const rooms = quantities.perRoom || [];
  const q = Object.fromEntries(quantities.rows.map(r => [r.id, r]));
  const dnaAxes = dna?.dna?.axes || null;
  return {
    title: doc.title || 'مشروع بلا اسم', date: day, fingerprint, doc,
    summary: {
      levels: doc.levels.length, rooms: rooms.length, builtArea: q.footprint?.value ?? null, roomsArea: q.rooms?.value ?? null,
      doors: q.doors?.value ?? null, windows: q.windows?.value ?? null,
      byType: Object.entries(rooms.reduce((m, r) => { const k = roomTypeName(r.type) || r.type; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([name, count]) => ({ name, count })),
      plot: doc.plot?.polygon?.length ? plotSize(doc.plot.polygon) : null,
    },
    levels, rooms, quantities, structure, cost: computeCost(quantities.rows, rates, { reservePct, vatPct }),
    score, scoreLevel, validation, review, intel: intelOf(doc), dnaAxes, dnaFingerprint: dna?.dna?.fingerprint || null, snapshot3d,
  };
}
function intelOf(doc) { try { return { privacy: privacyIndex(doc), climate: climateZoning(doc) }; } catch { return null; } }
/** لوحة المسقط مع بياناتها الوصفية؛ إن تعذّرت (مخطط بلا محيط مغلق مثلًا) يُعاد المسقط البسيط ويُعلن السبب. */
function planSheetOf(doc, lv, opts) {
  try { const r = planSheet(doc, { levelId: lv.id, ...opts }); return { plan: r.svg, sheet: { size: r.meta.sheet, scale: r.meta.scale, labelOverlaps: r.meta.labelOverlaps, dimTextOverlaps: r.meta.dimTextOverlaps, axes: { x: r.meta.axes.x.length, y: r.meta.axes.y.length, source: r.meta.axes.source }, columns: r.meta.columns } }; }
  catch (e) { return { plan: planSvg(doc, lv), sheet: null, sheetError: e.message }; }
}
function plotSize(poly) { const xs = poly.map(p => p.x), ys = poly.map(p => p.y); return { width: r2(Math.max(...xs) - Math.min(...xs)), length: r2(Math.max(...ys) - Math.min(...ys)) }; }

/** أسباب الاختيار بلغة العميل: من الدرجة والبصمة والمراجعة فقط، وما لم يُقَس يُقال إنه غير مُقيَّم. */
export function designReasons(data) {
  const out = { strengths: [], improvements: [], unmeasured: [], notes: [] };
  const s = data.score;
  if (s) {
    out.strengths = s.axes.filter(a => a.score !== null && a.score >= 80).map(a => `${a.label}: ${Math.round(a.score)}/100`);
    out.improvements = s.axes.filter(a => a.score !== null && a.score < 70).map(a => `${a.label}: ${Math.round(a.score)}/100 — ${a.detail || ''}`.trim());
    out.unmeasured = s.axes.filter(a => a.score === null).map(a => a.label);
  }
  const bySev = { error: 0, warn: 1, warning: 1, info: 2 };
  out.notes = [...data.review].sort((a, b) => (bySev[a.severity] ?? 3) - (bySev[b.severity] ?? 3)).slice(0, 12).map(i => ({ severity: i.severity, message: i.message }));
  return out;
}

/** مراحل ما بعد التصميم كما في رحلة العميل؛ لا يُدّعى توفر ما لم يُبنَ بعد. */
export const NEXT_STAGES = Object.freeze([
  { id: 'book', title: 'كتاب المشروع', status: 'available', note: 'متاح الآن: ملف واحد بكل ما سبق (يُحفظ ويُطبع).' },
  { id: 'cost', title: 'التكلفة بأسعارك', status: 'available', note: 'متاح الآن: تُدخل سعر الوحدة فتظهر التكلفة الجزئية أو الكاملة.' },
  { id: 'tender', title: 'العطاءات ومقارنة المقاولين', status: 'planned', note: 'لم تُبنَ بعد.' },
  { id: 'build', title: 'التنفيذ والمتابعة والاستلام', status: 'planned', note: 'لم تُبنَ بعد.' },
  { id: 'maintain', title: 'الضمان والصيانة ودورة حياة المبنى', status: 'planned', note: 'لم تُبنَ بعد.' },
]);

const fmt = v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
/** سطر تحت لوحة المسقط: مقاسها ومقياسها، أو سبب الرجوع إلى المسقط البسيط. */
export function sheetNote(l) {
  if (l.sheet) return `<p class="muted">لوحة ${esc(l.sheet.size)} أفقية بمقياس 1:${l.sheet.scale} عند الطباعة على مقاسها؛ الأبعاد بالمتر. ${l.sheet.columns ? 'الأعمدة مقترحة من التحجيم الأولي.' : ''}</p>`;
  return `<p class="muted">تعذّرت لوحة المسقط (${esc(l.sheetError || 'سبب غير معروف')})؛ عُرض المسقط البسيط.</p>`;
}

/** ملخص الأنظمة الهندسية بالأرقام للصفحة وكتاب المشروع. M: ناتج computeOutputsMep (يحمل المصدر) أو حالة «لم تُحسب». */
export function mepSummaryHtml(M) {
  if (!M || M.notComputed) return `<p class="muted"><b>${esc(NOT_COMPUTED_AR)}</b>${M?.reasonAr ? ' — ' + esc(M.reasonAr) : ''}. لا تُعرض أصفار هنا لأن الحساب لم يجرِ بعد.</p>`;
  const n = v => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }));
  const stat = (v, l) => `<div class="stat"><b>${v}</b>${esc(l)}</div>`;
  const fx = M.fixtures || {};
  const origin = M.source?.origin === 'systems-edited' ? 'بمدخلات صفحة الأنظمة المعدّلة' : 'بمدخلات أولية مولّدة من هذا المخطط';
  const head = M.source ? `<p><b>الأرقام من: ${esc(M.source.label)}</b> <span class="muted">(${origin})</span></p>` : '';
  const others = (M.others || []).filter(o => o.lights !== null).map(o => `<p class="muted">ملاحظة: حُسبت الأنظمة أيضًا لـ «${esc(o.label)}» (غير معروض هنا): ${n(o.lights)} وحدة إنارة و${n(o.circuits)} دائرة.</p>`).join('');
  const stats = `<div class="stats">${stat(n(M.lights), 'وحدة إنارة')}${stat(n(M.sockets), 'مقبس')}${stat(n(M.circuits), 'دائرة كهربائية')}${stat(n(M.demandW / 1000) + ' kW', 'طلب كهربائي أقصى')}${stat(n(M.panels?.[0]?.kVA) + ' kVA', 'اللوحة الرئيسية')}${stat(n(M.acSelectedTR) + ' TR', `سعات التكييف (${n(M.ac?.length)} وحدة)`)}${stat(n(M.acTotalTR) + ' TR', 'الحمل الحراري الساكن')}${stat(n(M.tankL) + ' L', 'خزان المياه (يومان)')}${stat(n((fx.WC || 0) + (fx.BASIN || 0) + (fx.SHOWER || 0) + (fx.SINK || 0)), 'جهاز صحي')}${stat(n(fx.WATER_HEATER), 'سخان')}${stat(n(M.fire), 'عنصر حريق')}${stat(n(M.lowCurrent), 'عنصر تيار خفيف')}${M.pv ? stat(n(M.pv.kWp) + ' kWp', `ألواح شمسية (${M.pv.panels})`) : ''}</div>`;
  const rows = (M.ac || []).slice().sort((a, b) => (b.btu || 0) - (a.btu || 0)).map(z => `<tr><td>${esc(z.room)}</td><td class="num">${n(z.areaM2)}</td><td class="num">${n(z.gainW)}</td><td class="num">${n(z.btu)}</td><td class="num">${n(z.inputW)}</td></tr>`).join('');
  const ac = rows ? `<table class="pb-table"><thead><tr><th>الفراغ</th><th>م²</th><th>الحمل الساكن W</th><th>سبليت BTU/h</th><th>كهرباء الوحدة W</th></tr></thead><tbody>${rows}</tbody></table>` : '';
  return head + stats + ac + others + `<p class="muted">أرقام أولية من مدخلات ولّدها الميزان من المخطط بافتراضات مشروع معلنة (الرياض صيفًا 46/24°C، غلاف معزول، 600 BTU/h لكل م² حدًا أدنى للاختيار، 250 ل/شخص/يوم)؛ ليست قيم كود ولا اعتمادًا للتنفيذ.</p>`;
}

/** صف الكهرباء والسباكة والتكييف في جدول الكميات: من الأنظمة المحسوبة للمخطط المعروض، أو حالة «لم تُحسب» صريحة. */
export const MEP_ROW_ID = 'mep';
export function mepQuantityRow(M) {
  const label = 'الكهرباء والسباكة والتكييف';
  if (!M || M.notComputed) return { id: MEP_ROW_ID, label, value: null, unit: '', grade: 'unavailable', basis: NOT_COMPUTED_AR + ' (تُحسب تلقائيًا من مخطط المرسم المعروض)' };
  const basis = `من الأنظمة المحسوبة لـ«${M.source?.label || 'المخطط المعروض'}»: ${M.lights} وحدة إنارة، ${M.sockets} مقبس، ${M.panels?.length || 0} لوحة، ${M.ac?.length || 0} وحدة تكييف؛ تقدير أولي بافتراضات معلنة`;
  return { id: MEP_ROW_ID, label, value: M.circuits, unit: 'دائرة', grade: 'estimated', basis };
}
/** يستبدل صف الكهرباء في الكميات بصف الأنظمة المحسوبة (لا ينسخ المصفوفة الأصلية). */
export function applyMepRow(rows, M) {
  return rows.map(r => (r.id === MEP_ROW_ID ? mepQuantityRow(M) : r));
}
/** HTML مستقل (للقراءة والطباعة) من البيانات نفسها. css: نص الأنماط ليُضمَّن. */
export function projectBookHtml(data, { css = '' } = {}) {
  const R = designReasons(data), c = data.cost, S = data.summary;
  const sec = (t, body) => `<section class="pb-sec"><h2>${esc(t)}</h2>${body}</section>`;
  const table = (head, rows) => `<table class="pb-table"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const parts = [];
  parts.push(sec('نظرة عامة', `<p class="lead">${esc(data.title)} — ${S.rooms} فراغًا في ${S.levels} دور. مساحة المسقط ${fmt(S.builtArea)} م² ومساحة الغرف ${fmt(S.roomsArea)} م².${S.plot ? ` الأرض ${S.plot.width} × ${S.plot.length} م.` : ''}</p>` + table(['الفراغ', 'العدد'], S.byType.map(t => [t.name, t.count])) + `<p class="muted">بصمة الهندسة: <code>${esc(data.fingerprint)}</code>${data.dnaFingerprint ? ` · بصمة ميزانك: <code>${esc(data.dnaFingerprint)}</code>` : ''} · ${esc(data.date)}</p>`));
  if (data.dnaAxes) parts.push(sec('بصمتك التصميمية', table(['المحور', 'القيمة', 'مصدره'], data.dnaAxes.map(a => [a.label, Math.round(a.value * 100) + '%', (a.sources || []).join('، ')]))));
  data.levels.forEach(l => parts.push(sec('المخطط — ' + l.name, `<div class="pb-svg pb-sheet">${l.plan}</div>` + sheetNote(l))));
  if (data.snapshot3d) parts.push(sec('العرض ثلاثي الأبعاد', `<img class="pb-img" alt="لقطة ثلاثية الأبعاد" src="${esc(data.snapshot3d)}">`));
  data.levels.filter(l => l.structure).forEach(l => parts.push(sec('المخطط الإنشائي المبدئي — ' + l.name, `<div class="pb-svg">${l.structure}</div><p class="muted">تحجيم أولي لا تصميم إنشائي معتمد؛ يراجعه مهندس إنشائي.</p>`)));
  parts.push(sec('الكميات', table(['البند', 'القيمة', 'الدرجة', 'الأساس'], applyMepRow(data.quantities.rows, data.mep).map(r => [r.label, r.value === null ? '—' : `${fmt(r.value)} ${r.unit}`, GRADES[r.grade], r.basis]))));
  parts.push(sec('التكلفة بأسعارك', table(['البند', 'الكمية', 'سعر الوحدة', 'التكلفة'], c.items.map(i => [i.label, i.qty === null ? '—' : `${fmt(i.qty)} ${i.unit}`, i.rate === null ? 'غير مسعّر' : fmt(i.rate), i.cost === null ? 'غير مسعّر' : fmt(i.cost)])) + (isCostUnpriced(c) ? `<p><b>${UNPRICED_TOTAL_AR}</b></p>` : `<p>المجموع الجزئي (${c.pricedCount} من ${c.totalCount} بندًا مسعّرًا): <b>${fmt(c.subtotal)}</b>${c.reserve !== null ? ` · احتياط ${c.reservePct}%: ${fmt(c.reserve)}` : ''}${c.vat !== null ? ` · ضريبة ${c.vatPct}%: ${fmt(c.vat)}` : ''} · الإجمالي: <b>${fmt(c.total)}</b> ${c.complete ? '' : '(جزئي: يخص البنود المسعّرة فقط)'}</p>`) + `<p class="muted">لا توجد أسعار سوق افتراضية؛ الأسعار أسعارك.</p>`));
  parts.push(sec('لماذا هذا التصميم', (R.strengths.length ? `<h3>نقاط القوة</h3><ul>${R.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '') + (R.improvements.length ? `<h3>ما يحتاج تحسينًا</h3><ul>${R.improvements.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '') + (R.unmeasured.length ? `<p class="muted">غير مُقيَّم: ${esc(R.unmeasured.join('، '))}</p>` : '') + (R.notes.length ? `<h3>ملاحظات المراجعة</h3><ul>${R.notes.map(n => `<li>${esc(n.message)}</li>`).join('')}</ul>` : '') + (data.score ? `<p class="muted">${esc(data.score.grade)}. ${esc(data.score.note || '')}</p>` : '<p class="muted">الدرجة غير متاحة لهذا المخطط.</p>')));
  parts.push(sec('الأنظمة الهندسية بالأرقام (أولي)', mepSummaryHtml(data.mep)));
  if (data.intel) { const { privacy: P, climate: C } = data.intel; const sc = v => (v === null || v === undefined ? '—' : v + ' / 100');
    parts.push(sec('تقييم الخصوصية والمناخ', `<p>مؤشر الخصوصية السعودي: <b>${sc(P.score)}</b> · المنطقة المناخية: <b>${sc(C.score)}</b></p><p class="muted">${esc(P.note)} ${esc(C.note)}</p>` + (P.violations.length ? '<h3>المخالفات والإصلاح المقترح</h3>' + table(['المشكلة', 'أين', 'الإصلاح'], P.violations.map(v => [v.problem, v.where.join(' ← '), v.fix])) : '') + (C.recommendations.length ? `<h3>توصيات مناخية</h3><ul>${C.recommendations.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>` : ''))); }
  parts.push(sec('ما بعد التصميم', table(['المرحلة', 'الحالة', 'ملاحظة'], NEXT_STAGES.map(s => [s.title, s.status === 'available' ? 'متاح' : 'قادم', s.note]))));
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>كتاب المشروع — ${esc(data.title)}</title><style>${css}</style></head><body class="pb"><header class="pb-head"><h1>كتاب المشروع</h1><p>${esc(data.title)} · الميزان الهندسي · نحو منزلك</p></header>${parts.join('')}<footer class="pb-foot">أُعدّ بواسطة الميزان الهندسي. الكميات والتكلفة والتحجيم الإنشائي تقديرية بافتراضات معلنة وتُراجَع من مختصين قبل التنفيذ.</footer></body></html>`;
}

export default { buildFinalData, computeCost, designReasons, projectBookHtml, sheetNote, NEXT_STAGES, BILLABLE, DEFAULT_SHEET };
