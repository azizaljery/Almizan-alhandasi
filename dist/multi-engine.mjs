import { extractShapeIntent } from './client-request.mjs';
import { resolveDesignShapes } from './design-selection.mjs';
import { runPipeline, generateCandidate, decideReviewed } from './integration/pipeline.mjs';
import { reviewCandidate } from './integration/gemini/packages/design-intelligence/adapters/mizan-review-v1.js';
import { explorationSpecs, selectDiverse, conceptFor, layoutDescriptor } from './design-exploration.mjs';
import { contentHash, canonicalJSON } from './integration/control/reference/identity.mjs';
import { buildPreferenceRequests, evaluatePlanPreferences } from './preference-evidence.mjs';
import { extractExplicitGeometryConstraints, verifyGeometryAgainstExplicitConstraints } from './design-constraints.mjs';

const SHAPE_STRATEGY = Object.freeze({ rect: 'claude-rect', l: 'balanced', u: 'u-court', pavilions: 'pavilions', staggered: 'staggered' });
const CONCEPT = Object.freeze({
  staggered: { tag: 'جناحان متدرجان مرتبطان', form: 'جناحان متبادلان جانبيًا تصل بينهما وصلة عرضية', idea: 'جناحان منفصلان بفجوة خارجية ورواق رابط مغطى قابل للفحص.', bestFor: 'مقارنة توزيع المناطق على أرض أوسع', tradeoff: 'يحتاج عمقًا وعرضًا إضافيين؛ لا يثبت الخصوصية أو صلاحية التنفيذ', massing: 'staggered' },
  pavilions: { tag: 'أجنحة مرتبطة برواق', form: 'أجنحة تفصلها فراغات خارجية', idea: 'كتل حقيقية تربطها حركة مغطاة وتحفظ البرنامج.', bestFor: 'البرنامج المقسم إلى مناطق', tradeoff: 'يتطلب عمقًا أكبر ولا يضمن مداخل مستقلة', massing: 'pavilions' },
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
    ...(room.dimensions ? { exactDimensionsM: { widthM: room.dimensions.width, lengthM: room.dimensions.length } } : {}),
    position: room.position,
    side: room.side,
  };
}
export function requestedDesignShapes({ idea = '', discovery = {}, selectedShape = null }) {
  const intent = extractShapeIntent(idea);
  if (intent.questions.length) throw Error(intent.questions.join(' '));
  if (intent.shape === 'closed') throw Error('الفناء المغلق من أربع جهات غير متاح للتوليد؛ لم نستبدله بشكل آخر.');
  const explicitGeometry = extractExplicitGeometryConstraints({ idea });
  if (explicitGeometry.noCourtyard && intent.shape === 'u') throw Error('طلبت شكل U مع فناء ثم طلبت عدم وجود فناء؛ وضّح أيهما تريد قبل التوليد.');
  const allowed = resolveDesignShapes(discovery, selectedShape).filter(shape =>
    !intent.rejectedShapes.includes(shape) && !(explicitGeometry.noCourtyard && shape === 'u'));
  if (intent.shape && !allowed.includes(intent.shape)) throw Error('الشكل المطلوب في الوصف يتعارض مع اختيار الشكل الحالي؛ وحّد اختيارك قبل التوليد.');
  const resolved = intent.shape ? [intent.shape] : allowed;
  if (!resolved.length) throw Error('استبعدت جميع الأشكال المدعومة؛ اختر شكلًا متاحًا قبل التوليد.');
  return resolved;
}

