// العرض ثلاثي الأبعاد المستقل بعد اعتماد التصميم: المجسّم من المخطط المعتمد نفسه، والشمس من الوقت والتاريخ.
import './visit-touch.mjs';
import { saveBoundSnapshot, SNAPSHOT_KEY } from './bound-snapshot.mjs';
import { parseDoc } from './draw/doc.mjs';
import { STUDIO_KEY } from './draw/handoff.mjs';
import { sunPosition, CITIES } from './sun.mjs';
import { planSheetSvg } from './draw/plan-sheet.mjs';
import { INTERIOR_THEMES, INTERIOR_THEME_IDS, INTERIOR_STORAGE_KEY, isInteriorTheme } from './draw/interior-themes.mjs';
import { palettesOf, paletteById } from './draw/interior-palettes.mjs';

const $ = id => document.getElementById(id);
const SNAP_KEY = 'mizan.studio.snap3d.v1';
async function rememberCapture(blob, view) {
  const capturedDoc = doc; if (!capturedDoc || !blob) return;
  const image = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('تعذر حفظ اللقطة')); r.readAsDataURL(blob); });
  try { await saveBoundSnapshot(localStorage, capturedDoc, image, { view }); } catch { /* The downloaded image remains valid if browser storage is full. */ }
}
let viewer = null, doc = null;

function loadDoc() { try { const raw = localStorage.getItem(STUDIO_KEY); return raw ? parseDoc(raw) : null; } catch { return null; } }
function say(t) { const m = $('threeMsg'); m.hidden = !t; m.textContent = t || ''; }
// بلا WebGL لا يعمل المجسّم ولا الواجهة الواقعية (وهي تعتمد على المحرّك نفسه): نخفي أدواتهما ونعرض المسقط ثنائي الأبعاد الثابت بدلًا منهما.
function fallbackWithoutWebGL(message) {
  const hide = el => { if (el) el.style.display = 'none'; };
  try {
    // كل قسم أدوات يحوي عنصر التحكم: نخفي القسم كاملًا (عنوانه ومحتواه)
    // القسم = الابن المباشر للوحة الجانبية الذي يحوي عنصر التحكم (closest('div') كان يعيد العنصر نفسه فيبقى العنوان ظاهرًا)
    const section = el => { while (el && el.parentElement && el.parentElement.id !== 'threePane') el = el.parentElement; return el?.parentElement?.id === 'threePane' ? el : null; };
    for (const sel of ['#modeSeg', '#styleSeg', '#city', '#interiorSeg', '#detailSeg']) hide(section(document.querySelector(sel)));
    document.querySelectorAll('.tourbox, #autoTourStatus, #levelBox, #facadeBox, #shot, #shotHQ, .shots, #threeHost, #facadeFrame').forEach(hide);
    const stage = document.querySelector('.stage');
    if (stage) {
      const wrap = document.createElement('div'); wrap.className = 'static2d'; wrap.style.cssText = 'position:absolute;inset:0;overflow:auto;padding:12px;background:#f4f1ea';
      try { wrap.innerHTML = planSheetSvg(doc).replace('<svg', '<svg style="width:100%;height:auto;max-width:100%"'); } catch { wrap.textContent = 'تعذّر عرض المسقط الثابت.'; }
      stage.prepend(wrap);
    }
  } catch { /* العرض الثابت اختياري؛ تبقى رسالة الخطأ ظاهرة */ }
  say(message);
}


