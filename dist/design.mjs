// صفحة عرض التصميم على العميل: المخطط بأبعاده ومناطقه، المواصفات، جدول الغرف، ما طُبّق من طلبه،
// ثم: اعتماد ← العرض ثلاثي الأبعاد، أو «اطلب تصميمًا آخر» (شرعاء تسأل عمّا لم يعجبه)، أو التعديل في المرسم.
import { loadSession, saveSession, redesign, approve, FEEDBACK, ZONES, zoneOf, thumbLabels, summarizeDoc, currentDoc, ledgerFor } from './design-session.mjs';
import { analyzeDoc } from './draw/digest.mjs';
import { renderPlan, fitView, docBounds } from './draw/editor/render2d.mjs';
import { exteriorWallIds } from './draw/topology.mjs';
import { writeHandoff, STUDIO_KEY } from './draw/handoff.mjs';
import { serialize, parseDoc } from './draw/doc.mjs';
import { requestBrief } from './assistant.mjs';
import { normalizeLand } from './home-flow.mjs';
import { diffFingerprint, diffCaption } from './plan-fingerprint.mjs';
import { PROPOSAL_LABEL_AR } from './presentation-status.mjs';
import { shortfallNotice } from './client-text.mjs';
import { toClientAr } from './client-language.mjs';
// (الجولة 21 — مقترح 08) لا نص استثناء للعميل: رسالة المحرك العربية المعروفة (VILLA_*) بلغة العميل، وإلا نص ثابت
const clientErr = (e, fallback) => (/^VILLA_/.test(String(e?.code || '')) && /[\u0600-\u06FF]/.test(String(e?.message || '')) ? toClientAr(e.message) : fallback);

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c !== null && c !== undefined) n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; };
const fmt = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const toast = t => { const n = el('div', { class: 'toast', role: 'status' }, t); document.body.append(n); setTimeout(() => n.remove(), 3200); };

let session = loadSession(localStorage), doc = null, levelId = 'L1', zonesOn = true, view = null, model = null;
// (الجولة الرابعة عشرة) فرق التعديل مرسومًا على المسقط: ما تغيّر عن النسخة السابقة (البصمة الهندسية) يُظلَّل، وما أزيل يُرسم متقطعًا
let diffOn = true, diffInfo = null;

function init() {
  if (!session) {
    $('main').replaceChildren(el('div', { class: 'empty card' }, el('h2', {}, 'لا يوجد تصميم بعد'), el('p', {}, 'ابدأ من الأرض ثم تحدّث مع شرعاء لنصمّم لك منزلك.'), el('a', { class: 'btn primary', href: './home.html' }, 'ابدأ رحلة التصميم')));
    return;
  }
  show(session.current);
}

