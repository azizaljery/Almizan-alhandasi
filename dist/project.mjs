import { normalizeDiscovery } from './client-brief.mjs';
import { ENGINE_VERSION, STRATEGIES, validatePlot, normalizeRooms, generateModel, validateModel } from './planner.mjs';
import { estimate, quantityRows } from './estimates.mjs';
import { validateLandSurvey } from './land-survey.mjs';
import { normalizeSiteSolar } from './solar-context.mjs';
import { normalizeStudioSession } from './studio-session.mjs';
import schema from './integration/control/contracts/mizan-envelope-v1.schema.mjs';
import { canonicalJSON, FRAME, UNITS } from './integration/control/reference/identity.mjs';
import { sha256 } from './integration/browser-crypto.mjs';

export const MAX_PROJECT_BYTES = 2_000_000;
// DEC-002 (ID-01): identity is re-verified on restore. Same key set and same canonical profile as
// integration/pipeline.mjs (GEOMETRY_KEYS + mizan-json-sorted-keys-v1); the synchronous SHA-256 is byte-identical to WebCrypto.
const GEOMETRY_KEYS = [...Object.keys(schema.$defs.geometry.properties), 'footprint', 'program'];
export const recomputeGeometryHash = model => sha256(canonicalJSON({ units: UNITS, frame: FRAME, geometry: Object.fromEntries(GEOMETRY_KEYS.filter(k => model[k] !== undefined).map(k => [k, model[k]])) }));
/** Fail CLOSED: a stored geometryHash that does not match the restored geometry (or cannot be checked) invalidates the
 *  identity exactly like an edit does (geometry-editor.mjs) and demands a new review. The file is never rejected for this. */
