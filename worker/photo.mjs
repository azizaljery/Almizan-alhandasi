// «صورة معمارية احترافية»: لقطة من مجسم تصميم العميل ← نموذج توليد صور (Cloudflare Workers AI / FLUX.2) ← صورة واقعية بالهندسة نفسها.
// المسارات:  POST /api/photo   و   GET /api/photo/status
//
// ما لم يُتحقق منه بعد (لا وصول إلى Workers AI من بيئة التطوير؛ كل الاختبارات بمزوّد وهمي):
//   - أسماء حقول الدخل الدقيقة لكل نموذج (prompt / input_image_0 / width / height / steps / seed) وشكل الخرج ({ image: base64 }).
//   - جودة الصورة، ومدى حفظ النموذج لهندسة البيت، وزمن التوليد.
// لذلك كل ما قد يحتاج ضبطًا بعد أول تجربة حية مجموع في الثوابت التالية وفي ADAPTERS، وأي شكل استجابة غير متوقع يُسجَّل في console.
//
// الخصوصية: الصورة تمرّ إلى النموذج وتعود للعميل فقط؛ لا تُخزَّن في D1 ولا في أي مكان في الخادم.

// ------------------------------------------------------------------------------------------------ ثوابت الضبط
export const PHOTO_TIERS = Object.freeze({
  standard: { model: '@cf/black-forest-labs/flux-2-klein-9b', envKey: 'PHOTO_MODEL_STANDARD' },
  premium: { model: '@cf/black-forest-labs/flux-2-dev', envKey: 'PHOTO_MODEL_PREMIUM' },
});
/** مهايئ كل عائلة نماذج: الحقول التي تُرسل في multipart. steps = null يعني «لا ترسل الحقل» (النموذج المقطَّر يحدد خطواته). */
export const ADAPTERS = Object.freeze({
  'flux-2-dev': { steps: 28, stepsEnv: 'PHOTO_STEPS_PREMIUM', imageField: 'input_image_0', sendSeed: true, sendSize: true },
  'flux-2-klein': { steps: null, imageField: 'input_image_0', sendSeed: true, sendSize: true },
  generic: { steps: null, imageField: 'input_image_0', sendSeed: true, sendSize: true },
});
export const PHOTO_LIMITS = Object.freeze({
  maxImageBytes: 1_200_000, // اللقطة بعد تصغيرها في المتصفح إلى 1536 على الضلع الأطول
  maxBodyBytes: 1_700_000, // base64 يزيد الحجم بالثلث + الوصف
  maxSide: 1536, minSide: 256, sizeStep: 16, // maxSide = الضلع الأطول للّقطة الداخلة
  outSide: Object.freeze({ standard: 1536, premium: 2048 }), maxOutPixels: 4_000_000, // الضلع الأطول للخرج المطلوب من النموذج (يُكبَّر إليه حتى لو كانت اللقطة أصغر)
  providerRetries: 1, retryDelayMs: 400, // إعادة واحدة عند خطأ مزوّد عابر
  perMinute: 3, perDayPerIp: 20, dailyCapDefault: 40, dailyCapMax: 2000,
  timeoutMs: 110_000, maxBuckets: 5000,
});
const DEFAULT_ALLOWED_ORIGINS = ['https://almizan-handasi.aljeryabod.workers.dev', 'https://al-mizan-al-handasi.aljeryabod.chatgpt.site'];

