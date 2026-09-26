/* الميزان الهندسي — بوابة الصور المعمارية
 * Worker مستقل عن Worker المساعد. لا تضع OPENAI_API_KEY أو رمز الدخول في هذا الملف.
 * الأسرار المطلوبة في إعدادات Worker: OPENAI_API_KEY و MIZAN_IMAGE_ACCESS_CODE.
 */
const OPENAI_GENERATIONS_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const OPENAI_EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits';
// DALL-E 3 is not available in this API project. GPT Image returns base64.
const OPENAI_IMAGE_MODEL = 'gpt-image-1';
const DEFAULT_ORIGIN = 'https://al-mizan-al-handasi.aljeryabod.chatgpt.site';
// The plan reference is sent as a bounded PNG data URL. Keep this below the
// OpenAI image_url limit while allowing a normal 1536×1024 floor-plan raster.
const MAX_BODY_BYTES = 900000;
const MAX_PROMPT_LENGTH = 3800;
const MAX_REFERENCE_IMAGE_LENGTH = 780000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 3;
const buckets = new Map();

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const originAllowed = (request, env) => {
  const origin = request.headers.get('Origin') || '';
  const configured = typeof env.ALLOWED_ORIGIN === 'string' && env.ALLOWED_ORIGIN.trim() ? env.ALLOWED_ORIGIN.trim().replace(/\/$/, '') : DEFAULT_ORIGIN;
  return { origin, allowed: origin === configured || origin === 'http://localhost:8000' || origin === 'http://127.0.0.1:8000', value: origin === configured ? origin : configured };
};
const cors = origin => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Mizan-Access-Code', 'Access-Control-Max-Age': '600', 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' });
const json = (data, status, origin) => new Response(JSON.stringify(data), { status, headers: cors(origin) });
async function equalSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) return false;
  const encoder = new TextEncoder(); const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(left)), crypto.subtle.digest('SHA-256', encoder.encode(right))]);
  const x = new Uint8Array(a), y = new Uint8Array(b); let diff = x.length ^ y.length; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]; return diff === 0;
}
async function readBody(request) {
  if (!request.body) throw Error('invalid_body'); const reader = request.body.getReader(); const chunks = []; let size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BODY_BYTES) { await reader.cancel(); throw Error('too_large'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; }); return JSON.parse(new TextDecoder().decode(bytes));
}
function requestAllowed(ip, now = Date.now()) {
  for (const [key, bucket] of buckets) if (now - bucket.start >= WINDOW_MS) buckets.delete(key);
  const bucket = buckets.get(ip) || { start: now, count: 0 }; if (bucket.count >= MAX_REQUESTS) return false; bucket.count++; buckets.set(ip, bucket); return true;
}

export default { async fetch(request, env = {}) {
  const access = originAllowed(request, env);
  if (request.method === 'OPTIONS') return access.allowed ? new Response(null, { status: 204, headers: cors(access.value) }) : json({ error: 'طلب غير مسموح.' }, 403, access.value);
  if (!access.allowed) return json({ error: 'مصدر الطلب غير مسموح.' }, 403, access.value);
  if (request.method !== 'POST') return json({ error: 'الطريقة غير مدعومة.' }, 405, access.value);
  if (typeof env.MIZAN_IMAGE_ACCESS_CODE !== 'string' || !env.MIZAN_IMAGE_ACCESS_CODE.trim()) return json({ error: 'حماية خدمة الصور غير مهيأة.' }, 503, access.value);
  if (!await equalSecret(request.headers.get('X-Mizan-Access-Code') || '', env.MIZAN_IMAGE_ACCESS_CODE.trim())) return json({ error: 'رمز دخول الصور غير صحيح.' }, 401, access.value);
  if (!requestAllowed(request.headers.get('CF-Connecting-IP') || 'authorized-client')) return json({ error: 'طلبات متقاربة؛ انتظر دقيقة ثم حاول مجددًا.' }, 429, access.value);
  let body; try { body = await readBody(request); } catch (error) { return json({ error: error.message === 'too_large' ? 'حجم الطلب أكبر من الحد المسموح.' : 'صيغة الطلب غير صحيحة.' }, 400, access.value); }
  if (!record(body) || typeof body.prompt !== 'string' || body.prompt.trim().length < 10 || body.prompt.length > MAX_PROMPT_LENGTH) return json({ error: `الوصف يجب أن يكون بين 10 و${MAX_PROMPT_LENGTH} حرف.` }, 400, access.value);
  const quality = ['standard', 'hd'].includes(body.quality) ? body.quality : 'hd';
  const size = ['1024x1024', '1024x1536', '1536x1024', 'auto'].includes(body.size) ? body.size : '1536x1024';
  const style = ['vivid', 'natural'].includes(body.style) ? body.style : 'natural';
  const referenceImage = typeof body.reference_image === 'string' && body.reference_image.trim() ? body.reference_image.trim() : '';
  if (referenceImage && (!referenceImage.startsWith('data:image/png;base64,') || referenceImage.length > MAX_REFERENCE_IMAGE_LENGTH)) {
    return json({ error: 'صورة المخطط المرجعية غير صالحة أو أكبر من الحد المسموح.' }, 400, access.value);
  }
  if (typeof env.OPENAI_API_KEY !== 'string' || !env.OPENAI_API_KEY.trim()) return json({ error: 'مفتاح الصور غير مهيأ في الخادم.' }, 503, access.value);
  // The current Images API rejects the legacy `style` field for this route.
  // The selected visual style is already encoded in the generated prompt, so
  // omitting it keeps the request compatible without weakening access control.
  const imageQuality = quality === 'hd' ? 'high' : 'medium';
  const imageSize = size;
  const endpoint = referenceImage ? OPENAI_EDITS_ENDPOINT : OPENAI_GENERATIONS_ENDPOINT;
  const payload = referenceImage
    ? { model: OPENAI_IMAGE_MODEL, images: [{ image_url: referenceImage }], prompt: body.prompt.trim(), input_fidelity: 'high', n: 1, size: imageSize, quality: imageQuality }
    : { model: OPENAI_IMAGE_MODEL, prompt: body.prompt.trim(), n: 1, size: imageSize, quality: imageQuality };
  let response; try { response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(120000), headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch { return json({ error: 'تعذر الاتصال بخدمة الصور.' }, 502, access.value); }
  if (!response.ok) { let message = 'فشل توليد الصورة.'; try { const data = await response.json(); if (data?.error?.message) message = data.error.message; } catch {} if (response.status === 429) message = 'تم تجاوز حد الصور أو الرصيد؛ حاول لاحقًا.'; return json({ error: message }, response.status === 400 ? 400 : response.status === 429 ? 429 : 502, access.value); }
  const data = await response.json(); const image = data?.data?.[0]; if (!image?.b64_json) return json({ error: 'لم تُعد الخدمة بيانات صورة صالحة.' }, 502, access.value);
  return json({ url: `data:image/png;base64,${image.b64_json}`, revised_prompt: image.revised_prompt || null, size: imageSize, quality: imageQuality, style, generated_at: new Date().toISOString() }, 200, access.value);
} };
