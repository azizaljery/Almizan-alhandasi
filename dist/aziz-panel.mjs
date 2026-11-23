// لوحة «قرار المراجعة — محرك عزيز»: بيان صريح للعميل بما فعله عزيز وبما فعله مدقق الميزان وبما قرّره المولّد، بلا صمت.
// وحدة نقية: azizPanelModel(session, doc, opts) تحسب النموذج من الجلسة والمستند وتقرير المراجعة (إن وُجد)، وazizPanelCard(model, el) ترسمه.
// أمانة النسبة: ما صدر عن عزيز نفسه (evaluateHardConstraints لكل دور) يُنسب إليه وحده؛ المقاسات والعدد والطلب يفحصها مدقق الميزان (reviewDesign)،
// وعدد المرشحين وأسباب رفضهم يصدر عن مولّد الميزان. إن تعذّر عزيز يظهر «عزيز: غير متاح» دون ادعاء أي شيء.
import { fitStatement, programNeed, SHRINK_MIN } from './fit-ladder.mjs';
import { docRooms, ROOM_OF } from './rules.mjs';

export const AZIZ_PANEL_VERSION = 'aziz-panel/1';
export const PANEL_TITLE = 'قرار المراجعة — محرك عزيز';
export const PANEL_DISCLAIMER = 'مراجعة آلية أولية؛ الاعتماد التنفيذي يحتاج المهندس المختص';
export const WHO_AZIZ = Object.freeze([
  'عزيز محرك فحص محلي في الميزان؛ يتحقق لكل دور من القيود الهندسية الصلبة: سلامة مضلعات الغرف، وعدم تراكب غرفتين، وبقاء كل غرفة داخل حدود المبنى.',
  'فحصه أولي وآلي؛ أما مطابقة طلبك وأعداد الغرف ومقاساتها فيفحصها مدقق الميزان، ويبيّنها الجدول أدناه، ولا تُنسب إلى عزيز.',
]);
const ROUTE = { first: 'التوليد الأول', alternative: 'بديل', merge: 'دمج', manual: 'تعديل يدوي', chat: 'تعديل بالمحادثة' };
const MODE_AR = { court: 'نمط U حول حوش داخلي', L: 'نمط L', center: 'صالة مركزية بين جناحين', tee: 'نمط T', side: 'صالة جانبية وأجنحة متتالية', ref: 'نمط مرجعي' };
const int = v => (Number.isInteger(v) && v > 0 ? v : 0);
const r1 = v => Math.round(v * 10) / 10;
const modeName = m => MODE_AR[m] || (m ? 'نمط «' + m + '»' : 'غير محدد');
const short = t => { const x = String(t || '').trim(); const i = x.search(/[؛:]/); const y = i > 20 ? x.slice(0, i) : x; return y.length > 110 ? y.slice(0, 107) + '…' : y; };