// ------------------------------------------------------------------------------------------------ البرومبت (قوائم مغلقة فقط)
// لا يدخل البرومبت أي نص يكتبه العميل: كل حقل معرّف من قائمة مغلقة يقابله نص ثابت هنا.
export const PHOTO_STYLES = Object.freeze({
  N: { name: 'Najdi', text: 'traditional Najdi architecture of central Arabia: thick earthen walls finished in hand-troweled mud plaster with fine straw texture, stepped triangular crenellated parapets (shurfat), small deep-set windows with wooden shutters, rows of small triangular ventilation openings, a carved and painted Najdi wooden door, thin white gypsum trim bands' },
  H: { name: 'Hijazi', text: 'historic Hijazi architecture of Jeddah (Al-Balad): light matte lime-plastered coral-stone walls, projecting carved teak rawasheen (roshan bay windows) with fine mashrabiya latticework, tall timber doors with carved panels, restrained plaster cornices' },
  S: { name: 'Salmani', text: 'Salmani architecture of Riyadh: a contemporary reading of Najdi tradition with solid cubic volumes clad in sand-colored Riyadh limestone with visible coursing, crisp triangular crenellations and recessed horizontal bands, deep narrow vertical openings, shaded recesses, dark bronze metalwork' },
  C: { name: 'Classical', text: 'refined neoclassical villa architecture: strict symmetry, cream limestone ashlar with fine visible joints and subtle natural variation, stone columns and pilasters, moulded cornices and window surrounds, stone balustrades, a formal entrance portico' },
  M: { name: 'Light contemporary', text: 'light contemporary architecture: smooth fine-textured mineral plaster in soft off-white, clean planar volumes, slim dark aluminium window frames, generous glazing, thin projecting canopy slabs, restrained warm wood-slat accents' },
  J: { name: 'Stone contemporary', text: 'stone contemporary architecture: large-format honed natural travertine and limestone cladding with legible veining and fine joints, bronze-anodized metal fins and trims, floor-to-ceiling glazing, warm timber soffits, sharp shadow gaps' },
});
export const PHOTO_TONES = Object.freeze({
  auto: '',
  light: 'Material palette: white and ivory finishes with soft warm undertones.',
  warm: 'Material palette: warm earthy sand, beige and clay tones.',
  stone: 'Material palette: exposed natural stone with visible coursing, subtle color variation and fine joints.',
  dark: 'Material palette: light walls contrasted with dark bronze metal and rich walnut-toned wood accents.',
});
export const PHOTO_OPENINGS = Object.freeze({
  auto: '', balanced: '',
  wide: 'The existing large glazed openings read as clear high-quality glass with soft reflections of the sky.',
  private: 'The existing openings stay small and deeply recessed, emphasizing privacy and solid wall mass.',
});
export const PHOTO_SCREEN = Object.freeze({ auto: '', no: '', yes: 'Existing screens in front of the glazing read as finely crafted patterned mashrabiya or slender louvres casting delicate shadows.' });
export const PHOTO_ENTRANCE = Object.freeze({
  auto: '', simple: 'The existing entrance is calm and understated.',
  grand: 'The existing main entrance reads as stately, with a finely detailed solid door.',
  recessed: 'The existing main entrance sits in a deep shaded recess.',
});
export const PHOTO_NIGHT = Object.freeze({ auto: '', lit: 'Architectural lighting washes the walls and highlights the details.', calm: 'Exterior lighting is soft, low and warm.' });
// الميزان بعد التجربة الحية الأولى (خرج مشبع برتقالي بظلال مسحوقة): ضوء ناعم طبيعي وألوان هادئة؛ «الساعة الذهبية» دفء خفيف لا برتقالي.
export const PHOTO_LIGHTING = Object.freeze({
  golden: 'Lighting: late-afternoon sun, soft and natural with only a slight warmth, under a pale blue sky; long gentle shadows that stay open and detailed; no orange cast.',
  day: 'Lighting: soft clear daylight under a pale blue sky with thin high haze; neutral white balance; gentle open shadows.',
  sunset: 'Lighting: shortly after sunset, soft even ambient light, a pastel sky with a faint warm band at the horizon, a few interior lights just visible; the facade stays evenly readable; no saturated orange or purple.',
  night: 'Lighting: early blue hour, a deep blue sky that is not black, soft warm light from the windows and discreet low exterior lights; facade materials remain clearly readable; no blown highlights, no neon colors.',
});
export const PHOTO_LOOK = 'Look: calm editorial architectural photography with natural soft light, neutral white balance, balanced exposure, realistic muted colors, visible shadow detail and true-to-life material tones; no oversaturation, no HDR look, no heavy contrast, no crushed blacks, no heavy vignette, no lens flare, no dramatic color grading.';
export const PHOTO_YARD = Object.freeze({
  pool: 'the swimming pool already shown, with clear turquoise water and a stone coping',
  waterfall: 'the water feature already shown, with gently flowing water',
  lawn: 'the lawn area already shown, as trimmed green grass',
  carport: 'the car shade already shown, as a slim tensile or timber-slat canopy',
  pergola: 'the pergola seating area already shown, in warm timber',
  bbq: 'the barbecue corner already shown',
  fountain: 'the fountain already shown',
  palms: 'the date palms already shown',
});
export const PHOTO_VIEWS = Object.freeze({
  facade: 'The reference image is a 3D render of the exterior of a private villa in Saudi Arabia, seen from the street side with its boundary wall and gates.',
  model: 'The reference image is a simple 3D massing model of a private villa in Saudi Arabia.',
});
export const GEOMETRY_RULES = 'Strict constraints: keep the exact building massing, number of floors, window and door positions, proportions, boundary wall and gates, and camera angle of the reference image; only upgrade materials, lighting, vegetation and realism; do not add or remove floors, openings, or structures; do not move, resize or reshape any window, door, balcony, parapet or gate; do not add tall trees in front of the facade; keep existing trees and palms where they are; do not change the framing or crop. No people, no cars, no text, no logos, no watermark.';
const FLOORS_EN = { 1: 'a single-storey', 2: 'a two-storey', 3: 'a three-storey' };