function show(index) {
  session.current = index; saveSession(localStorage, session);
  doc = currentDoc(session); model = analyzeDoc(doc); levelId = doc.levels[0].id; view = null; goal = null; inertia = null;
  const d = session.designs[index], S = summarizeDoc(doc), req = session.input.requirements || {};
  const specs = [
    ['غرف النوم', S.specs.bedrooms], ['دورات المياه', S.specs.baths], ['المجالس', S.specs.majlis], ['الأدوار', S.specs.floors],
    ['مسطح البناء', fmt(S.specs.built) + ' م²'], ['أبعاد المبنى', `${fmt(S.specs.width)} × ${fmt(S.specs.depth)} م`], ['المداخل', S.specs.entries],
  ];
  const levels = doc.levels.length > 1 ? el('div', { class: 'seg', role: 'tablist' }, doc.levels.map(l => el('button', { 'data-level': l.id, class: l.id === levelId ? 'on' : '', onclick: () => { levelId = l.id; view = null; goal = null; inertia = null; document.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('on', b.dataset.level === levelId)); paint(); } }, l.name))) : null;
  const zoneToggle = el('label', {}, el('input', { type: 'checkbox', id: 'zonesOn', checked: zonesOn, onchange: e => { zonesOn = e.target.checked; paint(); legend(); } }), 'تلوين المناطق');
  diffInfo = null;
  if (index > 0 && d.feedback) { try { const D = diffFingerprint(parseDoc(session.designs[index - 1].doc), doc); if (!D.identical) diffInfo = { now: [...D.changed, ...D.added].filter(e => e.kind !== 'fixture' && e.box), gone: D.removed.filter(e => e.kind !== 'fixture' && e.box), summary: diffCaption(D).client_ar, detail: D.summary_ar, from: session.designs[index - 1].version ?? index }; } catch { diffInfo = null; } }
  const diffToggle = diffInfo ? el('label', { 'data-diff': '' }, el('input', { type: 'checkbox', id: 'diffOn', checked: diffOn, onchange: e => { diffOn = e.target.checked; paint(); } }), 'أظهر ما تغيّر عن النسخة ' + diffInfo.from) : null;
  const plan = el('div', { class: 'card plancard' },
    el('div', { class: 'planbar' }, levels, zoneToggle, diffToggle, el('div', { class: 'tools' }, el('button', { title: 'تكبير', 'aria-label': 'تكبير', onclick: () => zoom(1.25) }, '+'), el('button', { title: 'تصغير', 'aria-label': 'تصغير', onclick: () => zoom(.8) }, '−'), el('button', { title: 'ملاءمة', 'aria-label': 'ملاءمة', onclick: () => { goal = null; inertia = null; view = null; paint(); } }, '⤢'))),
    el('div', { class: 'planwrap', id: 'planWrap' }, el('canvas', { id: 'plan', 'aria-label': 'مسقط التصميم' })),
    el('div', { class: 'legend', id: 'legend' }),
    diffInfo ? el('p', { class: 'sub', 'data-diff-summary': '', title: diffInfo.detail }, diffInfo.summary + ' — المظلل بالأحمر ما تغيّر أو أضيف، والمتقطع ما أزيل.') : null);
  // «لم يُتحقق» و«بانتظار العرض» ليست منفّذة ولا مخفقة: تُعرض وحدها بسببها
  const ledger = ledgerFor(session, doc), open = ledger.filter(x => x.status === 'unverified' || x.status === 'pending-render'), done = ledger.filter(x => x.ok), miss = ledger.filter(x => !x.ok && !open.includes(x));
  const side = el('div', { class: 'actions card' },
    el('h2', {}, 'ما رأيك في هذا التصميم؟'),
    el('button', { class: 'btn gold', id: 'btnApprove', onclick: onApprove }, 'أعجبني — اعتمده واعرضه ثلاثي الأبعاد ←'),
    el('button', { class: 'btn primary', id: 'btnAnother', onclick: openShara }, 'اطلب تصميمًا آخر'),
    el('button', { class: 'btn', id: 'btnStudio', onclick: onStudio }, 'عدّل عليه بيدك في المرسم'),
    el('small', {}, 'الاعتماد يفتح العرض ثلاثي الأبعاد في صفحة مستقلة، ومنه المخرجات (الإنشائي والكميات والتكلفة وكتاب المشروع).'));
  // سجل التنفيذ: كل بند من طلبك مقيس من المخطط نفسه، لا من نية المولّد
  const reqCard = el('div', { class: 'card ledger', id: 'ledger' }, el('h2', {}, 'هل نُفّذ طلبك؟'),
    ledger.length ? el('p', { class: 'score ' + (miss.length ? 'part' : 'full') }, miss.length ? `نُفّذ ${done.length} من ${ledger.length} بنود، وبقي ${miss.length}` : `نُفّذت كل البنود (${ledger.length})`) : el('p', { class: 'sub' }, 'لم تذكر طلبات مكانية أو مقاسات؛ طُبّقت الأعداد التي حددتها.'),
    miss.length ? el('ul', { class: 'tick' }, miss.map(x => el('li', { class: 'bad', 'data-rule': x.id }, el('b', {}, x.text), x.why ? el('span', { class: 'why' }, x.why) : null))) : null,
    done.length ? el('ul', { class: 'tick' }, done.map(x => el('li', { class: 'good', 'data-rule': x.id }, x.text, x.why ? el('span', { class: 'why' }, x.why) : null))) : null,
    open.length ? el('ul', { class: 'tick' }, open.map(x => el('li', { class: 'no', 'data-rule': x.id, 'data-status': x.status }, el('b', {}, x.text + (x.status === 'pending-render' ? ' — بانتظار العرض' : ' — لم يُتحقق منه آليًا')), x.why ? el('span', { class: 'why' }, x.why) : null))) : null,
    (session.conflicts || []).length ? el('div', { class: 'conflicts' }, el('p', { class: 'sub' }, 'في طلبك نقاط تحتاج توضيح:'), el('ul', { class: 'tick' }, session.conflicts.map(c => el('li', { class: 'no', 'data-conflict': c.type }, c.question_ar)))) : null,
    (session.siteQuestions || []).length ? el('div', { class: 'conflicts' }, el('p', { class: 'sub' }, 'عن الموقع (اختياري):'), el('ul', { class: 'tick' }, session.siteQuestions.map(c => el('li', { class: 'no', 'data-site-question': c.type }, c.question_ar)))) : null,
    miss.length ? el('p', { class: 'sub' }, 'اطلب تصميمًا آخر وسأبحث عن توزيع ينفّذ البنود الباقية، أو اكتب تعديلك لشرعاء.') : null,
    (req.unsupported || []).length ? el('ul', { class: 'tick' }, req.unsupported.map(t => el('li', { class: 'no' }, t))) : null);
  const notes = el('div', { class: 'card' }, el('h2', {}, 'ملاحظات التصميم'), el('ul', { class: 'notes' }, [d.summary, ...(d.notes || [])].filter(Boolean).map(t => el('li', {}, toClientAr(t)))),
    d.feedback ? el('p', { class: 'sub' }, 'عدّلتُ هذا التصميم بناءً على: ' + d.feedback.changes.join('، ')) : null);
  const table = el('table', { class: 'rooms' }, el('thead', {}, el('tr', {}, el('th', {}, 'الفراغ'), doc.levels.length > 1 ? el('th', {}, 'الدور') : null, el('th', {}, 'الأبعاد (م)'), el('th', {}, 'المساحة (م²)'), el('th', {}, 'المنطقة'))),
    el('tbody', {}, S.rooms.filter(r => r.area >= 2).map(r => el('tr', {}, el('td', {}, el('span', { class: 'z', style: `background:${ZONES[r.zone].color}` }), r.name), doc.levels.length > 1 ? el('td', {}, r.level) : null, el('td', { class: 'num' }, `${fmt(r.l)} × ${fmt(r.w)}`), el('td', { class: 'num' }, fmt(r.area)), el('td', {}, ZONES[r.zone].label)))),
    el('tfoot', {}, el('tr', {}, el('th', {}, 'إجمالي المساحات الصافية'), doc.levels.length > 1 ? el('th', {}) : null, el('th', {}), el('th', { class: 'num' }, fmt(S.specs.net)), el('th', {}))));
  const history = session.designs.length > 1 ? el('div', { class: 'history', 'aria-label': 'التصاميم السابقة' }, session.designs.map((x, i) => el('button', { class: i === index ? 'on' : '', onclick: () => show(i) }, 'التصميم ' + (i + 1)))) : null;
  const replyCard = sharaReply(d.feedback);
  // replaceChildren(null) يكتب النص «null» في الصفحة: البطاقات الغائبة تُستبعد
  $('main').replaceChildren(...[
    replyCard,
    el('div', { class: 'titlebar' }, el('div', {}, el('h1', {}, index === 0 ? 'تصميمك الأولي' : 'التصميم ' + (index + 1)), el('div', { class: 'sub' }, 'مسقط مبدئي قابل للتعديل؛ الأبعاد بين محاور الجدران والمساحات صافية من داخل الجدران.'), el('div', { class: 'sub proposal-label', 'data-proposal-label': '' }, PROPOSAL_LABEL_AR)), history),
    statusCard(d),
    el('section', { class: 'specs', 'aria-label': 'المواصفات' }, specs.map(([k, v]) => el('div', { class: 'spec' }, el('b', {}, v), el('span', {}, k)))),
    el('div', { class: 'grid' }, plan, el('div', { class: 'actions', style: 'gap:16px' }, side, reqCard)),
    altsCard(d),
    el('div', { class: 'cols' }, el('div', { class: 'card' }, el('h2', {}, 'جدول الفراغات'), table), el('div', { class: 'actions', style: 'gap:16px' }, reviewCard(d), notes))].filter(Boolean));
  legend(); bindPlan(); paint();
}

