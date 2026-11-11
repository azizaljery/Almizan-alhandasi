// صفحة عرض التصميم على العميل: المخطط بأبعاده ومناطقه، المواصفات، جدول الغرف، ما طُبّق من طلبه،
// ثم: اعتماد ← العرض ثلاثي الأبعاد، أو «اطلب تصميمًا آخر» (شرعاء تسأل عمّا لم يعجبه)، أو التعديل في المرسم.
import { loadSession, saveSession, redesign, mergeDesigns, approve, FEEDBACK, ZONES, zoneOf, summarizeDoc, currentDoc, ledgerFor, fitFor } from './design-session.mjs';
import { redesignInWorker, fixInWorker, mergeInWorker, warm as warmGenerator, ticking, pending } from './design-client.mjs';
import { analyzeDoc } from './draw/digest.mjs';
import { renderPlan, fitView, docBounds } from './draw/editor/render2d.mjs';
import { exteriorWallIds } from './draw/topology.mjs';
import { writeHandoff, STUDIO_KEY } from './draw/handoff.mjs';
import { serialize } from './draw/doc.mjs';
import { requestBrief } from './assistant.mjs';
import { normalizeLand } from './home-flow.mjs';
import { displayOr } from './field-guards.mjs';
import { compareDesigns } from './compare-designs.mjs';
import { parseDoc } from './draw/doc.mjs';
import { fixProposals, applyFix, applyFitDecision } from './design-fixes.mjs';
import { exteriorQuestions, answerLabel, describeExterior, setExterior, normalizeExterior, parseExteriorText, storeExterior, readExterior } from './exterior-brief.mjs';

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c !== null && c !== undefined) n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; };
const fmt = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const toast = t => { const n = el('div', { class: 'toast', role: 'status' }, t); document.body.append(n); setTimeout(() => n.remove(), 3200); };

let session = loadSession(localStorage), doc = null, levelId = 'L1', zonesOn = true, view = null, model = null, focus = null;

function init() {
  if (!session) {
    $('main').replaceChildren(el('div', { class: 'empty card' }, el('h2', {}, 'لا يوجد تصميم بعد'), el('p', {}, 'ابدأ من الأرض ثم تحدّث مع شرعاء لنصمّم لك منزلك.'), el('a', { class: 'btn primary', href: './home.html' }, 'ابدأ رحلة التصميم')));
    return;
  }
  show(session.current);
  if (location.hash === '#exterior') onApprove(); // رابط مرحلة «الشكل الخارجي»: يعتمد التصميم المعروض ويفتح حوار شرعاء
}
// الرابط يحكم حوار الشكل الخارجي: ‎#exterior‎ يفتحه، وغيابه يغلقه — فيعمل زر رجوع/تقدم المتصفح وشريط الخطوات بلا إعادة تحميل
function syncHash() { if (!session) return; const want = location.hash === '#exterior', ext = $('extShara'); if (want && ext.hidden) onApprove(); else if (!want && !ext.hidden) { ext.hidden = true; extPushed = false; } }
addEventListener('hashchange', syncHash); addEventListener('popstate', syncHash);
addEventListener('pageshow', e => { if (e.persisted) { const s2 = loadSession(localStorage); if (s2) { session = s2; try { show(session.current); } catch { /* تبقى الصفحة كما هي */ } } syncHash(); } });

