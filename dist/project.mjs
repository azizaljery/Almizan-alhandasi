import { normalizeDiscovery } from './client-brief.mjs';
import { ENGINE_VERSION, STRATEGIES, validatePlot, normalizeRooms, generateModel, validateModel } from './planner.mjs';
import { estimate, quantityRows } from './estimates.mjs';

export const MAX_PROJECT_BYTES = 2_000_000;
const palettes = ['resort', 'modern', 'classic', 'hijazi'];
const publicRooms = rooms => normalizeRooms(rooms).map(({ name, type, area, position, side }) => ({ name, type, area, position, side }));
const palette = value => { if (!palettes.includes(value)) throw Error('طابع محفوظ غير معروف.'); return value; };
export const modelRecipe = model => model ? { plot: validatePlot(model.plot), rooms: publicRooms(model.program), strategy: model.strategy || 'compact', ...(model.engineVersion === 'mizan-p1-integrated' ? { embedded: structuredClone(model) } : {}) } : null;
function recipe(raw) {
  if (!raw || !Object.hasOwn(STRATEGIES, raw.strategy)) throw Error('وصف توزيع محفوظ غير صالح.');
  const out = { plot: validatePlot(raw.plot), rooms: publicRooms(raw.rooms), strategy: raw.strategy };
  if (raw.embedded !== undefined) {
    if (!raw.embedded || typeof raw.embedded !== 'object' || raw.embedded.engineVersion !== 'mizan-p1-integrated') throw Error('المخطط المدمج المحفوظ غير صالح.');
    const embedded = structuredClone(raw.embedded), errors = validateModel(embedded);
    if (errors.length) throw Error('المخطط المدمج المحفوظ غير صالح: ' + errors[0]);
    if (embedded.strategy !== raw.strategy || JSON.stringify(validatePlot(embedded.plot)) !== JSON.stringify(out.plot) || JSON.stringify(publicRooms(embedded.program)) !== JSON.stringify(out.rooms)) throw Error('بيانات المخطط المدمج لا تطابق وصف الحفظ.');
    out.embedded = embedded;
  }
  return out;
}
function validateProject(raw) {
  if (!raw || raw.schema !== 'mizan-handasi-project' || raw.version !== 1 || raw.engineVersion !== ENGINE_VERSION) throw Error('الملف ليس مشروع ميزان متوافقًا مع هذا الإصدار. لم يتغير عملك.');
  const draft = raw.draft;
  if (!draft || typeof draft.idea !== 'string' || draft.idea.length > 4000 || !draft.rates || typeof draft.rates !== 'object' || Array.isArray(draft.rates)) throw Error('بيانات المشروع غير مكتملة.');
  const rates = {};
  for (const key of ['walls', 'plaster', 'paint', 'floor', 'doors', 'windows']) {
    const value = draft.rates[key];
    if (value === '' || value === undefined) continue;
    if (!Number.isFinite(value) || value < 0 || value > 100000000) throw Error('سعر محفوظ غير صالح.');
    rates[key] = value;
  }
  estimate([], {}, draft.costReserve, draft.vat);
  if (!Array.isArray(raw.alternatives) || raw.alternatives.length > Object.keys(STRATEGIES).length || !Array.isArray(raw.history) || raw.history.length > 5) throw Error('عدد النسخ المحفوظة يتجاوز الحد المسموح.');
  const project = {
    schema: 'mizan-handasi-project', version: 1, engineVersion: ENGINE_VERSION,
    savedAt: typeof raw.savedAt === 'string' && Number.isFinite(Date.parse(raw.savedAt)) ? raw.savedAt : new Date().toISOString(),
    draft: { plot: validatePlot(draft.plot), rooms: publicRooms(draft.rooms), palette: palette(draft.palette), rates, costReserve: draft.costReserve, vat: draft.vat, idea: draft.idea, discovery: normalizeDiscovery(draft.discovery) },
    design: raw.design === null ? null : recipe(raw.design),
    alternatives: raw.alternatives.map(recipe),
    history: raw.history.map(entry => ({ design: recipe(entry.design), palette: palette(entry.palette) })),
  };
  if (!project.design && project.alternatives.length) throw Error('بدائل محفوظة بلا مخطط أساسي.');
  if (project.design && project.alternatives.some(r => JSON.stringify([r.plot, r.rooms]) !== JSON.stringify([project.design.plot, project.design.rooms]))) throw Error('البدائل المحفوظة ليست من متطلبات المخطط نفسه.');
  return project;
}
export function encodeProject({ plot, rooms, palette, rates, costReserve, vat, idea, discovery, model, alternatives = [], history = [] }) {
  // Only explicitly allowlisted data is saved. Access codes and provider keys are never read.
  const raw = { schema: 'mizan-handasi-project', version: 1, engineVersion: ENGINE_VERSION, savedAt: new Date().toISOString(),
    draft: { plot, rooms, palette, rates, costReserve, vat, idea, discovery }, design: modelRecipe(model),
    alternatives: alternatives.map(modelRecipe), history: history.slice(-5).map(h => ({ design: modelRecipe(h.model), palette: h.palette })) };
  return JSON.stringify(validateProject(raw), null, 2);
}
export function decodeProject(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_PROJECT_BYTES) throw Error('ملف المشروع أكبر من 2 ميغابايت أو غير صالح.');
  let raw;
  try { raw = JSON.parse(text); } catch { throw Error('تعذرت قراءة JSON المشروع. بقي العمل الحالي دون تغيير.'); }
  const project = validateProject(raw), cache = new Map();
  const rebuild = recipe => {
    if (!recipe) return null;
    const key = JSON.stringify(recipe);
    if (!cache.has(key)) cache.set(key, recipe.embedded ? structuredClone(recipe.embedded) : generateModel(recipe.plot, recipe.rooms, { strategy: recipe.strategy }));
    return cache.get(key);
  };
  // Rebuild and validate every design before allowing the UI to replace its state.
  return { ...project.draft, savedAt: project.savedAt, model: rebuild(project.design), alternatives: project.alternatives.map(rebuild), history: project.history.map(h => ({ model: rebuild(h.design), palette: h.palette })) };
}
export function quantitiesCSV(model, rates, reserve, vat) {
  const rows = quantityRows(model), totals = estimate(rows, rates, reserve, vat);
  const cell = value => '"' + String(value).replace(/"/g, '""') + '"';
  const round = value => Math.round(value * 10000) / 10000;
  const records = [
    ['الميزان الهندسي — كميات تصورية جزئية للدور الأرضي؛ ليست للتنفيذ'],
    ['البند', 'الكمية', 'الوحدة', 'سعر الوحدة ر.س', 'التكلفة ر.س'],
    ...rows.map(r => [r.name, round(r.quantity), r.unit, rates[r.key] ?? 'غير مسعّر', Number.isFinite(rates[r.key]) ? round(r.quantity * rates[r.key]) : 'غير مسعّر']),
    ['البنود غير المسعرة', totals.unpriced],
    ['المجموع الجزئي', totals.priced ? round(totals.subtotal) : 'غير مسعّر'],
    ['احتياط حسابي %', reserve, '', '', totals.priced ? round(totals.contingency) : 'غير مسعّر'],
    ['ضريبة مفترضة %', vat, '', '', totals.priced ? round(totals.tax) : 'غير مسعّر'],
    ['إجمالي البنود المسعرة فقط', '', '', '', totals.priced ? round(totals.grand) : 'غير مسعّر'],
  ];
  return '\uFEFF' + records.map(row => row.map(cell).join(',')).join('\r\n');
}