/**
 * البدائل المختلفة معماريًا من الطلب الأول: كم عُرض من المطلوب، وسبب النقص كما كتبه المولّد، وأسباب رفض المرشحين.
 * كل زر يعرض البديل نفسه (يُضاف إلى سجل التصاميم مرة واحدة) — لا تكميل للعدد بنسخ شكلية (قرار المالك).
 */
function altsCard(d) {
  const alts = session.alternatives || [], info = session.alternativesInfo || null;
  if (!alts.length && !info) return null;
  const want = info?.requested ?? alts.length, cur = d.doc;
  const verdict = a => a.review ? (a.review.passed ? 'اجتاز المراجعة' : 'لم يجتز المراجعة') : '';
  return el('section', { class: 'card alts', id: 'alts', 'aria-label': 'البدائل' },
    el('h2', {}, 'البدائل المختلفة معماريًا'),
    el('p', { class: 'score ' + (alts.length < want ? 'part' : 'full') }, `عُرض ${alts.length} من ${want} مطلوبة`),
    el('div', { class: 'altlist' }, alts.map((a, i) => el('button', { type: 'button', 'data-alt': String(i), class: a.doc === cur ? 'on' : '', onclick: () => showAlternative(i) },
      el('b', {}, 'البديل ' + (i + 1)), a.summary ? el('span', {}, a.summary) : null, verdict(a) ? el('small', {}, verdict(a)) : null, a.presentation ? el('small', { 'data-alt-status': a.presentation.status }, a.presentation.label_ar + (a.presentation.status === 'needs-edits' ? ` (${a.presentation.edits_ar.length})` : '')) : null))),
    info?.hidden?.length ? el('p', { class: 'sub', 'data-hidden': '' }, `حُجب ${info.hidden.length} ${info.hidden.length === 1 ? 'بديل' : 'بدائل'} لأنها تخالف بندًا إلزاميًا من طلبك: ${info.hidden.map(h => (h.reasons_ar || [])[0]).filter(Boolean).join('؛ ')}`) : null,
    // (الجولة العشرون) إشعار النقص بنص العميل نفسه الذي في الصور (shortfallNotice): العدد صريحًا وسببه وما يمكن تغييره، بلا لغة داخلية
    (() => { const nv = alts.filter(a => a.presentation?.status !== 'hidden').length, n = nv < want ? shortfallNotice({ requested: want, shown: nv, shortfall_ar: info?.shortfall_ar, hidden: info?.hidden || [] }) : null;
      return n ? el('div', { class: 'shortfall sub', role: 'note', 'data-shortfall': '' }, el('b', {}, n.title_ar), ...n.lines_ar.map(t => el('p', {}, t))) : null; })(),
    info?.rejected?.length ? el('details', { class: 'rejected' }, el('summary', {}, `المرشحون المرفوضون (${info.rejectedCount}) وأسبابهم`),
      el('ul', { class: 'tick' }, info.rejected.map(r => el('li', { class: 'bad' }, r.text + (r.count > 1 ? ` (${r.count})` : ''))))) : null);
}
function showAlternative(i) {
  const a = session.alternatives[i]; if (!a) return;
  let at = session.designs.findIndex(x => x.doc === a.doc);
  if (at < 0) {
    // رقم نسخة ثابت (مثل design-session): «ارجع للنسخة N» يعني هذه النسخة دائمًا
    const version = Math.max(session.nextVersion || 0, ...session.designs.map((x, k) => (x.version ?? k + 1) + 1));
    session.nextVersion = version + 1;
    session.designs.push({ doc: a.doc, pat: a.pat || null, summary: a.summary || '', notes: a.notes || [], floors: parseDoc(a.doc).levels.length, feedback: null, engine: a.strategy || '', ledger: null, review: a.review || null, mirror: a.mirror ?? null, alt: i, version });
    if (session.designs.length > 12) session.designs.splice(0, session.designs.length - 12);
    at = session.designs.length - 1;
  }
  show(at); scrollTo({ top: 0, behavior: 'smooth' });
}
/**
 * (الجولة الرابعة عشرة) حالة العرض: «جاهز للعرض المبدئي» / «يحتاج تعديلات» (بقائمتها) / «محجوب» (بسببه) — لا يُعرض بديل يحتاج
 * تعديلات على أنه جاهز. التصميم المعدَّل يدويًا أو في الجلسة بلا حالة محسوبة يُقال عنه ذلك صراحة.
 */