function show(index) {
  // الجلسة (عدة ميغابايت نصًّا) تُكتب فقط إن تغيّر التصميم المعروض؛ من ولّد أو عدّل يحفظها قبل العرض
  if (session.current !== index) { session.current = index; saveSession(localStorage, session); }
  doc = currentDoc(session); model = analyzeDoc(doc); levelId = doc.levels[0].id; view = null; goal = null; inertia = null; focus = null;
  const d = session.designs[index], S = summarizeDoc(doc), req = session.input.requirements || {};
  const specs = [
    ['غرف النوم', displayOr(S.specs.bedrooms)], ['دورات المياه', displayOr(S.specs.baths)], ['المجالس', displayOr(S.specs.majlis)], ['الأدوار', displayOr(S.specs.floors)],
    ['مسطح البناء', fmt(S.specs.built) + ' م²'], ['أبعاد المبنى', `${fmt(S.specs.width)} × ${fmt(S.specs.depth)} م`], ['المداخل', displayOr(S.specs.entries)],
  ];
  const levels = doc.levels.length > 1 ? el('div', { class: 'seg', role: 'tablist' }, doc.levels.map(l => el('button', { 'data-level': l.id, class: l.id === levelId ? 'on' : '', onclick: () => { levelId = l.id; view = null; goal = null; inertia = null; document.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('on', b.dataset.level === levelId)); paint(); } }, l.name))) : null;
  const zoneToggle = el('label', {}, el('input', { type: 'checkbox', id: 'zonesOn', checked: zonesOn, onchange: e => { zonesOn = e.target.checked; paint(); legend(); } }), 'تلوين المناطق');
  const plan = el('div', { class: 'card plancard' },
    el('div', { class: 'planbar' }, levels, zoneToggle, el('div', { class: 'tools' }, el('button', { title: 'تكبير', 'aria-label': 'تكبير', onclick: () => zoom(1.25) }, '+'), el('button', { title: 'تصغير', 'aria-label': 'تصغير', onclick: () => zoom(.8) }, '−'), el('button', { title: 'ملاءمة', 'aria-label': 'ملاءمة', onclick: () => { goal = null; inertia = null; view = null; paint(); } }, '⤢'))),
    el('div', { class: 'focusbar', id: 'focusBar', hidden: true }, el('span', { id: 'focusText' }), el('button', { type: 'button', class: 'btn', onclick: () => setFocus(null) }, 'إلغاء الإضاءة')),
    el('div', { class: 'planwrap', id: 'planWrap' }, el('canvas', { id: 'plan', 'aria-label': 'مسقط التصميم' })),
    el('div', { class: 'legend', id: 'legend' }));
  const ledger = ledgerFor(session, doc), done = ledger.filter(x => x.ok), miss = ledger.filter(x => !x.ok);
  const side = el('div', { class: 'actions card' },
    el('h2', {}, 'ما رأيك في هذا التصميم؟'),
    el('button', { class: 'btn gold', id: 'btnApprove', onclick: onApprove }, 'أعجبني — اعتمده واختر شكله الخارجي ←'),
    el('button', { class: 'btn primary', id: 'btnAnother', onclick: openShara }, 'اطلب تصميمًا آخر'),
    session.designs.length >= 2 ? el('button', { class: 'btn', id: 'btnCompare', onclick: openCompare }, 'قارن بين تصميمين جنبًا إلى جنب') : null,
    session.designs.length >= 2 ? el('button', { class: 'btn', id: 'btnMerge', onclick: openMerge }, 'ادمج تصميمين في تصميم واحد') : null,
    el('button', { class: 'btn', id: 'btnStudio', onclick: onStudio }, 'عدّل عليه بيدك في المرسم'),
    el('small', {}, 'بعد الاعتماد تسألك شرعاء عن الشكل الخارجي الذي تحبه، ثم يفتح العرض ثلاثي الأبعاد على واجهة بيتك، ومنه المخرجات (الإنشائي والكميات والتكلفة وكتاب المشروع).'));
  // سجل التنفيذ: كل بند من طلبك مقيس من المخطط نفسه، لا من نية المولّد
  const reqCard = el('div', { class: 'card ledger', id: 'ledger' }, el('h2', {}, 'هل نُفّذ طلبك؟'),
    ledger.length ? el('p', { class: 'score ' + (miss.length ? 'part' : 'full') }, miss.length ? `نُفّذ ${done.length} من ${ledger.length} بنود، وبقي ${miss.length}` : `نُفّذت كل البنود (${ledger.length})`) : el('p', { class: 'sub' }, 'لم تذكر طلبات مكانية أو مقاسات؛ طُبّقت الأعداد التي حددتها.'),
    ledger.length ? el('p', { class: 'sub hint' }, 'اضغط أي بند لترى موضعه في المسقط.') : null,
    miss.length ? el('ul', { class: 'tick' }, miss.map(x => el('li', ledgerAttrs(x, 'bad'), el('b', {}, x.text), x.why ? el('span', { class: 'why' }, x.why) : null))) : null,
    done.length ? el('ul', { class: 'tick' }, done.map(x => el('li', ledgerAttrs(x, 'good'), x.text, x.why ? el('span', { class: 'why' }, x.why) : null))) : null,
    miss.length ? el('p', { class: 'sub' }, 'اطلب تصميمًا آخر وسأبحث عن توزيع ينفّذ البنود الباقية، أو اكتب تعديلك لشرعاء.') : null,
    (req.unsupported || []).length ? el('ul', { class: 'tick' }, req.unsupported.map(t => el('li', { class: 'no' }, t))) : null);
  // مقترحات الإصلاح: كل ملاحظة بزر «نفّذ»؛ الموقع يعالجها بنفسه (ولو غيّر التوزيع كله) دون إسقاط رغبة للعميل، ويشرح ما تعذّر
  const props = fixProposals(session, doc), KIND = { request: 'من طلبك', custom: 'عرف سعودي افتراضي', review: 'ملاحظة الفحص' };
  const fixCard = props.length ? el('div', { class: 'card fixes', id: 'fixes' }, el('h2', {}, 'مقترحات لتحسين هذا التصميم'),
    el('p', { class: 'sub' }, `وجدت ${props.length} ${props.length === 1 ? 'ملاحظة' : 'ملاحظات'} يمكن علاجها. اضغط «نفّذ» وسأعالجها بنفسي — في موضعها إن أمكن، أو بتوزيع آخر إن لزم — دون أن أُسقط شيئًا مما طلبته، وأخبرك بما تعذّر وسببه.`),
    el('ul', { class: 'fixlist' }, props.map(p => el('li', { class: p.severity === 'error' ? 'bad' : 'warn' }, el('div', {}, el('span', { class: 'tag' }, KIND[p.kind]), el('b', {}, p.text), p.why ? el('span', { class: 'why' }, p.why) : null, el('span', { class: 'why' }, p.how === 'patch' ? 'يُعالَج في موضعه دون تغيير التوزيع.' : 'قد يحتاج توزيعًا آخر للغرف.')),
      el('button', { type: 'button', class: 'btn', 'data-fix': p.id, onclick: () => runFix(p.id) }, 'نفّذ')))),
    props.length > 1 ? el('button', { type: 'button', class: 'btn primary', id: 'fixAll', onclick: () => runFix('all') }, 'نفّذ كل المقترحات') : null,
    el('p', { class: 'sub', id: 'fixStatus', 'aria-live': 'polite' })) : null;
  // بيان ما تغيّر عن الطلب (أرض لم تتسع للبرنامج كاملًا): ما استُبعد وما دُمج وما صُغّر وسببه بالأرقام، وقرارات يضغطها العميل.
  // كله مقيس من المخطط المعروض وطلب العميل الأصلي؛ لا يُعرض إن طابق التصميم الطلب.
  const fitCard = renderFit(fitFor(session, doc));
  const notes = el('div', { class: 'card' }, el('h2', {}, 'ملاحظات التصميم'), el('ul', { class: 'notes' }, [d.summary, ...(d.notes || [])].filter(Boolean).map(t => el('li', {}, t))),
    d.feedback?.changes?.length ? el('p', { class: 'sub' }, (d.feedback.merge ? '' : 'عدّلتُ هذا التصميم بناءً على: ') + d.feedback.changes.join('، ')) : null);
  const table = el('table', { class: 'rooms' }, el('thead', {}, el('tr', {}, el('th', {}, 'الفراغ'), doc.levels.length > 1 ? el('th', {}, 'الدور') : null, el('th', {}, 'الأبعاد (م)'), el('th', {}, 'المساحة (م²)'), el('th', {}, 'المنطقة'))),
    el('tbody', {}, S.rooms.filter(r => r.area >= 2).map(r => el('tr', {}, el('td', {}, el('span', { class: 'z', style: `background:${ZONES[r.zone].color}` }), r.name), doc.levels.length > 1 ? el('td', {}, r.level) : null, el('td', { class: 'num' }, `${fmt(r.l)} × ${fmt(r.w)}`), el('td', { class: 'num' }, fmt(r.area)), el('td', {}, ZONES[r.zone].label)))),
    el('tfoot', {}, el('tr', {}, el('th', {}, 'إجمالي المساحات الصافية'), doc.levels.length > 1 ? el('th', {}) : null, el('th', {}), el('th', { class: 'num' }, fmt(S.specs.net)), el('th', {}))));
  const history = session.designs.length > 1 ? el('div', { class: 'history', 'aria-label': 'التصاميم' }, session.designs.map((x, i) => el('button', { class: i === index ? 'on' : '', title: x.summary || '', onclick: () => show(i) }, 'التصميم ' + (i + 1) + (x.feedback?.merge ? ' (دمج)' : '')))) : null;
  const replyCard = sharaReply(d.feedback);
  // replaceChildren يحوّل null إلى النص «null»؛ بطاقة الرد تُمرَّر فقط إن وُجدت
  $('main').replaceChildren(
    ...(replyCard ? [replyCard] : []),
    el('div', { class: 'titlebar' }, el('div', {}, el('h1', {}, index === 0 ? 'تصميمك الأولي' : 'التصميم ' + (index + 1)), el('div', { class: 'sub' }, 'مسقط مبدئي قابل للتعديل؛ الأبعاد بين محاور الجدران والمساحات صافية من داخل الجدران.')), history),
    el('section', { class: 'specs', 'aria-label': 'المواصفات' }, specs.map(([k, v]) => el('div', { class: 'spec' }, el('b', {}, v), el('span', {}, k)))),
    ...(fitCard ? [fitCard] : []),
    el('div', { class: 'grid' }, plan, el('div', { class: 'actions', style: 'gap:16px' }, side, ...(fixCard ? [fixCard] : []), reqCard)),
    el('div', { class: 'cols' }, el('div', { class: 'card' }, el('h2', {}, 'جدول الفراغات'), table), notes));
  legend(); bindPlan(); paint();
}

