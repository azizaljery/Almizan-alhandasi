import { normalizeRooms } from './planner.mjs';
import { sanitizeAiRequirements } from './ai-requirements.mjs';

export const AI_ENABLED = true;
// Enabling the client does not verify that the separately deployed Worker is ready.
// في نسخة المعاينة المستقلة يكلّم المساعد وركرها نفسه (مسار نسبي)، وفي غير ذلك العنوان الأصلي كما كان.
export const ON_STAGING = typeof location !== 'undefined' && /^almizan-handasi-staging\./.test(location.hostname || '');
export const AI_ENDPOINT = ON_STAGING ? '/api/assistant' : 'https://almizan-handasi.aljeryabod.workers.dev/api/assistant';
export const AI_STATUS_ENDPOINT = AI_ENDPOINT + '/status';

async function fetchJSON(endpoint, options, fetcher, invalidResponseMessage) {
  let response;
  try {
    response = await fetcher(endpoint, { ...options, credentials: 'omit', cache: 'no-store' });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw Error('لم يصل رد خلال الوقت المحدد. حاول مجددًا؛ بقي مخططك كما هو.');
    throw Error('تعذّر الاتصال بخدمة الذكاء الآن. يمكنك استخدام «فهم محلي بلا مفتاح» أو المحاولة لاحقًا.');
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw Error(invalidResponseMessage);
  let data;
  try { data = await response.json(); } catch { throw Error(invalidResponseMessage); }
  if (!response.ok) throw Error(typeof data?.error === 'string' && data.error.trim() ? data.error : invalidResponseMessage);
  return data;
}

export function validateSuggestion(raw) {
  if (!raw || typeof raw.summary !== 'string' || !raw.summary.trim() || raw.summary.length > 1000) throw Error('اقتراح غير صالح.');
  const result = { summary: raw.summary };
  for (const k of ['questions', 'assumptions', 'unhandled']) {
    if (!Array.isArray(raw[k]) || raw[k].length > 12 || raw[k].some(s => typeof s !== 'string' || s.length > 600)) throw Error('اقتراح غير صالح.');
    result[k] = [...raw[k]];
  }
  if (!Array.isArray(raw.rooms) || raw.rooms.length > 30 || (!raw.rooms.length && ![...result.questions, ...result.unhandled].some(s => s.trim()) && !(sanitizeAiRequirements(raw.requirements)?.rules.length))) throw Error('اقتراح غير صالح.');
  const req = sanitizeAiRequirements(raw.requirements); if (req) result.requirements = req;
  result.rooms = raw.rooms.length ? normalizeRooms(raw.rooms).map(({ name, type, area, position, side, dimensions }) => ({ name, type, area, position, side, ...(dimensions ? { dimensions: { ...dimensions } } : {}) })) : [];
  return result;
}
export async function requestBrief(input, { enabled = AI_ENABLED, endpoint = AI_ENDPOINT, accessCode = '', openAccess = false, fetcher = globalThis.fetch, signal } = {}) {
  if (!enabled) throw Error('الذكاء الاصطناعي غير مفعّل في هذه النسخة. لم يُرسل الوصف. يمكنك تعديل الغرف في الجدول والتوليد محليًا الآن.');
  const code = typeof accessCode === 'string' ? accessCode.trim() : '';
  if (!code && openAccess === 'auto') openAccess = await assistantOpen({ fetcher });
  if (!code && !openAccess) throw Error('أدخل رمز دخول الذكاء الخاص بالموقع أولًا.');
  const data = await fetchJSON(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(code ? { 'X-Mizan-Access-Code': code } : {}) }, body: JSON.stringify(input), signal }, fetcher, 'خدمة التحليل غير متصلة بهذا الإصدار. بقي مخططك كما هو.');
  if (data?.source !== 'claude') throw Error('لم يتم التحقق من مصدر الاقتراح.');
  return { brief: validateSuggestion(data.brief), model: data.model, limitations: Array.isArray(data.limitations) ? data.limitations.filter(s => typeof s === 'string').slice(0, 12) : [] };
}

export async function getAssistantStatus({ endpoint = AI_STATUS_ENDPOINT, fetcher = globalThis.fetch, signal } = {}) {
  const data = await fetchJSON(endpoint, { method: 'GET', signal }, fetcher, 'تعذر التحقق من حالة خدمة الذكاء.');
  if (!data || typeof data.configured !== 'boolean' || typeof data.accessConfigured !== 'boolean') throw Error('تعذر التحقق من حالة خدمة الذكاء.');
  return data;
}

// هل الخدمة مفتوحة بلا رمز (نسخة المعاينة)؟ أي فشل أو غموض = لا، فنرجع إلى الفهم المحلي أو طلب الرمز.
let openCache = null;
export async function assistantOpen({ fetcher = globalThis.fetch, status = AI_STATUS_ENDPOINT } = {}) {
  if (openCache !== null) return openCache;
  try { const r = await fetcher(status, { cache: 'no-store' }); const d = r.ok ? await r.json() : null; openCache = !!(d && d.openAccess === true && d.configured === true); } catch { openCache = false; }
  return openCache;
}
