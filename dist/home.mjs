// واجهة الصفحة الرئيسية: استقبال ← الأرض ← شرعاء ← توليد ← المرسم. المنطق كله في home-flow.mjs.
import { loadThreeRuntime } from './three-runtime.mjs';
import { createArchitecturalScene } from './cinematic-entry.mjs';
import { createSession, saveSession } from './design-session.mjs';
import { normalizeLand, SharaSession, interpretFree, generateInitialDesign, diagnoseFit, friendlyBuildError, landPreviewSvg, SIDE_LABELS } from './home-flow.mjs';
import { writeHandoff } from './draw/handoff.mjs';
import { displayOr, landFieldErrors, hasLandErrors } from './field-guards.mjs';
import { requestBrief } from './assistant.mjs';

const $ = id => document.getElementById(id);
const home = $('home');
const stages = ['Welcome', 'Land', 'Shara', 'Build'];
function show(name) {
  for (const s of stages) $('stage' + s).hidden = s !== name;
  home.dataset.stage = name.toLowerCase();
  window.scrollTo({ top: 0 });
}
const setError = (el, text) => { el.textContent = text || ''; el.hidden = !text; };

// ------------------------------------------------------------------------------------------------ الاستقبال
let scene = null, frame = 0;
async function startScene() {
  const host = $('scene');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // الخلفية المتدرجة تكفي
  try {
    const T = await loadThreeRuntime();
    scene = createArchitecturalScene(T, host);
    const t0 = performance.now();
    const tick = now => {
      const elapsed = now - t0;
      scene.update(elapsed);
      // يدور المشهد ببطء ما دامت الصفحة الأولى ظاهرة (ويتوقف حين تُخفى الصفحة لتوفير الطاقة)
      if (home.dataset.stage === 'welcome' && scene) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    addEventListener('resize', () => { if (scene && home.dataset.stage === 'welcome') scene.update(6000); });
  } catch { /* بلا WebGL تبقى الخلفية المتدرجة والشعار */ }
}
function stopScene() { cancelAnimationFrame(frame); scene?.dispose(); scene = null; }
startScene();
// الافتتاحية (رسم الميزان ثم الاسم ثم النقاط) مرة في الجلسة، ويمكن تخطيها
(() => { const w = $('stageWelcome'), done = () => { w.classList.add('lx-done'); try { sessionStorage.setItem('mz-intro-seen', '1'); } catch {} };
  try { if (sessionStorage.getItem('mz-intro-seen')) w.classList.add('lx-done'); } catch {}
  $('lxSkip')?.addEventListener('click', done); setTimeout(() => { try { sessionStorage.setItem('mz-intro-seen', '1'); } catch {} }, 7000); })();
$('start').addEventListener('click', () => { stopScene(); show('Land'); $('landLength').focus(); });

// ------------------------------------------------------------------------------------------------ الأرض
const land = { streets: new Set(), entries: new Set() };
const grid = $('sideGrid');
for (const key of ['n', 's', 'e', 'w']) {
  const box = document.createElement('div'); box.className = 'side';
  box.innerHTML = `<b>${SIDE_LABELS[key]}</b>`
    + `<label class="tog"><input type="checkbox" data-kind="street" value="${key}"> شارع</label>`
    + `<label class="tog dis" data-entry-label="${key}"><input type="checkbox" data-kind="entry" value="${key}" disabled> مدخل</label>`;
  grid.append(box);
}
// أخطاء الحقول تظهر قرب كل حقل، وتُمسح عند تعديل أي حقل من الأرض
const FIELD_ERR = { length: 'errLength', width: 'errWidth', streets: 'errStreets', entries: 'errEntries' };
function showLandErrors(errors) {
  for (const [key, id] of Object.entries(FIELD_ERR)) { const el = $(id); el.textContent = errors[key] || ''; el.hidden = !errors[key]; }
  $('landLength').setAttribute('aria-invalid', String(Boolean(errors.length)));
  $('landWidth').setAttribute('aria-invalid', String(Boolean(errors.width)));
}
function clearLandErrors() { showLandErrors({}); }
function readLand() { return { length: $('landLength').valueAsNumber, width: $('landWidth').valueAsNumber, streets: [...land.streets], entries: [...land.entries], floors: Number($('landFloors').value) || 1 }; }
function refreshLand() {
  clearLandErrors();
  for (const key of ['n', 's', 'e', 'w']) {
    const entry = grid.querySelector(`input[data-kind=entry][value=${key}]`), onStreet = land.streets.has(key);
    entry.disabled = !onStreet; entry.closest('.tog').classList.toggle('dis', !onStreet);
    if (!onStreet) { entry.checked = false; land.entries.delete(key); }
  }
  $('landPreview').innerHTML = landPreviewSvg(readLand());
}
grid.addEventListener('change', e => {
  const input = e.target; if (!(input instanceof HTMLInputElement)) return;
  const set = input.dataset.kind === 'street' ? land.streets : land.entries;
  if (input.checked) set.add(input.value); else set.delete(input.value);
  refreshLand();
});
$('landLength').addEventListener('input', refreshLand); $('landWidth').addEventListener('input', refreshLand);
refreshLand();

let confirmedLand = null;
$('landForm').addEventListener('submit', e => {
  e.preventDefault();
  const raw = readLand(), fieldErrors = landFieldErrors(raw);
  setError($('landError'), '');
  showLandErrors(fieldErrors);
  if (hasLandErrors(fieldErrors)) { (fieldErrors.length ? $('landLength') : fieldErrors.width ? $('landWidth') : $('sideGrid').querySelector('input')).focus(); return; }
  try { const { land: ok } = normalizeLand(raw); confirmedLand = ok; setError($('landError'), ''); }
  catch (err) { setError($('landError'), err.message); return; }
  show('Shara'); beginChat();
});

// ------------------------------------------------------------------------------------------------ شرعاء
let session = null;
const chat = $('chat');
function bubble(text, who = 'shara') {
  const row = document.createElement('div'); row.className = 'row' + (who === 'me' ? ' me' : '');
  const av = document.createElement('div'); av.className = 'avatar'; av.textContent = 'ش'; av.setAttribute('aria-hidden', 'true');
  const b = document.createElement('div'); b.className = 'bubble'; b.textContent = text;
  if (who === 'me') row.append(b); else row.append(av, b);
  chat.append(row); return row;
}
const clearControls = () => chat.querySelectorAll('[data-control]').forEach(n => n.remove());
function control(node) { node.dataset.control = ''; chat.append(node); node.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); return node; }
function fail(err) { setError($('chatError'), err.message || String(err)); }

