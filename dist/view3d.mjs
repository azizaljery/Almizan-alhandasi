// العرض ثلاثي الأبعاد المستقل بعد اعتماد التصميم: المجسّم من المخطط المعتمد نفسه، والشمس من الوقت والتاريخ.
import { parseDoc } from './draw/doc.mjs';
import { STUDIO_KEY } from './draw/handoff.mjs';
import { sunPosition, CITIES } from './sun.mjs';

const $ = id => document.getElementById(id);
const SNAP_KEY = 'mizan.studio.snap3d.v1';
let viewer = null, doc = null;

function loadDoc() { try { const raw = localStorage.getItem(STUDIO_KEY); return raw ? parseDoc(raw) : null; } catch { return null; } }
function say(t) { const m = $('threeMsg'); m.hidden = !t; m.textContent = t || ''; }

async function ensureViewer() {
  if (viewer) return viewer;
  const [{ loadThreeRuntime }, { DrawViewer }] = await Promise.all([import('./three-runtime.mjs'), import('./draw/viewer-draw.mjs')]);
  const THREE = await loadThreeRuntime();
  viewer = new DrawViewer($('threeHost'), { THREE, shadowSize: 2048, maxPixelRatio: 2, onState: ev => { if (ev.type === 'mode') syncMode(); } });
  globalThis.__mizanViewer = viewer;
  return viewer;
}
function syncMode() { document.querySelectorAll('#modeSeg [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === viewer?.mode)); }

function applySun() {
  const city = CITIES[$('city').value] || CITIES.riyadh, day = +$('day').value, hour = +$('hour').value;
  const s = sunPosition({ latitudeDeg: city.lat, dayOfYear: day, solarHour: hour });
  const date = new Date(Date.UTC(2026, 0, day));
  $('dateTxt').textContent = date.toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long' });
  const h = Math.floor(hour), mm = Math.round((hour - h) * 60); $('timeTxt').textContent = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('sunTxt').textContent = s.altitudeDeg > 0 ? `ارتفاع الشمس ${s.altitudeDeg.toFixed(0)}° واتجاهها ${s.azimuthDeg.toFixed(0)}° من الشمال.` : 'الشمس تحت الأفق في هذا الوقت.';
  viewer?.setSun({ azimuthDeg: s.azimuthDeg, altitudeDeg: Math.max(2, s.altitudeDeg), north: doc?.north || 0 });
}

async function init() {
  doc = loadDoc();
  for (const [id, c] of Object.entries(CITIES)) $('city').append(new Option(`${c.ar} (${c.lat}°)`, id));
  if (!doc || !doc.walls.length) { say('لا يوجد تصميم معتمد بعد. ارجع إلى صفحة التصميم واعتمد تصميمًا.'); return; }
  say('جارٍ بناء المجسّم…');
  let v;
  try { v = await ensureViewer(); } catch { say('تعذّر تشغيل العرض ثلاثي الأبعاد على هذا الجهاز (WebGL غير متاح). المخطط والمخرجات تعمل كاملة.'); return; }
  v.setDoc(doc); v.frameBuilding(); v.resize(); say('');
  applySun();
  if (doc.levels.length > 1) {
    $('levelBox').hidden = false;
    const seg = $('levelSeg');
    const mk = (label, ref) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); if (ref === 'all') v.showLevel('all'); else v.isolateLevel(ref); }); seg.append(b); return b; };
    mk('الكل', 'all').classList.add('on'); doc.levels.forEach(l => mk(l.name, l.id));
  }
  import('./draw/tour-ui.mjs').then(({ initDrawTourUI }) => { globalThis.__mizanTour = initDrawTourUI({ root: document, ensureViewer: async () => viewer, getEntry: () => doc.entry }); }).catch(() => { $('autoTour').disabled = true; });
  addEventListener('resize', () => viewer?.resize());
}

document.querySelectorAll('#modeSeg [data-mode]').forEach(b => b.addEventListener('click', () => { if (viewer?.built) viewer.setMode(b.dataset.mode); syncMode(); }));
document.querySelectorAll('#styleSeg [data-style]').forEach(b => b.addEventListener('click', () => { viewer?.setStyle(b.dataset.style); document.querySelectorAll('#styleSeg [data-style]').forEach(x => x.classList.toggle('on', x === b)); }));
for (const id of ['city', 'day', 'hour']) $(id).addEventListener('input', applySun);
$('shot').addEventListener('click', async () => {
  if (!viewer?.built) return;
  const b = await viewer.capturePNG(2), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mizan-3d.png'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
});
$('toFinal').addEventListener('click', async () => {
  // لقطة المجسّم لصفحة المخرجات وكتاب المشروع
  try {
    localStorage.removeItem(SNAP_KEY);
    if (viewer?.built) { const b = await viewer.capturePNG(1); const url = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); }); if (url && url.length < 3e6) localStorage.setItem(SNAP_KEY, url); }
  } catch { /* اللقطة اختيارية */ }
  location.href = './final.html';
});
init();
