import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CoordinationOrchestrator } from '../core/coordination-orchestrator.js';
import { ClashTypes } from '../contracts/coordination-package.contract.js';

test('Clash Detection Engine: Identifies Hard, Soft Clearance, and Zone Incompatibilities without false positives', () => {
  const conflictedFixture = JSON.parse(fs.readFileSync(path.resolve('fixtures/conflicted-villa.fixture.json'), 'utf8'));
  const compliantFixture = JSON.parse(fs.readFileSync(path.resolve('fixtures/compliant-villa.fixture.json'), 'utf8'));

  const compliantPkg = CoordinationOrchestrator.coordinate(compliantFixture);
  assert.strictEqual(compliantPkg.crossDisciplineClashes.length, 0, 'Compliant villa must produce 0 clashes.');

  const conflictedPkg = CoordinationOrchestrator.coordinate(conflictedFixture);
  const clashes = conflictedPkg.crossDisciplineClashes;

  assert.ok(clashes.length >= 3, `Expected at least 3 clashes, found ${clashes.length}`);

  const hardClash = clashes.find(c => c.clashType === ClashTypes.HARD_STRUCTURAL_PENETRATION);
  assert.ok(hardClash, 'Must detect Hard Structural Penetration Clash.');
  assert.ok(hardClash.involvedElementIds.includes('COL-GF-A'), 'Hard clash must involve column COL-GF-A');
  assert.ok(hardClash.involvedElementIds.includes('ZONE-HVAC-TRUNK-01'), 'Hard clash must involve ZONE-HVAC-TRUNK-01');

  const softClash = clashes.find(c => c.clashType === ClashTypes.SOFT_MAINTENANCE_CLEARANCE);
  assert.ok(softClash, 'Must detect Soft Maintenance Clearance Clash for electrical panel.');
  assert.ok(softClash.involvedElementIds.includes('DB-GF-CONFLICTED'), 'Soft clash must involve DB-GF-CONFLICTED');

  const zoneClash = clashes.find(c => c.clashType === ClashTypes.ZONE_RESTRICTION_INCOMPATIBILITY);
  assert.ok(zoneClash, 'Must detect Zone Restriction Incompatibility Clash (Water over Electrical).');
  assert.ok(zoneClash.involvedElementIds.includes('SP-FF-BATH-OVER-ELEC'), 'Zone clash must involve SP-FF-BATH-OVER-ELEC');
  assert.ok(zoneClash.involvedElementIds.includes('SP-GF-ELEC-ROOM'), 'Zone clash must involve SP-GF-ELEC-ROOM');
});
