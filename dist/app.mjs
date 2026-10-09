import { buildClientBrief, applyBriefChoices } from './client-brief.mjs';
import { TYPES, POSITIONS, SIDES, DIRECTIONS, STRATEGIES, CONCEPT_PROFILES, validatePlot, footprint, defaultRooms, normalizeRooms, generateAlternatives, quantities, placeOpening, removeOpening } from './planner.mjs';
import { escapeXML as esc, PlanViewport, buildPlanSVG } from './plan-view.mjs';
import { RoomViewer } from './viewer3d.mjs';
import { loadThreeRuntime } from './three-runtime.mjs';
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
import { siteOverviewHTML, studioCardsHTML, planPreviewURL, studioMetrics } from './studio-preview.mjs';
import { analyzeGeminiEngineering } from './gemini-engineering-layer.mjs';
import { runMultiEngineDesign } from './multi-engine.mjs';

const $ = id => document.getElementById(id), all = selector => [...document.querySelectorAll(selector)];
const number = id => $(id).valueAsNumber;
const fmt = (v, digits = 1) => v.toLocaleString('ar-SA', { maximumFractionDigits: digits });
const publicRooms = rooms => rooms.map(({ name, type, area, position, side }) => ({ name, type, area, position, side }));
const state = { streets: { n: false, s: true, e: false, w: false }, program: defaultRooms(), model: null, alternatives: [], failures: [], palette: 'resort', history: [], signature: '', engineeringSignature: '', engineering: null, gemini: null, multiEngine: null, selected: null, manualEdits: false, dirty: false, tab: 'rating', rates: {}, proposal: null, briefContext: null, aiDesign: null, tour: [], tourIndex: -1, editor: { open: false, tool: 'select' }, discovery: { likes: [], rejects: [], avoids: [], life: {} } };
let viewport, viewer, toastTimer, loading3D, circulation, clientBrief;
const rawPlot = () => ({ width: number('wid'), length: number('len'), floors: Number($('floors').value), streets: { ...state.streets }, entry: $('entry').value, streetSetback: number('streetSetback'), neighborSetback: number('neighborSetback'), coverage: number('coverage') / 100, maxBuiltArea: $('maxBuiltArea').value === '' ? null : number('maxBuiltArea') });
const signature = (p, rooms) => JSON.stringify([p.width, p.length, p.floors, p.entry, p.streetSetback, p.neighborSetback, p.coverage, p.maxBuiltArea ?? null, ...Object.keys(DIRECTIONS).map(k => p.streets[k]), publicRooms(rooms)]);
const options = (dict, selected) => Object.entries(dict).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(typeof label === 'string' ? label : label.name)}</option>`).join('');
function message(id, text) { $(id).textContent = text; $(id).hidden = !text; }
function toast(text) { message('toast', text); clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
function discoveryText() {
  const d = state.discovery, parts = [];
  const examples = { courtyard_privacy: 'بيت الفناء الخاص', family_layout: 'جناحان على شكل L', concept_comparison: 'بيت الباحة U', classic_living: 'أجنحة مرتبطة برواق' };
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
  all('#tasteDeck .taste-card').forEach(card => { const style = card.dataset.style; card.classList.toggle('liked', d.likes.includes(style)); card.classList.toggle('rejected', d.rejects.includes(style)); });
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
  state.dirty = !!state.model && (signature(rawPlot(), state.program) !== state.signature || state.engineeringSignature !== engineeringSignature());
  all('.stale-message').forEach(el => { el.hidden = !state.dirty; });
  $('resultState').textContent = state.dirty ? 'آخر مخطط ناجح — يحتاج تحديثًا' : 'المخطط مطابق للجدول';
  $('resultState').classList.toggle('warn', state.dirty);
  $('exportPlan').disabled = !state.model || state.dirty;
  $('exportBOQ').disabled = !state.model || state.dirty;
  all('[data-alternative]').forEach(button => { button.disabled = state.dirty || $('gen').disabled; });
}
function engineeringSignature() { return JSON.stringify([state.discovery, $('idea')?.value || '']); }
function renderStreets() {
  const selected = $('entry').value || 's';
  $('streets').innerHTML = Object.entries(DIRECTIONS).map(([side, name]) => `<button class="street ${state.streets[side] ? 'on' : ''}" data-side="${side}" aria-pressed="${state.streets[side]}"><i class="dot"></i><b>${name}</b><small>${state.streets[side] ? 'شارع مفعّل' : 'جهة جار'}</small></button>`).join('');
  const enabled = Object.fromEntries(Object.entries(DIRECTIONS).filter(([s]) => state.streets[s]));
  $('entry').innerHTML = Object.keys(enabled).length ? options(enabled, selected) : '<option value="">فعّل جهة شارع أولًا</option>';
}
function renderSiteOverview() {
  const target = $('studioSiteOverview');
  if (!target) return;
  try { target.innerHTML = siteOverviewHTML(rawPlot(), state.program); }
  catch (error) { target.textContent = 'أكمل أبعاد الأرض واتجاه المدخل لتظهر حدود البناء الحقيقية. ' + error.message; }
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
  renderSiteOverview();
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
  renderSiteOverview();
}
function renderRows() {
  $('roomRows').innerHTML = state.program.map((r, i) => `<tr data-row="${i}"><td><input data-field="name" aria-label="اسم الفراغ ${i + 1}" maxlength="70" value="${esc(r.name)}"></td><td><select data-field="type" aria-label="نوع الفراغ ${i + 1}">${options(TYPES, r.type)}</select></td><td><input data-field="area" aria-label="مساحة الفراغ ${i + 1}" type="number" min="4" max="120" step=".5" value="${Number.isFinite(r.area) ? r.area : ''}"></td><td><select data-field="position" aria-label="موقع الفراغ ${i + 1}">${options(POSITIONS, r.position)}</select></td><td><select data-field="side" aria-label="جانب الفراغ ${i + 1}">${options(SIDES, r.side)}</select></td><td><button class="remove-room" data-remove="${i}" aria-label="حذف ${esc(r.name)}">حذف</button></td></tr>`).join('');
  programTotal(); markDirty(); renderClientBrief();
}
function selectRoom(id) {
  const r = state.model?.rooms.find(r => r.id === id); if (!r) return;
  state.selected = id; $('roomSelect').value = id; viewport?.select(id);
  const marker = state.gemini?.review?.markers?.find(item => item.id === id);
  const geminiNote = marker ? `<p class="gemini-room-note"><b>Gemini:</b> ${marker.count} ملاحظة ${marker.severity === 'critical' ? 'حرجة' : marker.severity === 'major' ? 'مهمة' : 'استرشادية'} مرتبطة بهذا الفراغ.</p>` : '';
  $('roomInspector').innerHTML = `<div><b>${esc(r.name)}</b><p>${POSITIONS[r.position]} · ${SIDES[r.resolvedSide]}</p></div><div class="numbers"><span>${fmt(r.area)} م² صافي</span><span>${fmt(r.w, 2)} × ${fmt(r.h, 2)} م</span></div>${geminiNote}`;
  syncRoomEditor(r);
  drawRoute();
}
function syncRoomEditor(room = state.model?.rooms.find(r => r.id === state.selected)) {
  const form = $('roomEditForm'); if (!form || !room) return;
  const index = state.program.findIndex(r => r.id === room.id); if (index < 0) return;
  const program = state.program[index]; form.hidden = !state.editor.open; $('roomEditTitle').textContent = `الغرفة: ${program.name}`; $('roomEditName').value = program.name; $('roomEditArea').value = program.area; $('roomEditPosition').innerHTML = options(POSITIONS, program.position); $('roomEditSide').innerHTML = options(SIDES, program.side); form.dataset.roomIndex = index;
}
function drawRoute() {
  const path = circulation?.toRoom(state.selected);
  viewport?.showRoute($('showRoute').checked ? path?.points || [] : []);
  $('routeInfo').textContent = path ? `من المدخل إلى باب الغرفة عبر محاور الممرات: ${fmt(path.metres)} م. المسار لا يثبت استقلال الحركة أو صلاحية الإخلاء.` : 'لا يوجد مسار ممر موثق لهذه الغرفة.';
}
function on3DMode(mode, detail) {
  $('walkControls').hidden = mode !== 'inside'; $('roof').disabled = mode === 'inside';
  if (mode === 'inside') { $('roof').checked = false; $('viewMode').textContent = 'داخل ' + detail + ' · مستوى النظر 1.6 م · اسحب للنظر وتحرك عبر الأبواب'; }
  else $('viewMode').textContent = 'منظور ' + ({ top: 'علوي', front: 'أمامي', persp: 'خارجي' }[detail] || 'خارجي') + ' · تصور غير تنفيذي';
  $('tourState').textContent = mode === 'inside' ? `داخل ${detail}` : 'منظور عام';
  all('[data-view]').forEach(button => { button.classList.toggle('on', mode === 'orbit' && button.dataset.view === detail); button.setAttribute('aria-pressed', String(mode === 'orbit' && button.dataset.view === detail)); });
}
async function loadThree(retry = false) {
  if (globalThis.THREE?.WebGLRenderer) return;
  if (loading3D) return loading3D;
  loading3D = loadThreeRuntime({ retry });
  try { await loading3D; } finally { loading3D = null; }
}
async function show3D(retry = false) {
  if (!state.model) return false;
  try {
    message('threeError', ''); $('retry3D').hidden = true;
    await loadThree(retry);
    if (!viewer) viewer = new RoomViewer($('view'), on3DMode);
    viewer.setVisible(state.tab === 'design'); viewer.setModel(state.model, state.palette); viewer.setSun(solarPreview({ latitude: number('solarLatitude'), month: number('sunMonth'), hour: number('sunHour'), wallHeight: 3.2 })); $('roof').checked = false;
    return true;
  } catch (error) { message('threeError', error.message); $('retry3D').hidden = false; $('viewMode').textContent = '3D غير متاح حاليًا — يمكنك مراجعة 2D'; return false; }
}
function prepareTour() {
  if (!state.model) return [];
  const priorities = ['majlis', 'living', 'dining', 'kitchen', 'bedroom'];
  const rooms = state.model.rooms;
  const external = state.model.openings.find(o => o.type === 'door' && o.connects?.includes('outside'));
  const first = external?.roomId ? rooms.find(room => room.id === external.roomId) : null;
  const ordered = [...rooms].sort((a, b) => priorities.indexOf(a.type) - priorities.indexOf(b.type) || a.y - b.y || a.x - b.x);
  return [...new Map([first, ...ordered].filter(Boolean).map(room => [room.id, room])).values()];
}
async function showTourRoom(index, { scroll = false } = {}) {
  const room = state.tour[index]; if (!room) return;
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
function editPlanAtPoint(action) {
  if (!state.model) return;
  if (action.tool === 'select') { if (action.room) selectRoom(action.room); return; }
  try {
    const before = state.model;
    const next = action.tool === 'erase' ? removeOpening(before, action.point) : placeOpening(before, { type: action.tool, point: action.point });
    state.history = [...state.history, { model: before, palette: state.palette }].slice(-5);
    state.model = next;
    const index = state.alternatives.indexOf(before); if (index >= 0) state.alternatives[index] = next;
    state.signature = signature(rawPlot(), state.program); state.engineeringSignature = engineeringSignature();
    showResults();
    toast(action.tool === 'erase' ? 'حُذفت الفتحة المحددة.' : action.tool === 'door' ? 'أُضيف الباب إلى المخطط.' : 'أُضيفت النافذة إلى المخطط.');
  } catch (error) { toast(error.message); }
}
function showResults() {
  const m = state.model; $('out').style.display = 'block';
  refreshEngineering();
  refreshGemini();
  circulation = circulationNetwork(m);
  viewport = new PlanViewport($('plan'), m, selectRoom); syncPlanEditor();
  $('roomSelect').innerHTML = m.rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join(''); selectRoom(m.rooms[0].id);
  $('modelWarnings').replaceChildren(...m.warnings.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  state.tour = prepareTour(); state.tourIndex = -1; $('tourPrev').disabled = true; $('tourNext').disabled = state.tour.length < 2; $('tourState').textContent = 'منظور عام';
  $('undo').disabled = !state.history.length; markDirty(); renderBOQ(); renderPlanReview(); renderGeminiReview(); renderAlternatives(); renderSolarPreview(); void show3D();
}
function refreshGemini() {
  if (!state.model) { state.gemini = null; return; }
  try { state.gemini = { review: analyzeGeminiEngineering(state.model), error: null }; }
  catch (error) { state.gemini = { review: null, error: error instanceof Error ? error.message : 'تعذّرت مراجعة Gemini.' }; }
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
    $('geminiSummary').textContent = result?.error || 'ولّد مخططًا صالحًا لبدء قراءة Gemini.';
    $('geminiMetrics').replaceChildren(); $('geminiPatterns').textContent = '—';
    $('geminiFindings').innerHTML = '<li>لا تتوفر نتائج قابلة للعرض.</li>';
    $('geminiCoverage').textContent = 'لم تبدأ المراجعة.';
    renderGeminiMarkers();
    return;
  }
  const review = result.review, metrics = review.coordination.summaryMetrics;
  const stateLabel = {
    COORDINATION_PASSED: 'قراءة أولية نظيفة',
    PASSED_WITH_ADVISORIES: 'ملاحظات استرشادية',
    CHANGES_REQUIRED: 'تعديلات مقترحة',
    CRITICAL_BLOCKERS_FOUND: 'عوائق تحتاج مراجعة'
  }[review.coordination.status] || 'مراجعة أولية';
  $('geminiState').textContent = stateLabel;
  $('geminiState').dataset.state = review.coordination.status;
  $('geminiSummary').textContent = `${metrics.totalFindingsCount} ملاحظة · ${metrics.totalClashesCount} تعارض · ${fmt(review.math.areaUtilizationRatio * 100, 0)}٪ استفادة صافية من الكتلة.`;
  const metricCards = [
    ['فحص الفراغات', review.coordination.architecturalReview.evaluatedChecksCount, 'فحص هندسي معماري'],
    ['التعارضات', metrics.totalClashesCount, 'تقاطعات بين التخصصات المتاحة'],
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
  const unavailable = Object.entries(review.coverage).filter(([, value]) => value !== 'EVALUATED').map(([key]) => key);
  $('geminiCoverage').textContent = unavailable.length ? `المتاح في الرسم تم تقييمه. غير متاح بعد: ${unavailable.join('، ')}.` : 'اكتملت التغطية المتاحة من المخطط.';
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
function renderEngineeringReview() {
  const current = currentEngineeringEvaluation();
  if (!current) {
    $('engineeringScore').textContent = 'غير متاح';
    $('engineeringCards').replaceChildren();
    $('engineeringNotes').innerHTML = `<li>${esc(state.engineering?.error || 'ولّد مخططًا صالحًا أولًا لإجراء فحص محرك القرار.')}</li>`;
    $('engineeringLimit').textContent = 'الفحص المرفق لا يستبدل المراجعة الهندسية والكود وتقرير التربة والمخططات التنفيذية.';
    return;
  }
  $('engineeringScore').textContent = `${fmt(current.score, 0)} / ١٠٠`;
  const labels = { privacy: 'الخصوصية', spaceEfficiency: 'كفاءة المساحة', functionalAdjacency: 'العلاقات الوظيفية', circulation: 'الحركة', wasteControl: 'التحكم بالهدر', futureExpansion: 'المرونة المستقبلية' };
  $('engineeringCards').innerHTML = Object.entries(labels).map(([key, label]) => `<div class="insight"><div><span>${label}</span><b>${fmt(current.metrics[key] ?? 0, 0)}</b></div><p>مؤشر مبدئي من ١٠٠، مرتبط بالبرنامج والرغبات الحالية.</p></div>`).join('');
  const notes = [...current.explanations, ...current.blockers.map(blocker => `عائق: ${blocker.message}`)];
  $('engineeringNotes').innerHTML = notes.length ? notes.map(note => `<li>${esc(note)}</li>`).join('') : '<li>لم يرصد المحرك ملاحظة إضافية في البيانات الحالية.</li>';
  $('engineeringLimit').textContent = 'هذه قراءة قرارية مبدئية من محرك الميزان؛ لا تُعد تصميمًا إنشائيًا أو اعتمادًا نظاميًا.';
}
function renderAlternatives() {
  const evaluations = state.engineering?.rows?.map(row => row.evaluation) || [];
  $('alternativeCards').innerHTML = studioCardsHTML(state.alternatives, state.model, STRATEGIES, evaluations);
  const failed = state.failures.map(f => (STRATEGIES[f.strategy] || f.strategy) + ': ' + f.reason).join(' ');
  $('alternativeNote').textContent = state.alternatives.length + ' مساقط من النموذج الهندسي نفسه. اختيار AZIZ مستقل عن أعلى نتيجة حسابية في Mizan Score؛ راجع الحركة والخصوصية والتنبيهات قبل الاعتماد. ' + failed;
  markDirty();
}
function openStudioPreview(index) {
  const model = state.alternatives[index];
  if (!model) return;
  const metrics = studioMetrics(model);
  $('studioPreviewTitle').textContent = (STRATEGIES[model.strategy] || model.architecture?.tag || 'بديل معماري') + (state.dirty ? ' — من آخر توليد ناجح' : '');
  $('studioPreviewImage').src = planPreviewURL(model);
  $('studioPreviewMeta').innerHTML = '<div><span>Mizan Score</span><strong>' + fmt(metrics.score, 0) + ' / 1000</strong></div>' +
    '<div><span>صافي الغرف</span><strong>' + fmt(metrics.rooms) + ' م²</strong></div>' +
    '<div><span>الممرات</span><strong>' + fmt(metrics.circulation) + ' م²</strong></div>' +
    '<div><span>الغرف دون نافذة خارجية</span><strong>' + fmt(metrics.windowless, 0) + '</strong></div>' +
    '<div><span>التنبيهات</span><strong>' + fmt(metrics.warnings, 0) + '</strong></div>';
  $('studioPreviewDialog').showModal();
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
  $('insightScore').textContent = `${fmt(insights.overall, 0)} / ١٠٠`;
  $('insightCards').innerHTML = insights.cards.map(card => `<div class="insight"><div><span>${esc(card.label)}</span><b>${fmt(card.score, 0)}</b></div><p>${esc(card.detail)}</p></div>`).join('');
  $('insightLimit').textContent = insights.note;
  renderMizanScore();
  renderEngineeringReview();
}
function renderMizanScore() {
  const output = $('mizanScoreOutput');
  if (!output) return;
  const result = calculateMizanScore(state.model);
  if (!result) { output.innerHTML = '<p class="help">ولّد مخططًا صالحًا لعرض Mizan Score.</p>'; return; }
  $('mizanScoreValue').textContent = `${fmt(result.score, 0)} / ١٠٠٠`;
  $('mizanScoreGrade').textContent = `${result.grade} · ثقة الحساب ${result.confidence}%`;
  $('mizanScoreAxes').innerHTML = result.axes.map(axis => `<div class="insight"><div><span>${esc(axis.label)} <small>(${axis.weight}٪)</small></span><b>${fmt(axis.score, 0)}</b></div><p>${esc(axis.detail)}</p></div>`).join('');
  $('mizanScoreNotes').innerHTML = `<li>نقاط القوة: ${esc(result.strengths.join('، ') || 'لا توجد نقاط مرتفعة كافية بعد.')}</li><li>نقاط التحسين: ${esc(result.improvements.join('، ') || 'لا توجد محاور منخفضة في هذا الفحص.')}</li><li>عقوبة التنبيهات: ${fmt(result.penalties, 0)} نقطة.</li>`;
  $('mizanScoreLimit').textContent = result.note;
}
function runPlanner(request) {
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => request.projectText !== undefined ? { project: decodeProject(request.projectText) } : generateAlternatives(request.plot, request.rooms, { includeClaude: true }));
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
  const startSignature = signature(rawPlot(), state.program);
  $('gen').disabled = true; $('undo').disabled = true; $('gen').textContent = 'جارٍ توزيع الغرف والتحقّق من الوصول…';
  try {
    const plot = validatePlot(rawPlot()), rooms = normalizeRooms(state.program);
    const result = await runMultiEngineDesign({ plot, rooms, idea: $('idea')?.value || '', discovery: state.discovery, briefContext: state.briefContext });
    if (state.model) state.history = [...state.history, { model: state.model, palette: state.palette }].slice(-5);
    state.alternatives = result.models; state.failures = result.failures; state.multiEngine = { decision: result.decision, aziz: result.aziz, reviews: result.reviews, requestId: result.request.requestId };
    state.model = result.selectedModel; state.signature = signature(plot, rooms);
    if (signature(rawPlot(), state.program) === startSignature) { state.program = publicRooms(rooms); state.manualEdits = false; renderRows(); }
    message('generationError', ''); showResults();
    $('out').scrollIntoView({ behavior: 'smooth', block: 'start' }); toast('تولّدت البدائل عبر Claude، وراجعتها Gemini، واختار AZIZ البديل التخطيطي الأولي.');
  } catch (error) { message('generationError', error.message + (state.model ? ' آخر مخطط ناجح محفوظ أدناه دون تغيير.' : '')); markDirty(); }
  finally { $('gen').disabled = false; $('undo').disabled = !state.history.length; $('gen').textContent = 'ولّد وقارن البدائل ✦'; markDirty(); }
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
  if (!['rating', 'design', 'boq'].includes(tab)) return;
  state.tab = tab;
  all('.tab').forEach(button => { const on = button.dataset.tab === tab; button.classList.toggle('on', on); if (on) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); });
  all('.panel').forEach(panel => panel.classList.toggle('on', panel.id === 'panel-' + tab));
  if (tab === 'rating') rating(); if (tab === 'boq') renderBOQ();
  viewer?.setVisible(tab === 'design' && !!state.model); markDirty();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function goHome() { $('app').classList.remove('show'); $('journey').style.display = 'grid'; viewer?.setVisible(false); window.scrollTo({ top: 0, behavior: 'auto' }); }
async function askAI() {
  if ($('askAI').disabled) return;
  message('aiFeedback', '');
  if (AI_ENABLED && ($('idea').value.trim().length < 8 || $('idea').value.length > 4000)) { message('aiFeedback', 'اكتب وصفًا بين 8 و4000 حرف.'); return; }
  state.proposal = null; $('aiReview').hidden = true;
  $('askAI').disabled = true; $('askLocal').disabled = true; $('askAI').textContent = 'جارٍ فهم المتطلبات وتجهيز الرسم…';
  try {
    const discovery = discoveryText();
    const clientContext = clientBrief ? [`مبادئ التخطيط المستخلصة: ${clientBrief.principles.join('، ') || 'لم تحدد بعد.'}`, `أسئلة تحتاج إجابة: ${clientBrief.questions.join('، ') || 'لا توجد.'}`, `حدود يجب التصريح بها: ${clientBrief.limits.join('، ') || 'لا توجد.'}`].join('\n') : '';
    const engineeringContext = buildEngineeringPromptContext({ plot: rawPlot(), rooms: state.program, discovery: state.discovery, idea: $('idea').value, model: state.model });
    const engineText = `سياق محرك القرار الهندسي المنظم (مرجع تحليلي، لا تتجاهل عدم اليقين): ${JSON.stringify(engineeringContext)}`;
    const prompt = [clientContext, discovery, engineText, $('idea').value.trim()].filter(Boolean).join('\n\n');
    const context = buildClientContext({ plot: rawPlot(), discovery: state.discovery, rooms: state.program, prompt });
    const result = await requestBrief({ prompt, context, plot: rawPlot(), previous: { summary: 'برنامج الغرف الحالي للمراجعة. رتّب الأولويات واستخرج ما فهمته من العميل، واذكر التعارضات والأسئلة قبل اقتراح الغرف.', assumptions: [], questions: [], unhandled: [], rooms: publicRooms(state.program) } }, { accessCode: $('aiAccessCode').value, signal: AbortSignal.timeout(45000) });
    showBrief(result.brief, result.limitations, context);
    $('aiStatus').textContent = 'نجح الاتصال والتحليل. راجع الاقتراح قبل نقله إلى الجدول.';
    $('aiBadge').textContent = 'متصل'; $('aiBadge').classList.remove('warn');
    message('aiFeedback', 'جهّز الذكاء برنامج التصميم. راجع الافتراضات ثم اختر «اعتمد وارسم المخططات».');
  } catch (error) { message('aiFeedback', error.message); }
  finally { $('askAI').disabled = false; $('askLocal').disabled = false; $('askAI').textContent = '✦ افهم وصف المنزل واقترح برنامجًا للرسم'; }
}

function showBrief(brief, limitations = [], context = null) {
  const resolved = context || buildClientContext({ plot: rawPlot(), discovery: state.discovery, rooms: state.program, prompt: $('idea').value });
  state.proposal = brief; state.aiDesign = { summary: brief.summary, source: 'ai' }; state.briefContext = deriveRequirements({ prompt: resolved.prompt, context: resolved, brief }); $('aiSummary').textContent = brief.summary;
  const profile = state.briefContext;
  if ($('aiReadiness')) $('aiReadiness').textContent = `${profile.readiness}%`;
  if ($('aiPriorities')) $('aiPriorities').textContent = profile.topPriorities.join(' · ') || 'لم تحدد بعد';
  if ($('aiRelationships')) $('aiRelationships').textContent = profile.relationships.map(r => `${r.from} ← ${r.to}`).join(' · ') || 'لا توجد علاقة كافية للحساب';
  if ($('aiConflicts')) $('aiConflicts').textContent = profile.conflicts.join(' · ') || 'لا تعارض ظاهر في هذه القراءة';
  const notes = [...brief.assumptions.map(s => 'افتراض: ' + s), ...brief.questions.map(s => 'سؤال: ' + s), ...brief.unhandled.map(s => 'غير منفّذ: ' + s), ...limitations];
  $('aiNotes').replaceChildren(...notes.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  $('aiReview').hidden = false; $('acceptAI').disabled = !brief.rooms.length; $('drawAI').disabled = !brief.rooms.length;
}
async function drawFromAIProposal() {
  if (!state.proposal?.rooms.length) return;
  state.program = publicRooms(state.proposal.rooms); state.manualEdits = true; renderRows(); $('aiReview').hidden = true;
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
    const text = encodeProject({ plot: rawPlot(), rooms: state.program, palette: state.palette, rates: state.rates, costReserve: number('costReserve'), vat: number('vat'), idea: $('idea').value, discovery: state.discovery, model: state.model, alternatives: state.alternatives, history: state.history });
    download(text, 'application/json;charset=utf-8', 'mizan-handasi-project.json');
    message('projectStatus', 'تم تجهيز ملف المشروع للتنزيل: المدخلات ورغبات المنزل وآخر مخطط والبدائل وآخر 5 نسخ والأسعار. احتفظ بالملف؛ لا يوجد حفظ سحابي أو تلقائي.');
  } catch (error) { message('projectStatus', error.message + ' صحّح المدخلات قبل الحفظ.'); }
}
async function importProject(file) {
  if (!file || $('gen').disabled) return;
  if (file.size > MAX_PROJECT_BYTES) return message('projectStatus', 'حجم الملف يتجاوز 2 ميغابايت. بقي العمل كما هو.');
  if (!window.confirm('سيستبدل الملف مدخلات الجلسة الحالية ومخططها وأسعارها. نزّل مشروعك الحالي أولًا إن احتجته. المتابعة؟')) return;
  const before = JSON.stringify([rawPlot(), state.program, state.palette, state.rates, $('costReserve').value, $('vat').value, $('idea').value, state.discovery]);
  $('gen').disabled = true; $('undo').disabled = true; markDirty();
  message('projectStatus', 'جارٍ فحص ملف المشروع وإعادة بناء نسخه قبل الاستيراد…');
  try {
    const { project } = await runPlanner({ projectText: await file.text() });
    if (JSON.stringify([rawPlot(), state.program, state.palette, state.rates, $('costReserve').value, $('vat').value, $('idea').value, state.discovery]) !== before) throw Error('تغيّرت المدخلات أثناء القراءة؛ أُلغي الاستيراد لحماية تعديلاتك.');
    state.discovery = project.discovery; renderDiscovery(); state.program = project.rooms; state.palette = project.palette; state.rates = project.rates; state.model = project.model; state.alternatives = project.alternatives; state.failures = []; state.history = project.history; state.proposal = null;
    state.signature = project.model ? signature(project.model.plot, project.model.program) : '';
    restorePlot(project.plot); syncPalette(); $('idea').value = project.idea; $('costReserve').value = project.costReserve; $('vat').value = project.vat;
    $('aiReview').hidden = true; message('generationError', ''); renderRows(); rating(); renderBOQ();
    if (state.model) showResults(); else { $('out').style.display = 'none'; viewer?.setVisible(false); }
    message('projectStatus', 'تم استيراد المشروع والتحقق من مخططاته. لم يُستورد أو يُحفظ أي رمز دخول.');
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
  $('journey').inert = true; $('app').inert = true;
  $('enter').addEventListener('click', () => { $('intro').classList.add('off'); $('intro').inert = true; $('journey').inert = false; $('app').inert = false; document.querySelector('[data-go="rating"]').focus({ preventScroll: true }); });
  all('[data-go]').forEach(button => button.addEventListener('click', () => { $('journey').style.display = 'none'; $('app').classList.add('show'); switchTab(button.dataset.go); }));
  all('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  all('[data-next]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.next)));
  $('clientChanges').addEventListener('change', () => { $('applyClientBrief').disabled = !all('#clientChanges [data-brief-room]:checked').length; });
  $('applyClientBrief').addEventListener('click', applyClientBrief);
  $('home').addEventListener('click', goHome); $('back').addEventListener('click', goHome);
  $('streets').addEventListener('click', e => { const b = e.target.closest('[data-side]'); if (!b) return; state.streets[b.dataset.side] = !state.streets[b.dataset.side]; renderStreets(); rating(); markDirty(); });
  ['len', 'wid', 'streetSetback', 'neighborSetback', 'coverage', 'maxBuiltArea', 'entry', 'floors'].forEach(id => $(id).addEventListener('input', () => { rating(); markDirty(); }));
  ['solarLatitude', 'sunMonth', 'sunHour'].forEach(id => $(id).addEventListener('input', renderSolarPreview));
  $('roomRows').addEventListener('input', e => {
    const field = e.target.dataset.field, row = e.target.closest('[data-row]'); if (!field || !row) return;
    state.program[Number(row.dataset.row)][field] = field === 'area' ? e.target.valueAsNumber : e.target.value;
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
    const target = action.dataset.taste === 'like' ? state.discovery.likes : state.discovery.rejects;
    const other = action.dataset.taste === 'like' ? state.discovery.rejects : state.discovery.likes;
    const index = target.indexOf(style); index >= 0 ? target.splice(index, 1) : target.push(style);
    const otherIndex = other.indexOf(style); if (otherIndex >= 0) other.splice(otherIndex, 1);
    if (action.dataset.taste === 'like') {
      const palette = { courtyard_privacy: 'resort', family_layout: 'modern', concept_comparison: 'classic', classic_living: 'classic' }[style];
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
  $('alternativeCards').addEventListener('click', event => {
    const preview = event.target.closest('[data-preview]');
    if (preview) { openStudioPreview(Number(preview.dataset.preview)); return; }
    const button = event.target.closest('[data-alternative]');
    if (!button || state.dirty || $('gen').disabled) return;
    const model = state.alternatives[Number(button.dataset.alternative)];
    if (!model || model === state.model) return;
    state.history = [...state.history, { model: state.model, palette: state.palette }].slice(-5);
    state.model = model; showResults(); toast('تغيّر المخطط و3D والكميات إلى البديل المختار.');
  });
  $('studioPreviewClose').addEventListener('click', () => $('studioPreviewDialog').close());
  $('undo').addEventListener('click', () => {
    if (!state.history.length) return;
    if (state.dirty && !window.confirm('سيتم استرجاع بيانات آخر توليد سابق بدل تعديلات الجدول الحالية. المتابعة؟')) return;
    const previous = state.history.pop(); state.model = previous.model; state.palette = previous.palette; state.program = publicRooms(previous.model.program); const p = previous.model.plot;
    restorePlot(p); syncPalette(); state.alternatives = [state.model]; state.failures = [];
    state.signature = signature(p, state.program); state.manualEdits = false; renderRows(); rating(); message('generationError', ''); showResults(); toast('تم استرجاع التوليد السابق ومتطلباته.');
  });
  $('zoomIn').addEventListener('click', () => viewport?.zoom(.8)); $('zoomOut').addEventListener('click', () => viewport?.zoom(1.25));
  $('fitPlan').addEventListener('click', () => viewport?.fit()); $('fitPlot').addEventListener('click', () => viewport?.fit(true));
  $('togglePlanEditor').addEventListener('click', () => { state.editor.open = !state.editor.open; syncPlanEditor(); });
  $('closePlanEditor').addEventListener('click', () => { state.editor.open = false; syncPlanEditor(); });
  $('planEditor').addEventListener('click', event => {
    const tool = event.target.closest('[data-plan-tool]'); if (!tool) return;
    state.editor.tool = tool.dataset.planTool; syncPlanEditor();
  });
  $('roomEditForm').addEventListener('submit', event => {
    event.preventDefault(); const index = Number(event.currentTarget.dataset.roomIndex); if (!Number.isInteger(index) || !state.program[index]) return;
    try {
      state.program[index] = { ...state.program[index], name: $('roomEditName').value.trim(), area: $('roomEditArea').valueAsNumber, position: $('roomEditPosition').value, side: $('roomEditSide').value }; normalizeRooms(state.program); state.manualEdits = true; renderRows(); markDirty(); toast('حُفظ تعديل الغرفة في البرنامج. اضغط «ولّد» لإعادة توزيعها هندسيًا دون تغيير المساحة.');
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
  $('enterRoom').addEventListener('click', async () => { if (!viewer && !await show3D()) return; viewer.enter(state.selected); $('view').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('startTour').addEventListener('click', startTour);
  $('tourPrev').addEventListener('click', () => { if (state.tourIndex > 0) void showTourRoom(state.tourIndex - 1); });
  $('tourNext').addEventListener('click', () => { if (state.tourIndex < state.tour.length - 1) void showTourRoom(state.tourIndex + 1); });
  all('[data-view]').forEach(b => b.addEventListener('click', () => viewer?.view(b.dataset.view)));
  all('[data-move]').forEach(b => b.addEventListener('click', () => viewer?.move(b.dataset.move)));
  $('roof').addEventListener('change', () => viewer?.setRoof($('roof').checked)); $('retry3D').addEventListener('click', () => { void show3D(true); });
  $('mat').addEventListener('input', e => { if (!e.target.dataset.rate) return; state.rates[e.target.dataset.rate] = e.target.value === '' ? '' : e.target.valueAsNumber; updateCosts(); });
  ['costReserve', 'vat'].forEach(id => $(id).addEventListener('input', updateCosts));
  $('askAI').addEventListener('click', askAI);
  $('askLocal').addEventListener('click', askLocal); $('applySun').addEventListener('click', applySunToProgram);
  $('drawAI').addEventListener('click', drawFromAIProposal);
  $('acceptAI').addEventListener('click', () => { if (!state.proposal?.rooms.length) return; state.program = publicRooms(state.proposal.rooms); state.manualEdits = true; renderRows(); $('aiReview').hidden = true; toast('حُفظ برنامج الذكاء في الجدول دون توليد الرسم بعد.'); });
  window.addEventListener('pagehide', () => viewer?.setVisible(false)); window.addEventListener('pageshow', () => viewer?.setVisible(state.tab === 'design' && $('app').classList.contains('show')));
  renderStreets(); rating(); renderRows(); renderBOQ(); renderDiscovery(); initVisualizer(() => state.model); void refreshAssistantStatus();
}
boot();
