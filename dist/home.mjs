// واجهة الصفحة الرئيسية: استقبال ← الأرض ← شرعاء ← توليد ← المرسم. المنطق كله في home-flow.mjs.
import { visit } from './fresh-visit.mjs'; // أولًا: الدخول الجديد يبدأ مشروعًا نظيفًا قبل أن تقرأ أي وحدة حالة المشروع
import { startNewProject, hasProject, listPast, restorePast, deletePast, takeNotice } from './project-lifecycle.mjs';
import { loadThreeRuntime } from './three-runtime.mjs';
import { createArchitecturalScene } from './cinematic-entry.mjs';
import { saveSession, loadSession, carryOver, sameLand } from './design-session.mjs';
import { normalizeLand, SharaSession, interpretFree, friendlyBuildError, landPreviewSvg, SIDE_LABELS } from './home-flow.mjs';
import { generateInWorker, diagnoseInWorker, warm as warmGenerator, ticking } from './design-client.mjs';
import { HOME_KEY } from './journey-nav.mjs';
import { mountSteps } from './journey-steps.mjs';
import { writeHandoff } from './draw/handoff.mjs';
import { displayOr, landFieldErrors, hasLandErrors } from './field-guards.mjs';
import { requestBrief } from './assistant.mjs';
import { REGIONS, cityById, normalizeGeo, GEO_KEY, northText } from './geo-land.mjs';
import { landBrief, landBriefSvg, normalizeStreetWidths, DISCLAIMER, SOURCE as MUNICIPAL_SOURCE } from './municipal-rules.mjs';

const $ = id => document.getElementById(id);
const home = $('home');
const stages = ['Welcome', 'Land', 'Shara', 'Build'];
function show(name) {
  for (const s of stages) $('stage' + s).hidden = s !== name;
  home.dataset.stage = name.toLowerCase();
  if (name !== 'Welcome') stopScene();
  window.scrollTo({ top: 0 });
  paintSteps();
}
// ------------------------------------------------------------------------------------------------ الحالة المحفوظة والتنقل
// كل ما أدخله العميل هنا (الأرض، الحوار، البرنامج) يُحفظ، فالرجوع إلى «الأرض» أو «شرعاء» من أي صفحة — بشريط الخطوات أو بزر رجوع المتصفح —
// يعيده إلى ما كان عليه، وتصميمه المولَّد باقٍ في جلسته (design-session) لا يُمسّ إلا إذا ولّد هو تصميمًا جديدًا.
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
let tlog = [], regen = false, chatFor = null;
const designSession = () => { try { return loadSession(localStorage); } catch { return null; } };
function saveHome() { store.set(HOME_KEY, { v: 1, raw: readLand(), confirmedLand, shara: session ? session.toJSON() : null, tlog: tlog.slice(-80), at: Date.now() }); }
const HASH = { Land: '#land', Shara: '#shara' };
/** انتقال داخل الصفحة يُسجَّل في سجل المتصفح، فيعمل زر الرجوع والتقدم بين الاستقبال والأرض وشرعاء. */
function go(name) { const h = HASH[name] || ''; if (location.hash !== h) history.pushState(null, '', h || location.pathname + location.search); route(); }
function route() {
  const want = location.hash === '#shara' ? 'Shara' : location.hash === '#land' ? 'Land' : 'Welcome';
  if (want === 'Shara' && !confirmedLand) { history.replaceState(null, '', '#land'); show('Land'); setError($('landError'), 'أدخل بيانات الأرض أولًا ثم تابع إلى شرعاء.'); return; }
  if (want === 'Shara') { show('Shara'); resumeChat(); warmGenerator(); return; }
  if (want === 'Land') { show('Land'); return; }
  show('Welcome'); paintWelcome(); if (!scene) startScene();
}
let paintSteps = () => {};
const setError = (el, text) => { el.textContent = text || ''; el.hidden = !text; };

