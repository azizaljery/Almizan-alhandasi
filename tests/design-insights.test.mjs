import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, defaultRooms } from '../dist/planner.mjs';
import { AcousticComfort, designInsights, ErgonomicEfficiency } from '../dist/design-insights.mjs';

const model = generateModel({ width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } }, defaultRooms());

test('design insight scores are bounded and derived without external data', () => {
  const result = designInsights(model);
  assert.ok(result.overall >= 0 && result.overall <= 100);
  assert.equal(result.cards.length, 8);
  assert.ok(result.cards.every(card => card.score >= 0 && card.score <= 100));
  assert.match(result.note, /لا تصلح للاعتماد التنفيذي/);
});

test('adapted algorithms reject invalid acoustic transmission and bound scores', () => {
  assert.equal(AcousticComfort.calculateSRI(.1), 10);
  assert.throws(() => AcousticComfort.calculateSRI(0));
  assert.equal(ErgonomicEfficiency.calculateScore(200, 100, 100, 100), 100);
});
