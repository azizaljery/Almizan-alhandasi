import test from 'node:test';
import assert from 'node:assert';
import { KnowledgeConflictDetector } from '../evaluators/conflict-evaluator.js';
import { MACRO_PATTERNS } from '../library/macro-patterns.js';
import { TEST_SCENARIOS } from '../fixtures/test-scenarios.js';

test('Conflict Detector: Identifies physical geometry impossibility (Scenario 18)', () => {
  const courtyardPattern = MACRO_PATTERNS.find(p => p.patternId === 'PAT-MACRO-COURTYARD');
  const context = TEST_SCENARIOS.scenario18_knowledgeConflict;

  const conflicts = KnowledgeConflictDetector.detectConflicts(courtyardPattern, context);
  assert.ok(conflicts.length > 0, 'Must detect conflict on 8m frontage');
  assert.strictEqual(conflicts[0].conflictType, 'GEOMETRY_IMPOSSIBILITY');
  assert.strictEqual(conflicts[0].precedenceVerdict, 'PATTERN_SURRENDERS');
});
