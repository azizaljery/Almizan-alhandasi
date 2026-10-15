// واجهة الصفحة الرئيسية: استقبال ← الأرض ← شرعاء ← توليد ← المرسم. المنطق كله في home-flow.mjs.
import { loadThreeRuntime } from './three-runtime.mjs';
import { createArchitecturalScene } from './cinematic-entry.mjs';
import { normalizeLand, SharaSession, interpretFree, generateInitialDesign, landPreviewSvg, SIDE_LABELS } from './home-flow.mjs';
import { writeHandoff } from './draw/handoff.mjs';
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
function readLand() { return { length: $('landLength').valueAsNumber, width: $('landWidth').valueAsNumber, streets: [...land.streets], entries: [...land.entries] }; }
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
    bubble(m.text);
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
      const form = document.createElement('form'); form.className = 'counts'; form.noValidate = true;
      for (const f of m.fields) {
        const l = document.createElement('label'); l.textContent = f.label;
        const i = document.createElement('input'); i.type = 'number'; i.inputMode = 'numeric'; i.min = f.min; i.max = f.max; i.step = 1; i.value = f.value; i.name = f.id;
        l.append(i); form.append(l);
      }
      const go = document.createElement('button'); go.type = 'submit'; go.className = 'cta'; go.textContent = 'متابعة';
      form.append(go);
      form.addEventListener('submit', e => {
        e.preventDefault();
        const values = Object.fromEntries(m.fields.map(f => [f.id, form.elements[f.id].valueAsNumber]));
        const summary = m.fields.map(f => `${f.label}: ${values[f.id]}`).join('، ');
        try { const next = session.answer(m.id, values); clearControls(); bubble(summary, 'me'); render(next); } catch (err) { fail(err); }
      });
      control(form);
    } else if (m.kind === 'text') {
      const form = document.createElement('form'); form.className = 'free';
      form.innerHTML = '<textarea aria-label="حدّثني عن بيتك" placeholder="مثال: ثلاث غرف نوم ومجلس ومطبخ، وأريد الخصوصية لغرف النوم"></textarea>'
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
      control(form);
    } else if (m.kind === 'generate') {
      const go = document.createElement('button'); go.type = 'button'; go.className = 'cta'; go.textContent = 'توليد التصميم';
      const wrap = document.createElement('div'); wrap.className = 'pick'; wrap.append(go);
      go.addEventListener('click', () => { clearControls(); build(); });
      control(wrap);
    }
  }
}
function step(id, value) { try { render(session.answer(id, value)); } catch (err) { fail(err); } }
function beginChat() {
  chat.replaceChildren(); session = new SharaSession(); render(session.start());
}

// الذكاء المتصل اختياري، ويحتاج رمز دخول الموقع. استدعاؤه الحي غير متحقق منه في هذا التسليم.
async function understandWithAI(text, accessCode) {
  const { plot } = normalizeLand(confirmedLand);
  const { brief } = await requestBrief({ prompt: text, plot, previous: { summary: 'ابدأ من برنامج فارغ، واستخرج ما ذكره العميل فقط.', rooms: [] } }, { accessCode });
  const tally = {}; for (const r of brief.rooms || []) tally[r.type] = (tally[r.type] || 0) + 1;
  const map = { bedrooms: 'bedroom', majlis: 'majlis', baths: 'bath', kitchens: 'kitchen', halls: 'living', dining: 'dining' };
  const counts = {}; for (const [k, t] of Object.entries(map)) if (tally[t] !== undefined) counts[k] = tally[t];
  return { text, counts, assumptions: brief.assumptions || [], questions: [...(brief.questions || []), ...(brief.unhandled || [])] };
}

// ------------------------------------------------------------------------------------------------ التوليد والتسليم للمرسم
async function build() {
  show('Build'); setError($('buildError'), ''); $('buildRetry').hidden = true; $('buildText').textContent = 'يبحث المحرك بين البدائل ويختار الأنسب لقيودك…';
  try {
    const out = await generateInitialDesign({ land: confirmedLand, rooms: session.rooms(), discovery: session.discovery(), idea: session.idea });
    writeHandoff(sessionStorage, out.doc, { source: 'home-shara', note: out.notes.join(' ') });
    $('buildText').textContent = 'جاهز. أفتح لك المرسم…';
    location.href = './studio.html';
  } catch (err) {
    $('buildText').textContent = '';
    setError($('buildError'), err.message || 'تعذّر توليد التصميم.'); $('buildRetry').hidden = false;
  }
}
$('buildRetry').addEventListener('click', () => show('Shara'));
