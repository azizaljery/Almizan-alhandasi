// «صورة معمارية احترافية»: لقطة عالية من مجسم تصميم العميل ← /api/photo ← صورة واقعية بالهندسة نفسها ← مقارنة قبل/بعد وتحميل.
// الصدق مع العميل: وسم دائم على الصورة (وفي الملف المحمَّل)، وفحص أمانة آلي يقارن خطوط الناتج بخطوط المجسم،
// وإن ضعف التطابق تُعاد المحاولة مرة واحدة ببذرة أخرى ويُعرض الأفضل مع تنبيه صريح.
// الزر يُخفى بصمت إن لم تكن الخدمة مهيأة في الخادم.
import { fidelityScore, FIDELITY } from './photo-fidelity.mjs';
export { fidelityScore, FIDELITY };

// ------------------------------------------------------------------------------------------------ ثوابت الضبط
export const PHOTO_PRO = Object.freeze({
  api: '/api/photo', statusApi: '/api/photo/status',
  maxSide: 1536, // الضلع الأطول للقطة المرسلة
  maxBytes: 1_150_000, // أقل من حد الخادم (1.2MB)
  jpegQuality: [0.9, 0.82, 0.74, 0.62],
  defaultTier: 'standard', // 'premium' = FLUX.2 dev (أغلى ~5 مرات)؛ يُعرض للعميل كزر «جودة أعلى»
  autoRetry: 1, // إعادة تلقائية واحدة ببذرة أخرى إن ضعف التطابق
  clientTimeoutMs: 150_000,
  shot: { scale: 2, samples: 40 }, // اللقطة العالية من الواجهة الواقعية
  storeMaxChars: 6_000_000, // حد حفظ آخر صورة في IndexedDB
});
export const DISCLAIMER = 'صورة محسّنة بالذكاء الاصطناعي من مجسم تصميمك — للتصوّر لا للتنفيذ';
export const LIGHTINGS = Object.freeze([{ id: 'golden', label: 'ساعة ذهبية' }, { id: 'day', label: 'نهار' }, { id: 'sunset', label: 'غروب' }, { id: 'night', label: 'ليل' }]);
const STYLE_IDS = ['N', 'H', 'S', 'C', 'M', 'J'], YARD_KINDS = ['pool', 'waterfall', 'lawn', 'carport', 'pergola', 'bbq', 'fountain'];
const ENUMS = { tone: ['light', 'warm', 'stone', 'dark'], openings: ['wide', 'balanced', 'private'], screen: ['yes', 'no'], entrance: ['grand', 'recessed', 'simple'], night: ['lit', 'calm'] };

/**
 * وصف التصميم المنظّم الذي يُرسل للخادم: معرّفات من قوائم مغلقة فقط (لا نص حر من العميل؛ ملاحظاته notes لا تُرسل).
 * style: معرّف الطراز المعروض (N/H/S/C/M/J)، exterior: prefs.exterior، fixtures: قطع الحوش في المخطط.
 */
export function describeForPhoto({ style, floors, lighting, exterior, fixtures, view } = {}) {
  const out = { style: STYLE_IDS.includes(style) ? style : 'M', lighting: LIGHTINGS.some(l => l.id === lighting) ? lighting : 'golden', view: view === 'model' ? 'model' : 'facade' };
  const n = Math.round(Number(floors)); if (n >= 1 && n <= 3) out.floors = n;
  for (const [k, ids] of Object.entries(ENUMS)) if (ids.includes(exterior?.[k])) out[k] = exterior[k];
  const yard = [...new Set((fixtures || []).map(f => f?.kind).filter(k => YARD_KINDS.includes(k)))];
  if (yard.length) out.yard = yard;
  return out;
}

/** مقاس التصغير مع حفظ النسبة (الضلع الأطول ≤ max). */
export function fitSize(w, h, max = PHOTO_PRO.maxSide) { const k = Math.min(1, max / Math.max(w, h)); return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }; }

// ------------------------------------------------------------------------------------------------ أدوات المتصفح
const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('تعذّر قراءة الصورة')); i.src = src; });
const blobToDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('تعذّر قراءة الصورة')); r.readAsDataURL(blob); });
function pixels(img, w = 384, h = 256) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h); return x.getImageData(0, 0, w, h); }

