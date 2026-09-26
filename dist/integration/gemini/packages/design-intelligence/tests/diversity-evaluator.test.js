import test from 'node:test';
import assert from 'node:assert';
import { ConceptDiversityEvaluator } from '../evaluators/diversity-evaluator.js';
import { TEST_SCENARIOS } from '../fixtures/test-scenarios.js';

test('Diversity Engine: Rejects cosmetically similar variants (Scenario 13)', () => {
  const similarVariants = TEST_SCENARIOS.scenario13_threeSimilarConcepts;
  const result = ConceptDiversityEvaluator.evaluate(similarVariants);

  assert.strictEqual(result.isDiverseEnough, false, 'Similar concepts MUST fail diversity validation');
  assert.ok(result.overallDiversityScore < 0.42, 'Score must be below threshold');
  assert.ok(result.redundantPairs.length > 0, 'Must identify redundant pairs');
});

test('Diversity Engine: Approves genuinely diverse architectural concepts (Scenario 14)', () => {
  const diverseConcepts = TEST_SCENARIOS.scenario14_threeDiverseConcepts;
  const result = ConceptDiversityEvaluator.evaluate(diverseConcepts);

  assert.strictEqual(result.isDiverseEnough, true, 'Distinct concepts MUST pass diversity validation');
  assert.ok(result.overallDiversityScore >= 0.42, 'Score must meet or exceed threshold');
  assert.strictEqual(result.redundantPairs.length, 0, 'No redundant pairs should be flagged');
});
