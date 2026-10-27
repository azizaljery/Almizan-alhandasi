// واجهة الصفحة الرئيسية: استقبال ← الأرض ← شرعاء ← توليد ← المرسم. المنطق كله في home-flow.mjs.
import { loadThreeRuntime } from './three-runtime.mjs';
import { createArchitecturalScene } from './cinematic-entry.mjs';
import { createSession, saveSession } from './design-session.mjs';
import { normalizeLand, interpretFree, generateInitialDesign, diagnoseFit, friendlyBuildError, landPreviewSvg, SIDE_LABELS } from './home-flow.mjs';
import { writeHandoff } from './draw/handoff.mjs';
import { requestBrief, assistantOpen } from './assistant.mjs';
import { SharaFlow, landBar, liveProfile, READINESS_AR } from './sharaa/flow.mjs';
import { classifyOutcome, buildAlternatives, retryWith, OUTCOME } from './sharaa/alternatives.mjs';
import { supportLabel } from './sharaa/ui-text.mjs';

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
      if (elapsed < 5200 && home.dataset.stage === 'welcome') frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    addEventListener('resize', () => { if (scene && home.dataset.stage === 'welcome') scene.update(6000); });
  } catch { /* بلا WebGL تبقى الخلفية المتدرجة والشعار */ }
}
function stopScene() { cancelAnimationFrame(frame); scene?.dispose(); scene = null; }
startScene();
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
function readLand() { const sw = $('landStreetWidth')?.valueAsNumber; return { length: $('landLength').valueAsNumber, width: $('landWidth').valueAsNumber, streets: [...land.streets], entries: [...land.entries], floors: Number($('landFloors').value) || 1, ...(sw > 0 ? { streetWidth: sw } : {}) }; }
function refreshLand() {
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
  try { const { land: ok } = normalizeLand(readLand()); confirmedLand = ok; setError($('landError'), ''); }
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
    const row = bubble(m.text);
    if (m.kind === 'list') {
      const ul = document.createElement('ul'); ul.className = 'understood';
      for (const it of m.items || []) { const li = document.createElement('li'); li.textContent = it; ul.append(li); }
      row.querySelector('.bubble').append(ul);
      continue;
    }
    if (m.kind === 'choice') {
      const wrap = document.createElement('div'); wrap.className = 'pick';
      for (const o of m.options) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o.label;
        b.addEventListener('click', () => { clearControls(); bubble(o.label, 'me'); const [i, v] = payload(m, o.id, o); step(i, v); refreshPanels(); });
        if (o.hint) b.title = o.hint;
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
        clearControls(); bubble(labels.length ? labels.join('، ') : 'لا شيء محدد', 'me'); const [i, v] = payload(m, [...chosen]); step(i, v); refreshPanels();
      });
      wrap.append(go); control(wrap);
    } else if (m.kind === 'counts') {
      const form = document.createElement('form'); form.className = 'counts'; form.noValidate = true;
      for (const f of m.fields) {
        const l = document.createElement('label'); l.textContent = f.label;
        const i = document.createElement('input'); i.type = 'number'; i.inputMode = 'numeric'; i.min = f.min; i.max = f.max; i.step = 1; i.value = f.value ?? ''; i.name = f.id; i.required = true;
        l.append(i); form.append(l);
      }
      const go = document.createElement('button'); go.type = 'submit'; go.className = 'cta'; go.textContent = 'متابعة';
      form.append(go);
      form.addEventListener('submit', e => {
        e.preventDefault();
        const values = Object.fromEntries(m.fields.map(f => [f.id, form.elements[f.id].valueAsNumber]));
        const summary = m.fields.map(f => `${f.label}: ${values[f.id]}`).join('، ');
        try { const next = session.answer(m.id, values); clearControls(); bubble(summary, 'me'); render(next); refreshPanels(); } catch (err) { fail(err); }
      });
      control(form);
    } else if (m.kind === 'text' && m.key) {
      const form = document.createElement('form'); form.className = 'free'; form.innerHTML = '<input type="text" aria-label="إجابتك" maxlength="300">';
      const go = el('button', 'cta', 'متابعة'); go.type = 'submit'; form.append(go);
      form.addEventListener('submit', e => { e.preventDefault(); const t = form.querySelector('input').value; clearControls(); bubble(t || 'تخطّي', 'me'); step('ask', { key: m.key, value: t }); refreshPanels(); });
      control(form);
    } else if (m.kind === 'household') { renderHousehold(m);
    } else if (m.kind === 'budget') { renderBudget(m);
    } else if (m.kind === 'confirm_items') { renderConfirmItems(m);
    } else if (m.kind === 'review') { renderReview(m);
    } else if (m.kind === 'text') {
      const form = document.createElement('form'); form.className = 'free';
      form.innerHTML = '<textarea aria-label="حدّثني عن بيتك" placeholder="مثال: ثلاث غرف نوم ومجلس ومطبخ، وأريد الخصوصية لغرف النوم"></textarea>'
        + '<details><summary>رمز دخول الذكاء (اختياري)</summary><input type="password" autocomplete="off" aria-label="رمز دخول الذكاء" placeholder="بدونه أفهم كلامك محليًا، أو عبر الذكاء إن كان مفتوحًا في هذه النسخة"></details>';
      const go = document.createElement('button'); go.type = 'submit'; go.className = 'cta'; go.textContent = 'إرسال'; form.append(go);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const text = form.querySelector('textarea').value.trim(), code = form.querySelector('input').value.trim();
        if (text.length < 3) return fail(Error('اكتب وصفًا قصيرًا على الأقل.'));
        go.disabled = true;
        try {
          let understood = null, note = '';
          if (code || await assistantOpen()) {
            try { understood = await understandWithAI(text, code); }
            catch (err) { note = `تعذّر الذكاء المتصل (${err.message}) فاستخدمت الفهم المحلي.`; }
          }
          understood ||= await interpretFree(text);
          if (note) understood.assumptions = [note, ...understood.assumptions];
          clearControls(); bubble(text, 'me'); render(session.answer(m.id, understood));
        } catch (err) { go.disabled = false; fail(err); }
      });
      control(form);
    } else if (m.kind === 'generate') {
      const go = document.createElement('button'); go.type = 'button'; go.className = 'cta'; go.textContent = 'توليد التصميم';
      const wrap = document.createElement('div'); wrap.className = 'pick'; wrap.append(go);
      go.addEventListener('click', () => { clearControls(); build(); });
      control(wrap);
    }
  }
}
const el0 = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
function payload(m, value, o) {
  if (m.id === 'conflict') return ['conflict', { conflictId: o.conflictId, optionId: o.id }];
  if (m.id === 'ask') return ['ask', { key: m.key, value }];
  if (m.id === 'ready') return [o.id, undefined];
  return [m.id, value];
}
function step(id, value) { try { render(session.answer(id, value)); } catch (err) { fail(err); } }
function beginChat() {
  chat.replaceChildren(); session = new SharaFlow({ land: confirmedLand }); render(session.start()); refreshPanels(); buildPathSwitch();
}
function buildPathSwitch() {
  const box = $('pathSwitch'); box.replaceChildren();
  for (const [id, label] of [['free', 'أشرح فكرتي'], ['guided', 'أسئلة موجهة'], ['decide', 'ساعدني أقرر']]) {
    const b = el0('button', 'chip', label); b.type = 'button'; b.addEventListener('click', () => { clearControls(); step('mode', id); refreshPanels(); }); box.append(b);
  }
}
// ---- شريط الأرض والملف الحي (من الملف نفسه؛ لا تُسأل الأرض)
function refreshPanels() {
  if (!session) return;
  const lb = landBar(session.brief), box = $('landBar'); box.replaceChildren();
  const head = el0('div', 'lb-head'); head.append(el0('strong', '', lb.title), el0('span', 'lb-sub', lb.subtitle + ' · المراجعة ' + lb.revision));
  const edit = el0('button', 'cta ghost small', 'تعديل الأرض'); edit.type = 'button'; edit.addEventListener('click', () => show('Land')); head.append(edit);
  const dl = el0('dl', 'lb-rows'); for (const r of lb.rows) { dl.append(el0('dt', '', r.k), el0('dd', '', r.v)); }
  box.append(head, dl);
  const P = liveProfile(session.brief), R = session.readiness(), pf = $('liveProfile'); pf.replaceChildren();
  pf.append(el0('h3', '', 'ملف احتياجات المنزل'), el0('p', 'hint', P.note_ar), el0('p', `ready ready-${R.state}`, 'الحالة: ' + READINESS_AR[R.state]));
  const sec = (title, rows, cls) => { if (!rows.length) return; const d = el0('div', 'prof-sec ' + cls); d.append(el0('h4', '', title)); const ul = el0('ul'); for (const r of rows) { const li = el0('li', '', r.label + (r.priority ? ' — ' + ({ mandatory: 'لازم', preferred: 'تفضيل', flexible: 'قابل للتنازل' })[r.priority] : '') + (r.support && r.support !== 'supported' ? ' · ' + supportLabel(r.support) : '')); li.title = r.source; ul.append(li); } d.append(ul); pf.append(d); };
  sec('ما أكدته', P.confirmed, 'conf'); sec('ينتظر تأكيدك', P.awaiting, 'wait'); sec('غير مدعوم (مسجّل ولن يُطبَّق)', P.unsupported, 'uns');
  if (P.conflicts.length) { const d = el0('div', 'prof-sec bad'); d.append(el0('h4', '', 'تعارضات تحتاج قرارك')); const ul = el0('ul'); for (const c of P.conflicts) ul.append(el0('li', '', c.reason)); d.append(ul); pf.append(d); }
  if (P.missingTopics.length) pf.append(el0('p', 'hint', 'لم نتطرق بعد إلى: ' + P.missingTopics.join('، ')));
}
function renderHousehold(m) {
  const form = el0('form', 'counts'); form.noValidate = true;
  for (const [id, label, ph] of [['currentMembers', 'عدد أفراد الأسرة الحاليين', ''], ['futureMembers', 'العدد المتوقع مستقبلًا (اختياري)', '']]) { const l = el0('label', '', label); const i = document.createElement('input'); i.type = 'number'; i.min = 1; i.max = 40; i.name = id; l.append(i); form.append(l); }
  const wrap = el0('div', 'pick'); const chosen = new Set();
  for (const o of m.options) { const b = el0('button', 'chip', o.label); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => { const on = !chosen.has(o.id); on ? chosen.add(o.id) : chosen.delete(o.id); b.setAttribute('aria-pressed', String(on)); }); wrap.append(b); }
  const go = el0('button', 'cta', 'متابعة'); go.type = 'submit'; form.append(wrap, go);
  form.addEventListener('submit', e => { e.preventDefault(); const v = { currentMembers: form.elements.currentMembers.valueAsNumber, futureMembers: form.elements.futureMembers.valueAsNumber, picked: [...chosen] }; try { const next = session.answer('ask', { key: 'household', value: v }); clearControls(); bubble(`الأسرة: ${v.currentMembers}`, 'me'); render(next); refreshPanels(); } catch (err) { fail(err); } });
  control(form);
}
function renderBudget(m) {
  const form = el0('form', 'counts'); form.noValidate = true;
  for (const [id, label] of [['min', 'من (ريال)'], ['max', 'إلى (ريال)']]) { const l = el0('label', '', label); const i = document.createElement('input'); i.type = 'number'; i.min = 0; i.name = id; l.append(i); form.append(l); }
  const go = el0('button', 'cta', 'تسجيل'); go.type = 'submit'; form.append(go);
  form.addEventListener('submit', e => { e.preventDefault(); const v = { min: form.elements.min.valueAsNumber, max: form.elements.max.valueAsNumber }; clearControls(); bubble('الميزانية مسجّلة (لا يستعملها المحرك)', 'me'); step('ask', { key: 'budget', value: v }); refreshPanels(); });
  control(form);
}
function renderConfirmItems(m) {
  const box = el0('div', 'confirm'); const dec = {};
  for (const it of m.items) {
    const row = el0('div', 'citem'); row.append(el0('p', '', it.text + (it.support && it.support !== 'supported' ? ' · ' + supportLabel(it.support) : '')));
    if (it.quote) row.append(el0('small', '', 'كلامك: «' + it.quote + '»'));
    const g = el0('div', 'pick'); dec[it.ref] = it.suggested || 'preferred';
    for (const [pid, label] of [['mandatory', 'لازم'], ['preferred', 'تفضيل'], ['flexible', 'قابل للتنازل'], ['drop', 'احذفه']]) { const b = el0('button', 'chip', label); b.type = 'button'; b.setAttribute('aria-pressed', String(dec[it.ref] === pid)); b.addEventListener('click', () => { dec[it.ref] = pid; g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }); g.append(b); }
    row.append(g); box.append(row);
  }
  const go = el0('button', 'cta', 'اعتمد'); go.type = 'button'; go.addEventListener('click', () => { clearControls(); bubble('اعتمدت درجات البنود', 'me'); step('ask', { key: 'confirm', value: { decisions: dec } }); refreshPanels(); });
  const allPref = el0('button', 'cta ghost', 'كلها تفضيلات'); allPref.type = 'button'; allPref.addEventListener('click', () => { for (const k of Object.keys(dec)) dec[k] = 'preferred'; clearControls(); bubble('كلها تفضيلات', 'me'); step('ask', { key: 'confirm', value: { decisions: dec } }); refreshPanels(); });
  box.append(go, allPref); control(box);
}
function renderReview(m) {
  const r = m.review, box = el0('div', 'review');
  box.append(el0('h3', '', 'مراجعة قبل التصميم'));
  const L = [['الأرض', [r.land.rows.map(x => x.k + ': ' + x.v).join(' — ')]], ['الغرف', r.rooms], ['العلاقات', r.relations], ['الشروط الإلزامية', r.mandatory], ['التفضيلات', r.preferences], ['افتراضات تحتاج موافقتك', r.assumptions.map(a => a.text_ar)], ['قيود الدعم', r.limits], ['أُرسل تفضيلًا لأنه غير مؤكد', r.softened]];
  for (const [t, items] of L) { if (!items.length) continue; box.append(el0('h4', '', t)); const ul = el0('ul'); for (const x of items) ul.append(el0('li', '', x)); box.append(ul); }
  const go = el0('button', 'cta', r.readiness.needsAck ? 'أفهم القيود وأبدأ التصميم' : 'أؤكد وأبدأ التصميم'); go.type = 'button'; go.disabled = !r.readiness.canGenerate;
  go.addEventListener('click', () => { clearControls(); bubble('ابدأ التصميم', 'me'); step('go'); refreshPanels(); });
  const back = el0('button', 'cta ghost', 'رجوع للتعديل'); back.type = 'button'; back.addEventListener('click', () => { clearControls(); step('more'); });
  box.append(go, back); control(box);
}