const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const pick = (table, v, fallback) => (typeof v === 'string' && Object.hasOwn(table, v) ? v : fallback);

/** يطبّع الوصف المنظّم إلى قيم من القوائم المغلقة. القيمة غير المعروفة في حقل إلزامي ترمي invalid_input؛ والحقول غير المعروفة تُهمل. */
export function normalizeDescription(d) {
  if (!record(d)) throw new Error('invalid_input');
  if (typeof d.style !== 'string' || !Object.hasOwn(PHOTO_STYLES, d.style)) throw new Error('invalid_input');
  const floors = d.floors === undefined ? null : d.floors;
  if (floors !== null && !(Number.isInteger(floors) && floors >= 1 && floors <= 3)) throw new Error('invalid_input');
  if (d.lighting !== undefined && !(typeof d.lighting === 'string' && Object.hasOwn(PHOTO_LIGHTING, d.lighting))) throw new Error('invalid_input');
  if (d.yard !== undefined && (!Array.isArray(d.yard) || d.yard.length > 12)) throw new Error('invalid_input');
  const yard = [...new Set((d.yard || []).filter(k => typeof k === 'string' && Object.hasOwn(PHOTO_YARD, k)))];
  return {
    style: d.style, floors, lighting: d.lighting || 'golden', view: pick(PHOTO_VIEWS, d.view, 'facade'),
    tone: pick(PHOTO_TONES, d.tone, 'auto'), openings: pick(PHOTO_OPENINGS, d.openings, 'auto'), screen: pick(PHOTO_SCREEN, d.screen, 'auto'),
    entrance: pick(PHOTO_ENTRANCE, d.entrance, 'auto'), night: pick(PHOTO_NIGHT, d.night, 'auto'), yard,
  };
}

