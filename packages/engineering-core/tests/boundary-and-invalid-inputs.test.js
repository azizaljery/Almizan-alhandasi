import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CoordinationOrchestrator } from '../core/coordination-orchestrator.js';
import { ClaudeGeometryAdapter } from '../contracts/claude-geometry-adapter.js';

const COMPLIANT_VILLA = JSON.parse(fs.readFileSync(path.resolve('fixtures/compliant-villa.fixture.json'), 'utf8'));

test('Engineering Core Boundaries: Rejects null, undefined, or missing geometry fields', () => {
  assert.throws(() => CoordinationOrchestrator.coordinate(null), /Invalid input: Geometry payload must be a non-null object/);
  assert.throws(() => CoordinationOrchestrator.coordinate(undefined), /Invalid input: Geometry payload must be a non-null object/);
  assert.throws(() => CoordinationOrchestrator.coordinate({}), /Missing mandatory field: projectId/);
  assert.throws(() => CoordinationOrchestrator.coordinate({ projectId: 'P1' }), /Geometry must define at least one level/);
  assert.throws(() => ClaudeGeometryAdapter.adapt({ projectId: 'P1', levels: [{ levelId: 'L1' }] }), /Geometry must define "spaces" array/);
});

test('Engineering Core Boundaries: Zero-element valid geometry yields zero findings and clean status', () => {
  const emptyGeometry = {
    schemaVersion: 'claude-design-schema-v1.0',
    projectId: 'EMPTY-SITE-001',
    units: 'METRIC_M',
    levels: [{ levelId: 'L1', elevationMm: 0 }],
    spaces: [],
    structuralElements: [],
    enclosureElements: [],
    openings: []
  };

  const result = CoordinationOrchestrator.coordinate(emptyGeometry);
  assert.strictEqual(result.summaryMetrics.totalFindingsCount, 0);
  assert.strictEqual(result.summaryMetrics.criticalIssuesCount, 0);
  assert.strictEqual(result.status, 'COORDINATION_PASSED');
});

test('Engineering Core Boundaries: Exact boundary tests for structural span heuristic (7000 mm)', () => {
  const geomAtLimit = JSON.parse(JSON.stringify(COMPLIANT_VILLA));
  geomAtLimit.structuralElements = [
    {
      elementId: 'COL-BOUND-01',
      type: 'COLUMN',
      levelId: 'L1',
      boundaryPolygon: [[0, 0], [400, 0], [400, 400], [0, 400]],
      isLoadBearing: true
    },
    {
      elementId: 'COL-BOUND-02',
      type: 'COLUMN',
      levelId: 'L1',
      boundaryPolygon: [[7000, 0], [7400, 0], [7400, 400], [7000, 400]],
      isLoadBearing: true
    }
  ];

  const resAtLimit = CoordinationOrchestrator.coordinate(geomAtLimit);
  const spanIssueAtLimit = resAtLimit.structuralCoordination.issues.find(i => i.issueId?.includes('SPAN'));
  assert.strictEqual(spanIssueAtLimit, undefined);

  const geomAboveLimit = JSON.parse(JSON.stringify(COMPLIANT_VILLA));
  geomAboveLimit.structuralElements = [
    {
      elementId: 'COL-BOUND-01',
      type: 'COLUMN',
      levelId: 'L1',
      boundaryPolygon: [[0, 0], [400, 0], [400, 400], [0, 400]],
      isLoadBearing: true
    },
    {
      elementId: 'COL-BOUND-02',
      type: 'COLUMN',
      levelId: 'L1',
      boundaryPolygon: [[7005, 0], [7405, 0], [7405, 400], [7005, 400]],
      isLoadBearing: true
    }
  ];

  const resAboveLimit = CoordinationOrchestrator.coordinate(geomAboveLimit);
  const spanIssueAbove = resAboveLimit.structuralCoordination.issues.find(i => i.issueId?.includes('SPAN'));
  assert.notStrictEqual(spanIssueAbove, undefined);
  assert.strictEqual(spanIssueAbove.severity, 'MAJOR');
});

test('Engineering Core Boundaries: Exact boundary tests for vertical column stacking (300 mm)', () => {
  const geomStacking = JSON.parse(JSON.stringify(COMPLIANT_VILLA));
  geomStacking.levels = [
    { levelId: 'L1', elevationMm: 0 },
    { levelId: 'L2', elevationMm: 3500 }
  ];

  geomStacking.structuralElements = [
    {
      elementId: 'COL-L1',
      type: 'COLUMN',
      levelId: 'L1',
      boundaryPolygon: [[0, 0], [400, 0], [400, 400], [0, 400]],
      isLoadBearing: true
    },
    {
      elementId: 'COL-L2',
      type: 'COLUMN',
      levelId: 'L2',
      boundaryPolygon: [[350, 0], [750, 0], [750, 400], [350, 400]],
      isLoadBearing: true
    }
  ];

  const res = CoordinationOrchestrator.coordinate(geomStacking);
  assert.strictEqual(res.structuralCoordination.irregularStackingDetected, true);
  const stackIssue = res.structuralCoordination.issues.find(i => i.issueId?.includes('STACKING'));
  assert.notStrictEqual(stackIssue, undefined);
  assert.strictEqual(stackIssue.severity, 'CRITICAL');
});