// الذكاء المتصل اختياري، ويحتاج رمز دخول الموقع. استدعاؤه الحي غير متحقق منه في هذا التسليم.
async function understandWithAI(text, accessCode) {
  const { plot } = normalizeLand(confirmedLand);
  const { brief } = await requestBrief({ prompt: text, plot, previous: null }, { accessCode, openAccess: !accessCode });
  const tally = {}; for (const r of brief.rooms || []) tally[r.type] = (tally[r.type] || 0) + 1;
  const map = { bedrooms: 'bedroom', majlis: 'majlis', baths: 'bath', kitchens: 'kitchen', halls: 'living', dining: 'dining' };
  const counts = {}; for (const [k, t] of Object.entries(map)) if (tally[t] !== undefined) counts[k] = tally[t];
  try { if (accessCode) sessionStorage.setItem('mizan.ai.code', accessCode); } catch { /* التخزين غير متاح */ }
  return { text, counts, requirements: brief.requirements || null, assumptions: [brief.requirements ? 'فهمتُ كلامك عبر Claude، وطابقته مع الفهم المحلي.' : 'فهمتُ كلامك عبر Claude (بلا متطلبات منظّمة إضافية).', ...(brief.assumptions || [])], questions: [...(brief.questions || []), ...(brief.unhandled || [])] };
}

