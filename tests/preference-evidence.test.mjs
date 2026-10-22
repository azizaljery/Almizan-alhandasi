import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, normalizeRooms, validatePlot, quantities, validateModel } from '../dist/planner.mjs';
import { buildDesignRequest, runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { buildPreferenceRequests, evaluatePlanPreferences, rankPreferenceCandidates, rankAzizSurvivingPreferences } from '../dist/preference-evidence.mjs';
import { analyzeClientRequest, auditClientRequest, extractClientDesires } from '../dist/client-request.mjs';
import { composeDesignConversation } from '../dist/design-dialog.mjs';

const plot = validatePlot({ width: 35, length: 45, floors: 1, entry: 's', streets: { s: true, n: false, e: false, w: false }, streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null });
const noDiscovery = { likes: [], rejects: [], avoids: [], life: {} };

test('request construction forwards discovery and recognized free-form wishes without changing the exact program', async () => {
  const rooms = normalizeRooms([
    { name: 'مجلس رجال', type: 'majlis', area: 20, dimensions: { width: 4, length: 5 }, position: 'front', side: 'any' },
    { name: 'مجلس نساء', type: 'majlis', area: 20, dimensions: { width: 4, length: 5 }, position: 'front', side: 'any' },
    { name: 'سفرة', type: 'dining', area: 16, dimensions: { width: 4, length: 4 }, position: 'middle', side: 'any' },
    { name: 'مطبخ', type: 'kitchen', area: 12, dimensions: { width: 3, length: 4 }, position: 'middle', side: 'any' },
    { name: 'صالة عائلية', type: 'living', area: 30, dimensions: { width: 5, length: 6 }, position: 'middle', side: 'any' },
    { name: 'غرفة نوم', type: 'bedroom', area: 16, dimensions: { width: 4, length: 4 }, position: 'back', side: 'any' },
  ]);
  const idea = "I want dining near both men's and women's majlis with private routes, avoid long corridors, bedrooms should not face kitchen.";
  const discovery = { ...noDiscovery, avoids: ['الممرات الطويلة والمظلمة'], life: { seniors: 'موجودون' } };
  const input = await buildDesignRequest({ plot, rooms, idea, discovery });
  const kinds = input.softPreferences.map(p => p.value.mizanKind);
  for (const kind of ['prefer_dining_access_all_majlis', 'avoid_shared_guest_family_corridors', 'avoid_bedroom_kitchen_sightline', 'avoid_long_corridors', 'unmapped_lifestyle_preference']) assert.ok(kinds.includes(kind), kind);
  assert.ok(input.hardConstraints.some(c => c.kind === 'room_count_exact' && c.value.count === rooms.length));
  for (const room of rooms.filter(r => r.dimensions)) {
    const planned = input.program.find(p => p.name === room.name);
    assert.deepEqual(planned.exactDimensionsM, { widthM: room.dimensions.width, lengthM: room.dimensions.length });
    assert.ok(input.hardConstraints.some(c => c.kind === 'room_dimensions_exact' && c.value.roomId === planned.id));
  }
  const evaluation = evaluatePlanPreferences({ shape: 'rect', rooms: [], corridors: [], openings: [], links: [] }, input.softPreferences);
  assert.equal(evaluation.find(x => x.kind === 'avoid_bedroom_kitchen_sightline').status, 'NOT_EVALUATED');
});

test('both-majlis routes, movement separation, corridors and bedroom sightlines receive separate evidence', async () => {
  const idea = "I want dining near both men's and women's majlis with private routes, avoid long corridors, bedrooms should not face kitchen.";
  const result = await runMultiEngineDesign({ plot, rooms: normalizeRooms(defaultRooms()), idea, discovery: noDiscovery, seed: 9 });
  const selected = result.preferenceEvaluations.find(row => row.candidateId === result.decision.selectedCandidateId);
  assert.ok(selected, 'the decision winner has preference evidence');
  const evidence = new Map(selected.evaluations.map(row => [row.kind, row]));
  const access = evidence.get('prefer_dining_access_all_majlis');
  assert.equal(access.status, 'ESTIMATE');
  assert.equal(access.data.pairs.length, 2);
  assert.ok(access.data.pairs.every(pair => Number.isFinite(pair.metres)));
  assert.match(access.detail, /لا تُفترض مجاورة مباشرة/);
  const separation = evidence.get('avoid_shared_guest_family_corridors');
  assert.equal(separation.status, 'ESTIMATE');
  assert.match(separation.detail, /مقياس تقريبي لتداخل معرّفات مقاطع الممر/);
  assert.match(separation.detail, /لا يثبت.*خصوصية بصرية/);
  const corridors = evidence.get('avoid_long_corridors');
  assert.equal(corridors.status, 'ESTIMATE');
  assert.ok(corridors.data.longestCorridorAxisM > 0);
  assert.ok(Number.isFinite(corridors.data.longestEntryRouteM));
  assert.match(corridors.detail, /أطول مسار دخول عبر شبكة الممرات/);
  assert.match(corridors.detail, /تُعرض محاور الممرات، المساحة، وأطوال مسارات الدخول كأهداف منفصلة/);
  assert.match(corridors.detail, /لا تعني النتيجة أن الممرات قصيرة/);
  assert.match(corridors.detail, /لا توجد عتبة مطلقة/);
  const sightline = evidence.get('avoid_bedroom_kitchen_sightline');
  assert.equal(sightline.status, 'NOT_EVALUATED');
  assert.match(sightline.detail, /لن نحوّل.*عدم المجاورة/);

  const rows = auditClientRequest({ model: result.selectedModel, rooms: result.selectedModel.program, discovery: noDiscovery,
    idea, desired: extractClientDesires(idea) });
  assert.equal(rows.find(row => row.label === sightline.label)?.state, 'unsupported');
  assert.equal(rows.find(row => row.label === separation.label)?.state, 'estimate');
  assert.ok(rows.some(row => row.state === 'estimate' && /أطول محور.*ممر/.test(row.detail)));
});

test('corridor preference exposes tradeoffs and displaces AZIZ only after strict measured Pareto improvement', async () => {
  const rooms = normalizeRooms(defaultRooms());
  const before = await runMultiEngineDesign({ plot, rooms, discovery: noDiscovery, seed: 1 });
  const after = await runMultiEngineDesign({ plot, rooms, discovery: { ...noDiscovery, avoids: ['الممرات الطويلة والمظلمة'] }, seed: 1 });
  assert.equal(before.selectedModel.shape, 'rect');
  const selectedMetrics = after.preferenceRanking.ranked.find(row => row.candidateId === after.preferenceRanking.selectedCandidateId).evaluations[0].data.preferenceMetrics;
  const fallbackMetrics = after.preferenceRanking.ranked.find(row => row.candidateId === after.preferenceRanking.fallbackCandidateId).evaluations[0].data.preferenceMetrics;
  const fallbackByName = new Map(fallbackMetrics.map(metric => [metric.name, metric]));
  assert.ok(selectedMetrics.every(metric => metric.direction === 'maximize'
    ? metric.value >= fallbackByName.get(metric.name).value - 1e-9
    : metric.value <= fallbackByName.get(metric.name).value + 1e-9), 'preference may displace the AZIZ winner only when no corridor or route metric worsens');
  assert.ok(selectedMetrics.some(metric => Math.abs(metric.value - fallbackByName.get(metric.name).value) > 1e-9), 'the selected candidate must strictly improve at least one measured metric');
  assert.equal(after.selectedModel.integration.candidateId, after.preferenceRanking.selectedCandidateId);
  assert.notEqual(after.preferenceRanking.bestPreferenceCandidateId, after.preferenceRanking.fallbackCandidateId,
    'the measured segment-length leader remains visible as an alternative');
  assert.equal(after.preferenceRanking.selectionMethod, 'native_geometry_preference_dominance');
  assert.equal(after.preferenceRanking.selectionOverride, true);
  assert.equal(after.preferenceRanking.fallbackCandidateId, after.aziz.selectedCandidateId);
  assert.equal(after.preferenceRanking.selectedCandidateId, after.decision.selectedCandidateId);
  assert.equal(after.selectedModel.integration.candidateId, after.decision.selectedCandidateId);
  assert.equal(after.selectedModel.integration.reviewId, after.preferenceRanking.selectedReviewId);
  assert.ok(after.decision.reviewIds.includes(after.selectedModel.integration.reviewId));
  assert.equal(after.decision.geometryHash.value, after.selectedModel.integration.geometryHash.value);
  assert.ok(after.models.includes(after.selectedModel), 'the selected model is one of the alternatives consumed by the UI');
  assert.match(after.decision.reasons[0], /strictly Pareto-dominated AZIZ geometry-only fallback.*measured user-requested axes/);
  const winningEvidence = after.preferenceEvaluations.find(row => row.candidateId === after.preferenceRanking.bestPreferenceCandidateId);
  const preferenceAlternative = after.models.find(model => model.integration.candidateId === after.preferenceRanking.bestPreferenceCandidateId);
  assert.ok(preferenceAlternative, 'the route-ranked alternative reaches the UI alternatives');
  assert.notEqual(preferenceAlternative.integration.geometryHash.value, after.selectedModel.integration.geometryHash.value);
  assert.notDeepEqual(preferenceAlternative.corridors, after.selectedModel.corridors,
    'the measured tradeoff comes from different corridor geometry, regardless of generator key');
  const residual = winningEvidence.evaluations.find(row => row.kind === 'avoid_long_corridors');
  const fallbackEvidence = after.preferenceEvaluations.find(row => row.candidateId === after.aziz.selectedCandidateId)
    .evaluations.find(row => row.kind === 'avoid_long_corridors');
  assert.ok(residual.data.longestCorridorAxisM < fallbackEvidence.data.longestCorridorAxisM);
  assert.ok(residual.data.totalModeledCorridorAreaM2 > fallbackEvidence.data.totalModeledCorridorAreaM2);
  assert.ok(residual.data.longestEntryRouteM > fallbackEvidence.data.longestEntryRouteM);
  assert.ok(Array.isArray(residual.data.preferenceMetrics));
  assert.equal(residual.status, 'ESTIMATE', 'best relative corridor segment does not mean the residual route is short');
});

test('a selected shape preference changes the final reviewed geometry when a matching candidate exists', async () => {
  const rooms = normalizeRooms(defaultRooms());
  const before = await runMultiEngineDesign({ plot, rooms, discovery: noDiscovery, seed: 1 });
  const after = await runMultiEngineDesign({ plot, rooms, discovery: { ...noDiscovery, likes: ['classic_living'] }, seed: 1 });
  assert.equal(before.selectedModel.shape, 'rect');
  assert.equal(after.selectedModel.shape, 'pavilions');
  assert.notEqual(after.selectedModel.integration.geometryHash.value, before.selectedModel.integration.geometryHash.value);
  assert.equal(after.preferenceRanking.selectionOverride, true);
  assert.equal(after.selectedModel.integration.candidateId, after.decision.selectedCandidateId);
  assert.equal(after.selectedModel.integration.reviewId, after.preferenceRanking.selectedReviewId);
  assert.ok(after.decision.reviewIds.includes(after.selectedModel.integration.reviewId));
  const audit = auditClientRequest({ model: after.selectedModel, rooms, discovery: { ...noDiscovery, likes: ['classic_living'] } });
  assert.ok(audit.some(row => row.state === 'met' && /تفضيل الشكل/.test(row.label)));
});

test('Arabic dining-near-both-majlis preference selects a reviewed route-shorter plan without resizing rooms', async () => {
  const rooms = normalizeRooms([
    { name: 'مجلس رجال', type: 'majlis', area: 20, dimensions: { width: 4, length: 5 }, position: 'front', side: 'any' },
    { name: 'مجلس نساء', type: 'majlis', area: 20, dimensions: { width: 4, length: 5 }, position: 'front', side: 'any' },
    { name: 'سفرة', type: 'dining', area: 16, dimensions: { width: 4, length: 4 }, position: 'middle', side: 'any' },
    { name: 'مطبخ', type: 'kitchen', area: 12, dimensions: { width: 3, length: 4 }, position: 'middle', side: 'any' },
    { name: 'صالة عائلية', type: 'living', area: 30, dimensions: { width: 5, length: 6 }, position: 'middle', side: 'any' },
    { name: 'غرفة نوم', type: 'bedroom', area: 16, dimensions: { width: 4, length: 4 }, position: 'back', side: 'any' },
  ]);
  const idea = 'لا أريد السفرة بعيدة عن مجلس الرجال ومجلس النساء';
  const after = await runMultiEngineDesign({ plot, rooms, idea, discovery: noDiscovery, seed: 9 });
  const fallback = after.preferenceEvaluations.find(row => row.candidateId === after.aziz.selectedCandidateId);
  const chosen = after.preferenceEvaluations.find(row => row.candidateId === after.decision.selectedCandidateId);
  const access = row => row.evaluations.find(item => item.kind === 'prefer_dining_access_all_majlis');
  const oldPaths = access(fallback).data.pairs.map(pair => pair.metres);
  const newPaths = access(chosen).data.pairs.map(pair => pair.metres);
  assert.deepEqual(oldPaths.map(Number.isFinite), [true, true]);
  assert.deepEqual(newPaths.map(Number.isFinite), [true, true]);
  assert.ok(newPaths.every((value, index) => value <= oldPaths[index] + 1e-9));
  assert.ok(Math.max(...newPaths) < Math.max(...oldPaths));
  assert.equal(after.preferenceRanking.selectionOverride, true);
  assert.equal(after.preferenceRanking.selectionReason, 'preference_dominates_aziz_baseline');
  const fallbackModel = after.models.find(model => model.integration.candidateId === fallback.candidateId);
  assert.notEqual(after.selectedModel.integration.geometryHash.value, fallbackModel.integration.geometryHash.value);
  assert.match(after.selectedModel.integration.alternativeKey, /route-mode/);
  assert.equal(after.selectedModel.integration.candidateId, after.decision.selectedCandidateId);
  assert.equal(after.selectedModel.integration.reviewId, after.preferenceRanking.selectedReviewId);
  assert.ok(after.decision.reviewIds.includes(after.selectedModel.integration.reviewId));
  assert.deepEqual(after.selectedModel.rooms.map(room => [room.name, room.type, room.targetArea]).sort(([a], [b]) => a.localeCompare(b)),
    rooms.map(room => [room.name, room.type, room.targetArea]).sort(([a], [b]) => a.localeCompare(b)));
  for (const requested of rooms.filter(room => room.dimensions)) {
    const actual = after.selectedModel.rooms.find(room => room.name === requested.name);
    assert.ok(Math.abs(actual.w - requested.dimensions.width) < 1e-5 && Math.abs(actual.h - requested.dimensions.length) < 1e-5
      || Math.abs(actual.w - requested.dimensions.length) < 1e-5 && Math.abs(actual.h - requested.dimensions.width) < 1e-5,
    `${requested.name}: exact size changed`);
  }
});

test('preference ranking preserves exact room count, dimensions and quantities in every generated candidate', async () => {
  const rooms = normalizeRooms([
    { name: 'مجلس رجال', type: 'majlis', area: 20, dimensions: { width: 4, length: 5 }, position: 'front', side: 'any' },
    { name: 'مجلس نساء', type: 'majlis', area: 20, dimensions: { width: 4, length: 5 }, position: 'front', side: 'any' },
    { name: 'سفرة', type: 'dining', area: 16, dimensions: { width: 4, length: 4 }, position: 'middle', side: 'any' },
    { name: 'مطبخ', type: 'kitchen', area: 12, dimensions: { width: 3, length: 4 }, position: 'middle', side: 'any' },
    { name: 'صالة عائلية', type: 'living', area: 30, dimensions: { width: 5, length: 6 }, position: 'middle', side: 'any' },
    { name: 'غرفة نوم', type: 'bedroom', area: 16, dimensions: { width: 4, length: 4 }, position: 'back', side: 'any' },
  ]);
  const result = await runMultiEngineDesign({ plot, rooms, discovery: { ...noDiscovery, avoids: ['الممرات الطويلة والمظلمة'] }, seed: 3 });
  assert.equal(result.selectedModel.rooms.length, rooms.length);
  for (const model of result.models) {
    assert.deepEqual(validateModel(model), []);
    assert.equal(model.rooms.length, rooms.length);
    const q = quantities(model);
    assert.ok(Math.abs(q.rooms - rooms.reduce((sum, room) => sum + room.area, 0)) < 1e-7);
    for (const requested of rooms.filter(room => room.dimensions)) {
      const actual = model.rooms.find(room => room.name === requested.name);
      assert.ok(actual);
      assert.ok(Math.abs(actual.w - requested.dimensions.width) < 1e-5 && Math.abs(actual.h - requested.dimensions.length) < 1e-5
        || Math.abs(actual.w - requested.dimensions.length) < 1e-5 && Math.abs(actual.h - requested.dimensions.width) < 1e-5,
      `${requested.name}: asked ${requested.dimensions.width}×${requested.dimensions.length}, got ${actual.w}×${actual.h}`);
    }
  }
});

test('Arabic preference polarity, corrections, neutral statements and clause scope are retained distinctly', () => {
  const kinds = text => buildPreferenceRequests({ idea: text }).map(row => row.value.mizanKind);
  for (const text of ['ما ابي ممر طويل', 'لا أحب الممر الطويل', 'لا أريد الممرات الطويلة'])
    assert.ok(kinds(text).includes('avoid_long_corridors'), text);
  for (const text of ['غرفة النوم لا تواجه المطبخ', 'ما أريد غرفة النوم أن تطل على المطبخ', 'لا ينبغي أن تطل غرف النوم على المطبخ'])
    assert.ok(kinds(text).includes('avoid_bedroom_kitchen_sightline'), text);
  assert.ok(kinds('لا أريد السفرة بعيدة عن مجلس الرجال ومجلس النساء').includes('prefer_dining_access_all_majlis'));
  assert.ok(kinds('أريد السفرة بعيدة عن المجلس').includes('prefer_dining_far_from_majlis'));
  assert.ok(kinds('السفرة والمجلس').includes('unresolved_dining_majlis_relation'));
  assert.ok(kinds('الممرات الطويلة').includes('unresolved_long_corridor_intent'));
  assert.deepEqual(kinds('ما عندي مشكلة بالممرات الطويلة'), []);
  assert.deepEqual(kinds('أريد ممر طويل، لكن تصحيح صريح: لا أريد ممر طويل'), ['avoid_long_corridors']);
  assert.deepEqual(kinds('لا أريد ممر طويل، لكن ما عندي مشكلة بالممرات الطويلة'), []);
  assert.ok(kinds('ما عندي مشكلة بالمطبخ، لكن أكره الممرات الطويلة').includes('avoid_long_corridors'));
  const mixed = kinds('ما ابي ممر طويل، وأبي غرفة النوم تطل على المطبخ');
  assert.ok(mixed.includes('avoid_long_corridors'));
  assert.ok(mixed.includes('prefer_bedroom_kitchen_sightline'));
  assert.ok(!mixed.includes('avoid_bedroom_kitchen_sightline'), 'corridor negation must not leak into the bedroom clause');
  assert.ok(kinds('أريد غرف النوم وتطل على المطبخ').includes('prefer_bedroom_kitchen_sightline'), 'Arabic attached conjunction stays supported');
  assert.ok(kinds('أبي مسارات منفصلة للضيوف والعائلة').includes('avoid_shared_guest_family_corridors'));
  assert.ok(kinds('أريد صالة عائلية مفتوحة على المطبخ').includes('require_open_living_kitchen'));
  assert.ok(!kinds('لا أريد صالة عائلية مفتوحة على المطبخ').includes('require_open_living_kitchen'));
});

test('composed revision headings cannot invent mandatory sightline intent or discard an earlier explicit privacy request', async () => {
  const initial = 'أريد 3 غرف نوم كل غرفة 4×4، وصالة 6×5 ومطبخ 8×6. لا أريد فناء.';
  const latest = 'عدّل المطبخ إلى 7×6 مع الحفاظ على غرف النوم والصالة وبدون فناء';
  const composed = composeDesignConversation(initial, [initial], latest);
  const rows = buildPreferenceRequests({ idea: composed });
  assert.ok(!rows.some(row => row.value.mizanKind === 'avoid_bedroom_kitchen_sightline'),
    'the headings "المتطلبات الأصلية" and "التعديل المطلوب" must not look like facing or mandatory intent');
  assert.ok(!rows.some(row => row.value.mizanKind === 'prefer_bedroom_kitchen_sightline'));

  const rooms = normalizeRooms([
    ...[1, 2, 3].map(index => ({ name: `غرفة نوم ${index}`, type: 'bedroom', area: 16,
      dimensions: { width: 4, length: 4 }, position: 'back', side: 'any' })),
    { name: 'صالة عائلية', type: 'living', area: 30, dimensions: { width: 6, length: 5 }, position: 'middle', side: 'any' },
    { name: 'مطبخ', type: 'kitchen', area: 48, dimensions: { width: 8, length: 6 }, position: 'middle', side: 'any' },
  ]);
  const discovery = { ...noDiscovery };
  const userVisible = await analyzeClientRequest({ prompt: composed, rooms, plot, discovery, mode: 'modify' });
  assert.deepEqual(userVisible.questions, [], 'the actual local approval gate must not ask about an invented unsupported requirement');
  assert.deepEqual(userVisible.rooms.find(room => room.type === 'kitchen').dimensions, { width: 7, length: 6 });
  assert.equal(userVisible.rooms.filter(room => room.type === 'bedroom').length, 3);
  assert.ok(!userVisible.desires.some(item => item.kind === 'avoid_bedroom_kitchen_sightline'));

  for (const request of ['يجب ألا تواجه غرف النوم المطبخ', 'Bedrooms must not face the kitchen']) {
    const explicit = buildPreferenceRequests({ idea: request }).find(row => row.value.mizanKind === 'avoid_bedroom_kitchen_sightline');
    assert.ok(explicit, request);
    assert.equal(explicit.value.mustRequirement, true, request);
  }
  const ordinary = buildPreferenceRequests({ idea: 'غرفة النوم لا تواجه المطبخ' })
    .find(row => row.value.mizanKind === 'avoid_bedroom_kitchen_sightline');
  assert.ok(ordinary, 'an explicit Arabic sightline preference is still recognized');
  assert.equal(ordinary.value.mustRequirement, undefined, 'a preference alone is not made mandatory');

  const priorPrivacy = `${initial.slice(0, -1)}، ويجب ألا تواجه غرف النوم المطبخ.`;
  const privacyConversation = composeDesignConversation(priorPrivacy, [priorPrivacy], latest);
  const retained = await analyzeClientRequest({ prompt: privacyConversation, rooms, plot, discovery, mode: 'modify' });
  assert.ok(retained.desires.some(item => item.kind === 'avoid_bedroom_kitchen_sightline'),
    'an explicitly stated prior-conversation privacy constraint remains visible after an unrelated revision');
  assert.ok(retained.questions.some(question => /شرطًا إلزاميًا/.test(question)),
    'unsupported explicit privacy requirements remain pending for review instead of being silently dropped');
});

test('discovery chip splits bedroom proximity from visual exposure and darkness from corridor length', () => {
  const prefs = buildPreferenceRequests({ discovery: { ...noDiscovery,
    avoids: ['غرف نوم مكشوفة أو قريبة من الضيافة', 'الممرات الطويلة والمظلمة'] } });
  const kinds = prefs.map(row => row.value.mizanKind);
  for (const kind of ['avoid_bedroom_guest_proximity','avoid_exposed_bedrooms','avoid_long_corridors','avoid_dark_corridors']) assert.ok(kinds.includes(kind));
  const model = { shape: 'rect', rooms: [
    { id: 'b', name: 'Bedroom', type: 'bedroom', x: 0, y: 0, w: 4, h: 4 },
    { id: 'g', name: 'Majlis', type: 'majlis', x: 5, y: 0, w: 4, h: 4 },
  ], corridors: [], openings: [], links: [] };
  const measured = evaluatePlanPreferences(model, prefs);
  const gap = measured.find(row => row.kind === 'avoid_bedroom_guest_proximity');
  assert.equal(gap.status, 'ESTIMATE');
  assert.equal(gap.data.minimumBedroomMajlisEdgeGapM, 1);
  assert.equal(measured.find(row => row.kind === 'avoid_exposed_bedrooms').status, 'NOT_EVALUATED');
  assert.equal(measured.find(row => row.kind === 'avoid_dark_corridors').status, 'NOT_EVALUATED');
});

test('AZIZ fallback changes only for strict Pareto improvement, not a single proxy win', () => {
  const metric = (axis, area, route) => ({ id: 'corridor', kind: 'avoid_long_corridors', status: 'ESTIMATE',
    objective: axis, direction: 'minimize', weight: 2, data: { preferenceMetrics: [
      { name: 'axis', value: axis, direction: 'minimize' },
      { name: 'area', value: area, direction: 'minimize' },
      { name: 'route', value: route, direction: 'minimize' },
    ] } });
  const fallback = { candidateId: 'baseline', evaluations: [metric(18, 57, 18)] };
  const tradeoff = { candidateId: 'short-segment', evaluations: [metric(17, 97, 31)] };
  const dominated = { candidateId: 'better', evaluations: [metric(17, 50, 17)] };
  const result = rankPreferenceCandidates([fallback, tradeoff], 'baseline');
  assert.equal(result.bestPreferenceCandidateId, 'short-segment');
  assert.equal(result.selectedCandidateId, 'baseline');
  assert.equal(result.selectionReason, 'baseline_pareto_preserved');
  const improved = rankPreferenceCandidates([fallback, dominated], 'baseline');
  assert.equal(improved.selectedCandidateId, 'better');
  assert.equal(improved.selectionReason, 'preference_dominates_aziz_baseline');
});

test('preference ranking cannot resurrect AZIZ-rejected candidates or select without a surviving baseline', () => {
  const candidate = (candidateId, routeM) => ({ candidateId, weight: 1, evaluations: [{ id: 'route', kind: 'avoid_long_corridors',
    status: 'ESTIMATE', objective: routeM, direction: 'minimize', weight: 1,
    data: { preferenceMetrics: [{ name: 'route', value: routeM, direction: 'minimize' }] } }] });
  const rejectedWinner = candidate('aziz-rejected', 1);
  const noWinner = rankPreferenceCandidates([rejectedWinner], null);
  assert.equal(noWinner.bestPreferenceCandidateId, 'aziz-rejected', 'preference diagnostics may still show a leader');
  assert.equal(noWinner.selectedCandidateId, null, 'a preference leader is never an AZIZ fallback');
  assert.equal(noWinner.selectionReason, 'no_aziz_baseline');

  const allRejected = rankAzizSurvivingPreferences([rejectedWinner], {
    status: 'all-rejected', selectedCandidateId: null, candidatesSurvived: [],
    candidatesRejected: [{ candidateId: 'aziz-rejected', code: 'HARD_REQUIREMENT_MISSING', severity: 'critical' }],
  });
  assert.equal(allRejected.selectedCandidateId, null);
  assert.equal(allRejected.fallbackCandidateId, null);
  assert.deepEqual(allRejected.ranked, []);

  const aziz = { status: 'selected', selectedCandidateId: 'keeper', candidatesSurvived: ['keeper'], candidatesRejected: [
    { candidateId: 'critical-conflict', code: 'UNRESOLVED_ENGINE_CONFLICT', severity: 'critical' },
    { candidateId: 'duplicate-projection', code: 'DUPLICATE_CANDIDATE', severity: 'minor', description: 'Duplicate AZIZ canonical projection' },
  ] };
  const gated = rankAzizSurvivingPreferences([
    candidate('keeper', 20), candidate('critical-conflict', 0.1), candidate('duplicate-projection', 0.2),
  ], aziz);
  assert.deepEqual(gated.ranked.map(row => row.candidateId), ['keeper'],
    'critical rejections and candidates collapsed by AZIZ projection cannot re-enter through native preference metrics');
  assert.equal(gated.selectedCandidateId, 'keeper');
  assert.equal(gated.fallbackCandidateId, 'keeper');

  const mismatchedWinner = rankAzizSurvivingPreferences([candidate('survivor', 20), candidate('reported-reject', 0.1)], {
    status: 'selected', selectedCandidateId: 'reported-reject', candidatesSurvived: ['survivor'],
  });
  assert.deepEqual(mismatchedWinner.ranked.map(row => row.candidateId), ['survivor']);
  assert.equal(mismatchedWinner.fallbackCandidateId, null);
  assert.equal(mismatchedWinner.selectedCandidateId, null,
    'even an AZIZ-reported winner must be listed as a survivor before a preference selection can proceed');
});

test('mandatory unsupported sightline language blocks instead of becoming a soft score', async () => {
  const request = await buildDesignRequest({ plot, rooms: normalizeRooms(defaultRooms()), idea: 'Bedrooms must not face kitchen.', discovery: noDiscovery });
  assert.equal(request.softPreferences.find(row => row.value.mizanKind === 'avoid_bedroom_kitchen_sightline')?.value.mustRequirement, true);
  assert.ok(request.interpretation.unresolved.some(value => value.includes('not enforced')));
});

test('optional separate-entry preferences stay unsupported soft asks while mandatory wording blocks', async () => {
  for (const idea of ['I prefer a separate guest entrance', 'أفضل مدخل منفصل للضيوف', 'أريد مدخلًا خاصًا للضيافة']) {
    const prefs = buildPreferenceRequests({ idea });
    const entry = prefs.find(row => row.value.mizanKind === 'require_separate_guest_entry');
    assert.ok(entry, idea);
    assert.notEqual(entry.value.mustRequirement, true, idea);
    const request = await buildDesignRequest({ plot, rooms: normalizeRooms(defaultRooms()), idea, discovery: noDiscovery });
    assert.deepEqual(request.interpretation.unresolved, [], idea);
    assert.equal(evaluatePlanPreferences({ shape: 'rect', rooms: [], corridors: [], openings: [], links: [] }, [entry])[0].status, 'NOT_EVALUATED');
  }
  const mandatory = buildPreferenceRequests({ idea: 'A separate guest entrance is required.' })
    .find(row => row.value.mizanKind === 'require_separate_guest_entry');
  assert.equal(mandatory?.value.mustRequirement, true);
});