function statusCard(d) {
  const p = d.presentation || (d.alt != null ? session.alternatives?.[d.alt]?.presentation : null);
  if (!p) return el('section', { class: 'card status', 'data-status': 'unknown' }, el('p', { class: 'sub' }, 'حالة العرض لم تُحسب لهذه النسخة (عُدّلت بعد التوليد)؛ راجع «هل نُفّذ طلبك؟» والمراجعة المعمارية أدناه.'));
  const cls = p.status === 'ready' ? 'full' : 'part';
  return el('section', { class: 'card status', id: 'presentationStatus', 'data-status': p.status, 'aria-label': 'حالة العرض' },
    el('p', { class: 'score ' + cls }, p.label_ar + (p.status === 'needs-edits' ? ` — ${p.edits_ar.length} ${p.edits_ar.length === 1 ? 'ملاحظة' : 'ملاحظات'}` : '')),
    p.status === 'hidden' ? el('ul', { class: 'tick' }, p.hidden_ar.map(t => el('li', { class: 'bad' }, t))) : null,
    p.status === 'needs-edits' ? el('ul', { class: 'tick' }, p.edits_ar.map(t => el('li', { class: 'no' }, t))) : null,
    // (الجولة الخامسة عشرة) التفضيلات الطفيفة ملاحظات معلنة مع البديل (لا تُخفى ولا تُعدّ متحققة)
    p.status !== 'hidden' && p.notes_ar?.length ? el('details', { class: 'notes' }, el('summary', {}, `ملاحظات للمراجعة (${p.notes_ar.length}) — تفضيلات افتراضية للميزان قابلة للتغيير`), el('ul', { class: 'tick' }, p.notes_ar.map(t => el('li', { class: 'no' }, t)))) : null,
    el('p', { class: 'sub' }, p.status === 'ready' ? 'اجتاز المراجعة ونُفّذت بنود طلبك، ولا عيب جوهريًا فيه؛ الملاحظات المذكورة (إن وجدت) تفضيلات افتراضية للميزان لم تتحقق. يبقى مقترحًا مبدئيًا.' : p.status === 'needs-edits' ? 'اجتاز المراجعة ونُفّذت بنود طلبك، لكن فيه ما يصلحه المعماري قبل العرض (مذكور أعلاه) — لا يُقدَّم على أنه جاهز.' : 'لا يُعرض بديلًا: يخالف بندًا إلزاميًا من طلبك أو رسب في المراجعة.'));
}
/** المراجعة المعمارية المستقلة (plan-review) للتصميم المعروض: كل بوابة بنتيجتها وسببها، والدرجة. */
function reviewCard(d) {
  const rv = d.review;
  const box = el('section', { class: 'card review', id: 'review', 'aria-label': 'المراجعة المعمارية' }, el('h2', {}, 'المراجعة المعمارية المستقلة'));
  if (!rv?.gates?.length) { box.append(el('p', { class: 'sub' }, 'لم تُراجَع هذه النسخة آليًا (عُدّلت في المرسم أو من مصدر آخر).')); return box; }
  box.append(el('p', { class: 'score ' + (rv.passed ? 'full' : 'part') }, (rv.passed ? 'اجتاز كل البوابات' : `رسب في ${rv.failedGates.length} بوابة`) + (Number.isFinite(rv.score) ? ` — الدرجة ${fmt(rv.score)} من 100` : '')));
  box.append(el('table', { class: 'rooms gates' }, el('thead', {}, el('tr', {}, el('th', {}, 'البوابة'), el('th', {}, 'النتيجة'))),
    el('tbody', {}, rv.gates.map(g => el('tr', { 'data-gate': g.id, class: g.ok ? '' : 'bad' }, el('td', {}, g.ar || g.id),
      el('td', {}, g.ok ? (g.applicable === false ? 'لا ينطبق' : 'ناجح') : el('span', {}, 'راسب', (g.reasons_ar || [])[0] ? el('small', { class: 'why' }, ' — ' + g.reasons_ar[0]) : null)))))));
  box.append(el('p', { class: 'sub' }, 'المراجعة آلية مستقلة عن المولّد، وعتباتها قيم تصميمية معلنة لا اشتراطات نظامية متحققة؛ المراجعة المعمارية البشرية مطلوبة قبل الاعتماد النهائي.'));
  return box;
}

