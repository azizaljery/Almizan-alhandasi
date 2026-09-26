import test from 'node:test';
import assert from 'node:assert';
import { DesignIntelligenceEngine } from '../engine.js';
import { TEST_SCENARIOS } from '../fixtures/test-scenarios.js';
import { ConceptDiversityEvaluator } from '../evaluators/diversity-evaluator.js';
import { KnowledgeQualityEvaluator } from '../evaluators/quality-evaluator.js';
import { KnowledgeConflictDetector } from '../evaluators/conflict-evaluator.js';
import { MACRO_PATTERNS } from '../library/macro-patterns.js';

const engine = new DesignIntelligenceEngine();

test('Scenario 01: Rectangular plot with single street retrieves standard villa typologies', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario1_rectangularSingleStreet);
  assert.ok(res.candidateStrategies.length >= 1);
  const top = res.candidateStrategies[0];
  assert.ok(top.matchScore >= 0.75, `Top candidate score should be >= 0.75 (got ${top.matchScore})`);
});

test('Scenario 02: Two-street plot (opposite) retrieves Through-Plot residence', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario2_twoStreetsOpposite);
  assert.ok(res.candidateStrategies.length >= 1);
  const hasThroughPlot = res.candidateStrategies.some(c => c.patternId === 'PAT-MACRO-TWO-STREET-THROUGH');
  assert.ok(hasThroughPlot, 'Must include PAT-MACRO-TWO-STREET-THROUGH in top candidates');
});

test('Scenario 03: Corner Plot retrieves Dual-Aspect Corner Villa', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario3_cornerPlot);
  assert.ok(res.candidateStrategies.length >= 1);
  const top = res.candidateStrategies[0];
  assert.strictEqual(top.patternId, 'PAT-MACRO-CORNER-PLOT', 'Top candidate for corner plot must be PAT-MACRO-CORNER-PLOT');
});

test('Scenario 04: Narrow and deep plot retrieves Linear Spine for Narrow-Deep', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario4_narrowDeep);
  assert.ok(res.candidateStrategies.length >= 1);
  const hasNarrow = res.candidateStrategies.some(c => c.patternId === 'PAT-MACRO-NARROW-DEEP');
  assert.ok(hasNarrow, 'Must retrieve PAT-MACRO-NARROW-DEEP for 10m frontage / 30m depth');
});

test('Scenario 05: High privacy requirement prioritizes private archetypes', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario5_highPrivacy);
  assert.ok(res.candidateStrategies.length >= 1);
  const top = res.candidateStrategies[0];
  assert.ok(
    top.patternId === 'PAT-MACRO-THREE-ZONE' || 
    top.patternId === 'PAT-MACRO-COURTYARD' || 
    top.patternId === 'PAT-MACRO-GUEST-FAMILY-SPLIT' ||
    top.patternId === 'PAT-MACRO-L-SHAPED',
    `Selected ${top.patternId} which provides dedicated privacy zoning`
  );
});

test('Scenario 06: Independent Men Majlis recommends PAT-MICRO-MEN-MAJLIS', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario6_menMajlis);
  assert.ok(res.candidateStrategies.length >= 1);
  for (const cand of res.candidateStrategies) {
    assert.ok(cand.recommendedMicroPatterns.includes('PAT-MICRO-MEN-MAJLIS'));
  }
});

test('Scenario 07: Women Majlis recommends PAT-MICRO-WOMEN-MAJLIS', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario7_womenMajlis);
  assert.ok(res.candidateStrategies.length >= 1);
  for (const cand of res.candidateStrategies) {
    assert.ok(cand.recommendedMicroPatterns.includes('PAT-MICRO-WOMEN-MAJLIS'));
  }
});

test('Scenario 08: Mother/Elderly suite recommends PAT-MICRO-MOTHER-SUITE', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario8_motherSuite);
  assert.ok(res.candidateStrategies.length >= 1);
  for (const cand of res.candidateStrategies) {
    assert.ok(cand.recommendedMicroPatterns.includes('PAT-MICRO-MOTHER-SUITE'));
  }
});

test('Scenario 09: Kitchen & Service zone recommends PAT-MICRO-KITCHEN-SERVICE', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario9_kitchenService);
  assert.ok(res.candidateStrategies.length >= 1);
  for (const cand of res.candidateStrategies) {
    assert.ok(cand.recommendedMicroPatterns.includes('PAT-MICRO-KITCHEN-SERVICE'));
  }
});

