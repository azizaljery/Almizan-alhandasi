import test from 'node:test';
import assert from 'node:assert';
import { EngineeringRulesRegistry } from '../rules-registry/rules-registry.js';
import { RuleClassification } from '../contracts/rules.contract.js';

test('Rules Provenance & Citation Integrity: All statutory rules carry auditable 2024 metadata and no false citations exist', () => {
  const allRules = EngineeringRulesRegistry.getAllRules();
  assert.ok(allRules.length >= 8, 'Expected at least 8 fundamental engineering rules in registry.');

  for (const rule of allRules) {
    assert.ok(rule.ruleId, 'Rule must have ruleId');
    assert.ok(rule.discipline, 'Rule must have discipline');
    assert.ok(rule.title, 'Rule must have title');
    assert.ok(rule.source, 'Rule must have source object');
    assert.ok(typeof rule.confidence === 'number', 'Rule must have numeric confidence');

    if (rule.classification === RuleClassification.STATUTORY_SBC) {
      assert.strictEqual(rule.isStatutoryCode, true, `SBC Rule ${rule.ruleId} must have isStatutoryCode=true`);
      assert.strictEqual(rule.confidence, 1.0, `SBC Rule ${rule.ruleId} must have confidence 1.0`);
      assert.ok(rule.source.authority.startsWith('SBC'), `SBC Rule ${rule.ruleId} must cite SBC authority`);
      assert.strictEqual(rule.source.edition, '2024', `SBC Rule ${rule.ruleId} must be edition 2024`);
      assert.ok(rule.source.documentId, `SBC Rule ${rule.ruleId} must specify documentId`);
      assert.ok(rule.source.section, `SBC Rule ${rule.ruleId} must specify section`);
      assert.ok(rule.source.subsection, `SBC Rule ${rule.ruleId} must specify subsection`);
      assert.ok(rule.source.effectiveFrom, `SBC Rule ${rule.ruleId} must specify effectiveFrom`);
      assert.ok(rule.source.verifiedAt, `SBC Rule ${rule.ruleId} must specify verifiedAt`);

      assert.notStrictEqual(
        rule.source.subsection, 
        'Section 307.1', 
        'SBC 701 Section 307.1 is Structural Safety and must not be used as a statutory citation for water over electrical!'
      );
    }

    if (rule.classification === RuleClassification.PRELIMINARY_HEURISTIC) {
      assert.strictEqual(rule.isStatutoryCode, false, `Heuristic Rule ${rule.ruleId} must have isStatutoryCode=false`);
      assert.ok(rule.confidence < 1.0, `Heuristic Rule ${rule.ruleId} confidence must be < 1.0`);
      assert.ok(!rule.source.authority.startsWith('SBC'), `Heuristic Rule ${rule.ruleId} MUST NOT claim SBC authority`);
    }
  }
});