/** بطاقة «بيان ما تغيّر عن طلبك»: تظهر فقط إن اختلف المخطط عن الطلب. */
function renderFit(st) {
  if (!st || !st.items.length) return null;
  const f = st.facts, GROUPS = [['floors', 'عدد الأدوار'], ['drop', 'استُبعد'], ['merge', 'دُمج'], ['shrink', 'صُغّر']];
  const factLine = f ? `أرضك ${fmt(f.plotW)} × ${fmt(f.plotD)} م. بعد الارتدادات (${fmt(f.sideSetbacks[0])} + ${fmt(f.sideSetbacks[1])} م على الجانبين، و${fmt(f.depthSetbacks[0])} + ${fmt(f.depthSetbacks[1])} م أمامًا وخلفًا) يبقى للبناء ${fmt(f.W)} × ${fmt(f.D)} م = ${fmt(f.area)} م² للدور${st.need ? `، وبرنامجك بالمقاسات المعتادة يحتاج نحو ${fmt(st.need)} م²` : ''}.` : null;
  const item = i => el('li', { class: 'fit-' + i.kind, 'data-fit': i.id },
    el('div', {}, el('span', { class: 'tag' }, i.asked ? 'من طلبك' : 'افتراض لم تطلبه'), el('b', {}, i.text),
      i.kind === 'shrink' ? el('span', { class: 'num' }, `من ${fmt(i.from)} إلى ${fmt(i.to)} م²`) : i.kind !== 'floors' && i.from !== i.to && i.unit ? el('span', { class: 'num' }, `طلبك ${fmt(i.from)} ← في التصميم ${fmt(i.to)}`) : null,
      i.why ? el('span', { class: 'why' }, i.why) : null),
    i.actions?.length ? el('div', { class: 'fit-acts' }, i.actions.map(a => el('button', { type: 'button', class: 'btn', 'data-decision': a.id, onclick: () => runDecision(a.id) }, a.label))) : null);
  return el('section', { class: 'card fit', id: 'fitCard', 'aria-label': 'بيان ما تغيّر عن طلبك' },
    el('h2', {}, 'بيان ما تغيّر عن طلبك'),
    el('p', { class: 'sub' }, 'صمّمت لك بيتًا سليمًا على أرضك، لكن لم أجد توزيعًا يضم كل ما طلبته كما هو. هذا ما تغيّر وسببه، والقرار لك: اضغط أي خيار وأعيد التصميم حوله.'),
    factLine ? el('p', { class: 'fit-facts' }, factLine) : null,
    GROUPS.map(([k, title]) => { const list = st.items.filter(i => i.kind === k); return list.length ? el('div', { class: 'fit-group' }, el('h3', {}, `${title} (${list.length})`), el('ul', { class: 'fitlist' }, list.map(item))) : null; }),
    st.decisions.length ? el('div', { class: 'fit-decide' }, el('h3', {}, 'أو قرّر أنت ما يُخفَّف'), el('div', { class: 'fit-acts' }, st.decisions.map(a => el('button', { type: 'button', class: 'btn primary', 'data-decision': a.id, onclick: () => runDecision(a.id) }, a.label)))) : null,
    el('p', { class: 'sub', id: 'fitStatus', 'aria-live': 'polite' }),
    el('p', { class: 'sub hint' }, 'كل بند هنا مقيس من المخطط المعروض نفسه. «لم أجد توزيعًا» تعني أن مولّد الميزان لم يجد، لا أن أرضك لا تصلح؛ ويمكنك دائمًا التعديل بيدك في المرسم.'));
}
/** قرار العميل: يعيد الموقع التوليد حوله ويحدّث البيان؛ إن تعذّر لا يتغير التصميم ويُذكر السبب. */
async function runDecision(id) {
  const st = $('fitStatus'), btns = [...document.querySelectorAll('#fitCard button')];
  btns.forEach(b => { b.disabled = true; }); if (st) st.textContent = 'أعيد التصميم حول قرارك…';
  await new Promise(r => setTimeout(r, 30));
  try {
    const out = await applyFitDecision(session, id);
    if (!out.changed) { if (st) st.textContent = 'لم أغيّر تصميمك: ' + out.reply.failed.map(f => `${f.text} — ${f.why}`).join(' '); btns.forEach(b => { b.disabled = false; }); return; }
    session = out.session; saveSession(localStorage, session); show(session.current);
    toast('نفّذت قرارك — التفاصيل أعلى الصفحة'); scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { if (st) st.textContent = 'تعذّر تنفيذ القرار: ' + (e.message || 'خطأ غير معروف') + ' لم أغيّر تصميمك.'; btns.forEach(b => { b.disabled = false; }); }
}

/** تنفيذ مقترح إصلاح (أو كلها): النتيجة تصميم جديد يُعرض مع رد شرعاء بما عولج وما تعذّر وسببه. */
async function runFix(id) {
  if (pending()) { toast('ما زلت أنفّذ طلبك السابق؛ انتظر حتى ينتهي.'); return; }
  const st = $('fixStatus'), btns = [...document.querySelectorAll('#fixes button')], mine = btns.find(b => (id === 'all' ? b.id === 'fixAll' : b.dataset.fix === id)), label = mine?.textContent;
  // التنفيذ في عامل خارج الخيط الرئيسي: الصفحة تبقى تستجيب (تمرير، تكبير المسقط) والمؤشر يعدّ الثواني الفعلية
  const done = busy(true, st, 'أعالج الملاحظات… قد أجرّب عدة توزيعات.'); if (mine) mine.textContent = 'جارٍ التنفيذ…';
  const restore = () => { done(); if (mine) mine.textContent = label; };
  try {
    const out = await fixInWorker(session, id);
    if (!out.changed) { restore(); if (st) st.textContent = out.reply.failed.length ? 'لم أجد علاجًا: ' + out.reply.failed.map(f => `«${f.text}» — ${f.why}`).join(' ') : 'لا شيء يحتاج علاجًا.'; return; }
    done();
    session = out.session; saveSession(localStorage, session); show(session.current);
    toast(out.reply.failed.length ? `عالجت ${out.reply.fixed.length} وتعذّر ${out.reply.failed.length} — التفاصيل أعلى الصفحة` : 'عالجت الملاحظات — التفاصيل أعلى الصفحة'); scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { restore(); if (st) st.textContent = 'تعذّر تنفيذ المقترح: ' + (e.message || 'خطأ غير معروف') + ' لم أغيّر تصميمك.'; }
}
/**
 * حالة «جارٍ التنفيذ» للصفحة: تُعطَّل أزرار الأفعال (حتى لا يبدأ طلبان على الجلسة نفسها) ويظهر نص الحالة مع الثواني المنقضية.
 * تعيد دالة الإنهاء (تعيد الأزرار كما كانت).
 */
function busy(on, statusNode, text) {
  const btns = [...document.querySelectorAll('.actions button, #fixes button, .history button, #fbGo, #mgGo')].filter(b => !b.disabled);
  btns.forEach(b => { b.disabled = true; }); document.body.dataset.busy = '1';
  const stop = ticking(statusNode, text);
  return () => { stop(); btns.forEach(b => { b.disabled = false; }); delete document.body.dataset.busy; };
}

/** رد شرعاء على آخر طلب: ما نفّذته، وما لم أستطع وسببه، وما لم أفهمه — بلا ادّعاء. */
function sharaReply(fb) {
  const r = fb?.reply; if (!r) return null;
  if (r.merge) return mergeReply(r);
  if (r.decision) return decisionReply(r);
  const head = r.fixRun ? (r.relayout ? 'غيّرت توزيع الغرف لأعالج الملاحظات، وأبقيت كل ما طلبته محققًا.' : 'عالجت الملاحظات على توزيعك نفسه دون تغييره.') : r.unchanged ? 'التصميم الحالي يحقق طلبك أصلًا، فلم أغيّر فيه شيئًا.' : r.kept ? 'أبقيت توزيعك نفسه وطبّقت التعديل عليه.' : r.altAsk || fb.picks?.includes('layout') || (!fb.text && !fb.picks?.length) ? 'هذا توزيع مختلف كما طلبت، وليس تكرارًا لأي تصميم عرضته عليك.' : 'لم يكن ممكنًا تنفيذ طلبك على التوزيع نفسه، فغيّرت التوزيع لأحققه.';
  const li = (cls, t, why) => el('li', { class: cls }, t, why ? el('span', { class: 'why' }, why) : null);
  return el('section', { class: 'card shara-reply', id: 'sharaReply', 'aria-live': 'polite' },
    el('div', { class: 'who' }, el('div', { class: 'av' }, 'ش'), el('div', {}, el('b', {}, 'شرعاء: '), head)),
    (r.done.length || r.picks.length) ? el('ul', { class: 'tick' }, [...r.picks.map(t => li('good', t)), ...r.done.map(t => li('good', t))]) : null,
    r.failed.length ? el('div', {}, el('p', { class: 'sub' }, 'لم أستطع تنفيذه في هذه الأرض مع بقية طلباتك:'), el('ul', { class: 'tick' }, r.failed.map(x => li('bad', x.text, x.why)))) : null,
    r.unclear.length ? el('div', {}, el('p', { class: 'sub' }, 'لم أفهم هذه العبارات فلم أطبّقها؛ اكتبها بصيغة مباشرة (مثل: «المطبخ في الخلف»):'), el('ul', { class: 'tick' }, r.unclear.map(t => li('no', '«' + t + '»')))) : null,
    r.unsupported.length ? el('ul', { class: 'tick' }, r.unsupported.map(t => li('no', t))) : null);
}

/** رد شرعاء على قرار العميل في بيان الاتساع: ما عاد، وما خُفّف في المقابل، مقيسًا من المخططين. */
function decisionReply(r) {
  const li = (cls, t, why) => el('li', { class: cls }, t, why ? el('span', { class: 'why' }, why) : null);
  return el('section', { class: 'card shara-reply', id: 'sharaReply', 'aria-live': 'polite' },
    el('div', { class: 'who' }, el('div', { class: 'av' }, 'ش'), el('div', {}, el('b', {}, 'شرعاء: '), `نفّذت قرارك «${r.decision}» وأعدت التصميم حوله.${r.left ? ' البيان المحدَّث أسفل المواصفات.' : ' التصميم الآن يطابق طلبك؛ لم يبقَ في البيان شيء.'}`)),
    r.back?.length ? el('div', {}, el('p', { class: 'sub' }, 'عاد إلى التصميم:'), el('ul', { class: 'tick' }, r.back.map(t => li('good', t)))) : null,
    r.undone?.length ? el('p', { class: 'sub' }, `قرارك هذا يتعارض مع تثبيتك السابق لـ${r.undone.map(t => '«' + t + '»').join(' و')} على هذه الأرض؛ قدّمتُ قرارك الأحدث وتراجعت عن ذاك التثبيت.`) : null,
    r.cost?.length ? el('div', {}, el('p', { class: 'sub' }, 'وتغيّر معه في البيان:'), el('ul', { class: 'tick' }, r.cost.map(t => li('no', t)))) : null,
    r.failed?.length ? el('ul', { class: 'tick' }, r.failed.map(x => li('bad', x.text, x.why))) : null);
}

/** رد شرعاء على الدمج: ما بقي في موضعه من كل تصميم، مقيسًا من المخطط الناتج. */
function mergeReply(r) {
  const [a, b] = r.merge, list = (title, items) => items.length ? el('div', {}, el('p', { class: 'sub' }, title), el('ul', { class: 'tick' }, items.map(t => el('li', { class: 'good' }, t)))) : null;
  return el('section', { class: 'card shara-reply', id: 'sharaReply', 'aria-live': 'polite' },
    el('div', { class: 'who' }, el('div', { class: 'av' }, 'ش'), el('div', {}, el('b', {}, 'شرعاء: '), `دمجت التصميم ${a} والتصميم ${b} في توزيع سليم جديد؛ يشبه الأول بنسبة ${r.simA}٪ والثاني بنسبة ${r.simB}٪.`)),
    list(`من التصميم ${a} وحده (في موضعه هناك):`, r.fromA),
    list(`من التصميم ${b} وحده (في موضعه هناك):`, r.fromB),
    r.both.length ? el('p', { class: 'sub' }, `وبقي في موضعه المشترك بين التصميمين ${r.both.length} فراغًا.`) : null,
    !r.fromA.length || !r.fromB.length ? el('p', { class: 'sub' }, `لم أجد توزيعًا سليمًا يأخذ من التصميم ${!r.fromA.length ? a : b} شيئًا لا يشترك فيه مع الآخر؛ أخذت منه مواضعه المشتركة.`) : null,
    r.fresh.length ? el('p', { class: 'sub' }, 'فراغات في مواضع جديدة لتستقيم الحركة: ' + r.fresh.join('، ')) : null);
}
function openMerge() {
  const box = $('mgList'); box.replaceChildren(...session.designs.map((x, i) => el('label', { class: 'mg-item' }, el('input', { type: 'checkbox', value: String(i), onchange: () => { const on = [...box.querySelectorAll('input:checked')]; if (on.length > 2) on.find(c => c.value !== String(i)).checked = false; $('mgGo').disabled = box.querySelectorAll('input:checked').length !== 2; } }),
    el('span', {}, el('b', {}, 'التصميم ' + (i + 1)), ' — ', x.summary || 'تصميم'))));
  const cur = box.querySelector(`input[value="${session.current}"]`); if (cur) cur.checked = true;
  $('mgGo').disabled = true; $('mgStatus').textContent = ''; $('merge').hidden = false;
}
$('mgClose').addEventListener('click', () => { $('merge').hidden = true; });
$('mgGo').addEventListener('click', async () => {
  const [a, b] = [...document.querySelectorAll('#mgList input:checked')].map(c => Number(c.value));
  if (pending()) { $('mgStatus').textContent = 'ما زلت أنفّذ طلبك السابق؛ انتظر حتى ينتهي.'; return; }
  const done = busy(true, $('mgStatus'), 'أدمج التصميمين… أبحث عن توزيع سليم يأخذ من كليهما.'); $('mgGo').textContent = 'جارٍ الدمج…';
  const end = () => { done(); $('mgGo').textContent = 'ادمج التصميمين'; };
  try {
    const out = await mergeInWorker(session, a, b); end();
    session = out.session; saveSession(localStorage, session);
    $('merge').hidden = true; show(session.current); toast('تم الدمج — التفاصيل أعلى الصفحة'); scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { end(); $('mgStatus').textContent = err.message || 'تعذّر الدمج.'; $('mgGo').disabled = false; }
});

/** مقارنة تصميمين جنبًا إلى جنب: المسقطان مع تظليل ما تغيّر موضعه، وأهم الفروق، وجدول المواصفات. */
function openCompare() {
  const opts = session.designs.map((x, i) => el('option', { value: String(i) }, 'التصميم ' + (i + 1)));
  const sa = $('cmpA'), sb = $('cmpB');
  sa.replaceChildren(...opts.map(o => o.cloneNode(true))); sb.replaceChildren(...opts.map(o => o.cloneNode(true)));
  const cur = session.current, other = cur === 0 ? 1 : cur - 1;
  sa.value = String(Math.min(cur, other)); sb.value = String(Math.max(cur, other));
  $('compare').hidden = false; renderCompare();
}
const cmpCell = (v, u) => (typeof v === 'number' ? `${fmt(v)}${u ? ' ' + u : ''}` : `${v ?? '—'}${u && v ? ' ' + u : ''}`);
function compareLevelOf(d) { return d.levels[0].id; }
function drawMini(canvas, d, highlight) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), W = Math.max(10, r.width), H = Math.max(10, r.height);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const lid = $('cmpLevel').value && d.levels.some(l => l.id === $('cmpLevel').value) ? $('cmpLevel').value : compareLevelOf(d);
  const m = analyzeDoc(d), lv = m.levelById.get(lid), b = docBounds(d, lid);
  renderPlan(ctx, { doc: d, levelId: lid, view: fitView({ x0: b.x0 - 1.5, y0: b.y0 - 1.5, x1: b.x1 + 1.5, y1: b.y1 + 1 }, W, H, 14), W, H,
    analysis: lv ? { rooms: lv.rooms, gaps: [], exteriorWallIds: exteriorWallIds(lv.analysis) } : null,
    flags: { grid: false, dims: false, areas: true, fixtures: false, underlay: false, roomDims: false },
    roomFill: rm => (highlight.has(rm.label?.name) ? '#e2b27e' : '#f3efe8') });
}
function renderCompare() {
  const ia = Number($('cmpA').value), ib = Number($('cmpB').value);
  if (ia === ib) { $('cmpBody').hidden = true; $('cmpMsg').textContent = 'اختر تصميمين مختلفين.'; return; }
  $('cmpBody').hidden = false; $('cmpMsg').textContent = '';
  const A = parseDoc(session.designs[ia].doc), B = parseDoc(session.designs[ib].doc);
  const mkLedger = i => { try { return ledgerFor({ ...session, current: i }, parseDoc(session.designs[i].doc)); } catch { return []; } };
  const c = compareDesigns(A, B, { ledgerA: mkLedger(ia), ledgerB: mkLedger(ib), nameA: String(ia + 1), nameB: String(ib + 1) });
  const lvSel = $('cmpLevel'), levels = A.levels.length > 1 || B.levels.length > 1 ? (A.levels.length >= B.levels.length ? A : B).levels : [];
  if (levels.length) { if (!lvSel.options.length) lvSel.replaceChildren(...levels.map(l => el('option', { value: l.id }, l.name))); lvSel.parentElement.hidden = false; } else { lvSel.replaceChildren(); lvSel.parentElement.hidden = true; }
  $('cmpTitleA').textContent = `التصميم ${ia + 1}`; $('cmpTitleB').textContent = `التصميم ${ib + 1}`;
  $('cmpThA').textContent = `التصميم ${ia + 1}`; $('cmpThB').textContent = `التصميم ${ib + 1}`; $('cmpPick').textContent = `اعرض التصميم ${ib + 1}`;
  $('cmpSim').textContent = `يتشابهان بنسبة ${c.sim}٪ في مواضع الفراغات. المظلل: ما تغيّر موضعه بين التصميمين.`;
  $('cmpHead').replaceChildren(...c.headlines.map(t => el('li', {}, t)));
  $('cmpRows').replaceChildren(...c.rows.map(r => el('tr', {}, el('td', {}, r.label), el('td', { class: 'num' }, cmpCell(r.a, r.unit)), el('td', { class: 'num' }, cmpCell(r.b, r.unit)),
    el('td', { class: 'num ' + (r.diff > 0 ? 'up' : r.diff < 0 ? 'down' : '') }, r.diff === null || r.diff === 0 ? '—' : `${r.diff > 0 ? '+' : ''}${fmt(r.diff)}`))));
  requestAnimationFrame(() => { drawMini($('cmpCanA'), A, new Set(c.moved.a)); drawMini($('cmpCanB'), B, new Set(c.moved.b)); });
  $('cmpPick').onclick = () => { $('compare').hidden = true; show(ib); scrollTo({ top: 0, behavior: 'smooth' }); };
}
for (const id of ['cmpA', 'cmpB', 'cmpLevel']) $(id).addEventListener('change', renderCompare);
$('cmpClose').addEventListener('click', () => { $('compare').hidden = true; });
addEventListener('resize', () => { if (!$('compare').hidden) renderCompare(); });

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
/** «ورّني وين نفّذت طلبي»: يضيء فراغات البند في المسقط ويخفت البقية، وينتقل إلى دورها. */
function ledgerAttrs(x, cls) {
  const has = (x.where || []).length;
  return { class: cls + (has ? ' locatable' : ''), 'data-rule': x.id, tabindex: has ? '0' : null, role: has ? 'button' : null, title: has ? 'اضغط لترى موضعه في المسقط' : null,
    onclick: has ? () => setFocus(x) : null, onkeydown: has ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocus(x); } } : null };
}
function setFocus(x) {
  document.querySelectorAll('#ledger li.on').forEach(li => li.classList.remove('on'));
  if (!x || (focus && focus.id === x.id)) { focus = null; $('focusBar').hidden = true; paint(); return; }
  const names = new Set(x.where.map(w => w.name)), lv = x.where.find(w => w.level === levelId)?.level || x.where[0].level;
  focus = { id: x.id, names };
  document.querySelector(`#ledger li[data-rule="${CSS.escape(x.id)}"]`)?.classList.add('on');
  if (lv && lv !== levelId) { levelId = lv; view = null; goal = null; inertia = null; document.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('on', b.dataset.level === levelId)); }
  const other = x.where.filter(w => w.level !== levelId).length;
  $('focusText').textContent = `«${x.text}»: ${[...new Set(x.where.filter(w => w.level === levelId).map(w => w.name))].join('، ')}${other ? ` (وفي الدور الآخر ${other})` : ''}`;
  $('focusBar').hidden = false; paint();
  if (matchMedia('(max-width: 900px)').matches) $('planWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    roomFill: focus ? rm => (focus.names.has(rm.label?.name) ? '#e2b27e' : '#f3efe8') : zonesOn ? rm => ZONES[zoneOf(rm.label)].color : null,
  });
}