/** برومبت التصوير المعماري من وصف مطبَّع. كل كلمة فيه من الجداول الثابتة أعلاه. */
export function buildPhotoPrompt(description) {
  const d = normalizeDescription(description), st = PHOTO_STYLES[d.style];
  const dark = d.lighting === 'night' || d.lighting === 'sunset';
  const parts = [
    'Turn the reference image into a realistic, calm editorial architectural photograph of the same house.',
    PHOTO_VIEWS[d.view],
    `It is ${d.floors ? FLOORS_EN[d.floors] : 'a'} villa in ${st.name} style: ${st.text}.`,
    PHOTO_TONES[d.tone], PHOTO_OPENINGS[d.openings], PHOTO_SCREEN[d.screen], PHOTO_ENTRANCE[d.entrance],
    PHOTO_LIGHTING[d.lighting], dark ? PHOTO_NIGHT[d.night] : '',
    PHOTO_LOOK,
    'Setting: a quiet Saudi residential street with light grey asphalt, a pale stone kerb and a paved sidewalk; render the existing planting as real date palms, olive trees and drought-tolerant desert plants, in the same places and at the same sizes.',
    d.yard.length ? `In the yard, keep and render realistically: ${d.yard.map(k => PHOTO_YARD[k]).join('; ')}.` : '',
    'Photography: full-frame camera with a 35mm tilt-shift lens, perfectly vertical lines, natural perspective, sharp fine detail, legible real-world material texture (stone grain and joints, fine plaster, wood grain, soft glass reflections), subtle natural weathering.',
    GEOMETRY_RULES,
  ];
  return parts.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------------------------------------ الدخل
const b64ToBytes = s => { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
export function bytesToB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
export function sniffImage(b) {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
/** مقاس الخرج المطلوب من النموذج: نسبة اللقطة نفسها، الضلع الأطول = حد المستوى (يُكبَّر إليه إن كانت اللقطة أصغر)، مضاعفات 16، وتحت حد البكسلات. */
export function outputSize(w, h, tier, L = PHOTO_LIMITS) {
  const side = L.outSide?.[tier] || L.maxSide, k = Math.min(side / Math.max(w, h), Math.sqrt((L.maxOutPixels || Infinity) / (w * h)));
  const sn = v => Math.max(L.minSide, Math.min(side, Math.round(v * k / L.sizeStep) * L.sizeStep));
  return { width: sn(w), height: sn(h) };
}

/** يتحقق من جسم الطلب ويعيد { bytes, mime, width, height, tier, seed, description }. يرمي invalid_input أو image_too_large. */
export function validatePhotoInput(body, L = PHOTO_LIMITS) {
  if (!record(body) || typeof body.image !== 'string') throw new Error('invalid_input');
  const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.image);
  if (!m) throw new Error('invalid_input');
  if (m[2].length * 3 / 4 > L.maxImageBytes + 3) throw new Error('image_too_large');
  let bytes; try { bytes = b64ToBytes(m[2]); } catch { throw new Error('invalid_input'); }
  const mime = sniffImage(bytes);
  if (mime !== 'image/' + m[1]) throw new Error('invalid_input'); // المحتوى يجب أن يكون صورة فعلًا من النوع المعلن
  if (!Number.isFinite(body.width) || !Number.isFinite(body.height) || body.width < 64 || body.height < 64 || body.width > 8192 || body.height > 8192) throw new Error('invalid_input');
  const tier = body.tier === undefined ? 'standard' : body.tier;
  if (typeof tier !== 'string' || !Object.hasOwn(PHOTO_TIERS, tier)) throw new Error('invalid_input');
  if (body.seed !== undefined && !(Number.isInteger(body.seed) && body.seed >= 0 && body.seed <= 0xFFFFFFFF)) throw new Error('invalid_input');
  return { bytes, mime, ...outputSize(body.width, body.height, tier, L), tier, seed: body.seed ?? null, description: normalizeDescription(body.description) };
}

// ------------------------------------------------------------------------------------------------ المزوّد
export function modelFor(tier, env = {}) {
  const t = PHOTO_TIERS[tier], over = env[t.envKey];
  return typeof over === 'string' && /^@cf\/[\w.-]+\/[\w.-]+$/.test(over.trim()) ? over.trim() : t.model;
}
export const adapterFor = model => ADAPTERS[/flux-2-dev/.test(model) ? 'flux-2-dev' : /flux-2-klein/.test(model) ? 'flux-2-klein' : 'generic'];

/** يبني طلب multipart بالنمط الموثّق: Response(form) يعطي الجسم ونوع المحتوى بالـboundary الصحيح. */
/** خطوات النموذج: ثابت المهايئ، أو متغير البيئة (مثل PHOTO_STEPS_PREMIUM) إن كان عددًا صحيحًا بين 4 و50. null = لا يُرسل الحقل. */
export function stepsFor(model, env = {}) {
  const a = adapterFor(model); if (!a.steps) return null;
  const n = a.stepsEnv ? Number(env[a.stepsEnv]) : NaN;
  return Number.isInteger(n) && n >= 4 && n <= 50 ? n : a.steps;
}
export function buildProviderRequest(model, { prompt, bytes, mime, width, height, seed, steps = adapterFor(model).steps }) {
  const a = adapterFor(model), form = new FormData();
  form.append('prompt', prompt);
  form.append(a.imageField, new Blob([bytes], { type: mime }), mime === 'image/png' ? 'design.png' : 'design.jpg');
  if (a.sendSize) { form.append('width', String(width)); form.append('height', String(height)); }
  if (steps) form.append('steps', String(steps));
  if (a.sendSeed && seed !== null) form.append('seed', String(seed));
  const res = new Response(form);
  return { multipart: { body: res.body, contentType: res.headers.get('content-type') } };
}

const shapeOf = v => v === null ? 'null' : v instanceof Uint8Array ? `Uint8Array(${v.length})` : v instanceof ArrayBuffer ? `ArrayBuffer(${v.byteLength})`
  : typeof v === 'string' ? `string(${v.length})` : record(v) ? '{' + Object.keys(v).slice(0, 12).map(k => `${k}:${typeof v[k] === 'string' ? `string(${v[k].length})` : Array.isArray(v[k]) ? 'array' : typeof v[k]}`).join(',') + '}' : typeof v;

/** يحوّل خرج النموذج (كائن فيه image بصيغة base64، أو نص base64، أو بايتات/مجرى) إلى { b64, mime }؛ يعيد null ويسجّل الشكل إن لم يُعرف. */
export async function readProviderImage(out, log = console) {
  let bytes = null;
  try {
    const cand = record(out) && !(out instanceof Uint8Array) && !(out instanceof ArrayBuffer) && typeof out.getReader !== 'function'
      ? (out.image ?? out.result?.image ?? out.images?.[0] ?? out.data?.[0]?.b64_json ?? null) : out;
    if (typeof cand === 'string') bytes = b64ToBytes(cand.replace(/^data:image\/[\w+.-]+;base64,/, '').replace(/\s+/g, ''));
    else if (cand instanceof Uint8Array) bytes = cand;
    else if (cand instanceof ArrayBuffer) bytes = new Uint8Array(cand);
    else if (cand && typeof cand.getReader === 'function') bytes = new Uint8Array(await new Response(cand).arrayBuffer());
  } catch { bytes = null; }
  const mime = bytes && sniffImage(bytes);
  if (!mime) { log.warn?.('[photo] شكل استجابة غير متوقع من النموذج:', shapeOf(out)); return null; }
  return { b64: bytesToB64(bytes), mime, bytes: bytes.length };
}

// ------------------------------------------------------------------------------------------------ العدّادات
const dayKey = t => new Date(t).toISOString().slice(0, 10);
export const dailyCap = (env = {}, L = PHOTO_LIMITS) => {
  const raw = env.PHOTO_DAILY_CAP; if (raw === undefined || raw === null || String(raw).trim() === '') return L.dailyCapDefault;
  const n = Number(raw); return Number.isInteger(n) && n >= 0 ? Math.min(n, L.dailyCapMax) : L.dailyCapDefault;
};
async function ipHash(ip, day) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(day + '|' + ip));
  return [...new Uint8Array(d)].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
}
/**
 * عدّاد اليوم (إجمالي + لكل عنوان). يستعمل D1 إن وُجد الجدول photo_usage (db/photo-usage.sql)، وإلا الذاكرة.
 * حدود عدّاد الذاكرة: يخص النسخة (isolate) الواحدة ويُصفَّر عند إعادة تشغيلها، وكلودفلير قد تشغّل عدة نسخ؛
 * فهو كابح تقريبي لا سقف فاتورة مضمون. السقف المضمون يحتاج جدول D1 (أو حد إنفاق في حساب كلودفلير).
 */