/** رد شرعاء على آخر طلب: ما نفّذته، وما لم أستطع وسببه، وما لم أفهمه — بلا ادّعاء. */
function sharaReply(fb) {
  const r = fb?.reply; if (!r) return null;
  const head = r.restored ? `رجعت إلى ${r.restored.index === 0 ? 'التصميم الأول' : 'النسخة ' + (r.restored.version ?? r.restored.index + 1)} كما طلبت.` : r.mode === 'ask-regenerate' || r.mode === 'ask-options' ? 'لم أجد تعديلًا صغيرًا يحقق طلبك؛ لم أغيّر شيئًا قبل اختيارك.' : r.mode === 'zone-regenerated' ? 'أعدت توزيع منطقة واحدة كما اخترت، وبقية المناطق ثابتة حرفيًا (المظلل على المسقط ما تغيّر).' : r.mode === 'switched-alternative' ? `عرضت البديل ${r.alternative} كما اخترت — بديل مختلف لا تعديل للمخطط السابق.` : r.mode === 'regenerated' && r.choice === 'full' ? 'أعدت توزيع البيت كما اخترت صراحة (المظلل على المسقط ما تغيّر).' : r.unchanged ? 'التصميم الحالي يحقق طلبك أصلًا، فلم أغيّر فيه شيئًا.' : r.kept ? 'أبقيت توزيعك نفسه وطبّقت التعديل عليه.' : fb.picks?.includes('layout') || (!fb.text && !fb.picks?.length) ? 'هذا توزيع مختلف كما طلبت.' : 'لم يكن ممكنًا تنفيذ طلبك على التوزيع نفسه، فغيّرت التوزيع لأحققه.';
  const li = (cls, t, why) => el('li', { class: cls }, t, why ? el('span', { class: 'why' }, why) : null);
  // ما تغيّر في المخطط فعلًا (مقيسًا): من التعديل الموضعي أو من إعادة التوزيع المعلنة
  const changed = [...(r.changed || []), ...(r.fallback?.changed || [])].filter(c => c.kind !== 'openings');
  return el('section', { class: 'card shara-reply', id: 'sharaReply', 'aria-live': 'polite' },
    el('div', { class: 'who' }, el('div', { class: 'av' }, 'ش'), el('div', {}, el('b', {}, 'شرعاء: '), head)),
    (r.done.length || r.picks.length) ? el('div', {}, el('p', { class: 'sub' }, 'نُفّذ:'), el('ul', { class: 'tick' }, [...r.picks.map(t => li('good', t)), ...r.done.map(t => li('good', t))])) : null,
    r.failed.length ? el('div', {}, el('p', { class: 'sub' }, 'لم يُنفَّذ — لم أستطع تنفيذه في هذه الأرض مع بقية طلباتك:'), el('ul', { class: 'tick' }, r.failed.map(x => li('bad', x.text, x.why)))) : null,
    (r.already || []).filter(x => !r.done.includes(x.text)).length ? el('div', {}, el('p', { class: 'sub' }, 'لم يحتج تغييرًا:'), el('ul', { class: 'tick' }, r.already.filter(x => !r.done.includes(x.text)).map(x => li('no', x.text, x.why)))) : null,
    r.fallback?.said_ar ? el('p', { class: 'sub' }, r.fallback.said_ar) : null,
    changed.length ? el('div', {}, el('p', { class: 'sub' }, r.restored ? 'عاد إلى حاله في ذلك التصميم:' : 'تغيّر في المخطط:'), el('ul', { class: 'tick' }, changed.map(c => li(c.inScope === false && !r.restored ? 'no' : 'good', c.text_ar)))) : null,
    r.facadeNote ? el('p', { class: 'sub' }, r.facadeNote + '.') : null,
    Number.isInteger(r.keptRooms) ? el('p', { class: 'sub' }, `بقية الغرف (${r.keptRooms}) كما هي مقيسًا${r.geometryIdentical ? '، والجدران والفتحات نفسها حرفيًا' : ''}.`) : null,
    // البصمة الهندسية: كم عنصرًا تغيّر وكم بقي ثابتًا حرفيًا، وإثبات الرجوع إلى النسخة
    // (الجولة السادسة عشرة) لغة العميل: عدّ الجدران والفتحات (البصمة الهندسية) تفصيل هندسي مطوي لا رسالة للعميل
    (r.fingerprint?.summary_ar && r.mode !== 'ask-regenerate') || r.restoreProof?.summary_ar || r.fallback?.detail_ar ? el('details', { class: 'sub eng-detail' }, el('summary', {}, 'تفاصيل هندسية'),
      r.fingerprint?.summary_ar && r.mode !== 'ask-regenerate' ? el('p', { class: 'sub', 'data-fingerprint': '' }, r.fingerprint.summary_ar + (Number.isInteger(r.version) ? ` (النسخة ${r.version})` : '')) : null,
      r.restoreProof?.summary_ar ? el('p', { class: 'sub', 'data-restore-proof': '' }, r.restoreProof.summary_ar) : null) : null,
    (r.questions || []).length ? el('ul', { class: 'tick' }, r.questions.map(q => li('no', q))) : null,
    r.unclear.length ? el('div', {}, el('p', { class: 'sub' }, 'لم أفهم هذه العبارات فلم أطبّقها؛ اكتبها بصيغة مباشرة (مثل: «المطبخ في الخلف»):'), el('ul', { class: 'tick' }, r.unclear.map(t => li('no', '«' + t + '»')))) : null,
    r.unsupported.length ? el('ul', { class: 'tick' }, r.unsupported.map(t => li('no', t))) : null);
}