// ------------------------------------------------------------------------------------------------ الاستقبال
let scene = null, frame = 0;
async function startScene() {
  const host = $('scene');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // الخلفية المتدرجة تكفي
  try {
    // المشهد زينة: يُحمَّل بعد أن تُرسم الصفحة وتصير أزرارها جاهزة، لا قبلها
    await new Promise(r => (globalThis.requestIdleCallback ? requestIdleCallback(r, { timeout: 1200 }) : setTimeout(r, 300)));
    if (home.dataset.stage !== 'welcome' || sceneOff) return;
    const T = await loadThreeRuntime();
    if (home.dataset.stage !== 'welcome' || sceneOff) return;
    scene = createArchitecturalScene(T, host);
    const t0 = performance.now(); let slow = 0;
    const tick = now => {
      if (!scene) return;
      const elapsed = now - t0, w0 = performance.now();
      scene.update(elapsed);
      // جهاز لا يقدر على المشهد (إطار واحد > 250 مللي ثانية، أو > 120 ثلاث مرات متتالية): يُثبَّت على آخر صورة حتى لا يثقل الأزرار
      const cost = performance.now() - w0; slow = cost > 120 ? slow + 1 : 0;
      if (slow >= 3 || cost > 250) { home.dataset.scene = 'still'; return; }
      // يدور المشهد ببطء ما دامت الصفحة الأولى ظاهرة (ويتوقف حين تُخفى الصفحة لتوفير الطاقة)
      if (home.dataset.stage === 'welcome' && scene) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    addEventListener('resize', () => { if (scene && home.dataset.stage === 'welcome') scene.update(6000); });
  } catch { /* بلا WebGL تبقى الخلفية المتدرجة والشعار */ }
}
let sceneOff = false;
function stopScene() { sceneOff = true; cancelAnimationFrame(frame); try { scene?.dispose(); } catch { /* انتهى */ } scene = null; }
// الافتتاحية (رسم الميزان ثم الاسم ثم النقاط) مرة في الجلسة، ويمكن تخطيها
(() => { const w = $('stageWelcome'), done = () => { w.classList.add('lx-done'); try { sessionStorage.setItem('mz-intro-seen', '1'); } catch {} };
  try { if (sessionStorage.getItem('mz-intro-seen')) w.classList.add('lx-done'); } catch {}
  $('lxSkip')?.addEventListener('click', done); setTimeout(() => { try { sessionStorage.setItem('mz-intro-seen', '1'); } catch {} }, 7000); })();
$('start').addEventListener('click', () => {
  stopScene();
  // «مشروع جديد» مع مشروع قائم في هذا التبويب: يُحفظ في «مشاريعي السابقة» ثم نبدأ نظيفًا (إعادة تحميل كي تبدأ كل الحالة من الصفر)
  if (designSession() || session || store.get(HOME_KEY)?.shara || hasProject(localStorage)) { startNewProject(localStorage, sessionStorage); history.replaceState(null, '', '#land'); location.reload(); return; }
  go('Land'); $('landLength').focus();
});
/** الاستقبال لمن له تصميم محفوظ: زر واضح للعودة إليه، والبدء من جديد يبقى خيارًا. */
/** تلميح البدء من جديد + «مشاريعي السابقة» (محلية في هذا المتصفح، آخر 20، باستعادة اختيارية). */
function paintPast() {
  const note = $('freshNote'), notice = paintPast.notice ??= takeNotice(sessionStorage);
  if (note) { note.hidden = !notice; note.textContent = notice === 'archived' ? 'بدأنا مشروعًا جديدًا — مشروعك السابق في «مشاريعي السابقة».' : notice === 'lost' ? 'بدأنا مشروعًا جديدًا. تعذّر حفظ مشروعك السابق لامتلاء مساحة المتصفح.' : ''; }
  const box = $('pastBox'), list = $('pastList'); if (!box || !list) return;
  const items = listPast(localStorage); box.hidden = !items.length; $('pastCount').textContent = String(items.length); list.replaceChildren();
  for (const it of items) {
    const li = document.createElement('li'), when = new Date(it.savedAt).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
    const land = it.summary?.land ? `أرض ${it.summary.land.width} × ${it.summary.land.length} م` : 'بلا أرض محددة', n = it.summary?.designs ? ` — ${it.summary.designs} ${it.summary.designs === 1 ? 'تصميم' : 'تصاميم'}` : '';
    const txt = document.createElement('span'); txt.textContent = `${when} — ${land}${n}`;
    const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'quiet-inline'; restore.textContent = 'استعادة';
    restore.addEventListener('click', () => { if (restorePast(localStorage, sessionStorage, it.id)) { history.replaceState(null, '', location.pathname); location.reload(); } });
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'quiet-inline'; rm.textContent = 'حذف'; rm.addEventListener('click', () => { deletePast(localStorage, it.id); paintPast(); });
    li.append(txt, ' ', restore, ' ', rm); list.append(li);
  }
}
function paintWelcome() {
  paintPast();
  const ds = designSession(), box = $('resumeHome'); if (!box) return;
  box.hidden = !ds; $('start').textContent = ds ? 'مشروع جديد' : 'ابدأ رحلة منزلك';
  if (ds) $('resumeHomeText').textContent = `لديك ${ds.designs.length === 1 ? 'تصميم محفوظ' : ds.designs.length + ' تصاميم محفوظة'} على أرض ${ds.input.land.width} × ${ds.input.land.length} م.`;
}

// ------------------------------------------------------------------------------------------------ الأرض
const land = { streets: new Set(), entries: new Set() };
const grid = $('sideGrid');
for (const key of ['n', 's', 'e', 'w']) {
  const box = document.createElement('div'); box.className = 'side';
  box.innerHTML = `<b>${SIDE_LABELS[key]}</b>`
    + `<label class="tog"><input type="checkbox" data-kind="street" value="${key}"> شارع</label>`
    + `<label class="tog dis" data-entry-label="${key}"><input type="checkbox" data-kind="entry" value="${key}" disabled> مدخل</label>`
    + `<label class="sw" data-width-label="${key}" hidden>عرض الشارع (م) <input type="number" inputmode="decimal" min="4" max="120" step="1" data-kind="width" data-side="${key}" placeholder="مثل 15" aria-label="عرض الشارع ${SIDE_LABELS[key]} بالمتر"></label>`;
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
function readWidths() { const raw = {}; grid.querySelectorAll('input[data-kind=width]').forEach(i => { if (i.value !== '') raw[i.dataset.side] = i.valueAsNumber; }); return normalizeStreetWidths(raw, [...land.streets]); }
/** موقع الأرض: من الخريطة إن اعتُمد، وإلا من المدينة المختارة، وإلا لا شيء (فتُحسب الشمس للرياض افتراضيًا ويُعلن ذلك). */
function readGeo() { const city = $('landCity').value; return normalizeGeo(geo?.source === 'map' ? { ...geo, city: city || geo.city } : city ? { city } : null); }
function readLand() {
  const sw = readWidths(), g = readGeo();
  return { length: $('landLength').valueAsNumber, width: $('landWidth').valueAsNumber, streets: [...land.streets], entries: [...land.entries], floors: Number($('landFloors').value) || 1, ...(floorsTouched ? { floorsExplicit: true } : {}), ...(Object.keys(sw).length ? { streetWidths: sw } : {}), ...(g ? { geo: g } : {}) };
}
let geo = null; // { lat, lng, north, city, cityName, source: 'map' } بعد «اعتمد موقع الأرض»
// عدد الأدوار يُعدّ «محددًا من العميل» فقط إن غيّر الاختيار بنفسه (أو قاله لشرعاء)؛ وإلا يجوز للموقع اقتراح دورين إن لم تتسع الأرض
let floorsTouched = false; $('landFloors')?.addEventListener('change', () => { floorsTouched = true; });
function refreshLand() {
  clearLandErrors();
  for (const key of ['n', 's', 'e', 'w']) {
    const entry = grid.querySelector(`input[data-kind=entry][value=${key}]`), onStreet = land.streets.has(key);
    entry.disabled = !onStreet; entry.closest('.tog').classList.toggle('dis', !onStreet);
    if (!onStreet) { entry.checked = false; land.entries.delete(key); }
    const wl = grid.querySelector(`[data-width-label=${key}]`); wl.hidden = !onStreet; if (!onStreet) wl.querySelector('input').value = '';
  }
  const raw = readLand();
  $('landPreview').innerHTML = landPreviewSvg(raw);
  paintBrief(raw); paintGeo(); locator?.refresh();
}
/** «ما تعنيه الاشتراطات لأرضك»: يظهر حين تكتمل الأبعاد والشوارع؛ أرقامه من municipal-rules.mjs (الاشتراطات العامة للوزارة). */
function paintBrief(raw) {
  const box = $('landBrief'), b = landBrief(raw); box.hidden = !b.ok; if (!b.ok) { box.replaceChildren(); return; }
  const fig = el('div', 'brief-fig'); fig.innerHTML = landBriefSvg(b, { north: raw.geo?.source === 'map' ? raw.geo.north : 0 }); // أرقام وتسميات ثابتة فقط
  const list = el('ol', 'brief-lines'); for (const t of b.lines) list.append(el('li', '', t));
  const src = el('a', '', 'المصدر: اشتراطات إنشاء المباني السكنية (وزارة البلديات والإسكان، 2024)'); src.href = MUNICIPAL_SOURCE.url; src.target = '_blank'; src.rel = 'noopener';
  const h3 = el('h3', '', 'ما تعنيه الاشتراطات البلدية لأرضك'); h3.id = 'briefTitle';
  box.replaceChildren(h3, el('div', 'brief-body', undefined));
  box.lastChild.append(fig, list);
  for (const f of b.flags) box.append(el('p', 'brief-flag', f));
  const note = el('p', 'brief-note', DISCLAIMER + ' '); note.append(src); box.append(note);
}
function paintGeo() {
  const st = $('geoState'), g = geo?.source === 'map' ? geo : null; st.hidden = !g;
  if (g) st.textContent = `موقع أرضك محدد على الخريطة (${g.lat.toFixed(5)}، ${g.lng.toFixed(5)}). ${northText(g.north)} يبقى في متصفحك فقط.`;
}
// ---- الخريطة: تُحمَّل وحدتها وبلاطاتها عند فتح الخيار فقط
let locator = null, locatorLoading = false;
function setStreets(list) { land.streets = new Set(list); grid.querySelectorAll('input[data-kind=street]').forEach(i => { i.checked = land.streets.has(i.value); }); }
$('locateBox').addEventListener('toggle', async () => {
  if (!$('locateBox').open || locator || locatorLoading) return; locatorLoading = true;
  try {
    const { mountLandLocator } = await import('./land-locator.mjs');
    locator = mountLandLocator($('locateHost'), {
      getLand: readLand,
      onDims: ({ width, length }) => { $('landWidth').value = width; $('landLength').value = length; refreshLand(); },
      onStreets: list => { setStreets(list); refreshLand(); },
      onCity: id => { if (!$('landCity').value && cityById(id)) $('landCity').value = id; },
      onApply: a => {
        $('landWidth').value = a.width; $('landLength').value = a.length;
        const widths = a.streetWidths || {}; setStreets(a.streets); land.entries = new Set(a.entries);
        geo = a.geo; if (a.geo?.city && !$('landCity').value) $('landCity').value = a.geo.city;
        refreshLand();
        grid.querySelectorAll('input[data-kind=entry]').forEach(i => { i.checked = land.entries.has(i.value); });
        grid.querySelectorAll('input[data-kind=width]').forEach(i => { i.value = widths[i.dataset.side] ?? ''; });
        refreshLand(); saveHome();
      },
      onClear: () => { geo = null; refreshLand(); saveHome(); },
    });
  } catch (err) { $('locateHost').replaceChildren(el('p', 'hint', 'تعذّر تحميل الخريطة. أكمل الإدخال يدويًا: الطول والعرض والشوارع، واختر المدينة.')); console.warn(err); }
  finally { locatorLoading = false; }
});
{ const sel = $('landCity'), none = document.createElement('option'); none.value = ''; none.textContent = 'غير محددة'; sel.append(none);
  for (const r of REGIONS) { const g = document.createElement('optgroup'); g.label = r.ar; for (const c of r.cities) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.ar; g.append(o); } sel.append(g); }
  sel.addEventListener('change', () => { refreshLand(); }); }
/** الموقع المحفوظ للشمس (مفتاح صغير تقرؤه صفحات لاحقة، ومنها منزلق الشمس في المجسم): يُكتب مع الأرض المعتمدة ويُمسح إن لم يُحدَّد. */
function storeGeo(g) { try { if (g) localStorage.setItem(GEO_KEY, JSON.stringify(g)); else localStorage.removeItem(GEO_KEY); } catch { /* التخزين غير متاح */ } }
grid.addEventListener('input', e => { if (e.target.dataset?.kind === 'width') refreshLand(); });
grid.addEventListener('change', e => {
  const input = e.target; if (!(input instanceof HTMLInputElement)) return;
  if (input.dataset.kind === 'width') { refreshLand(); return; }
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
  try { const { land: ok } = normalizeLand(raw); confirmedLand = ok; storeGeo(ok.geo || null); setError($('landError'), ''); }
  catch (err) { setError($('landError'), err.message); return; }
  // تصميم محفوظ على الأرض نفسها: موقعها وعروض شوارعها (لا يدخلان التوليد) يُحدَّثان فيه، فتتبعهما بطاقتا الاشتراطات والشمس بلا إعادة توليد
  { const ds = designSession(); if (ds && sameLand(ds.input.land, confirmedLand) && JSON.stringify([ds.input.land.geo, ds.input.land.streetWidths]) !== JSON.stringify([confirmedLand.geo, confirmedLand.streetWidths])) { ds.input.land = { ...ds.input.land, geo: confirmedLand.geo, streetWidths: confirmedLand.streetWidths }; saveSession(localStorage, ds); } }
  if (session) session.setLand(confirmedLand); // حوار قائم: يبقى، ويُعاد حساب البرنامج على الأرض الجديدة
  chatFor = null; saveHome(); go('Shara');
});

// ------------------------------------------------------------------------------------------------ شرعاء
let session = null;
const chat = $('chat');
let recording = true;
/** فقاعة في المحادثة؛ تُسجَّل في نص الحوار المحفوظ (extra: kind/items/reason) ليُعاد عرضها عند الرجوع إلى شرعاء. */
function bubble(text, who = 'shara', extra = null) {
  const row = document.createElement('div'); row.className = 'row' + (who === 'me' ? ' me' : '');
  const av = document.createElement('div'); av.className = 'avatar'; av.textContent = 'ش'; av.setAttribute('aria-hidden', 'true');
  const b = document.createElement('div'); b.className = 'bubble'; b.textContent = text;
  if (who === 'me') row.append(b); else row.append(av, b);
  if (extra?.kind === 'list') { const ul = document.createElement('ul'); ul.className = 'understood'; for (const it of extra.items || []) { const li = document.createElement('li'); li.textContent = it; ul.append(li); } b.append(ul); }
  if (extra?.kind === 'note') row.classList.add('note');
  if (extra?.reason) { const why = document.createElement('p'); why.className = 'why'; why.textContent = extra.reason; b.append(why); }
  chat.append(row);
  if (recording && extra !== false) { tlog.push({ who, text, ...(extra || {}) }); if (who === 'me') queueMicrotask(saveHome); }
  return row;
}
/** «شرعاء تكتب…»: يظهر فورًا عند كل انتظار ولا يُحفظ في نص الحوار. */
function typing(text = 'شرعاء تكتب…') { const row = bubble(text, 'shara', false); row.classList.add('typing'); row.dataset.control = ''; row.setAttribute('role', 'status'); row.scrollIntoView?.({ block: 'nearest' }); return row; }
const clearControls = () => chat.querySelectorAll('[data-control]').forEach(n => n.remove());
function control(node) { node.dataset.control = ''; chat.append(node); node.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); return node; }
function fail(err) { setError($('chatError'), err.message || String(err)); }

