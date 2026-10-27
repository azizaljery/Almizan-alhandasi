/** R21 — shared architectural brief contract. No natural-language model is replaced here. */
export const RELATIONS = Object.freeze({
  NEAR: 'NEAR', DIRECT_DOOR: 'DIRECT_DOOR', GUEST_ACCESS: 'GUEST_ACCESS',
  AVOID_ZONE: 'AVOID_ZONE', FAR: 'FAR'
});
export const LEVELS = Object.freeze({ HARD: 'HARD', SOFT: 'SOFT', ADVISORY: 'ADVISORY' });
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function normalizeDigits(s) { return String(s ?? '').replace(/[٠-٩]/g, x => String(AR_DIGITS.indexOf(x))); }
export function parseRequestedCount(text, fallback = 4, maximum = 10) {
  const t = normalizeDigits(text);
  const number = t.match(/(?:^|\s)(\d{1,2})\s*(?:تصاميم|تصميمات|تصميم|بدائل|بديل|مخططات|مخطط)(?=\s|$|[،,.])/u);
  const words = {'واحد':1,'واحدة':1,'اثنين':2,'اثنان':2,'ثلاثة':3,'ثلاث':3,'أربعة':4,'اربع':4,'خمسة':5,'خمس':5,'ستة':6,'ست':6};
  const word = t.match(/(?:^|\s)(واحد|واحدة|اثنين|اثنان|ثلاثة|ثلاث|أربعة|اربع|خمسة|خمس|ستة|ست)\s+(?:تصاميم|تصميمات|تصميم|بدائل|بديل|مخططات|مخطط)(?=\s|$|[،,.])/u);
  const count = number ? Number(number[1]) : word ? words[word[1]] : fallback;
  if (!Number.isSafeInteger(count) || count < 1 || count > maximum) {
    return { count: fallback, warning: 'REQUESTED_COUNT_UNSUPPORTED', parsed: count };
  }
  return { count, warning: null, parsed: count };
}
export function createBrief({ text = '', rooms = [], relations = [], dimensions = [], constraints = [], requestedCount, provenance = {} } = {}) {
  const parsed = parseRequestedCount(text);
  const count = requestedCount ?? parsed.count;
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('Invalid requested count');
  const normalizedRelations = relations.map((r, i) => {
    if (!Object.values(RELATIONS).includes(r.kind)) throw new Error(`Invalid relation kind at ${i}`);
    if (!r.from || (!r.to && r.kind !== 'AVOID_ZONE')) throw new Error(`Relation missing endpoint at ${i}`);
    return { id: r.id ?? `rel-${i}`, level: r.level ?? LEVELS.SOFT, source: r.source ?? 'user',
      quote: r.quote ?? null, ...r };
  });
  const normalizedDimensions = dimensions.map((d, i) => {
    if (!d.room || !(d.width > 0) || !(d.length > 0)) throw new Error(`Invalid dimension at ${i}`);
    return { id: d.id ?? `dim-${i}`, level: d.level ?? LEVELS.HARD, tolerance: d.tolerance ?? 0.05,
      source: d.source ?? 'user', ...d };
  });
  const normalizedConstraints = constraints.map((c, i) => ({
    id: c.id ?? `constraint-${i}`, level: c.level ?? LEVELS.HARD, source: c.source ?? 'user', ...c
  }));
  return Object.freeze({ version: 'MIZAN-R21-BRIEF/1', text, rooms: structuredClone(rooms),
    relations: normalizedRelations, dimensions: normalizedDimensions, constraints: normalizedConstraints,
    requestedCount: count, countWarning: parsed.warning, provenance: structuredClone(provenance) });
}
/** For old extractRequirements: preserve its original fields, then attach the canonical contract. */
export function attachSharedBrief(extracted, input, structured = {}) {
  const rawText = String(input?.text ?? input?.idea ?? extracted?.text ?? extracted?.idea ?? '');
  const brief = createBrief({ text: rawText, rooms: structured.rooms ?? [],
    relations: structured.relations ?? [], dimensions: structured.dimensions ?? [],
    constraints: structured.constraints ?? [], requestedCount: structured.requestedCount,
    provenance: { parser: 'existing-extractRequirements', ...structured.provenance } });
  return { ...extracted, text: rawText, brief, want: brief.requestedCount };
}
export function sharedReviewRequest(requirements, land, counts) {
  if (!requirements?.brief) throw new Error('Canonical brief missing; do not reinterpret original text in reviewer');
  return { text: requirements.brief.text, brief: requirements.brief,
    counts, land, prefs: requirements.prefs ?? {} };
}
/** NEAR is not DIRECT_DOOR: convert only explicitly stated semantics. */
export function diningRelation({ near = true, directDoor = false, guestAccess = false,
  avoidFamily = true, source = 'user', quote = null } = {}) {
  return [
    ...(near ? [{ from: 'majlis', to: 'dining', kind: RELATIONS.NEAR, level: LEVELS.SOFT, source, quote }] : []),
    ...(directDoor ? [{ from: 'majlis', to: 'dining', kind: RELATIONS.DIRECT_DOOR, level: LEVELS.HARD, source, quote }] : []),
    ...(guestAccess ? [{ from: 'majlis', to: 'dining', kind: RELATIONS.GUEST_ACCESS, level: LEVELS.HARD, source, quote }] : []),
    ...(guestAccess && avoidFamily ? [{ from: 'majlis', kind: RELATIONS.AVOID_ZONE, to: 'family', level: LEVELS.HARD, source, quote }] : [])
  ];
}