/** يصغّر اللقطة إلى الحد ويحوّلها JPEG تحت حد الحجم. يعيد { dataUrl, width, height }. */
export async function prepareShot(blob, P = PHOTO_PRO) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url), { width, height } = fitSize(img.naturalWidth, img.naturalHeight, P.maxSide);
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const x = c.getContext('2d'); x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, width, height); x.drawImage(img, 0, 0, width, height);
    for (const q of P.jpegQuality) { const dataUrl = c.toDataURL('image/jpeg', q); if ((dataUrl.length - 23) * 3 / 4 <= P.maxBytes) return { dataUrl, width, height }; }
    throw new Error('اللقطة أكبر من الحد المسموح حتى بعد ضغطها.');
  } finally { URL.revokeObjectURL(url); }
}

/** فحص الأمانة بين لقطة المجسم والصورة الناتجة (كلاهما data URL أو رابط). */
export async function checkFidelity(beforeUrl, afterUrl) {
  const [a, b] = await Promise.all([loadImage(beforeUrl), loadImage(afterUrl)]);
  return fidelityScore(pixels(a), pixels(b));
}

/** الصورة للتحميل وعليها الوسم محروقًا في أسفلها (لا يمكن فصله عن الصورة). */
export async function stampedBlob(afterUrl, note = '') {
  const img = await loadImage(afterUrl), W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const fs = Math.max(13, Math.round(W / 62)), pad = Math.round(fs * .7), bar = fs + pad * 2;
  x.fillStyle = 'rgba(6,27,22,.72)'; x.fillRect(0, H - bar, W, bar);
  x.fillStyle = '#f6f2ea'; x.font = `500 ${fs}px "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif`; x.textBaseline = 'middle'; x.direction = 'rtl'; x.textAlign = 'right';
  x.fillText('الميزان الهندسي · ' + DISCLAIMER + (note ? ' · ' + note : ''), W - pad, H - bar / 2, W - pad * 2);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('تعذّر تجهيز الصورة للتحميل')), 'image/jpeg', .93));
}

// آخر صورة احترافية (لكتاب المشروع): IndexedDB بحد حجم؛ الفشل صامت والصورة تبقى في الذاكرة.
const DB_NAME = 'mizan-photo-pro', STORE = 'last';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export async function saveLastPhoto(rec) {
  try { if (!rec?.image || rec.image.length > PHOTO_PRO.storeMaxChars) return false; const db = await idb(); await new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(rec, 'last'); t.oncomplete = res; t.onerror = () => rej(t.error); }); db.close(); return true; } catch { return false; }
}
export async function loadLastPhoto() {
  try { const db = await idb(); const v = await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get('last'); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); db.close(); return v; } catch { return null; }
}