function render(messages, { record = true } = {}) {
  setError($('chatError'), '');
  const was = recording; recording = was && record;
  try { renderAll(messages); } finally { recording = was; }
  if (record) saveHome();
}
function renderAll(messages) {
  for (const m of messages) {
    if (m.kind === 'program') { renderProgram(m); continue; }
    const row = bubble(m.text, 'shara', m.kind === 'list' ? { kind: 'list', items: m.items || [] } : m.kind === 'note' ? { kind: 'note' } : m.kind === 'ask' ? { reason: m.reason } : null);
    if (m.kind === 'list' || m.kind === 'note') continue;
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
      go.addEventListener('click', () => { go.disabled = true; go.textContent = 'جارٍ التوليد…'; clearControls(); build(); });
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
    go.disabled = true; go.textContent = 'جارٍ الإرسال…'; form.querySelector('textarea').readOnly = true;
    // ما كتبه العميل يظهر فورًا، ثم «شرعاء تكتب…» حتى يصل الفهم (المحلي جزء من الثانية؛ المتصل بمهلة ثم المحلي)
    const mine = bubble(text, 'me', false), wait = typing(code ? 'شرعاء تفهم كلامك عبر الذكاء المتصل…' : 'شرعاء تكتب…');
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
      let understood = null, note = '';
      if (code) {
        // مهلة الذكاء المتصل: إن تأخر أو فشل يُكمَل بالفهم المحلي فورًا ويُقال ذلك صراحةً؛ والعميل يستطيع ألا ينتظر
        const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), AI_TIMEOUT_MS), stop = ticking(wait.querySelector('.bubble'), 'شرعاء تفهم كلامك عبر الذكاء المتصل…');
        const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'chip'; skip.textContent = 'لا أنتظر — افهمي كلامي محليًا الآن'; skip.addEventListener('click', () => ctl.abort()); wait.append(skip);
        try { understood = await understandWithAI(text, code, ctl.signal); }
        catch (err) { note = ctl.signal.aborted ? 'لم يصل رد الذكاء المتصل في الوقت المحدد، ففهمتُ كلامك بالفهم المحلي (قد يفوته بعض ما يلتقطه المتصل).' : `تعذّر الذكاء المتصل (${err.message}) فاستخدمت الفهم المحلي.`; }
        finally { clearTimeout(timer); stop(); }
      }
      understood ||= await interpretFree(text);
      if (note) understood.assumptions = [note, ...understood.assumptions];
      const next = session.answer(m.id, understood);
      mine.remove(); clearControls(); bubble(text, 'me'); render(next);
    } catch (err) { mine.remove(); wait.remove(); go.disabled = false; go.textContent = 'إرسال'; form.querySelector('textarea').readOnly = false; fail(err); }
  });
  return control(form);
}

