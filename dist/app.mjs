import { presentationPenalty, ensuiteCoverage, explainPresentationPenalty, PRESENTATION_PENALTY_VERSION } from './ensuite.mjs';
import { renderTransparencyPanel } from './transparency.mjs';
import { createStudioSession, normalizeStudioSession, beginStudioOperation, isCurrentStudioOperation, cancelStudioOperation, bindStudioRevision, appendStudioMessage, acceptStudioUnderstanding, approveStudioRevision, invalidateStudioApproval, setStudioDraft } from './studio-session.mjs';
import { diffRoomPrograms } from './design-dialog.mjs';
import { createGeometrySession } from './geometry-session.mjs';
import { eligiblePartitions, eligibleRoomMoves } from './geometry-editor.mjs';
import { initGeometryEditor } from './geometry-editor-ui.mjs';
import { buildClientBrief, applyBriefChoices } from './client-brief.mjs';
import { TYPES, POSITIONS, SIDES, DIRECTIONS, STRATEGIES, CONCEPT_PROFILES, validatePlot, validateModel, footprint, defaultRooms, normalizeRooms, generateAlternatives, quantities, placeOpening, removeOpening } from './planner.mjs';
import { escapeXML as esc, PlanViewport } from './plan-view.mjs';
import { RoomViewer } from './viewer3d.mjs';
import { AI_ENABLED, requestBrief, getAssistantStatus } from './assistant.mjs';
import { quantityRows, estimate } from './estimates.mjs';
import { reviewPlan } from './audit.mjs';
import { requestLocalBrief } from './local-nlp.mjs';
import { bindRequestedDimensions, verifyProposedProgram } from './brief-contract.mjs';
import { applySunOrientation, describeSunOrientation } from './sun-orientation.mjs';
import { circulationNetwork } from './circulation.mjs';
import { encodeProject, decodeProject, MAX_PROJECT_BYTES } from './project.mjs';
import { designInsights } from './design-insights.mjs';
import { siteSolarPreview, rebindSolarContext } from './solar-context.mjs';
import { compareHomeModels, buildEngineeringPromptContext } from './home-design-engine.mjs';
import { buildClientContext, deriveRequirements } from './requirements-engine.mjs';
import { initVisualizer } from './render-visualizer.mjs';
import { calculateMizanScore } from './mizan-score.mjs';
import { analyzeGeminiEngineering } from './gemini-engineering-layer.mjs';
import { runMultiEngineDesign } from './multi-engine.mjs';
import { analyzeClientRequest, auditClientRequest, extractClientDesires, requestFingerprint, requestShapeLabels } from './client-request.mjs';
import { DESIGN_CHOICES } from './design-selection.mjs';
import { analyzeSurveyGeometry, deriveRectangularGeneratorPlot, surveyFingerprint, validateLandSurvey } from './land-survey.mjs';
import { initLandSurveyEditor } from './land-map.mjs';
import { archiveRequestSignature, pendingArchiveKey } from './archive-request.mjs';
import { loadThreeRuntime } from './three-runtime.mjs';
import { evaluateRequirementEvidence, renderRequirementEvidenceHTML } from './requirement-evidence.mjs';

const $ = id => document.getElementById(id), all = selector => [...document.querySelectorAll(selector)];
const number = id => $(id).valueAsNumber;
const fmt = (v, digits = 1) => v.toLocaleString('ar-SA', { maximumFractionDigits: digits });
const publicRooms = rooms => rooms.map(({ name, type, area, position, side, dimensions }) => ({ name, type, area, position, side, ...(dimensions ? { dimensions: { ...dimensions } } : {}) }));
const assessedText = (value, digits = 0) => value === null || value === undefined ? 'غير مُقيّم' : fmt(value, digits);
const state = { studioSession: createStudioSession(), streets: { n: false, s: true, e: false, w: false }, program: defaultRooms(), model: null, alternatives: [], failures: [], palette: 'resort', selectedShape: null, history: [], landSurvey: null, modelLandSurvey: null, modelSurveyAssociated: false, siteSolar: null, signature: '', engineeringSignature: '', engineering: null, gemini: null, multiEngine: null, selected: null, traceContext: null, manualEdits: false, dirty: false, tab: 'brief', studioMode: 'cad', rates: {}, proposal: null, proposalFingerprint: null, requestProposal: null, requestAppliedPrompt: '', clientDesires: [], briefContext: null, aiDesign: null, tour: [], tourIndex: -1, editor: { open: false, tool: 'select' }, discovery: { likes: [], rejects: [], avoids: [], life: {} }, archive: { storageReady: false, authenticated: false, designs: [], selectedDesignId: '', designId: '', currentVersion: null, loadedVersion: null, receiptId: '', savedSignature: '', loading: false, pendingKey: '', pendingSignature: '', notice: '', nextCursor: null, hasMore: false } };
let viewport, viewer, toastTimer, loading3D, circulation, clientBrief, studioProposalSource = null;
let geometrySession, geometryUI, geometrySource, geometryPending, geometryCommandId = 0, modelEpoch = 0, renderedModel, geometryAlternativePool = [];
let studioPending = null, studioOperationContext = null, studioAbort = null, generationSequence = 0, studioRestoring = false;
const emitStudioState = reason => window.dispatchEvent(new CustomEvent('mizan:studio-state', { detail: { reason } }));
// قراءة فقط لطبقة لوحة العرض: النموذج الحالي إن كان مطابقًا للمدخلات، وإلا null.
window.mizanPresentation = Object.freeze({ currentModel: () => (state.model && !state.dirty ? state.model : null) });
const studioInputStamp = () => JSON.stringify([requestFingerprint(requestInput()), state.palette]);
const studioSceneVisible = () => state.tab === 'result' || (state.tab === 'design' && $('app').classList.contains('studio-simple-mode'));
function assertStudioOperation(token) {
  if (token && !isCurrentStudioOperation(state.studioSession, token)) throw Error('أُلغيت العملية أو تغيّرت نسخة المخطط؛ لم يُطبق الرد المتأخر.');
}
function cancelStudioWork(reason = 'cancel', restore = true) {
  cancelStudioOperation(state.studioSession); modelEpoch++; generationSequence++;
  studioAbort?.abort(); studioAbort = null;
  const context = studioOperationContext; studioOperationContext = null;
  if (restore && context && context.model === state.model && (!context.stamp || context.stamp === studioInputStamp())) {
    state.program = structuredClone(context.program); $('idea').value = context.idea;
    state.requestAppliedPrompt = context.applied; state.briefContext = context.briefContext;
    state.discovery = context.discovery; state.selectedShape = context.selectedShape;
    state.palette = context.palette; state.clientDesires = context.clientDesires; state.manualEdits = context.manualEdits; syncPalette();
    restorePlot(context.plot); renderDiscovery(); renderRows();
  }
  studioPending = null; studioOperationContext = null; studioProposalSource = null;
  state.proposal = null; state.proposalFingerprint = null; state.requestProposal = null;
  $('gen').disabled = false; $('freshIdeas').disabled = false; $('askAI').disabled = false; $('askLocal').disabled = false;
  $('gen').textContent = 'ولّد وقارن حتى ستة بدائل'; $('askAI').textContent = 'حلّل طلبي بالخدمة المتصلة'; $('askLocal').textContent = 'افهم طلبي';
  emitStudioState(reason); markDirty();
}
function studioAudit() {
  if (!state.model) return [];
  const rows = auditClientRequest({ model: state.model, rooms: state.program, discovery: state.discovery, desired: extractClientDesires(state.requestAppliedPrompt), idea: state.requestAppliedPrompt });
  const understandings = state.studioSession.understandingHistory || [];
  for (const item of understandings) {
    for (const constraint of item.constraints || []) rows.push({ label: 'مصدر المتطلبات المعتمدة للفهم', state: 'information', detail: constraint.text });
    for (const assumption of item.assumptions || []) rows.push({ label: 'افتراض يحتاج مراجعتك', state: 'unsupported', detail: assumption });
  }
  rows.push({ label: 'حدود التحقق من هذه النسخة', state: 'unsupported', detail: state.model.integration?.requiresReview ? 'تعدّلت الهندسة؛ مراجعة النسخة السابقة لا تعتمد هذا التعديل. يلزم فحص جديد.' : 'الفحوص المتاحة أولية وغير مكتملة؛ الاشتراطات المحلية والإنشاء والخدمات غير معتمدة بهذا المخطط.' });
  return rows;
}

