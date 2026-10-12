// Client journey V2. Reuses the existing AI Worker, room program, Claude/Gemini/AZIZ
// generation, plan viewer and 3D scene. Never simulates a successful revision.
import { diffRoomPrograms, geometryFingerprint, composeDesignConversation } from './design-dialog.mjs';
import { verifyProposedProgram, extractPlotDimensions } from './brief-contract.mjs';

const $ = id => document.getElementById(id);
const POSITION_AR = { front: 'أمامي', middle: 'وسط', back: 'خلفي' }, SIDE_AR = { any: 'غير محدد', left: 'يسار', right: 'يمين' };
const create = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const trim = value => String(value ?? '').trim();
const fmt = n => Number(n).toLocaleString('ar-SA', { maximumFractionDigits: 1 });

export function proposalInputsMatch(brief, plot, expected) {
  if (!expected || trim(brief) !== expected.brief) return false;
  return Number(plot.width) === Number(expected.plot.width) &&
    Number(plot.length) === Number(expected.plot.length) &&
    String(plot.entry) === String(expected.plot.entry) &&
    trim(plot.maxBuiltArea) === trim(expected.plot.maxBuiltArea) &&
    ['n', 's', 'e', 'w'].every(side => !!plot.streets?.[side] === !!expected.plot.streets?.[side]);
}

export function returnToConversation(doc) {
  const designTab = doc?.querySelector?.('[data-tab="design"]');
  if (!designTab) return false;
  designTab.click();
  doc.getElementById('studioSimple')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  doc.getElementById('studioBrief')?.focus?.({ preventScroll: true });
  return true;
}