/** سؤال بسببه الهندسي: خيارات (مفردة أو متعددة) + كتابة حرة + تخطٍّ. */
function renderAsk(m, row) {
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
  chat.replaceChildren(); tlog = []; session = new SharaSession({ land: confirmedLand }); render(session.start());
}
/** جلسة حوار من جلسة تصميم سابقة لهذا الحفظ (لا نص حوار محفوظ لها): تُبنى من نص الطلب وأعداده المحفوظة فيها. */
function sharaFromDesign(ds) {
  const req = ds.input.requirements || {}, counts = {};
  for (const k of ['bedrooms', 'majlis', 'baths', 'kitchens', 'halls', 'dining']) if (Number.isInteger(req.counts?.[k])) counts[k] = req.counts[k];
  const texts = String(ds.input.idea || '').split('\n').map(t => t.trim()).filter(t => t.length >= 3);
  return SharaSession.restore({ v: 1, mode: 'free', phase: 'ready', texts: texts.length ? texts : ['بيت لأسرة'], countOverrides: counts }, { land: confirmedLand });
}
/**
 * يعيد صفحة شرعاء إلى حالها عند الرجوع إليها: نص الحوار السابق كما كان، ثم — إن وُجد تصميم — بطاقة فيها
 * «العودة إلى تصميمي» و«عدّل طلبي وأعد التوليد»؛ وبلا تصميم يكمل العميل من حيث توقف.
 */
