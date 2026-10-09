import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultRooms, generateModel, validateModel, validatePlot, normalizeRooms } from '../dist/planner.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { evaluateRequirementEvidence, renderRequirementEvidenceHTML, REQUIREMENT_STATUS } from '../dist/requirement-evidence.mjs';

const plot = {
  width: 30, length: 40, floors: 1, entry: 's',
  streets: { s: true, n: false, e: false, w: false },
  streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null,
};
const rooms = defaultRooms();
const model = generateModel(plot, rooms, { strategy: 'balanced' });
const find = (result, id) => result.rows.find(row => row.id === id);

test('evidence binds to all integrated RECT/L/U candidates and preserves AZIZ identities', async () => {
  const actualPlot = validatePlot(plot);
  const program = normalizeRooms(rooms);
  const result = await runMultiEngineDesign({
    plot: actualPlot, rooms: structuredClone(program), discovery: { likes: [], rejects: [], avoids: [], life: {} },
  });
  assert.equal(result.decision.status, 'SELECTED_PRELIMINARY');
  assert.ok(result.models.length >= 3);
  assert.ok(result.models.some(item => item.shape === 'rect'));
  assert.ok(result.models.some(item => item.shape === 'u'));
  assert.equal(new Set(result.models.map(item => item.integration.candidateId)).size, result.models.length);
  for (const candidate of result.models) {
    const evidence = evaluateRequirementEvidence({ model: candidate, program });
    assert.equal(find(evidence, 'program').status, REQUIREMENT_STATUS.ENFORCED);
    assert.equal(evidence.modelIdentity, candidate.integration.candidateId);
    assert.ok(evidence.rows.some(row => row.id === 'corridors'));
  }
});

test('evidence uses real geometry, preserves caller model, and checks exact room program', () => {
  assert.deepEqual(validateModel(model), []);
  const before = JSON.stringify(model);
  const result = evaluateRequirementEvidence({ model, program: rooms, plot });
  assert.equal(find(result, 'program').status, REQUIREMENT_STATUS.ENFORCED);
  assert.equal(find(result, 'floors').status, REQUIREMENT_STATUS.ENFORCED);
  assert.equal(result.rows.some(row => row.id === 'built-area'), false, 'null built-area cap must not be treated as zero');
  assert.ok(result.rows.some(row => row.id === 'corridors'));
  assert.equal(JSON.stringify(model), before, 'auditing must never mutate the source geometry');
});

test('a missing room or changed measured area is NOT_MET, not a silent pass', () => {
  const altered = structuredClone(model);
  altered.rooms[0].w = altered.rooms[0].w / 2;
  const result = evaluateRequirementEvidence({ model: altered, program: rooms, plot });
  assert.equal(find(result, 'program').status, REQUIREMENT_STATUS.NOT_MET);
  assert.match(find(result, 'program').evidence, /مساحة/);
  const absent = structuredClone(model);
  absent.rooms.pop();
  assert.equal(find(evaluateRequirementEvidence({ model: absent, program: rooms, plot }), 'program').status, REQUIREMENT_STATUS.NOT_MET);
});

test('missing generation-time program stays UNVERIFIED instead of comparing current editor state', () => {
  const result = evaluateRequirementEvidence({ model });
  const row = find(result, 'program');
  assert.equal(row.status, REQUIREMENT_STATUS.UNVERIFIED);
  assert.match(row.evidence, /لا تتوفر نسخة برنامج الغرف الأصلية/);
  assert.notEqual(find(result, 'floors').status, REQUIREMENT_STATUS.ENFORCED);
});

test('exact room dimensions are checked even when the requested area still matches', () => {
  const expected = normalizeRooms(rooms);
  expected[0].dimensions = { width: 8, length: 4 };
  const mismatch = find(evaluateRequirementEvidence({ model, program: expected, plot }), 'program');
  assert.equal(mismatch.status, REQUIREMENT_STATUS.NOT_MET);
  assert.match(mismatch.evidence, /الأبعاد الصريحة لا تطابق/);
  const matchingModel = structuredClone(model);
  matchingModel.rooms[0].w = 8; matchingModel.rooms[0].h = 4;
  const match = find(evaluateRequirementEvidence({ model: matchingModel, program: expected, plot }), 'program');
  assert.equal(match.status, REQUIREMENT_STATUS.ENFORCED);
});

test('explicit built-area cap is measured against footprint and rejects an exceeded limit', () => {
  const capped = structuredClone(model);
  capped.plot.maxBuiltArea = 1;
  const row = find(evaluateRequirementEvidence({ model: capped, program: rooms, plot: { ...plot, maxBuiltArea: 1 } }), 'built-area');
  assert.equal(row.status, REQUIREMENT_STATUS.NOT_MET);
  assert.match(row.evidence, /سقف المساحة الأصلي/);
});