// ---- جودة العرض: «تلقائي» يختار الخفيف على الجوال والأجهزة الضعيفة والكامل على غيرها؛ اختيار العميل يُحفظ
const DETAIL_KEY = 'mizan.view3d.detail.v1', DETAIL_NOTE = {
  lite: 'عرض خفيف: أثاث مبسّط وستائر وإضاءة أخف وظلال أصغر لتبقى الحركة سلسة على الجوال. اللقطة عالية الجودة تبقى كاملة.',
  full: 'عرض كامل: أثاث غني وخامات أدق وظلال ناعمة. قد يبطؤ على الجوال.',
};
function loadDetail() { try { const v = localStorage.getItem(DETAIL_KEY); return v === 'lite' || v === 'full' ? v : null; } catch { return null; } }
function saveDetail(v) { try { if (v) localStorage.setItem(DETAIL_KEY, v); else localStorage.removeItem(DETAIL_KEY); } catch { /* التخزين غير متاح: يبقى الاختيار في هذه الجلسة */ } }
function syncDetailUI() {
  const seg = $('detailSeg'), note = $('detailNote'); if (!seg || !viewer) return;
  const chosen = loadDetail() || '';
  seg.querySelectorAll('button').forEach(b => { const on = b.dataset.detail === chosen; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  const eff = viewer.detail, s = viewer.stats?.();
  note.textContent = (chosen ? '' : `تلقائي ← ${eff === 'lite' ? 'خفيف' : 'كامل'}. `) + DETAIL_NOTE[eff] + (s?.sceneTriangles ? ` (${Math.round(s.sceneTriangles / 1000)} ألف مثلث)` : '');
}
function onPerf(info) { say(`بطء الحركة على هذا الجهاز: خُفّضت الجودة تلقائيًا${info.detail === 'lite' ? ' (عرض خفيف)' : ''}.`); setTimeout(() => say(''), 4500); syncDetailUI(); }
function buildDetailUI() {
  const seg = $('detailSeg'); if (!seg || seg.children.length) return;
  for (const [id, label] of [['', 'تلقائي'], ['lite', 'خفيف'], ['full', 'كامل']]) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.detail = id;
    b.addEventListener('click', () => { if (!viewer?.built) return; saveDetail(id || null); b.disabled = true; say('جارٍ تبديل جودة العرض…'); setTimeout(() => { try { viewer.setDetail(id || 'auto'); } finally { b.disabled = false; say(''); syncDetailUI(); } }, 30); });
    b.textContent = label; seg.append(b);
  }
}
async function ensureViewer() {
  if (viewer) return viewer;
  const [{ loadThreeRuntime }, { DrawViewer }] = await Promise.all([import('./three-runtime.mjs'), import('./draw/viewer-draw.mjs')]);
  const THREE = await loadThreeRuntime();
  viewer = new DrawViewer($('threeHost'), { THREE, shadowSize: 2048, maxPixelRatio: 2, detail: loadDetail() || 'auto', onState: ev => { if (ev.type === 'mode') syncMode(); else if (ev.type === 'perf') onPerf(ev.detail); } });
  globalThis.__mizanViewer = viewer;
  return viewer;
}
// ---- الديكور الداخلي: اختيار العميل يُحفظ كبقية الإعدادات ويُعاد عند الفتح؛ بلا اختيار يقترح الميزان طرازًا من بصمة التصميم وذوق العميل
// القيمة المحفوظة: «الطراز» أو «الطراز@معرّف-اللوحة» (لوحة ألوان اختارها العميل ضمن الطراز)
const loadInteriorChoice = () => { try { const [t, pid] = String(localStorage.getItem(INTERIOR_STORAGE_KEY) || '').split('@'); const th = isInteriorTheme(t) ? t : null, p = pid && paletteById(pid); return { theme: th, palette: th && p && palettesOf(th).includes(p) ? pid : null }; } catch { return { theme: null, palette: null }; } };
const loadInteriorTheme = () => loadInteriorChoice().theme;
const saveInteriorTheme = (t, pid = null) => { try { if (t) localStorage.setItem(INTERIOR_STORAGE_KEY, pid ? t + '@' + pid : t); else localStorage.removeItem(INTERIOR_STORAGE_KEY); } catch { /* التخزين غير متاح: يبقى الاختيار في هذه الجلسة */ } };
function exteriorTaste() { try { const e = JSON.parse(localStorage.getItem('mizan.exterior.v1') || 'null'); return { style: e?.style && e.style !== 'auto' ? e.style : null, taste: e?.feel && e.feel !== 'auto' ? [e.feel] : [] }; } catch { return { style: null, taste: [] }; } }
function syncInteriorUI() {
  const info = viewer?.interiorInfo?.(), seg = $('interiorSeg'), note = $('interiorNote'); if (!seg || !info) return;
  const chosen = loadInteriorTheme();
  seg.querySelectorAll('button').forEach(b => { const on = b.dataset.theme === (chosen || ''); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  const T = INTERIOR_THEMES[info.theme]; note.textContent = T ? `${T.ar}: ${T.blurb}${chosen ? '' : ` (اقتراح الميزان: ${info.reason})`}` : '';
  const pseg = $('paletteSeg'), pnote = $('paletteNote'); if (!pseg) return;
  pseg.replaceChildren(); const cur = info.palette?.id, picked = loadInteriorChoice().palette;
  const mkp = (pid, label, sw) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.palette = pid; const on = pid === (picked || ''); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); if (sw) { const w = document.createElement('span'); w.setAttribute('aria-hidden', 'true'); w.style.cssText = 'display:inline-flex;margin-inline-end:6px;vertical-align:middle'; sw.forEach(c => { const i = document.createElement('i'); i.style.cssText = `width:11px;height:11px;border-radius:50%;margin-inline-end:-3px;border:1px solid rgba(0,0,0,.25);background:${c}`; w.append(i); }); b.append(w); } b.append(label);
    b.addEventListener('click', () => { if (!viewer?.built) return; const th = loadInteriorTheme() || info.theme; saveInteriorTheme(th, pid || null); const ex = exteriorTaste(); b.disabled = true; say('جارٍ تبديل اللوحة…'); setTimeout(() => { try { viewer.setInteriorTheme(th, { ...ex, palette: pid || null }); applySun(); } finally { b.disabled = false; say(''); syncInteriorUI(); } }, 30); }); pseg.append(b); };
  mkp('', 'تلقائي'); for (const p of palettesOf(info.theme)) mkp(p.id, p.ar, [p.wall, p.main, p.accent]);
  const P = info.palette; pnote.textContent = P ? `لماذا هذه الألوان: ${P.why}` : '';
}
function buildInteriorUI() {
  const seg = $('interiorSeg'); if (!seg || seg.children.length) return;
  const mk = (id, label, swatch) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.theme = id; b.title = id ? INTERIOR_THEMES[id].blurb : 'يقترح الميزان طرازًا ينسجم مع تصميمك وذوقك'; if (swatch) { const sw = document.createElement('span'); sw.setAttribute('aria-hidden', 'true'); sw.style.cssText = 'display:inline-flex;margin-inline-end:6px;vertical-align:middle'; swatch.slice(0, 3).forEach(c => { const i = document.createElement('i'); i.style.cssText = `display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-inline-end:-2px;box-shadow:0 0 0 1px rgba(0,0,0,.25)`; sw.append(i); }); b.append(sw); } b.append(label);
    b.addEventListener('click', () => { if (!viewer?.built) return; saveInteriorTheme(id || null); const ex = { ...exteriorTaste(), palette: null }; b.disabled = true; say('جارٍ تبديل الديكور…'); setTimeout(() => { try { viewer.setInteriorTheme(id || null, ex); applySun(); } finally { b.disabled = false; say(''); syncInteriorUI(); } }, 30); });
    seg.append(b); };
  mk('', 'تلقائي'); for (const id of INTERIOR_THEME_IDS) mk(id, INTERIOR_THEMES[id].ar, INTERIOR_THEMES[id].swatch);
}
// على الجوال اللوحة الجانبية تحت المشهد وطولها آلاف البكسلات: كل قسم يُطوى بعنوانه ويبقى مفتوحًا قسما «طريقة المشاهدة» و«جودة العرض» و«الديكور الداخلي»
function collapsePanels() {
  if (!globalThis.matchMedia?.('(max-width:860px)').matches) return;
  const keep = new Set(['modeSeg', 'detailSeg', 'interiorSeg']);
  document.querySelectorAll('#threePane > div').forEach(d => {
    const h = d.querySelector(':scope > h2'); if (!h || d.dataset.collapsible) return;
    d.dataset.collapsible = '1'; h.tabIndex = 0; h.setAttribute('role', 'button');
    const set = c => { if (c) d.dataset.collapsed = '1'; else delete d.dataset.collapsed; h.setAttribute('aria-expanded', String(!c)); };
    set(!keep.has(d.querySelector('.seg')?.id));
    h.addEventListener('click', () => set(!d.dataset.collapsed));
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(!d.dataset.collapsed); } });
  });
}
function syncMode() {
  document.querySelectorAll('#modeSeg [data-mode], #mobileBar [data-mode]').forEach(b => { const on = b.dataset.mode === viewer?.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  const pad = $('walkPad'); if (pad) pad.hidden = viewer?.mode !== 'walk';
}
// ---- لمس الجوال: شريط طريقة المشاهدة أسفل المشهد (يصل إليه الإبهام) ولوحة مشي في وضع التجوّل (السحب يلتفت فقط، فلا طريقة للتقدّم بلا لوحة)
function buildTouchUI() {
  const bar = $('mobileBar'), pad = $('walkPad'); if (!bar || bar.children.length) return;
  document.querySelectorAll('#modeSeg [data-mode]').forEach(src => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.mode = src.dataset.mode; b.textContent = src.textContent;
    b.addEventListener('click', () => { if (viewer?.built) viewer.setMode(b.dataset.mode); syncMode(); }); bar.append(b);
  });
  if (!pad) return;
  const hold = (b, input) => {
    const on = e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('down'); viewer?.setWalkInput(input); };
    const off = () => { b.classList.remove('down'); viewer?.setWalkInput({ forward: 0, turn: 0 }); };
    b.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, off);
    b.addEventListener('contextmenu', e => e.preventDefault());
  };
  for (const [cls, label, aria, input] of [['up', '▲', 'تقدّم', { forward: 1 }], ['dn', '▼', 'تراجع', { forward: -1 }], ['tl', '↺', 'التفت يسارًا', { turn: -1 }], ['tr', '↻', 'التفت يمينًا', { turn: 1 }]]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.setAttribute('aria-label', aria); hold(b, input); pad.append(b);
  }
}