function render(messages) {
  setError($('chatError'), '');
  for (const m of messages) {
    if (m.kind === 'program') { renderProgram(m); continue; }
    const row = bubble(m.text);
    if (m.kind === 'list') {
      const ul = document.createElement('ul'); ul.className = 'understood';
      for (const it of m.items || []) { const li = document.createElement('li'); li.textContent = it; ul.append(li); }
      row.querySelector('.bubble').append(ul);
      continue;
    }
    if (m.kind === 'note') { row.classList.add('note'); continue; }
    if (m.kind === 'ask') { renderAsk(m, row); continue; }
    if (m.kind === 'choice') {
      const wrap = document.createElement('div'); wrap.className = 'pick';
      for (const o of m.options) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o.label;
        b.addEventListener('click', () => { clearControls(); bubble(o.label, 'me'); step(m.id, o.id); });
        wrap.append(b);
      }
      control(wrap);
    } else if (m.kind === 'multi') {
      const wrap = document.createElement('div'); wrap.className = 'pick'; const chosen = new Set();
      for (const o of m.options) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o.label; b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => { const on = !chosen.has(o.id); on ? chosen.add(o.id) : chosen.delete(o.id); b.setAttribute('aria-pressed', String(on)); });
        wrap.append(b);
      }
      const go = document.createElement('button'); go.type = 'button'; go.className = 'cta'; go.textContent = 'متابعة';
      go.addEventListener('click', () => {
        const labels = m.options.filter(o => chosen.has(o.id)).map(o => o.label);
        clearControls(); bubble(labels.length ? labels.join('، ') : 'لا شيء محدد', 'me'); step(m.id, [...chosen]);
      });
      wrap.append(go); control(wrap);
    } else if (m.kind === 'counts') {
      // المسار القديم (أعداد مباشرة): الحقل الفارغ يبقى كما فُهم ولا يُرفض
      const form = document.createElement('form'); form.className = 'counts'; form.noValidate = true;
      for (const f of m.fields) {
        const l = document.createElement('label'); l.textContent = f.label;
        const i = document.createElement('input'); i.type = 'number'; i.inputMode = 'numeric'; i.min = f.min; i.max = f.max; i.step = 1; i.value = f.value ?? ''; i.name = f.id;
        l.append(i); form.append(l);
      }
      const go = document.createElement('button'); go.type = 'submit'; go.className = 'cta'; go.textContent = 'متابعة';
      form.append(go);
      form.addEventListener('submit', e => {
        e.preventDefault();
        const values = Object.fromEntries(m.fields.map(f => [f.id, form.elements[f.id].value === '' ? '' : form.elements[f.id].valueAsNumber]));
        const summary = m.fields.filter(f => values[f.id] !== '').map(f => `${f.label}: ${displayOr(values[f.id])}`).join('، ') || 'كما فهمتِ';
        try { const next = session.answer(m.id, values); clearControls(); bubble(summary, 'me'); render(next); } catch (err) { fail(err); }
      });
      control(form);
    } else if (m.kind === 'text') {
      renderFree(m);
    } else if (m.kind === 'generate') {
      const go = document.createElement('button'); go.type = 'button'; go.className = 'cta'; go.textContent = 'توليد التصميم';
      const wrap = document.createElement('div'); wrap.className = 'pick'; wrap.append(go);
      go.addEventListener('click', () => { clearControls(); build(); });
      const more = document.createElement('button'); more.type = 'button'; more.className = 'chip'; more.textContent = 'أضيف تفصيلًا بالكلام';
      more.addEventListener('click', () => { more.remove(); const form = renderFree({ id: 'more' }); form.scrollIntoView?.({ block: 'nearest' }); });
      wrap.append(more);
      control(wrap);
    }
  }
}

