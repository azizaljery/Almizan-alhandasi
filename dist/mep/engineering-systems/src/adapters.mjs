import { copy, fail, hash, canonical } from './core.mjs';
import { INPUT_SCHEMA, FRAME, validateProject } from './model.mjs';
const rect = r => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
const requiredFn = (fn, name) => { if (typeof fn !== 'function') fail('UPSTREAM_FUNCTION_REQUIRED', name); };
const base = (projectId, architecture, options) => validateProject({ schema: INPUT_SCHEMA, projectId, units: 'm', frame: FRAME, architecture, services: copy(options.services || {}), rules: copy(options.rules || {}) });

/** Uses Mizan's own topology, not label rectangles or an independently reconstructed plan. */
export async function fromDrawDoc(raw, options) {
  const { analyzeDoc, validateDoc, projectId, sourceRevision = 'UNSPECIFIED' } = options;
  requiredFn(analyzeDoc, 'analyzeDoc'); requiredFn(validateDoc, 'validateDoc');
  const doc = copy(raw), snapshot = canonical(doc);
  if (doc.schema !== 'mizan-draw/1') fail('DRAW_SCHEMA_UNSUPPORTED', 'doc.schema');
  if (doc.north !== 0) fail('FRAME_TRANSFORM_REQUIRED', 'doc.north', 'حوّل الإحداثيات إلى الشرق والشمال قبل الربط');
  const issues = validateDoc(doc);
  if (!Array.isArray(issues) || issues.some(x => x.severity === 'error')) fail('UPSTREAM_INVALID_DOC', 'validateDoc');
  const analysis = analyzeDoc(doc);
  if (!analysis || !Array.isArray(analysis.levels) || analysis.doc !== doc) fail('UPSTREAM_TOPOLOGY_REQUIRED', 'analyzeDoc');
  const levels = doc.levels.map(l => ({ id: l.id, elevationM: l.elevation, heightM: l.height }));
  const rooms = [], warnings = [...issues];
  for (const lv of analysis.levels) {
    if (lv.orphanLabels.length || lv.duplicates.length) fail('AMBIGUOUS_ROOM_LABELS', lv.level.id);
    for (const r of lv.rooms) {
      if (['courtyard', 'balcony'].includes(r.type)) continue;
      if (r.unlabelled) fail('UNLABELLED_SPACE', r.id);
      rooms.push({ id: r.id, levelId: r.levelId, type: r.type, name: r.name, polygon: copy(r.net), holes: copy(r.space.holes || []), heightM: lv.level.height });
    }
  }
  if (canonical(doc) !== snapshot) fail('UPSTREAM_MUTATED_INPUT', 'doc');
  return base(projectId, {
    source: { kind: 'mizan-draw/1', revision: sourceRevision, sha256: await hash(doc), warnings }, levels, rooms,
    walls: doc.walls.map(w => ({ id: w.id, levelId: w.level, a: w.a, b: w.b, thicknessM: w.t, heightM: w.h ?? levels.find(l => l.id === w.level).heightM })),
    openings: doc.openings.map(o => ({ id: o.id, levelId: doc.walls.find(w => w.id === o.wall).level, wallId: o.wall, kind: o.kind, atM: o.at, widthM: o.w, heightM: o.h, sillM: o.sill })),
    obstacles: copy(options.obstacles || [])
  }, options);
}

/** Legacy PlannerOutputContract/2 only. Current villa-layout-v2/v3 emit draw docs: use fromDrawDoc. */
export async function fromPlannerGeometry(raw, options) {
  requiredFn(options.validateModel, 'validateModel');
  const g = copy(raw), before = canonical(g), errors = options.validateModel(g);
  if (!Array.isArray(errors) || errors.length || canonical(g) !== before) fail('UPSTREAM_INVALID_GEOMETRY', 'validateModel');
  if (g.version !== 2 || g.drawnFloors !== 1) fail('PLANNER_VERSION_UNSUPPORTED', 'geometry');
  const elevationM = options.level?.elevationM, heightM = options.level?.heightM;
  const levelId = options.level?.id || 'L1';
  return base(options.projectId, {
    source: { kind: 'PlannerOutputContract/2', revision: options.sourceRevision || 'UNSPECIFIED', sha256: await hash(g), warnings: copy(g.warnings || []) },
    levels: [{ id: levelId, elevationM, heightM }],
    rooms: [...g.rooms, ...g.corridors].map(r => ({ id: r.id, levelId, name: r.name || r.id, type: r.type || 'corridor', polygon: rect(r), holes: [], heightM })),
    walls: g.walls.map(w => ({ id: w.id, levelId, a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 }, thicknessM: w.t, heightM: w.h })),
    openings: g.openings.map(o => { const w = g.walls.find(w => w.id === o.wallId); return { id: o.id, levelId, wallId: o.wallId, kind: o.type, atM: o.pos * Math.hypot(w.x2 - w.x1, w.y2 - w.y1), widthM: o.w, heightM: o.h, sillM: o.sill }; }),
    obstacles: copy(options.obstacles || [])
  }, options);
}

/** The supplied upstream adapter must validate the existing frozen envelope and request binding. */
export async function fromCandidateIR(rawCandidate, rawRequest, options) {
  requiredFn(options.adaptCandidateEnvelope, 'adaptCandidateEnvelope');
  const candidate = copy(rawCandidate), request = copy(rawRequest);
  if (options.projectId !== candidate.projectId) fail('PROJECT_ID_MISMATCH', 'candidate.projectId');
  const checked = await options.adaptCandidateEnvelope(copy(candidate), copy(request));
  if (!checked || canonical(checked.nativeGeometry) !== canonical(candidate.geometry) || canonical(checked.candidate) !== canonical(candidate) || canonical(checked.request) !== canonical(request)) fail('UPSTREAM_BINDING_MISMATCH', 'candidate');
  // One drawn floor is the only geometry supported by the inspected IR adapter.
  const g = candidate.geometry;
  const p = await fromPlannerGeometry(copy(g), { ...options, validateModel: options.validateNativeModel });
  p.architecture.source = { kind: 'MIZAN-IR/1.0.0', revision: options.sourceRevision || 'UNSPECIFIED', sha256: await hash(candidate), upstreamGeometryHash: copy(candidate.geometryHash), warnings: copy(checked.limitations || []) };
  return validateProject(p);
}
