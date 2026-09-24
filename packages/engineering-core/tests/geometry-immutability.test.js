import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CoordinationOrchestrator } from '../core/coordination-orchestrator.js';
import { ClaudeGeometryAdapter } from '../contracts/claude-geometry-adapter.js';
import { computeGeometryHash } from '../core/geometry-hasher.js';

test('Geometry Immutability: Guarantees input geometry is never mutated during coordination', () => {
  const fixturePath = path.resolve('fixtures/compliant-villa.fixture.json');
  const rawData = fs.readFileSync(fixturePath, 'utf8');
  const originalGeometry = JSON.parse(rawData);

  const hashBefore = computeGeometryHash(originalGeometry);
  const snapshotBefore = JSON.stringify(originalGeometry);

  const pkg = CoordinationOrchestrator.coordinate(originalGeometry);

  const hashAfter = computeGeometryHash(originalGeometry);
  const snapshotAfter = JSON.stringify(originalGeometry);

  assert.strictEqual(hashBefore, hashAfter, 'Geometry hash MUST remain identical before and after coordination.');
  assert.strictEqual(snapshotBefore, snapshotAfter, 'Geometry snapshot serialization MUST remain 100% identical.');
  assert.strictEqual(pkg.sourceGeometryHash, hashBefore, 'Package sourceGeometryHash must match canonical input hash.');

  const adapted = ClaudeGeometryAdapter.adapt(originalGeometry);
  assert.ok(Object.isFrozen(adapted.geometry), 'Root geometry must be frozen');
  assert.ok(Object.isFrozen(adapted.geometry.spaces[0]), 'Nested space objects must be frozen');

  assert.throws(() => {
    adapted.geometry.spaces[0].name = 'MUTATED_NAME';
  }, TypeError, 'Direct mutation on adapted geometry must throw TypeError');
});