/** جدول «طلبك ↔ ما تحقق»: كل بند: { key, what, asked, got, unit, status: 'ok'|'cut'|'shrunk', statusAr, reason }. مقيس من المستند وطلب العميل. */
function requestTable(doc, req, st, fit) {
  const rooms = docRooms(doc).rooms, sel = id => rooms.filter(r => ROOM_OF[id]?.(r)), c = req.counts || {}, ex = req.extras || {};
  const rows = [], byKey = new Map(st.items.map(i => [i.key, i]));
  const facts = st.facts, avail = facts ? `المتاح للبناء ${facts.W} × ${facts.D} م (${facts.area} م² للدور)` : '';
  const need = st.need ? `والبرنامج المطلوب يحتاج نحو ${st.need} م²` : '';
  const shrinkTried = (fit?.trace || []).some(t => t.kind === 'shrink');
  const lead = shrinkTried ? 'جرّبتُ تصغير المقاسات أولًا إلى حدودها الدنيا المعلنة فلم يتسع ' : '';
  const push = (key, what, asked, got, unit, itemKey = key) => {
    const it = byKey.get(itemKey);
    if (!asked) return;
    if (got >= asked && !it) rows.push({ key, what, asked, got, unit, status: 'ok', statusAr: 'تحقق', reason: 'موجود في التصميم كما طلبت.' });
    else rows.push({ key, what, asked, got, unit, status: 'cut', statusAr: 'قُلّص', reason: [lead && it?.byLadder ? lead + 'البرنامج كاملًا.' : '', avail && need ? `${avail}، ${need}.` : '', it?.why && !/^لم أجد توزيعًا سليمًا يضمّه/.test(it.why) ? it.why : '', it?.byLadder && it?.asked === false ? 'لم تطلبه صراحة فكان أول ما خُفّف.' : ''].filter(Boolean).join(' ') || 'لم يجد المولّد له موضعًا سليمًا.' });
  };
  push('bedrooms', 'غرف النوم', int(c.bedrooms), sel('bedrooms').length, 'غرفة');
  push('baths', 'دورات المياه', int(c.baths), rooms.filter(r => r.type === 'bath').length, 'دورة');
  push('majlis', 'المجالس', int(c.majlis), sel('majlis').length + sel('majlis_w').length, 'مجلس', byKey.has('majlis') ? 'majlis' : 'majlis_w');
  if (ex.maid) push('maid', 'غرفة الخادمة', 1, sel('maid').length, 'غرفة');
  // مقاسات صافية: ما حدّده العميل، ثم ما صُغّر من المعتاد
  const seen = new Set();
  for (const it of st.items.filter(i => i.kind === 'shrink')) {
    seen.add(it.key);
    rows.push({ key: it.key, what: it.what, asked: it.from, got: it.to, unit: 'م²', status: 'shrunk', statusAr: 'صُغّرت المساحة', reason: it.basis === 'net' ? `طلبت ${it.from} م² صافية وبقيت ${it.to} م²؛ ${it.why || ''}`.trim() : `المقاس المعتاد ${it.from} م² بين المحاور، وصار صافي الغرفة ${it.to} م²؛ ${it.why || ''}`.trim() });
  }
  for (const [k, a] of Object.entries(req.areas || {})) if (a > 0 && !seen.has('size:' + k)) {
    const sid = { master: 'master', majlis: 'majlis', hall: 'hall', dining: 'dining', kitchen: 'kitchen', bedroom: 'kids' }[k]; if (!sid) continue;
    const r = sel(sid).sort((p, q) => p.area - q.area)[0]; if (!r) continue;
    rows.push({ key: 'size:' + k, what: r.name, asked: a, got: r1(r.area), unit: 'م²', status: 'ok', statusAr: 'تحقق', reason: 'المساحة الصافية بتسامح سجل التنفيذ (لا تقل عن 85٪ مما طلبت).' });
  }
  for (const it of st.items) if (!rows.some(r => r.key === it.key) && !(it.key === 'majlis_w' && rows.some(r => r.key === 'majlis')) && it.kind !== 'shrink' && it.kind !== 'floors') rows.push({ key: it.key, what: it.what, asked: it.from, got: it.to, unit: it.unit || '', status: 'cut', statusAr: it.kind === 'merge' ? 'قُلّص (دُمج)' : 'قُلّص', reason: it.why || '' });
  const fl = st.items.find(i => i.kind === 'floors'); if (fl) rows.push({ key: 'floors', what: fl.what, asked: fl.from, got: fl.to, unit: 'دور', status: 'cut', statusAr: 'تغيّر', reason: fl.why || '' });
  return rows;
}

/** سجل المرشحين: ما بحث عنه المولّد وما رُفض وسببه، ومقارنة المختار بأقرب مرفوض. عدد غير معروف يُكتب «غير متاح» لا رقمًا مخترعًا. */
function candidatesBlock(search, fit) {
  const trace = fit?.trace || [];
  const attempts = { total: trace.filter(t => t.kind !== 'restore').length, rejected: trace.filter(t => !t.ok).map(t => ({ n: t.n, steps: t.steps.filter((x, i, a) => a.indexOf(x) === i), last: t.steps[t.steps.length - 1] || null, floors: t.floors, reason: short(t.reason) || 'لم يُنتج المولّد تصميمًا سليمًا لهذا البرنامج.' })) };
  const s = search || null;
  const out = { engineSource: 'مولّد الميزان (ليس عزيزًا)', available: !!s, attempts,
    built: s ? s.built : null, skippedSimilar: s?.skippedSimilar ?? null, hardFailed: s ? s.hardFailed : null, rejected: (s?.rejected || []).map((d, i) => ({ n: i + 1, mode: modeName(d.mode), fails: d.fails, soft: d.softFails, why: d.why?.length ? d.why : [d.fails ? 'خالف بندًا إلزاميًا في سجل التنفيذ.' : 'لم يُختر لأن غيره أقل كلفة أو أكثر تنوعًا عمّا عُرض.'] })), chosen: s?.chosen ? { mode: modeName(s.chosen.mode), fails: s.chosen.fails, soft: s.chosen.softFails, quality: s.chosen.quality } : null, compare: [] };
  const near = s?.rejected?.[0], ch = s?.chosen;
  if (ch && near) {
    out.compare.push(`المختار (${modeName(ch.mode)}) بلا مخالفات إلزامية ${ch.fails ? 'عدا ' + ch.fails : '(0)'} مقابل ${near.fails} في أقرب مرفوض (${modeName(near.mode)}).`);
    if (typeof ch.quality === 'number' && typeof near.quality === 'number') out.compare.push(`كلفة الجودة ${ch.quality} للمختار مقابل ${near.quality} للمرفوض (الأقل أفضل).`);
    if ((ch.softFails || 0) !== (near.softFails || 0)) out.compare.push(`المخالفات غير الإلزامية: ${ch.softFails || 0} للمختار مقابل ${near.softFails || 0}.`);
  }
  return out;
}

