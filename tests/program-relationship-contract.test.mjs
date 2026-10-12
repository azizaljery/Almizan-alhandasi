import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, validatePlot, normalizeRooms } from '../dist/planner.mjs';
import { buildDesignRequest, runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { buildPreferenceRequests } from '../dist/preference-evidence.mjs';
import { buildProgramRelationshipContract } from '../dist/program-relationship-contract.mjs';
import { buildClientContext, deriveRequirements } from '../dist/requirements-engine.mjs';
import { circulationNetwork } from '../dist/circulation.mjs';

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
  assert.ok(contract);
  assert.equal(contract.requiredProgram.find(row => row.id === 'bedrooms-exact').count, 2);
  assert.deepEqual(contract.relationships.map(row => row.id), [
    'open-living-kitchen', 'guest-dining-access', 'guest-bath-dining-access', 'guest-family-privacy', 'external-guest-room-location',
  ]);
  const context = buildClientContext({ plot, rooms, prompt });
  const derived = deriveRequirements({ prompt, context, brief: { summary: prompt, questions: [], assumptions: [], unhandled: [], rooms } });
  assert.ok(derived.spatialRelationshipContract);
  assert.ok(derived.questions.some(question => /صالة مفتوحة/.test(question)));
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

test('legacy valid geometry is rejected when the explicit spatial contract is not satisfied', async () => {
  const before = structuredClone(rooms);
  await assert.rejects(runMultiEngineDesign({ plot, rooms, idea: prompt, selectedShape: 'rect', seed: 1 }), error => {
    assert.equal(error.code, 'PROGRAM_RELATIONSHIP_REQUIREMENTS_UNSATISFIED');
    assert.ok(error.relationshipEvidence.length > 0);
    const selected = error.relationshipEvidence.find(row => row.candidateId === error.relationshipEvidence[0].candidateId) || error.relationshipEvidence[0];
    assert.equal(selected.programEvidence.find(row => row.id === 'bedrooms-exact').status, 'PASS');
    assert.equal(selected.programEvidence.find(row => row.id === 'external-guest-room').status, 'PASS');
    assert.equal(selected.relations.find(row => row.id === 'open-living-kitchen').status, 'FAIL');
    assert.equal(selected.relations.find(row => row.id === 'guest-family-privacy').status, 'FAIL');
    assert.equal(selected.relations.find(row => row.id === 'external-guest-room-location').status, 'FAIL');
    return true;
  });
  assert.deepEqual(rooms, before, 'a rejected interpretation must not mutate the caller program');
});