// ------------------------------------------------------------------------------------------------ الواجهة
const CSS = `
.pp-dlg{border:0;padding:0;background:transparent;max-width:none;max-height:none;width:100vw;height:100dvh;margin:0;color:var(--mz-ink,#17332a)}
.pp-dlg [hidden]{display:none!important}
.pp-dlg::backdrop{background:rgba(6,27,22,.86)}
.pp-panel{box-sizing:border-box;width:min(1180px,100vw - 24px);max-height:calc(100dvh - 24px);margin:12px auto;background:var(--mz-paper,#fffdf8);border:1px solid var(--mz-brass,#a8814a);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden}
.pp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:var(--mz-green-night,#061b16);color:var(--mz-ivory,#f6f2ea);border-bottom:2px solid var(--mz-gold,#d9ba79)}
.pp-head h2{margin:0;font-size:17px;font-weight:600;letter-spacing:0}.pp-head small{display:block;font-size:12px;font-weight:400;color:var(--mz-gold-light,#edce89);margin-top:2px}
.pp-x{border:1px solid #ffffff40;background:transparent;color:inherit;border-radius:10px;padding:7px 12px;font:inherit;font-size:14px;cursor:pointer;flex:none}
.pp-x:hover{border-color:var(--mz-gold,#d9ba79)}
.pp-body{padding:14px 18px 16px;overflow:auto;display:flex;flex-direction:column;gap:12px;align-items:center}
.pp-cmp{position:relative;direction:ltr;width:min(100%,calc((100dvh - 285px) * var(--pp-ar,1.5)));min-width:min(100%,260px);aspect-ratio:var(--pp-ar,1.5);background:#e9e4d8;border-radius:12px;overflow:hidden;--pp-p:50%;user-select:none;-webkit-user-select:none}
.pp-cmp img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.pp-before{clip-path:inset(0 calc(100% - var(--pp-p)) 0 0)}
.pp-handle{position:absolute;top:0;bottom:0;left:var(--pp-p);width:2px;margin-left:-1px;background:var(--mz-gold-light,#edce89);box-shadow:0 0 0 1px rgba(6,27,22,.35);pointer-events:none}
.pp-handle::after{content:"";position:absolute;top:50%;left:50%;width:38px;height:38px;margin:-19px;border-radius:50%;background:var(--mz-gold,#d9ba79);border:2px solid var(--mz-green-night,#061b16);box-shadow:0 4px 14px rgba(0,0,0,.35);background-image:linear-gradient(90deg,transparent 44%,var(--mz-green-night,#061b16) 44% 56%,transparent 56%)}
.pp-range{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize;touch-action:pan-y}
.pp-range:focus-visible+.pp-handle::after{outline:3px solid #fff;outline-offset:2px}
.pp-tag{position:absolute;top:10px;padding:4px 10px;border-radius:999px;background:rgba(6,27,22,.72);color:var(--mz-ivory,#f6f2ea);font-size:12.5px;direction:rtl;pointer-events:none}
.pp-tagB{left:10px}.pp-tagA{right:10px;background:var(--mz-gold,#d9ba79);color:var(--mz-green-night,#061b16);font-weight:600}
.pp-stamp{position:absolute;inset:auto 0 0 0;margin:0;padding:7px 12px;background:rgba(6,27,22,.72);color:var(--mz-ivory,#f6f2ea);font-size:12.5px;line-height:1.5;direction:rtl;text-align:right;pointer-events:none}
.pp-wait{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;background:rgba(6,27,22,.62);color:var(--mz-ivory,#f6f2ea);direction:rtl;text-align:center}
.pp-wait b{font-size:16px;font-weight:600;max-width:34em;line-height:1.7}.pp-wait span{font-size:13.5px;color:var(--mz-gold-light,#edce89);font-variant-numeric:tabular-nums}
.pp-spin{width:34px;height:34px;border-radius:50%;border:3px solid #ffffff33;border-top-color:var(--mz-gold,#d9ba79);animation:pp-spin 1s linear infinite}
@keyframes pp-spin{to{transform:rotate(360deg)}}
.pp-note{margin:0;width:100%;font-size:13.5px;line-height:1.7;color:#57564c;text-align:center}
.pp-note.warn{color:#7a4b00;background:#fff4dc;border:1px solid #e8c98a;border-radius:10px;padding:8px 12px}
.pp-note.err{color:#7a1f14;background:#fdecea;border:1px solid #efb8b0;border-radius:10px;padding:8px 12px}
.pp-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center;width:100%}
.pp-row .pp-lbl{font-size:13px;color:#57564c}
.pp-seg{display:inline-flex;flex-wrap:wrap;gap:6px;justify-content:center}
.pp-seg button{border:1px solid var(--mz-line,#e6dfd0);background:#fff;color:inherit;border-radius:999px;padding:7px 14px;font:inherit;font-size:13.5px;cursor:pointer}
.pp-seg button[aria-pressed=true]{background:var(--mz-green-deep,#143428);border-color:var(--mz-green-deep,#143428);color:#fff}
.pp-dlg .btn{min-height:42px}.pp-dlg button:disabled{opacity:.5;cursor:wait}
.pp-dlg :focus-visible{outline:2px solid var(--mz-brass,#a8814a);outline-offset:2px}
#photoPro{background:linear-gradient(135deg,var(--mz-green-deep,#143428),var(--mz-green-night,#061b16));color:var(--mz-gold-light,#edce89);border-color:var(--mz-gold,#d9ba79);font-weight:700;padding:11px 16px}
#photoPro:hover{color:#fff}
@media(max-width:640px){.pp-panel{width:100vw;max-height:100dvh;margin:0;border-radius:0;border:0;min-height:100dvh}.pp-body{padding:12px}.pp-cmp{width:100%}.pp-head h2{font-size:15.5px}.pp-row .btn{flex:1 1 44%;justify-content:center}}
@media(prefers-reduced-motion:reduce){.pp-spin{animation:none;border-top-color:#ffffff33;border-right-color:var(--mz-gold,#d9ba79)}}
`;
const el = (tag, attrs = {}, kids = []) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k === 'class') n.className = v; else if (v === true) n.setAttribute(k, ''); else if (v !== false && v != null) n.setAttribute(k, v); } n.append(...kids); return n; };