export function azizPanelModel(session, doc, { report = null, currentPv = null } = {}) {
  const d = session?.designs?.[session.current] || {}, req = session?.input?.requirements || {}, land = session?.input?.land || null, fit = d.fit || null;
  let st; try { st = fitStatement(doc, req, { land, fit }); } catch { st = { facts: null, need: null, items: [], decisions: [] }; }
  if (st.need == null) { try { st.need = programNeed(req); } catch { /* يبقى غير معروف */ } }
  const stamp = d.review || null, stale = !!(stamp?.planVersion && currentPv && stamp.planVersion !== currentPv);
  // عزيز: ما أعاده التقرير فقط
  const az = report?.aziz || null;
  let aziz;
  if (!report) aziz = { status: 'pending', line: 'عزيز: لم يكتمل الفحص بعد.' };
  else if (!az || az.status === 'unavailable') aziz = { status: 'unavailable', line: 'عزيز: غير متاح', reason: az?.reason || '' };
  else {
    const f = (report.findings || []).filter(x => x.source === 'aziz'), bad = f.filter(x => x.state === 'violated');
    aziz = { status: 'ran', line: bad.length ? `عزيز فحص ${report.levels?.length || 0} دور/أدوار ووجد ${bad.length} مخالفة هندسية.` : `عزيز فحص ${report.levels?.length || 0} دور/أدوار ولم يجد مخالفة في القيود الصلبة.`, violations: bad.map(x => x.title) };
  }
  const checker = report ? { status: 'ran', line: `مدقق الميزان: ${report.summary.verdictAr}.` } : { status: 'pending', line: 'مدقق الميزان: لم يكتمل الفحص بعد.' };
  const unverified = report ? (report.findings || []).filter(x => x.state === 'unverified').sort((a, b) => (a.severity === 'mandatory' ? 0 : 1) - (b.severity === 'mandatory' ? 0 : 1)).map(x => ({ id: x.id, severity: x.severity, title: x.title })) : null;
  const rows = requestTable(doc, req, st, fit);
  const changed = rows.filter(r => r.status !== 'ok');
  const cand = candidatesBlock(d.search || null, fit);
  const routeAr = ROUTE[stamp?.route] || null;
  const headline = changed.length ? `صمّمت لك أفضل ما يلائم طلبك على أرضك، وقلّصت ${changed.length} ${changed.length === 1 ? 'بندًا' : 'بنود'} مما طلبت، والتفصيل في الجدول.` : 'التصميم يحقق كل ما طلبت من أعداد ومقاسات، ولم أقلّص شيئًا.';
  return { version: AZIZ_PANEL_VERSION, title: PANEL_TITLE, planVersion: stamp?.planVersion || null, currentPv, stale, route: stamp?.route || null, routeAr,
    staleNote: stale ? `تغيّر المخطط بعد قرار المراجعة${routeAr ? ' (' + routeAr + ')' : ''}؛ قسم المرشحين أدناه عن النسخة السابقة، أما الجدول فمقيس من المخطط الحالي.` : null,
    sources: [{ id: 'aziz', ...aziz }, { id: 'checker', ...checker }, { id: 'generator', line: cand.available ? `مولّد الميزان: ${cand.built} مرشحًا بُني لهذا الطلب.` : 'مولّد الميزان: عدد المرشحين غير متاح لهذا المحرك.', status: cand.available ? 'ran' : 'na' }],
    who: WHO_AZIZ, headline, changed: changed.length, rows, candidates: cand, unverified, fit: { floors: fit?.floors || null, facts: st.facts, need: st.need }, disclaimer: PANEL_DISCLAIMER };
}

