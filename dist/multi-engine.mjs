import { runPipeline } from './integration/pipeline.mjs';
import { contentHash, canonicalJSON } from './integration/control/reference/identity.mjs';

const SHAPE_STRATEGY = Object.freeze({ rect: 'claude-rect', l: 'balanced', u: 'u-court' });
const CONCEPT = Object.freeze({
  rect: { tag: 'مستطيل منضبط', form: 'كتلة مستطيلة صريحة', idea: 'حل مباشر يختبر البرنامج ضمن كتلة واحدة واضحة.', bestFor: 'الأراضي والبرامج التي تفضّل البساطة', tradeoff: 'تنوع كتلي أقل مقابل وضوح أعلى', massing: 'rect' },
  l: { tag: 'كتلة L حقيقية', form: 'جناحان متعامدان', idea: 'يفتح جانبًا من الأرض ويكوّن فصلًا أوضح بين جناحين.', bestFor: 'الخصوصية والحديقة الجانبية', tradeoff: 'واجهة وجدران خارجية أطول', massing: 'l' },
  u: { tag: 'كتلة U حقيقية', form: 'ثلاثة أجنحة حول فناء مفتوح', idea: 'يحتضن فناءً داخليًا مفتوحًا مع اتصال بصري بين الأجنحة.', bestFor: 'الخصوصية والفناء المركزي', tradeoff: 'كتلة أكثر تعقيدًا وتحتاج مساحة مناسبة', massing: 'u' },
});

function publicRoom(room, index) {
  return {
    id: `room-${index}`,
    name: String(room.name),
    type: room.type,
    areaM2: Number(room.area),
    position: room.position,
    side: room.side,
  };
}
function preferenceList(discovery = {}, briefContext = null) {
  const rows = [];
  for (const value of discovery.likes || []) rows.push({ id: `like:${value}`, kind: 'prefer_aesthetic', description: `User selected concept preference: ${value}`, weight: 1, value: { key: value }, source: 'user' });
  for (const value of discovery.rejects || []) rows.push({ id: `reject:${value}`, kind: 'avoid_aesthetic', description: `User rejected concept: ${value}`, weight: 1, value: { key: value }, source: 'user' });
  for (const value of briefContext?.topPriorities || []) rows.push({ id: `priority:${rows.length}`, kind: 'prefer_priority', description: String(value), weight: 1, value: { text: String(value) }, source: 'user' });
  return rows;
}
export async function buildDesignRequest({ plot, rooms, idea = '', discovery = {}, briefContext = null }) {
  const program = rooms.map(publicRoom);
  const seed = {
    projectId: 'MIZAN-SITE-V33-P1',
    plot: {
      widthM: plot.width, lengthM: plot.length, entry: plot.entry, streets: { ...plot.streets },
      maxBuiltAreaM2: plot.maxBuiltArea ?? null, floorsRequested: plot.floors, coverageRatio: plot.coverage,
    },
    drawnFloorsSupported: 1,
    program,
    hardConstraints: [{ id: 'HC-ROOM-COUNT', kind: 'room_count_exact', description: 'Preserve the exact room program supplied by the user.', value: { count: program.length }, source: 'user', priority: 'must' }],
    softPreferences: preferenceList(discovery, briefContext),
    interpretation: {
      status: 'confirmed',
      originalText: [idea || 'Manual design request.', `streetSetback=${plot.streetSetback};neighborSetback=${plot.neighborSetback}`].filter(Boolean).join('\n'),
      unresolved: [],
      priorities: (briefContext?.topPriorities || []).map(String),
    },
  };
  const id = await contentHash(seed);
  return { schemaVersion: '1.0.0', kind: 'DesignRequest', ...seed, requestId: `site:${id.value}` };
}
function modelFor(pair) {
  const shape = pair.candidate.actualShape;
  return {
    ...structuredClone(pair.candidate.geometry),
    strategy: SHAPE_STRATEGY[shape] || 'claude-rect',
    architecture: CONCEPT[shape] || CONCEPT.rect,
    massingParts: structuredClone(pair.candidate.presentation.massingParts || null),
    engineVersion: 'mizan-p1-integrated',
    integration: {
      candidateId: pair.candidate.candidateId,
      geometryHash: structuredClone(pair.candidate.geometryHash),
      reviewId: pair.review.reviewId,
      reviewOverall: pair.review.overall,
      reviewCoverage: structuredClone(pair.review.coverage),
    },
  };
}
export async function runMultiEngineDesign({ plot, rooms, idea = '', discovery = {}, briefContext = null }) {
  const request = await buildDesignRequest({ plot, rooms, idea, discovery, briefContext });
  const before = canonicalJSON({ plot, rooms });
  const result = await runPipeline(request, { generationOverrides: { streetSetback: plot.streetSetback, neighborSetback: plot.neighborSetback } });
  if (canonicalJSON({ plot, rooms }) !== before) throw Error('INTEGRATION_MUTATED_CALLER_INPUT');
  if (result.decision.status !== 'SELECTED_PRELIMINARY' || !result.finalDesignState) {
    const details = [...(result.decision?.reasons || []), ...(result.failures || []).map(x => `${x.shape}: ${x.reason}`)].join(' | ');
    const userFacingDetails = details.replaceAll(
      'ADDITIONAL_FLOORS_NOT_IMPLEMENTED',
      'طلبتَ أكثر من دور، لكن محرك التصميم الحالي يرسم الدور الأرضي فقط. اختر «دور واحد» ثم أعد التوليد.'
    );
    throw Error(userFacingDetails || 'لم يتمكن محرك القرار من اعتماد بديل تخطيطي أولي.');
  }
  const pairs = result.pairs;
  const models = pairs.map(modelFor);
  const selectedIndex = pairs.findIndex(p => p.candidate.candidateId === result.decision.selectedCandidateId);
  if (selectedIndex < 0) throw Error('AZIZ_SELECTION_NOT_FOUND');
  const selectedModel = models[selectedIndex];
  return {
    models,
    selectedModel,
    selectedIndex,
    failures: (result.failures || []).map(f => ({ strategy: SHAPE_STRATEGY[f.shape] || f.shape, reason: f.reason })),
    decision: result.decision,
    aziz: result.aziz,
    reviews: pairs.map(p => p.review),
    request,
  };
}