// Keep the existing plan/3D nodes and their listeners; never create a second viewer.
export function createPlanSurfaceMount(doc) {
  const out = doc.getElementById('out'), slot = doc.getElementById('studioPlanSlot');
  if (!out || !slot) throw Error('تعذر العثور على سطح المخطط الأصلي.');
  const anchor = doc.createComment('original-plan-surface');
  out.parentNode.insertBefore(anchor, out);
  return {
    showConversation() { if (out.parentNode !== slot) slot.append(out); },
    showAdvanced() { if (out.parentNode !== anchor.parentNode) anchor.parentNode.insertBefore(out, anchor.nextSibling); },
  };
}
// Secondary tools retain their live nodes and delegated listeners.
export function initCompactStudio(doc) {
  // Keep project actions available in one compact native menu; move, never clone.
  const actions = doc.querySelector('.workspace-actions');
  const projectMenu = doc.createElement('details'); projectMenu.id = 'studioProjectMenu';
  const projectSummary = doc.createElement('summary'); projectSummary.textContent = 'المشروع';
  const projectActions = doc.createElement('div'); projectActions.className = 'studio-project-menu-actions';
  projectMenu.append(projectSummary, projectActions); actions.append(projectMenu);
  for (const id of ['loadProject','saveProject','archivePanel']) projectActions.append(doc.getElementById(id));
  for (const id of ['loadProject','saveProject']) doc.getElementById(id).addEventListener('click', () => { projectMenu.open = false; });
  const archive = doc.getElementById('archivePanel'), archiveClose = doc.createElement('button');
  archiveClose.id = 'studioArchiveClose'; archiveClose.type = 'button'; archiveClose.className = 'small-button'; archiveClose.textContent = 'إغلاق الأرشيف';
  archive.querySelector('.archive-panel-body').prepend(archiveClose);
  archiveClose.addEventListener('click', () => { archive.open = false; archive.querySelector('summary').focus(); });
  projectMenu.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation();
    if (archive.open) { archive.open = false; archive.querySelector('summary').focus(); }
    else { projectMenu.open = false; projectSummary.focus(); }
  });
  const status = doc.getElementById('projectStatus'), notice = doc.createElement('details'), noticeSummary = doc.createElement('summary');
  notice.id = 'studioProjectNotice'; noticeSummary.textContent = 'حالة المشروع';
  status.parentNode.insertBefore(notice, status); notice.append(noticeSummary, status);
  let previousStatus = '';
  const updateNotice = () => {
    notice.hidden = status.hidden || !status.textContent;
    if (status.textContent !== previousStatus) {
      previousStatus = status.textContent;
      const success = /^تم (?:استيراد|تحميل|فتح|تجهيز)/.test(previousStatus);
      notice.open = !success; noticeSummary.textContent = success ? 'تم فتح أو تجهيز المشروع — التفاصيل' : 'حالة المشروع';
    }
  };
  new MutationObserver(updateNotice).observe(status, {childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden']}); updateNotice();
  const dialog = doc.getElementById('studioCompareDialog'), trigger = doc.getElementById('studioCompareOpen');
  const modeTools = doc.querySelector('#out .studio-view-toggle');
  modeTools.append(trigger, doc.getElementById('studioEditJump'));
  const alternatives = doc.querySelector('.studio-alternatives');
  alternatives?.querySelector('.studio-alternatives-head')?.append(doc.getElementById('freshIdeas'));
  const alternativeAnchor = doc.createComment('original-alternatives');
  if (alternatives) { alternatives.parentNode.insertBefore(alternativeAnchor, alternatives); doc.getElementById('studioCompareContent').append(alternatives); }
  let advanced = false; const aestheticAnchors = new Map();
  trigger.addEventListener('click', () => dialog.showModal());
  doc.getElementById('studioCompareClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => trigger.focus({ preventScroll: true }));
  doc.getElementById('studioCompareContent').addEventListener('click', event => {
    const choice = event.target.closest('[data-alternative]');
    if (choice && !choice.disabled) dialog.close();
  });
  doc.getElementById('studioLandOpen').addEventListener('click', () => {
    const land = doc.getElementById('studioLandDetails'); land.open = !land.open;
    if (land.open) land.querySelector('summary').focus({ preventScroll: true });
  });
  const relocateAestheticTools = () => {
    const target = doc.getElementById('studioAestheticTools');
    for (const card of doc.querySelectorAll('.visualizer-card')) {
      if (!aestheticAnchors.has(card)) { const anchor = doc.createComment('original-aesthetic-tool'); card.parentNode.insertBefore(anchor, card); aestheticAnchors.set(card, anchor); }
      if (!advanced && !target.contains(card)) target.append(card);
    }
  };
  relocateAestheticTools();
  const observer = new MutationObserver(relocateAestheticTools);
  observer.observe(doc.getElementById('app'), { childList: true, subtree: true });
  return {
    showAdvanced() {
      advanced = true; if (dialog.open) dialog.close();
      if (alternatives) alternativeAnchor.parentNode.insertBefore(alternatives, alternativeAnchor.nextSibling);
      for (const [card, anchor] of aestheticAnchors) anchor.parentNode.insertBefore(card, anchor.nextSibling);
    },
    showConversation() {
      advanced = false; if (alternatives) doc.getElementById('studioCompareContent').append(alternatives);
      relocateAestheticTools();
    },
    disconnect() { observer.disconnect(); }
  };
}
export function studioRequirementRows(state) {
  const measured = state.requirementsAudit || state.requirementAudit;
  if (Array.isArray(measured) && measured.length) return measured.map(row => ({
    label: row.label || row.title || 'متطلب', state: row.state || row.status || 'unverified',
    detail: row.detail || row.evidence || '',
  }));
  return (state.studioSession?.understanding?.constraints || []).map(row => ({
    label: row.label || row.text || row.title || 'متطلب', state: row.state || row.status || 'unverified',
    detail: row.detail || row.evidence || 'سُجل الطلب، ولم تثبت مطابقته في هندسة المخطط بعد.',
  }));
}
const requirementLabels = { met: 'متحقق', unmet: 'غير متحقق', estimate: 'تقدير قابل للمراجعة', unsupported: 'غير مدعوم', information: 'معلومة', unverified: 'غير متحقق منه', ENFORCED: 'متحقق', MEASURED: 'مقاس', NOT_MET: 'غير متحقق', UNVERIFIED: 'غير متحقق منه', UNSUPPORTED: 'غير مدعوم' };
function appendMessage(role, message) {
  window.mizanStudioAPI.appendStudioMessage(role, message);
}
function renderSession(state) {
  const session = state.studioSession || {}, root = $('studioTranscript');
  $('app').classList.toggle('studio-has-model', !!state.hasModel);
  root.replaceChildren();
  const messages = session.messages?.length ? session.messages : [{ role: 'assistant', text: 'صف البيت الذي تريده. سأعرض فهمي أولًا، ثم نراجع المخطط ونتابع التعديل هنا.' }];
  for (const message of messages) {
    const bubble = create('div', 'studio-message ' + (message.role === 'user' ? 'user' : 'assistant'));
    bubble.append(create('span', 'studio-speaker', message.role === 'user' ? 'طلبك' : 'الميزان الهندسي'));
    if (message.status === 'rejected') bubble.append(create('strong', 'studio-proposal-rejected', 'اقتراح مرفوض · لم يُعتمد'));
    bubble.append(create('p', '', message.text ?? message.content ?? ''));
    root.append(bubble);
  }
  $('studioAcceptedSummary').textContent = session.understanding?.summary || (state.hasModel ? 'المخطط الحالي — اكتب التعديل الذي تريده أسفله.' : 'صف المنزل الذي تريده، ثم راجع الفهم قبل الرسم.');
  $('studioCompareOpen').hidden = !state.hasModel; $('studioEditJump').hidden = !state.hasModel;
  const requirements = studioRequirementRows(state), rows = $('studioRequirementsRows');
  const mandatory = $('studioMandatoryIssues'); mandatory.replaceChildren();
  const failed = requirements.filter(row => ['unmet', 'NOT_MET'].includes(row.state));
  for (const item of failed) mandatory.append(create('p', 'studio-mandatory-failure', item.label + ': ' + item.detail));
  const uncertain = requirements.filter(row => ['unsupported', 'unverified', 'UNSUPPORTED', 'UNVERIFIED', 'NOT_EVALUATED'].includes(row.state));
  if (uncertain.length) {
    const review = create('button', 'studio-secondary', `${fmt(uncertain.length)} متطلبات أو حدود غير مدعومة أو غير متحقق منها — راجع التفاصيل`); review.type = 'button';
    review.addEventListener('click', () => { $('studioReviewDetails').open = true; $('studioReviewDetails').querySelector('summary').focus(); }); mandatory.append(review);
  }
  mandatory.hidden = !failed.length && !uncertain.length;
  $('studioReviewCount').textContent = requirements.length ? `(${fmt(requirements.length)})` : '';
  rows.replaceChildren(); $('studioRequirementsEmpty').hidden = requirements.length > 0;
  for (const item of requirements) {
    const row = create('article', 'studio-requirement-row'); row.dataset.state = item.state;
    row.append(create('strong', '', item.label), create('span', 'studio-requirement-state', requirementLabels[item.state] || 'غير متحقق منه'), create('p', '', item.detail)); rows.append(row);
  }
  $('studioPlanApproval').hidden = !state.hasModel;
  const approved = !!session.currentApproval;
  $('studioApprovePlan').disabled = !state.hasModel || state.dirty || approved;
  $('studioPlanApprovalStatus').textContent = approved ? 'سُجلت موافقتك على هذا المخطط الأولي. أي تعديل هندسي يحتاج مراجعة وموافقة جديدة.' : 'راجع المخطط قبل تسجيل اختيارك. الموافقة هنا تعني اختيارك للتصميم الأولي؛ ليست اعتمادًا هندسيًا أو نظاميًا.';
  const notice = session.legacyDisclosure || session.restoreNotice || '';
  $('studioRestoreNotice').hidden = !notice; $('studioRestoreNotice').textContent = typeof notice === 'string' ? notice : 'هذا مشروع قديم بلا سجل محادثة سابق؛ لم ننشئ تاريخًا افتراضيًا له.';
}
function status(message, level = '') {
  const node = $('studioStatus');
  node.textContent = message;
  node.className = 'studio-feedback ' + level;
}
function styleOnlyCommand(text) {
  const content = trim(text);
  if (content.length > 115 || /(?:غرف|غرفة|مجلس|مطبخ|مساح|متر|حمام|مدخل|ممر|صالة|حائط|باب)/.test(content)) return null;
  if (/كلاسيك|نيوكلاسيك|classic/i.test(content)) return 'classic';
  if (/مودرن|حديث|modern/i.test(content)) return 'modern';
  if (/حجازي|hijazi/i.test(content)) return 'hijazi';
  if (/منتجع|رمل|resort/i.test(content)) return 'resort';
  return null;
}
function plotValues() {
  return {
    width: Number($('studioWidth').value),
    length: Number($('studioLength').value),
    entry: $('studioEntry').value,
    streets: Object.fromEntries([...document.querySelectorAll('[data-studio-street]')].map(el => [el.dataset.studioStreet, el.checked])),
    maxBuiltArea: $('studioMaxArea').value.trim() || null,
  };
}
const plotInputIds = ['studioWidth', 'studioLength', 'studioEntry', 'studioMaxArea'];
function setInputsLocked(locked) {
  $('studioBrief').readOnly = locked;
  for (const id of plotInputIds) $(id).disabled = locked;
  for (const el of document.querySelectorAll('[data-studio-street]')) el.disabled = locked;
}
function updatePlotHint() {
  const labels = { s: 'جنوب', n: 'شمال', e: 'شرق', w: 'غرب' };
  const values = plotValues();
  $('studioPlotHint').textContent = 'أبعاد الأرض الحالية ' + values.width + ' × ' + values.length +
    ' م · المدخل ' + (labels[values.entry] || 'غير محدد') + '. عدّلها من بطاقة الأرض أدناه إذا لزم.';
}
function showDiff(diff, brief) {
  const root = $('studioProposalDiff');
  root.replaceChildren();
  const add = (text, kind = '') => root.append(create('div', 'studio-diff-row ' + kind, text));
  if (diff.added.length) add('إضافة: ' + diff.added.map(r => r.name).join('، '));
  if (diff.removed.length) add('حذف مقترح: ' + diff.removed.map(r => r.name).join('، '), 'warning');
  for (const row of diff.changed) {
    const fields = row.fields.map(f => f.name === 'area'
      ? 'المساحة ' + fmt(f.from) + ' ← ' + fmt(f.to) + ' م²'
      : f.name === 'position' ? 'الموقع ' + (POSITION_AR[f.from] || f.from) + ' ← ' + (POSITION_AR[f.to] || f.to)
      : f.name === 'side' ? 'الجهة ' + (SIDE_AR[f.from] || f.from) + ' ← ' + (SIDE_AR[f.to] || f.to)
      : f.name + ': ' + JSON.stringify(f.from) + ' ← ' + JSON.stringify(f.to));
    add(row.room + ': ' + fields.join(' · '));
  }
  if (diff.noChange) add('لم يتغير برنامج الغرف في هذا الاقتراح.', 'warning');
  const warnings = $('studioProposalWarnings');
  warnings.replaceChildren();
  for (const message of [
    ...diff.blockers,
    ...(brief.unhandled || []).map(x => 'غير منفذ أو غير محسوم: ' + x),
    ...(brief.questions || []).map(x => 'سؤال قبل الاعتماد: ' + x),
  ]) warnings.append(create('p', '', message));
  $('studioApprove').disabled = diff.blockers.length > 0 || !brief.rooms?.length || !!brief.questions?.length;
}
function setBusy(busy) {
  for (const id of ['studioSubmit', 'studioLocal']) $(id).disabled = busy;
  if (busy) $('studioApprove').disabled = true;
  $('studioRequestForm').setAttribute('aria-busy', String(busy));
  $('studioCancel').hidden = !busy;
}
function markTechnical() {
  for (const id of ['reviewScore', 'insightScore', 'mizanScoreValue', 'engineeringScore']) {
    $(id)?.closest('.card')?.classList.add('studio-technical');
  }
  document.querySelector('#out > details.review-notes')?.classList.add('studio-technical');
  for (const id of ['requirementEvidence', 'studioInspector']) $(id)?.classList.add('studio-technical');
}
export function composeStudioPrompt(session = {}, latest = '') {
  const messages = session?.messages || [];
  const acceptedIds = new Set((session?.understandingHistory || []).flatMap(item => item.sourceMessageIds || []));
  for (const id of session?.understanding?.sourceMessageIds || []) acceptedIds.add(id);
  const accepted = messages.filter(item => item.role === 'user' && acceptedIds.has(item.id)).map(item => item.text);
  return accepted.length ? composeDesignConversation(accepted[0], accepted.slice(1), latest) : latest;
}

export function initSimpleStudio() {
  const api = window.mizanStudioAPI;
  if (!api) throw Error('تعذّر ربط الاستوديو بمحرك الميزان الأصلي.');
  const app = $('app'), surface = createPlanSurfaceMount(document), compact = initCompactStudio(document);
  app.classList.add('studio-simple-mode'); surface.showConversation(); compact.showConversation(); markTechnical();
  // Only the currently executable proposal is ephemeral. Conversation, draft,
  // accepted understanding and customer approval belong to the application session.
  $('studioEditJump').addEventListener('click', () => { api.showConversation(); const target = $('plan').getClientRects().length ? $('plan') : $('view'); target.scrollIntoView({behavior:'smooth',block:'start'}); $('studioBrief').focus({preventScroll:true}); });
  const conversation = { latest: '', diff: null, snapshot: null };
  let requestSerial = 0, busy = false, drawing = false;
  let sessionIdentity = null;
  function syncPlot(plot) {
    $('studioWidth').value = plot.width; $('studioLength').value = plot.length;
    $('studioEntry').value = plot.entry; $('studioMaxArea').value = plot.maxBuiltArea ?? '';
    for (const el of document.querySelectorAll('[data-studio-street]')) el.checked = !!plot.streets[el.dataset.studioStreet];
    updatePlotHint();
  }
  function clearPending() {
    conversation.diff = null; conversation.snapshot = null;
    $('studioProposalPanel').hidden = true; setInputsLocked(false);
  }
  function sync(event) {
    const state = api.getState(), session = state.studioSession || {};
    const identity = session.id || ''; // Operation epochs also advance during our own propose/draw; explicit events invalidate the UI token.
    const reason = event?.detail?.reason;
    if ((sessionIdentity !== null && identity !== sessionIdentity && !['operation-start','operation-failed'].includes(reason) && !(drawing && reason === 'generated')) || ['load','cancel','selection','geometry-edit','replace'].includes(reason)) {
      ++requestSerial; clearPending(); busy = false; drawing = false; setBusy(false);
    }
    sessionIdentity = identity;
    renderSession(state);
    if (!busy && !conversation.diff && document.activeElement !== $('studioBrief')) $('studioBrief').value = session.draftText || '';
    if (!busy && !conversation.diff) syncPlot(state.plot);
    $('studioPhase').textContent = session.currentApproval ? 'اختيارك مسجل · يمكنك متابعة المراجعة' : state.hasModel ? 'راجع المخطط واطلب التعديل هنا' : 'نبدأ بفهم البيت الذي تريده';
    $('studioSubmit').firstChild.textContent = (state.hasModel ? 'راجع طلبي للتعديل' : 'افهم طلبي') + ' ';
    $('studioApprovePlan').disabled ||= busy;
  }
  function persistMessage(role, text) { appendMessage(role, text); renderSession(api.getState()); }
  const request = async local => {
    const latest = trim($('studioBrief').value);
    if (!latest) return status('اكتب وصف المنزل أو التعديل المطلوب أولًا.', 'warning');
    const current = api.getState(), style = current.hasModel && styleOnlyCommand(latest);
    if ((current.studioSession?.messages?.length || 0) > 252) return status('بلغ الحوار حد الرسائل؛ احفظ مشروعك قبل بدء جلسة أخرى. لم يتغير المخطط.', 'warning');
    if (style) {
      const button = document.querySelector('#styles [data-v="' + style + '"]');
      if (button) {
        try { button.click(); persistMessage('user', latest); persistMessage('assistant', 'تغيّر طابع الخامات في العرض الثلاثي فقط. توزيع الغرف والجدران لم يتغير.'); api.setStudioDraft(''); $('studioBrief').value = ''; }
        catch (error) { status(error.message || 'تعذر إكمال طلب الطابع.', 'error'); }
        return;
      }
    }
    if (!local && !trim($('studioAccessCode').value)) {
      for (let section = $('studioAccessCode').closest('details'); section; section = section.parentElement?.closest('details')) section.open = true; $('studioAccessCode').focus();
      return status('أدخل رمز خدمة الذكاء، أو اختر «فهم محلي محدود».', 'warning');
    }
    clearPending();
    try {
      const explicitPlot = extractPlotDimensions(latest);
      if (explicitPlot) { $('studioWidth').value = explicitPlot.width; $('studioLength').value = explicitPlot.length; }
      api.setPlot(plotValues()); updatePlotHint();
    } catch (error) { return status(error.message, 'error'); }
    const serial = ++requestSerial;
    busy = true; setBusy(true); setInputsLocked(true);
    status('جارٍ فهم الطلب ومقارنته ببرنامج الغرف الحالي…');
    try {
      const prompt = composeStudioPrompt(api.getState().studioSession, latest);
      persistMessage('user', latest); api.setStudioDraft(latest);
      const proposal = await api.propose(prompt, { accessCode: $('studioAccessCode').value, local, latest });
      if (serial !== requestSerial) return;
      const diff = diffRoomPrograms(current.program, proposal.brief.rooms, latest, { requireChange: current.hasModel, initial: !current.hasModel });
      diff.blockers.push(...verifyProposedProgram(prompt, proposal.brief.rooms).violations);
      conversation.latest = latest; conversation.diff = diff; conversation.snapshot = { brief: latest, plot: plotValues() };
      $('studioProposalSummary').textContent = proposal.brief.summary; showDiff(diff, proposal.brief); $('studioProposalPanel').hidden = false;
      persistMessage('assistant', 'هذا فهمي لطلبك: ' + proposal.brief.summary + (diff.blockers.length ? ' توجد فروق تحتاج توضيحًا قبل الرسم.' : ' راجع الفرق ثم وافق على الفهم لبدء الرسم.'));
      status(diff.blockers.length ? 'لم يُعتمد هذا الفهم. راجع الفروق والملاحظات كاملة.' : 'الموافقة على الفهم تبدأ الرسم فقط؛ تختار المخطط لاحقًا بعد مراجعته.', diff.blockers.length ? 'warning' : '');
    } catch (error) {
      if (serial !== requestSerial) return;
      status(error.message || 'تعذر فهم الطلب؛ بقي مخططك السابق كما هو.', 'error');
      try { persistMessage('assistant', 'تعذر اعتماد فهم لهذا الطلب. لم يتغير آخر مخطط ناجح في هذه الجلسة.'); } catch { /* Session limit must not trap the form in its busy state. */ }
    } finally { if (serial === requestSerial) { busy = false; setBusy(false); if (!conversation.diff) setInputsLocked(false); } }
  };
  $('studioBrief').addEventListener('input', () => api.setStudioDraft($('studioBrief').value));
  for (const id of plotInputIds) $(id).addEventListener('change', updatePlotHint);
  for (const el of document.querySelectorAll('[data-studio-street]')) el.addEventListener('change', updatePlotHint);
  $('studioRequestForm').addEventListener('submit', event => { event.preventDefault(); void request(false); });
  $('studioLocal').addEventListener('click', () => { void request(true); });
  $('studioApprove').addEventListener('click', async () => {
    if (!conversation.diff || conversation.diff.blockers.length) return;
    if (!proposalInputsMatch($('studioBrief').value, plotValues(), conversation.snapshot)) {
      api.rejectStudioProposal(); clearPending(); return status('تغيّر الطلب أو بيانات الأرض؛ أعد التحليل قبل الرسم.', 'warning');
    }
    const serial = ++requestSerial, before = api.getState().model;
    busy = true; drawing = true; setBusy(true); status('جارٍ رسم المخطط والتحقق من هندسته…');
    try {
      const output = await api.drawProposal();
      if (serial !== requestSerial) return;
      const changed = !before || geometryFingerprint(before) !== geometryFingerprint(output.model);
      clearPending(); api.setStudioDraft(''); $('studioBrief').value = '';
      try { persistMessage('assistant', changed ? 'ظهر مخطط أولي من ' + fmt(output.model.rooms.length) + ' فراغًا. راجع الرسم والمتطلبات، ثم اكتب التعديل التالي أسفله.' : 'الهندسة مطابقة للمخطط السابق؛ لم أعتبر الطلب تعديلًا ناجحًا.'); } catch { /* Committed geometry remains successful even when transcript storage is full. */ }
      status(changed ? 'المخطط داخل المحادثة. تسجيل موافقتك عليه خطوة مستقلة بعد المراجعة.' : 'لم تتغير الهندسة؛ راجع البدائل أو وضّح المطلوب.', changed ? '' : 'warning');
      if (!app.classList.contains('studio-advanced-open')) { surface.showConversation(); compact.showConversation(); api.showConversation(); }
      $('studioPlanSlot').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (serial !== requestSerial) return;
      status(error.message || 'فشل التوليد. بقي آخر مخطط ناجح معروضًا في هذه الجلسة.', 'error');
      try { persistMessage('assistant', 'تعذر إنتاج مخطط صالح. لم يتغير آخر مخطط ناجح في هذه الجلسة.'); } catch { /* Keep the geometry error visible when transcript storage is full. */ }
    } finally { if (serial === requestSerial) { busy = false; drawing = false; setBusy(false); sync(); } }
  });
  $('studioEdit').addEventListener('click', () => { ++requestSerial; api.rejectStudioProposal(); clearPending(); status('اكتب توضيحك لمراجعة الفهم من جديد.'); $('studioBrief').focus(); });
  $('studioCancel').addEventListener('click', () => { ++requestSerial; api.cancelStudioOperation(); clearPending(); busy = false; drawing = false; setBusy(false); status('أُلغيت العملية. بقي المخطط السابق كما هو.'); });
  $('studioApprovePlan').addEventListener('click', () => { try { api.approveStudioPlan(); sync(); status('سُجل اختيارك لهذا المخطط الأولي. هذا ليس اعتمادًا هندسيًا أو نظاميًا.'); } catch (error) { status(error.message, 'warning'); } });
  $('studioContinueConversation').addEventListener('click', () => {
    app.classList.remove('studio-advanced-open'); surface.showConversation(); compact.showConversation(); api.showConversation(); returnToConversation(document);
    $('studioAdvancedToggle').setAttribute('aria-expanded', 'false'); $('studioAdvancedToggle').textContent = 'الأدوات والتفاصيل الهندسية';
  });
  $('studioAdvancedToggle').addEventListener('click', () => {
    const open = app.classList.toggle('studio-advanced-open');
    $('studioAdvancedToggle').setAttribute('aria-expanded', String(open));
    $('studioAdvancedToggle').textContent = open ? 'العودة إلى المحادثة والمخطط' : 'الأدوات والتفاصيل الهندسية';
    if (open) { surface.showAdvanced(); compact.showAdvanced(); document.querySelector('[data-tab="result"]')?.click(); }
    else { surface.showConversation(); compact.showConversation(); api.showConversation(); syncPlot(api.getState().plot); }
  });
  window.addEventListener('mizan:studio-state', sync);
  sync();
  return { request, get conversation() { return api.getState().studioSession; } };
}

if (typeof document !== 'undefined') initSimpleStudio();
