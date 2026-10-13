import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, defaultRooms } from '../dist/planner.mjs';
import { calculateMizanScore, MIZAN_SCORE_FORMULA_VERSION } from '../dist/mizan-score.mjs';

const model = generateModel({ width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } }, defaultRooms());

test('calculateMizanScore(null) returns null instead of a fabricated score for a missing model', () => {
  assert.equal(calculateMizanScore(null), null);
  assert.equal(calculateMizanScore(undefined), null);
});

test('calculateMizanScore never reports a calibrated confidence — this is the exact regression this audit checked for', () => {
  const result = calculateMizanScore(model);
  // Mizan Score's confidence has no calibration data behind it at all; showing any
  // fixed number here (e.g. 0.72) would be exactly the "uncalibrated precision"
  // the client flagged. It must stay null and be labelled as such, not rounded up.
  assert.equal(result.confidence, null);
});

test('calculateMizanScore discloses its own formula, formula version and what the score actually affects', () => {
  const result = calculateMizanScore(model);
  assert.equal(result.formulaVersion, MIZAN_SCORE_FORMULA_VERSION);
  assert.match(result.formulaVersion, /^mizan-score\/\d+\.\d+\.\d+\+plan-evidence\/\d+\.\d+\.\d+$/);
  assert.equal(typeof result.formula, 'string');
  assert.ok(result.formula.length > 0);
  assert.equal(typeof result.effect, 'string');
  assert.ok(result.effect.length > 0);
  // The score must not silently drive which alternative is picked; that is a
  // distinct, separately-disclosed mechanism (presentationPenalty).
  assert.match(result.effect, /لا يُستخدم لاختيار أو استبعاد/);
});

test('calculateMizanScore produces exactly the twelve weighted axes, each carrying real plan-evidence status', () => {
  const result = calculateMizanScore(model);
  assert.equal(result.axes.length, 12);
  assert.equal(result.coverage.totalAxes, 12);
  const statuses = new Set(['ESTIMATE', 'NOT_EVALUATED', 'PASS', 'FAIL']);
  for (const axis of result.axes) {
    assert.ok(axis.key && axis.label && Number.isFinite(axis.weight));
    assert.ok(statuses.has(axis.status), `unexpected axis status: ${axis.status}`);
    assert.equal(axis.score === null || Number.isFinite(axis.score), true);
  }
  assert.match(result.grade, /من 12 محاور/);
  // Score is a weighted average over only the evaluated axes, rescaled to /1000 — never a bare sum.
  if (result.score !== null) assert.ok(result.score >= 0 && result.score <= 1000);
});

test('calculateMizanScore reduces its evaluated-axis coverage, rather than inventing scores, when evidence is missing', () => {
  const broken = structuredClone(model);
  broken.openings = broken.openings.filter(o => o.type !== 'door');
  const result = calculateMizanScore(broken);
  const byKey = Object.fromEntries(result.axes.map(a => [a.key, a]));
  assert.equal(byKey.privacy.status, 'NOT_EVALUATED');
  assert.equal(byKey.privacy.score, null);
  assert.equal(byKey.movement.status, 'NOT_EVALUATED');
  assert.equal(byKey.movement.score, null);
  assert.ok(result.coverage.evaluatedAxes < 12);
  assert.equal(result.confidence, null);
});