function createUsage(now) {
  const mem = new Map(); let memDay = '', d1Off = 0; // d1Off: وقت آخر فشل لـ D1 (يُعاد الفحص بعد 5 دقائق)
  const memBump = (day, key, by) => { if (day !== memDay) { mem.clear(); memDay = day; } const v = Math.max(0, (mem.get(key) || 0) + by); mem.set(key, v); return v; };
  const useD1 = env => !!env?.DB?.prepare && now() - d1Off > 300_000;
  async function bump(env, key, by) {
    const day = dayKey(now());
    if (useD1(env)) {
      try {
        const row = await env.DB.prepare('INSERT INTO photo_usage (day, key, count) VALUES (?, ?, MAX(0, ?)) ON CONFLICT(day, key) DO UPDATE SET count = MAX(0, count + ?) RETURNING count').bind(day, key, by, by).first();
        if (row && Number.isFinite(row.count)) return { count: row.count, store: 'd1' };
        throw new Error('no_row');
      } catch { d1Off = now(); }
    }
    return { count: memBump(day, key, by), store: 'memory' };
  }
  async function peek(env, key) {
    const day = dayKey(now());
    if (useD1(env)) {
      try { const row = await env.DB.prepare('SELECT count FROM photo_usage WHERE day = ? AND key = ?').bind(day, key).first(); return { count: row?.count || 0, store: 'd1' }; }
      catch { d1Off = now(); }
    }
    return { count: day === memDay ? mem.get(key) || 0 : 0, store: 'memory' };
  }
  return { bump, peek };
}