/** مصغّر مخطط خيار التعديل (160×120): لا يُرسم إن لم يتوفر مستنده. */
function optionThumb(o, sess) {
  let raw = null;
  try {
    if (o.thumb?.src === 'current') raw = sess.designs[sess.current]?.doc;
    else if (o.thumb?.src === 'pending') raw = sess.pendingEdit?.[o.thumb.key]?.doc;
    else if (o.thumb?.src === 'alt') raw = (sess.alternatives || []).find(a => a.index === o.thumb.index)?.doc;
  } catch { raw = null; }
  if (!raw) return null;
  try {
    const d = typeof raw === 'string' ? parseDoc(raw) : raw, lvId = d.levels[0].id, c = el('canvas', { width: 160, height: 120, class: 'opt-thumb', 'data-thumb': o.id, style: 'display:block;margin:0 auto 4px;background:#fff;border-radius:6px' });
    const L = analyzeDoc(d).levelById.get(lvId), an = L ? { rooms: L.rooms, gaps: [], exteriorWallIds: exteriorWallIds(L.analysis) } : null;
    const b = docBounds(d, lvId), v = fitView({ x0: b.x0 - .5, y0: b.y0 - .5, x1: b.x1 + .5, y1: b.y1 + .5 }, 160, 120, 4), ctx = c.getContext('2d');
    if (ctx) renderPlan(ctx, { doc: d, levelId: lvId, view: v, W: 160, H: 120, analysis: an, flags: { grid: false, dims: false, areas: false, fixtures: false, underlay: false, roomDims: false, scaleBar: false, compass: false }, roomFill: rm => ZONES[zoneOf(rm.label)].color });
    // (الجولة السابعة عشرة) وسم المطبخ والطعام والمجلس على المصغّر
    if (ctx && L) { ctx.save(); ctx.font = 'bold 10px Tahoma'; ctx.textAlign = 'center'; ctx.fillStyle = '#1d2a24'; for (const t of thumbLabels(L.rooms)) ctx.fillText(t.text, (t.x - v.cx) * v.scale + 80, (v.cy - t.y) * v.scale + 64); ctx.restore(); }
    return c;
  } catch { return null; }
}

function legend() {
  const box = $('legend'); if (!box) return;
  box.replaceChildren(...(zonesOn ? Object.values(ZONES).map(z => el('span', {}, el('i', { style: `background:${z.color}` }), z.label)) : [el('span', {}, 'ألوان حسب نوع الفراغ')]), el('span', { style: 'margin-inline-start:auto' }, 'الشمال أعلى المسقط'));
}

