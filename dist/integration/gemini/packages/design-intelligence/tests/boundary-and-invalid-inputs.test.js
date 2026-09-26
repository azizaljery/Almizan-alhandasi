import test from 'node:test';
import assert from 'node:assert';
import {
  DesignIntelligenceEngine,
  ConceptDiversityEvaluator,
  ConfigurationRegistry,
  DEFAULT_CONFIG
} from '../index.js';

test('Design Intelligence Boundaries: Rejects unknown pattern evaluation', () => {
  const engine = new DesignIntelligenceEngine();
  assert.throws(
    () => engine.evaluatePattern('NON_EXISTENT_PATTERN', { plot: { areaSqM: 500 } }),
    /not found in Design Intelligence repository/
  );
});

test('Design Intelligence Boundaries: Single or empty candidate diversity edge-cases', () => {
  const emptyRes = ConceptDiversityEvaluator.evaluate([]);
  assert.strictEqual(emptyRes.isDiverseEnough, true);
  assert.strictEqual(emptyRes.overallDiversityScore, 1.0);

  const singleRes = ConceptDiversityEvaluator.evaluate([{ patternId: 'P1', name: 'Villa' }]);
  assert.strictEqual(singleRes.isDiverseEnough, true);
  assert.strictEqual(singleRes.overallDiversityScore, 1.0);
});

test('Design Intelligence Boundaries: Configuration registry rejects non-existent keys', () => {
  const config = new ConfigurationRegistry();
  assert.throws(
    () => config.get('NON_EXISTENT_CONFIG_PARAM'),
    /Configuration key "NON_EXISTENT_CONFIG_PARAM" not found/
  );
});

test('Design Intelligence Boundaries: Extreme plot dimensions handling without NaN or fatal crashes', () => {
  const engine = new DesignIntelligenceEngine();

  const narrowRes = engine.retrieveCandidates({
    plot: { areaSqM: 100, frontageM: 1, depthM: 100, streetCondition: 'ONE_STREET' }
  });
  assert.ok(Array.isArray(narrowRes.candidateStrategies));
  assert.ok(narrowRes.confidence <= 0.5);

  const giantRes = engine.retrieveCandidates({
    plot: { areaSqM: 10000, frontageM: 100, depthM: 100, streetCondition: 'TWO_STREETS_CORNER' }
  });
  assert.ok(giantRes.candidateStrategies.length > 0);
  assert.ok(!Number.isNaN(giantRes.candidateStrategies[0].matchScore));
});