export async function buildDesignRequest({ plot, rooms, idea = '', discovery = {}, briefContext = null, selectedShape = null }) {
  const shapes = requestedDesignShapes({ idea, discovery, selectedShape });
  const textIntent = extractShapeIntent(idea);
  const shapeConstraint = selectedShape !== null || discovery.rejects?.length || textIntent.shape || textIntent.rejectedShapes.length ? [{ id: 'HC-USER-SHAPES', kind: 'shape_allowed', description: 'Preserve explicit allowed shapes without fallback.', value: { shapes }, source: 'user', priority: 'must' }] : [];
  const wingCount = textIntent.shape === 'staggered' ? textIntent.wingCount : selectedShape === 'staggered' ? 2 : null;
  const wingCountConstraint = wingCount === null ? [] : [{ id: 'HC-WING-COUNT', kind: 'wing_count_exact', description: 'Preserve the exact requested number of staggered wings.', value: { count: wingCount }, source: 'user', priority: 'must' }];
  const program = rooms.map(publicRoom);
  const softPreferences = buildPreferenceRequests({ idea, discovery, briefContext });
  const unresolvedRequired = softPreferences.filter(pref => pref.value?.mustRequirement).map(pref =>
    `Unverified mandatory request (${pref.value.mizanKind}): ${pref.description}. It is not enforced by the generator/reviewer; clarify or remove the must-language before selecting/exporting a plan.`);
  const dimensionConstraints = program.filter(p => p.exactDimensionsM).map(p => ({
    id: `dimensions:${p.id}`, kind: 'room_dimensions_exact', description: `Preserve the exact clear dimensions of ${p.name}, allowing a 90-degree rotation.`,
    value: { roomId: p.id, widthM: p.exactDimensionsM.widthM, lengthM: p.exactDimensionsM.lengthM, rotationAllowed: true, toleranceM: 1e-5 }, source: 'user', priority: 'must',
  }));
  const seed = {
    projectId: 'MIZAN-SITE-V33-P1',
    plot: {
      widthM: plot.width, lengthM: plot.length, entry: plot.entry, streets: { ...plot.streets },
      maxBuiltAreaM2: plot.maxBuiltArea ?? null, floorsRequested: plot.floors, coverageRatio: plot.coverage,
    },
    drawnFloorsSupported: 1,
    program,
    hardConstraints: [{ id: 'HC-ROOM-COUNT', kind: 'room_count_exact', description: 'Preserve the exact room program supplied by the user.', value: { count: program.length }, source: 'user', priority: 'must' }, ...dimensionConstraints, ...shapeConstraint, ...wingCountConstraint],
    softPreferences,
    interpretation: {
      status: 'confirmed',
      originalText: [idea || 'Manual design request.', `streetSetback=${plot.streetSetback};neighborSetback=${plot.neighborSetback}`].filter(Boolean).join('\n'),
      unresolved: unresolvedRequired,
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
    architecture: pair.concept || CONCEPT[shape] || CONCEPT.rect,
    exploration: { descriptor: layoutDescriptor(pair.candidate.geometry) },
    massingParts: structuredClone(pair.candidate.presentation.massingParts || null),
    engineVersion: 'mizan-p1-integrated',
    integration: {
      candidateId: pair.candidate.candidateId,
      alternativeKey: pair.candidate.alternativeKey,
      geometryHash: structuredClone(pair.candidate.geometryHash),
      reviewId: pair.review.reviewId,
      reviewOverall: pair.review.overall,
      reviewCoverage: structuredClone(pair.review.coverage),
    },
  };
}
export async function runMultiEngineDesign({ plot, rooms, idea = '', discovery = {}, briefContext = null, selectedShape = null, seed = 1, previous = [] }) {
  const request = await buildDesignRequest({ plot, rooms, idea, discovery, briefContext, selectedShape });
  const allowedShapes = requestedDesignShapes({ idea, discovery, selectedShape });
  const before = canonicalJSON({ plot, rooms });
  const overrides = { streetSetback: plot.streetSetback, neighborSetback: plot.neighborSetback };
  let result;
  if (plot.floors !== 1) result = await runPipeline(request, { generationOverrides: overrides });
  else {
    const candidates = [], failures = [];
    const routeFocused = request.softPreferences.some(pref => ['avoid_long_corridors','prefer_dining_access_all_majlis','prefer_dining_far_from_majlis','prefer_kitchen_dining_route',
      'avoid_shared_guest_family_corridors','avoid_bedroom_guest_proximity'].includes(pref.value?.mizanKind || pref.kind));
    const specs = explorationSpecs(seed, { routeFocused }).filter(spec => allowedShapes.includes(spec.shape));
    if (allowedShapes.includes('pavilions')) specs.push({ shape: 'pavilions', key: 'pavilions-baseline', mode: -1, seed });
    if (allowedShapes.includes('staggered')) specs.push({ shape: 'staggered', key: 'staggered-baseline', mode: -1, seed });
    for (const spec of specs) {
      try {
        const composed = ['pavilions','staggered'].includes(spec.shape);
        const generated = await generateCandidate(request, spec.shape, overrides, composed ? null : spec);
        candidates.push({ ...generated, concept: composed ? CONCEPT[spec.shape] : conceptFor(spec, spec.shape) });
      } catch (error) { if (spec.mode < 0) failures.push({ shape: spec.shape, reason: error.message }); }
    }
    const priorityIds = [];
    if (routeFocused) {
      const baselineIds = candidates.filter(g => /-baseline$/.test(g.candidate.alternativeKey)).map(g => g.candidate.candidateId);
      const metricRows = new Map();
      for (const generated of candidates) for (const row of evaluatePlanPreferences(generated.candidate.geometry, request.softPreferences)) {
        const metrics = row.data?.preferenceMetrics || (Number.isFinite(row.objective) && row.direction
          ? [{ name: `${row.id}:objective`, value: row.objective, direction: row.direction }] : []);
        for (const metric of metrics) {
          if (!Number.isFinite(metric.value)) continue;
          const prior = metricRows.get(metric.name) || { direction: metric.direction, rows: [] };
          prior.rows.push({ candidateId: generated.candidate.candidateId, value: metric.value,
            routeFocused: /-route-mode-/.test(generated.candidate.alternativeKey) }); metricRows.set(metric.name, prior);
        }
      }
      const priority = ['longest_entry_route_m','mean_entry_route_m','modeled_corridor_area_m2','total_corridor_axis_m','longest_corridor_axis_m'];
      const names = [...metricRows.keys()].sort((a, b) => {
        const ai = priority.findIndex(name => a.includes(name)), bi = priority.findIndex(name => b.includes(name));
        return (ai < 0 ? priority.length : ai) - (bi < 0 ? priority.length : bi) || a.localeCompare(b);
      });
      const metricWinnerIds = [];
      for (const name of names) {
        const metric = metricRows.get(name); const direction = metric.direction;
        const routeCandidates = metric.rows.filter(row => row.routeFocused);
        const pool = routeCandidates.length ? routeCandidates : metric.rows;
        const winner = [...pool].sort((a, b) => (direction === 'maximize' ? b.value - a.value : a.value - b.value)
          || a.candidateId.localeCompare(b.candidateId))[0];
        if (winner && !metricWinnerIds.includes(winner.candidateId)) metricWinnerIds.push(winner.candidateId);
      }
      priorityIds.push(...baselineIds, ...metricWinnerIds);
    }
    const diverse = selectDiverse(candidates, previous, undefined, priorityIds);
    if (!diverse.length && candidates.length && previous.length) throw Error('لم يجد البحث الحالي أفكارًا أخرى تختلف بما يكفي ضمن هذه القيود. بقيت البدائل السابقة محفوظة؛ جرّب البحث مجددًا أو وسّع حرية توزيع الغرف.');
    const pairs = [];
    for (const generated of diverse) {
      try { pairs.push({ ...generated, review: await reviewCandidate(generated.candidate, request) }); }
      catch (error) { failures.push({ shape: generated.candidate.actualShape, reason: `REVIEW_REJECTED:${error.message}` }); }
    }
    result = { pairs, failures, ...await decideReviewed(request, pairs) };
  }
  if (canonicalJSON({ plot, rooms }) !== before) throw Error('INTEGRATION_MUTATED_CALLER_INPUT');
  if (result.decision.status !== 'SELECTED_PRELIMINARY' || !result.finalDesignState) {
    const details = [...(result.decision?.reasons || []), ...(result.failures || []).map(x => `${x.shape}: ${x.reason}`)].join(' | ');
    const userFacingDetails = details.replaceAll(
      'ADDITIONAL_FLOORS_NOT_IMPLEMENTED',
      'طلبتَ أكثر من دور، لكن محرك التصميم الحالي يرسم الدور الأرضي فقط. اختر «دور واحد» ثم أعد التوليد.'
    );
    throw Error((request.hardConstraints.some(c=>c.kind==='shape_allowed') ? 'تعذّر تنفيذ الشكل المختار ضمن المدخلات الحالية؛ لم نولّد شكلًا آخر بدلًا منه. ' : '') + (userFacingDetails || 'لم يتمكن محرك القرار من اعتماد بديل تخطيطي أولي.'));
  }
  const pairs = result.pairs;
  const models = pairs.map(modelFor);
  const geometryConstraints = extractExplicitGeometryConstraints({ idea });
  const geometryCheck = verifyGeometryAgainstExplicitConstraints(models, geometryConstraints);
  if (!geometryCheck.pass) throw Error('لم يتمكن المحرك من إثبات استيفاء شرط عدم وجود فناء داخلي؛ لم نعتمد أي مخطط.');
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
    preferenceRanking: result.preferenceRanking ?? null,
    preferenceEvaluations: result.preferenceEvaluations ?? [],
    reviews: pairs.map(p => p.review),
    request,
  };
}
