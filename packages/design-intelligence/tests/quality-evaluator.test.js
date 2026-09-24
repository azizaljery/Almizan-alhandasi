import test from 'node:test';
import assert from 'node:assert';
import { KnowledgeQualityEvaluator } from '../evaluators/quality-evaluator.js';
import { TEST_SCENARIOS } from '../fixtures/test-scenarios.js';
import { MACRO_PATTERNS } from '../library/macro-patterns.js';

test('Quality Evaluator: Flags missing provenance (Scenario 15)', () => {
  const badItem = TEST_SCENARIOS.scenario15_missingProvenance;
  const audit = KnowledgeQualityEvaluator.evaluateItem(badItem);

  assert.strictEqual(audit.isValid, false, 'Missing provenance must be invalid');
  assert.ok(audit.blockingIssues.some(i => i.includes('PROVENANCE_MISSING')), 'Must flag PROVENANCE_MISSING');
});

test('Quality Evaluator: Flags stale references (Scenario 16)', () => {
  const staleItem = TEST_SCENARIOS.scenario16_staleReference;
  const audit = KnowledgeQualityEvaluator.evaluateItem(staleItem);

  assert.ok(audit.issues.some(i => i.includes('STALE_PROVENANCE')), 'Must flag STALE_PROVENANCE for audit >8 years');
});

test('Quality Evaluator: Blocks duplicate pattern registration (Scenario 17)', () => {
  const duplicateItem = TEST_SCENARIOS.scenario17_duplicatePattern;
  const audit = KnowledgeQualityEvaluator.evaluateItem(duplicateItem, MACRO_PATTERNS);

  assert.strictEqual(audit.isValid, false, 'Duplicate pattern must be invalid');
  assert.ok(audit.blockingIssues.some(i => i.includes('DUPLICATE_RECORD')), 'Must flag DUPLICATE_RECORD');
});

test('Quality Evaluator: Production Macro Library passes audit with high score', () => {
  const libraryAudit = KnowledgeQualityEvaluator.evaluateLibrary(MACRO_PATTERNS);

  assert.strictEqual(libraryAudit.invalidItems, 0, 'Zero invalid items allowed in production macro library');
  assert.ok(libraryAudit.averageQualityScore >= 90, 'Average quality score must be >= 90');
});
