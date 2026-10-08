import { buildClientBrief, applyBriefChoices } from './client-brief.mjs';
import { TYPES, POSITIONS, SIDES, DIRECTIONS, STRATEGIES, CONCEPT_PROFILES, validatePlot, footprint, defaultRooms, normalizeRooms, generateAlternatives, quantities, placeOpening, removeOpening } from './planner.mjs';
import { escapeXML as esc, PlanViewport, buildPlanSVG } from './plan-view.mjs';
import { RoomViewer } from './viewer3d.mjs';
import { AI_ENABLED, requestBrief, getAssistantStatus } from './assistant.mjs';
import { quantityRows, estimate } from './estimates.mjs';
import { reviewPlan } from './audit.mjs';
import { requestLocalBrief } from './local-nlp.mjs';
import { applySunOrientation, describeSunOrientation } from './sun-orientation.mjs';
import { circulationNetwork } from './circulation.mjs';
import { encodeProject, decodeProject, MAX_PROJECT_BYTES, quantitiesCSV } from './project.mjs';
import { designInsights } from './design-insights.mjs';
import { monthName, solarPreview } from './solar-path.mjs';
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

const $ = id => document.getElementById(id), all = selector => [...document.querySelectorAll(selector)];
const number = id => $(id).valueAsNumber;
const fmt = (v, digits = 1) => v.toLocaleString('ar-SA', { maximumFractionDigits: digits });
const publicRooms = rooms => rooms.map(({ name, type, area, position, side, dimensions }) => ({ name, type, area, position, side, ...(dimensions ? { dimensions: { ...dimensions } } : {}) }));
const assessedText = (value, digits = 0) => value === null || value === undefined ? 'غير مُقيّم' : fmt(value, digits);
const state = { streets: { n: false, s: true, e: false, w: false }, program: defaultRooms(), model: null, alternatives: [], failures: [], palette: 'resort', selectedShape: null, history: [], landSurvey: null, modelLandSurvey: null, signature: '', engineeringSignature: '', engineering: null, gemini: null, multiEngine: null, selected: null, manualEdits: false, dirty: false, tab: 'brief', studioMode: '2d', rates: {}, proposal: null, proposalFingerprint: null, requestProposal: null, requestAppliedPrompt: '', clientDesires: [], briefContext: null, aiDesign: null, tour: [], tourIndex: -1, editor: { open: false, tool: 'select' }, discovery: { likes: [], rejects: [], avoids: [], life: {} } };
let viewport, viewer, toastTimer, loading3D, circulation, clientBrief;
const exploration = { signature: '', previous: [], seed: 1 };
const rawPlot = () => ({ width: number('wid'), length: number('len'), floors: Number($('floors').value), streets: { ...state.streets }, entry: $('entry').value, streetSetback: number('streetSetback'), neighborSetback: number('neighborSetback'), coverage: number('coverage') / 100, maxBuiltArea: $('maxBuiltArea').value === '' ? null : number('maxBuiltArea') });
const signature = (p, rooms) => JSON.stringify([p.width, p.length, p.floors, p.entry, p.streetSetback, p.neighborSetback, p.coverage, p.maxBuiltArea ?? null, ...Object.keys(DIRECTIONS).map(k => p.streets[k]), publicRooms(rooms)]);
const workspaceSignature = (p, rooms, survey = state.landSurvey) => JSON.stringify([signature(p, rooms), surveyFingerprint(survey)]);
const historyEntry = (model, palette) => ({ model, palette, ...(state.modelLandSurvey ? { landSurvey: structuredClone(state.modelLandSurvey) } : {}) });
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
  state.dirty = !!state.model && (workspaceSignature(rawPlot(), state.program) !== state.signature || state.engineeringSignature !== engineeringSignature());
  all('.stale-message').forEach(el => { el.hidden = !state.dirty; });
  $('resultState').textContent = state.dirty ? 'آخر مخطط ناجح — يحتاج تحديثًا' : 'المخطط مطابق للجدول';
  $('resultState').classList.toggle('warn', state.dirty);
  $('exportPlan').disabled = !state.model || state.dirty;
  $('exportBOQ').disabled = !state.model || state.dirty;
  all('[data-alternative]').forEach(button => { button.disabled = state.dirty || $('gen').disabled; });
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
  if (state.requestProposal) $('applyRequest').disabled = state.requestProposal.fingerprint !== requestFingerprint(requestInput()) || !state.requestProposal.rooms.length || !!state.requestProposal.questions.length;
  const proposalCurrent = !!state.proposal?.rooms.length && state.proposalFingerprint === requestFingerprint(requestInput()) && !state.proposal.questions.length;
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
  for (const label of state.discovery.avoids) desires.push({label,detail:'رغبة محفوظة؛ تحتاج معيارًا واضحًا ومراجعة من المخطط قبل اعتبارها متحققة.'});
  const rows = auditClientRequest({ model: state.model, rooms: state.program, discovery: state.discovery, desired: desires });
  $('requestMatch').innerHTML = rows.map(row => `<div class="match-row"><b>${esc(row.label)}</b><p>${esc(row.detail)}</p><span class="pill match-state ${row.state}">${{ met: 'تحقق في المخطط', unmet: 'لم يتحقق', pending: 'غير مُقيّم', information: 'للمراجعة' }[row.state]}</span></div>`).join('');
}
async function understandRequest() {
  if ($('askLocal').disabled) return;
  $('askLocal').disabled = true; $('askLocal').textContent = 'جارٍ قراءة طلبك…'; message('requestFeedback', '');
  try {
    const input = requestInput(), result = await analyzeClientRequest(input);
    if (result.fingerprint !== requestFingerprint(requestInput())) throw Error('تغيّر الطلب أثناء القراءة؛ أعد التحليل من وصفك الحالي.');
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
  } catch (error) { message('requestFeedback', error.message); }
  finally { $('askLocal').disabled = false; $('askLocal').textContent = 'افهم طلبي'; }
}
function applyRequest() {
  const result = state.requestProposal; if (!result) return;
  if (result.fingerprint !== requestFingerprint(requestInput())) return message('requestFeedback', 'تغيّرت المدخلات بعد القراءة؛ اضغط «افهم طلبي» مرة أخرى.');
  if (result.questions.length || !result.rooms.length) return;
  try {
    const plot = validatePlot({ ...rawPlot(), ...result.plotPatch }); normalizeRooms(result.rooms);
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
  const enabled = Object.fromEntries(Object.entries(DIRECTIONS).filter(([s]) => state.streets[s]));
  $('entry').innerHTML = Object.keys(enabled).length ? options(enabled, selected) : '<option value="">فعّل جهة شارع أولًا</option>';
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
function renderSolarPreview() {
  try {
    const preview = solarPreview({ latitude: number('solarLatitude'), month: number('sunMonth'), hour: number('sunHour'), wallHeight: 3.2 });
    $('sunHourVal').textContent = `${String(Math.floor(number('sunHour'))).padStart(2, '0')}:${number('sunHour') % 1 ? '30' : '00'}`;
    $('sunMonthVal').textContent = monthName(number('sunMonth'));
    $('sunInfo').innerHTML = preview.visible
      ? `ارتفاع الشمس: <b>${fmt(preview.altitude)}°</b> · سمتها من الشمال: <b>${fmt(preview.azimuth)}°</b> · ظل جدار ٣٫٢م: <b>${fmt(preview.shadowLength)} م</b>`
      : 'الشمس تحت الأفق في هذه المعاينة؛ لا يظهر ظل شمسي مباشر.';
    viewport?.showSolar(preview, $('showShadow')?.checked); viewer?.setSun?.(preview);
  } catch (error) { $('sunInfo').textContent = error.message; }
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
  const index = state.program.findIndex(r => r.id === room.id); if (index < 0) return;
  const program = state.program[index]; form.hidden = !state.editor.open; $('roomEditTitle').textContent = `الغرفة: ${program.name}`; $('roomEditName').value = program.name; $('roomEditArea').value = program.area; $('roomEditArea').disabled = !!program.dimensions; $('roomEditWidth').value = program.dimensions?.width ?? ''; $('roomEditLength').value = program.dimensions?.length ?? ''; $('roomEditPosition').innerHTML = options(POSITIONS, program.position); $('roomEditSide').innerHTML = options(SIDES, program.side); form.dataset.roomIndex = index;
}
function drawRoute() {
  const path = circulation?.toRoom(state.selected);
  viewport?.showRoute($('showRoute').checked ? path?.points || [] : []);
  $('routeInfo').textContent = path ? `من المدخل إلى باب الغرفة عبر محاور الممرات: ${fmt(path.metres)} م. المسار لا يثبت استقلال الحركة أو صلاحية الإخلاء.` : 'لا يوجد مسار ممر موثق لهذه الغرفة.';
}
function on3DMode(mode, detail) {
  $('walkControls').hidden = mode !== 'inside'; $('roof').disabled = mode === 'inside';
  if (mode === 'inside') { $('roof').checked = false; $('viewMode').textContent = 'داخل ' + detail + ' · مستوى النظر 1.6 م · اسحب للنظر وتحرك عبر الأبواب'; }
  else { $('roof').checked = viewer?.roof?.visible || false; $('viewMode').textContent = 'منظور ' + ({ top: 'علوي', front: 'أمامي', persp: 'خارجي' }[detail] || 'خارجي') + ' · تصور غير تنفيذي'; }
  $('tourState').textContent = mode === 'inside' ? `داخل ${detail}` : 'منظور عام';
  all('[data-view]').forEach(button => { button.classList.toggle('on', mode === 'orbit' && button.dataset.view === detail); button.setAttribute('aria-pressed', String(mode === 'orbit' && button.dataset.view === detail)); });
}
async function loadThree(retry = false) {
  if (globalThis.THREE) return;
  if (loading3D) return loading3D;
  const existing = document.querySelector('script[src*="three.min.js"]');
  const create = retry || !existing;
  loading3D = new Promise((resolve, reject) => {
    const script = create ? document.createElement('script') : existing;
    const cleanup = () => { clearTimeout(timer); script.removeEventListener('load', success); script.removeEventListener('error', failure); };
    const success = () => { cleanup(); globalThis.THREE ? resolve() : reject(Error('تعذّر تهيئة مكتبة 3D.')); };
    const failure = () => { cleanup(); reject(Error('تعذّر تحميل مكتبة 3D. تحقّق من الاتصال ثم أعد المحاولة. مخطط 2D متاح.')); };
    const timer = setTimeout(failure, 8000);
    script.addEventListener('load', success, { once: true }); script.addEventListener('error', failure, { once: true });
    if (create) { script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js'; script.async = true; document.head.append(script); }
  });
  try { await loading3D; } finally { loading3D = null; }
}
async function show3D(retry = false) {
  if (!state.model) return false;
  try {
    message('threeError', ''); $('retry3D').hidden = true;
    await loadThree(retry);
    if (!viewer) viewer = new RoomViewer($('view'), on3DMode);
    viewer.setVisible(state.tab === 'result' && state.studioMode === '3d'); viewer.setModel(state.model, state.palette); viewer.setSun(solarPreview({ latitude: number('solarLatitude'), month: number('sunMonth'), hour: number('sunHour'), wallHeight: 3.2 })); $('roof').checked = false;
    return true;
  } catch (error) { message('threeError', error.message); $('retry3D').hidden = false; $('viewMode').textContent = '3D غير متاح حاليًا — يمكنك مراجعة 2D'; return false; }
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
  if (!['2d', '3d'].includes(mode)) return;
  state.studioMode = mode;
  $('studioPlanCard').hidden = mode !== '2d'; $('studio3dCard').hidden = mode !== '3d';
  all('[data-studio-mode]').forEach(button => {
    const on = button.dataset.studioMode === mode; button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on));
  });
  if (mode === '3d' && state.model) void show3D();
  else viewer?.setVisible(false);
  requestAnimationFrame(() => { if (mode === '2d') viewport?.fit(); else viewer?.resize?.(); });
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
    showResults();
    toast(action.tool === 'erase' ? 'حُذفت الفتحة المحددة.' : action.tool === 'door' ? 'أُضيف الباب إلى المخطط.' : 'أُضيفت النافذة إلى المخطط.');
  } catch (error) { toast(error.message); }
}
function showResults() {
  const m = state.model; $('out').style.display = 'block';
  renderStudioModelSummary();
  refreshEngineering();
  refreshGemini();
  circulation = circulationNetwork(m);
  viewport = new PlanViewport($('plan'), m, selectRoom); syncPlanEditor();
  $('roomSelect').innerHTML = m.rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join(''); selectRoom(m.rooms[0].id);
  $('modelWarnings').replaceChildren(...m.warnings.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  state.tour = prepareTour(); state.tourIndex = -1; $('tourPrev').disabled = true; $('tourNext').disabled = state.tour.length < 2; $('tourState').textContent = 'منظور عام';
  $('undo').disabled = !state.history.length; markDirty(); renderBOQ(); renderPlanReview(); renderGeminiReview(); renderAlternatives(); renderSolarPreview(); void show3D();
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
  $('alternativeCards').innerHTML = state.alternatives.map((model, index) => {
    const q = quantities(model), review = reviewPlan(model), selected = model === state.model;
    const concept = model.architecture || CONCEPT_PROFILES[model.strategy || 'compact'];
    const title = model.strategy === 'claude-rect' ? 'توزيع متوازن' : STRATEGIES[model.strategy || 'compact'];
    const tag = concept.tag === 'Claude 2.2.1' ? 'مسقط مستطيل' : concept.tag;
    const evaluation = state.engineering?.rows?.[index]?.evaluation;
    const engineering = evaluation ? `قرار الميزان ${assessedText(evaluation.score)} من ١٠٠ جزئي · ${fmt(evaluation.blockers.length, 0)} عوائق.` : '';
    return `<article role="listitem" class="alternative-card${selected ? ' selected' : ''}"><button class="alternative-pick" data-alternative="${index}" aria-pressed="${selected}" aria-label="${selected ? 'التخطيط المعروض' : 'اعرض'} ${esc(title)}"><span class="alternative-preview">${conceptThumbnail(model)}</span><span class="alternative-copy"><strong>${esc(title)}</strong><small>${esc(tag)}</small></span></button><details class="alternative-details"><summary aria-label="تفاصيل البديل">تفاصيل</summary><div><p>${esc(title)} · ${esc(concept.form)}. ${esc(concept.idea)}</p><p>الممرات ${fmt(q.circulation)} م² · غير موزّع ${fmt(q.reserve)} م² · فراغات بلا نافذة خارجية ${fmt(review.occupiedWithoutWindows, 0)}.</p><p>${esc(engineering)}</p><p><b>يناسب:</b> ${esc(concept.bestFor)} · <b>المقايضة:</b> ${esc(concept.tradeoff)}</p></div></details></article>`;
  }).join('');
  $('alternativesCount').textContent = `${fmt(state.alternatives.length, 0)} بدائل هندسية · التحديد يحدّث المسقط و3D والكميات`;
  const failed = state.failures.map(f => `${f.strategy === 'claude-rect' ? 'توزيع متوازن' : STRATEGIES[f.strategy] || 'أحد البدائل'}: ${f.reason}`).join(' ');
  $('alternativeNote').textContent = `${state.alternatives.length} بدائل مختلفة هندسيًا من البرنامج نفسه؛ تختلف نسب الكتلة، توزيع الغرف، الحركة، ومعالجة الكتلة في 3D. تُستبعد النسخ المتطابقة والحلول غير الصالحة. ${failed}`;
  markDirty();
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
}
function runPlanner(request) {
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => request.integrated ? runMultiEngineDesign(request) : request.projectText !== undefined ? { project: decodeProject(request.projectText) } : generateAlternatives(request.plot, request.rooms, { includeClaude: true }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./layout-worker.mjs', import.meta.url), { type: 'module' });
    const finish = (error, result) => { clearTimeout(timer); worker.terminate(); error ? reject(Error(error)) : resolve(result); };
    const timer = setTimeout(() => finish('استغرق البحث وقتًا أطول من المتاح؛ جرّب برنامجًا أقل أو حدّد جوانب الغرف لتقليل احتمالات التوزيع.'), 25000);
    worker.onmessage = event => finish(event.data.error, event.data);
    worker.onerror = () => finish('تعذّر تشغيل محرك التوزيع في المتصفح. أعد تحميل الصفحة ثم حاول مجددًا.');
    worker.postMessage(request);
  });
}
async function generate() {
  if ($('gen').disabled) return;
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
  const result = await runPlanner({ integrated: true, plot, rooms, idea: $('idea').value, discovery: structuredClone(state.discovery), briefContext: structuredClone(state.briefContext), selectedShape: state.selectedShape, seed: ++exploration.seed, previous });
    if (workspaceSignature(rawPlot(), state.program) !== startSignature || engineeringSignature() !== startEngineeringSignature) throw Error('تغيّرت اختياراتك أثناء التوليد؛ بقي المخطط السابق محفوظًا. أعد التوليد من المدخلات الحالية.');
    exploration.previous = [...exploration.previous, ...result.models].slice(-60);
    if (state.model) state.history = [...state.history, historyEntry(state.model, state.palette)].slice(-5);
    state.alternatives = result.models; state.failures = result.failures; state.multiEngine = { decision: result.decision, aziz: result.aziz, reviews: result.reviews, requestId: result.request.requestId };
    state.model = result.selectedModel; state.modelLandSurvey = state.landSurvey ? structuredClone(state.landSurvey) : null; state.signature = workspaceSignature(plot, rooms, state.modelLandSurvey); state.program = publicRooms(rooms); state.manualEdits = false; renderRows();
    message('generationError', ''); showResults(); switchTab('result');
    $('out').scrollIntoView({ behavior: 'smooth', block: 'start' }); toast(`وجدنا ${fmt(result.models.length, 0)} بدائل مختلفة مع الحفاظ على برنامجك ومساحاتك.`);
  } catch (error) { message('generationError', error.message + (state.model ? ' آخر مخطط ناجح محفوظ دون تغيير.' : '')); markDirty(); }
  finally { $('gen').disabled = false; $('freshIdeas').disabled = false; $('undo').disabled = !state.history.length; $('gen').textContent = 'ولّد وقارن حتى ستة بدائل'; markDirty(); }
}
function renderBOQ() {
  const m = state.model; $('boqEmpty').hidden = !!m; $('boqOutput').hidden = !m; if (!m) return;
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
  viewer?.setVisible(tab === 'result' && state.studioMode === '3d' && !!state.model); markDirty();
  if (tab === 'result') { requestAnimationFrame(() => { viewport?.fit(); viewer?.resize?.(); }); }
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function goHome() { switchTab('rating'); }
async function askAI() {
  if ($('askAI').disabled) return;
  message('aiFeedback', '');
  if (AI_ENABLED && ($('idea').value.trim().length < 8 || $('idea').value.length > 4000)) { message('aiFeedback', 'اكتب وصفًا بين 8 و4000 حرف.'); return; }
  state.proposal = null; state.proposalFingerprint = null; $('aiReview').hidden = true;
  const sourceFingerprint = requestFingerprint(requestInput());
  $('askAI').disabled = true; $('askLocal').disabled = true; $('askAI').textContent = 'جارٍ فهم المتطلبات وتجهيز الرسم…';
  try {
    const request = requestInput();
    const localConstraints = await requestLocalBrief({ prompt: request.prompt, previous: { rooms: request.mode === 'modify' ? request.rooms : [] } });
    if (request.rooms.some(r => r.type === 'office' || r.dimensions) || localConstraints.rooms.some(r => r.type === 'office' || r.dimensions)) throw Error('الخدمة المتصلة الحالية لا تحفظ الأبعاد الملزمة أو نوع المكتب. استخدم «افهم طلبي محليًا»؛ لن نعتمد اقتراحًا لا يثبت هذه القيود.');
    const discovery = discoveryText();
    const clientContext = clientBrief ? [`مبادئ التخطيط المستخلصة: ${clientBrief.principles.join('، ') || 'لم تحدد بعد.'}`, `أسئلة تحتاج إجابة: ${clientBrief.questions.join('، ') || 'لا توجد.'}`, `حدود يجب التصريح بها: ${clientBrief.limits.join('، ') || 'لا توجد.'}`].join('\n') : '';
    const engineeringContext = buildEngineeringPromptContext({ plot: rawPlot(), rooms: state.program, discovery: state.discovery, idea: $('idea').value, model: state.model });
    const engineText = `سياق محرك القرار الهندسي المنظم (مرجع تحليلي، لا تتجاهل عدم اليقين): ${JSON.stringify(engineeringContext)}`;
    const prompt = [clientContext, discovery, engineText, $('idea').value.trim()].filter(Boolean).join('\n\n');
    const context = buildClientContext({ plot: rawPlot(), discovery: state.discovery, rooms: state.program, prompt });
    const result = await requestBrief({ prompt, context, plot: rawPlot(), previous: { summary: 'برنامج الغرف الحالي للمراجعة. رتّب الأولويات واستخرج ما فهمته من العميل، واذكر التعارضات والأسئلة قبل اقتراح الغرف.', assumptions: [], questions: [], unhandled: [], rooms: publicRooms(state.program) } }, { accessCode: $('aiAccessCode').value, signal: AbortSignal.timeout(45000) });
    if (sourceFingerprint !== requestFingerprint(requestInput())) throw Error('تغيّرت المدخلات أثناء التحليل؛ لم يُطبق الرد القديم. أعد التحليل لطلبك الحالي.');
    showBrief(result.brief, result.limitations, context);
    $('aiStatus').textContent = 'نجح الاتصال والتحليل. راجع الاقتراح قبل نقله إلى الجدول.';
    $('aiBadge').textContent = 'متصل'; $('aiBadge').classList.remove('warn');
    message('aiFeedback', 'جهّز الذكاء برنامج التصميم. راجع الافتراضات ثم اختر «اعتمد وارسم المخططات».');
  } catch (error) { message('aiFeedback', error.message); }
  finally { $('askAI').disabled = false; $('askLocal').disabled = false; $('askAI').textContent = 'حلّل طلبي بالخدمة المتصلة'; }
}

function showBrief(brief, limitations = [], context = null) {
  const resolved = context || buildClientContext({ plot: rawPlot(), discovery: state.discovery, rooms: state.program, prompt: $('idea').value });
  state.proposal = brief; state.proposalFingerprint = requestFingerprint(requestInput()); state.aiDesign = { summary: brief.summary, source: 'ai' }; state.briefContext = deriveRequirements({ prompt: resolved.prompt, context: resolved, brief }); $('aiSummary').textContent = brief.summary;
  const profile = state.briefContext;
  if ($('aiReadiness')) $('aiReadiness').textContent = `${profile.readiness}%`;
  if ($('aiPriorities')) $('aiPriorities').textContent = profile.topPriorities.join(' · ') || 'لم تحدد بعد';
  if ($('aiRelationships')) $('aiRelationships').textContent = profile.relationships.map(r => `${r.from} ← ${r.to}`).join(' · ') || 'لا توجد علاقة كافية للحساب';
  if ($('aiConflicts')) $('aiConflicts').textContent = profile.conflicts.join(' · ') || 'لا تعارض ظاهر في هذه القراءة';
  const notes = [...brief.assumptions.map(s => 'افتراض: ' + s), ...brief.questions.map(s => 'سؤال: ' + s), ...brief.unhandled.map(s => 'غير منفّذ: ' + s), ...limitations];
  $('aiNotes').replaceChildren(...notes.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  $('aiReview').hidden = false; syncWorkspace();
}
async function drawFromAIProposal() {
  if (!state.proposal?.rooms.length || state.proposal.questions.length || state.proposalFingerprint !== requestFingerprint(requestInput())) return message('aiFeedback', 'الاقتراح قديم أو يحتاج إجابة؛ أعد التحليل قبل الاعتماد.');
  state.program = publicRooms(state.proposal.rooms); state.requestAppliedPrompt = $('idea').value; state.manualEdits = true; renderRows(); $('aiReview').hidden = true;
  toast('اعتمد برنامج الذكاء؛ جارٍ الآن رسم البدائل والتحقق منها هندسيًا.');
  await generate();
}
async function askLocal() {
  message('aiFeedback', '');
  try {
    const prompt = $('idea').value;
    const context = buildClientContext({ plot: rawPlot(), discovery: state.discovery, rooms: state.program, prompt });
    const brief = await requestLocalBrief({ prompt, previous: { rooms: publicRooms(state.program) } });
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
function saveProject() {
  if ($('gen').disabled) return toast('انتظر اكتمال العملية الجارية قبل الحفظ.');
  try {
    const text = encodeProject({ plot: rawPlot(), rooms: state.program, palette: state.palette, rates: state.rates, costReserve: number('costReserve'), vat: number('vat'), idea: $('idea').value, discovery: state.discovery, model: state.model, alternatives: state.alternatives, history: state.history, landSurvey: state.landSurvey, modelLandSurvey: state.modelLandSurvey });
    download(text, 'application/json;charset=utf-8', 'mizan-handasi-project.json');
    message('projectStatus', 'تم تجهيز ملف المشروع للتنزيل: المدخلات ورغبات المنزل وآخر مخطط والبدائل وآخر 5 نسخ والأسعار. احتفظ بالملف؛ لا يوجد حفظ سحابي أو تلقائي.');
  } catch (error) { message('projectStatus', error.message + ' صحّح المدخلات قبل الحفظ.'); }
}
async function importProject(file) {
  if (!file || $('gen').disabled) return;
  if (file.size > MAX_PROJECT_BYTES) return message('projectStatus', 'حجم الملف يتجاوز 2 ميغابايت. بقي العمل كما هو.');
  if (!window.confirm('سيستبدل الملف مدخلات الجلسة الحالية ومخططها وأسعارها. نزّل مشروعك الحالي أولًا إن احتجته. المتابعة؟')) return;
  const before = JSON.stringify([rawPlot(), state.program, state.palette, state.rates, $('costReserve').value, $('vat').value, $('idea').value, state.discovery, state.landSurvey]);
  $('gen').disabled = true; $('undo').disabled = true; markDirty();
  message('projectStatus', 'جارٍ فحص ملف المشروع وإعادة بناء نسخه قبل الاستيراد…');
  try {
    const { project } = await runPlanner({ projectText: await file.text() });
    if (JSON.stringify([rawPlot(), state.program, state.palette, state.rates, $('costReserve').value, $('vat').value, $('idea').value, state.discovery, state.landSurvey]) !== before) throw Error('تغيّرت المدخلات أثناء القراءة؛ أُلغي الاستيراد لحماية تعديلاتك.');
    state.discovery = project.discovery; renderDiscovery(); state.program = project.rooms; state.palette = project.palette; state.rates = project.rates; state.model = project.model; state.selectedShape = project.model?.shape || null; state.alternatives = project.alternatives; state.failures = []; state.history = project.history; state.landSurvey = project.landSurvey; state.modelLandSurvey = project.modelLandSurvey; state.proposal = null;
    state.signature = project.model ? workspaceSignature(project.model.plot, project.model.program, state.modelLandSurvey) : '';
    restorePlot(project.plot); syncPalette(); $('idea').value = project.idea; $('costReserve').value = project.costReserve; $('vat').value = project.vat;
    state.requestProposal = null; state.requestAppliedPrompt = project.idea; state.clientDesires = [];
    $('aiReview').hidden = true; message('generationError', ''); renderRows(); rating(); renderBOQ();
    if (state.model) showResults(); else { $('out').style.display = 'none'; viewer?.setVisible(false); }
    message('projectStatus', 'تم استيراد المشروع والتحقق من مخططاته وحدود المسح المحفوظة. لم يُستورد أو يُحفظ أي رمز دخول.');
  } catch (error) { message('projectStatus', error.message); }
  finally { $('gen').disabled = false; $('undo').disabled = !state.history.length; markDirty(); }
}
function exportResult(kind) {
  if (!state.model || state.dirty || $('gen').disabled) return toast('حدّث المخطط قبل تصدير الرسم أو الكميات.');
  try {
    if (kind === 'svg') download(buildPlanSVG(state.model), 'image/svg+xml;charset=utf-8', 'mizan-handasi-plan.svg');
    else download(quantitiesCSV(state.model, state.rates, number('costReserve'), number('vat')), 'text/csv;charset=utf-8', 'mizan-handasi-quantities.csv');
  } catch (error) { toast(error.message); }
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
  ['solarLatitude', 'sunMonth', 'sunHour'].forEach(id => $(id).addEventListener('input', renderSolarPreview));
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
    if (!button || state.dirty || $('gen').disabled) return;
    const model = state.alternatives[Number(button.dataset.alternative)];
    if (!model) return;
    state.selectedShape = model.shape;
    if (model === state.model) { state.engineeringSignature = engineeringSignature(); return; }
    state.history = [...state.history, historyEntry(state.model, state.palette)].slice(-5);
    state.model = model; state.modelLandSurvey = state.landSurvey ? structuredClone(state.landSurvey) : null; state.signature = workspaceSignature(rawPlot(), state.program, state.modelLandSurvey); showResults(); toast('تغيّر المخطط و3D والكميات إلى البديل المختار.');
  });
  $('undo').addEventListener('click', () => {
    if (!state.history.length) return;
    if (state.dirty && !window.confirm('سيتم استرجاع بيانات آخر توليد سابق بدل تعديلات الجدول الحالية. المتابعة؟')) return;
    const previous = state.history.pop(); state.model = previous.model; state.selectedShape = previous.model.shape || null; state.palette = previous.palette; state.program = publicRooms(previous.model.program); state.landSurvey = previous.landSurvey ? validateLandSurvey(previous.landSurvey) : null; state.modelLandSurvey = state.landSurvey ? structuredClone(state.landSurvey) : null; const p = previous.model.plot;
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
  $('roof').addEventListener('change', () => viewer?.setRoof($('roof').checked)); $('retry3D').addEventListener('click', () => { void show3D(true); });
  $('mat').addEventListener('input', e => { if (!e.target.dataset.rate) return; state.rates[e.target.dataset.rate] = e.target.value === '' ? '' : e.target.valueAsNumber; updateCosts(); });
  ['costReserve', 'vat'].forEach(id => $(id).addEventListener('input', updateCosts));
  $('askAI').addEventListener('click', askAI);
  $('askLocal').addEventListener('click', understandRequest); $('applySun').addEventListener('click', applySunToProgram);
  $('drawAI').addEventListener('click', drawFromAIProposal);
  $('acceptAI').addEventListener('click', () => { if (!state.proposal?.rooms.length || state.proposal.questions.length || state.proposalFingerprint !== requestFingerprint(requestInput())) return message('aiFeedback', 'الاقتراح قديم أو يحتاج إجابة؛ أعد التحليل قبل الاعتماد.'); state.program = publicRooms(state.proposal.rooms); state.requestAppliedPrompt = $('idea').value; state.manualEdits = true; renderRows(); $('aiReview').hidden = true; switchTab('design'); toast('حُفظ البرنامج في الجدول؛ راجعه قبل التوليد.'); });
  window.addEventListener('pagehide', () => viewer?.setVisible(false)); window.addEventListener('pageshow', () => viewer?.setVisible(state.tab === 'result' && $('app').classList.contains('show')));
  renderStreets(); rating(); renderRows(); renderBOQ(); renderDiscovery(); renderLandSurveySummary(); initVisualizer(() => state.model); switchTab('rating'); void refreshAssistantStatus();
}
boot();
