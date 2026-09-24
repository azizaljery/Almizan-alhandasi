import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, generateModel } from '../dist/planner.mjs';
import { analyzeEngineeringLayer, toGeminiGeometry } from '../dist/engineering-layer.mjs';

const model = generateModel(
  { width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } },
  defaultRooms(),
);

test('adapts the original planner geometry to Gemini metric geometry without mutating the model', () => {
  const before = JSON.stringify(model);
  const geometry = toGeminiGeometry(model);
  assert.equal(geometry.schemaVersion, 'claude-design-schema-v1.2');
  assert.equal(geometry.units, 'METRIC_MM');
  assert.equal(geometry.spaces.length, model.rooms.length + model.corridors.length);
  assert.equal(geometry.enclosureElements.length, model.walls.length);
  assert.equal(JSON.stringify(model), before);
});

test('runs Gemini coordination, design intelligence, and math as a preliminary immutable review', () => {
  const review = analyzeEngineeringLayer(model);
  assert.equal(review.status, 'PRELIMINARY_REVIEW');
  assert.ok(review.coordination.summaryMetrics);
  assert.ok(Array.isArray(review.intelligence.candidateStrategies));
  assert.ok(review.intelligence.candidateStrategies.length > 0);
  assert.ok(review.math.footprintM2 > 0);
  assert.equal(review.coverage.structuralSystem, 'NOT_EVALUATED_NO_STRUCTURAL_ELEMENTS');
  assert.ok(Object.isFrozen(review));
});
