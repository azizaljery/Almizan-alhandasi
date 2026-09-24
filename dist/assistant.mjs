import { normalizeRooms } from './planner.mjs';

const DESIGN_PRIORITIES = new Set(['privacy','guestFamilySeparation','daylight','circulation','accessibility','serviceFlow','efficiency','futureFlexibility']);
const DESIGN_SHAPES = new Set(['rect','l','u']);
function validateDesignIntent(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const priorities = Array.isArray(source.priorities) ? [...new Set(source.priorities.filter(x => DESIGN_PRIORITIES.has(x)))].slice(0, 6) : [];
  const preferredShapes = Array.isArray(source.preferredShapes) ? [...new Set(source.preferredShapes.filter(x => DESIGN_SHAPES.has(x)))].slice(0, 3) : [];
  const conceptDirections = Array.isArray(source.conceptDirections) ? source.conceptDirections.slice(0, 3).map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw Error('اقتراح غير صالح.');
    const shapeHint = ['auto','rect','l','u'].includes(x.shapeHint) ? x.shapeHint : 'auto';
    if (typeof x.label !== 'string' || !x.label.trim() || x.label.length > 120 || typeof x.rationale !== 'string' || x.rationale.length > 800 || !Array.isArray(x.tradeoffs) || x.tradeoffs.length > 6 || x.tradeoffs.some(t => typeof t !== 'string' || t.length > 300)) throw Error('اقتراح غير صالح.');
    return { id: typeof x.id === 'string' && x.id ? x.id.slice(0, 80) : `concept-${i+1}`, label: x.label.trim(), shapeHint, rationale: x.rationale.trim(), tradeoffs: [...x.tradeoffs] };
  }) : [];
  return { priorities, preferredShapes, conceptDirections };
}

// AI is enabled through the external Cloudflare Worker.
// No API key or provider secret is exposed in the browser.
export const AI_ENABLED = true;
export const WORKER_URL = 'https://al-mizan-api.ajeryabod.workers.dev';
export function validateSuggestion(raw) {
  if (!raw || typeof raw.summary !== 'string' || !raw.summary.trim() || raw.summary.length > 1000) throw Error('اقتراح غير صالح.');
  const result = { summary: raw.summary };
  for (const k of ['questions', 'assumptions', 'unhandled']) {
    if (!Array.isArray(raw[k]) || raw[k].length > 12 || raw[k].some(s => typeof s !== 'string' || s.length > 600)) throw Error('اقتراح غير صالح.');
    result[k] = [...raw[k]];
  }
  if (!Array.isArray(raw.rooms) || raw.rooms.length > 30 || (!raw.rooms.length && ![...result.questions, ...result.unhandled].some(s => s.trim()))) throw Error('اقتراح غير صالح.');
  result.rooms = raw.rooms.length ? normalizeRooms(raw.rooms).map(({ name, type, area, position, side }) => ({ name, type, area, position, side })) : [];
  result.designIntent = validateDesignIntent(raw.designIntent);
  return result;
}
export async function requestBrief(input, { enabled = AI_ENABLED, fetcher = globalThis.fetch, signal } = {}) {
  if (!enabled) throw Error('الذكاء الاصطناعي غير مفعّل في هذه النسخة. لم يُرسل الوصف. يمكنك تعديل الغرف في الجدول والتوليد محليًا الآن.');
  const response = await fetcher(WORKER_URL + '/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('خدمة التحليل غير متصلة بهذا الإصدار. بقي مخططك كما هو.');
  const data = await response.json();
  if (!response.ok) throw Error(typeof data.error === 'string' ? data.error : 'تعذّر التحليل؛ بقي مخططك كما هو.');
  if (data.source !== 'openai') throw Error('لم يتم التحقق من مصدر الاقتراح.');
  return { brief: validateSuggestion(data.brief), model: data.model, limitations: Array.isArray(data.limitations) ? data.limitations.filter(s => typeof s === 'string').slice(0, 12) : [] };
}