export function verifyRestoredIdentity(model) {
  const i = model?.integration;
  if (!i || i.requiresReview === true || (i.candidateId == null && i.geometryHash == null)) return model; // legacy, or already invalidated
  let ok = false;
  try { ok = typeof i.geometryHash?.value === 'string' && i.geometryHash.value === recomputeGeometryHash(model); } catch { ok = false; }
  if (ok) return model;
  model.integration = { previousCandidateId: i.candidateId || i.previousCandidateId || null, candidateId: null, geometryHash: null, reviewId: null,
    reviewOverall: 'NOT_EVALUATED', reviewCoverage: null, requiresReview: true, restoreCheck: 'GEOMETRY_HASH_MISMATCH' };
  return model;
}
const palettes = ['resort', 'modern', 'classic', 'hijazi'];
const publicRooms = rooms => normalizeRooms(rooms).map(({ name, type, area, position, side, dimensions }) => ({ name, type, area, position, side, ...(dimensions ? { dimensions: { ...dimensions } } : {}) }));
const palette = value => { if (!palettes.includes(value)) throw Error('طابع محفوظ غير معروف.'); return value; };
export const modelRecipe = model => model ? { plot: validatePlot(model.plot), rooms: publicRooms(model.program), strategy: model.strategy || 'compact', geometryVersion: 1, embedded: structuredClone(model) } : null;
function recipe(raw) {
  if (!raw || !Object.hasOwn(STRATEGIES, raw.strategy)) throw Error('وصف توزيع محفوظ غير صالح.');
  const out = { plot: validatePlot(raw.plot), rooms: publicRooms(raw.rooms), strategy: raw.strategy };
  // Geometry storage is versioned independently of the project envelope. Old
  // recipe-only projects and unmarked integrated snapshots remain readable.
  // A marked snapshot may never fall back to regeneration when geometry is lost.
  if (Object.hasOwn(raw, 'geometryVersion') && (raw.geometryVersion !== 1 || raw.embedded === undefined)) throw Error('إصدار حفظ هندسة المخطط غير صالح أو هندسته مفقودة.');
  if (raw.embedded !== undefined) {
    if (!raw.embedded || typeof raw.embedded !== 'object' || Array.isArray(raw.embedded) ||
      ![1, 2].includes(raw.embedded.version) ||
      (raw.geometryVersion !== 1 && raw.embedded.engineVersion !== 'mizan-p1-integrated')) throw Error('المخطط المدمج المحفوظ غير صالح.');
    const embedded = structuredClone(raw.embedded);
    let errors;
    try { errors = validateModel(embedded); }
    catch { throw Error('هندسة المخطط المحفوظ غير مكتملة أو غير صالحة.'); }
    if (errors.length) throw Error('المخطط المدمج المحفوظ غير صالح: ' + errors[0]);
    if (embedded.strategy !== raw.strategy || JSON.stringify(validatePlot(embedded.plot)) !== JSON.stringify(out.plot) || JSON.stringify(publicRooms(embedded.program)) !== JSON.stringify(out.rooms)) throw Error('بيانات المخطط المدمج لا تطابق وصف الحفظ.');
    if (raw.geometryVersion === 1) out.geometryVersion = 1;
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
    draft: { plot: validatePlot(draft.plot), rooms: publicRooms(draft.rooms), palette: palette(draft.palette), rates, costReserve: draft.costReserve, vat: draft.vat, idea: draft.idea, discovery: normalizeDiscovery(draft.discovery), landSurvey: validateLandSurvey(draft.landSurvey ?? null) },
    modelLandSurvey: validateLandSurvey(Object.hasOwn(raw, 'modelLandSurvey') ? raw.modelLandSurvey : (draft.landSurvey ?? null)),
    siteSolar: normalizeSiteSolar(raw.siteSolar),
    modelSurveyAssociated: Object.hasOwn(raw, 'modelLandSurvey') && (!Object.hasOwn(raw,'modelSurveyAssociated') || raw.modelSurveyAssociated === true),
    design: raw.design === null ? null : recipe(raw.design),
    alternatives: raw.alternatives.map(recipe),
    history: raw.history.map(entry => ({ design: recipe(entry.design), palette: palette(entry.palette), ...(entry.siteSolar ? {siteSolar: normalizeSiteSolar(entry.siteSolar)} : {}), ...(Object.hasOwn(entry,'modelSurveyAssociated') ? {modelSurveyAssociated: entry.modelSurveyAssociated === true} : {}), ...(entry.landSurvey ? { landSurvey: validateLandSurvey(entry.landSurvey) } : {}) })),
  };
  const matchesSurveyBinding = (plot, survey) => !survey || survey.engineLink !== 'survey-rectangle' ||
    (Math.abs(plot.width - survey.binding.width) <= 1e-8 && Math.abs(plot.length - survey.binding.length) <= 1e-8);
  if (!matchesSurveyBinding(project.draft.plot, project.draft.landSurvey)) throw Error('أبعاد الأرض المحفوظة لا تطابق الربط الصريح للمسح بالمولد.');
  if (project.design && !matchesSurveyBinding(project.design.plot, project.modelLandSurvey)) throw Error('المخطط الأساسي لا يطابق أبعاد ربط مسح نسخته.');
  for (const entry of project.history) if (!matchesSurveyBinding(entry.design.plot, entry.landSurvey)) throw Error('إحدى النسخ السابقة لا تطابق أبعاد ربط مسحها بالمولد.');
  if (!project.design && project.alternatives.length) throw Error('بدائل محفوظة بلا مخطط أساسي.');
  if (project.design && project.alternatives.some(r => JSON.stringify([r.plot, r.rooms]) !== JSON.stringify([project.design.plot, project.design.rooms]))) throw Error('البدائل المحفوظة ليست من متطلبات المخطط نفسه.');
  return project;
}
export function encodeProject({ plot, rooms, palette, rates, costReserve, vat, idea, discovery, model, alternatives = [], history = [], landSurvey = null, modelLandSurvey = landSurvey, modelSurveyAssociated = true, siteSolar = null, studioSession }) {
  // Only explicitly allowlisted data is saved. Access codes and provider keys are never read.
  const raw = { schema: 'mizan-handasi-project', version: 1, engineVersion: ENGINE_VERSION, savedAt: new Date().toISOString(),
    draft: { plot, rooms, palette, rates, costReserve, vat, idea, discovery, landSurvey }, modelLandSurvey, modelSurveyAssociated, siteSolar, design: modelRecipe(model),
    alternatives: alternatives.map(modelRecipe), history: history.slice(-5).map(h => ({ design: modelRecipe(h.model), palette: h.palette, ...(h.siteSolar ? {siteSolar: h.siteSolar} : {}), ...(Object.hasOwn(h,'modelSurveyAssociated') ? {modelSurveyAssociated: h.modelSurveyAssociated === true} : {}), ...(h.landSurvey ? { landSurvey: h.landSurvey } : {}) })) };
  const project = validateProject(raw);
  // The session contains transcript and revision references only. Its approval
  // is checked against this one authoritative saved design, never a second model.
  project.studioSession = normalizeStudioSession(studioSession, { model: project.design?.embedded ?? null, legacy: studioSession === undefined });
  const text = JSON.stringify(project, null, 2);
  if (new TextEncoder().encode(text).length > MAX_PROJECT_BYTES) throw Error('ملف المشروع أكبر من 2 ميغابايت؛ قلّل عدد البدائل أو النسخ المحفوظة.');
  return text;
}
export function decodeProject(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_PROJECT_BYTES) throw Error('ملف المشروع أكبر من 2 ميغابايت أو غير صالح.');
  let raw;
  try { raw = JSON.parse(text); } catch { throw Error('تعذرت قراءة JSON المشروع. بقي العمل الحالي دون تغيير.'); }
  const project = validateProject(raw), cache = new Map();
  const rebuild = recipe => {
    if (!recipe) return null;
    const key = JSON.stringify(recipe);
    if (!cache.has(key)) cache.set(key, recipe.embedded ? verifyRestoredIdentity(structuredClone(recipe.embedded)) : generateModel(recipe.plot, recipe.rooms, { strategy: recipe.strategy }));
    return cache.get(key);
  };
  // Rebuild and validate every design before allowing the UI to replace its state.
  const model = rebuild(project.design);
  const studioSession = normalizeStudioSession(raw.studioSession, { model, legacy: !Object.hasOwn(raw, 'studioSession') });
  return { ...project.draft, modelLandSurvey: project.modelLandSurvey, modelSurveyAssociated: project.modelSurveyAssociated, siteSolar: project.siteSolar, savedAt: project.savedAt, model, studioSession, alternatives: project.alternatives.map(rebuild), history: project.history.map(h => ({ model: rebuild(h.design), palette: h.palette, ...(h.siteSolar ? {siteSolar: h.siteSolar} : {}), ...(Object.hasOwn(h,'modelSurveyAssociated') ? {modelSurveyAssociated: h.modelSurveyAssociated === true} : {}), ...(h.landSurvey ? { landSurvey: h.landSurvey } : {}) })) };
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
