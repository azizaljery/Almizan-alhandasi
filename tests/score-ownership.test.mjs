import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, normalizeRooms, validatePlot } from '../dist/planner.mjs';
import { calculateMizanScore } from '../dist/mizan-score.mjs';
import { compareHomeModels } from '../dist/home-design-engine.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';

const rooms = normalizeRooms(defaultRooms());
const discovery = { likes: [], rejects: [], avoids: [], life: {} };
const plot = validatePlot({
  width: 35, length: 45, floors: 1, entry: 's',
  streets: { s: true, n: false, e: false, w: false },
  streetSetback: 3, neighborSetback: 1.5, coverage: .75, maxBuiltArea: null,
});

test('score ownership boundaries keep Mizan measurement, Home Design advisory comparison and AZIZ selection distinct', async () => {
  const out = await runMultiEngineDesign({ plot, rooms: structuredClone(rooms), discovery });
  const selectedCandidateId = out.aziz.selectedCandidateId;

  assert.ok(selectedCandidateId);
  assert.equal(out.selectedModel.integration.candidateId, selectedCandidateId);

  const mizan = calculateMizanScore(out.selectedModel);
  assert.ok(mizan);
  assert.equal(Object.hasOwn(mizan, 'selectedCandidateId'), false);
  assert.equal(Object.hasOwn(mizan, 'winner'), false);
  assert.equal(Object.hasOwn(mizan, 'bestId'), false);

  const advisory = compareHomeModels({
    plot,
    rooms: structuredClone(rooms),
    discovery,
    models: out.models,
  });
  assert.ok(advisory.bestId);
  assert.match(advisory.bestId, /^plan-/);
  assert.notEqual(advisory.bestId, selectedCandidateId);

  // Advisory comparison must not rewrite canonical AZIZ identity.
  assert.equal(out.aziz.selectedCandidateId, selectedCandidateId);
  assert.equal(out.selectedModel.integration.candidateId, selectedCandidateId);

  // AZIZ may expose internal selection utilities, but they remain AZIZ-local.
  assert.ok(Array.isArray(out.aziz.scores));
  assert.ok(out.aziz.scores.some(score => score.candidateId === selectedCandidateId));
});
