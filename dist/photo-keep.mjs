// حفظ الصور الاحترافية مع المشروع: مصغّرة صغيرة (JPEG ≤ ~30 ك.ب) لكل تصميم ولكل نوع (خارجية/داخلية) في localStorage تحت مفتاح واحد،
// فتُحفظ تلقائيًا ضمن «مشاريعي السابقة» (المفتاح ضمن PROJECT_KEYS) وتُمسح مع «مشروع جديد». الصورة الكاملة تبقى في IndexedDB كما كانت (آخر صورة لكتاب المشروع).
// لا نظام تخزين جديد ولا حجم كبير: حد أعلى KEEP_MAX مصغّرات وKEEP_MAX_CHARS حرفًا. وحدة نقية؛ التخزين يُمرَّر.
export const KEEP_KEY = 'mizan.photo.keep.v1';
export const KEEP_MAX = 6;
export const KEEP_MAX_CHARS = 240_000;
export const THUMB = Object.freeze({ width: 360, quality: .62, maxChars: 40_000 });
const okThumb = t => typeof t === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(t) && t.length <= THUMB.maxChars;

export function listKept(store) {
  try { const v = JSON.parse(store.getItem(KEEP_KEY) || 'null'); return v && v.v === 1 && Array.isArray(v.items) ? v.items.filter(i => i && typeof i.kind === 'string' && okThumb(i.thumb)) : []; } catch { return []; }
}
/** يحفظ مصغّرة صورة تصميم (بديل نفس المفتاح والنوع). يعيد true إن حُفظت. */
export function rememberPhoto(store, rec) {
  if (!rec || typeof rec.kind !== 'string' || !/^(exterior|interior:(majlis|living|master))$/.test(rec.kind) || !okThumb(rec.thumb)) return false;
  const item = { key: String(rec.key || '').slice(0, 64), kind: rec.kind, thumb: rec.thumb, lighting: String(rec.lighting || '').slice(0, 12), ok: rec.ok === true ? true : rec.ok === false ? false : null, score: Number.isFinite(rec.score) ? rec.score : null, at: String(rec.at || new Date().toISOString()).slice(0, 32) };
  let items = [item, ...listKept(store).filter(i => !(i.key === item.key && i.kind === item.kind))].slice(0, KEEP_MAX);
  const size = l => l.reduce((n, i) => n + i.thumb.length + 120, 0);
  while (items.length > 1 && size(items) > KEEP_MAX_CHARS) items = items.slice(0, -1);
  try { store.setItem(KEEP_KEY, JSON.stringify({ v: 1, items })); return true; } catch { return false; }
}
/** غلاف المشروع: مصغّرة الواجهة الأحدث إن وُجدت وإلا أحدث مصغّرة. */
export function coverOf(items) { return (items || []).find(i => i.kind === 'exterior') || (items || [])[0] || null; }
/** من لقطة مشروع محفوظة في «السابقة» (item.data) إلى غلافها. */
export const coverOfSnapshot = data => { try { const v = JSON.parse(data?.[KEEP_KEY] || 'null'); return v?.v === 1 ? coverOf((v.items || []).filter(i => i && okThumb(i.thumb))) : null; } catch { return null; } };

/** مصغّرة JPEG من صورة (data URL/رابط) في المتصفح؛ null عند الفشل أو تجاوز الحجم. */
export async function makeThumb(src, T = THUMB) {
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const k = Math.min(1, T.width / Math.max(1, img.naturalWidth)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
    for (const q of [T.quality, .5, .4]) { const u = c.toDataURL('image/jpeg', q); if (okThumb(u)) return u; }
    return null;
  } catch { return null; }
}