// ------------------------------------------------------------------------------------------ الأفعال
function storeForStudio() { try { localStorage.setItem(STUDIO_KEY, serialize(doc)); } catch { /* التخزين غير متاح */ } }
// طراز العميل («مودرن»، «نجدي»...) يصل إلى اختيار الواجهة في العرض ثلاثي الأبعاد؛ بلا طراز يُمسح الاختيار السابق حتى لا يرث تصميمًا آخر
function storeFacadeWish() { try { const w = session.input.requirements?.prefs?.styleWish; if (w) localStorage.setItem('mizan.facade.wish', w); else localStorage.removeItem('mizan.facade.wish'); } catch { /* التخزين غير متاح: يبقى اقتراح الميزان */ } }
// مرحلة «الشكل الخارجي»: بعد اعتماد المخطط تحاور شرعاء العميل بأسئلة موجّهة (كل سؤال يتبع ما سبقه)، ثم تولّد الواجهة وتعرضها ثلاثية الأبعاد.
// الجواب يُحفظ في الجلسة (prefs.exterior) وتقرؤه صفحة العرض فتفتح على واجهة هذا المخطط وهذا الذوق. الرابط المباشر: design.html#exterior
function onApprove() { session = approve(session); saveSession(localStorage, session); storeForStudio(); openExterior(); }
let extAns = {}, extDone = new Set(), extLog = [], extPushed = false;
const extPending = () => exteriorQuestions(extAns).filter(q => !extDone.has(q.id));
function openExterior() {
  extAns = {}; extDone = new Set(); extLog = [];
  // عودة إلى هذه المرحلة: أجوبتك السابقة باقية (لا يبدأ الحوار من الصفر)؛ تولّد بها مباشرة أو تعيد الأسئلة
  const saved = readExterior(session);
  const known = { salmani: 'S', modern: 'modern', hijazi: 'H', najdi: 'N', classic: 'C' }[session.input.requirements?.prefs?.style];
  if (saved) { extAns = { ...saved }; for (const q of exteriorQuestions(extAns)) extDone.add(q.id); extLog.push({ q: { text: 'هذه أجوبتك السابقة عن الشكل الخارجي، وهي محفوظة. ولّد بها مباشرة، أو اكتب ما تريد تغييره، أو اضغط «أعد الأسئلة من البداية».', reason: '' } }); }
  else if (known) { extAns.style = known; extDone.add('style'); extLog.push({ q: { text: 'ذكرتَ لي من قبل أنك تحب الطراز ال' + answerLabel('style', known) + '؛ سأبني عليه (تستطيع تغييره بالكتابة).', reason: '' } }); }
  $('extShara').hidden = false; if (location.hash !== '#exterior') { history.pushState(null, '', '#exterior'); extPushed = true; } extPaint();
}
function extPaint() {
  const pend = extPending(), q = pend[0], total = exteriorQuestions(extAns).length;
  const bubbles = [el('div', { class: 'q' }, 'اعتمدتَ المخطط. قبل أن أريك بيتك ثلاثي الأبعاد أسألك بضعة أسئلة عن شكله من الخارج، وأبني الواجهة على أجوبتك.')];
  for (const x of extLog) { if (x.q) bubbles.push(el('div', { class: 'q' }, x.q.text)); if (x.a) bubbles.push(el('div', { class: 'a' }, x.a)); }
  if (q) bubbles.push(el('div', { class: 'q', id: 'extQ' }, q.text, el('small', {}, q.reason)));
  else { const d = describeExterior(extAns); bubbles.push(el('div', { class: 'q', id: 'extQ' }, d.length ? 'فهمتُ ما تحب: ' + d.join('، ') + '. أولّد لك الآن واجهة تخص مخططك وهذا الذوق، وتستطيع تغيير أي شيء بعدها.' : 'تركتَ الاختيار لي: سأقترح الطراز والقالب الأنسب لمخططك، وتستطيع تغيير أي شيء بعدها.')); }
  $('extThread').replaceChildren(...bubbles); $('extThread').scrollTop = $('extThread').scrollHeight;
  $('extStep').textContent = q ? `السؤال ${total - pend.length + 1} من ${total}` : 'اكتملت الأسئلة';
  $('extOpts').replaceChildren(...(q ? q.options.map(o => el('button', { type: 'button', class: 'chip' + (o.suggested ? ' sug' : ''), 'data-id': o.id, title: o.hint || null, onclick: () => extAnswer(q, o.id) }, o.label)) : []));
  $('extOpts').dataset.q = q ? q.id : '';
  $('extGo').hidden = !!q; $('extAll').hidden = !q; $('extBack').hidden = !extLog.some(x => x.id); $('extRestart').hidden = !!q || extLog.some(x => x.id) || !readExterior(session); $('extFree').hidden = false; $('extStatus').textContent = '';
  $('extText').placeholder = q ? 'أو اكتب بكلماتك، مثل: أحب الهيبة، نجدي بحجر فاتح ومدخل غائر' : 'تريد تغيير شيء قبل التوليد؟ اكتبه هنا';
}
function extAnswer(q, id) { extAns[q.id] = id; extDone.add(q.id); extLog.push({ id: q.id, q, a: answerLabel(q.id, id) }); extPaint(); }
function extSay() {
  const text = $('extText').value.trim(); if (!text) return; const r = parseExteriorText(text);
  if (!r.understood.length) { $('extStatus').textContent = 'لم أفهم من كلامك ما يخص الشكل الخارجي. اختر من الخيارات، أو اذكر ما يستهويك أو الطراز أو المواد أو الفتحات أو المدخل.'; return; }
  Object.assign(extAns, r.found); for (const f of Object.keys(r.found)) extDone.add(f);
  extAns.notes = [extAns.notes, text].filter(Boolean).join(' · ');
  extLog.push({ id: Object.keys(r.found)[0], multi: Object.keys(r.found), a: text });
  extLog.push({ q: { text: 'فهمت: ' + r.understood.join('، ') + '.' } }); $('extText').value = ''; extPaint();
}
function extBack() { // يعيد آخر جواب (خيارًا أو كتابة) ويسأل من جديد
  let i = extLog.length - 1; while (i >= 0 && !extLog[i].id) i--; if (i < 0) return;
  for (const f of extLog[i].multi || [extLog[i].id]) { delete extAns[f]; extDone.delete(f); }
  extLog.length = i; extPaint();
}
function extGenerate() {
  const ext = normalizeExterior(extAns);
  session = setExterior(session, ext); saveSession(localStorage, session); storeExterior(localStorage, ext); storeFacadeWish();
  $('extStatus').textContent = 'أولّد الشكل الخارجي…'; location.href = './view3d.html';
}
// الحوار يغطي الصفحة؛ الترويسة وشريط الخطوات يبقيان فوقه قابلين للضغط (الرجوع إلى أي مرحلة من داخل الحوار)
new MutationObserver(() => document.body.classList.toggle('ext-open', !$('extShara').hidden)).observe($('extShara'), { attributes: true, attributeFilter: ['hidden'] });
$('extSend').addEventListener('click', extSay);
$('extText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); extSay(); } });
$('extBack').addEventListener('click', extBack);
$('extAll').addEventListener('click', () => { for (const q of extPending()) extDone.add(q.id); extPaint(); });
$('extGo').addEventListener('click', extGenerate);
$('extRestart').addEventListener('click', () => { extAns = {}; extDone = new Set(); extLog = []; extPaint(); });
// «رجوع للمخطط»: إن فُتح الحوار من هذه الصفحة فالرجوع خطوة في سجل المتصفح (فيبقى «تقدم» يعيد فتحه)، وإلا يُزال ‎#exterior‎ من الرابط
$('extClose').addEventListener('click', () => { if (extPushed) { extPushed = false; history.back(); return; } $('extShara').hidden = true; history.replaceState(null, '', location.pathname + location.search); });
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
  if (pending()) { $('fbStatus').textContent = 'ما زلت أنفّذ طلبك السابق؛ انتظر حتى ينتهي.'; return; }
  let done = busy(true, $('fbStatus'), 'أطبّق ملاحظاتك… أبحث عن توزيع يحققها.'); $('fbGo').textContent = 'جارٍ التصميم…';
  const end = () => { done(); $('fbGo').textContent = 'صمّم لي بديلًا'; };
  try {
    // رمز الدخول (إن أُدخل في المحادثة): Claude يفهم الملاحظة أيضًا، ويُدمج فهمه مع الفهم المحلي
    let ai = null, code = ''; try { code = sessionStorage.getItem('mizan.ai.code') || ''; } catch { /* لا تخزين */ }
    if (code && text.length >= 8) {
      // الذكاء المتصل بمهلة 30 ثانية؛ إن تأخر أو فشل تُفهم الملاحظة محليًا ويُكمَل التصميم (ويُقال ذلك)
      done(); done = busy(true, $('fbStatus'), 'أفهم ملاحظتك عبر الذكاء المتصل… (إن تأخر أكملتُ بالفهم المحلي)');
      let aiNote = '';
      try { const { plot } = normalizeLand(session.input.land); ai = (await requestBrief({ prompt: text, plot, previous: { summary: 'ملاحظة تعديل على تصميم معروض؛ استخرج ما تطلبه الملاحظة فقط.', rooms: [] } }, { accessCode: code, signal: AbortSignal.timeout?.(30000) })).brief.requirements || null; }
      catch { ai = null; aiNote = 'تعذّر الذكاء المتصل أو تأخر؛ فهمتُ ملاحظتك محليًا.'; }
      done(); done = busy(true, $('fbStatus'), (aiNote ? aiNote + ' ' : '') + 'أطبّق ملاحظاتك…');
    }
    const out = await redesignInWorker(session, { picks, text, ai }); end();
    session = out.session; saveSession(localStorage, session);
    $('shara').hidden = true; show(session.current); toast(out.reply?.failed?.length ? `نفّذت ${out.reply.done.length} ولم أستطع ${out.reply.failed.length} — التفاصيل أعلى الصفحة` : 'تم — التفاصيل أعلى الصفحة');
    scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { end(); $('fbStatus').textContent = err.message || 'تعذّر تصميم بديل.'; $('fbGo').disabled = false; }
});

