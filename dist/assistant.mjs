import { normalizeRooms } from './planner.mjs';

// Static release: no API route, no browser key, and no provider request.
// Enable only together with a securely configured backend and a verified integration test.
export const AI_ENABLED = false;
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
export async function requestBrief(input, { enabled = AI_ENABLED, fetcher = globalThis.fetch, signal } = {}) {
  if (!enabled) throw Error('الذكاء الاصطناعي غير مفعّل في هذه النسخة. لم يُرسل الوصف. يمكنك تعديل الغرف في الجدول والتوليد محليًا الآن.');
  const response = await fetcher('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(input), signal });
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('خدمة التحليل غير متصلة بهذا الإصدار. بقي مخططك كما هو.');
  const data = await response.json();
  if (!response.ok) throw Error(typeof data.error === 'string' ? data.error : 'تعذّر التحليل؛ بقي مخططك كما هو.');
  if (data.source !== 'openai') throw Error('لم يتم التحقق من مصدر الاقتراح.');
  return { brief: validateSuggestion(data.brief), model: data.model, limitations: Array.isArray(data.limitations) ? data.limitations.filter(s => typeof s === 'string').slice(0, 12) : [] };
}