function applySun() {
  const city = CITIES[$('city').value] || CITIES.riyadh, day = +$('day').value, hour = +$('hour').value;
  const s = sunPosition({ latitudeDeg: city.lat, dayOfYear: day, solarHour: hour });
  const date = new Date(Date.UTC(2026, 0, day));
  $('dateTxt').textContent = date.toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long' });
  const h = Math.floor(hour), mm = Math.round((hour - h) * 60); $('timeTxt').textContent = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('sunTxt').textContent = s.altitudeDeg > 0 ? `ارتفاع الشمس ${s.altitudeDeg.toFixed(0)}° واتجاهها ${s.azimuthDeg.toFixed(0)}° من الشمال.` : 'الشمس تحت الأفق في هذا الوقت.';
  viewer?.setSun({ azimuthDeg: s.azimuthDeg, altitudeDeg: s.altitudeDeg, north: doc?.north || 0 });
}

async function init() {
  doc = loadDoc();
  for (const [id, c] of Object.entries(CITIES)) $('city').append(new Option(`${c.ar} (${c.lat}°)`, id));
  if (!doc || !doc.walls.length) { say('لا يوجد تصميم معتمد بعد. ارجع إلى صفحة التصميم واعتمد تصميمًا.'); return; }
  say('جارٍ بناء المجسّم…');
  let v;
  try { v = await ensureViewer(); } catch { fallbackWithoutWebGL('تعذّر تشغيل العرض ثلاثي الأبعاد على هذا الجهاز (WebGL غير متاح). المخطط والمخرجات تعمل كاملة.'); return; }
  { const ex = exteriorTaste(); Object.assign(v.interior, { theme: loadInteriorTheme(), palette: loadInteriorChoice().palette, style: ex.style, taste: ex.taste }); }
  v.setDoc(doc); v.frameBuilding(); v.resize(); say('');
  buildInteriorUI(); syncInteriorUI(); buildDetailUI(); syncDetailUI(); buildTouchUI(); syncMode(); collapsePanels();
  applySun();
  if (doc.levels.length > 1) {
    $('levelBox').hidden = false;
    const seg = $('levelSeg');
    const mk = (label, ref) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); if (ref === 'all') v.showLevel('all'); else v.isolateLevel(ref); }); seg.append(b); return b; };
    mk('الكل', 'all').classList.add('on'); doc.levels.forEach(l => mk(l.name, l.id));
  }
  import('./draw/tour-ui.mjs').then(({ initDrawTourUI }) => { globalThis.__mizanTour = initDrawTourUI({ root: document, ensureViewer: async () => viewer, getEntry: () => doc.entry, planOptions: () => ({ story: true, cinematic: true, roomMs: 4200 }) }); }).catch(() => { $('autoTour').disabled = true; });
  addEventListener('resize', () => viewer?.resize());
}