/** نموذج الحديث الحر (أول مرة، أو إضافة لاحقة «more»). الذكاء المتصل اختياري برمز دخول. */
function renderFree(m) {
  const form = document.createElement('form'); form.className = 'free';
  form.innerHTML = '<textarea aria-label="حدّثني عن بيتك" placeholder="مثال: عندنا 3 أولاد وبنتين وأمي تسكن معنا، أبغى مجلسين ومقلط وصالة ومطبخ مغلق وغرفة خادمة"></textarea>'
    + '<details><summary>رمز دخول الذكاء (اختياري)</summary><input type="password" autocomplete="off" aria-label="رمز دخول الذكاء" placeholder="بدونه أفهم كلامك محليًا بلا شبكة"></details>';
  const go = document.createElement('button'); go.type = 'submit'; go.className = 'cta'; go.textContent = 'إرسال'; form.append(go);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = form.querySelector('textarea').value.trim(), code = form.querySelector('input').value.trim();
    if (text.length < 3) return fail(Error('اكتب وصفًا قصيرًا على الأقل.'));
    go.disabled = true;
    try {
      let understood = null, note = '';
      if (code) {
        try { understood = await understandWithAI(text, code); }
        catch (err) { note = `تعذّر الذكاء المتصل (${err.message}) فاستخدمت الفهم المحلي.`; }
      }
      understood ||= await interpretFree(text);
      if (note) understood.assumptions = [note, ...understood.assumptions];
      clearControls(); bubble(text, 'me'); render(session.answer(m.id, understood));
    } catch (err) { go.disabled = false; fail(err); }
  });
  return control(form);
}