/** رسم اللوحة (el: مساعد إنشاء العناصر في الصفحة). */
export function azizPanelCard(m, el, { wide = (typeof matchMedia === 'function' ? matchMedia('(min-width:1101px)').matches : true) } = {}) {
  const det = (id, summary, ...kids) => el('details', { class: 'az-sec', id, ...(wide ? { open: '' } : {}) }, el('summary', {}, summary), ...kids);
  const li = (t, c) => el('li', c ? { class: c } : {}, t);
  const c = m.candidates, srcLine = s => el('li', { class: 'az-src az-' + s.id + (s.status === 'unavailable' ? ' off' : '') }, s.line);
  const rowCard = r => el('li', { class: 'az-row az-' + r.status, 'data-az-row': r.key },
    el('div', { class: 'az-rh' }, el('b', {}, r.what), el('span', { class: 'az-st' }, r.statusAr)),
    el('div', { class: 'az-nums' }, el('span', {}, `طلبك: ${r.asked}${r.unit ? ' ' + r.unit : ''}`), el('span', {}, `في التصميم: ${r.got}${r.unit ? ' ' + r.unit : ''}`)),
    r.reason ? el('p', { class: 'az-why' }, r.reason) : null);
  return el('aside', { class: 'card mz-aziz', id: 'azizPanel', 'aria-label': m.title, 'data-stale': m.stale ? '1' : '0' },
    el('h2', {}, m.title),
    m.staleNote ? el('p', { class: 'az-stale', role: 'status' }, m.staleNote) : null,
    el('ul', { class: 'az-sources' }, m.sources.map(srcLine)),
    el('p', { class: 'az-headline' }, m.headline),
    det('azWho', 'من هو عزيز؟', ...m.who.map(t => el('p', {}, t))),
    det('azTable', `طلبك ↔ ما تحقق (${m.changed ? m.changed + ' بنود تغيّرت' : 'كل البنود تحققت'})`, m.rows.length ? el('ul', { class: 'az-rows' }, m.rows.map(rowCard)) : el('p', { class: 'sub' }, 'لا بنود أعداد أو مقاسات محددة في طلبك للمقارنة.')),
    det('azCand', 'ما الذي فُحص ورُفض ولماذا',
      el('p', { class: 'sub' }, `المصدر: ${c.engineSource}.`),
      c.available ? el('p', {}, `بُني ${c.built} مرشحًا${c.skippedSimilar != null ? `، واستُبعد ${c.skippedSimilar} لتشابهه مع ما عُرض` : ''}؛ ${c.hardFailed} منها خالف بندًا إلزاميًا في سجل التنفيذ.`) : el('p', {}, 'عدد المرشحين المبنية والمرفوضة: غير متاح لهذا المحرك.'),
      c.attempts.total ? el('p', {}, `جرّبتُ ${c.attempts.total} صيغة لبرنامجك على هذه الأرض؛ ${c.attempts.rejected.length} منها لم تنتج تصميمًا سليمًا:`) : null,
      c.attempts.rejected.length ? el('ol', { class: 'az-rej' }, c.attempts.rejected.slice(0, 6).map(a => li(`${a.last ? 'بإضافة «' + a.last + '» إلى ما سبق' : 'الطلب كاملًا'}${a.floors ? ` (${a.floors === 2 ? 'دوران' : 'دور واحد'})` : ''} — ${a.reason}`))) : null,
      c.attempts.rejected.length > 6 ? el('p', { class: 'sub' }, `وبقية الصيغ المرفوضة (${c.attempts.rejected.length - 6}) من النوع نفسه.`) : null,
      c.rejected.length ? el('div', {}, el('h4', {}, 'أقرب المرشحين غير المختارة'), el('ol', { class: 'az-rej' }, c.rejected.map(r => li(`${r.mode}: ${r.why.join('؛ ')}`)))) : null,
      c.chosen ? el('div', { class: 'az-chosen' }, el('h4', {}, `المختار: ${c.chosen.mode}`), c.compare.length ? el('ul', {}, c.compare.map(t => li(t))) : null) : null),
    det('azUnver', 'غير متحقق منه',
      m.unverified === null ? el('p', {}, 'لم يكتمل فحص المدقق بعد.') : el('ul', {}, [...m.unverified.slice(0, 6).map(u => li(u.title)), li('الأحمال والأساسات والتسليح: غير متحقق (خارج نطاق هذه المراجعة).')]),
      m.unverified && m.unverified.length > 6 ? el('p', { class: 'sub' }, `و${m.unverified.length - 6} بنود أخرى في تقرير المراجعة.`) : null),
    el('p', { class: 'az-disc', id: 'azDisc' }, m.disclaimer));
}

export default { azizPanelModel, azizPanelCard, WHO_AZIZ, PANEL_TITLE, PANEL_DISCLAIMER, AZIZ_PANEL_VERSION };
