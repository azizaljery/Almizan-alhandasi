import test from 'node:test';
import assert from 'node:assert';
import { MACRO_PATTERNS } from '../library/macro-patterns.js';
import { MICRO_PATTERNS } from '../library/micro-patterns.js';
import { validatePattern } from '../contracts/pattern.contract.js';

test('Pattern Library Schema Integrity: All 14 Macro Patterns adhere to strict schema', () => {
  assert.strictEqual(MACRO_PATTERNS.length, 14, 'Must contain exactly 14 foundational macro patterns');

  for (const pattern of MACRO_PATTERNS) {
    assert.doesNotThrow(() => validatePattern(pattern), `Pattern ${pattern.patternId} must be valid`);
    assert.ok(pattern.patternId.startsWith('PAT-MACRO-'), `Pattern ID must start with PAT-MACRO-`);
    assert.ok(pattern.plotConditions.minPlotArea > 0, `minPlotArea must be positive`);
    assert.ok(pattern.aspectRatioRange[0] <= pattern.aspectRatioRange[1], `aspectRatioRange must be valid interval`);
    assert.ok(pattern.zones.length >= 3, `Must define at least 3 distinct zones`);
    assert.ok(pattern.advantages.length >= 2, `Must define advantages`);
    assert.ok(pattern.tradeoffs.length >= 1, `Must define tradeoffs`);
    assert.ok(pattern.provenance.source, `Must have source`);
    assert.ok(pattern.confidence >= 0.85, `Verified macro pattern must have confidence >= 0.85`);
  }
});

test('Micro-Patterns Schema Integrity: Specialized sub-systems are valid', () => {
  assert.ok(MICRO_PATTERNS.length >= 7, 'Must contain core micro patterns');

  for (const micro of MICRO_PATTERNS) {
    assert.doesNotThrow(() => validatePattern(micro), `Micro pattern ${micro.patternId} must be valid`);
    assert.ok(micro.patternId.startsWith('PAT-MICRO-'));
  }
});