/** سؤال بسببه الهندسي: خيارات (مفردة أو متعددة) + كتابة حرة + تخطٍّ. */
function renderAsk(m, row) {
  const why = document.createElement('p'); why.className = 'why'; why.textContent = m.reason; row.querySelector('.bubble').append(why);
  const wrap = document.createElement('div'); wrap.className = 'pick ask'; wrap.dataset.ask = m.id; const chosen = new Set();
  const send = (picks, text) => {
    const labels = m.options.filter(o => picks.includes(o.id)).map(o => o.label); if (text) labels.push(text);
    clearControls(); bubble(labels.length ? labels.join('، ') : 'تخطَّيتُ السؤال', 'me');
    step(m.id, { picks, text });
  };
  for (const o of m.options || []) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o.label;
    if (m.multi) { b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => { const on = !chosen.has(o.id); on ? chosen.add(o.id) : chosen.delete(o.id); b.setAttribute('aria-pressed', String(on)); }); }
    else if (o.free) b.addEventListener('click', () => { input.focus(); input.placeholder = o.placeholder || input.placeholder; });
    else b.addEventListener('click', () => send([o.id], ''));
    wrap.append(b);
  }
  const line = document.createElement('div'); line.className = 'askline';
  const input = document.createElement('input'); input.type = 'text'; input.placeholder = m.placeholder || 'أو اكتب جوابك بحرية…'; input.setAttribute('aria-label', m.text);
  const go = document.createElement('button'); go.type = 'button'; go.className = 'cta'; go.textContent = m.multi ? 'متابعة' : 'إرسال';
  go.addEventListener('click', () => send([...chosen], input.value.trim()));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
  const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'chip ghost'; skip.textContent = 'تخطَّ';
  skip.addEventListener('click', () => { clearControls(); bubble('تخطَّيتُ السؤال', 'me'); step('skip', m.id); });
  line.append(input, go, skip); wrap.append(line);
  control(wrap);
}

