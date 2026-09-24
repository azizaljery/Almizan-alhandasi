import test from 'node:test';
import assert from 'node:assert';
import { EngineeringRulesRegistry } from '../rules-registry/rules-registry.js';
import { 
  RuleClassification, 
  DEFAULT_PROJECT_SBC_EDITION, 
  validateRuleIntegrity 
} from '../contracts/rules.contract.js';

test('SBC 2024 Current Edition Baseline: All statutory rules must use 2024 edition unless override reason is recorded', () => {
  const statutoryRules = EngineeringRulesRegistry.getStatutoryRules();
  assert.ok(statutoryRules.length > 0, 'Must have statutory rules registered.');

  for (const rule of statutoryRules) {
    if (rule.source.edition !== DEFAULT_PROJECT_SBC_EDITION) {
      assert.ok(
        rule.source.editionOverrideReason && rule.source.editionOverrideReason.trim().length > 0,
        `Statutory rule ${rule.ruleId} uses non-default edition "${rule.source.edition}" without a documented editionOverrideReason.`
      );
    } else {
      assert.strictEqual(
        rule.source.edition,
        '2024',
        `Rule ${rule.ruleId} must explicitly target SBC 2024 edition.`
      );
    }
  }

  assert.throws(() => {
    validateRuleIntegrity({
      ruleId: 'RULE-TEST-FAIL-OLD-EDITION',
      discipline: 'ARCHITECTURAL',
      title: 'Outdated Rule Test',
      statement: 'Test statement',
      classification: RuleClassification.STATUTORY_SBC,
      source: {
        authority: 'SBC_1101_2018',
        documentId: 'SBC-1101-2018',
        edition: '2018',
        section: 'Chapter 3',
        subsection: 'Section R311.6',
        title: 'Hallways',
        reference: 'SBC 1101:2018 Section R311.6',
        effectiveFrom: '2018-01-01',
        verifiedAt: '2026-09-23',
        editionOverrideReason: null
      },
      confidence: 1.0,
      severityOnViolation: 'CRITICAL',
      isStatutoryCode: true
    }, DEFAULT_PROJECT_SBC_EDITION);
  }, /without a documented source.editionOverrideReason/);
});
