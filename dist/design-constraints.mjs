// Explicit client constraints that are provable against the real candidate geometry.
// Not a parallel planner. No claims about sunlight, privacy, accessibility or regulations.
const noCourt = [
  /(?:^|[\s،؛.,:])(?:بدون|دون|بلا)\s+(?:أي\s+)?(?:فناء|الفناء|باحة\s+داخلية|حوش\s+داخلي)(?=$|[\s،؛.,:])/iu,
  /(?:^|[\s،؛.,:])لا\s+(?:أريد|نريد|أبغى|أبي|ابغى|ابي)\s+(?:أي\s+)?(?:فناء|الفناء|باحة\s+داخلية|حوش\s+داخلي)(?=$|[\s،؛.,:])/iu,
  /(?:^|[\s،؛.,:])لا\s+(?:فناء|الفناء)(?=$|[\s،؛.,:])/iu,
  /\b(?:no|without)\s+(?:an?\s+)?courtyard\b/iu,
];
const yesCourt = [
  /(?:^|[\s،؛.,:])(?:أريد|اريد|أبغى|ابغى|أبي|ابي|نريد)\s+(?:أي\s+)?(?:فناء|الفناء|باحة\s+داخلية)(?=$|[\s،؛.,:])/iu,
  /\b(?:want|add|include)\s+(?:an?\s+)?courtyard\b/iu,
];
const normalize = value => String(value ?? '').slice(0, 4000).normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '');
const matches = (patterns, text) => patterns.some(pattern => pattern.test(text));
export const SUPPORTED_SHAPES = Object.freeze(['rect', 'l', 'u']);

export function extractExplicitGeometryConstraints({ idea = '' } = {}) {
  const source = normalize(idea);
  const latest = source.includes('التعديل المطلوب الآن:') ? source.split('التعديل المطلوب الآن:').at(-1) : '';
  const recentBan = matches(noCourt, latest);
  const recentRequest = matches(yesCourt, latest) && !recentBan;
  const banned = recentBan || (!recentRequest && matches(noCourt, source));
  return {
    noCourtyard: banned,
    evidence: banned ? [{ id: 'HC-NO-COURTYARD', source: 'user', description: 'العميل لا يريد فناءً داخليًا.' }] : [],
  };
}

export function filterShapesByExplicitConstraints(shapes = SUPPORTED_SHAPES, constraints = {}) {
  if (!Array.isArray(shapes) || !shapes.length || shapes.some(shape => !SUPPORTED_SHAPES.includes(shape))) {
    throw Error('INVALID_SHAPE_LIST');
  }
  const allowed = [], excluded = [];
  for (const shape of [...new Set(shapes)]) {
    if (constraints.noCourtyard && shape === 'u') {
      excluded.push({ shape, code: 'EXPLICIT_NO_COURTYARD', reason: 'استُبعد شكل U لأنه يتضمن فناءً مفتوحًا وأنت طلبت عدم وجود فناء.' });
    } else allowed.push(shape);
  }
  if (!allowed.length) throw Error('NO_SHAPES_SATISFY_EXPLICIT_REQUIREMENTS');
  return { allowed, excluded };
}

export function verifyGeometryAgainstExplicitConstraints(models, constraints = {}) {
  if (!Array.isArray(models)) throw Error('INVALID_MODEL_LIST');
  const violations = [];
  if (constraints.noCourtyard) for (const model of models) {
    if (!model || !Array.isArray(model.courtyards)) {
      violations.push({ code: 'COURTYARD_GEOMETRY_UNVERIFIABLE', shape: model?.shape ?? null });
    } else if (model.courtyards.length) {
      violations.push({ code: 'EXPLICIT_NO_COURTYARD_VIOLATED', shape: model.shape ?? null });
    }
  }
  return { pass: violations.length === 0, violations };
}
