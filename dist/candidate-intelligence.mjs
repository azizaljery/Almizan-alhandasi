import { DesignIntelligenceEngine } from './integration/gemini/packages/design-intelligence/engine.js';
import { DesignIntelligenceResult } from './integration/gemini/packages/design-intelligence/contracts/aziz-integration.contract.js';
import { assessPlan } from './plan-evidence.mjs';

// Labels supported by the library are mapped from explicit room types only.
// Entrance roles, upper floors and gardens are never inferred from names.
const TYPES = {
  GUEST_RECEPTION: ['majlis'], GUEST_WING: ['majlis'], MEN_MAJLIS: ['majlis'],
  FAMILY_LIVING: ['living'], FAMILY_WING: ['living'], FAMILY_PRIVATE_ROOMS: ['living', 'bedroom'],
  BEDROOM_WING: ['bedroom', 'master-bedroom'], BEDROOMS: ['bedroom', 'master-bedroom'],
  KITCHEN: ['kitchen'], DINING: ['dining'], SERVICE_QUARTERS: ['service', 'storage'], SERVICE_WING: ['service', 'storage']
};
export function designIntelligenceContext(model, requestId = 'local-plan') {
  const sides = Object.keys(model.plot.streets).filter(k => model.plot.streets[k]);
  const opposite = sides.length === 2 && ((sides.includes('n') && sides.includes('s')) || (sides.includes('e') && sides.includes('w')));
  const across = ['e', 'w'].includes(model.plot.entry);
  const doors = model.openings.filter(o => o.type === 'door');
  return {
    requestId,
    plot: { areaSqM: model.plot.width * model.plot.length, frontageM: across ? model.plot.length : model.plot.width,
      depthM: across ? model.plot.width : model.plot.length,
      streetCondition: sides.length === 1 ? 'ONE_STREET' : sides.length === 2 ? opposite ? 'TWO_STREETS_OPPOSITE' : 'TWO_STREETS_CORNER' : sides.length === 3 ? 'THREE_STREETS' : sides.length === 4 ? 'FOUR_STREETS' : 'UNSPECIFIED' },
    requirements: { spaces: model.rooms.map(r => ({ id: r.id, type: r.type, areaSqM: r.w * r.h })),
      needsDualKitchen: model.rooms.filter(r => r.type === 'kitchen').length > 1,
      hasUndifferentiatedMajlis: model.rooms.some(r => r.type === 'majlis') },
    candidateSpatialGraph: { nodes: [...model.rooms, ...model.corridors].map(r => ({ id: r.id, type: r.type || 'corridor' })),
      edges: [...doors.filter(o => o.connects?.length === 2).map(o => ({ source: o.connects[0], target: o.connects[1], openingId: o.id })),
        ...model.links.map(([source, target]) => ({ source, target }))] }
  };
}

export function comparePatternToPlan(pattern, model, evidence = assessPlan(model)) {
  const checks = [];
  const resolve = label => model.rooms.filter(r => TYPES[label]?.includes(r.type)).map(r => r.id);
  const direct = (a, b) => model.openings.some(o => o.type === 'door' && o.connects?.includes(a) && o.connects.includes(b));
  for (const [kind, rows] of [['required', pattern.requiredAdjacencies || []], ['forbidden', pattern.forbiddenAdjacencies || []]]) {
    for (const [from, to] of rows) {
      const a = resolve(from), b = resolve(to);
      const supported = !evidence.nativeValidation.errors.length && a.length > 0 && b.length > 0;
      const matches = a.flatMap(x => b.filter(y => y !== x).map(y => ({ from: x, to: y, direct: direct(x, y) })));
      checks.push({ from, to, kind, status: supported && matches.length ? (kind === 'required' ? matches.every(x => x.direct) : matches.every(x => !x.direct)) ? 'PASS' : 'FAIL' : 'NOT_EVALUATED',
        evidence: matches, reason: 'Direct door comparison only; shared corridors do not prove direct adjacency or visual privacy.' });
    }
  }
  const measured = checks.filter(c => c.status !== 'NOT_EVALUATED');
  return { patternId: pattern.patternId, status: checks.length && measured.length === checks.length ? 'ESTIMATE' : 'NOT_EVALUATED',
    score: checks.length && measured.length === checks.length ? measured.filter(c => c.status === 'PASS').length / measured.length * 100 : null,
    checks, evaluatedChecks: measured.length, totalChecks: checks.length,
    provenance: { classification: 'HEURISTIC', externalVerification: 'NOT_AVAILABLE', declaredSource: structuredClone(pattern.provenance || {}) } };
}

export function retrievePlanIntelligence(model, { requestId, candidateId = null, geometryHash = null } = {}) {
  const context = designIntelligenceContext(model, requestId);
  const engine = new DesignIntelligenceEngine();
  const guidance = engine.retrieveCandidates(context);
  const evidence = assessPlan(model);
  const patterns = guidance.retrievedPatterns.map(p => ({ ...p,
    // Keep legacy retrieval ranking as guidance, separately from candidate evidence.
    guidanceScore: p.matchScore, matchScore: null,
    comparison: comparePatternToPlan(engine.macroPatterns.find(r => r.patternId === p.patternId), model, evidence) }));
  const result = new DesignIntelligenceResult({ requestId: context.requestId, retrievedPatterns: patterns, candidateStrategies: patterns,
    compatibilityScores: Object.fromEntries(patterns.map(p => [p.patternId, p.comparison])),
    warnings: guidance.warnings, assumptions: [], unresolved: ['Unverified library provenance and unsupported reference labels remain NOT_EVALUATED.'],
    confidence: null, provenance: { libraryVersion: '2026.1', sourceType: 'HEURISTIC_PATTERN_REPOSITORY', externalVerification: 'NOT_AVAILABLE', verifiedAt: null } });
  return Object.assign(result, { sourceCandidateId: candidateId, sourceGeometryHash: geometryHash, context, planEvidence: evidence });
}
