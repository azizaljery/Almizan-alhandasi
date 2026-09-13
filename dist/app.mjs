import { TYPES, POSITIONS, SIDES, DIRECTIONS, validatePlot, footprint, defaultRooms, normalizeRooms, generateModel, quantities } from './planner.mjs';
import { escapeXML as esc, PlanViewport } from './plan-view.mjs';
import { RoomViewer } from './viewer3d.mjs';
import { AI_ENABLED, requestBrief } from './assistant.mjs';
import { quantityRows, estimate } from './estimates.mjs';

const $ = id => document.getElementById(id), all = selector => [...document.querySelectorAll(selector)];
const number = id => $(id).valueAsNumber;
const fmt = (v, digits = 1) => v.toLocaleString('ar-SA', { maximumFractionDigits: digits });
const publicRooms = rooms => rooms.map(({ name, type, area, position, side }) => ({ name, type, area, position, side }));
const state = { streets: { n: false, s: true, e: false, w: false }, program: defaultRooms(), model: null, palette: 'resort', history: [], signature: '', selected: null, manualEdits: false, dirty: false, tab: 'rating', rates: {}, proposal: null };
let viewport, viewer, toastTimer, loading3D;
const rawPlot = () => ({ width: number('wid'), length: number('len'), floors: Number($('floors').value), streets: { ...state.streets }, entry: $('entry').value, streetSetback: number('streetSetback'), neighborSetback: number('neighborSetback'), coverage: number('coverage') / 100 });
const signature = (p, rooms) => JSON.stringify([p.width, p.length, p.floors, p.entry, p.streetSetback, p.neighborSetback, p.coverage, ...Object.keys(DIRECTIONS).map(k => p.streets[k]), publicRooms(rooms)]);
const options = (dict, selected) => Object.entries(dict).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(typeof label === 'string' ? label : label.name)}</option>`).join('');
function message(id, text) { $(id).textContent = text; $(id).hidden = !text; }
function toast(text) { message('toast', text); clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
function markDirty() {
  state.dirty = !!state.model && signature(rawPlot(), state.program) !== state.signature;
  all('.stale-message').forEach(el => { el.hidden = !state.dirty; });
  $('resultState').textContent = state.dirty ? 'آخر مخطط ناجح — يحتاج تحديثًا' : 'المخطط مطابق للجدول';
  $('resultState').classList.toggle('warn', state.dirty);
}
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
    $('ratingHelp').textContent = `المتاح داخل الافتراضات: ${fmt(f.area)} م². المؤشر متوسط أربعة عوامل مبسطة، وليس تقييمًا للشمس أو الخصوصية أو سعر الأرض.`;
    $('bars').innerHTML = metrics.map(r => `<div class="bar"><span>${r.name}</span><div class="track"><div class="fill" style="width:${r.value}%"></div></div><b>${fmt(r.value, 0)}</b></div>`).join('');
    message('plotError', '');
  } catch (error) {
    $('grade').textContent = '—'; $('grade').removeAttribute('data-g'); $('rt').textContent = 'راجع بيانات الأرض'; $('bars').replaceChildren(); $('ratingHelp').textContent = 'لا يمكن عرض مؤشر صالح بالمدخلات الحالية.'; message('plotError', error.message);
  }
}
function programTotal() {
  const sum = state.program.reduce((s, r) => s + (Number.isFinite(r.area) ? r.area : 0), 0);
  $('programTotal').textContent = `${fmt(state.program.length, 0)} فراغًا · ${fmt(sum)} م² صافي الغرف، قبل إضافة الجدران والممرات. التوليد من هذا الجدول فقط.`;
}
function renderRows() {
  $('roomRows').innerHTML = state.program.map((r, i) => `<tr data-row="${i}"><td><input data-field="name" aria-label="اسم الفراغ ${i + 1}" maxlength="70" value="${esc(r.name)}"></td><td><select data-field="type" aria-label="نوع الفراغ ${i + 1}">${options(TYPES, r.type)}</select></td><td><input data-field="area" aria-label="مساحة الفراغ ${i + 1}" type="number" min="4" max="120" step=".5" value="${Number.isFinite(r.area) ? r.area : ''}"></td><td><select data-field="position" aria-label="موقع الفراغ ${i + 1}">${options(POSITIONS, r.position)}</select></td><td><select data-field="side" aria-label="جانب الفراغ ${i + 1}">${options(SIDES, r.side)}</select></td><td><button class="remove-room" data-remove="${i}" aria-label="حذف ${esc(r.name)}">حذف</button></td></tr>`).join('');
  programTotal(); markDirty();
}
function selectRoom(id) {
  const r = state.model?.rooms.find(r => r.id === id); if (!r) return;
  state.selected = id; $('roomSelect').value = id; viewport?.select(id);
  $('roomInspector').innerHTML = `<div><b>${esc(r.name)}</b><p>${POSITIONS[r.position]} · ${SIDES[r.resolvedSide]}</p></div><div class="numbers"><span>${fmt(r.area)} م² صافي</span><span>${fmt(r.w, 2)} × ${fmt(r.h, 2)} م</span></div>`;
}
function on3DMode(mode, detail) {
  $('walkControls').hidden = mode !== 'inside'; $('roof').disabled = mode === 'inside';
  if (mode === 'inside') { $('roof').checked = false; $('viewMode').textContent = 'داخل ' + detail + ' · مستوى النظر 1.6 م'; }
  else $('viewMode').textContent = 'منظور ' + ({ top: 'علوي', front: 'أمامي', persp: 'خارجي' }[detail] || 'خارجي') + ' · تصور غير تنفيذي';
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
    viewer.setVisible(state.tab === 'design'); viewer.setModel(state.model, state.palette); $('roof').checked = false;
    return true;
  } catch (error) { message('threeError', error.message); $('retry3D').hidden = false; $('viewMode').textContent = '3D غير متاح حاليًا — يمكنك مراجعة 2D'; return false; }
}
function showResults() {
  const m = state.model; $('out').style.display = 'block';
  viewport = new PlanViewport($('plan'), m, selectRoom);
  $('roomSelect').innerHTML = m.rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join(''); selectRoom(m.rooms[0].id);
  $('modelWarnings').replaceChildren(...m.warnings.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  $('undo').disabled = !state.history.length; markDirty(); renderBOQ(); void show3D();
}
function solveLayout(plot, rooms) {
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => generateModel(plot, rooms));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./layout-worker.mjs', import.meta.url), { type: 'module' });
    const finish = (error, model) => { clearTimeout(timer); worker.terminate(); error ? reject(Error(error)) : resolve(model); };
    const timer = setTimeout(() => finish('استغرق البحث وقتًا أطول من المتاح؛ جرّب برنامجًا أقل أو حدّد جوانب الغرف لتقليل احتمالات التوزيع.'), 12000);
    worker.onmessage = event => finish(event.data.error, event.data.model);
    worker.onerror = () => finish('تعذّر تشغيل محرك التوزيع في المتصفح. أعد تحميل الصفحة ثم حاول مجددًا.');
    worker.postMessage({ plot, rooms });
  });
}
async function generate() {
  if ($('gen').disabled) return;
  const startSignature = signature(rawPlot(), state.program);
  $('gen').disabled = true; $('undo').disabled = true; $('gen').textContent = 'جارٍ توزيع الغرف والتحقّق من الوصول…';
  try {
    const plot = validatePlot(rawPlot()), rooms = normalizeRooms(state.program);
    const candidate = await solveLayout(plot, rooms);
    if (state.model) state.history = [...state.history, { model: state.model, palette: state.palette }].slice(-15);
    state.model = candidate; state.signature = signature(plot, rooms);
    if (signature(rawPlot(), state.program) === startSignature) { state.program = publicRooms(rooms); state.manualEdits = false; renderRows(); }
    message('generationError', ''); showResults();
    $('out').scrollIntoView({ behavior: 'smooth', block: 'start' }); toast('تولّد المخطط محليًا. راجع الغرف وملاحظات الحل.');
  } catch (error) { message('generationError', error.message + (state.model ? ' آخر مخطط ناجح محفوظ أدناه دون تغيير.' : '')); markDirty(); }
  finally { $('gen').disabled = false; $('undo').disabled = !state.history.length; $('gen').textContent = 'ولّد مخطط منزلي ✦'; }
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
  message('aiFeedback', '');
  if (AI_ENABLED && ($('idea').value.trim().length < 8 || $('idea').value.length > 4000)) { message('aiFeedback', 'اكتب وصفًا بين 8 و4000 حرف.'); return; }
  try {
    const result = await requestBrief({ prompt: $('idea').value, plot: rawPlot(), previous: { summary: 'برنامج الغرف الحالي للمراجعة', assumptions: [], questions: [], unhandled: [], rooms: publicRooms(state.program) } }, { signal: AbortSignal.timeout(45000) });
    state.proposal = result.brief; $('aiSummary').textContent = result.brief.summary;
    const notes = [...result.brief.assumptions.map(s => 'افتراض: ' + s), ...result.brief.questions.map(s => 'سؤال: ' + s), ...result.brief.unhandled.map(s => 'غير منفّذ: ' + s), ...result.limitations];
    $('aiNotes').replaceChildren(...notes.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    $('aiReview').hidden = false; $('acceptAI').disabled = !result.brief.rooms.length;
    message('aiFeedback', 'وصل اقتراح من خدمة الذكاء. لم يتغيّر المخطط؛ راجعه قبل نقل الغرف إلى الجدول.');
  } catch (error) { message('aiFeedback', error.message); }
}

function boot() {
  $('journey').inert = true; $('app').inert = true;
  $('enter').addEventListener('click', () => { $('intro').classList.add('off'); $('intro').inert = true; $('journey').inert = false; $('app').inert = false; document.querySelector('[data-go="rating"]').focus({ preventScroll: true }); });
  all('[data-go]').forEach(button => button.addEventListener('click', () => { $('journey').style.display = 'none'; $('app').classList.add('show'); switchTab(button.dataset.go); }));
  all('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  all('[data-next]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.next)));
  $('home').addEventListener('click', goHome); $('back').addEventListener('click', goHome);
  $('streets').addEventListener('click', e => { const b = e.target.closest('[data-side]'); if (!b) return; state.streets[b.dataset.side] = !state.streets[b.dataset.side]; renderStreets(); rating(); markDirty(); });
  ['len', 'wid', 'streetSetback', 'neighborSetback', 'coverage', 'entry', 'floors'].forEach(id => $(id).addEventListener('input', () => { rating(); markDirty(); }));
  $('roomRows').addEventListener('input', e => {
    const field = e.target.dataset.field, row = e.target.closest('[data-row]'); if (!field || !row) return;
    state.program[Number(row.dataset.row)][field] = field === 'area' ? e.target.valueAsNumber : e.target.value;
    state.manualEdits = true; programTotal(); markDirty();
  });
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
  $('gen').addEventListener('click', generate);
  $('undo').addEventListener('click', () => {
    if (!state.history.length) return;
    if (state.dirty && !window.confirm('سيتم استرجاع بيانات آخر توليد سابق بدل تعديلات الجدول الحالية. المتابعة؟')) return;
    const previous = state.history.pop(); state.model = previous.model; state.palette = previous.palette; state.program = publicRooms(previous.model.program); const p = previous.model.plot;
    state.streets = { ...p.streets }; renderStreets(); $('entry').value = p.entry;
    for (const [id, value] of Object.entries({ len: p.length, wid: p.width, floors: p.floors, streetSetback: p.streetSetback, neighborSetback: p.neighborSetback, coverage: p.coverage * 100 })) $(id).value = value;
    all('#styles [data-v]').forEach(button => { const on = button.dataset.v === state.palette; button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); });
    state.signature = signature(p, state.program); state.manualEdits = false; renderRows(); rating(); message('generationError', ''); showResults(); toast('تم استرجاع التوليد السابق ومتطلباته.');
  });
  $('zoomIn').addEventListener('click', () => viewport?.zoom(.8)); $('zoomOut').addEventListener('click', () => viewport?.zoom(1.25));
  $('fitPlan').addEventListener('click', () => viewport?.fit()); $('fitPlot').addEventListener('click', () => viewport?.fit(true));
  $('roomSelect').addEventListener('change', () => selectRoom($('roomSelect').value));
  $('focusRoom').addEventListener('click', () => { viewport?.focus(state.selected); $('plan').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('enterRoom').addEventListener('click', async () => { if (!viewer && !await show3D()) return; viewer.enter(state.selected); $('view').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  all('[data-view]').forEach(b => b.addEventListener('click', () => viewer?.view(b.dataset.view)));
  all('[data-move]').forEach(b => b.addEventListener('click', () => viewer?.move(b.dataset.move)));
  $('roof').addEventListener('change', () => viewer?.setRoof($('roof').checked)); $('retry3D').addEventListener('click', () => { void show3D(true); });
  $('mat').addEventListener('input', e => { if (!e.target.dataset.rate) return; state.rates[e.target.dataset.rate] = e.target.value === '' ? '' : e.target.valueAsNumber; updateCosts(); });
  ['costReserve', 'vat'].forEach(id => $(id).addEventListener('input', updateCosts));
  $('askAI').addEventListener('click', askAI);
  $('acceptAI').addEventListener('click', () => { if (!state.proposal?.rooms.length) return; if (!window.confirm('نقل اقتراح الذكاء إلى جدول المراجعة بدل القائمة الحالية؟ لن يتغيّر الرسم حتى تضغط «ولّد».')) return; state.program = publicRooms(state.proposal.rooms); state.manualEdits = true; renderRows(); $('aiReview').hidden = true; });
  window.addEventListener('pagehide', () => viewer?.setVisible(false)); window.addEventListener('pageshow', () => viewer?.setVisible(state.tab === 'design' && $('app').classList.contains('show')));
  renderStreets(); rating(); renderRows(); renderBOQ();
}
boot();