/**
 * يربط الزر بالخدمة.
 *   button   : زر «صورة معمارية احترافية» (يُظهر فقط إن كانت الخدمة مهيأة)
 *   capture  : async ({ onProgress }) → { blob, view: 'facade'|'model', night?: boolean }  اللقطة العالية من الزاوية الحالية
 *   describe : ({ lighting, view }) → وصف منظّم (describeForPhoto)
 *   designKey: () → بصمة التصميم الحالي (لربط الصورة بكتاب المشروع)
 */
export async function initPhotoPro({ button, capture, describe, designKey = () => '', fetchImpl = (...a) => fetch(...a), P = PHOTO_PRO } = {}) {
  if (!button) return null;
  let status = null;
  try { const r = await fetchImpl(P.statusApi, { headers: { Accept: 'application/json' } }); if (r.ok) status = await r.json(); } catch { /* لا خدمة: يبقى الزر مخفيًا */ }
  if (!status?.configured) { button.hidden = true; return { available: false }; }
  const tiers = Array.isArray(status.tiers) && status.tiers.length ? status.tiers : ['standard'];
  if (!document.getElementById('pp-css')) document.head.append(el('style', { id: 'pp-css', text: CSS }));
  button.hidden = false;

  // النافذة
  const before = el('img', { class: 'pp-before', alt: 'لقطة مجسم تصميمك' }), after = el('img', { class: 'pp-after', alt: 'الصورة المعمارية المحسّنة بالذكاء الاصطناعي' });
  const range = el('input', { class: 'pp-range', type: 'range', min: '0', max: '100', value: '50', 'aria-label': 'شريط المقارنة بين المجسم والصورة' });
  const waitMsg = el('b'), waitSec = el('span'), wait = el('div', { class: 'pp-wait', role: 'status', 'aria-live': 'polite' }, [el('div', { class: 'pp-spin', 'aria-hidden': 'true' }), waitMsg, waitSec]);
  const tagB = el('span', { class: 'pp-tag pp-tagB', text: 'المجسم' }), tagA = el('span', { class: 'pp-tag pp-tagA', text: 'الصورة' }), stamp = el('p', { class: 'pp-stamp', text: DISCLAIMER });
  const cmp = el('div', { class: 'pp-cmp' }, [after, before, range, el('div', { class: 'pp-handle', 'aria-hidden': 'true' }), tagB, tagA, stamp, wait]);
  const note = el('p', { class: 'pp-note', role: 'status', 'aria-live': 'polite' });
  const seg = el('div', { class: 'pp-seg', role: 'group', 'aria-label': 'جرّب إضاءة أخرى' }, LIGHTINGS.map(l => el('button', { type: 'button', 'data-l': l.id, 'aria-pressed': 'false', text: l.label })));
  const bDown = el('button', { class: 'btn gold', type: 'button', id: 'ppDownload', text: 'تحميل الصورة' }), bRedo = el('button', { class: 'btn', type: 'button', id: 'ppRedo', text: 'أعد التوليد' });
  const bHi = el('button', { class: 'btn', type: 'button', id: 'ppPremium', text: 'جودة أعلى (أبطأ)', hidden: !tiers.includes('premium') || P.defaultTier === 'premium' });
  const bClose = el('button', { class: 'pp-x', type: 'button', id: 'ppClose', text: 'إغلاق' });
  const dlg = el('dialog', { class: 'pp-dlg', id: 'ppDialog', dir: 'rtl', 'aria-labelledby': 'ppTitle' }, [el('div', { class: 'pp-panel' }, [
    el('div', { class: 'pp-head' }, [el('h2', { id: 'ppTitle' }, ['صورة معمارية احترافية', el('small', { text: 'من مجسم تصميمك أنت — اسحب الشريط للمقارنة' })]), bClose]),
    el('div', { class: 'pp-body' }, [cmp, note,
      el('div', { class: 'pp-row' }, [el('span', { class: 'pp-lbl', text: 'جرّب إضاءة أخرى:' }), seg]),
      el('div', { class: 'pp-row' }, [bDown, bRedo, bHi]),
      el('p', { class: 'pp-note', text: 'الذكاء الاصطناعي يحسّن الخامات والضوء والنبات، وقد يغيّر تفاصيل صغيرة. المرجع دائمًا مخططك ومجسمك، والصورة ليست مستندًا للتنفيذ.' })]),
  ])]);
  document.body.append(dlg);

  const S = { shot: null, view: 'facade', lighting: 'golden', tier: P.defaultTier, result: null, busy: false, ctl: null, timer: 0, job: null };
  const setP = v => cmp.style.setProperty('--pp-p', v + '%');
  range.addEventListener('input', () => setP(range.value));
  const controls = on => { for (const b of [bDown, bRedo, bHi, ...seg.children]) b.disabled = !on; bDown.disabled = !on || !S.result; };
  const paintSeg = () => { for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.l === S.lighting)); };
  function waiting(text) {
    wait.hidden = false; waitMsg.textContent = text; const t0 = Date.now(); clearInterval(S.timer);
    const tick = () => { waitSec.textContent = 'مضى ' + Math.round((Date.now() - t0) / 1000) + ' ث'; }; tick(); S.timer = setInterval(tick, 1000);
  }
  const idle = () => { clearInterval(S.timer); wait.hidden = true; };
  const say = (text, cls = '') => { note.className = 'pp-note' + (cls ? ' ' + cls : ''); note.textContent = text; };
  function showResult(r) {
    S.result = r; after.src = r.image; after.hidden = false; range.disabled = false; range.value = 50; setP(50); tagA.hidden = false; stamp.hidden = false;
    const f = r.fidelity;
    if (!f) say('تعذّر فحص مطابقة الصورة لمجسمك آليًا؛ قارنها بالمجسم بسحب الشريط.', 'warn');
    else if (!f.ok) say('تنبيه: هذه الصورة قد تختلف عن تصميمك في بعض التفاصيل (فحص آلي لخطوط الكتلة والفتحات' + (r.attempts > 1 ? '، بعد محاولتين وعرض الأقرب' : '') + '). قارنها بالمجسم بسحب الشريط، أو أعد التوليد.', 'warn');
    else say('فحص آلي تقريبي: خطوط الكتلة والفتحات في الصورة قريبة من مجسمك. اسحب الشريط لتتأكد بنفسك.');
  }
  async function request(lighting, tier, seed, signal) {
    const body = { image: S.shot.dataUrl, width: S.shot.width, height: S.shot.height, tier, seed, description: describe({ lighting, view: S.view }) };
    let r; try { r = await fetchImpl(P.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }); }
    catch { throw new Error(signal.aborted ? (signal.reason === 'closed' ? 'closed' : 'تأخر توليد الصورة أكثر من المتوقع. أعد المحاولة.') : 'تعذّر الاتصال بخدمة الصورة. تحقق من الشبكة ثم أعد المحاولة.'); }
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.image) throw new Error(data?.error || 'تعذّر توليد الصورة الآن. أعد المحاولة لاحقًا.');
    return data;
  }
  async function generate({ recapture = false } = {}) {
    if (S.busy) return; S.busy = true; controls(false); S.result = null; say('');
    after.hidden = true; tagA.hidden = true; range.disabled = true; setP(100);
    const ctl = S.ctl = new AbortController(), kill = setTimeout(() => ctl.abort('timeout'), P.clientTimeoutMs);
    try {
      if (recapture || !S.shot) {
        waiting('ألتقط مجسم تصميمك بجودة عالية من الزاوية الحالية…');
        const c = await capture({ onProgress: k => { waitMsg.textContent = `ألتقط مجسم تصميمك بجودة عالية… ${Math.round(k * 100)}٪`; } });
        if (!c?.blob) throw new Error('تعذّر التقاط المجسم. انتظر اكتمال العرض ثم أعد المحاولة.');
        S.shot = await prepareShot(c.blob, P); S.view = c.view === 'model' ? 'model' : 'facade';
        if (c.night && S.lighting === 'golden') S.lighting = 'night';
        before.src = S.shot.dataUrl; cmp.style.setProperty('--pp-ar', String(S.shot.width / S.shot.height));
      }
      paintSeg();
      waiting('أحوّل مجسم تصميمك إلى صورة معمارية… قد يستغرق حتى دقيقة');
      let best = null;
      for (let attempt = 1; attempt <= 1 + P.autoRetry; attempt++) {
        const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
        let data; try { data = await request(S.lighting, S.tier, seed, ctl.signal); } catch (e) { if (best && e.message !== 'closed') break; throw e; }
        let fidelity = null; try { fidelity = await checkFidelity(S.shot.dataUrl, data.image); } catch { /* يُعرض التنبيه العام */ }
        const cand = { image: data.image, fidelity, lighting: S.lighting, tier: data.tier || S.tier, model: data.model || '', seed: data.seed ?? seed, attempts: attempt };
        if (!best || (cand.fidelity?.score ?? -1) > (best.fidelity?.score ?? -1)) best = { ...cand }; else best.attempts = attempt;
        if (!fidelity || fidelity.ok) break;
        if (attempt <= P.autoRetry) waiting('الصورة الأولى ابتعدت عن خطوط مجسمك؛ أعيد المحاولة مرة واحدة لأقرب نتيجة…');
      }
      idle(); showResult(best);
      saveLastPhoto({ key: designKey(), image: best.image, lighting: best.lighting, tier: best.tier, score: best.fidelity?.score ?? null, ok: best.fidelity?.ok ?? null, at: new Date().toISOString(), disclaimer: DISCLAIMER });
    } catch (e) {
      idle(); if (e.message !== 'closed') say(e.message || 'تعذّر توليد الصورة.', 'err');
    } finally { clearTimeout(kill); S.busy = false; S.ctl = null; controls(true); }
  }
  function close() { S.ctl?.abort('closed'); clearInterval(S.timer); if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', () => { S.ctl?.abort('closed'); clearInterval(S.timer); button.focus(); });
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  bClose.addEventListener('click', close);
  seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || S.busy || b.dataset.l === S.lighting) return; S.lighting = b.dataset.l; S.job = generate(); });
  bRedo.addEventListener('click', () => { S.job = generate(); });
  bHi.addEventListener('click', () => { S.tier = 'premium'; bHi.hidden = true; S.job = generate(); });
  bDown.addEventListener('click', async () => {
    if (!S.result) return; bDown.disabled = true;
    try {
      const warn = S.result.fidelity && !S.result.fidelity.ok ? 'قد تختلف عن التصميم في بعض التفاصيل' : '';
      const blob = await stampedBlob(S.result.image, warn), a = el('a', { href: URL.createObjectURL(blob), download: 'mizan-architectural-photo.jpg' });
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    } catch (e) { say(e.message || 'تعذّر تجهيز الصورة للتحميل.', 'err'); }
    finally { bDown.disabled = false; }
  });
  button.addEventListener('click', () => {
    if (dlg.open) return; S.tier = P.defaultTier; bHi.hidden = !tiers.includes('premium') || P.defaultTier === 'premium';
    S.lighting = 'golden'; dlg.showModal(); bClose.focus();
    S.job = Promise.resolve(S.job).then(() => dlg.open && generate({ recapture: true })); // إن أُغلقت النافذة أثناء توليد سابق يُنتظر انتهاء إلغائه
  });
  return { available: true, tiers, dialog: dlg, get state() { return S; } };
}