// ------------------------------------------------------------------------------------------------ المعالج
const baseHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...baseHeaders, ...extra } });
export const photoOriginAllowed = (origin, env = {}) => {
  const list = typeof env.ALLOWED_ORIGIN === 'string' && env.ALLOWED_ORIGIN.trim() ? env.ALLOWED_ORIGIN.split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean) : DEFAULT_ALLOWED_ORIGINS;
  return typeof origin === 'string' && list.includes(origin);
};
const corsHeaders = origin => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' });
async function readLimited(request, maxBytes) {
  if (!request.body) throw new Error('invalid_input');
  if (Number(request.headers.get('Content-Length')) > maxBytes) throw new Error('too_large');
  const reader = request.body.getReader(), chunks = []; let length = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > maxBytes) { await reader.cancel(); throw new Error('too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('invalid_input'); }
}
const aiReady = env => !!env?.AI && typeof env.AI.run === 'function';
const MSG = {
  off: 'خدمة الصورة الاحترافية غير مفعّلة بعد.',
  origin: 'طلب غير مسموح.',
  minute: 'طلبات متقاربة؛ انتظر دقيقة ثم أعد المحاولة.',
  dayIp: 'بلغت حد الصور الاحترافية لهذا اليوم من جهازك. حاول غدًا.',
  dayCap: 'بلغت الخدمة حدها اليومي من الصور الاحترافية. حاول غدًا.',
  large: 'حجم اللقطة أكبر من المسموح (1.2 ميغابايت). أعد المحاولة بلقطة أصغر.',
  input: 'بيانات الطلب غير صالحة: يلزم لقطة JPEG أو PNG ووصف تصميم من القيم المعتمدة.',
  timeout: 'تأخر توليد الصورة أكثر من المسموح. لم يتغير تصميمك؛ أعد المحاولة.',
  provider: 'تعذّر توليد الصورة الآن. لم يتغير تصميمك؛ أعد المحاولة لاحقًا.',
  shape: 'أعاد مولّد الصور ردًا غير مفهوم، فتجاهلته. أعد المحاولة لاحقًا.',
};

/** أخطاء المزوّد التي تستحق إعادة واحدة (عابرة): 3043، 5xx، Internal server error، ازدحام/سعة. */
export const TRANSIENT = /\b3043\b|\b5\d\d\b|internal server error|temporar|overload|capacity|unavailable|try again/i;

export function createPhotoHandler({ now = Date.now, limits = PHOTO_LIMITS, log = console } = {}) {
  const L = limits, usage = createUsage(now), minute = new Map();
  // حد الدقيقة في ذاكرة النسخة (نافذة قصيرة، مثل بقية /api)؛ حدّا اليوم عبر usage.
  const takeMinute = ip => {
    const t = now(); for (const [k, b] of minute) if (t - b.start >= 60_000) minute.delete(k);
    const b = minute.get(ip) || { start: t, count: 0 };
    if (b.count >= L.perMinute || (!minute.has(ip) && minute.size >= L.maxBuckets)) return Math.max(1, Math.ceil((60_000 - t + b.start) / 1000));
    b.count++; minute.set(ip, b); return 0;
  };
  const nextDaySeconds = () => { const t = now(); return Math.max(60, Math.ceil((Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate() + 1) - t) / 1000)); };

  async function status(request, env) {
    const origin = request.headers.get('Origin');
    if (origin && !photoOriginAllowed(origin, env)) return json({ error: MSG.origin }, 403);
    const cap = dailyCap(env, L), ready = aiReady(env), configured = ready && cap > 0;
    const used = configured ? await usage.peek(env, 'total') : { count: 0, store: 'memory' };
    return json({
      configured, verified: false, tiers: configured ? Object.keys(PHOTO_TIERS) : [],
      models: configured ? Object.fromEntries(Object.keys(PHOTO_TIERS).map(t => [t, modelFor(t, env)])) : {},
      dailyCap: cap, remainingToday: configured ? Math.max(0, cap - used.count) : 0, counter: used.store,
      limits: { perMinute: L.perMinute, perDayPerClient: L.perDayPerIp, maxImageBytes: L.maxImageBytes, maxSide: L.maxSide, outSide: L.outSide },
      steps: configured ? Object.fromEntries(Object.keys(PHOTO_TIERS).map(t => [t, stepsFor(modelFor(t, env), env)])) : {},
      message: configured ? 'الخدمة مهيأة؛ هذه الحالة لا تختبر النموذج نفسه. يلزم توليد ناجح للتحقق.' : !ready ? MSG.off : 'خدمة الصورة الاحترافية موقوفة (السقف اليومي صفر).',
    }, 200, origin ? corsHeaders(origin) : {});
  }

  async function generate(request, env) {
    const origin = request.headers.get('Origin');
    if (!photoOriginAllowed(origin, env)) return json({ error: MSG.origin }, 403);
    const cors = corsHeaders(origin);
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: 'نوع البيانات غير مدعوم؛ استخدم JSON.' }, 415, cors);
    const cap = dailyCap(env, L);
    if (!aiReady(env) || cap <= 0) return json({ error: MSG.off, code: 'PHOTO_NOT_CONFIGURED' }, 503, cors);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown-client';
    const wait = takeMinute(ip);
    if (wait) return json({ error: MSG.minute, code: 'RATE_MINUTE' }, 429, { ...cors, 'Retry-After': String(wait) });
    let input;
    try { input = validatePhotoInput(await readLimited(request, L.maxBodyBytes), L); }
    catch (e) {
      if (e.message === 'too_large' || e.message === 'image_too_large') return json({ error: MSG.large, code: 'IMAGE_TOO_LARGE' }, 413, cors);
      return json({ error: MSG.input, code: 'INVALID_INPUT' }, 400, cors);
    }
    // حجز من حد العميل اليومي ثم من السقف الإجمالي قبل استدعاء النموذج (يُعاد الحجز إن رفض النموذج الطلب صراحةً)
    const ipKey = 'ip:' + await ipHash(ip, dayKey(now()));
    const mine = await usage.bump(env, ipKey, 1);
    if (mine.count > L.perDayPerIp) { await usage.bump(env, ipKey, -1); return json({ error: MSG.dayIp, code: 'RATE_DAY' }, 429, { ...cors, 'Retry-After': String(nextDaySeconds()) }); }
    const total = await usage.bump(env, 'total', 1);
    const refund = async () => { await usage.bump(env, 'total', -1); await usage.bump(env, ipKey, -1); };
    if (total.count > cap) { await refund(); return json({ error: MSG.dayCap, code: 'DAILY_CAP' }, 429, { ...cors, 'Retry-After': String(nextDaySeconds()) }); }

    const model = modelFor(input.tier, env), seed = input.seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0);
    const prompt = buildPhotoPrompt(input.description), t0 = now();
    // خطأ مزوّد عابر (مثل 3043 Internal server error أو 5xx): إعادة واحدة تلقائية قبل 502؛ الحجز واحد للطلب كله ويُعاد إن فشل نهائيًا
    const steps = stepsFor(model, env), call = () => env.AI.run(model, buildProviderRequest(model, { prompt, bytes: input.bytes, mime: input.mime, width: input.width, height: input.height, seed, steps }));
    let out, timer, attempts = 0;
    const deadline = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('photo_timeout')), L.timeoutMs); });
    try {
      for (;;) {
        attempts++;
        try { out = await Promise.race([call(), deadline]); break; }
        catch (e) {
          const detail = String(e?.message || e).slice(0, 300);
          if (detail === 'photo_timeout' || attempts > (L.providerRetries || 0) || !TRANSIENT.test(detail)) throw e;
          log.warn?.('[photo] خطأ مزوّد عابر؛ أعيد المحاولة', model, detail);
          await new Promise(r => setTimeout(r, L.retryDelayMs || 0));
        }
      }
    } catch (e) {
      clearTimeout(timer);
      const detail = String(e?.message || e).slice(0, 300);
      if (detail === 'photo_timeout') { log.warn?.('[photo] مهلة النموذج', model); return json({ error: MSG.timeout, code: 'PHOTO_TIMEOUT' }, 504, cors); } // لا يُعاد الحجز: قد يكون التوليد حُسب
      log.warn?.('[photo] خطأ النموذج', model, detail);
      await refund();
      return json({ error: MSG.provider, code: 'PROVIDER_ERROR', detail, attempts }, 502, cors);
    }
    clearTimeout(timer);
    const img = await readProviderImage(out, log);
    if (!img) return json({ error: MSG.shape, code: 'PROVIDER_SHAPE' }, 502, cors);
    return json({
      image: `data:${img.mime};base64,${img.b64}`, tier: input.tier, model, seed, lighting: input.description.lighting,
      width: input.width, height: input.height, steps, attempts, ms: now() - t0, remainingToday: Math.max(0, cap - total.count), counter: total.store,
      disclaimer: 'صورة محسّنة بالذكاء الاصطناعي من مجسم تصميمك — للتصوّر لا للتنفيذ',
    }, 200, cors);
  }

  return { async fetch(request, env = {}) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/photo/status' && request.method === 'GET') return status(request, env);
    if ((pathname === '/api/photo' || pathname === '/api/photo/status') && request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      if (!photoOriginAllowed(origin, env)) return json({ error: MSG.origin }, 403);
      return new Response(null, { status: 204, headers: { ...corsHeaders(origin), 'Cache-Control': 'no-store' } });
    }
    if (pathname === '/api/photo' && request.method === 'POST') return generate(request, env);
    return json({ error: 'مسار غير متاح.' }, pathname === '/api/photo' || pathname === '/api/photo/status' ? 405 : 404);
  } };
}

const photo = createPhotoHandler();
export default photo;
