import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, validatePlot, normalizeRooms, validateModel, generateModel } from '../dist/planner.mjs';
import { buildDesignRequest, runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { buildPreferenceRequests } from '../dist/preference-evidence.mjs';
import { buildProgramRelationshipContract, validateProgramRelationshipContract } from '../dist/program-relationship-contract.mjs';
import { buildClientContext, deriveRequirements } from '../dist/requirements-engine.mjs';
import { circulationNetwork } from '../dist/circulation.mjs';
import { eligiblePartitions, previewGeometryCommand } from '../dist/geometry-editor.mjs';
import { buildPlanSVG } from '../dist/plan-view.mjs';
import { quantities } from '../dist/claude/planner.mjs';
import { evaluatePlanPreferences } from '../dist/preference-evidence.mjs';

const prompt = 'غرفتين نوم بالضبط، صالة عائلية مفتوحة على المطبخ، مجلس رجال متصل بمنطقة الطعام، حمام ضيوف مرتبط بالطعام، خصوصية بين الضيوف والعائلة، وغرفة ضيوف خارجية.';
const plot = validatePlot({ width: 35, length: 45, floors: 1, entry: 's', streets: { s: true }, streetSetback: 3, neighborSetback: 1.5, coverage: .75 });
const rooms = normalizeRooms([
  { name: 'مجلس رجال', type: 'majlis', area: 32, position: 'front', side: 'any' },
  { name: 'منطقة الطعام', type: 'dining', area: 20, position: 'front', side: 'any' },
  { name: 'حمام ضيوف', type: 'bath', area: 6, position: 'middle', side: 'any' },
  { name: 'صالة عائلية', type: 'living', area: 28, position: 'middle', side: 'any' },
  { name: 'مطبخ', type: 'kitchen', area: 18, position: 'middle', side: 'any' },
  { name: 'غرفة نوم 1', type: 'bedroom', area: 20, position: 'back', side: 'any' },
  { name: 'غرفة نوم 2', type: 'bedroom', area: 20, position: 'back', side: 'any' },
  { name: 'غرفة ضيوف خارجية', type: 'service', area: 12, position: 'front', side: 'any' },
]);

test('explicit sample request becomes a reviewable relationship contract in the understanding step', () => {
  const contract = buildProgramRelationshipContract({ prompt, program: rooms });
  assert.equal(buildProgramRelationshipContract({ prompt: 'لا أريد صالة عائلية مفتوحة على المطبخ', program: rooms }), null,
    'a negated open-plan phrase is not upgraded to a mandatory requirement');
  assert.ok(contract);
  assert.equal(contract.requiredProgram.find(row => row.id === 'bedrooms-exact').count, 2);
  assert.deepEqual(contract.relationships.map(row => row.id), [
    'open-living-kitchen', 'guest-dining-access', 'guest-bath-dining-access', 'guest-family-privacy', 'external-guest-room-location',
  ]);
  const context = buildClientContext({ plot, rooms, prompt });
  const derived = deriveRequirements({ prompt, context, brief: { summary: prompt, questions: [], assumptions: [], unhandled: [], rooms } });
  assert.ok(derived.spatialRelationshipContract);
  assert.ok(!derived.questions.some(question => /صالة مفتوحة/.test(question)), 'the supported open-plan relationship no longer needs clarification');
  assert.ok(derived.spatialRelationshipContract.unsupported.some(row => row.id === 'external-guest-room-location'));
});

test('bathroom to dining preference is parsed into an actual route-search preference without changing rooms', async () => {
  const request = await buildDesignRequest({ plot, rooms, idea: prompt });
  assert.deepEqual(request.program.map(row => row.type), rooms.map(row => row.type));
  assert.ok(request.softPreferences.some(row => row.value.mizanKind === 'prefer_guest_bath_dining_route'));
});

test('guest-bath to dining preference improves the best measured route in the bounded search', async () => {
  const program = normalizeRooms(defaultRooms()), before = structuredClone(program);
  const baseline = await runMultiEngineDesign({ plot, rooms: program, selectedShape: 'rect', seed: 1 });
  const preferred = await runMultiEngineDesign({ plot, rooms: program, idea: 'حمام الضيوف قريب من منطقة الطعام', selectedShape: 'rect', seed: 1 });
  const bestRoute = models => Math.min(...models.map(model => {
    const bath = model.rooms.find(room => room.type === 'bath'), dining = model.rooms.find(room => room.type === 'dining');
    return circulationNetwork(model).betweenRooms(bath.id, dining.id)?.metres ?? Infinity;
  }));
  assert.ok(preferred.searchEvidence.attempted > baseline.searchEvidence.attempted);
  assert.ok(bestRoute(preferred.models) < bestRoute(baseline.models),
    `preferred best route ${bestRoute(preferred.models)}m must improve baseline ${bestRoute(baseline.models)}m`);
  assert.deepEqual(program, before);
});

test('open-plan is met while unsupported privacy and external guest requirements still reject the full brief', async () => {
  const before = structuredClone(rooms);
  await assert.rejects(runMultiEngineDesign({ plot, rooms, idea: prompt, selectedShape: 'rect', seed: 1 }), error => {
    assert.equal(error.code, 'PROGRAM_RELATIONSHIP_REQUIREMENTS_UNSATISFIED');
    assert.ok(error.relationshipEvidence.length > 0);
    const selected = error.relationshipEvidence.find(row => row.candidateId === error.relationshipEvidence[0].candidateId) || error.relationshipEvidence[0];
    assert.equal(selected.programEvidence.find(row => row.id === 'bedrooms-exact').status, 'PASS');
    assert.equal(selected.programEvidence.find(row => row.id === 'external-guest-room').status, 'PASS');
    assert.equal(selected.relations.find(row => row.id === 'open-living-kitchen').status, 'PASS');
    assert.equal(selected.relations.find(row => row.id === 'guest-family-privacy').status, 'FAIL');
    assert.equal(selected.relations.find(row => row.id === 'external-guest-room-location').status, 'FAIL');
    return true;
  });
  assert.deepEqual(rooms, before, 'a rejected interpretation must not mutate the caller program');
});

test('open living-kitchen request creates a measured no-leaf portal and survives an unrelated edit', async () => {
  const requestText = 'صالة عائلية مفتوحة على المطبخ';
  const requestPlot = validatePlot({ width: 35, length: 45, floors: 1, entry: 's', streets: { s: true }, streetSetback: 3, neighborSetback: 1.5, coverage: .75 });
  const result = await runMultiEngineDesign({ plot: requestPlot, rooms: defaultRooms(), idea: requestText, selectedShape: 'rect', seed: 1 });
  const model = result.selectedModel, opening = model.openings.find(item => item.openPlan === true);
  assert.ok(opening, 'selected model must carry an explicit open-plan portal');
  assert.deepEqual(validateModel(model), []);
  assert.equal(model.rooms.length, defaultRooms().length);
  const contract = buildProgramRelationshipContract({ prompt: requestText, program: result.request.program });
  const unmodified = generateModel({ width: 35, length: 45, floors: 1, entry: 's', streets: { s: true }, streetSetback: 3, neighborSetback: 1.5, coverage: .75 }, defaultRooms());
  const beforeEvidence = validateProgramRelationshipContract(contract, unmodified, result.request.program);
  assert.equal(beforeEvidence.relations.find(item => item.id === 'open-living-kitchen').status, 'FAIL', 'the prior closed-partition geometry must fail acceptance');
  const evidence = validateProgramRelationshipContract(contract, model, result.request.program);
  assert.equal(evidence.eligible, true);
  const relationship = evidence.relations.find(item => item.id === 'open-living-kitchen');
  assert.equal(relationship.status, 'PASS');
  assert.ok(relationship.evidence.clearRatio >= .8);
  assert.equal(evaluatePlanPreferences(model, result.request.softPreferences)[0].status, 'MEASURED');
  const plan = buildPlanSVG(model, { mode: 'cad' });
  assert.match(plan, new RegExp(`data-opening-id="${opening.id}"`));
  assert.doesNotMatch(plan, new RegExp(`data-opening-id="${opening.id}"[^]*?data-cad-only="true"[^]*?cad-door`));
  assert.equal(quantities(model).doors, model.openings.filter(item => item.type === 'door' && !item.openPlan).length);
  const otherWall = eligiblePartitions(model).find(item => item.eligible && item.wallId !== opening.wallId);
  assert.ok(otherWall, 'fixture needs an unrelated movable partition');
  const edited = previewGeometryCommand(model, { id: 'open-plan-preserving-edit', type: 'move-partition', baseRevision: 0, wallId: otherWall.wallId, deltaM: .05 }).model;
  assert.deepEqual(validateModel(edited), []);
  assert.equal(edited.rooms.length, model.rooms.length);
  assert.deepEqual(edited.rooms.map(room => room.id).sort(), model.rooms.map(room => room.id).sort());
  assert.deepEqual(edited.openings.find(item => item.openPlan), opening);
  assert.equal(validateProgramRelationshipContract(contract, edited, result.request.program).relations.find(item => item.id === 'open-living-kitchen').status, 'PASS');
});
