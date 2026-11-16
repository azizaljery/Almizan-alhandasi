// واجهة «اعرضه في أرضي بالواقع المعزز» في صفحة العرض ثلاثي الأبعاد. كل شيء يجري داخل المتصفح: لا يُرسل المستند ولا النموذج لأي خادم.
// مسارات: Android/Chrome → WebXR (ar-viewer) · iPhone/iPad Safari → USDZ + Quick Look · غير ذلك → رسالة صادقة + تنزيل GLB.
import { parseDoc } from './draw/doc.mjs';
import { STUDIO_KEY } from './draw/handoff.mjs';
import { buildArModel } from './ar-model.mjs';
import { encodeGlb } from './ar-glb.mjs';
import { encodeUsdz } from './ar-usdz.mjs';
import { detectArSupport, AR_MODES, AR_MESSAGES } from './ar-support.mjs';

export const AR_NOTE = 'العرض تقريبي لتصور الحجم، وليس مخططًا تنفيذيًا.';
const GLB_NAME = 'mizan-villa-1to1.glb', USDZ_NAME = 'mizan-villa-1to1.usdz';
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // صورة 1×1 شفافة: Quick Look يشترط img داخل الرابط

function loadDoc() { try { const raw = localStorage.getItem(STUDIO_KEY); return raw ? parseDoc(raw) : null; } catch { return null; } }

export async function initArUi({ root = document } = {}) {
  const $ = id => root.getElementById(id), box = $('arBox'); if (!box) return null;
  const arBtn = $('arBtn'), glbBtn = $('glbBtn'), status = $('arStatus'), overlay = $('arOverlay');
  const say = (t, bad = false) => { status.textContent = t || ''; status.dataset.kind = bad ? 'warn' : ''; };
  if (!loadDoc()) { box.hidden = true; return null; }
  const sup = await detectArSupport();
  box.dataset.mode = sup.mode; box.dataset.platform = sup.platform;
  if (sup.mode === AR_MODES.NONE) { arBtn.setAttribute('aria-disabled', 'true'); arBtn.classList.add('is-off'); say(sup.message, true); }
  else say(sup.mode === AR_MODES.WEBXR ? 'سيُطلب إذن الكاميرا. وجّه الهاتف إلى أرض مفتوحة ثم ثبّت المبنى بمقياسه الحقيقي.' : 'سيفتح المبنى في معاينة الواقع المعزز من Apple (Quick Look) بمقياسه الحقيقي.');
  const model = () => { const d = loadDoc(); if (!d) throw new Error('لا يوجد تصميم معتمد في هذا المتصفح.'); return buildArModel(d); };
  const save = (bytes, type, name) => { const url = URL.createObjectURL(new Blob([bytes], { type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); };

  glbBtn.addEventListener('click', () => {
    try { const m = model(); save(encodeGlb(m), 'model/gltf-binary', GLB_NAME); say(`نُزِّل ملف GLB بمقياس 1:1 بالمتر (${m.size[0].toFixed(1)} × ${m.size[2].toFixed(1)} م، ارتفاع ${m.size[1].toFixed(1)} م). افتحه في أي عارض ثلاثي الأبعاد.`); }
    catch (e) { say('تعذّر إنشاء الملف: ' + (e?.message || 'خطأ غير متوقع'), true); }
  });

  let running = null;
  arBtn.addEventListener('click', async () => {
    if (sup.mode === AR_MODES.NONE) { say(sup.message, true); return; }
    if (running) return;
    try {
      const m = model();
      if (sup.mode === AR_MODES.QUICKLOOK) {
        const url = URL.createObjectURL(new Blob([encodeUsdz(m)], { type: 'model/vnd.usdz+zip' })), a = document.createElement('a');
        a.rel = 'ar'; a.href = url; a.download = USDZ_NAME; a.style.display = 'none'; const img = document.createElement('img'); img.src = PIXEL; img.alt = ''; a.append(img); document.body.append(a);
        a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000); return;
      }
      const [{ loadThreeRuntime }, { startWebXrAr }] = await Promise.all([import('./three-runtime.mjs'), import('./ar-viewer.mjs')]);
      say('جارٍ بدء الواقع المعزز…');
      running = await startWebXrAr({ THREE: await loadThreeRuntime(), model: m, overlay });
      running.session.addEventListener('end', () => { running = null; say('انتهت جلسة الواقع المعزز.'); });
      say('');
    } catch (e) { running = null; say(e?.message && /[؀-ۿ]/.test(e.message) ? e.message : AR_MESSAGES.failed, true); }
  });
  return { sup };
}

initArUi().catch(() => {});