/** جدول «البرنامج المعماري كما فهمته»: يُحدَّث في مكانه، قابل للتعديل (± وحذف وإضافة) وأعرافه قابلة للتعطيل. */
function renderProgram(m) {
  let panel = chat.querySelector('#program');
  if (!panel) { panel = el('section', 'program'); panel.id = 'program'; panel.setAttribute('aria-label', 'البرنامج المعماري كما فهمته'); chat.append(panel); }
  panel.replaceChildren();
  panel.append(el('h3', '', 'البرنامج المعماري كما فهمته'), el('p', 'hint', m.text));
  const wrap = el('div', 'tscroll'); const table = el('table', 'rtable ptable');
  row(table, ['الفراغ', 'العدد', 'الدور المقترح', 'المساحة', 'مصدر الفهم', 'ملاحظة', ''], true);
  for (const r of m.rows) {
    const num = el('span', 'num'); const dec = el('button', 'pm', '−'); dec.type = 'button'; dec.setAttribute('aria-label', `أنقص ${r.label}`); const inc = el('button', 'pm', '+'); inc.type = 'button'; inc.setAttribute('aria-label', `زد ${r.label}`);
    const val = el('b', '', displayOr(r.count)); val.dataset.count = r.id; num.append(dec, val, inc);
    dec.addEventListener('click', () => edit({ op: 'dec', id: r.id })); inc.addEventListener('click', () => edit({ op: 'inc', id: r.id }));
    const src = el('span', 'src src-' + r.source, r.sourceLabel);
    const del = el('button', 'pm del', '×'); del.type = 'button'; del.setAttribute('aria-label', `احذف ${r.label}`); del.addEventListener('click', () => edit({ op: 'remove', id: r.id }));
    const tr = row(table, [r.label, num, r.floorLabel, r.areaLabel, src, r.reason, del]); tr.dataset.row = r.id;
  }
  wrap.append(table); panel.append(wrap);
  // إضافة صف
  if (m.addable?.length) {
    const addLine = el('div', 'addline'); const sel = el('select'); sel.setAttribute('aria-label', 'فراغ لإضافته');
    for (const a of m.addable) { const o = el('option', '', a.label); o.value = a.id; sel.append(o); }
    const add = el('button', 'chip', 'أضف فراغًا'); add.type = 'button'; add.addEventListener('click', () => edit({ op: 'add', id: sel.value, count: 1 }));
    addLine.append(sel, add); panel.append(addLine);
  }
  const c = m.counts;
  panel.append(el('p', 'totals', `ما يستلمه المولّد: ${c.bedrooms} نوم، ${c.majlis} مجلس، ${c.halls} صالة، ${c.dining} طعام، ${c.kitchens} مطبخ، ${c.baths} دورة مياه. المجموع ≈ ${m.totals.area} م² للفراغات، ≈ ${m.totals.builtArea} م² مبنى. ${m.totals.note}`));
  if (m.customs?.length) {
    const d = el('details', 'customs'); d.append(el('summary', '', `الافتراضات العرفية المطبّقة (${m.customs.filter(x => x.on).length} من ${m.customs.length}) — عطّل ما لا يناسبك`));
    for (const cu of m.customs) {
      const l = el('label', 'custom'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = cu.on; cb.dataset.custom = cu.id;
      cb.addEventListener('change', () => { try { render(session.answer('custom', { id: cu.id, on: cb.checked })); } catch (err) { fail(err); } });
      l.append(cb, el('span', '', cu.label), el('small', '', cu.why)); d.append(l);
    }
    panel.append(d);
  }
  panel.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}
function edit(op) { try { render(session.answer('program', op)); } catch (err) { fail(err); } }
function step(id, value) { try { render(session.answer(id, value)); } catch (err) { fail(err); } }
function beginChat() {
  chat.replaceChildren(); session = new SharaSession({ land: confirmedLand }); render(session.start());
}

// الذكاء المتصل اختياري، ويحتاج رمز دخول الموقع. استدعاؤه الحي غير متحقق منه في هذا التسليم.
async function understandWithAI(text, accessCode) {
  const { plot } = normalizeLand(confirmedLand);
  const { brief } = await requestBrief({ prompt: text, plot, previous: { summary: 'ابدأ من برنامج فارغ، واستخرج ما ذكره العميل فقط.', rooms: [] } }, { accessCode });
  const tally = {}; for (const r of brief.rooms || []) tally[r.type] = (tally[r.type] || 0) + 1;
  const map = { bedrooms: 'bedroom', majlis: 'majlis', baths: 'bath', kitchens: 'kitchen', halls: 'living', dining: 'dining' };
  const counts = {}; for (const [k, t] of Object.entries(map)) if (tally[t] !== undefined) counts[k] = tally[t];
  try { sessionStorage.setItem('mizan.ai.code', accessCode); } catch { /* التخزين غير متاح */ }
  return { text, counts, requirements: brief.requirements || null, assumptions: [...(brief.requirements ? ['فهمتُ كلامك عبر Claude، وطابقته مع الفهم المحلي.'] : []), ...(brief.assumptions || [])], questions: [...(brief.questions || []), ...(brief.unhandled || [])] };
}

// ------------------------------------------------------------------------------------------------ التوليد والتسليم للمرسم
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const m1 = v => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toString() : '—');
function row(table, cells, head) { const tr = el('tr'); for (const c of cells) { const td = el(head ? 'th' : 'td'); if (c instanceof Node) td.append(c); else td.textContent = c; tr.append(td); } table.append(tr); return tr; }

function applyOption(o) {
  session.countOverrides = { ...o.counts }; session.counts = { ...o.counts }; if (session.requirements) session.requirements = { ...session.requirements, counts: { ...o.counts } }; confirmedLand = o.land;
  $('landLength').value = o.land.length; $('landWidth').value = o.land.width;
  land.entries = new Set(o.land.entries);
  grid.querySelectorAll('input[data-kind=entry]').forEach(i => { i.checked = land.entries.has(i.value); });
  refreshLand(); build();
}