// ------------------------------------------------------------------------------------------ المسقط
// اللمس والفأرة بدقة: إصبع واحد يسحب 1:1، إصبعان تكبير حول منتصفهما مع السحب، والعجلة/لوحة اللمس تكبير حول المؤشر.
// التكبير بالأزرار والعجلة ينساب (تحريك ناعم)، والسحب يستمر قليلًا بعد رفع الإصبع ثم يتوقف تدريجيًا.
let goal = null, raf = 0, lastT = 0, inertia = null;
const MIN_S = 4, MAX_S = 400;
function size() { const r = $('plan').getBoundingClientRect(); return { W: r.width, H: r.height, L: r.left, T: r.top }; }
function zoomAround(v, f, sx, sy) {
  const { W, H } = size(), s = Math.max(MIN_S, Math.min(MAX_S, v.scale * f));
  const wx = (sx - W / 2) / v.scale + v.cx, wy = v.cy - (sy - H / 2) / v.scale;
  return { scale: s, cx: wx - (sx - W / 2) / s, cy: wy + (sy - H / 2) / s };
}
function animate(now) {
  raf = 0; const dt = lastT ? Math.min(.05, (now - lastT) / 1000) : .016; lastT = now;
  let more = false;
  if (inertia && view) {
    view = { ...view, cx: view.cx - inertia.vx * dt / view.scale, cy: view.cy + inertia.vy * dt / view.scale };
    const k = Math.exp(-dt * 6); inertia.vx *= k; inertia.vy *= k;
    if (Math.hypot(inertia.vx, inertia.vy) < 8) inertia = null; else more = true;
  }
  if (goal && view) {
    const a = 1 - Math.exp(-dt * 16);
    view = { scale: view.scale + (goal.scale - view.scale) * a, cx: view.cx + (goal.cx - view.cx) * a, cy: view.cy + (goal.cy - view.cy) * a };
    if (Math.abs(goal.scale - view.scale) / goal.scale < .002 && Math.hypot(goal.cx - view.cx, goal.cy - view.cy) * view.scale < .4) { view = goal; goal = null; } else more = true;
  }
  paint();
  if (more) raf = requestAnimationFrame(animate); else lastT = 0;
}
const run = () => { if (!raf) raf = requestAnimationFrame(animate); };
function bindPlan() {
  const c = $('plan'), pts = new Map(); let pinch = null, samples = [];
  c.addEventListener('pointerdown', e => {
    c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); goal = null; inertia = null; samples = [];
    if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }; }
    c.style.cursor = 'grabbing';
  });
  c.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p || !view) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, { L, T } = size();
      view = zoomAround(view, d / Math.max(1, pinch.d), mx - L, my - T);
      view = { ...view, cx: view.cx - (mx - pinch.mx) / view.scale, cy: view.cy + (my - pinch.my) / view.scale };
      pinch = { d, mx, my }; paint(); return;
    }
    if (pts.size !== 1) return;
    view = { ...view, cx: view.cx - dx / view.scale, cy: view.cy + dy / view.scale };
    const t = performance.now(); samples.push({ t, dx, dy }); while (samples.length && t - samples[0].t > 90) samples.shift();
    paint();
  });
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      c.style.cursor = 'grab';
      const t = performance.now(), recent = samples.filter(s => t - s.t < 90);
      if (recent.length > 1) { const span = Math.max(16, t - recent[0].t) / 1000, vx = recent.reduce((a, s) => a + s.dx, 0) / span, vy = recent.reduce((a, s) => a + s.dy, 0) / span; if (Math.hypot(vx, vy) > 120) { inertia = { vx: Math.max(-2500, Math.min(2500, vx)), vy: Math.max(-2500, Math.min(2500, vy)) }; run(); } }
      samples = [];
    } else if (pts.size === 1) samples = [];
  };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('wheel', e => {
    e.preventDefault(); if (!view) return; inertia = null;
    const { L, T } = size(), base = goal || view;
    // لوحة اللمس/القرص ترسل ctrlKey بقيم صغيرة متتالية؛ الفأرة قيم كبيرة: معاملان مختلفان مع حدّ لكل حدث
    const f = Math.max(.8, Math.min(1.25, Math.exp(-e.deltaY * (e.ctrlKey ? .012 : .0018))));
    goal = zoomAround(base, f, e.clientX - L, e.clientY - T); run();
  }, { passive: false });
  // Safari (آيباد/ماك) يرسل إيماءات قرص خاصة؛ نمنع تكبير الصفحة نفسها فوق المسقط
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) c.addEventListener(g, e => e.preventDefault());
  new ResizeObserver(() => paint()).observe($('planWrap'));
}
function zoom(f) { if (!view) return; const { W, H } = size(); goal = zoomAround(goal || view, f, W / 2, H / 2); run(); }
function paint() {
  const c = $('plan'); if (!c) return;
  const r = c.getBoundingClientRect(), dpr = Math.min(2.5, devicePixelRatio || 1), W = Math.max(10, r.width), H = Math.max(10, r.height);
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lv = model.levelById.get(levelId);
  if (!view) { const b = docBounds(doc, levelId); view = fitView({ x0: b.x0 - 2.4, y0: b.y0 - 2.4, x1: b.x1 + 2.4, y1: b.y1 + 1 }, W, H, Math.min(40, W * .05)); }
  renderPlan(ctx, {
    doc, levelId, view, W, H, analysis: lv ? { rooms: lv.rooms, gaps: [], exteriorWallIds: exteriorWallIds(lv.analysis) } : null,
    flags: { grid: false, dims: true, areas: true, fixtures: true, underlay: false, roomDims: true },
    roomFill: zonesOn ? rm => ZONES[zoneOf(rm.label)].color : null,
  });
  if (diffOn && diffInfo) {
    const X = x => (x - view.cx) * view.scale + W / 2, Y = y => (view.cy - y) * view.scale + H / 2;
    const box = (b, pad = 0) => [X(b.x0) - pad, Y(b.y1) - pad, (b.x1 - b.x0) * view.scale + 2 * pad, (b.y1 - b.y0) * view.scale + 2 * pad];
    ctx.save();
    for (const e of diffInfo.gone.filter(e => e.level === levelId)) { ctx.setLineDash([6, 4]); ctx.strokeStyle = '#b5651d'; ctx.lineWidth = 2; ctx.strokeRect(...box(e.box, 2)); }
    ctx.setLineDash([]);
    for (const e of diffInfo.now.filter(e => e.level === levelId)) {
      if (e.kind === 'room') { ctx.fillStyle = 'rgba(200,40,40,.16)'; ctx.fillRect(...box(e.box)); ctx.strokeStyle = 'rgba(200,40,40,.9)'; ctx.lineWidth = 2; ctx.strokeRect(...box(e.box)); }
      else { ctx.strokeStyle = 'rgba(200,40,40,.85)'; ctx.lineWidth = 3; ctx.strokeRect(...box(e.box, 3)); }
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------ الأفعال
function storeForStudio() { try { localStorage.setItem(STUDIO_KEY, serialize(doc)); } catch { /* التخزين غير متاح */ } }
function onApprove() { session = approve(session); saveSession(localStorage, session); storeForStudio(); location.href = './view3d.html'; }
function onStudio() {
  const alternatives = (session.alternatives || []).map(a => { try { return { index: a.index, strategy: a.strategy, doc: JSON.parse(a.doc) }; } catch { return null; } }).filter(Boolean);
  try { writeHandoff(sessionStorage, doc, { source: 'design-page', note: 'التصميم ' + (session.current + 1) + ' من صفحة العرض؛ عدّل عليه ثم اعتمده.', dna: session.dna, alternatives }); } catch { storeForStudio(); }
  location.href = './studio.html';
}
function openShara() {
  const box = $('fbChips'); box.replaceChildren(...FEEDBACK.map(f => el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', 'data-id': f.id, onclick: e => { const on = e.currentTarget.getAttribute('aria-pressed') === 'true'; e.currentTarget.setAttribute('aria-pressed', String(!on)); } }, f.label)));
  $('fbText').value = ''; $('fbStatus').textContent = ''; $('shara').hidden = false; $('fbGo').disabled = false;
}
$('fbClose').addEventListener('click', () => { $('shara').hidden = true; });
$('fbGo').addEventListener('click', async () => {
  const picks = [...document.querySelectorAll('#fbChips .chip[aria-pressed=true]')].map(b => b.dataset.id), text = $('fbText').value.trim();
  $('fbGo').disabled = true; $('fbStatus').textContent = 'أطبّق ملاحظاتك…';
  await new Promise(r => setTimeout(r, 30));
  try {
    // رمز الدخول (إن أُدخل في المحادثة): Claude يفهم الملاحظة أيضًا، ويُدمج فهمه مع الفهم المحلي
    let ai = null, code = ''; try { code = sessionStorage.getItem('mizan.ai.code') || ''; } catch { /* لا تخزين */ }
    if (code && text.length >= 8) {
      $('fbStatus').textContent = 'أفهم ملاحظتك عبر Claude…';
      try { const { plot } = normalizeLand(session.input.land); ai = (await requestBrief({ prompt: text, plot, previous: { summary: 'ملاحظة تعديل على تصميم معروض؛ استخرج ما تطلبه الملاحظة فقط.', rooms: [] } }, { accessCode: code, signal: AbortSignal.timeout?.(45000) })).brief.requirements || null; }
      catch { ai = null; }
      $('fbStatus').textContent = 'أطبّق ملاحظاتك…';
    }
    const out = await redesign(session, { picks, text, ai });
    // تعارض في الملاحظة: لا تصميم جديد؛ نسأل العميل ونبقي النافذة مفتوحة ليعيد الكتابة
    // سؤال إذن (تعديل يمس غرفة لم تُذكر، أو إعادة توزيع البيت): يُحفظ المقترح في الجلسة ليُنفَّذ بـ«نعم» حرفيًا
    if (out.reply?.conflicts?.length) {
      if (out.reply.conflicts.some(c => c.type === 'needs-consent') && out.session?.pendingEdit) { session = out.session; saveSession(localStorage, session); }
      $('fbStatus').textContent = 'قبل ما أعدّل: ' + out.reply.questions.join(' — ');
      // (الجولة الرابعة عشرة) خيارات التعديل أزرارًا: لا يُستبدل المخطط إلا باختيار صريح من العميل
      // (الجولة السادسة عشرة) لكل خيار مصغّر للمخطط الذي سيُعرض إن اختاره (المعروض، أو المقترح المحفوظ، أو البديل المعروض)
      if (out.reply.mode === 'ask-options' && out.reply.options?.length) $('fbStatus').append(el('div', { class: 'opts', 'data-edit-options': '' }, out.reply.options.map(o => el(o.info ? 'div' : 'button', { type: 'button', class: 'chip opt', 'data-option': o.id, ...(o.info ? {} : { onclick: () => { $('fbText').value = String(o.n); document.querySelectorAll('#fbChips .chip').forEach(b => b.setAttribute('aria-pressed', 'false')); $('fbGo').click(); } }) }, optionThumb(o, out.session), `${o.n}) ${o.text_ar}`))));
      $('fbGo').disabled = false; return;
    }
    session = out.session; saveSession(localStorage, session);
    $('shara').hidden = true; show(session.current); toast(out.reply?.failed?.length ? `نفّذت ${out.reply.done.length} ولم أستطع ${out.reply.failed.length} — التفاصيل أعلى الصفحة` : 'تم — التفاصيل أعلى الصفحة');
    scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { $('fbStatus').textContent = clientErr(err, 'تعذّر تصميم بديل.'); $('fbGo').disabled = false; }
});

try { init(); } catch (e) { $('main').replaceChildren(el('div', { class: 'empty card' }, el('h2', {}, 'تعذّر عرض التصميم'), el('p', {}, clientErr(e, 'حدث خطأ أثناء تحميل الجلسة؛ أعد المحاولة أو ابدأ من الصفحة الرئيسية.')), el('a', { class: 'btn', href: './home.html' }, 'العودة'))); }
globalThis.__mizanDesign = { get session() { return session; }, get doc() { return doc; }, get view() { return view; } }; // للاختبارات الحية