// ------------------------------------------------------------------------------------------------ التوليد والتسليم للمرسم
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const m1 = v => (Math.round(v * 100) / 100).toString();
function row(table, cells, head) { const tr = el('tr'); for (const c of cells) { const td = el(head ? 'th' : 'td'); if (c instanceof Node) td.append(c); else td.textContent = c; tr.append(td); } table.append(tr); return tr; }

function applyOption(o) {
  try { session.answer('counts', { bedrooms: o.counts.bedrooms, majlis: o.counts.majlis, baths: o.counts.baths, kitchens: o.counts.kitchens, halls: o.counts.halls, dining: o.counts.dining }); } catch { /* يبقى ما في الملف */ }
  confirmedLand = o.land; try { session.changeLand(o.land); } catch { /* يبقى */ }
  $('landLength').value = o.land.length; $('landWidth').value = o.land.width; if ($('landStreetWidth')) $('landStreetWidth').value = o.land.streetWidth > 0 ? o.land.streetWidth : '';
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
  for (const t of f.perType) row(prog, [t.label, String(t.count), `${m1(t.unit)} م²`, `${m1(t.total)} م²`]);
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
  const eng = session.engineInput(), input = { land: eng.land, rooms: eng.rooms, discovery: eng.discovery, idea: eng.idea, counts: eng.counts, requirements: eng.requirements };
  session.counts = eng.counts; session.requirements = eng.requirements; session.idea = eng.idea;
  try {
    const out = await generateInitialDesign(input);
    const oc = classifyOutcome(out, session.brief);
    if (oc.kind !== OUTCOME.SOLVED) { $('buildText').textContent = ''; return showOutcome(oc, null); }
    // التصميم الأولي يُعرض على العميل أولًا (اعتماد / تصميم آخر / تعديل في المرسم)
    const ds = createSession({ land: confirmedLand, counts: session.counts, requirements: session.requirements, discovery: input.discovery, idea: input.idea, result: out });
    if (!saveSession(localStorage, ds)) { writeHandoff(sessionStorage, out.doc, { source: 'home-shara', note: out.notes.join(' '), dna: out.dna, alternatives: out.alternatives }); location.href = './studio.html'; return; }
    $('buildText').textContent = 'جاهز. أعرض عليك التصميم…';
    location.href = './design.html';
  } catch (err) {
    setError($('buildError'), ''); $('buildRetry').hidden = false;
    const oc = classifyOutcome(err, session.brief); $('buildText').textContent = ''; showOutcome(oc, err); if (oc.kind !== OUTCOME.INCOMPLETE || err?.report_ar || err?.feasibility) return;
    $('buildText').textContent = 'أحلّل الصعوبات وأجرّب الخيارات على المحرك…';
    // (الجولة العشرون) تقرير المحرك الثالث يكفي (التعارض والخيارات من كشف الاستحالة والبحث نفسه) — لا تجارب إضافية بطيئة
    if (err?.report_ar || err?.feasibility) { $('buildText').textContent = ''; return; }
    try { renderReport(await diagnoseFit({ land: confirmedLand, counts: session.counts, discovery: input.discovery, idea: input.idea }), err); $('buildText').textContent = ''; }
    catch (e2) { $('buildText').textContent = 'تعذّر التحليل التفصيلي.'; console.warn(e2); }
  }
}
$('buildRetry').addEventListener('click', () => show('Shara'));

