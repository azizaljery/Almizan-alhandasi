import { normalizeRooms } from './planner.mjs';

export const AI_ENABLED = true;
// Enabling the client does not verify that the separately deployed Worker is ready.
export const AI_ENDPOINT = 'https://gentle-sun-5ef5.aljeryabod.workers.dev/api/assistant';
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
  if (!response.ok) {
    if (data?.code === 'ADDITIONAL_FLOORS_NOT_IMPLEMENTED') throw Error('المشروع المحفوظ يطلب أكثر من دور، وهذه النسخة تدعم دورًا واحدًا فقط. غيّر عدد الأدوار إلى 1 ثم أعد التحليل.');
    throw Error(typeof data?.error === 'string' && data.error.trim() ? data.error : invalidResponseMessage);
  }
  return data;
}

export function validateSuggestion(raw) {
  if (!raw || typeof raw.summary !== 'string' || !raw.summary.trim() || raw.summary.length > 1000) throw Error('اقتراح غير صالح.');
  const result = { summary: raw.summary };
  for (const k of ['questions', 'assumptions', 'unhandled']) {
    if (!Array.isArray(raw[k]) || raw[k].length > 12 || raw[k].some(s => typeof s !== 'string' || s.length > 600)) throw Error('اقتراح غير صالح.');
    result[k] = [...raw[k]];
  }
  if (!Array.isArray(raw.rooms) || raw.rooms.length > 30 || (!raw.rooms.length && ![...result.questions, ...result.unhandled].some(s => s.trim()))) throw Error('اقتراح غير صالح.');
  result.rooms = raw.rooms.length ? normalizeRooms(raw.rooms).map(({ name, type, area, position, side }) => ({ name, type, area, position, side })) : [];
  return result;
}
export async function requestBrief(input, { enabled = AI_ENABLED, endpoint = AI_ENDPOINT, accessCode = '', fetcher = globalThis.fetch, signal } = {}) {
  if (!enabled) throw Error('الذكاء الاصطناعي غير مفعّل في هذه النسخة. لم يُرسل الوصف. يمكنك تعديل الغرف في الجدول والتوليد محليًا الآن.');
  if (typeof accessCode !== 'string' || !accessCode.trim()) throw Error('أدخل رمز دخول الذكاء الخاص بالموقع أولًا.');
  const data = await fetchJSON(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mizan-Access-Code': accessCode.trim() }, body: JSON.stringify(input), signal }, fetcher, 'خدمة التحليل غير متصلة بهذا الإصدار. بقي مخططك كما هو.');
  if (data?.source !== 'openai') throw Error('لم يتم التحقق من مصدر الاقتراح.');
  return { brief: validateSuggestion(data.brief), model: data.model, limitations: Array.isArray(data.limitations) ? data.limitations.filter(s => typeof s === 'string').slice(0, 12) : [] };
}

export async function getAssistantStatus({ endpoint = AI_STATUS_ENDPOINT, fetcher = globalThis.fetch, signal } = {}) {
  const data = await fetchJSON(endpoint, { method: 'GET', signal }, fetcher, 'تعذر التحقق من حالة خدمة الذكاء.');
  if (!data || typeof data.configured !== 'boolean' || typeof data.accessConfigured !== 'boolean') throw Error('تعذر التحقق من حالة خدمة الذكاء.');
  return data;
}