function renderReport({ facts: f, options }, err) {
  const box = $('buildReport'); box.replaceChildren(); box.hidden = false;
  box.append(el('h3', '', 'لماذا تعذّر التوليد؟'));
  const facts = el('table', 'rtable');
  row(facts, ['البند', 'القيمة'], true);
  row(facts, ['الأرض', `${m1(f.plotWidth)}×${m1(f.plotLength)} م = ${m1(f.plotArea)} م²`]);
  row(facts, ['الارتدادات (م)', Object.entries(f.setbacks).map(([k, v]) => `${SIDE_LABELS[k]} ${m1(v)}`).join('، ')]);
  row(facts, ['الصافي بعد الارتدادات', `${m1(f.afterSetbacks.width)}×${m1(f.afterSetbacks.depth)} م = ${m1(f.afterSetbacks.area)} م²`]);
  row(facts, ['سقف نسبة البناء', `${m1(f.coverage * 100)}% = ${m1(f.coverageCap)} م²`]);
  row(facts, ['المساحة المبنية المتاحة', `${m1(f.net.area)} م² (للدور الواحد)`]);
  for (const fl of f.floorsFacts || []) row(facts, [fl.label, `${fl.rooms} فراغ + السلم = ${m1(fl.required)} م² من ${m1(fl.available)} م² متاحة للدور، قبل الجدران والممرات`]);
  row(facts, ['مساحة الغرف وحدها', `${m1(f.required)} م² = ${m1(f.share * 100)}% من المتاح${f.floors > 1 ? ` في ${f.floors} أدوار` : ''}، قبل الجدران والممرات`]);
  box.append(facts);
  const prog = el('table', 'rtable');
  row(prog, ['الفراغ', 'العدد', 'مساحة الواحد', 'المجموع'], true);
  for (const t of f.perType) row(prog, [t.label, displayOr(t.count), `${m1(t.unit)} م²`, `${m1(t.total)} م²`]);
  box.append(el('h3', '', 'برنامجك المطلوب'), prog);

  box.append(el('h3', '', 'خيارات جرّبتُها على المحرك فعلًا'));
  const opts = el('table', 'rtable');
  row(opts, ['التعديل', 'النتيجة', ''], true);
  for (const o of options) {
    const act = el('button', 'cta ghost', 'طبّق هذا الخيار'); act.type = 'button'; act.addEventListener('click', () => applyOption(o));
    row(opts, [o.label, o.ok ? 'ينجح' : 'لا ينجح وحده', o.ok ? act : '']);
  }
  box.append(opts);
  box.append(el('p', 'hint', 'هذه نتائج تجارب على المحرك وليست تفسيرًا: المحرك لا يحدد غرفة بعينها هي السبب. لم أغيّر شيئًا من برنامجك؛ القرار لك، ولا يُطبَّق أي خيار إلا بضغطك. التوليد الحالي دور واحد فقط.'));
  if (!options.some(o => o.ok)) box.append(el('p', 'hint', 'لا يكفي أي تعديل بسيط واحد. يمكنك الجمع بين تعديلين بالرجوع إلى شرعاء، أو تكبير الأرض.'));
  console.warn('تفاصيل فشل التوليد:', err);
}

async function build() {
  show('Build'); setError($('buildError'), ''); $('buildRetry').hidden = true; $('buildReport').hidden = true; $('buildText').textContent = 'يبحث المحرك بين البدائل ويختار الأنسب لقيودك…';
  const input = { land: confirmedLand, rooms: session.rooms(), discovery: session.discovery(), idea: session.idea, counts: session.counts, requirements: session.requirements };
  try {
    const out = await generateInitialDesign(input);
    // التصميم الأولي يُعرض على العميل أولًا (اعتماد / تصميم آخر / تعديل في المرسم)
    const ds = createSession({ land: confirmedLand, counts: session.counts, requirements: session.requirements, discovery: input.discovery, idea: input.idea, result: out });
    if (!saveSession(localStorage, ds)) { writeHandoff(sessionStorage, out.doc, { source: 'home-shara', note: out.notes.join(' '), dna: out.dna, alternatives: out.alternatives }); location.href = './studio.html'; return; }
    $('buildText').textContent = 'جاهز. أعرض عليك التصميم…';
    location.href = './design.html';
  } catch (err) {
    setError($('buildError'), friendlyBuildError(err)); $('buildRetry').hidden = false;
    $('buildText').textContent = 'أحلّل الصعوبات وأجرّب الخيارات على المحرك…';
    try { renderReport(await diagnoseFit({ land: confirmedLand, counts: session.counts, discovery: input.discovery, idea: input.idea }), err); $('buildText').textContent = ''; }
    catch (e2) { $('buildText').textContent = 'تعذّر التحليل التفصيلي.'; console.warn(e2); }
  }
}
$('buildRetry').addEventListener('click', () => show('Shara'));
