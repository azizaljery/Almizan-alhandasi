import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ClaudeGeometryAdapter } from '../contracts/claude-geometry-adapter.js';
import { ArchitecturalReviewer } from '../coordinators/architectural-reviewer.js';
import { StructuralCoordinator } from '../coordinators/structural-coordinator.js';
import { ElectricalCoordinator } from '../coordinators/electrical-coordinator.js';
import { PlumbingCoordinator } from '../coordinators/plumbing-coordinator.js';
import { HVACCoordinator } from '../coordinators/hvac-coordinator.js';

test('Discipline Coordinators: Detailed functional checks on conflicted layout', () => {
  const conflictedFixture = JSON.parse(fs.readFileSync(path.resolve('fixtures/conflicted-villa.fixture.json'), 'utf8'));
  const adapted = ClaudeGeometryAdapter.adapt(conflictedFixture);

  const archResult = ArchitecturalReviewer.review(adapted);
  const corrIssue = archResult.issues.find(i => i.issueId.includes('SP-GF-CORR-SUBCODE'));
  assert.ok(corrIssue, 'Architectural reviewer must catch sub-code corridor width.');
  assert.strictEqual(corrIssue.ruleReference.clause, 'Section R311.6', 'Must cite SBC 1101 Section R311.6');

  const structResult = StructuralCoordinator.coordinate(adapted);
  assert.ok(structResult.maxObservedSpanMeters >= 9.0, 'Structural coordinator must detect >9m span.');
  assert.strictEqual(structResult.irregularStackingDetected, true, 'Must detect irregular vertical stacking of COL-FF-FLOATING.');

  const elecResult = ElectricalCoordinator.coordinate(adapted);
  assert.ok(elecResult.estimatedTotalConnectedKVA > 0, 'Estimated connected kVA must be calculated.');
  assert.ok(elecResult.panelClearanceViolations >= 1, 'Must detect at least 1 panel clearance violation.');

  const plumbResult = PlumbingCoordinator.coordinate(adapted);
  assert.ok(plumbResult.criticalZoningViolations >= 1, 'Must detect wet area above electrical room.');
  const plumbElecIssue = plumbResult.issues.find(i => i.ruleReference.ruleId === 'RULE-PLUMB-HEURISTIC-WATER-OVER-ELEC-01');
  assert.ok(plumbElecIssue, 'Must cite RULE-PLUMB-HEURISTIC-WATER-OVER-ELEC-01 as heuristic.');

  for (const iss of plumbResult.issues) {
    assert.ok(!iss.description.includes('Infinity'), `Issue ${iss.issueId} description must not contain Infinity`);
  }

  const hvacResult = HVACCoordinator.coordinate(adapted);
  assert.ok(hvacResult.totalEstimatedTonsRefrigeration > 0, 'Estimated tons refrigeration must be calculated.');
  assert.ok(hvacResult.plenumDeficitSpaces.includes('SP-FF-LIVING-PLENUM-DEFICIT'), 'Must flag plenum deficit space.');
});