test('room-to-room distance never claims direct adjacency or treats a missing path as zero', () => {
  const result = evaluateRequirementEvidence({ model, program: rooms, plot });
  const routes = result.rows.filter(row => row.id.startsWith('route:'));
  assert.ok(routes.length > 0);
  assert.ok(routes.every(row => ['MEASURED', 'UNVERIFIED'].includes(row.status)));
  for (const route of routes) {
    if (route.status === 'MEASURED') assert.match(route.evidence, /ليست إثباتًا للتجاور المباشر/);
    else assert.match(route.evidence, /لا يوجد مسار متصل/);
  }
});

test('guest-family privacy and daylight never claim compliance without proof', () => {
  const result = evaluateRequirementEvidence({
    model, program: rooms, plot,
    idea: 'أريد مدخلًا مستقلًا للضيوف وخصوصية عالية',
    discovery: { avoids: ['مرور الضيوف عبر خصوصية العائلة'] },
  });
  const privacy = find(result, 'privacy-routes');
  assert.ok(privacy);
  assert.ok(['NOT_MET', 'UNVERIFIED'].includes(privacy.status));
  assert.equal(find(result, 'daylight').status, REQUIREMENT_STATUS.UNVERIFIED);
});

test('unsupported extra floors and acoustics are disclosed rather than counted as completed', () => {
  const altered = structuredClone(model);
  altered.plot.floors = 2;
  const result = evaluateRequirementEvidence({
    model: altered, program: rooms, plot: { ...plot, floors: 2 },
    discovery: { avoids: ['صدى الصوت في الصالات والمجالس'] },
  });
  assert.equal(find(result, 'floors').status, REQUIREMENT_STATUS.UNSUPPORTED);
  assert.equal(find(result, 'acoustics').status, REQUIREMENT_STATUS.UNSUPPORTED);
});

test('explicit no-courtyard request is checked against geometry, not decorative labels', () => {
  const result = evaluateRequirementEvidence({ model, program: rooms, plot, idea: 'لا فناء' });
  assert.equal(find(result, 'no-court').status, REQUIREMENT_STATUS.MEASURED);
  const altered = structuredClone(model);
  altered.courtyards = [{ x: 5, y: 5, w: 3, h: 3 }];
  assert.equal(find(evaluateRequirementEvidence({ model: altered, program: rooms, plot, idea: 'لا فناء' }), 'no-court').status, REQUIREMENT_STATUS.NOT_MET);
});

test('unhandled free-text requirements stay UNVERIFIED and are never counted as enforced', () => {
  const result = evaluateRequirementEvidence({
    model, program: rooms, plot,
    idea: 'أريد غرفة هادئة بعيدًا عن الشارع',
    briefContext: { constraints: ['غرفة هادئة بلا ضجيج', 'عزل صوتي خاص'] },
  });
  const row = find(result, 'free-text');
  assert.ok(row);
  assert.equal(row.status, REQUIREMENT_STATUS.UNVERIFIED);
  assert.match(row.evidence, /عزل صوتي خاص/);
  assert.ok(result.counts.UNVERIFIED >= 1);
});

test('HTML evidence escapes user-supplied room names and displays the state', () => {
  const altered = structuredClone(model);
  altered.rooms[0].name = '<img src=x onerror=alert(1)>';
  altered.rooms[0].w /= 2;
  const maliciousProgram = structuredClone(rooms);
  maliciousProgram[0].name = '<img src=x onerror=alert(1)>';
  const evidence = evaluateRequirementEvidence({ model: altered, program: maliciousProgram, plot });
  const html = renderRequirementEvidenceHTML(evidence);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('data-evidence-status="NOT_MET"'));
  assert.ok(html.includes('مطابق في الرسم'));
  assert.ok(html.includes('&lt;img'));
});

test('evidence panel is integrated with the existing design flow, not a separate generator', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../dist/app.mjs', import.meta.url), 'utf8');
  assert.ok(html.includes('id="requirementEvidence"'));
  assert.ok(html.includes('id="requirementRows"'));
  assert.ok(html.includes('./requirement-evidence.css'));
  assert.ok(app.includes('renderRequirementEvidence();'));
  assert.ok(app.includes("import { evaluateRequirementEvidence, renderRequirementEvidenceHTML }"));
  assert.ok(app.includes('state.traceContext = { program: structuredClone(rooms), plot: structuredClone(plot)'));
  assert.ok(app.includes('program: Array.isArray(context?.program) ? context.program : undefined'));
  assert.ok(html.includes('id="requirementStale"'));
  assert.ok(app.includes("$('requirementStale').hidden = !state.dirty"));
});
