import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, normalizeRooms, validatePlot, validateModel } from '../dist/planner.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import {
  extractExplicitGeometryConstraints,
  filterShapesByExplicitConstraints,
  verifyGeometryAgainstExplicitConstraints,
} from '../dist/design-constraints.mjs';

const rules = idea => extractExplicitGeometryConstraints({ idea });

test('Arabic and English no-courtyard requirements exclude U before generation', () => {
  for (const phrase of ['لا فناء ولا مسبح', 'لا أريد فناءً', 'بدون فناء', 'دون الفناء', 'أبي البيت بلا فناء', 'No courtyard', 'without a courtyard']) {
    const shapes = filterShapesByExplicitConstraints(['rect', 'l', 'u'], rules(phrase));
    assert.deepEqual(shapes.allowed, ['rect', 'l'], phrase);
    assert.equal(shapes.excluded[0].code, 'EXPLICIT_NO_COURTYARD');
  }
});

test('positive courtyard wishes and negated removal are not mistaken for bans', () => {
  for (const phrase of ['أريد فناءً داخليًا', 'بيت على شكل U حول فناء', 'I want a courtyard', 'لا أريد إلغاء الفناء']) {
    assert.equal(rules(phrase).noCourtyard, false, phrase);
  }
});

test('latest explicit change of mind overrides an earlier courtyard ban', () => {
  const prompt = 'المتطلبات الأصلية المعتمدة:\nلا أريد فناء\n\nالتعديل المطلوب الآن:\nأريد فناء داخلي';
  assert.equal(rules(prompt).noCourtyard, false);
  const reverse = 'المتطلبات الأصلية المعتمدة:\nأريد فناء\n\nالتعديل المطلوب الآن:\nلا فناء';
  assert.equal(rules(reverse).noCourtyard, true);
});

test('actual courtyard geometry is checked after generation', () => {
  const constraints = rules('لا فناء');
  assert.equal(verifyGeometryAgainstExplicitConstraints([{ shape: 'rect', courtyards: [] }], constraints).pass, true);
  assert.equal(verifyGeometryAgainstExplicitConstraints([{ shape: 'rect', courtyards: [{}] }], constraints).pass, false);
  assert.equal(verifyGeometryAgainstExplicitConstraints([{ shape: 'rect' }], constraints).pass, false);
});

test('shape filter does not mutate caller and rejects impossible requested set', () => {
  const shapes = ['u', 'rect', 'l', 'u'];
  const before = JSON.stringify(shapes);
  const filtered = filterShapesByExplicitConstraints(shapes, rules('بدون فناء'));
  assert.deepEqual(filtered.allowed, ['rect', 'l']);
  assert.equal(JSON.stringify(shapes), before);
  assert.throws(() => filterShapesByExplicitConstraints(['u'], rules('لا فناء')), /NO_SHAPES_SATISFY/);
});

test('integrated Claude/Gemini/AZIZ design never selects U after explicit no-courtyard request', async () => {
  const plot = validatePlot({
    width: 35, length: 45, floors: 1, entry: 's',
    streets: { s: true, n: false, e: false, w: false },
    streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null,
  });
  const rooms = normalizeRooms(defaultRooms());
  const result = await runMultiEngineDesign({ plot, rooms, idea: 'أريد مجلسين وخصوصية عالية، لا فناء', discovery: { likes: [], rejects: [], avoids: [], life: {} } });
  assert.deepEqual(result.models.map(model => model.shape), ['rect', 'l']);
  assert.equal(result.explicitConstraints.noCourtyard, true);
  assert.ok(result.failures.some(f => f.code === 'EXPLICIT_NO_COURTYARD'));
  for (const model of result.models) {
    assert.deepEqual(validateModel(model), []);
    assert.equal(model.courtyards.length, 0);
  }
});