document.querySelectorAll('#modeSeg [data-mode]').forEach(b => b.addEventListener('click', () => { if (viewer?.built) viewer.setMode(b.dataset.mode); syncMode(); }));
document.querySelectorAll('#styleSeg [data-style]').forEach(b => b.addEventListener('click', () => { viewer?.setStyle(b.dataset.style); applySun(); document.querySelectorAll('#styleSeg [data-style]').forEach(x => x.classList.toggle('on', x === b)); }));
for (const id of ['city', 'day', 'hour']) $(id).addEventListener('input', applySun);
$('shot').addEventListener('click', async () => {
  if (!viewer?.built) return;
  const b = await viewer.capturePNG(2), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mizan-3d.png'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
});
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
// لقطة عالية الجودة: المجسّم يُصيَّر بضعف الدقة مرتين ثم يُصغَّر (تنعيم فائق) مع خريطة ظل 4096؛ الواجهة الواقعية تُصيَّر بدقة مضاعفة وعيّنات تراكم أكثر
$('shotHQ').addEventListener('click', async () => {
  const msg = $('shotMsg'), btn = $('shotHQ'), show = t => { msg.hidden = !t; msg.textContent = t || ''; };
  const fr = $('facadeFrame');
  btn.disabled = true; show('جارٍ تصيير اللقطة عالية الجودة… قد يستغرق ذلك ثوانيَ على الأجهزة البطيئة.');
  try {
    if (fr && !fr.hidden) {
      // الواجهة الواقعية: تصيير ثابت بدقة مضاعفة وعيّنات تراكم أكثر (تنعيم فائق، ظلال ناعمة، تعتيم محيطي) داخل الإطار نفسه؛ وإن لم يتوفر تُلتقط اللوحة كما هي
      const hq = fr.contentWindow?.__facadeHQ, c = fr.contentDocument?.querySelector('canvas'); if (!c) throw new Error('الواجهة لم تكتمل بعد');
      if (typeof hq === 'function') {
        const r = await hq({ scale: 2, samples: 64, onProgress: k => show(`جارٍ تصيير اللقطة عالية الجودة… ${Math.round(k * 100)}٪`) });
        if (!r?.blob) throw new Error('تعذّر الالتقاط');
        download(r.blob, 'mizan-facade-hq.png'); show(`حُفظت صورة الواجهة ${r.width}×${r.height} بـ${r.samples} عيّنة (تصيير ${(r.renderMs / 1000).toFixed(1)} ث).`);
        await rememberCapture(r.blob, 'facade');
      } else {
        const b = await new Promise(res => c.toBlob(res, 'image/png')); if (!b) throw new Error('تعذّر الالتقاط');
        download(b, 'mizan-facade.png'); show(`حُفظت صورة الواجهة ${c.width}×${c.height}.`);
      }
    } else {
      if (!viewer?.built) throw new Error('المجسّم غير جاهز');
      const r = await viewer.captureHQ({ scale: 2, ss: 2 });
      download(r.blob, 'mizan-3d-hq.png'); show(`حُفظت اللقطة ${r.width}×${r.height} (تصيير ${(r.renderMs / 1000).toFixed(1)} ث).`);
      await rememberCapture(r.blob, 'model');
    }
  } catch (e) { show('تعذّرت اللقطة: ' + (e?.message || e)); }
  finally { btn.disabled = false; }
});
// صورة معمارية احترافية: اللقطة العالية من الزاوية الحالية (الواجهة الواقعية داخل إطارها، أو المجسّم في وضع «مدار») ← /api/photo.
// الزر يبقى مخفيًا إن لم تكن الخدمة مهيأة في الخادم. الوصف المرسل معرّفات من قوائم مغلقة فقط (الطراز والذوق وعدد الأدوار وقطع الحوش).
import('./photo-pro.mjs').then(async ({ initPhotoPro, describeForPhoto, PHOTO_PRO }) => {
  const fr = $('facadeFrame'), facadeOn = () => !!fr && !fr.hidden, srcParam = k => { try { return new URLSearchParams((fr.dataset.src || '').split('?')[1] || '').get(k); } catch { return null; } };
  let key = ''; try { const { designHash } = await import('./facade-j/facade-realism/variation.mjs'); key = String(designHash(loadDoc() || {})); } catch { /* بلا بصمة: لا تُربط الصورة بكتاب المشروع */ }
  globalThis.__mizanPhotoPro = await initPhotoPro({
    button: $('photoPro'), designKey: () => key,
    capture: async ({ onProgress } = {}) => {
      if (facadeOn()) {
        const hq = fr.contentWindow?.__facadeHQ, c = fr.contentDocument?.querySelector('canvas'); if (!c) throw new Error('الواجهة الواقعية لم تكتمل بعد. انتظر لحظات ثم أعد المحاولة.');
        const night = srcParam('night') === '1';
        if (typeof hq === 'function') { const r = await hq({ ...PHOTO_PRO.shot, onProgress }); if (!r?.blob) throw new Error('تعذّر التقاط الواجهة.'); return { blob: r.blob, view: 'facade', night }; }
        const blob = await new Promise(res => c.toBlob(res, 'image/png')); if (!blob) throw new Error('تعذّر التقاط الواجهة.'); return { blob, view: 'facade', night };
      }
      if (!viewer?.built) throw new Error('المجسّم غير جاهز بعد.');
      if (viewer.mode !== 'orbit') throw new Error('الصورة المعمارية تؤخذ من «واجهة واقعية» أو من وضع «مدار» للمجسم. انتقل إلى أحدهما ثم أعد المحاولة.');
      const r = await viewer.captureHQ({ scale: 1, ss: 2 }); return { blob: r.blob, view: 'model', night: false };
    },
    describe: ({ lighting, view }) => {
      const X = globalThis.__mizanExterior, d = loadDoc();
      return describeForPhoto({ style: (facadeOn() && srcParam('style')) || X?.style || X?.pick?.style, floors: (facadeOn() && +srcParam('floors')) || (d?.levels || []).length || undefined, lighting, view, exterior: X?.exterior, fixtures: d?.fixtures });
    },
  });
}).catch(() => { /* الميزة اختيارية: فشل تحميلها لا يمس العرض */ });
// صورة داخلية احترافية: بطاقة بجانب بطاقة الصورة المعمارية. يؤثَّث المجلس/الصالة/غرفة النوم الرئيسية من مستند التصميم نفسه (جدران وفتحات وأبعاد حقيقية)
// ويُلتقط بمستوى العين بمثيل عارض خاص، ثم يُرسل طلب kind:'interior' بوصف مغلق (الغرفة، الطراز، الإضاءة، عدد الفتحات والقطع). يبقى الزر مخفيًا إن لم تكن الخدمة الداخلية مفعّلة.
Promise.all([import('./photo-pro.mjs'), import('./interior/staging.mjs'), import('./interior/interior-view.mjs'), import('./interior/interior-fidelity.mjs')]).then(async ([{ initPhotoPro, describeForInterior }, { stageableRooms }, { captureInterior }, { checkInteriorFidelity }]) => {
  const d0 = loadDoc(); if (!d0) return;
  const ROOM_AR = { majlis: 'المجلس', living: 'الصالة', master: 'غرفة النوم الرئيسية' };
  let rooms = []; try { rooms = stageableRooms(d0).map(r => ({ id: r.type, label: ROOM_AR[r.type] })); } catch { /* مستند بلا غرف قابلة للتأثيث */ }
  const styleNow = () => { const X = globalThis.__mizanExterior, fr = $('facadeFrame'); try { return (fr && !fr.hidden && new URLSearchParams((fr.dataset.src || '').split('?')[1] || '').get('style')) || X?.style || X?.pick?.style || 'M'; } catch { return 'M'; } };
  let key = ''; try { const { designHash } = await import('./facade-j/facade-realism/variation.mjs'); key = String(designHash(d0)); } catch { /* بلا بصمة */ }
  globalThis.__mizanInteriorPhoto = await initPhotoPro({
    button: $('photoInterior'), kind: 'interior', rooms, designKey: () => key, store: localStorage, fidelity: checkInteriorFidelity,
    capture: async ({ room, lighting, onProgress } = {}) => { const r = await captureInterior({ doc: loadDoc(), type: room, style: styleNow(), lighting: lighting === 'day' || lighting === 'night' ? lighting : 'golden', onProgress }); return { blob: r.blob, view: 'model', landmarks: r.landmarks, extra: r.description }; },
    describe: ({ lighting, room, extra }) => describeForInterior({ room, style: styleNow(), lighting, counts: extra?.counts, pieces: extra?.pieces }),
  });
}).catch(() => { /* الميزة اختيارية */ });
$('toFinal').addEventListener('click', async () => {
  // يُعلَم العميل فورًا (اللقطة تأخذ وقتًا على الأجهزة البطيئة) ويُمنع الضغط المكرر
  const btn = $('toFinal'), label = btn.textContent; if (btn.disabled) return;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'جارٍ تجهيز المخرجات…';
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  addEventListener('pageshow', e => { if (e.persisted) { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = label; } }, { once: true });
  // لقطة المجسّم لصفحة المخرجات وكتاب المشروع
  try {
    localStorage.removeItem(SNAP_KEY);
    localStorage.removeItem(SNAPSHOT_KEY);
    const fr = document.getElementById('facadeFrame'), exterior = globalThis.__mizanExterior?.on;
    if (exterior && fr?.contentWindow?.__facadeHQ) {
      const shot = await fr.contentWindow.__facadeHQ({ scale: 1.5, samples: 32 });
      await rememberCapture(shot.blob, 'facade');
    } else if (viewer?.built) await rememberCapture(await viewer.capturePNG(1.5), 'model');
  } catch { /* اللقطة اختيارية */ }
  location.href = './final.html';
});
init();