function resumeChat() {
  const ds = designSession(), key = JSON.stringify([confirmedLand, ds?.createdAt || 0, ds?.designs.length || 0]);
  if (chatFor === key && chat.childElementCount) return; // المحادثة المعروضة هي الحالية
  chatFor = key; regen = false; chat.replaceChildren(); setError($('chatError'), '');
  const saved = store.get(HOME_KEY);
  if (!session && saved?.shara) { session = SharaSession.restore(saved.shara, { land: confirmedLand }); tlog = Array.isArray(saved.tlog) ? saved.tlog.filter(x => x && typeof x.text === 'string') : []; }
  if (!session && ds) {
    session = sharaFromDesign(ds);
    tlog = [{ who: 'shara', text: 'هذا طلبك كما حفظته مع تصميمك:' }, ...(ds.input.idea ? [{ who: 'me', text: ds.input.idea }] : []),
      ...((ds.input.requirements?.understood || []).length ? [{ who: 'shara', text: 'فهمت من كلامك وطبّقته في التصميم:', kind: 'list', items: ds.input.requirements.understood }] : [])];
  }
  if (!session || session.phase === 'mode') { beginChat(); if (ds) { resumeCard(ds, false); chat.append(...chat.querySelectorAll('[data-control]')); } saveHome(); return; }
  const started = session.texts.length > 0, live = !ds || !started, next = live ? session.resume() : [];
  // ما سيُعاد عرضه الآن (السؤال القائم أو زر التوليد) لا يُكرَّر من النص المحفوظ
  const again = new Set(next.map(m => m.text)); let end = tlog.length; while (end > 0 && tlog[end - 1].who !== 'me' && again.has(tlog[end - 1].text)) end--;
  const was = recording; recording = false;
  try { for (const m of tlog.slice(0, end)) bubble(m.text, m.who === 'me' ? 'me' : 'shara', { kind: m.kind, items: m.items, reason: m.reason }); } finally { recording = was; }
  if (ds) resumeCard(ds, started);
  if (live) render(next, { record: false });
  saveHome();
  (chat.querySelector('#resumeCard') || chat.lastElementChild)?.scrollIntoView?.({ block: 'nearest' });
}
function resumeCard(ds, started) {
  const n = ds.designs.length, same = sameLand(confirmedLand, ds.input.land);
  const card = el('section', 'resume'); card.id = 'resumeCard'; card.setAttribute('aria-label', 'تصميمك المحفوظ');
  card.append(el('p', '', `${n === 1 ? 'تصميمك محفوظ' : 'تصاميمك الـ' + n + ' محفوظة'} على أرض ${ds.input.land.width} × ${ds.input.land.length} م — رجوعك إلى شرعاء لم يمحُ شيئًا.`));
  if (!same) card.append(el('p', 'hint', `غيّرتَ الأرض إلى ${confirmedLand.width} × ${confirmedLand.length} م؛ تصميمك المحفوظ مرسوم على الأرض السابقة.`));
  const row = el('div', 'pick');
  const back = el('a', 'cta', 'العودة إلى تصميمي ←'); back.id = 'backToDesign'; back.href = './design.html'; row.append(back);
  if (started) {
    const editBtn = el('button', 'chip', 'عدّل طلبي وأعد التوليد'); editBtn.type = 'button'; editBtn.id = 'editRequest';
    editBtn.addEventListener('click', () => {
      regen = true; editBtn.remove();
      card.append(el('p', 'hint', same ? 'عدّل البرنامج أدناه أو أضف تفصيلًا بالكلام، ثم اضغط «توليد التصميم». تصاميمك السابقة تبقى بعد الجديدة ولا تُمحى.' : 'عدّل البرنامج أدناه ثم اضغط «توليد التصميم». لأن الأرض تغيّرت، التصاميم الجديدة تحلّ محل السابقة.'));
      render(session.resume(), { record: false }); chat.querySelector('#program')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    });
    row.append(editBtn);
  } else card.append(el('p', 'hint', 'بدأتَ طلبًا جديدًا: تصميمك المحفوظ يبقى حتى تولّد تصميمًا جديدًا فيحلّ محله.'));
  card.append(row); chat.append(card);
}
const AI_TIMEOUT_MS = 30000;