// نافذة شرعاء الجانبية عدّلت الجلسة (طلب نُفّذ): تُعرض النتيجة هنا فورًا
globalThis.addEventListener?.('mizan:session', e => { const s2 = e.detail?.session; if (!s2) return; session = s2; try { show(session.current); } catch { /* تبقى الصفحة كما هي */ } });
// وحدات المولّد تُحمَّل في العامل والمتصفح خامل، فلا ينتظرها أول «تصميم آخر» أو «نفّذ»
(globalThis.requestIdleCallback || (f => setTimeout(f, 600)))(() => {
  if (!session) return; warmGenerator();
  // الصفحة التالية (العرض ثلاثي الأبعاد) ثقيلة التحميل: مكتبتها ووحداتها تُجلب مسبقًا والعميل يتأمل مخططه
  for (const href of ['./vendor/three.module.js', './view3d.mjs', './draw/viewer-draw.mjs', './three-runtime.mjs']) { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = href; document.head.append(l); }
});
try { init(); } catch (e) { $('main').replaceChildren(el('div', { class: 'empty card' }, el('h2', {}, 'تعذّر عرض التصميم'), el('p', {}, e.message), el('a', { class: 'btn', href: './home.html' }, 'العودة'))); }
globalThis.__mizanDesign = { get session() { return session; }, get doc() { return doc; }, get view() { return view; } }; // للاختبارات الحية
