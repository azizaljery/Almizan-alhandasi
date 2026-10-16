// مخرجات التصميم النهائي (SHARA Final Design) من مستند المرسم: المخطط، الإنشائي، الكميات والتكلفة بأسعار العميل،
// أسباب الاختيار، وكتاب المشروع. نقي: لا DOM ولا تخزين. لا يُذكر سعر بلا مصدر: السعر يدخله العميل، وما لم يُسعَّر يُعلَن.
import { planSvg } from './draw/export-studio.mjs';
import { computeDocQuantities, GRADES } from './draw/quantities-doc.mjs';
import { computeStructure } from './draw/structure.mjs';
import { structureSheetSvg } from './draw/structure-sheet.mjs';
import { reviewDoc } from './draw/review.mjs';
import { geometryFingerprint } from './design-dna.mjs';
import { roomTypeName } from './draw/catalog.mjs';

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
export function buildFinalData(doc, { dna = null, rates = {}, reservePct = null, vatPct = null, snapshot3d = null, now = new Date(), levelFilter = null } = {}) {
  const day = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  const fingerprint = geometryFingerprint(doc);
  const quantities = computeDocQuantities(doc), structure = computeStructure(doc);
  const levels = doc.levels.filter(l => !levelFilter || levelFilter.includes(l.id)).map((lv, i) => ({
    id: lv.id, name: lv.name,
    plan: planSvg(doc, lv),
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
    score, scoreLevel, validation, review, dnaAxes, dnaFingerprint: dna?.dna?.fingerprint || null, snapshot3d,
  };
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

/** HTML مستقل (للقراءة والطباعة) من البيانات نفسها. css: نص الأنماط ليُضمَّن. */
export function projectBookHtml(data, { css = '' } = {}) {
  const R = designReasons(data), c = data.cost, S = data.summary;
  const sec = (t, body) => `<section class="pb-sec"><h2>${esc(t)}</h2>${body}</section>`;
  const table = (head, rows) => `<table class="pb-table"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const parts = [];
  parts.push(sec('نظرة عامة', `<p class="lead">${esc(data.title)} — ${S.rooms} فراغًا في ${S.levels} دور. مساحة المسقط ${fmt(S.builtArea)} م² ومساحة الغرف ${fmt(S.roomsArea)} م².${S.plot ? ` الأرض ${S.plot.width} × ${S.plot.length} م.` : ''}</p>` + table(['الفراغ', 'العدد'], S.byType.map(t => [t.name, t.count])) + `<p class="muted">بصمة الهندسة: <code>${esc(data.fingerprint)}</code>${data.dnaFingerprint ? ` · بصمة ميزانك: <code>${esc(data.dnaFingerprint)}</code>` : ''} · ${esc(data.date)}</p>`));
  if (data.dnaAxes) parts.push(sec('بصمتك التصميمية', table(['المحور', 'القيمة', 'مصدره'], data.dnaAxes.map(a => [a.label, Math.round(a.value * 100) + '%', (a.sources || []).join('، ')]))));
  data.levels.forEach(l => parts.push(sec('المخطط — ' + l.name, `<div class="pb-svg">${l.plan}</div>`)));
  if (data.snapshot3d) parts.push(sec('العرض ثلاثي الأبعاد', `<img class="pb-img" alt="لقطة ثلاثية الأبعاد" src="${esc(data.snapshot3d)}">`));
  data.levels.filter(l => l.structure).forEach(l => parts.push(sec('المخطط الإنشائي المبدئي — ' + l.name, `<div class="pb-svg">${l.structure}</div><p class="muted">تحجيم أولي لا تصميم إنشائي معتمد؛ يراجعه مهندس إنشائي.</p>`)));
  parts.push(sec('الكميات', table(['البند', 'القيمة', 'الدرجة', 'الأساس'], data.quantities.rows.map(r => [r.label, r.value === null ? '—' : `${fmt(r.value)} ${r.unit}`, GRADES[r.grade], r.basis]))));
  parts.push(sec('التكلفة بأسعارك', table(['البند', 'الكمية', 'سعر الوحدة', 'التكلفة'], c.items.map(i => [i.label, i.qty === null ? '—' : `${fmt(i.qty)} ${i.unit}`, i.rate === null ? 'غير مسعّر' : fmt(i.rate), i.cost === null ? 'غير مسعّر' : fmt(i.cost)])) + `<p>المجموع الجزئي (${c.pricedCount} من ${c.totalCount} بندًا مسعّرًا): <b>${fmt(c.subtotal)}</b>${c.reserve !== null ? ` · احتياط ${c.reservePct}%: ${fmt(c.reserve)}` : ''}${c.vat !== null ? ` · ضريبة ${c.vatPct}%: ${fmt(c.vat)}` : ''} · الإجمالي: <b>${fmt(c.total)}</b> ${c.complete ? '' : '(جزئي: يخص البنود المسعّرة فقط)'}</p><p class="muted">لا توجد أسعار سوق افتراضية؛ الأسعار أسعارك.</p>`));
  parts.push(sec('لماذا هذا التصميم', (R.strengths.length ? `<h3>نقاط القوة</h3><ul>${R.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '') + (R.improvements.length ? `<h3>ما يحتاج تحسينًا</h3><ul>${R.improvements.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '') + (R.unmeasured.length ? `<p class="muted">غير مُقيَّم: ${esc(R.unmeasured.join('، '))}</p>` : '') + (R.notes.length ? `<h3>ملاحظات المراجعة</h3><ul>${R.notes.map(n => `<li>${esc(n.message)}</li>`).join('')}</ul>` : '') + (data.score ? `<p class="muted">${esc(data.score.grade)}. ${esc(data.score.note || '')}</p>` : '<p class="muted">الدرجة غير متاحة لهذا المخطط.</p>')));
  parts.push(sec('ما بعد التصميم', table(['المرحلة', 'الحالة', 'ملاحظة'], NEXT_STAGES.map(s => [s.title, s.status === 'available' ? 'متاح' : 'قادم', s.note]))));
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>كتاب المشروع — ${esc(data.title)}</title><style>${css}</style></head><body class="pb"><header class="pb-head"><h1>كتاب المشروع</h1><p>${esc(data.title)} · الميزان الهندسي · نحو منزلك</p></header>${parts.join('')}<footer class="pb-foot">أُعدّ بواسطة الميزان الهندسي. الكميات والتكلفة والتحجيم الإنشائي تقديرية بافتراضات معلنة وتُراجَع من مختصين قبل التنفيذ.</footer></body></html>`;
}

export default { buildFinalData, computeCost, designReasons, projectBookHtml, NEXT_STAGES, BILLABLE };