// الذكاء المتصل اختياري، ويحتاج رمز دخول الموقع. استدعاؤه الحي غير متحقق منه في هذا التسليم.
async function understandWithAI(text, accessCode, signal) {
  const { plot } = normalizeLand(confirmedLand);
  const { brief } = await requestBrief({ prompt: text, plot, previous: { summary: 'ابدأ من برنامج فارغ، واستخرج ما ذكره العميل فقط.', rooms: [] } }, { accessCode, signal });
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

let building = false;
async function build() {
  if (building) return; building = true;
  show('Build'); setError($('buildError'), ''); $('buildRetry').hidden = true; $('buildReport').hidden = true; $('buildBusy').hidden = false;
  // التوليد يجري في عامل خارج الخيط الرئيسي: الصفحة تبقى حيّة والمؤشر يعدّ الثواني الفعلية
  let stop = ticking($('buildText'), 'يبحث المحرك بين البدائل ويختار الأنسب لقيودك…');
  const input = { land: confirmedLand, rooms: session.rooms(), discovery: session.discovery(), idea: session.idea, counts: session.counts, requirements: session.requirements };
  const prev = regen ? designSession() : null;
  try {
    const out = await generateInWorker(input, { land: confirmedLand, counts: session.counts, requirements: session.requirements, discovery: input.discovery, idea: input.idea });
    // التصميم الأولي يُعرض على العميل أولًا (اعتماد / تصميم آخر / تعديل في المرسم)؛ عند «عدّل طلبي» تبقى تصاميمه السابقة بعد الجديدة
    const ds = carryOver(out.session, prev).session;
    saveHome();
    // غادر العميل شاشة الانتظار (رجوع المتصفح) قبل اكتمال التوليد: يُحفظ التصميم ويصير متاحًا من شريط الخطوات، ولا يُنقل قسرًا
    if (home.dataset.stage !== 'build') { if (saveSession(localStorage, ds) || saveSession(localStorage, out.session)) { chatFor = null; paintSteps(); if (home.dataset.stage === 'shara') resumeChat(); } stop(); return; }
    if (!saveSession(localStorage, ds) && !saveSession(localStorage, out.session)) { writeHandoff(sessionStorage, out.handoff.doc, { source: 'home-shara', note: out.handoff.notes.join(' '), dna: out.handoff.dna, alternatives: out.handoff.alternatives }); location.href = './studio.html'; return; }
    stop(); $('buildText').textContent = 'جاهز. أعرض عليك التصميم…';
    location.href = './design.html';
  } catch (err) {
    stop(); setError($('buildError'), friendlyBuildError(err)); $('buildRetry').hidden = false;
    stop = ticking($('buildText'), 'أحلّل الصعوبات وأجرّب الخيارات على المحرك…');
    try { renderReport(await diagnoseInWorker({ land: confirmedLand, counts: session.counts, discovery: input.discovery, idea: input.idea }), err); stop(); $('buildText').textContent = ''; }
    catch (e2) { stop(); $('buildText').textContent = 'تعذّر التحليل التفصيلي.'; console.warn(e2); }
    $('buildBusy').hidden = true;
  } finally { building = false; }
}
$('buildRetry').addEventListener('click', () => { chatFor = null; show('Shara'); resumeChat(); });

// ------------------------------------------------------------------------------------------------ البدء: استعادة ما حُفظ ثم التوجيه بحسب الرابط
{
  const saved = store.get(HOME_KEY), ds = designSession(), raw = saved?.raw || (ds ? ds.input.land : null);
  if (raw) {
    if (Number.isFinite(raw.length)) $('landLength').value = raw.length; if (Number.isFinite(raw.width)) $('landWidth').value = raw.width;
    if (raw.floors) $('landFloors').value = String(raw.floors);
    land.streets = new Set(raw.streets || []); land.entries = new Set(raw.entries || []);
    grid.querySelectorAll('input[data-kind=street]').forEach(i => { i.checked = land.streets.has(i.value); });
    refreshLand(); grid.querySelectorAll('input[data-kind=entry]').forEach(i => { i.checked = land.entries.has(i.value); });
    grid.querySelectorAll('input[data-kind=width]').forEach(i => { const v = raw.streetWidths?.[i.dataset.side]; if (Number.isFinite(v)) i.value = v; });
    const g = normalizeGeo(raw.geo); if (g?.source === 'map') geo = g; if (g?.city) $('landCity').value = g.city;
    refreshLand();
  }
  const c = saved?.confirmedLand || (ds ? ds.input.land : null);
  if (c) { try { confirmedLand = normalizeLand(c).land; } catch { confirmedLand = null; } }
}
const stageNow = () => ({ land: 'land', shara: 'shara', build: 'shara' })[home.dataset.stage] || 'land';
const stepBars = [...document.querySelectorAll('ol.steps')].map(ol => mountSteps(ol, { current: stageNow }));
paintSteps = () => stepBars.forEach(f => f());
addEventListener('hashchange', route); addEventListener('popstate', route);
// العودة بزر رجوع المتصفح من صفحة التصميم (الصفحة محفوظة في ذاكرة الرجوع على شاشة «أجهّز تصميمك»): تُعاد إلى شرعاء وفيها بطاقة التصميم
addEventListener('pageshow', e => { if (e.persisted) { building = false; chatFor = null; route(); } });
route();
globalThis.__mizanHome = { get stage() { return home.dataset.stage; }, get session() { return session; }, get tlog() { return tlog; } }; // للاختبارات الحية
