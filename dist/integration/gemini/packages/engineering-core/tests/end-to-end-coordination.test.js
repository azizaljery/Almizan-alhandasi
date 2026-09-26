import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CoordinationOrchestrator } from '../core/coordination-orchestrator.js';
import { ReportGenerator } from '../core/report-generator.js';
import { CoordinationStatuses, OFFICIAL_DISCLAIMER } from '../contracts/coordination-package.contract.js';

test('End-to-End Coordination: Full Package Generation & Summary Metrics Invariants', () => {
  const conflictedFixture = JSON.parse(fs.readFileSync(path.resolve('fixtures/conflicted-villa.fixture.json'), 'utf8'));

  const pkg = CoordinationOrchestrator.coordinate(conflictedFixture);

  assert.ok(pkg.packageId.startsWith('ECP-PRJ-VILLA-CONFLICTED-002'), 'Package ID must match project prefix.');
  assert.strictEqual(pkg.sourceSchemaVersion, 'claude-design-schema-v1.2', 'Schema version must match input.');
  assert.ok(pkg.sourceGeometryHash, 'sourceGeometryHash must be present.');
  assert.strictEqual(pkg.disclaimer, OFFICIAL_DISCLAIMER, 'Official disclaimer must be present.');
  assert.strictEqual(pkg.status, CoordinationStatuses.CRITICAL_BLOCKERS_FOUND, 'Status must be CRITICAL_BLOCKERS_FOUND.');

  const { summaryMetrics } = pkg;
  const calculatedTotalIssues = 
    summaryMetrics.criticalIssuesCount +
    summaryMetrics.majorIssuesCount +
    summaryMetrics.minorIssuesCount +
    summaryMetrics.advisoryIssuesCount;

  assert.strictEqual(
    summaryMetrics.totalIssuesCount,
    calculatedTotalIssues,
    `totalIssuesCount (${summaryMetrics.totalIssuesCount}) must EXACTLY equal sum of severity buckets (${calculatedTotalIssues}).`
  );

  const calculatedTotalClashes =
    summaryMetrics.hardClashesCount +
    summaryMetrics.softClashesCount +
    summaryMetrics.zoneClashesCount;

  assert.strictEqual(
    summaryMetrics.totalClashesCount,
    calculatedTotalClashes,
    `totalClashesCount (${summaryMetrics.totalClashesCount}) must EXACTLY equal sum of clash type buckets (${calculatedTotalClashes}).`
  );

  assert.strictEqual(
    summaryMetrics.totalFindingsCount,
    summaryMetrics.totalIssuesCount + summaryMetrics.totalClashesCount,
    'totalFindingsCount must equal totalIssuesCount + totalClashesCount.'
  );

  assert.ok(pkg.structuredChangeRequests.length >= 4, 'Must generate multiple structured change requests for Design Core.');
  for (const scr of pkg.structuredChangeRequests) {
    assert.ok(scr.requestId, 'SCR must have requestId');
    assert.ok(scr.actionType, 'SCR must have actionType');
    assert.ok(scr.targetElementIds.length > 0, 'SCR must reference targetElementIds');
    assert.ok(scr.justification, 'SCR must provide engineering justification');
  }

  const markdownReport = ReportGenerator.generateMarkdown(pkg);
  assert.ok(markdownReport.includes('MIZAN Engineering Coordination Report'), 'Report title must be present.');
  assert.ok(markdownReport.includes(pkg.sourceGeometryHash), 'Report must contain sourceGeometryHash.');
  assert.ok(markdownReport.includes('DISCLAIMER'), 'Report must include DISCLAIMER.');
  assert.ok(markdownReport.includes('SBC 2024 Baseline'), 'Report must cite SBC 2024 Baseline.');

  assert.ok(!markdownReport.includes('Infinity'), 'Report must not contain Infinity values.');
});