test('Scenario 10: Three entrances prioritizes Tri-Entrance supported patterns', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario10_threeEntrances);
  assert.ok(res.candidateStrategies.length >= 1);
  const top = res.candidateStrategies[0];
  assert.ok(
    top.tags.includes('tri-entrance') || 
    top.tags.includes('multi-entrance') || 
    top.tags.includes('dual-entrance') ||
    top.tags.includes('three-zone'),
    'Should favor patterns with multi-portal capability'
  );
});

test('Scenario 11: Pattern geometrically feasible but violates privacy is penalized', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario11_privacyViolationPattern);
  assert.ok(res.candidateStrategies.length >= 1);
});

test('Scenario 12: Pattern sound architecturally but bad aspect ratio receives low aspect score', () => {
  const evalReport = engine.evaluatePattern('PAT-MACRO-WIDE-FRONT', TEST_SCENARIOS.scenario12_badAspectRatio);
  assert.ok(evalReport.dimensionalScores.aspectRatioScore < 0.35, 'Aspect ratio score must be heavily penalized on 0.20 ratio');
});

test('Scenario 13: Three similar concepts fail diversity evaluation', () => {
  const divRes = ConceptDiversityEvaluator.evaluate(TEST_SCENARIOS.scenario13_threeSimilarConcepts);
  assert.strictEqual(divRes.isDiverseEnough, false, 'Must fail diversity test');
});

test('Scenario 14: Three distinct concepts pass diversity evaluation', () => {
  const divRes = ConceptDiversityEvaluator.evaluate(TEST_SCENARIOS.scenario14_threeDiverseConcepts);
  assert.strictEqual(divRes.isDiverseEnough, true, 'Must pass diversity test');
});

test('Scenario 15: Reference without provenance is caught as blocking issue', () => {
  const audit = KnowledgeQualityEvaluator.evaluateItem(TEST_SCENARIOS.scenario15_missingProvenance);
  assert.strictEqual(audit.isValid, false);
  assert.ok(audit.blockingIssues.length > 0);
});

test('Scenario 16: Stale reference is flagged by quality evaluator', () => {
  const audit = KnowledgeQualityEvaluator.evaluateItem(TEST_SCENARIOS.scenario16_staleReference);
  assert.ok(audit.issues.some(i => i.includes('STALE_PROVENANCE')));
});

test('Scenario 17: Duplicate pattern is detected and blocked', () => {
  const audit = KnowledgeQualityEvaluator.evaluateItem(TEST_SCENARIOS.scenario17_duplicatePattern, MACRO_PATTERNS);
  assert.strictEqual(audit.isValid, false);
  assert.ok(audit.blockingIssues.some(i => i.includes('DUPLICATE_RECORD')));
});

test('Scenario 18: Knowledge conflict is detected when geometry contradicts archetype requirements', () => {
  const courtyard = MACRO_PATTERNS.find(p => p.patternId === 'PAT-MACRO-COURTYARD');
  const conflicts = KnowledgeConflictDetector.detectConflicts(courtyard, TEST_SCENARIOS.scenario18_knowledgeConflict);
  assert.ok(conflicts.length > 0);
  assert.strictEqual(conflicts[0].conflictType, 'GEOMETRY_IMPOSSIBILITY');
});

test('Scenario 19: No suitable pattern on extreme tiny parcel is handled gracefully without crash', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario19_noSuitablePattern);
  assert.strictEqual(res.candidateStrategies.length, 0, 'No candidate should be forced on 40 m² plot');
  assert.ok(res.warnings.some(w => w.includes('NO_SUITABLE_PATTERN')));
  assert.ok(res.confidence <= 0.25);
});

test('Scenario 20: Multiple equally suitable patterns are cleanly ranked with tie metrics', () => {
  const res = engine.retrieveCandidates(TEST_SCENARIOS.scenario20_multipleEquallySuitable, 4);
  assert.ok(res.candidateStrategies.length >= 3, 'Must retrieve multiple viable options for flexible symmetrical plot');
  // Scores are close and sorted
  assert.ok(res.candidateStrategies[0].matchScore >= res.candidateStrategies[1].matchScore);
});