const exploration = { signature: '', previous: [], seed: 1 };
const rawPlot = () => ({ width: number('wid'), length: number('len'), floors: Number($('floors').value), streets: { ...state.streets }, entry: $('entry').value, streetSetback: number('streetSetback'), neighborSetback: number('neighborSetback'), coverage: number('coverage') / 100, maxBuiltArea: $('maxBuiltArea').value === '' ? null : number('maxBuiltArea') });
const signature = (p, rooms) => JSON.stringify([p.width, p.length, p.floors, p.entry, p.streetSetback, p.neighborSetback, p.coverage, p.maxBuiltArea ?? null, ...Object.keys(DIRECTIONS).map(k => p.streets[k]), publicRooms(rooms)]);
const workspaceSignature = (p, rooms, survey = state.landSurvey) => JSON.stringify([signature(p, rooms), surveyFingerprint(survey)]);
const historyEntry = (model, palette) => ({ model, palette, siteSolar: structuredClone(state.siteSolar), modelSurveyAssociated: state.modelSurveyAssociated, ...(state.modelLandSurvey ? { landSurvey: structuredClone(state.modelLandSurvey) } : {}) });
const options = (dict, selected) => Object.entries(dict).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(typeof label === 'string' ? label : label.name)}</option>`).join('');
function message(id, text) { $(id).textContent = text; $(id).hidden = !text; }
function toast(text) { message('toast', text); clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
function discoveryText() {
  const d = state.discovery, parts = [];
  const examples = { courtyard_privacy: 'بيت الفناء الخاص', family_layout: 'جناحان على شكل L', concept_comparison: 'بيت الباحة U', classic_living: 'أجنحة مرتبطة برواق', staggered_wings: 'جناحان متدرجان مرتبطان' };
  if (d.likes.length) parts.push(`أفكار مفضلة: ${d.likes.map(style => examples[style] || style).join('، ')}.`);
  if (d.rejects.length) parts.push(`أفكار غير مفضلة: ${d.rejects.map(style => examples[style] || style).join('، ')}.`);
  if (d.avoids.length) parts.push(`تجنّب: ${d.avoids.join('، ')}.`);
  if (d.life.guests) parts.push(`الضيافة: ${d.life.guests}.`);
  if (d.life.children) parts.push(`الأطفال: ${d.life.children}.`);
  if (d.life.seniors) parts.push(`كبار السن: ${d.life.seniors}.`);
  if (d.life.future) parts.push(`مرونة المستقبل: ${d.life.future}.`);
  return parts.join(' ');
}
function renderDiscovery() {
  const d = state.discovery;
  all('#tasteDeck .taste-card').forEach(card => {
    const style = card.dataset.style, liked = d.likes.includes(style);
    card.classList.toggle('liked', liked); card.classList.toggle('rejected', d.rejects.includes(style));
    const button = card.querySelector('[data-taste="like"]');
    button.textContent = liked ? 'تفضيل هذا الشكل' : 'أفضّل هذا الشكل';
    button.setAttribute('aria-pressed', String(liked));
  });
  all('#avoidChoices [data-avoid]').forEach(button => { const on = d.avoids.includes(button.dataset.avoid); button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); });
  all('#lifestyleChoices [data-life]').forEach(button => { const on = d.life[button.dataset.life] === button.dataset.value; button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); });
  const text = discoveryText(); $('discoverySummary').textContent = text || 'اختر ما يناسبكم؛ سنحوّله إلى موجز تصميم يمكنك تعديله قبل التحليل.';
  const count = d.likes.length + d.rejects.length + d.avoids.length + Object.keys(d.life).length;
  $('discoveryState').textContent = count ? `${count} رغبات محددة` : 'لم يكتمل بعد';
  renderClientBrief();
  if (state.model) markDirty();
}
function renderClientBrief() {
  clientBrief = buildClientBrief(state.discovery, state.program);
  const list = (id, items, empty) => { $(id).replaceChildren(...(items.length ? items : [empty]).map(text => { const li = document.createElement('li'); li.textContent = text; return li; })); };
  list('clientPrinciples', clientBrief.principles, 'حدّد أولويات الضيافة والخصوصية والخدمات من الاختيارات أعلاه.');
  list('clientQuestions', clientBrief.questions, 'أضف أي احتياج خاص في وصف المنزل قبل التحليل.');
  list('clientLimits', clientBrief.limits, 'تبقى المساحات والجوانب كما أدخلتها؛ التعديلات المعروضة تخص الموقع النسبي فقط.');
  $('clientChanges').innerHTML = clientBrief.changes.map(c => `<label class="client-change"><input type="checkbox" data-brief-room="${c.index}"><span><b>${esc(c.name)}: ${esc(POSITIONS[c.from])} ← ${esc(POSITIONS[c.to])}</b><small>${esc(c.reason)}</small></span></label>`).join('');
  $('clientNoChanges').hidden = !!clientBrief.changes.length;
  $('applyClientBrief').disabled = true;
}
function applyClientBrief() {
  try {
    const selected = all('#clientChanges [data-brief-room]:checked').map(el => Number(el.dataset.briefRoom));
    if (!selected.length) return;
    state.program = applyBriefChoices(state.discovery, state.program, clientBrief, selected);
    state.manualEdits = true; renderRows();
    toast('طُبّقت المواقع التي اخترتها على الجدول. اضغط «ولّد» لتحديث المخطط ومقارنة البدائل.');
  } catch (error) { toast(error.message); renderClientBrief(); }
}
function markDirty() {
  if (studioOperationContext?.fingerprint && !studioOperationContext.applying && state.studioSession.activeOperation && studioOperationContext.stamp !== studioInputStamp()) cancelStudioWork('cancel', false);
  state.dirty = !!state.model && (workspaceSignature(rawPlot(), state.program) !== state.signature || state.engineeringSignature !== engineeringSignature());
  all('.stale-message').forEach(el => { el.hidden = !state.dirty; });
  if ($('requirementStale')) $('requirementStale').hidden = !state.dirty;
  $('resultState').textContent = state.dirty ? 'آخر مخطط ناجح — يحتاج تحديثًا' : 'المخطط مطابق للجدول';
  $('resultState').classList.toggle('warn', state.dirty);
  const archived = archiveIsCurrent();
  $('exportPlan').disabled = !state.model || state.dirty || !archived;
  $('exportBOQ').disabled = !state.model || state.dirty || !archived;
  all('[data-alternative]').forEach(button => { button.disabled = (state.dirty || $('gen').disabled) && !state.studioSession.activeOperation; });
  if (!studioRestoring && state.dirty && state.studioSession.currentApproval && !state.studioSession.activeOperation) invalidateStudioApproval(state.studioSession, 'تغيّرت المتطلبات الحالية');
  renderArchiveControls();
  syncWorkspace();
}
function syncWorkspace() {
  const p = rawPlot();
  $('snapshotPlot').textContent = Number.isFinite(p.width * p.length) ? `${fmt(p.width)} × ${fmt(p.length)} م` : 'راجع الأبعاد';
  $('snapshotRooms').textContent = `${fmt(state.program.length, 0)} فراغًا`;
  const choice = state.discovery.likes[0];
  $('snapshotShape').textContent = choice ? DESIGN_CHOICES[choice]?.label : state.selectedShape ? requestShapeLabels[state.selectedShape] : 'لم يُحدد';
  $('snapshotStatus').textContent = !state.model ? 'لم يُولد بعد' : state.dirty ? 'يحتاج تحديثًا' : 'مطابق للجدول';
  $('resultEmpty').hidden = !!state.model; $('reviewEmpty').hidden = !!state.model; $('reviewContent').hidden = !state.model;
  $('requestCharacters').textContent = `${$('idea').value.length} / 4000`;
  if (state.requestProposal) $('applyRequest').disabled = state.requestProposal.fingerprint !== requestFingerprint(requestInput()) || !state.requestProposal.rooms.length;
  const proposalCurrent = !!state.proposal?.rooms.length && state.proposalFingerprint === requestFingerprint(requestInput());
  $('acceptAI').disabled = !proposalCurrent; $('drawAI').disabled = !proposalCurrent;
  if (state.model) renderRequestMatch();
  renderLandSurveySummary();
}
function renderLandSurveySummary() {
  const survey = state.landSurvey, summary = $('landSurveySummary'), choices = $('surveyGeneratorChoices'), clear = $('clearLandSurvey'), link = $('surveyGeneratorLink');
  clear.hidden = !survey;
  if (!survey) {
    summary.textContent = 'لم تُحفظ حدود للمسح بعد. يمكنك اختيار عرض الخريطة ورسم حدود تقديرية أو إدخال إحداثيات يدويًا.';
    choices.hidden = true; link.hidden = true; return;
  }
  const result = analyzeSurveyGeometry(survey.geometry, survey.references), area = fmt(result.areaM2, 2), perimeter = fmt(result.perimeterM, 2);
  summary.textContent = `${result.vertices.length} زاوية · مساحة مضلع تقديرية ${area} م² · محيط مقدّر ${perimeter} م. هذه هندسة حدود أدخلها المستخدم وليست بيانات قطعة رسمية.`;
  choices.hidden = false; link.hidden = false;
  const linkLabel = survey.engineLink === 'survey-rectangle'
    ? `المولد مرتبط بمستطيل محاذٍ للشمال/الشرق: ${fmt(survey.binding.length)} × ${fmt(survey.binding.width)} م (${survey.binding.source === 'confirmed-edge-references' ? 'أطوال مرجعية أدخلها المستخدم' : 'تقدير من نقاط الخريطة'}). لا يعني هذا أن بقية الحد صارت مستطيلة أو أن المرجع تم التحقق منه.`
    : survey.engineLink === 'separate-rectangle'
      ? 'اختير مستطيل المولد منفصلًا صراحةً؛ لا يستخدم أبعاد المسح ولا يحوّل حدوده إلى مستطيل.'
      : 'حد المسح غير مرتبط بالمولد. اختر ربط مستطيل متوافق صراحةً أو استخدم مستطيل المولد منفصلًا قبل التوليد.';
  link.dataset.state = survey.engineLink === 'unlinked' ? 'error' : 'ok'; link.textContent = linkLabel;
  $('surveyBindConfirmed').disabled = !survey.references.some(value => value !== null);
}
function bindSurveyRectangle(mode) {
  try {
    const dimensions = deriveRectangularGeneratorPlot(state.landSurvey, { mode });
    const candidate = validatePlot({ ...rawPlot(), width: dimensions.width, length: dimensions.length });
    $('wid').value = candidate.width; $('len').value = candidate.length;
    state.landSurvey = validateLandSurvey({ ...state.landSurvey, engineLink: 'survey-rectangle', binding: { width: dimensions.width, length: dimensions.length, source: dimensions.source } });
    renderLandSurveySummary(); rating(); markDirty();
    toast(`رُبط مستطيل المولد صراحةً بأبعاد ${fmt(dimensions.length)} × ${fmt(dimensions.width)} م. راجع المساحة واتجاه الحدود قبل التوليد.`);
  } catch (error) { $('surveyGeneratorLink').hidden = false; $('surveyGeneratorLink').dataset.state = 'error'; $('surveyGeneratorLink').textContent = error.message; }
}
function unlinkSurveyRectangle() {
  if (!state.landSurvey) return;
  state.landSurvey = validateLandSurvey({ ...state.landSurvey, engineLink: 'unlinked', binding: null });
  renderLandSurveySummary(); markDirty();
}
const requestInput = () => ({ prompt: $('idea').value, rooms: publicRooms(state.program), plot: rawPlot(), discovery: structuredClone(state.discovery), mode: document.querySelector('[name="requestMode"]:checked').value });
function renderRequestMatch() {
  const desires = extractClientDesires($('idea').value);
  const rows = auditClientRequest({ model: state.model, rooms: state.program, discovery: state.discovery, desired: desires, idea: $('idea').value });
  const ranking = state.multiEngine?.preferenceRanking;
  const selectedCandidate = ranking?.ranked?.find(row => row.candidateId === state.model?.integration?.candidateId);
  if (selectedCandidate?.preferenceScore !== null && selectedCandidate?.preferenceScore !== undefined) rows.push({
    label: 'ترتيب التفضيلات المقاسة بين البدائل', state: 'estimate',
    detail: `${fmt(selectedCandidate.preferenceScore, 0)} / ١٠٠ مقارنة نسبية على ${ranking.activePreferenceCount} محور قابل للقياس؛ ليست درجة رضا مطلقة ولا إثبات خصوصية أو مطابقة نظامية.`
  });
  if (ranking?.bestPreferenceCandidateId && ranking.bestPreferenceCandidateId !== ranking.selectedCandidateId) {
    const preferred = ranking.ranked?.find(row => row.candidateId === ranking.bestPreferenceCandidateId);
    const selected = ranking.ranked?.find(row => row.candidateId === ranking.selectedCandidateId);
    const corridor = row => row?.evaluations?.find(item => item.kind === 'avoid_long_corridors')?.data;
    const preferredCorridor = corridor(preferred), selectedCorridor = corridor(selected);
    const m = value => Number.isFinite(value) ? `${fmt(value, 1)}م` : 'غير متاح';
    const metricText = data => data ? `أطول مقطع ${m(data.longestCorridorAxisM)}، مجموع المحاور ${m(data.totalModeledCorridorAxisM)}، مساحة الممرات ${Number.isFinite(data.totalModeledCorridorAreaM2) ? `${fmt(data.totalModeledCorridorAreaM2, 1)}م²` : 'غير متاحة'}، أطول مسار دخول ${m(data.longestEntryRouteM)}` : null;
    const preferredName = state.alternatives?.find(model => model.integration?.candidateId === ranking.bestPreferenceCandidateId)?.architecture?.tag || ranking.bestPreferenceCandidateId;
    const selectedName = state.alternatives?.find(model => model.integration?.candidateId === ranking.selectedCandidateId)?.architecture?.tag || ranking.selectedCandidateId;
    rows.push({ label: 'مقايضة تخطيطية · لم يُبدّل الاختيار تلقائيًا', state: 'estimate',
      detail: preferredCorridor && selectedCorridor
        ? `المخطط المرشح ${preferredName}: ${metricText(preferredCorridor)}. المختار ${selectedName}: ${metricText(selectedCorridor)}. المرشح بقي بديلًا لأن المقاييس تتعارض؛ قارن المخططين قبل الاختيار.`
        : `ترتيب التفضيلات يميل إلى ${preferredName}، بينما أبقى القرار ${selectedName} لعدم وجود تحسن مهيمن على كل المحاور المقاسة. كلاهما اجتاز فحوص ما قبلية؛ المقارنة ليست إثبات اعتماد.` });
  }
  const status = { met: 'تحقق في المخطط', unmet: 'لم يتحقق', pending: 'بانتظار المخطط', information: 'للمراجعة', estimate: 'مؤشر مقارن', unsupported: 'غير مُقيّم' };
  $('requestMatch').innerHTML = rows.map(row => `<div class="match-row"><b>${esc(row.label)}</b><p>${esc(row.detail)}</p><span class="pill match-state ${row.state}">${status[row.state] || status.unsupported}</span></div>`).join('');
}
async function understandRequest(operation = null) {
  const startEpoch = modelEpoch;
  if ($('askLocal').disabled) return;
  $('askLocal').disabled = true; $('askLocal').textContent = 'جارٍ قراءة طلبك…'; message('requestFeedback', '');
  try {
    const input = requestInput(), result = await analyzeClientRequest(input);
    assertStudioOperation(operation?.sessionId ? operation : null);
    if (startEpoch !== modelEpoch || result.fingerprint !== requestFingerprint(requestInput())) throw Error('تغيّر الطلب أثناء القراءة؛ أعد التحليل من وصفك الحالي.');
    state.requestProposal = result;
    $('requestSummary').textContent = result.summary;
    $('requestFacts').innerHTML = result.understood.map(f => `<div class="request-fact ${f.state}"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join('');
    $('requestRooms').innerHTML = result.rooms.map(r => `<div class="request-room"><span>${esc(r.name)}<small> · ${esc(POSITIONS[r.position])} / ${esc(SIDES[r.side])}</small></span><b>${r.dimensions ? `${fmt(r.dimensions.width, 2)} × ${fmt(r.dimensions.length, 2)} م · ` : ''}${fmt(r.area)} م²</b></div>`).join('') || '<p class="help">لم يحدد الوصف غرفًا. أضف عدد الغرف أو اختر تعديل الجدول الحالي.</p>';
    const list = (id, items, empty) => { $(id).replaceChildren(...(items.length ? items : empty ? [empty] : []).map(text => { const li = document.createElement('li'); li.textContent = text; return li; })); };
    list('requestDesires', result.desires.map(r => `${r.label}: ${r.detail}`), 'لا توجد أولويات إضافية محددة في هذه القراءة.');
    list('requestQuestions', result.questions); $('requestQuestionsBox').hidden = !result.questions.length;
    list('requestAssumptions', result.assumptions); list('requestLimits', result.limitations);
    $('requestReview').hidden = false; syncWorkspace();
    $('requestReview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { if (startEpoch === modelEpoch && (!operation?.sessionId || isCurrentStudioOperation(state.studioSession, operation))) message('requestFeedback', error.message); }
  finally { if (!operation?.sessionId || isCurrentStudioOperation(state.studioSession, operation)) { $('askLocal').disabled = false; $('askLocal').textContent = 'افهم طلبي'; } }
}
function applyRequest() {
  const result = state.requestProposal; if (!result) return;
  if (result.fingerprint !== requestFingerprint(requestInput())) return message('requestFeedback', 'تغيّرت المدخلات بعد القراءة؛ اضغط «افهم طلبي» مرة أخرى.');
  if (!result.rooms.length) return;
  try {
    const plot = validatePlot({ ...rawPlot(), ...result.plotPatch }); normalizeRooms(result.rooms);
    const binding = state.landSurvey?.engineLink === 'survey-rectangle' ? state.landSurvey.binding : null;
    if (binding && (Math.abs(plot.width - binding.width) > 1e-8 || Math.abs(plot.length - binding.length) > 1e-8)) {
      throw Error('أبعاد مستطيل المولد مرتبطة بالمسح المحفوظ؛ أعد الربط أو اختر مستطيلًا منفصلًا صراحةً قبل تغييرها. لم يتغير البرنامج.');
    }
    state.program = publicRooms(result.rooms); state.clientDesires = result.desires; state.requestAppliedPrompt = $('idea').value; state.manualEdits = true;
    if (result.palette) { state.palette = result.palette; syncPalette(); }
    if (result.shape) {
      const key = Object.keys(DESIGN_CHOICES).find(key => DESIGN_CHOICES[key].shape === result.shape) || (result.shape === 'closed' ? 'courtyard_privacy' : null);
      state.discovery.likes = key ? [key] : []; state.selectedShape = result.shape === 'rect' ? 'rect' : null;
      state.discovery.rejects = state.discovery.rejects.filter(k => k !== key);
    }
    for (const shape of result.rejectedShapes) {
      const key = Object.keys(DESIGN_CHOICES).find(key => DESIGN_CHOICES[key].shape === shape);
      if (key) { state.discovery.likes = state.discovery.likes.filter(k => k !== key); if (!state.discovery.rejects.includes(key)) state.discovery.rejects.push(key); }
    }
    state.requestProposal = null; state.proposal = null; state.briefContext = null;
    restorePlot(plot); renderDiscovery(); renderRows(); rating(); $('requestReview').hidden = true; switchTab('design');
    toast('طُبق طلبك على الغرف والأرض والشكل. راجع البرنامج قبل توليد المخطط.');
  } catch (error) { message('requestFeedback', error.message); }
}
function engineeringSignature() { return JSON.stringify([state.discovery, $('idea')?.value || '', state.selectedShape, state.briefContext]); }
function renderStreets() {
  const selected = $('entry').value || 's';
  $('streets').innerHTML = Object.entries(DIRECTIONS).map(([side, name]) => `<button class="street ${state.streets[side] ? 'on' : ''}" data-side="${side}" aria-pressed="${state.streets[side]}"><i class="dot"></i><b>${name}</b><small>${state.streets[side] ? 'شارع مفعّل' : 'جهة جار'}</small></button>`).join('');
  $('entry').innerHTML = options(DIRECTIONS, selected);
}
function rating() {
  const p = rawPlot(); $('area').textContent = Number.isFinite(p.width * p.length) ? fmt(p.width * p.length) + ' م²' : '—';
  try {
    validatePlot(p); const f = footprint(p), area = p.width * p.length;
    if (!f.area) throw Error('الارتدادات المفترضة لا تترك مساحة للبناء؛ راجعها قبل التوليد.');
    const streetCount = Object.values(p.streets).filter(Boolean).length;
    const metrics = [
      { name: 'المتاح من السقف', value: Math.min(100, f.area / (area * p.coverage) * 100) },
      { name: 'توازن الأبعاد', value: Math.min(f.w, f.h) / Math.max(f.w, f.h) * 100 },
      { name: 'جهات الشوارع', value: Math.min(100, 40 + streetCount * 15) },
      { name: 'فسحة الارتداد', value: Math.min(100, (Object.values(f.sb).reduce((a, b) => a + b, 0) / 4) / 3 * 100) },
    ];
    const score = Math.round(metrics.reduce((s, r) => s + r.value, 0) / metrics.length), grade = score >= 88 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F';
    $('grade').textContent = grade; $('grade').dataset.g = grade; $('rt').textContent = `مؤشر تخطيطي ${fmt(score, 0)} / ١٠٠`;
    $('ratingHelp').textContent = `سقف المساحة المتاح: ${fmt(Math.min(f.area, p.maxBuiltArea ?? Infinity))} م². المؤشر متوسط أربعة عوامل مبسطة، وليس تقييمًا للشمس أو الخصوصية أو سعر الأرض.`;
    $('bars').innerHTML = metrics.map(r => `<div class="bar"><span>${r.name}</span><div class="track"><div class="fill" style="width:${r.value}%"></div></div><b>${fmt(r.value, 0)}</b></div>`).join('');
    $('plotInsights').innerHTML = [
      ['حدود البناء المتاحة', `${fmt(Math.min(f.area, p.maxBuiltArea ?? Infinity))} م²`, 'بعد الارتدادات وسقف المساحة الذي أدخلته.'],
      ['مساحة الارتدادات', `${fmt(Math.max(0, area - f.area))} م²`, 'فرق مساحة الأرض عن مستطيل البناء المتاح.'],
      ['الانفتاح على الشوارع', `${fmt(streetCount, 0)} جهة`, streetCount ? 'يُستخدم في القراءة التخطيطية، وليس لقياس الخصوصية.' : 'فعّل جهة شارع واحدة على الأقل.'],
    ].map(([label, value, detail]) => `<div class="insight"><div><span>${label}</span><b>${value}</b></div><p>${detail}</p></div>`).join('');
    message('plotError', '');
  } catch (error) {
    $('grade').textContent = '—'; $('grade').removeAttribute('data-g'); $('rt').textContent = 'راجع بيانات الأرض'; $('bars').replaceChildren(); $('plotInsights').replaceChildren(); $('ratingHelp').textContent = 'لا يمكن عرض مؤشر صالح بالمدخلات الحالية.'; message('plotError', error.message);
  }
}
function readSolarSettings() {
  const numeric=id=>$(id).value.trim()===''?null:Number($(id).value);
  return {version:1,source:$('solarSource').value,latitude:$('solarSource').value==='explicit-user'?numeric('solarLatitude'):null,longitude:$('solarSource').value==='explicit-user'?numeric('solarLongitude'):null,instant:$('solarInstant').value.trim(),northAngleDeg:numeric('solarNorth'),northConfirmed:$('solarNorthConfirmed').checked,...($('solarSource').value==='model-survey-first-vertex'&&$('solarNorthConfirmed').checked?{confirmedSurveyFingerprint:surveyFingerprint(state.modelLandSurvey)||''}:{})};
}
function restoreSolarSettings() {
  const context=state.siteSolar;
  $('solarSource').value=context?.source||'explicit-user';
  for(const [id,key] of [['solarLatitude','latitude'],['solarLongitude','longitude'],['solarInstant','instant'],['solarNorth','northAngleDeg']])$(id).value=context?.[key]??'';
  $('solarNorthConfirmed').checked=context?.northConfirmed===true;
}
function currentSolarPreview() {
  return siteSolarPreview(state.siteSolar,{model:state.model,modelLandSurvey:state.modelLandSurvey,modelSurveyAssociated:state.modelSurveyAssociated});
}
function renderSolarPreview() {
  try {
  const preview=currentSolarPreview();
  $('solarLatitude').disabled=$('solarLongitude').disabled=state.siteSolar?.source==='model-survey-first-vertex';
  if(state.siteSolar?.source==='model-survey-first-vertex'){$('solarLatitude').value='';$('solarLongitude').value='';}
  $('sunInfo').textContent=preview.status==='not-calculated'?'غير محسوب · '+preview.reason:
    `حساب شمسي هندسي تقريبي · المصدر: ${state.siteSolar.source==='explicit-user'?'إحداثيات أدخلها المستخدم':'أول نقطة من حدود مسح المخطط المرتبط'} · ${preview.provenance.latitude}، ${preview.provenance.longitude} · الوقت ${state.siteSolar.instant} · زاوية الشمال ${state.siteSolar.northAngleDeg}°. `+
    (preview.visible?`ارتفاع الشمس ${fmt(preview.altitude)}° · ${preview.azimuth==null?'الشمس رأسية؛ السمت غير معرّف':`السمت الحقيقي ${fmt(preview.azimuth)}°`} · ظل كتلة ٣٫٢م ${fmt(preview.shadowLength)}م. قد يمتد خارج العرض.`:'الشمس تحت الأفق؛ لا ضوء أو ظل شمسي مباشر.');
  viewport?.showSolar(preview,$('showShadow')?.checked);viewer?.setSun?.(preview);
  } catch (error) { $('sunInfo').textContent=error.message;viewport?.showSolar(null,false);viewer?.setSun?.({visible:false,status:'not-calculated'}); }
}
function programTotal() {
  const sum = state.program.reduce((s, r) => s + (Number.isFinite(r.area) ? r.area : 0), 0);
  $('programTotal').textContent = `${fmt(state.program.length, 0)} فراغًا · ${fmt(sum)} م² صافي الغرف، قبل إضافة الجدران والممرات. التوليد من هذا الجدول فقط.`;
}
function renderRows() {
  $('roomRows').innerHTML = state.program.map((r, i) => `<tr data-row="${i}"><td><input data-field="name" aria-label="اسم الفراغ ${i + 1}" maxlength="70" value="${esc(r.name)}"></td><td><select data-field="type" aria-label="نوع الفراغ ${i + 1}">${options(TYPES, r.type)}</select></td><td><input data-field="area" aria-label="مساحة الفراغ ${i + 1}" type="number" min="4" max="120" step=".01" value="${Number.isFinite(r.area) ? r.area : ''}"${r.dimensions ? ' disabled aria-describedby="dimensionHelp"' : ''}></td><td><div class="dimension-inputs"><input data-field="dim-width" aria-label="عرض ${esc(r.name)} بالمتر" type="number" min="1" max="60" step=".1" placeholder="عرض" value="${r.dimensions?.width ?? ''}"><span>×</span><input data-field="dim-length" aria-label="طول ${esc(r.name)} بالمتر" type="number" min="1" max="60" step=".1" placeholder="طول" value="${r.dimensions?.length ?? ''}"></div></td><td><select data-field="position" aria-label="موقع الفراغ ${i + 1}">${options(POSITIONS, r.position)}</select></td><td><select data-field="side" aria-label="جانب الفراغ ${i + 1}">${options(SIDES, r.side)}</select></td><td><button class="remove-room" data-remove="${i}" aria-label="حذف ${esc(r.name)}">حذف</button></td></tr>`).join('');
  programTotal(); markDirty(); renderClientBrief();
}
function selectRoom(id) {
  const r = state.model?.rooms.find(r => r.id === id); if (!r) return;
  state.selected = id; $('roomSelect').value = id; viewport?.select(id);
  if (state.tab === 'result' && $('studioInspector')) $('studioInspector').open = true;
  const marker = state.gemini?.review?.markers?.find(item => item.id === id);
  const geminiNote = marker ? `<p class="gemini-room-note"><b>المراجعة المحلية:</b> ${marker.count} ملاحظة ${marker.severity === 'critical' ? 'حرجة' : marker.severity === 'major' ? 'مهمة' : 'استرشادية'} مرتبطة بهذا الفراغ.</p>` : '';
  $('roomInspector').innerHTML = `<div><b>${esc(r.name)}</b><p>${POSITIONS[r.position]} · ${SIDES[r.resolvedSide]}</p></div><div class="numbers"><span>${fmt(r.area)} م² صافي</span><span>${fmt(r.w, 2)} × ${fmt(r.h, 2)} م</span></div>${geminiNote}`;
  syncRoomEditor(r);
  drawRoute();
}
function syncRoomEditor(room = state.model?.rooms.find(r => r.id === state.selected)) {
  const form = $('roomEditForm'); if (!form || !room) return;
  // أرقام المعرّفات تُشتق من ترتيب البرنامج نفسه عند التوليد (room-0, room-1, …)؛
  // لا يحمل state.program معرّفات (ليبقى متوافقًا مع صيغة حفظ المشروع)، فنشتق الفهرس من المعرّف مباشرة.
  const index = /^room-\d+$/.test(room.id || '') ? Number(room.id.slice(5)) : -1;
  if (index < 0 || index >= state.program.length) return;
  const program = state.program[index]; form.hidden = !state.editor.open; $('roomEditTitle').textContent = `الغرفة: ${program.name}`; $('roomEditName').value = program.name; $('roomEditArea').value = program.area; $('roomEditArea').disabled = !!program.dimensions; $('roomEditWidth').value = program.dimensions?.width ?? ''; $('roomEditLength').value = program.dimensions?.length ?? ''; $('roomEditPosition').innerHTML = options(POSITIONS, program.position); $('roomEditSide').innerHTML = options(SIDES, program.side); form.dataset.roomIndex = index;
}
function drawRoute() {
  const path = circulation?.toRoom(state.selected);
  viewport?.showRoute($('showRoute').checked ? path?.points || [] : []);
  $('routeInfo').textContent = path ? `من المدخل إلى باب الغرفة عبر محاور الممرات: ${fmt(path.metres)} م. المسار لا يثبت استقلال الحركة أو صلاحية الإخلاء.` : 'لا يوجد مسار ممر موثق لهذه الغرفة.';
}
function on3DMode(mode, detail) {
  $('walkControls').hidden = mode !== 'inside'; $('roof').disabled = mode === 'inside'; $('analyticsOverlay').disabled = mode === 'inside';
  if (mode === 'inside') { $('roof').checked = false; $('viewMode').textContent = 'داخل ' + detail + ' · السقف مخفي للمشاهدة · مستوى النظر 1.6 م · ليست محاكاة إضاءة تحت سقف مغلق'; }
  else {
    $('roof').checked = viewer?.roof?.visible || false;
    const sectional = detail === 'top' && !$('roof').checked;
    $('viewMode').textContent = 'منظور ' + ({ top: 'علوي', front: 'أمامي', persp: 'خارجي' }[detail] || 'خارجي') + (sectional ? ' — قطاع أفقي؛ السقف مخفي لرؤية الغرف' : '') + ' · تصور غير تنفيذي';
  }
  $('tourState').textContent = mode === 'inside' ? `داخل ${detail}` : 'منظور عام';
  all('[data-view]').forEach(button => { button.classList.toggle('on', mode === 'orbit' && button.dataset.view === detail); button.setAttribute('aria-pressed', String(mode === 'orbit' && button.dataset.view === detail)); });
}
function on3DState(detail) {
  $('view').dataset.renderStatus = detail.status;
  if (['context-lost', 'restoring', 'unavailable'].includes(detail.status)) {
    message('threeError', detail.message || 'تعذر عرض 3D؛ مخطط 2D محفوظ ومتاح.');
    $('viewMode').textContent = '3D غير متاح حاليًا · مخطط 2D محفوظ';
    $('retry3D').hidden = detail.status === 'restoring';
  } else if (detail.status === 'ready') {
    message('threeError', ''); $('retry3D').hidden = true;
    if (viewer?.model) on3DMode(viewer.mode, viewer.mode === 'inside' ? state.model?.rooms.find(r => r.id === state.selected)?.name || '' : viewer.currentViewName || 'persp');
  }
}
async function loadThree(retry = false) {
  if (globalThis.THREE?.WebGLRenderer && globalThis.THREE?.Scene) return;
  if (loading3D) return loading3D;
  loading3D = loadThreeRuntime({ retry });
  try { await loading3D; } finally { loading3D = null; }
}
async function show3D(retry = false) {
  if (!state.model) return false;
  const requestedModel = state.model, requestedEpoch = modelEpoch;
  if (viewer && viewer.model !== requestedModel) viewer.setVisible(false);
  try {
    message('threeError', ''); $('retry3D').hidden = true;
    await loadThree(retry);
    if (requestedModel !== state.model || requestedEpoch !== modelEpoch) return false;
    const showRoof = viewer?.mode === 'inside' ? viewer.roofChoice : $('roof').checked;
    if (retry && viewer?.contextLost) { viewer.destroy(); viewer = null; }
    if (!viewer) viewer = new RoomViewer($('view'), on3DMode, { onState: on3DState });
    viewer.setVisible(studioSceneVisible() && state.studioMode === '3d'); viewer.setModel(state.model, state.palette); viewer.setRoof(showRoof); $('roof').checked = showRoof && viewer.mode !== 'inside'; viewer.setAnalytics($('analyticsOverlay').checked); $('view').dataset.geometryRevision = String(state.model.geometryRevision || 0); renderSolarPreview();
    if (viewer.contextLost) { on3DState({ status: 'context-lost', message: 'توقف عرض 3D مؤقتًا؛ المخطط الحالي محفوظ ويمكن متابعة 2D أو إعادة المحاولة.' }); return false; }
    on3DState({ status: 'ready' }); return true;
  } catch (error) { if (requestedModel !== state.model || requestedEpoch !== modelEpoch) return false; message('threeError', error.message); $('retry3D').hidden = false; $('viewMode').textContent = '3D غير متاح حاليًا — يمكنك مراجعة 2D'; return false; }
}
function prepareTour() {
  if (!state.model) return [];
  const priorities = ['majlis', 'living', 'dining', 'kitchen', 'bedroom'];
  const rooms = state.model.rooms;
  const external = state.model.openings.find(o => o.type === 'door' && o.connects?.includes('outside'));
  const first = external?.roomId ? rooms.find(room => room.id === external.roomId) : null;
  const network = circulationNetwork(state.model);
  const rank = room => { const index = priorities.indexOf(room.type); return index < 0 ? priorities.length : index; };
  const distances = new Map(rooms.map(room => [room.id, network.toRoom(room.id)?.metres ?? Infinity]));
  const ordered = [...rooms].sort((a, b) => distances.get(a.id) - distances.get(b.id) || rank(a) - rank(b) || a.y - b.y || a.x - b.x);
  return [...new Map([first, ...ordered].filter(Boolean).map(room => [room.id, room])).values()];
}
async function showTourRoom(index, { scroll = false } = {}) {
  const room = state.tour[index]; if (!room) return;
  if (state.studioMode !== '3d') setStudioMode('3d');
  if (!viewer && !await show3D()) return;
  state.tourIndex = index; state.selected = room.id; $('roomSelect').value = room.id; viewport?.select(room.id);
  viewer.enter(room.id); $('tourState').textContent = `الجولة ${index + 1} / ${state.tour.length} · ${room.name}`;
  $('tourPrev').disabled = index <= 0; $('tourNext').disabled = index >= state.tour.length - 1;
  if (scroll) $('view').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function startTour() {
  state.tour = prepareTour(); state.tourIndex = -1;
  if (!state.tour.length) return toast('ولّد مخططًا أولًا لبدء الجولة.');
  await showTourRoom(0, { scroll: true });
}
function syncPlanEditor() {
  const open = !!state.editor.open;
  geometryUI?.setEnabled(open && state.editor.tool === 'select');
  $('planEditor').hidden = !open; $('togglePlanEditor').setAttribute('aria-expanded', String(open));
  $('togglePlanEditor').textContent = open ? '× أخفِ التحرير' : '✎ حرّر المخطط';
  all('[data-plan-tool]').forEach(button => button.classList.toggle('on', button.dataset.planTool === state.editor.tool));
  const instructions = { select: 'اختر غرفة لقراءة تفاصيلها. اختر بابًا أو نافذة أو حذفًا لتعديل الرسم.', door: 'اضغط على جدار فاصل أو خارجي لإضافة باب صالح.', window: 'اضغط على جدار خارجي لإضافة نافذة.', erase: 'اضغط قرب باب أو نافذة لحذفها. المدخل الأساسي محمي.' };
  $('planEditorStatus').textContent = instructions[state.editor.tool] || instructions.select;
  syncRoomEditor();
  viewport?.setEditor({ active: open, tool: state.editor.tool, onAction: editPlanAtPoint });
}
function renderStudioModelSummary() {
  const output = $('studioModelSummary'), model = state.model;
  if (!output) return;
  if (!model) {
    output.textContent = 'المسقط والخصائص من النموذج نفسه.';
    if ($('studioModelTechnical')) $('studioModelTechnical').textContent = 'لا توجد بيانات نموذج بعد.';
    if ($('studioModelKey')) $('studioModelKey').textContent = '—';
    return;
  }
  const plot = model.plot, built = quantities(model).footprint;
  const shapeLabel = ({ rect: 'كتلة مستطيلة', l: 'كتلة على شكل L', u: 'كتلة على شكل U', pavilions: 'أجنحة متصلة برواق', staggered: 'جناحان متدرجان مرتبطان' })[model.shape] || 'غير محددة';
  const boundary = state.modelLandSurvey?.engineLink === 'survey-rectangle'
    ? `مرتبط بحدود المسح (${state.modelLandSurvey.binding.source === 'confirmed-edge-references' ? 'أطوال مرجعية أدخلها المستخدم' : 'تقدير خريطة'}).`
    : state.modelLandSurvey ? 'حدود المسح محفوظة بصورة منفصلة.' : 'أبعاد الأرض من مدخلات المشروع.';
  output.textContent = `${fmt(plot.width)} × ${fmt(plot.length)} م أرض · ${model.rooms.length} فراغًا · مساحة البناء ${fmt(built)} م². ${boundary}`;
  if ($('studioModelTechnical')) $('studioModelTechnical').textContent = `المساحة المبنية المحسوبة ${fmt(built)} م² · هيئة الكتلة ${shapeLabel}.`;
  if ($('studioModelKey')) $('studioModelKey').textContent = shapeLabel;
}
function setStudioMode(mode) {
  if (mode === 'quantities') { switchTab('boq'); return; }
  if (!['cad', '2d', '3d'].includes(mode)) return;
  state.studioMode = mode;
  $('studioPlanCard').hidden = mode === '3d'; $('studio3dCard').hidden = mode !== '3d';
  all('[data-studio-mode]').forEach(button => {
    const on = button.dataset.studioMode === mode; button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on));
  });
  if (mode !== '3d') viewport?.setMode(mode === 'cad' ? 'cad' : 'color');
  if (mode === '3d' && state.model) void show3D();
  else viewer?.setVisible(false);
  requestAnimationFrame(() => { if (mode !== '3d') viewport?.fit(); else viewer?.resize?.(); });
}
function editPlanAtPoint(action) {
  if (!state.model) return;
  if (action.tool === 'select') { if (action.room) selectRoom(action.room); return; }
  try {
    const before = state.model;
    const next = action.tool === 'erase' ? removeOpening(before, action.point) : placeOpening(before, { type: action.tool, point: action.point });
    state.history = [...state.history, historyEntry(before, state.palette)].slice(-5);
    state.model = next;
    const index = state.alternatives.indexOf(before); if (index >= 0) state.alternatives[index] = next;
    state.signature = workspaceSignature(rawPlot(), state.program, state.modelLandSurvey); state.engineeringSignature = engineeringSignature();
    showResults('geometry-edit');
    toast(action.tool === 'erase' ? 'حُذفت الفتحة المحددة.' : action.tool === 'door' ? 'أُضيف الباب إلى المخطط.' : 'أُضيفت النافذة إلى المخطط.');
  } catch (error) { toast(error.message); }
}
function syncGeometryEditor() {
  if (!geometryUI) geometryUI = initGeometryEditor({
    host: $('geometryEditorHost'), getSvg: () => viewport?.svg, getModel: () => state.model,
    getHistory: () => geometrySession.getState(),
    getPartitions: () => eligiblePartitions(state.model, { landSurvey: state.modelLandSurvey }),
    getRoomMoves: () => eligibleRoomMoves(state.model, { landSurvey: state.modelLandSurvey }),
    onPreview: operation => {
      if (state.dirty) throw Error('راجع اختلاف المدخلات عن المخطط قبل التحرير الهندسي.');
      geometryPending = geometrySession.preview({ ...operation, id: `geometry-command-${++geometryCommandId}`, baseRevision: geometrySession.getState().revision });
      if (geometryPending.impact.requiresConfirmation && state.alternatives.length > 1) geometryPending.impact.alternativesNote = 'تغيّر المساحات برنامج المقارنة؛ سيحفظ المشروع المخطط المعدل وحده. تبقى البدائل السابقة قابلة للاستعادة بالتراجع داخل هذه الجلسة.';
      return geometryPending;
    },
    onCommit: () => {
      if (!geometryPending) throw Error('لا توجد معاينة لاعتمادها.');
      if (state.dirty) { geometrySession.cancel(); geometryPending = null; throw Error('تغيّرت المتطلبات أثناء المعاينة؛ أُلغي الاعتماد لحماية تعديلاتك.'); }
      applyGeometryState(geometrySession.commit({ previewId: geometryPending.previewId, confirmProgramChange: true }));
    },
    onCancel: () => { geometrySession?.cancel(); geometryPending = null; },
    onUndo: () => { if (state.dirty) throw Error('راجع تعديلات المتطلبات قبل التراجع الهندسي.'); applyGeometryState(geometrySession.undo()); },
    onRedo: () => { if (state.dirty) throw Error('راجع تعديلات المتطلبات قبل الإعادة الهندسية.'); applyGeometryState(geometrySession.redo()); },
  });
  geometryUI.setEnabled(state.editor.open && state.editor.tool === 'select');
  geometryUI.refresh();
}
function applyGeometryState(result) {
  state.model = result.model; geometrySource = state.model; geometryPending = null;
  state.program = structuredClone(state.model.program);
  // Retain the initial comparison cohort in memory for undo; only designs with
  // the currently confirmed program may enter the active comparison or save.
  const key = signature(state.model.plot, state.model.program);
  state.alternatives = [state.model, ...geometryAlternativePool.filter(model => signature(model.plot, model.program) === key)];
  state.traceContext = null; state.multiEngine = null; state.manualEdits = true;
  state.signature = workspaceSignature(rawPlot(), state.program, state.modelLandSurvey);
  state.engineeringSignature = engineeringSignature();
  renderRows(); showResults('geometry-edit');
}
function showResults(reason = 'selection') {
  if (renderedModel !== state.model) { modelEpoch++; renderedModel = state.model; }
  // Synchronize command revision before both renderers consume the authoritative model.
  if (geometrySource !== state.model) {
    geometryUI?.cancel();
    if (geometrySession) geometrySession.replaceModel(state.model, { landSurvey: state.modelLandSurvey });
    else geometrySession = createGeometrySession(state.model, { landSurvey: state.modelLandSurvey });
    const before = state.model;
    geometryAlternativePool = state.alternatives.filter(model => model !== before);
    state.model = geometrySession.getState().model; geometrySource = state.model; geometryPending = null; renderedModel = state.model;
    state.alternatives = state.alternatives.map(model => model === before ? state.model : model);
  }
  const m = state.model; if (reason === 'generated') studioOperationContext = null; bindStudioRevision(state.studioSession, m, reason === 'load' ? 'sync' : reason); studioPending = null;
  emitStudioState(reason); $('out').style.display = 'block';
  renderStudioModelSummary();
  refreshEngineering();
  refreshGemini();
  circulation = circulationNetwork(m);
  viewport = new PlanViewport($('plan'), m, selectRoom, { mode: state.studioMode === '2d' ? 'color' : 'cad' }); syncPlanEditor(); syncGeometryEditor();
  viewport.svg.dataset.geometryRevision = String(m.geometryRevision || 0);
  $('roomSelect').innerHTML = m.rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join(''); selectRoom(m.rooms[0].id);
  $('modelWarnings').replaceChildren(...m.warnings.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  state.tour = prepareTour(); state.tourIndex = -1; $('tourPrev').disabled = true; $('tourNext').disabled = state.tour.length < 2; $('tourState').textContent = 'منظور عام';
  $('undo').disabled = !state.history.length; markDirty(); renderBOQ(); renderPlanReview(); renderGeminiReview(); renderAlternatives(); renderRequirementEvidence(); renderSolarPreview(); void show3D();
  renderRequestMatch();
}
function refreshGemini() {
  if (!state.model) { state.gemini = null; return; }
  try { state.gemini = { review: analyzeGeminiEngineering(state.model), error: null }; }
  catch (error) { state.gemini = { review: null, error: error instanceof Error ? error.message : 'تعذّرت المراجعة المحلية.' }; }
}
function renderGeminiMarkers() {
  viewport?.showEngineeringMarkers(state.gemini?.review?.markers || [], $('showGemini')?.checked !== false);
}
function renderGeminiReview() {
  const lens = $('geminiLens'), result = state.gemini;
  if (!lens) return;
  lens.hidden = !result;
  if (!result?.review) {
    $('geminiState').textContent = 'تعذّر التشغيل';
    $('geminiSummary').textContent = result?.error || 'ولّد مخططًا صالحًا لبدء قراءة المراجعة المحلية.';
    $('geminiMetrics').replaceChildren(); $('geminiPatterns').textContent = '—';
    $('geminiFindings').innerHTML = '<li>لا تتوفر نتائج قابلة للعرض.</li>';
    $('geminiCoverage').textContent = 'لم تبدأ المراجعة.';
    $('geminiRegulatory').replaceChildren();
    $('geminiHeuristics').textContent = '';
    renderGeminiMarkers();
    return;
  }
  const review = result.review, metrics = review.coordination.summaryMetrics;
  const stateLabel = {
    PRELIMINARY_INCOMPLETE: 'مراجعة مبدئية غير مكتملة',
    COORDINATION_PASSED: 'قراءة أولية نظيفة',
    PASSED_WITH_ADVISORIES: 'ملاحظات استرشادية',
    CHANGES_REQUIRED: 'تعديلات مقترحة',
    CRITICAL_BLOCKERS_FOUND: 'عوائق تحتاج مراجعة'
  }[review.coordination.status] || 'مراجعة أولية';
  $('geminiState').textContent = stateLabel;
  $('geminiState').dataset.state = review.coordination.status;
  $('geminiSummary').textContent = `${metrics.totalFindingsCount} ملاحظة · التعارضات: غير مُقيّم · ${fmt(review.math.areaUtilizationRatio * 100, 0)}٪ استفادة صافية من الكتلة.`;
  const metricCards = [
    ['فحص الفراغات', review.coordination.architecturalReview.evaluatedChecksCount, 'فحص هندسي معماري'],
    ['التعارضات', 'غير مُقيّم', 'لا توجد مجسمات إنشائية أو أنظمة فعلية'],
    ['حمل كهربائي', `${fmt(review.coordination.electricalCoordination.estimatedTotalConnectedKVA, 1)} kVA`, 'مؤشر أولي لاختيار الأحمال'],
    ['تكييف مبدئي', `${fmt(review.coordination.hvacCoordination.totalEstimatedTonsRefrigeration, 1)} TR`, 'تقدير مساحة مكيّفة فقط']
  ];
  $('geminiMetrics').innerHTML = metricCards.map(([label, value, note]) => `<div class="gemini-metric"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(note)}</small></div>`).join('');
  const patterns = review.intelligence.candidateStrategies.slice(0, 3).map(pattern => pattern.name).filter(Boolean);
  $('geminiPatterns').textContent = patterns.length ? patterns.join(' · ') : 'لا يوجد نمط مرشح ضمن المدخلات الحالية.';
  const findings = review.findings.slice(0, 5);
  $('geminiFindings').innerHTML = findings.length
    ? findings.map(item => `<li class="gemini-${String(item.severity).toLowerCase()}"><b>${esc(item.title)}</b><span>${esc(item.description)}</span>${item.suggestion ? `<small>المقترح: ${esc(item.suggestion)}</small>` : ''}</li>`).join('')
    : '<li class="gemini-clean"><b>لا توجد ملاحظات مرتبطة بالبيانات المتاحة.</b><span>تبقى الأنظمة الإنشائية والكهربائية والسباكة الفعلية خارج نطاق هذا المخطط.</span></li>';
  const labels = { referenceComparison: 'المرجع المحقق', structuralSystem: 'الإنشاء', soil: 'التربة', electricalLayout: 'الكهرباء', plumbingRouting: 'السباكة', hvacSystem: 'نظام التكييف', crossDisciplineClashes: 'التعارضات الهندسية', statutoryCompliance: 'المطابقة النظامية' };
  const unavailable = Object.entries(review.coverage).filter(([, value]) => value === 'NOT_EVALUATED').map(([key]) => labels[key] || key);
  $('geminiCoverage').textContent = unavailable.length ? `غير مُقيّم: ${unavailable.join('، ')}. الحركة مقاسة من الرسم، والأنماط والأحمال تقديرات إرشادية.` : 'اكتملت التغطية المتاحة من المخطط.';
  const regulatoryRows = Array.isArray(review.regulatory) ? review.regulatory : [];
  $('geminiRegulatory').innerHTML = regulatoryRows.length
    ? renderRequirementEvidenceHTML({ rows: regulatoryRows })
    : '<p class="help">لم تُستدعَ أي قاعدة مصنّفة كاستشهاد كود نظامي (SBC) لهذا المخطط.</p>';
  const heuristicRules = Array.isArray(review.heuristicRules) ? review.heuristicRules : [];
  $('geminiHeuristics').textContent = heuristicRules.length
    ? 'قواعد داخلية غير نظامية استُخدمت في هذه القراءة (أدلة ممارسة لا كود): ' + heuristicRules.join(' | ')
    : 'لا توجد قواعد داخلية غير نظامية مرتبطة بهذا المخطط.';
  renderGeminiMarkers();
}
function refreshEngineering() {
  if (!state.model || !state.alternatives.length) { state.engineering = null; state.engineeringSignature = ''; return; }
  try {
    state.engineering = compareHomeModels({ plot: state.model.plot, rooms: state.program, discovery: state.discovery, idea: $('idea').value, models: state.alternatives });
    state.engineeringSignature = engineeringSignature();
  } catch (error) {
    state.engineering = { error: error.message, rows: [], comparison: { rows: [] } };
    state.engineeringSignature = '';
  }
}
function currentEngineeringEvaluation() {
  return state.engineering?.rows?.find(row => row.design.sourceModel === state.model)?.evaluation || null;
}
function conceptThumbnail(model) {
  const b = model.building, pad = .7, colors = { majlis: '#d9b777', living: '#8fb5a6', dining: '#d9c69c', kitchen: '#a8bd8d', bedroom: '#9da8c9', bath: '#8fb9c8', storage: '#b7aea1', office: '#b4a3ce', service: '#cfa59f' };
  const rect = (r, fill, radius = .08) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${radius}" fill="${fill}"/>`;
  const rooms = model.rooms.map(r => rect(r, colors[r.type] || '#b8b2aa')).join('');
  const corridors = model.corridors.map(r => rect(r, '#f3ead8', .03)).join('');
  const walls = model.walls.map(w => `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${w.type === 'ext' ? '#2e4a3d' : '#708078'}" stroke-width="${w.t}"/>`).join('');
  return `<svg class="concept-thumb" viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}" preserveAspectRatio="xMidYMid meet" aria-label="معاينة هندسية فعلية لهذا البديل" role="img"><rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + pad * 2}" height="${b.h + pad * 2}" fill="#f8f5ef"/>${corridors}${rooms}${walls}</svg>`;
}
function renderEngineeringReview() {
  const current = currentEngineeringEvaluation();
  if (!current) {
    $('engineeringScore').textContent = 'غير متاح';
    $('engineeringCards').replaceChildren();
    $('engineeringNotes').innerHTML = `<li>${esc(state.engineering?.error || 'ولّد مخططًا صالحًا أولًا لإجراء فحص محرك القرار.')}</li>`;
    $('engineeringLimit').textContent = 'الفحص المرفق لا يستبدل المراجعة الهندسية والكود وتقرير التربة والمخططات التنفيذية.';
    return;
  }
  $('engineeringScore').textContent = `${assessedText(current.score)} / ١٠٠ · مقارنة جزئية`;
  const labels = { privacy: 'فصل حركة الضيافة والعائلة', spaceEfficiency: 'كفاءة المساحة', functionalAdjacency: 'العلاقات الوظيفية', circulation: 'الحركة', wasteControl: 'التحكم بالهدر', daylight: 'الفراغات ذات النوافذ', ventilation: 'التهوية', solarOrientation: 'التوجيه الشمسي', acousticSeparation: 'العزل الصوتي', costEfficiency: 'الاقتصاد', constructability: 'قابلية التنفيذ', futureExpansion: 'المرونة المستقبلية' };
  $('engineeringCards').innerHTML = Object.entries(labels).map(([key, label]) => `<div class="insight"><div><span>${label}</span><b>${assessedText(current.metrics[key])}</b></div><p>${current.metrics[key] === null ? 'لا توجد بيانات كافية لهذا المحور.' : 'مؤشر مقارنة جزئي من البيانات المتاحة؛ لا يثبت الأداء التنفيذي.'}</p></div>`).join('');
  const notes = [...current.explanations, ...current.blockers.map(blocker => `عائق: ${blocker.message}`)];
  $('engineeringNotes').innerHTML = notes.length ? notes.map(note => `<li>${esc(note)}</li>`).join('') : '<li>لم يرصد المحرك ملاحظة إضافية في البيانات الحالية.</li>';
  $('engineeringLimit').textContent = 'هذه قراءة قرارية مبدئية من محرك الميزان؛ لا تُعد تصميمًا إنشائيًا أو اعتمادًا نظاميًا.';
}
function renderAlternatives() {
  // عرض يخدم حاجة العميل: ترتيب البدائل بقياسات حقيقية من المحرك، وتسميتها بميزتها لا بشكلها الهندسي.
  const rows = state.alternatives.map((model, index) => {
    const evaluation = state.engineering?.rows?.[index]?.evaluation;
    return { model, index, q: quantities(model), review: reviewPlan(model), evaluation,
      score: Number.isFinite(evaluation?.score) ? evaluation.score : null, blockers: evaluation?.blockers?.length ?? 0 };
  });
  rows.forEach(row => { row.penaltyDetail = explainPresentationPenalty(row.model); row.penalty = row.penaltyDetail.penalty; row.suites = ensuiteCoverage(row.model); });
  const order = [...rows].sort((x, y) => x.blockers - y.blockers || x.penalty - y.penalty || (y.score ?? -1) - (x.score ?? -1) || x.q.circulation - y.q.circulation);
  const minCirc = Math.min(...rows.map(r => r.q.circulation)), minDark = Math.min(...rows.map(r => r.review.occupiedWithoutWindows));
  const used = new Set();
  const nameOf = (row, rank) => {
    const options = rank === 0 ? ['الأنسب لطلبك'] : [];
    if (row.suites.wanted && row.suites.linked === row.suites.wanted) options.push('حمام داخل كل غرفة نوم');
    if (row.q.circulation === minCirc) options.push('أقل ممرات');
    if (row.review.occupiedWithoutWindows === minDark) options.push('إضاءة طبيعية أفضل');
    options.push(`خيار آخر ${rank + 1}`);
    const label = options.find(o => !used.has(o)) || `خيار ${rank + 1}`; used.add(label); return label;
  };
  const labels = new Map(order.map((row, rank) => [row.index, nameOf(row, rank)]));
  const card = (row, rank) => {
    const { model, index, q, review, evaluation } = row, selected = model === state.model, title = labels.get(index);
    const engineering = evaluation ? `قرار الميزان ${assessedText(evaluation.score)} من ١٠٠ جزئي · ${fmt(evaluation.blockers.length, 0)} عوائق.` : '';
    return `<article role="listitem" class="alternative-card${selected ? ' selected' : ''}${rank === 0 ? ' best' : ''}"><button class="alternative-pick" data-alternative="${index}" aria-pressed="${selected}" aria-label="${selected ? 'التخطيط المعروض' : 'اعرض'} ${esc(title)}"><span class="alternative-preview">${conceptThumbnail(model)}</span><span class="alternative-copy"><strong>${esc(title)}</strong></span></button><details class="alternative-details"><summary aria-label="تفاصيل الخيار">تفاصيل</summary><div><p>الممرات ${fmt(q.circulation)} م² · غير موزّع ${fmt(q.reserve)} م² · فراغات بلا نافذة خارجية ${fmt(review.occupiedWithoutWindows, 0)}.</p><p>${esc(engineering)}</p></div></details></article>`;
  };
  $('alternativeCards').innerHTML = order.slice(0, 3).map(card).join('') + (order.length > 3
    ? `<details class="more-alternatives"><summary>عرض خيارات أخرى (${fmt(order.length - 3, 0)})</summary><div class="more-alternatives-grid">${order.slice(3).map((row, i) => card(row, i + 3)).join('')}</div></details>` : '');
  $('alternativesCount').textContent = `${fmt(state.alternatives.length, 0)} خيارات مرتبة حسب ملاءمتها لطلبك · اختيار أي منها يحدّث المسقط و3D والكميات`;
  $('alternativeNote').textContent = 'الخيارات من برنامجك نفسه، والترتيب بقياسات حسابية مبدئية؛ لا يغني عن المراجعة الهندسية.';
  const selectionTransparency = $('selectionTransparency');
  if (selectionTransparency && order.length) {
    const best = order[0];
    selectionTransparency.innerHTML = renderTransparencyPanel({
      name: 'ترتيب البدائل واختيار «الأنسب لطلبك»',
      inputs: order.map((row, rank) => ({
        label: `الترتيب ${rank + 1} — ${labels.get(row.index)}`,
        value: `عوائق ${row.blockers}، عقوبة عرض ${fmt(row.penalty, 1)} (حمامات غير متصلة ${fmt(row.penaltyDetail.ensuitePenalty, 0)} + تناسب الغرف ${fmt(row.penaltyDetail.proportionPenalty, 1)})، قرار الميزان ${assessedText(row.score)}، ممرات ${fmt(row.q.circulation, 1)} م²`,
      })),
      formula: 'ترتيب تصاعدي حسب: (١) عدد عوائق محرك القرار الهندسي، ثم (٢) «عقوبة العرض» = (عدد حمامات غرف النوم غير المتصلة بغرفتها × ١٠) + حدّ أعلى(٠، أسوأ نسبة طول إلى عرض لغرفة رئيسية − ١.٦)، ثم (٣) قرار الميزان تنازليًا، ثم (٤) أقل مساحة ممرات. أول بديل في هذا الترتيب هو «الأنسب لطلبك».',
      formulaVersion: PRESENTATION_PENALTY_VERSION,
      result: `«الأنسب لطلبك»: ${labels.get(best.index)} — عقوبة عرض ${fmt(best.penalty, 1)}، ${best.blockers} عوائق.`,
      effect: 'هذا الترتيب يحدد أي بديل يصبح المخطط الافتراضي المعروض في المسقط والعرض الثلاثي والكميات مباشرة بعد التوليد، وأي بديل يحمل تسمية «الأنسب لطلبك». كل البدائل الأخرى تبقى متاحة للاختيار اليدوي من البطاقات أعلاه.',
      assumptions: ['«عقوبة العرض» تفترض أن حمامًا متصلًا مباشرة بغرفة نومه وغرفًا رئيسية أقرب إلى المربع أفضل تجربة للعميل من أي معيار آخر غير محسوب هنا (كاتجاه الغرفة أو الخصوصية الفعلية).'],
      missingData: ['لا تُقاس تفضيلات العميل النصية الحرة في هذا الترتيب؛ انظر لوحة «مطابقة طلبك» لمقارنة التفضيلات المقاسة بدلًا من ذلك.'],
      limits: ['عقوبة العرض مقياس هندسي بسيط (اتصال حمام وتناسب أبعاد)؛ لا تقيس الإضاءة أو الخصوصية أو كفاءة التوزيع ولا تحل محل قرار الميزان أو مطابقة الطلب.', 'عند تساوي عدد العوائق وعقوبة العرض، يُفضَّل قرار الميزان الأعلى ثم أقل مساحة ممرات؛ هذا ترتيب حسابي مبدئي وليس توصية هندسية معتمدة.'],
      testedCases: ['مُغطّى باختبارات تلقائية في tests/ensuite.test.mjs: حمامات متصلة بالكامل، حمامات غير متصلة جزئيًا، وغرف بنسب طول/عرض متفاوتة.'],
    });
  } else if (selectionTransparency) selectionTransparency.innerHTML = '';
  markDirty();
}
function renderRequirementEvidence() {
  const summary = $('requirementSummary'), rows = $('requirementRows'), note = $('requirementNote');
  if (!state.model || !summary || !rows || !note) return;
  const context = state.traceContext;
  try {
    const evidence = evaluateRequirementEvidence({
      model: state.model,
      program: Array.isArray(context?.program) ? context.program : undefined,
      plot: context?.plot || null,
      idea: context?.idea || '', discovery: context?.discovery || {}, briefContext: context?.briefContext || null,
    });
    const labels = [
      ['ENFORCED', 'مطابق في الرسم'], ['MEASURED', 'مقاس دون حكم'], ['NOT_MET', 'غير مستوفى'],
      ['UNVERIFIED', 'غير مثبت'], ['UNSUPPORTED', 'غير مدعوم'],
    ];
    summary.replaceChildren(...labels.map(([key, label]) => {
      const item = document.createElement('div'); item.dataset.summaryStatus = key;
      const value = document.createElement('strong'); value.textContent = fmt(evidence.counts[key], 0);
      const title = document.createElement('span'); title.textContent = label;
      item.append(value, title); return item;
    }));
    rows.innerHTML = renderRequirementEvidenceHTML(evidence);
    note.textContent = evidence.note + ' هوية البديل المحدد: ' + evidence.modelIdentity + '.' +
      (context?.program ? ' تمت المقارنة مع برنامج الغرف المحفوظ لحظة هذا التوليد.' :
        ' لا تتوفر نسخة برنامج الغرف الأصلية لهذا البديل؛ لم نستخدم جدول التحرير الحالي لإثبات المطابقة.');
    $('requirementStale').hidden = !state.dirty;
  } catch (error) {
    summary.textContent = 'تعذّر فحص هذا النموذج.';
    rows.replaceChildren();
    note.textContent = error instanceof Error ? error.message : 'تعذّر إنشاء سجل الأدلة.';
  }
}
function renderPlanReview() {
  const review = reviewPlan(state.model);
  $('reviewScore').textContent = `${fmt(review.issues.filter(i => i.level === 'warn').length, 0)} تنبيهات`;
  $('reviewAreas').innerHTML = review.areas.map(([name, area]) => `<div><span>${name}</span><b>${fmt(area)} م²</b></div>`).join('');
  const group = (label, routes) => routes.length ? `<li><b>${label}:</b> ${routes.map(route => `${esc(route.room)} (${route.metres === null ? 'غير متصل' : fmt(route.metres) + 'م'})`).join('، ')}</li>` : '';
  $('reviewRoutes').innerHTML = group('الضيافة', review.routes.guests) + group('العائلة', review.routes.family) + group('الخدمة', review.routes.service) || '<li>لا توجد غرف كافية لحساب مسارات الفئات.</li>';
  $('reviewIssues').innerHTML = review.issues.map(issue => `<li class="${issue.level}">${esc(issue.text)}</li>`).join('');
  $('reviewLimit').textContent = review.note;
  $('reviewRelationships').innerHTML = review.relationships.map(r => `<li>${esc(r.from)} ← ${esc(r.to)}: ${fmt(r.metres)} م عبر الممرات</li>`).join('') || '<li>أضف غرفًا مترابطة لعرض المقارنة.</li>';
  const insights = designInsights(state.model);
  $('insightScore').textContent = insights.overall === null ? 'مؤشرات جزئية' : `${fmt(insights.overall, 0)} / ١٠٠`;
  $('insightCards').innerHTML = insights.cards.map(card => `<div class="insight"><div><span>${esc(card.label)}</span><b>${assessedText(card.score)}</b></div><p>${esc(card.detail)}</p></div>`).join('');
  $('insightLimit').textContent = insights.note;
  renderMizanScore();
  renderEngineeringReview();
}
function renderMizanScore() {
  const output = $('mizanScoreOutput');
  if (!output) return;
  const result = calculateMizanScore(state.model);
  if (!result) { output.innerHTML = '<p class="help">ولّد مخططًا صالحًا لعرض Mizan Score.</p>'; return; }
  $('mizanScoreValue').textContent = `${assessedText(result.score)} / ١٠٠٠ · جزئي`;
  $('mizanScoreGrade').textContent = `${result.grade} · الثقة غير معايرة`;
  $('mizanScoreAxes').innerHTML = result.axes.map(axis => `<div class="insight"><div><span>${esc(axis.label)} <small>(وزن ${axis.weight})</small></span><b>${assessedText(axis.score)}</b></div><p>${esc(axis.detail)}</p></div>`).join('');
  $('mizanScoreNotes').innerHTML = `<li>نقاط القوة: ${esc(result.strengths.join('، ') || 'لا توجد نقاط مرتفعة كافية بعد.')}</li><li>نقاط التحسين: ${esc(result.improvements.join('، ') || 'لا توجد محاور منخفضة في هذا الفحص.')}</li><li>عقوبة التنبيهات: ${fmt(result.penalties, 0)} نقطة.</li>`;
  $('mizanScoreLimit').textContent = result.note;
  const transparency = $('mizanScoreTransparency');
  if (transparency) {
    const evaluated = result.axes.filter(axis => axis.score !== null);
    const missing = result.axes.filter(axis => axis.score === null);
    transparency.innerHTML = renderTransparencyPanel({
      name: 'Mizan Score — المقارنة الجزئية',
      inputs: result.axes.map(axis => ({ label: `${axis.label} (وزن ${axis.weight})`, value: assessedText(axis.score) })),
      formula: result.formula,
      formulaVersion: result.formulaVersion,
      result: `${assessedText(result.score)} / ١٠٠٠`,
      effect: result.effect,
      assumptions: evaluated.map(axis => axis.detail),
      missingData: missing.map(axis => `${axis.label}: ${axis.detail}`),
      limits: [
        result.note,
        'إعادة توزيع الأوزان على المحاور المُقيَّمة فقط تعني أن مخططًا بمحاور قليلة مُقيَّمة قد تختلف درجته الكلية عن مخطط آخر بنفس الأداء الفعلي لكن بمحاور أكثر تقييمًا؛ العدد في «جزئي من ١٢» أعلاه ضروري لقراءة الدرجة بصورة صحيحة.',
      ],
      testedCases: ['مُغطّى باختبارات تلقائية في tests/plan-evidence.test.mjs و tests/mizan-score.test.mjs: نموذج متصل بالكامل، ونموذج بمسارات غير مكتملة تُسقط محاور الخصوصية والحركة إلى «غير مُقيّم».'],
    });
  }
}
function runPlanner(request) {
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => request.integrated ? runMultiEngineDesign(request) : request.projectText !== undefined ? { project: decodeProject(request.projectText) } : generateAlternatives(request.plot, request.rooms, { includeClaude: true }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./layout-worker.mjs', import.meta.url), { type: 'module' });
    const finish = (error, result) => { clearTimeout(timer); worker.terminate(); error ? reject(Error(error)) : resolve(result); };
    const timer = setTimeout(() => finish('استغرق البحث أكثر من دقيقتين؛ أعد تحميل الصفحة وحاول مجددًا، وإن تكرر جرّب برنامجًا أقل أو حدّد جوانب الغرف لتقليل احتمالات التوزيع.'), 120000);
    worker.onmessage = event => finish(event.data.error, event.data);
    worker.onerror = () => finish('تعذّر تشغيل محرك التوزيع في المتصفح. أعد تحميل الصفحة ثم حاول مجددًا.');
    worker.postMessage(request);
  });
}
async function generate(options = {}) {
  const operation = options.operation || null, runId = ++generationSequence;
  assertStudioOperation(operation);
  if (operation && studioOperationContext) { studioOperationContext.fingerprint = requestFingerprint(requestInput()); studioOperationContext.stamp = studioInputStamp(); studioOperationContext.applying = false; }
  if ($('gen').disabled) return;
  const startEpoch = modelEpoch;
  const startSignature = workspaceSignature(rawPlot(), state.program), startEngineeringSignature = engineeringSignature();
  $('gen').disabled = true; $('freshIdeas').disabled = true; $('undo').disabled = true; $('gen').textContent = 'جارٍ البحث عن بدائل مختلفة…';
  try {
    if (state.landSurvey?.engineLink === 'unlinked') throw Error('حدود المسح محفوظة لكنها غير مرتبطة بالمولد. اختر ربط مستطيل متوافقًا أو مستطيلًا منفصلًا صراحةً.');
    if (state.landSurvey?.engineLink === 'survey-rectangle' && (Math.abs(number('wid') - state.landSurvey.binding.width) > 1e-8 || Math.abs(number('len') - state.landSurvey.binding.length) > 1e-8)) throw Error('أبعاد المولد تغيّرت عن أبعاد المسح المرتبطة؛ أعد الربط أو اختر مستطيلًا منفصلًا.');
    if ($('idea').value.trim() && state.requestAppliedPrompt !== $('idea').value) throw Error('وصف طلبك لم يُطبق على البرنامج الحالي. افتح «طلبك»، ثم افهمه وراجع تفاصيله قبل التوليد.');
    const plot = validatePlot(rawPlot()), rooms = normalizeRooms(state.program);
    const currentSignature = JSON.stringify([workspaceSignature(plot, rooms), startEngineeringSignature]);
    if (exploration.signature !== currentSignature) { exploration.signature = currentSignature; exploration.previous = []; }
    const sameProgram = model => signature(model.plot, model.program) === signature(plot, rooms);
    const previous = [...exploration.previous, ...state.alternatives.filter(sameProgram), ...state.history.map(entry => entry.model).filter(sameProgram)];
  const result = await runPlanner({ integrated: true, ensuite: true, plot, rooms, idea: $('idea').value, discovery: structuredClone(state.discovery), briefContext: structuredClone(state.briefContext), selectedShape: state.selectedShape, seed: ++exploration.seed, previous });
    assertStudioOperation(operation);
    if (modelEpoch !== startEpoch || workspaceSignature(rawPlot(), state.program) !== startSignature || engineeringSignature() !== startEngineeringSignature) throw Error('تغيّرت اختياراتك أثناء التوليد؛ لم يتغير المخطط السابق في هذه الجلسة. أعد التوليد من المدخلات الحالية.');
    exploration.previous = [...exploration.previous, ...result.models].slice(-60);
    if (state.model) state.history = [...state.history, historyEntry(state.model, state.palette)].slice(-5);
    state.alternatives = result.models; state.failures = result.failures; state.multiEngine = { searchEvidence: result.searchEvidence, decision: result.decision, aziz: result.aziz, reviews: result.reviews, preferenceRanking: result.preferenceRanking, requestId: result.request.requestId };
    state.siteSolar = rebindSolarContext(state.siteSolar,state.modelLandSurvey,state.landSurvey); restoreSolarSettings();
    state.model = [...result.models].sort((a, b) => presentationPenalty(a) - presentationPenalty(b))[0] || result.selectedModel; state.modelLandSurvey = state.landSurvey ? structuredClone(state.landSurvey) : null; state.modelSurveyAssociated = true; state.signature = workspaceSignature(plot, rooms, state.modelLandSurvey); state.traceContext = { program: structuredClone(rooms), plot: structuredClone(plot), idea: $('idea').value, discovery: structuredClone(state.discovery), briefContext: state.briefContext ? structuredClone(state.briefContext) : null }; state.program = publicRooms(rooms); state.manualEdits = false; renderRows();
    message('generationError', ''); showResults('generated'); switchTab($('app').classList.contains('studio-simple-mode') && !$('app').classList.contains('studio-advanced-open') ? 'design' : 'result');
    $('out').scrollIntoView({ behavior: 'smooth', block: 'start' }); toast(`وجدنا ${fmt(result.models.length, 0)} بدائل مختلفة مع الحفاظ على برنامجك ومساحاتك.`);
    return { model: structuredClone(state.model), alternatives: structuredClone(state.alternatives), failures: structuredClone(state.failures), operationId: operation?.id || null };
  } catch (error) { if (runId === generationSequence && startEpoch === modelEpoch && (!operation || isCurrentStudioOperation(state.studioSession, operation))) { message('generationError', error.message + (state.model ? ' آخر مخطط ناجح لم يتغير في هذه الجلسة.' : '')); markDirty(); } }
  finally { if (runId === generationSequence) { $('gen').disabled = false; $('freshIdeas').disabled = false; $('undo').disabled = !state.history.length; $('gen').textContent = 'ولّد وقارن حتى ستة بدائل'; markDirty(); } }
}
function renderBOQ() {
  const m = state.model; $('boqEmpty').hidden = !!m; $('boqOutput').hidden = !m; if (!m) return;
  $('boqOutput').dataset.geometryRevision = String(m.geometryRevision || 0);
  const q = quantities(m);
  $('kpis').innerHTML = [
    ['مساحة الكتلة الأرضية', q.footprint, 'م²'], ['صافي الغرف', q.rooms, 'م²'], ['الممرات الصافية', q.circulation, 'م²'], ['الأبواب / النوافذ', `${q.doors} / ${q.windows}`, 'فتحة'],
  ].map(([label, v, unit]) => `<div class="kpi"><span>${label}</span><b>${typeof v === 'number' ? fmt(v) : v}</b> <small>${unit}</small></div>`).join('');
  $('mat').innerHTML = '<caption>أسعارك تشمل ما تحدده من مواد وأجور؛ لا توجد أسعار سوق افتراضية.</caption><thead><tr><th scope="col">البند</th><th scope="col">الكمية</th><th scope="col">الوحدة</th><th scope="col">سعر الوحدة ر.س</th><th scope="col">التكلفة ر.س</th></tr></thead><tbody>' + quantityRows(m).map(r => `<tr><td>${r.name}</td><td>${fmt(r.quantity, 2)}</td><td>${r.unit}</td><td><input data-rate="${r.key}" aria-label="سعر وحدة ${r.name}" type="number" min="0" max="100000000" step=".01" placeholder="غير مسعّر" value="${Number.isFinite(state.rates[r.key]) ? state.rates[r.key] : ''}"></td><td id="amount-${r.key}">—</td></tr>`).join('') + '</tbody>';
  updateCosts(); markDirty();
}
function updateCosts() {
  if (!state.model) return;
  const rows = quantityRows(state.model);
  try {
    const e = estimate(rows, state.rates, number('costReserve'), number('vat'));
    rows.forEach(row => { $('amount-' + row.key).textContent = Number.isFinite(state.rates[row.key]) ? fmt(row.quantity * state.rates[row.key], 2) : 'غير مسعّر'; });
    const amount = n => e.priced ? fmt(n, 2) + ' ر.س' : '— لم تُدخل أسعارًا';
    $('tot').innerHTML = `<caption>تقدير جزئي للدور الأرضي المرسوم</caption><tbody><tr class="unpriced"><td colspan="2">${e.unpriced ? `${fmt(e.unpriced, 0)} بنود لم تُسعّر؛ الإجمالي ليس تكلفة المنزل كاملة.` : 'جميع بنود هذا الجدول مسعّرة؛ تظل الأعمال غير المدرجة مستثناة.'}</td></tr><tr><td>مجموع البنود المسعّرة</td><td>${amount(e.subtotal)}</td></tr><tr><td>الاحتياط الحسابي (${fmt(number('costReserve'))}٪)</td><td>${amount(e.contingency)}</td></tr><tr><td>الضريبة المفترضة (${fmt(number('vat'))}٪)</td><td>${amount(e.tax)}</td></tr><tr class="final"><td>إجمالي التقدير الجزئي</td><td>${amount(e.grand)}</td></tr></tbody>`;
  } catch (error) {
    rows.forEach(r => { $('amount-' + r.key).textContent = '—'; });
    $('tot').innerHTML = `<tbody><tr><td class="message error">${esc(error.message)} لا يُعرض إجمالي حتى تصحيح المدخلات.</td></tr></tbody>`;
  }
}
function switchTab(tab) {
  if (!['brief', 'rating', 'design', 'result', 'review', 'boq'].includes(tab)) return;
  state.tab = tab;
  $('app').classList.toggle('studio-active', tab === 'result');
  all('.tab').forEach(button => { const on = button.dataset.tab === tab; button.classList.toggle('on', on); if (on) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); });
  all('.panel').forEach(panel => panel.classList.toggle('on', panel.id === 'panel-' + tab));
  if (tab === 'rating') rating(); if (tab === 'boq') renderBOQ();
  viewer?.setVisible(studioSceneVisible() && state.studioMode === '3d' && !!state.model); markDirty();
  if (studioSceneVisible()) { requestAnimationFrame(() => { viewport?.fit(); viewer?.resize?.(); }); }
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function goHome() { switchTab('rating'); }
async function askAI(operation = null) {
  const startEpoch = modelEpoch;
  if ($('askAI').disabled) return;
  message('aiFeedback', '');
  if (AI_ENABLED && ($('idea').value.trim().length < 8 || $('idea').value.length > 4000)) { message('aiFeedback', 'اكتب وصفًا بين 8 و4000 حرف.'); return; }
  state.proposal = null; state.proposalFingerprint = null; $('aiReview').hidden = true;
  const sourceFingerprint = requestFingerprint(requestInput());
  $('askAI').disabled = true; $('askLocal').disabled = true; $('askAI').textContent = 'جارٍ فهم المتطلبات وتجهيز الرسم…';
  try {
    const request = requestInput();
    const localConstraints = await requestLocalBrief({ prompt: request.prompt, previous: { rooms: request.mode === 'modify' ? request.rooms : [] } });
    if (request.rooms.some(r => r.type === 'office') || localConstraints.rooms.some(r => r.type === 'office')) throw Error('عقد الخدمة المتصلة الحالي لا يدعم نوع «مكتب»؛ لن نعتمد اقتراحًا قد يسقطه. يلزم تحديث عقد الخدمة قبل تحليل هذا النوع بالذكاء المتصل.');
    const dimensionConflict = localConstraints.questions.find(question => /أبعاد .*تعطي مساحة .* بينما كتبت مساحة/.test(question));
    if (dimensionConflict) throw Error(dimensionConflict);
    const ambiguousRoomEdit = localConstraints.questions.find(question => /حدّد العدد أو اسم الفراغ لتطبيق تعديل المساحة أو الموقع/.test(question));
    if (ambiguousRoomEdit) throw Error(ambiguousRoomEdit);
    const discovery = discoveryText();
    const clientContext = clientBrief ? [`مبادئ التخطيط المستخلصة: ${clientBrief.principles.join('، ') || 'لم تحدد بعد.'}`, `أسئلة تحتاج إجابة: ${clientBrief.questions.join('، ') || 'لا توجد.'}`, `حدود يجب التصريح بها: ${clientBrief.limits.join('، ') || 'لا توجد.'}`].join('\n') : '';
    const engineeringContext = buildEngineeringPromptContext({ plot: rawPlot(), rooms: state.program, discovery: state.discovery, idea: $('idea').value, model: state.model });
    const engineText = `سياق محرك القرار الهندسي المنظم (مرجع تحليلي، لا تتجاهل عدم اليقين): ${JSON.stringify(engineeringContext)}`;
    const prompt = [clientContext, discovery, engineText, $('idea').value.trim()].filter(Boolean).join('\n\n');
    const context = buildClientContext({ plot: rawPlot(), discovery: state.discovery, rooms: state.program, prompt });
    const result = await requestBrief({ prompt, context, plot: rawPlot(), previous: { summary: 'برنامج الغرف الحالي للمراجعة. رتّب الأولويات واستخرج ما فهمته من العميل، واذكر التعارضات والأسئلة قبل اقتراح الغرف.', assumptions: [], questions: [], unhandled: [], rooms: publicRooms(state.program) } }, { accessCode: $('aiAccessCode').value, signal: studioAbort ? AbortSignal.any([studioAbort.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
    assertStudioOperation(operation?.sessionId ? operation : null);
    if (startEpoch !== modelEpoch || sourceFingerprint !== requestFingerprint(requestInput())) throw Error('تغيّرت المدخلات أثناء التحليل؛ لم يُطبق الرد القديم. أعد التحليل لطلبك الحالي.');
    const rooms = bindRequestedDimensions(result.brief.rooms, localConstraints.rooms);
    const contract = verifyProposedProgram(request.prompt, rooms);
    if (!contract.pass) throw Error('لم أعتمد اقتراح الذكاء لأن متطلبًا صريحًا لم يطابقه: ' + contract.violations.join(' '));
    const dimensionRooms = localConstraints.rooms.filter(room => room.dimensions);
    const dimensionNote = dimensionRooms.length
      ? `الأبعاد الملزمة لـ${dimensionRooms.length} غرفة حُفظت من طلبك أو جدول الغرف السابق بعد مطابقة النوع والهوية والعدد والمساحة؛ لم يستنتجها الذكاء الاصطناعي، وما زالت بحاجة إلى مراجعتك قبل الرسم.`
      : null;
    showBrief({ ...result.brief, rooms }, dimensionNote ? [...result.limitations, dimensionNote] : result.limitations, context);
    $('aiStatus').textContent = 'نجح الاتصال والتحليل. راجع الاقتراح قبل نقله إلى الجدول.';
    $('aiBadge').textContent = 'متصل'; $('aiBadge').classList.remove('warn');
    message('aiFeedback', 'جهّز الذكاء برنامج التصميم. راجع الافتراضات ثم اختر «اعتمد وارسم المخططات».');
  } catch (error) { if (startEpoch === modelEpoch && (!operation?.sessionId || isCurrentStudioOperation(state.studioSession, operation))) message('aiFeedback', error.message); }
  finally { if (!operation?.sessionId || isCurrentStudioOperation(state.studioSession, operation)) { $('askAI').disabled = false; $('askLocal').disabled = false; $('askAI').textContent = 'حلّل طلبي بالخدمة المتصلة'; } }
}

function showBrief(brief, limitations = [], context = null) {
  const resolved = context || buildClientContext({ plot: rawPlot(), discovery: state.discovery, rooms: state.program, prompt: $('idea').value });
  state.proposal = brief; state.proposalFingerprint = requestFingerprint(requestInput()); state.aiDesign = { summary: brief.summary, source: 'ai' }; state.briefContext = deriveRequirements({ prompt: resolved.prompt, context: resolved, brief }); $('aiSummary').textContent = brief.summary;
  const profile = state.briefContext;
  if ($('aiReadiness')) $('aiReadiness').textContent = `${profile.readiness}%`;
  if ($('aiPriorities')) $('aiPriorities').textContent = profile.topPriorities.join(' · ') || 'لم تحدد بعد';
  if ($('aiRelationships')) $('aiRelationships').textContent = profile.relationships.map(r => `${r.from} ← ${r.to}`).join(' · ') || 'لا توجد علاقة كافية للحساب';
  if ($('aiConflicts')) $('aiConflicts').textContent = profile.conflicts.join(' · ') || 'لا تعارض ظاهر في هذه القراءة';
  const contractNotes = profile.spatialRelationshipContract
    ? [...profile.spatialRelationshipContract.clarifications.map(s => 'سؤال هندسي: ' + s), ...profile.spatialRelationshipContract.unsupported.map(item => `حد المولد (${item.id}): ${item.reason}`)]
    : [];
  const notes = [...brief.assumptions.map(s => 'افتراض: ' + s), ...brief.questions.map(s => 'سؤال: ' + s), ...brief.unhandled.map(s => 'غير منفّذ: ' + s), ...contractNotes, ...limitations];
  $('aiNotes').replaceChildren(...notes.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  $('aiReview').hidden = false; syncWorkspace();
}
async function drawFromAIProposal(options = {}) {
  if (!state.proposal?.rooms.length || state.proposalFingerprint !== requestFingerprint(requestInput())) { const text = 'الاقتراح قديم؛ أعد التحليل قبل الاعتماد.'; message('aiFeedback', text); message('generationError', text); return; }
  state.program = publicRooms(state.proposal.rooms); state.requestAppliedPrompt = $('idea').value; state.manualEdits = true; renderRows(); $('aiReview').hidden = true;
  toast('اعتمد برنامج الذكاء؛ جارٍ الآن رسم البدائل والتحقق منها هندسيًا.');
  return generate(options);
}
async function askLocal() {
  const startEpoch = modelEpoch, fingerprint = requestFingerprint(requestInput());
  message('aiFeedback', '');
  try {
    const prompt = $('idea').value;
    const context = buildClientContext({ plot: rawPlot(), discovery: state.discovery, rooms: state.program, prompt });
    const brief = await requestLocalBrief({ prompt, previous: { rooms: publicRooms(state.program) } });
    if (startEpoch !== modelEpoch || fingerprint !== requestFingerprint(requestInput())) throw Error('تغيّرت النسخة أثناء القراءة؛ لم يطبق الرد القديم.');
    showBrief(brief, ['فهم محلي محدود للأعداد والنفي وأسماء الغرف؛ لا يتصل بخادم ولا يولّد رسمًا أو يغيّر الجدول حتى توافق.'], context);
    message('aiFeedback', 'تم اقتراح برنامج محليًا. راجعه ثم اختر نقله إلى الجدول.');
  } catch (error) { message('aiFeedback', error.message); }
}
function applySunToProgram() {
  try {
    const plot = validatePlot(rawPlot());
    if (!window.confirm('سيُعاد ضبط موقع وجانب الغرف بترجيح اتجاهي مبدئي، وقد يستبدل تعديلاتك اليدوية في هذين الحقلين. المتابعة؟')) return;
    state.program = publicRooms(applySunOrientation(normalizeRooms(state.program), plot.entry)); state.manualEdits = true; renderRows();
    toast(describeSunOrientation(plot.entry));
  } catch (error) { message('generationError', error.message); }
}

async function refreshAssistantStatus() {
  if (!AI_ENABLED) return;
  try {
    const status = await getAssistantStatus({ signal: AbortSignal.timeout(8000) });
    const ready = status.configured && status.accessConfigured;
    if ($('aiBadge').textContent === 'متصل') return;
    $('aiStatus').textContent = ready
      ? 'إعدادات الخدمة موجودة. أدخل رمز الموقع ثم اطلب التحليل للتحقق من الاتصال.'
      : 'خدمة فهم المتطلبات غير مكتملة الإعداد حاليًا؛ الفهم المحلي والتصميم اليدوي متاحان.';
    $('aiBadge').textContent = ready ? 'مهيّأ' : 'غير مكتمل';
    $('aiBadge').classList.toggle('warn', !ready);
  } catch {
    if ($('aiBadge').textContent === 'متصل') return;
    $('aiStatus').textContent = 'تعذر التحقق من اتصال خدمة الذكاء الآن؛ يمكنك استخدام الفهم المحلي أو تجربة التحليل برمز الموقع.';
    $('aiBadge').textContent = 'الاتصال غير مؤكد';
    $('aiBadge').classList.add('warn');
  }
}

function restorePlot(p) {
  state.streets = { ...p.streets }; renderStreets(); $('entry').value = p.entry;
  for (const [id, value] of Object.entries({ len: p.length, wid: p.width, floors: p.floors, streetSetback: p.streetSetback, neighborSetback: p.neighborSetback, coverage: p.coverage * 100, maxBuiltArea: p.maxBuiltArea ?? '' })) $(id).value = value;
}
function syncPalette() {
  all('#styles [data-v]').forEach(button => { const on = button.dataset.v === state.palette; button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); });
}
function download(content, mime, name) {
  const url = URL.createObjectURL(new Blob([content], { type: mime })), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function projectText() {
  return encodeProject({ plot: rawPlot(), rooms: state.program, palette: state.palette, rates: state.rates, costReserve: number('costReserve'), vat: number('vat'), idea: $('idea').value, discovery: state.discovery, model: state.model, alternatives: state.alternatives, history: state.history, landSurvey: state.landSurvey, modelLandSurvey: state.modelLandSurvey, modelSurveyAssociated: state.modelSurveyAssociated, siteSolar: state.siteSolar, studioSession: state.studioSession });
}
function archiveProjectSignature() {
  try {
    const project = JSON.parse(projectText());
    project.savedAt = '';
    return JSON.stringify(project);
  } catch { return ''; }
}
function archiveIsCurrent() {
  const archive = state.archive;
  return !!(archive.storageReady && archive.authenticated && archive.designId && archive.selectedDesignId === archive.designId && archive.receiptId && archive.loadedVersion && archive.loadedVersion === archive.currentVersion && archive.savedSignature && !state.dirty && archive.savedSignature === archiveProjectSignature());
}
function renderArchiveControls() {
  if (!$('archiveStatus')) return;
  const archive = state.archive, current = archiveIsCurrent();
  const status = $('archiveStatus');
  let text, kind = 'info';
  if (!archive.storageReady) { text = archive.notice || 'الأرشيف غير متاح الآن. تبقى التعديلات في هذه الصفحة ويمكنك تنزيل ملف المشروع.'; kind = archive.notice ? 'error' : 'info'; }
  else if (!archive.authenticated) { text = 'سجّل الدخول لعرض تصاميم حسابك وحفظها.'; }
  else if (!state.model) { text = 'ولّد مخططًا أولًا، ثم احفظ نسخة الحساب قبل تنزيل الرسم أو الكميات.'; }
  else if (state.dirty) { text = 'حدّث المخطط بعد تعديل المدخلات، ثم احفظ النسخة الجديدة في الأرشيف.'; }
  else if (current) { text = archive.notice || `المخطط الحالي محفوظ في الحساب${archive.loadedVersion ? ` · النسخة ${archive.loadedVersion}` : ''}.`; kind = 'ready'; }
  else { text = archive.notice || 'هذه النسخة غير محفوظة في الحساب بعد. احفظها قبل تنزيل الرسم أو الكميات.'; kind = archive.notice ? 'error' : 'info'; }
  status.textContent = text; status.dataset.state = kind;
  $('archiveSignIn').hidden = !archive.storageReady || archive.authenticated;
  $('archiveMore').hidden = !archive.hasMore;
  $('archiveMore').disabled = archive.loading;
  $('archiveDesigns').disabled = !archive.storageReady || !archive.authenticated || archive.loading || !archive.designs.length;
  $('archiveVersions').disabled = !archive.storageReady || !archive.authenticated || archive.loading || !archive.selectedDesignId;
  $('archiveSave').disabled = !archive.storageReady || !archive.authenticated || archive.loading || !state.model || state.dirty || !archive.designId || archive.selectedDesignId !== archive.designId;
  $('archiveSaveNew').disabled = !archive.storageReady || !archive.authenticated || archive.loading || !state.model || state.dirty;
  $('archiveLoad').disabled = !archive.storageReady || !archive.authenticated || archive.loading || !archive.selectedDesignId || !$('archiveVersions').value;
  $('archiveDelete').disabled = !archive.storageReady || !archive.authenticated || archive.loading || !archive.selectedDesignId;
}
async function archiveApi(path, options = {}) {
  const result = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  let data = {};
  try { data = await result.json(); } catch { /* handled by status below */ }
  if (!result.ok) throw Object.assign(new Error(data.message || 'تعذر الاتصال بأرشيف الحساب.'), { status: result.status, code: data.error || 'request_failed' });
  return data;
}
async function archiveDownload(path, payload) {
  const result = await fetch(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!result.ok) {
    let data = {};
    try { data = await result.json(); } catch { /* status below */ }
    throw Object.assign(new Error(data.message || 'تعذر التحقق من إيصال التصدير.'), { status: result.status, code: data.error || 'request_failed' });
  }
  if (result.headers.get('x-mizan-archive-receipt') !== payload.receiptId || result.headers.get('x-mizan-archive-version') !== String(payload.expectedVersion)) throw Error('لم يطابق إيصال النسخة استجابة التصدير؛ أُلغي التنزيل.');
  return { blob: await result.blob(), mime: result.headers.get('content-type') || 'application/octet-stream' };
}
function setArchiveNotice(text, isError = false) {
  state.archive.notice = text;
  if ($('archiveStatus')) { $('archiveStatus').textContent = text; $('archiveStatus').dataset.state = isError ? 'error' : 'ready'; }
}
async function refreshArchive({ keepNotice = false } = {}) {
  const archive = state.archive;
  if (!archive.storageReady || !archive.authenticated) { renderArchiveControls(); return; }
  archive.loading = true; renderArchiveControls();
  try {
    const result = await archiveApi('/api/archive/designs');
    archive.designs = Array.isArray(result.designs) ? result.designs : [];
    archive.nextCursor = result.nextCursor || null; archive.hasMore = result.hasMore === true;
    const preferred = archive.designs.some(item => item.id === archive.selectedDesignId) ? archive.selectedDesignId
      : archive.designs.some(item => item.id === archive.designId) ? archive.designId
        : archive.designs[0]?.id || '';
    archive.selectedDesignId = preferred;
    const select = $('archiveDesigns');
    select.replaceChildren(...(archive.designs.length ? archive.designs.map(item => {
      const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.title} · النسخة ${item.current_version}`; return option;
    }) : [new Option('لا توجد تصاميم محفوظة', '')]));
    select.value = preferred;
    if (preferred) await refreshArchiveVersions(preferred, { keepNotice: true });
    else { $('archiveVersions').replaceChildren(new Option('—', '')); $('archiveVersions').value = ''; }
    if (!keepNotice) archive.notice = '';
  } catch (error) {
    archive.notice = error.message || 'تعذر تحديث الأرشيف.';
    if (error.status === 503) archive.storageReady = false;
  } finally { archive.loading = false; renderArchiveControls(); }
}
async function loadMoreArchive() {
  const archive = state.archive;
  if (!archive.storageReady || !archive.authenticated || !archive.hasMore || !archive.nextCursor || archive.loading) return;
  archive.loading = true; renderArchiveControls();
  try {
    const result = await archiveApi(`/api/archive/designs?cursor=${encodeURIComponent(archive.nextCursor)}`);
    const current = new Set(archive.designs.map(item => item.id));
    archive.designs.push(...(result.designs || []).filter(item => !current.has(item.id)));
    archive.nextCursor = result.nextCursor || null; archive.hasMore = result.hasMore === true;
    const select = $('archiveDesigns'), selected = archive.selectedDesignId;
    select.replaceChildren(...archive.designs.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.title} · النسخة ${item.current_version}`; return option; }));
    select.value = selected;
  } catch (error) { archive.notice = error.message || 'تعذر تحميل تصاميم أقدم.'; }
  finally { archive.loading = false; renderArchiveControls(); }
}
async function refreshArchiveVersions(id, { keepNotice = true } = {}) {
  if (!id) return;
  const result = await archiveApi(`/api/archive/designs/${encodeURIComponent(id)}/versions`);
  const rows = Array.isArray(result.versions) ? result.versions : [];
  $('archiveVersions').replaceChildren(...(rows.length ? rows.map(item => {
    const option = document.createElement('option'); option.value = String(item.version_number); option.textContent = `النسخة ${item.version_number} · ${new Date(item.created_at).toLocaleDateString('ar-SA')}`; return option;
  }) : [new Option('لا توجد نسخ', '')]));
  const design = state.archive.designs.find(item => item.id === id);
  $('archiveVersions').value = rows.some(item => item.version_number === design?.current_version) ? String(design.current_version) : String(rows[0]?.version_number || '');
  if (!keepNotice) state.archive.notice = '';
}
async function initArchive() {
  try {
    const result = await archiveApi('/api/archive/session');
    state.archive.storageReady = result.storageReady === true;
    state.archive.authenticated = result.authenticated === true;
    if (state.archive.storageReady && state.archive.authenticated) await refreshArchive();
  } catch (error) {
    state.archive.storageReady = false;
    state.archive.authenticated = error.code === 'sign_in_required';
    state.archive.notice = error.message || 'تعذر الاتصال بأرشيف الحساب؛ بقيت التعديلات المحلية كما هي.';
  }
  renderArchiveControls();
}
async function saveArchive({ asNew = false } = {}) {
  const archive = state.archive;
  if (!archive.storageReady || !archive.authenticated) return setArchiveNotice('سجّل الدخول وتأكد من توفر الأرشيف قبل الحفظ.', true);
  if (!state.model || state.dirty) return setArchiveNotice('حدّث المخطط أولًا حتى تُحفظ المدخلات والهندسة معًا.', true);
  const project = projectText(), projectSignature = archiveProjectSignature(), title = $('archiveTitle').value;
  const useUpdate = !asNew && archive.designId && archive.designId === archive.selectedDesignId;
  const url = useUpdate ? `/api/archive/designs/${encodeURIComponent(archive.designId)}` : '/api/archive/designs';
  const method = useUpdate ? 'PUT' : 'POST';
  const expectedVersion = useUpdate ? archive.currentVersion : null;
  const requestSignature = archiveRequestSignature({ url, method, targetDesignId: useUpdate ? archive.designId : '', expectedVersion, title, project: projectSignature });
  const pending = pendingArchiveKey({ key: archive.pendingKey, signature: archive.pendingSignature }, requestSignature, () => crypto.randomUUID());
  archive.pendingKey = pending.key; archive.pendingSignature = pending.signature;
  const payload = { title, project, idempotencyKey: archive.pendingKey };
  if (useUpdate) payload.expectedVersion = expectedVersion;
  archive.loading = true; archive.notice = ''; renderArchiveControls();
  try {
    const result = await archiveApi(url, {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!result.receiptId) throw Error('لم يصدر إيصال هندسي للنسخة المحفوظة؛ لم يُفعّل التصدير.');
    archive.designId = result.designId; archive.currentVersion = result.currentVersion || result.version; archive.loadedVersion = result.version; archive.receiptId = result.receiptId;
    archive.selectedDesignId = result.designId; archive.savedSignature = projectSignature; archive.pendingKey = ''; archive.pendingSignature = '';
    $('archiveTitle').value = result.title || payload.title;
    await refreshArchive({ keepNotice: true });
    markDirty();
    setArchiveNotice(`حُفظ التصميم في حسابك · النسخة ${result.version}${result.duplicate ? ' · بصمة المقارنة مطابقة لنسخة محفوظة' : ''}.`);
  } catch (error) {
    if (error.status === 503) archive.storageReady = false;
    setArchiveNotice(error.status ? error.message : 'تعذر الاتصال بالأرشيف؛ بقيت المدخلات على الشاشة. أعد المحاولة.', true);
  } finally { archive.loading = false; renderArchiveControls(); }
}
async function loadArchiveVersion() {
  const archive = state.archive, id = $('archiveDesigns').value, version = $('archiveVersions').value;
  if (!id || !version || archive.loading) return;
  const startEpoch = modelEpoch, startDraft = JSON.stringify([rawPlot(), state.program, $('idea').value, state.studioSession.draftText, state.studioSession.epoch, state.studioSession.messageSequence, state.siteSolar]);
  archive.loading = true; archive.notice = ''; renderArchiveControls();
  try {
    const saved = await archiveApi(`/api/archive/designs/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`);
    if (modelEpoch !== startEpoch || startDraft !== JSON.stringify([rawPlot(), state.program, $('idea').value, state.studioSession.draftText, state.studioSession.epoch, state.studioSession.messageSequence, state.siteSolar])) throw Error('تغيّرت الهندسة أثناء التحميل؛ أُلغي استبدال المخطط.');
    const project = decodeProject(saved.project);
    if (!saved.model || validateModel(saved.model).length) throw Error('تعذّر التحقق من هندسة النسخة؛ بقي المشروع الحالي كما هو.');
    project.model = saved.model;
    applyProjectState(project, 'تم فتح نسخة الحساب والتحقق من المدخلات والهندسة المحفوظة.');
    archive.designId = saved.designId; archive.currentVersion = saved.currentVersion; archive.loadedVersion = saved.version; archive.receiptId = saved.receiptId || '';
    archive.selectedDesignId = saved.designId; archive.savedSignature = archiveProjectSignature();
    $('archiveTitle').value = saved.title;
    markDirty();
    setArchiveNotice(`فُتحت النسخة ${saved.version} من الأرشيف.`);
  } catch (error) { setArchiveNotice(error.message || 'تعذر فتح النسخة؛ بقيت المدخلات الحالية كما هي.', true); }
  finally { archive.loading = false; renderArchiveControls(); }
}
async function deleteArchiveDesign() {
  const archive = state.archive, id = $('archiveDesigns').value;
  const design = archive.designs.find(item => item.id === id);
  if (!design || archive.loading) return;
  if (!window.confirm(`سيُحذف «${design.title}» مع نسخه المحفوظة. لا يمكن التراجع عن الحذف. هل تريد المتابعة؟`)) return;
  archive.loading = true; renderArchiveControls();
  try {
    await archiveApi(`/api/archive/designs/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: design.current_version }) });
    if (archive.designId === id) { archive.designId = ''; archive.currentVersion = null; archive.loadedVersion = null; archive.receiptId = ''; archive.savedSignature = ''; }
    markDirty();
    archive.selectedDesignId = ''; await refreshArchive(); setArchiveNotice('حُذف التصميم ونسخه من الأرشيف.');
  } catch (error) { setArchiveNotice(error.message || 'تعذر حذف التصميم.', true); }
  finally { archive.loading = false; renderArchiveControls(); }
}
function saveProject() {
  if ($('gen').disabled) return toast('انتظر اكتمال العملية الجارية قبل الحفظ.');
  try {
    const text = projectText();
    download(text, 'application/json;charset=utf-8', 'mizan-handasi-project.json');
    message('projectStatus', 'تم تجهيز ملف المشروع للتنزيل: الحوار والفهم المعتمد وقرار اختيار النسخة والمدخلات والمخطط والبدائل وآخر 5 نسخ والأسعار. هذا تنزيل محلي؛ حفظ الحساب يتم من أرشيف الحساب.');
  } catch (error) { const detail = error.message + ' لم يُجهز ملف الحفظ؛ صحّح المدخلات ثم أعد المحاولة.'; message('projectStatus', detail); toast(detail); if ($('studioStatus')) { $('studioStatus').textContent = detail; $('studioStatus').className = 'studio-feedback error'; } }
}
function applyProjectState(project, statusText) {
  studioRestoring = true;
  try {
  cancelStudioWork('load', false);
  state.studioSession = normalizeStudioSession(project.studioSession, { model: project.model, legacy: !project.studioSession });
  state.discovery = project.discovery; renderDiscovery(); state.program = project.rooms; state.palette = project.palette; state.rates = project.rates; state.model = project.model; state.selectedShape = project.model?.shape || null; state.alternatives = project.alternatives.length ? project.alternatives : project.model ? [project.model] : []; state.failures = []; state.history = project.history; state.landSurvey = project.landSurvey; state.modelLandSurvey = project.modelLandSurvey; state.modelSurveyAssociated = project.modelSurveyAssociated === true; state.siteSolar = project.siteSolar ?? null; restoreSolarSettings(); state.proposal = null; state.traceContext = null; state.briefContext = null; state.aiDesign = null; state.multiEngine = null; state.engineering = null; state.engineeringSignature = '';
  state.signature = project.model ? workspaceSignature(project.model.plot, project.model.program, state.modelLandSurvey) : '';
  restorePlot(project.plot); syncPalette(); $('idea').value = project.idea; $('costReserve').value = project.costReserve; $('vat').value = project.vat;
  state.requestProposal = null; state.requestAppliedPrompt = project.idea; state.clientDesires = [];
  $('aiReview').hidden = true; message('generationError', ''); renderRows(); rating(); renderBOQ();
  if (state.model) showResults('load'); else { modelEpoch++; geometryUI?.cancel(); geometryUI?.setEnabled(false); geometrySession = null; geometrySource = null; geometryPending = null; geometryAlternativePool = []; renderedModel = null; $('out').style.display = 'none'; viewer?.setVisible(false); }
  message('projectStatus', statusText); emitStudioState('load');
  if ($('app').classList.contains('studio-simple-mode')) switchTab('design');
  } finally { studioRestoring = false; }
}
async function importProject(file) {
  if (!file || $('gen').disabled) return;
  if (file.size > MAX_PROJECT_BYTES) return message('projectStatus', 'حجم الملف يتجاوز 2 ميغابايت. بقي العمل كما هو.');
  if (!window.confirm('سيستبدل الملف مدخلات الجلسة الحالية ومخططها وأسعارها. نزّل مشروعك الحالي أولًا إن احتجته. المتابعة؟')) return;
  const startEpoch = modelEpoch;
  const before = JSON.stringify([rawPlot(), state.program, state.palette, state.rates, $('costReserve').value, $('vat').value, $('idea').value, state.discovery, state.landSurvey, state.studioSession.epoch, state.studioSession.revision, state.studioSession.draftText, state.studioSession.messageSequence, state.siteSolar]);
  $('gen').disabled = true; $('undo').disabled = true; markDirty();
  message('projectStatus', 'جارٍ فحص ملف المشروع وإعادة بناء نسخه قبل الاستيراد…');
  try {
    const { project } = await runPlanner({ projectText: await file.text() });
    if (modelEpoch !== startEpoch || JSON.stringify([rawPlot(), state.program, state.palette, state.rates, $('costReserve').value, $('vat').value, $('idea').value, state.discovery, state.landSurvey, state.studioSession.epoch, state.studioSession.revision, state.studioSession.draftText, state.studioSession.messageSequence, state.siteSolar]) !== before) throw Error('تغيّرت المدخلات أثناء القراءة؛ أُلغي الاستيراد لحماية تعديلاتك.');
    applyProjectState(project, 'تم استيراد المشروع والتحقق من مخططاته وحدود المسح المحفوظة. لم يُستورد أو يُحفظ أي رمز دخول.');
  } catch (error) { message('projectStatus', error.message); }
  finally { $('gen').disabled = false; $('undo').disabled = !state.history.length; markDirty(); }
}
async function exportResult(kind) {
  if (!state.model || state.dirty || $('gen').disabled) return toast('حدّث المخطط قبل تصدير الرسم أو الكميات.');
  if (!archiveIsCurrent()) return toast('احفظ النسخة المطابقة في أرشيف الحساب قبل تصدير الرسم أو الكميات.');
  try {
    const archive = state.archive, version = archive.loadedVersion;
    const { blob, mime } = await archiveDownload(`/api/archive/designs/${encodeURIComponent(archive.designId)}/exports/${kind}`, { receiptId: archive.receiptId, expectedVersion: version });
    if (!archiveIsCurrent() || archive.loadedVersion !== version) return toast('تغيّرت النسخة أثناء تجهيز التصدير؛ أُلغِي التنزيل.');
    download(blob, mime, kind === 'svg' ? 'mizan-handasi-plan.svg' : 'mizan-handasi-quantities.csv');
  } catch (error) { toast(error.message || 'تعذر تصدير النسخة المحفوظة.'); }
}

function boot() {
  initLandSurveyEditor({
    root: document,
    getSurvey: () => state.landSurvey,
    onApply: survey => { state.landSurvey = validateLandSurvey(survey); renderLandSurveySummary(); rating(); markDirty(); toast(survey ? 'حُفظ حد المسح في هذا المشروع؛ اختر ربطه بالمولد أو استخدام مستطيل مستقل صراحةً.' : 'أُزيل حد المسح من المشروع.'); },
  });
  $('surveyBindEstimate').addEventListener('click', () => bindSurveyRectangle('estimated'));
  $('surveyBindConfirmed').addEventListener('click', () => bindSurveyRectangle('confirmed'));
  $('surveyUseSeparate').addEventListener('click', () => {
    if (!state.landSurvey) return;
    state.landSurvey = validateLandSurvey({ ...state.landSurvey, engineLink: 'separate-rectangle', binding: null });
    renderLandSurveySummary(); markDirty(); toast('المسح محفوظ للعرض والقياس؛ التوليد يستخدم مستطيل الأبعاد المنفصل الحالي.');
  });
  $('clearLandSurvey').addEventListener('click', () => {
    if (!state.landSurvey || !window.confirm('سيُمسح مضلع المسح وأطواله المرجعية من هذا المشروع. المتابعة؟')) return;
    state.landSurvey = null; renderLandSurveySummary(); markDirty(); toast('مُسح حد المسح؛ بقي مستطيل المولد كما هو.');
  });
  all('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  all('[data-studio-mode]').forEach(button => button.addEventListener('click', () => setStudioMode(button.dataset.studioMode)));
  all('[data-next]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.next)));
  $('clientChanges').addEventListener('change', () => { $('applyClientBrief').disabled = !all('#clientChanges [data-brief-room]:checked').length; });
  $('applyClientBrief').addEventListener('click', applyClientBrief);
  $('home').addEventListener('click', goHome);
  const openSettings = async () => { try { const { initMizanPortal } = await import('./mizan-portal.mjs'); initMizanPortal(); document.querySelector('#mzpFab')?.click(); } catch { toast('تعذّر فتح الإعدادات؛ أعد المحاولة.'); } };
  $('openSettings').addEventListener('click', openSettings);
  all('[data-open-settings]').forEach(button => button.addEventListener('click', openSettings));
  $('applyRequest').addEventListener('click', applyRequest);
  all('[name="requestMode"]').forEach(input => input.addEventListener('change', syncWorkspace));
  const examples = {
    family: 'أرضي 25×35، المدخل جنوب. أبي 4 غرف نوم بالخلف بمساحة 20 م²، مجلس بالأمام 32 م²، صالة عائلية بالوسط 28 م²، مطبخ 18 م² و3 حمامات بمساحة 6 م². البيت على شكل L، وأهم شيء خصوصية العائلة.',
    pavilions: 'أرضي 20×30، المدخل جنوب. أبي 4 غرف نوم بالخلف، مجلسين بالأمام، صالة عائلية بالوسط، مطبخ وغرفة طعام و3 حمامات. أبي أجنحة مرتبطة برواق.',
    modify: 'غيّر المطبخ إلى مساحة 24 م² بالوسط، بدون مستودع.',
  };
  all('[data-request-example]').forEach(button => button.addEventListener('click', () => { $('idea').value = examples[button.dataset.requestExample]; document.querySelector(`[name="requestMode"][value="${button.dataset.requestExample === 'modify' ? 'modify' : 'replace'}"]`).checked = true; markDirty(); $('idea').focus({ preventScroll: true }); }));
  $('streets').addEventListener('click', e => { const b = e.target.closest('[data-side]'); if (!b) return; state.streets[b.dataset.side] = !state.streets[b.dataset.side]; renderStreets(); rating(); markDirty(); });
  ['len', 'wid', 'streetSetback', 'neighborSetback', 'coverage', 'maxBuiltArea', 'entry', 'floors'].forEach(id => $(id).addEventListener('input', () => {
    if (['len', 'wid'].includes(id) && state.landSurvey?.engineLink === 'survey-rectangle' &&
      (Math.abs(number('wid') - state.landSurvey.binding.width) > 1e-8 || Math.abs(number('len') - state.landSurvey.binding.length) > 1e-8)) unlinkSurveyRectangle();
    rating(); markDirty();
  }));
  ['solarSource','solarLatitude','solarLongitude','solarInstant','solarNorth','solarNorthConfirmed'].forEach(id => $(id).addEventListener('input', () => { if(['solarSource','solarLatitude','solarLongitude','solarNorth'].includes(id))$('solarNorthConfirmed').checked=false; state.siteSolar=readSolarSettings(); renderSolarPreview(); markDirty(); }));
  $('roomRows').addEventListener('input', e => {
    const field = e.target.dataset.field, row = e.target.closest('[data-row]'); if (!field || !row) return;
    const program = state.program[Number(row.dataset.row)];
    if (field === 'dim-width' || field === 'dim-length') {
      const widthInput = row.querySelector('[data-field="dim-width"]'), lengthInput = row.querySelector('[data-field="dim-length"]');
      const width = widthInput.value === '' ? NaN : widthInput.valueAsNumber, length = lengthInput.value === '' ? NaN : lengthInput.valueAsNumber;
      if (Number.isFinite(width) && Number.isFinite(length)) { program.dimensions = { width, length }; program.area = width * length; row.querySelector('[data-field="area"]').value = program.area; row.querySelector('[data-field="area"]').disabled = true; }
      else { delete program.dimensions; row.querySelector('[data-field="area"]').disabled = false; }
    } else program[field] = field === 'area' ? e.target.valueAsNumber : e.target.value;
    state.manualEdits = true; programTotal(); markDirty(); renderClientBrief();
  });
  $('idea').addEventListener('input', markDirty);
  $('roomRows').addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (!b) return; state.program.splice(Number(b.dataset.remove), 1); state.manualEdits = true; renderRows(); });
  $('addType').innerHTML = options(TYPES, 'bedroom');
  $('addRoom').addEventListener('click', () => { if (state.program.length >= 30) return toast('الحد الأقصى 30 فراغًا.'); const type = $('addType').value; state.program.push({ name: TYPES[type].name, type, area: TYPES[type].area, position: type === 'majlis' ? 'front' : type === 'bedroom' ? 'back' : 'middle', side: 'any' }); state.manualEdits = true; renderRows(); });
  $('applyCounts').addEventListener('click', () => {
    try {
      const rooms = defaultRooms({ bedrooms: number('beds'), majlis: number('majlis'), baths: number('baths'), kitchens: number('kitchens'), halls: number('halls'), dining: number('dining') }); normalizeRooms(rooms);
      if (state.program.length && JSON.stringify(publicRooms(state.program)) !== JSON.stringify(rooms) && !window.confirm('سيستبدل هذا جدول الغرف الحالي بقائمة جديدة من الأعداد. المتابعة؟')) return;
      state.program = rooms; state.manualEdits = false; renderRows(); toast('تحدّث جدول المراجعة؛ اضغط «ولّد» لتطبيقه على المخطط.');
    } catch (error) { message('generationError', error.message); }
  });
  $('styles').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return; state.palette = b.dataset.v;
    all('#styles [data-v]').forEach(button => { const on = button === b; button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); });
    if (state.model) void show3D();
  });
  $('tasteDeck').addEventListener('click', event => {
    const action = event.target.closest('[data-taste]'); if (!action) return;
    const card = action.closest('.taste-card'), style = card?.dataset.style; if (!style) return;
    state.selectedShape = null;
    const target = action.dataset.taste === 'like' ? state.discovery.likes : state.discovery.rejects;
    const other = action.dataset.taste === 'like' ? state.discovery.rejects : state.discovery.likes;
    const index = target.indexOf(style);
    if (index >= 0) target.splice(index, 1);
    else if (action.dataset.taste === 'like') state.discovery.likes = [style];
    else target.push(style);
    const otherIndex = other.indexOf(style); if (otherIndex >= 0) other.splice(otherIndex, 1);
    if (action.dataset.taste === 'like') {
      const palette = { courtyard_privacy: 'resort', family_layout: 'modern', concept_comparison: 'classic', classic_living: 'classic', staggered_wings: 'classic' }[style];
      if (palette) { state.palette = palette; syncPalette(); if (state.model) void show3D(); }
    }
    renderDiscovery();
  });
  $('avoidChoices').addEventListener('click', event => {
    const button = event.target.closest('[data-avoid]'); if (!button) return;
    const value = button.dataset.avoid, index = state.discovery.avoids.indexOf(value); index >= 0 ? state.discovery.avoids.splice(index, 1) : state.discovery.avoids.push(value); renderDiscovery();
  });
  $('lifestyleChoices').addEventListener('click', event => {
    const button = event.target.closest('[data-life]'); if (!button) return;
    const key = button.dataset.life; state.discovery.life[key] = state.discovery.life[key] === button.dataset.value ? undefined : button.dataset.value; if (!state.discovery.life[key]) delete state.discovery.life[key]; renderDiscovery();
  });
  $('applyDiscovery').addEventListener('click', () => { const text = discoveryText(); if (!text) return toast('اختر رغبة واحدة على الأقل أولًا.'); $('idea').value = [text, $('idea').value.trim()].filter(Boolean).join('\n\n'); $('idea').focus({ preventScroll: true }); toast('أُضيف موجز رغباتكم إلى الوصف؛ راجعه ثم حلّله أو عدّل جدول الغرف.'); });
  $('gen').addEventListener('click', generate);
  $('freshIdeas').addEventListener('click', generate);
  $('alternativeCards').addEventListener('click', event => {
    const button = event.target.closest('[data-alternative]');
    if (!button || ((state.dirty || $('gen').disabled) && !state.studioSession.activeOperation)) return;
    if (state.studioSession.activeOperation) { cancelStudioWork('selection'); if (state.dirty) return; }
    const model = state.alternatives[Number(button.dataset.alternative)];
    if (!model) return;
    state.selectedShape = model.shape;
    if (model === state.model) { state.engineeringSignature = engineeringSignature(); return; }
    state.history = [...state.history, historyEntry(state.model, state.palette)].slice(-5);
    state.model = model; state.signature = workspaceSignature(rawPlot(), state.program, state.modelLandSurvey); showResults(); toast('تغيّر المخطط و3D والكميات إلى البديل المختار.');
  });
  $('undo').addEventListener('click', () => {
    if (!state.history.length) return;
    if (state.dirty && !window.confirm('سيتم استرجاع بيانات آخر توليد سابق بدل تعديلات الجدول الحالية. المتابعة؟')) return;
    const previous = state.history.pop(); state.model = previous.model; state.traceContext = null; state.selectedShape = previous.model.shape || null; state.palette = previous.palette; state.program = publicRooms(previous.model.program); state.landSurvey = previous.landSurvey ? validateLandSurvey(previous.landSurvey) : null; state.modelLandSurvey = state.landSurvey ? structuredClone(state.landSurvey) : null; state.modelSurveyAssociated = previous.modelSurveyAssociated === true; state.siteSolar = previous.siteSolar ?? null; restoreSolarSettings(); const p = previous.model.plot;
    restorePlot(p); syncPalette(); state.alternatives = [state.model]; state.failures = [];
    state.signature = workspaceSignature(p, state.program); state.manualEdits = false; renderRows(); renderLandSurveySummary(); rating(); message('generationError', ''); showResults(); toast('تم استرجاع التوليد السابق ومتطلباته وحدود مسحه.');
  });
  $('zoomIn').addEventListener('click', () => viewport?.zoom(.8)); $('zoomOut').addEventListener('click', () => viewport?.zoom(1.25));
  $('fitPlan').addEventListener('click', () => viewport?.fit()); $('fitPlot').addEventListener('click', () => viewport?.fit(true));
  $('togglePlanEditor').addEventListener('click', () => { state.editor.open = !state.editor.open; syncPlanEditor(); });
  $('closePlanEditor').addEventListener('click', () => { state.editor.open = false; syncPlanEditor(); });
  $('planEditor').addEventListener('click', event => {
    const tool = event.target.closest('[data-plan-tool]'); if (!tool) return;
    state.editor.tool = tool.dataset.planTool; syncPlanEditor();
  });
  $('roomEditWidth').addEventListener('input', () => { const w = $('roomEditWidth').valueAsNumber, l = $('roomEditLength').valueAsNumber; if ($('roomEditWidth').value !== '' && $('roomEditLength').value !== '' && Number.isFinite(w*l)) { $('roomEditArea').value = w*l; $('roomEditArea').disabled = true; } else $('roomEditArea').disabled = false; });
  $('roomEditLength').addEventListener('input', () => { const w = $('roomEditWidth').valueAsNumber, l = $('roomEditLength').valueAsNumber; if ($('roomEditWidth').value !== '' && $('roomEditLength').value !== '' && Number.isFinite(w*l)) { $('roomEditArea').value = w*l; $('roomEditArea').disabled = true; } else $('roomEditArea').disabled = false; });
  $('roomEditForm').addEventListener('submit', event => {
    event.preventDefault(); const index = Number(event.currentTarget.dataset.roomIndex); if (!Number.isInteger(index) || !state.program[index]) return;
    try {
      const width = $('roomEditWidth').value === '' ? NaN : $('roomEditWidth').valueAsNumber, length = $('roomEditLength').value === '' ? NaN : $('roomEditLength').valueAsNumber;
      const dimensions = Number.isFinite(width) && Number.isFinite(length) ? { width, length } : null;
      state.program[index] = { ...state.program[index], name: $('roomEditName').value.trim(), area: dimensions ? width * length : $('roomEditArea').valueAsNumber, dimensions, position: $('roomEditPosition').value, side: $('roomEditSide').value }; normalizeRooms(state.program); state.manualEdits = true; renderRows(); markDirty(); toast('حُفظ تعديل الغرفة في البرنامج. اضغط «ولّد» لإعادة توزيعها هندسيًا.');
    } catch (error) { toast(error.message); syncRoomEditor(); }
  });
  $('editorRoomProgram').addEventListener('click', () => { state.editor.open = false; syncPlanEditor(); document.querySelector('.program-table')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('عدّل الغرف والمساحات من الجدول ثم ولّد نسخة محدثة من المخطط.'); });
  $('roomSelect').addEventListener('change', () => selectRoom($('roomSelect').value));
  $('showRoute').addEventListener('change', drawRoute); $('showShadow').addEventListener('change', renderSolarPreview); $('showGemini').addEventListener('change', renderGeminiMarkers);
  $('saveProject').addEventListener('click', saveProject);
  $('archiveSave').addEventListener('click', () => { void saveArchive(); });
  $('archiveSaveNew').addEventListener('click', () => { void saveArchive({ asNew: true }); });
  $('archiveRefresh').addEventListener('click', () => { void refreshArchive(); });
  $('archiveMore').addEventListener('click', () => { void loadMoreArchive(); });
  $('archiveDesigns').addEventListener('change', async () => {
    const archive = state.archive; archive.selectedDesignId = $('archiveDesigns').value; archive.loading = true; renderArchiveControls();
    try { await refreshArchiveVersions(archive.selectedDesignId, { keepNotice: false }); }
    catch (error) { archive.notice = error.message || 'تعذر تحميل نسخ هذا التصميم.'; }
    finally { archive.loading = false; renderArchiveControls(); }
  });
  $('archiveVersions').addEventListener('change', renderArchiveControls);
  $('archiveTitle').addEventListener('input', renderArchiveControls);
  $('archiveLoad').addEventListener('click', () => { void loadArchiveVersion(); });
  $('archiveDelete').addEventListener('click', () => { void deleteArchiveDesign(); });
  $('loadProject').addEventListener('click', () => { if (!$('gen').disabled) $('projectFile').click(); });
  $('projectFile').addEventListener('change', async () => { const file = $('projectFile').files[0]; $('projectFile').value = ''; await importProject(file); });
  $('exportPlan').addEventListener('click', () => exportResult('svg')); $('exportBOQ').addEventListener('click', () => exportResult('csv'));
  $('focusRoom').addEventListener('click', () => { viewport?.focus(state.selected); $('plan').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('enterRoom').addEventListener('click', async () => { setStudioMode('3d'); if (!viewer && !await show3D()) return; viewer.enter(state.selected); $('view').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('startTour').addEventListener('click', startTour);
  $('tourPrev').addEventListener('click', () => { if (state.tourIndex > 0) void showTourRoom(state.tourIndex - 1); });
  $('tourNext').addEventListener('click', () => { if (state.tourIndex < state.tour.length - 1) void showTourRoom(state.tourIndex + 1); });
  all('[data-view]').forEach(b => b.addEventListener('click', () => viewer?.view(b.dataset.view)));
  all('[data-move]').forEach(b => b.addEventListener('click', () => viewer?.move(b.dataset.move)));
  $('roof').addEventListener('change', () => { viewer?.setRoof($('roof').checked); if (viewer) on3DMode(viewer.mode, viewer.mode === 'inside' ? state.model?.rooms.find(r => r.id === state.selected)?.name || '' : viewer.currentViewName || 'persp'); });
  $('retry3D').addEventListener('click', () => { void show3D(true); });
  $('analyticsOverlay').addEventListener('change', () => viewer?.setAnalytics($('analyticsOverlay').checked));
  $('mat').addEventListener('input', e => { if (!e.target.dataset.rate) return; state.rates[e.target.dataset.rate] = e.target.value === '' ? '' : e.target.valueAsNumber; updateCosts(); markDirty(); });
  ['costReserve', 'vat'].forEach(id => $(id).addEventListener('input', () => { updateCosts(); markDirty(); }));
  $('askAI').addEventListener('click', askAI);
  $('askLocal').addEventListener('click', understandRequest); $('applySun').addEventListener('click', applySunToProgram);
  $('drawAI').addEventListener('click', drawFromAIProposal);
  $('acceptAI').addEventListener('click', () => { if (!state.proposal?.rooms.length || state.proposalFingerprint !== requestFingerprint(requestInput())) return message('aiFeedback', 'الاقتراح قديم؛ أعد التحليل قبل الاعتماد.'); state.program = publicRooms(state.proposal.rooms); state.requestAppliedPrompt = $('idea').value; state.manualEdits = true; renderRows(); $('aiReview').hidden = true; switchTab('design'); toast('حُفظ البرنامج في الجدول؛ راجعه قبل التوليد.'); });
  window.addEventListener('pagehide', () => viewer?.setVisible(false)); window.addEventListener('pageshow', () => viewer?.setVisible(state.tab === 'result' && $('app').classList.contains('show')));
  renderStreets(); rating(); renderRows(); renderBOQ(); renderDiscovery(); renderLandSurveySummary(); initVisualizer(() => state.model); switchTab('rating'); void refreshAssistantStatus(); void initArchive();
}

// The conversation-first UI is an adapter over v48's confirmed request, exact
// geometry, archive signature, land-survey and project state. It owns no planner.
const mizanStudioAPI = Object.freeze({
  getState() {
    return {
      studioSession: structuredClone(state.studioSession),
      requirementsAudit: studioAudit(),
      siteSolar: structuredClone(state.siteSolar), solarPreview: currentSolarPreview(), modelSurveyAssociated: state.modelSurveyAssociated,
      alternatives: structuredClone(state.alternatives),
      hasModel: !!state.model,
      model: state.model ? structuredClone(state.model) : null,
      program: publicRooms(state.program),
      plot: rawPlot(),
      dirty: state.dirty,
      failures: structuredClone(state.failures),
      alternativeCount: state.alternatives.length,
      geometry: geometrySession ? { revision: geometrySession.getState().revision, undoDepth: geometrySession.getState().undoDepth, redoDepth: geometrySession.getState().redoDepth } : null,
      renderedRevisions: { plan: viewport?.model?.geometryRevision ?? 0, three: viewer?.model?.geometryRevision ?? null, quantities: Number($('boqOutput').dataset.geometryRevision || 0) },
    };
  },
  setPlot({ width, length, entry, maxBuiltArea, streets }) {
    if (!['s', 'n', 'e', 'w'].includes(entry)) throw Error('جهة المدخل غير صالحة.');
    const requested = {
      ...rawPlot(), width: Number(width), length: Number(length), entry,
      streets: streets === undefined ? { ...state.streets } : { ...streets },
      maxBuiltArea: maxBuiltArea === null || maxBuiltArea === undefined || maxBuiltArea === '' ? null : Number(maxBuiltArea),
    };
    const candidate = validatePlot(requested);
    const binding = state.landSurvey?.engineLink === 'survey-rectangle' ? state.landSurvey.binding : null;
    if (binding && (Math.abs(candidate.width - binding.width) > 1e-8 || Math.abs(candidate.length - binding.length) > 1e-8)) {
      throw Error('أبعاد مستطيل المولد مرتبطة بالمسح المحفوظ؛ أعد الربط أو اختر مستطيلًا منفصلًا صراحةً قبل تغييرها.');
    }
    $('wid').value = String(candidate.width);
    $('len').value = String(candidate.length);
    $('entry').value = candidate.entry;
    $('maxBuiltArea').value = candidate.maxBuiltArea ?? '';
    state.streets = { ...candidate.streets };
    renderStreets(); rating(); markDirty();
    return validatePlot(rawPlot());
  },
  appendStudioMessage(role, text) { appendStudioMessage(state.studioSession, { role, text, source: role === 'user' ? 'customer' : 'system' }); emitStudioState('session'); },
  setStudioDraft(text) { setStudioDraft(state.studioSession, text); },
  cancelStudioOperation() { cancelStudioWork(); },
  rejectStudioProposal() {
    const proposalMessage = [...state.studioSession.messages].reverse().find(m => m.role === 'assistant');
    if (studioPending && proposalMessage) proposalMessage.status = 'rejected';
    cancelStudioWork();
  },
  approveStudioPlan() {
    if (!state.model || state.dirty) throw Error('راجع اختلاف المتطلبات عن المخطط قبل اعتماد النسخة.');
    const rows = studioAudit();
    if (rows.some(row => row.state === 'unmet')) throw Error('يوجد متطلب غير محقق؛ راجعه قبل اعتماد هذه النسخة.');
    approveStudioRevision(state.studioSession, { confirmed: true }); emitStudioState('session'); markDirty();
    return structuredClone(state.studioSession.currentApproval);
  },
  showConversation() { switchTab('design'); requestAnimationFrame(() => { viewport?.fit(); viewer?.resize?.(); }); },
  async propose(prompt, { accessCode = '', local = false, latest = '' } = {}) {
    cancelStudioWork('operation-start');
    studioOperationContext = { model: state.model, program: structuredClone(state.program), idea: $('idea').value, applied: state.requestAppliedPrompt, briefContext: structuredClone(state.briefContext), discovery: structuredClone(state.discovery), selectedShape: state.selectedShape, plot: rawPlot(), palette: state.palette, clientDesires: structuredClone(state.clientDesires), manualEdits: state.manualEdits };
    $('idea').value = String(prompt || '');
    const mode = state.model ? 'modify' : 'replace';
    const modeInput = document.querySelector(`[name="requestMode"][value="${mode}"]`);
    if (modeInput) modeInput.checked = true;
    const operation = beginStudioOperation(state.studioSession, 'understand');
    studioOperationContext.fingerprint = requestFingerprint(requestInput()); studioOperationContext.stamp = studioInputStamp(); studioAbort = new AbortController();
    state.proposal = null; state.proposalFingerprint = null; state.requestProposal = null; studioProposalSource = null;
    markDirty();
    try {
      if (local) await understandRequest(operation);
      else { $('aiAccessCode').value = String(accessCode || ''); await askAI(operation); }
      assertStudioOperation(operation);
      const brief = local ? state.requestProposal : state.proposal;
      if (!brief) throw Error($(local ? 'requestFeedback' : 'aiFeedback').textContent || 'لم ينتج فهم صالح؛ بقي المخطط السابق كما هو.');
      const originalText = latest || state.studioSession.draftText || prompt;
      const diff = diffRoomPrograms(studioOperationContext.program, brief.rooms, originalText, { requireChange: !!state.model, initial: !state.model });
      const contract = verifyProposedProgram(prompt, brief.rooms);
      if (diff.blockers.length || !contract.pass) throw Error([...diff.blockers, ...contract.violations].join(' '));
      studioProposalSource = local ? 'local' : 'ai';
      studioPending = { operation, latest: originalText, prompt, brief: structuredClone(brief), fingerprint: requestFingerprint(requestInput()) };
      return { brief: { ...structuredClone(brief), unhandled: structuredClone(brief.unhandled || brief.limitations || []) }, context: structuredClone(state.briefContext), operationId: operation.id };
    } catch (error) {
      if (isCurrentStudioOperation(state.studioSession, operation)) cancelStudioWork('operation-failed');
      throw error;
    }
  },
  async drawProposal() {
    const pending = studioPending;
    if (!pending) throw Error('لا يوجد فهم جارٍ لاعتماده؛ أعد مراجعة الطلب.');
    assertStudioOperation(pending.operation);
    if (pending.fingerprint !== requestFingerprint(requestInput())) throw Error('تغيّر الطلب؛ أعد التحليل قبل الرسم.');
    const userMessage = [...state.studioSession.messages].reverse().find(m => m.role === 'user');
    acceptStudioUnderstanding(state.studioSession, { summary: pending.brief.summary, sourceMessageIds: userMessage ? [userMessage.id] : [], constraints: userMessage ? [{ text: pending.latest, sourceMessageId: userMessage.id }] : [], assumptions: pending.brief.assumptions || [], operationToken: pending.operation });
    const operation = beginStudioOperation(state.studioSession, 'draw');
    const context = studioOperationContext;
    // Program application is part of this transaction, not a concurrent edit.
    if (studioOperationContext) studioOperationContext.applying = true;
    let output;
    try {
      if (studioProposalSource === 'local') {
        const proposal = state.requestProposal; applyRequest();
        if (state.requestProposal === proposal) throw Error($('requestFeedback').textContent || 'لم يطبق الفهم.');
        output = await generate({ operation });
      } else output = await drawFromAIProposal({ operation });
      if (!output || output.operationId !== operation.id) throw Error($('generationError').textContent || ($('gen').disabled ? 'ما زالت عملية رسم سابقة قيد التنفيذ؛ انتظر قليلًا ثم اعتمد مجددًا.' : '') || $('aiFeedback').textContent || 'لم تثبت هذه العملية مخططًا؛ بقيت النسخة الحالية كما هي.');
      studioPending = null; studioProposalSource = null; studioAbort = null;
      return output;
    } catch (error) {
      if (isCurrentStudioOperation(state.studioSession, operation)) { studioOperationContext = context; cancelStudioWork('operation-failed'); }
      throw error;
    }
  },
  showAdvanced() { return !!state.model; },
});
Object.defineProperty(window, 'mizanStudioAPI', { value: mizanStudioAPI, configurable: false, writable: false });

boot();