// ---- نتيجة العجز: ثلاث رسائل متمايزة + اقتراحات بديلة بأزرار (لا يُنفَّذ شيء دون ضغطك)
const OUT_TITLE = { [OUTCOME.INFEASIBLE]: 'مستحيل هندسيًا — المحرك أثبت ذلك', [OUTCOME.REGULATORY]: 'يخالف اشتراطًا نظاميًا', [OUTCOME.INCOMPLETE]: 'لم يجد المحرك حلًا بعد — وهذا لا يعني أنه مستحيل', [OUTCOME.ALL_HIDDEN]: 'وُجدت تصاميم لكنها حُجبت لمخالفتها بندًا إلزاميًا' };
function showOutcome(oc, err) {
  const box = $('buildReport'); box.replaceChildren(); box.hidden = false; box.dataset.outcome = oc.kind;
  box.append(el('h3', 'out-' + oc.kind, OUT_TITLE[oc.kind] || oc.title_ar));
  for (const t of oc.detail_ar || []) box.append(el('p', 'hint', t));
  if (oc.note_ar) box.append(el('p', 'hint', oc.note_ar));
  const alts = buildAlternatives(session.brief, { ...oc, counterfactual: err?.counterfactual || oc.counterfactual || [] });
  const run = (o, consent) => async () => { box.querySelectorAll('button').forEach(b => b.disabled = true); $('buildText').textContent = 'أطبّق اختيارك وأعيد المحاولة…';
    const r = await retryWith(session.brief, alts, o.id, x => generateInitialDesign({ land: x.land, rooms: x.rooms, discovery: x.discovery, idea: x.idea, counts: x.counts, requirements: x.requirements }), { consent });
    session.brief = r.brief; if (r.outcome.kind === OUTCOME.SOLVED) { const eng = session.engineInput(); const ds = createSession({ land: eng.land, counts: eng.counts, requirements: eng.requirements, discovery: eng.discovery, idea: '', result: r.result }); if (saveSession(localStorage, ds)) { location.href = './design.html'; return; } }
    $('buildText').textContent = ''; showOutcome(r.outcome, r.error || null); refreshPanels(); };
  const list = (title, items, consent) => { if (!items.length) return; box.append(el('h4', '', title)); for (const o of items) { const row = el('div', 'alt'); row.append(el('strong', '', o.label), el('p', '', 'يتغير: ' + o.changes_ar), el('p', '', 'يُفقد: ' + o.loses_ar)); if (o.caveat_ar) row.append(el('small', 'caveat', o.caveat_ar)); if (o.engineVerified !== undefined && o.engineVerified !== null) row.append(el('small', '', o.engineVerified ? 'جرّبه المحرك فنجح' : 'جرّبه المحرك فلم ينجح وحده')); if (o.apply || o.id === 'follow_regulation') { const b = el('button', 'cta ghost', consent ? 'أوافق على هذا التنازل وأعد المحاولة' : 'طبّق هذا الاقتراح'); b.type = 'button'; b.addEventListener('click', run(o, consent)); row.append(b); } else row.append(el('small', '', 'لا يُنفَّذ من هنا')); box.append(row); } };
  list('اقتراحات بديلة (لا يتغير شيء إلا بضغطك)', alts.auto, false);
  list('تمس شرطًا إلزاميًا — تحتاج موافقتك الصريحة', alts.needsConsent, true);
  list('معلومات', alts.info, false);
  if (oc.retryable) { const b = el('button', 'cta', 'أعد المحاولة'); b.type = 'button'; b.addEventListener('click', () => build()); box.append(b); }
}
