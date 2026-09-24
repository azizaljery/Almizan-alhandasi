import { ClaudeGeometryAdapter } from '../contracts/claude-geometry-adapter.js';
import { ArchitecturalReviewer } from '../coordinators/architectural-reviewer.js';
import { StructuralCoordinator } from '../coordinators/structural-coordinator.js';
import { ElectricalCoordinator } from '../coordinators/electrical-coordinator.js';
import { PlumbingCoordinator } from '../coordinators/plumbing-coordinator.js';
import { HVACCoordinator } from '../coordinators/hvac-coordinator.js';
import { ClashDetectionEngine } from '../clash-detection/clash-detector.js';
import { EngineeringRulesRegistry } from '../rules-registry/rules-registry.js';
import { 
  CoordinationStatuses, 
  CoordinationStage, 
  OFFICIAL_DISCLAIMER,
  IssueSeverities,
  ClashTypes
} from '../contracts/coordination-package.contract.js';

export class CoordinationOrchestrator {
  static coordinate(rawGeometry, options = {}) {
    const adaptedGeometry = ClaudeGeometryAdapter.adapt(rawGeometry);

    const architecturalResult = ArchitecturalReviewer.review(adaptedGeometry);
    const structuralResult = StructuralCoordinator.coordinate(adaptedGeometry);
    const electricalResult = ElectricalCoordinator.coordinate(adaptedGeometry);
    const plumbingResult = PlumbingCoordinator.coordinate(adaptedGeometry);
    const hvacResult = HVACCoordinator.coordinate(adaptedGeometry);

    const crossDisciplineClashes = ClashDetectionEngine.detectClashes(adaptedGeometry, {
      architecturalResult,
      structuralResult,
      electricalResult,
      plumbingResult,
      hvacResult
    });

    const allIssues = [
      ...architecturalResult.issues,
      ...structuralResult.issues,
      ...electricalResult.issues,
      ...plumbingResult.issues,
      ...hvacResult.issues
    ];

    const structuredChangeRequests = [
      ...architecturalResult.structuredChangeRequests,
      ...structuralResult.structuredChangeRequests,
      ...electricalResult.structuredChangeRequests,
      ...plumbingResult.structuredChangeRequests,
      ...hvacResult.structuredChangeRequests
    ];

    const criticalIssuesCount = allIssues.filter(i => i.severity === IssueSeverities.CRITICAL).length;
    const majorIssuesCount = allIssues.filter(i => i.severity === IssueSeverities.MAJOR).length;
    const minorIssuesCount = allIssues.filter(i => i.severity === IssueSeverities.MINOR).length;
    const advisoryIssuesCount = allIssues.filter(i => i.severity === IssueSeverities.ADVISORY).length;
    const totalIssuesCount = criticalIssuesCount + majorIssuesCount + minorIssuesCount + advisoryIssuesCount;

    const hardClashesCount = crossDisciplineClashes.filter(c => c.clashType === ClashTypes.HARD_STRUCTURAL_PENETRATION).length;
    const softClashesCount = crossDisciplineClashes.filter(c => c.clashType === ClashTypes.SOFT_MAINTENANCE_CLEARANCE).length;
    const zoneClashesCount = crossDisciplineClashes.filter(c => c.clashType === ClashTypes.ZONE_RESTRICTION_INCOMPATIBILITY).length;
    const totalClashesCount = hardClashesCount + softClashesCount + zoneClashesCount;

    const totalFindingsCount = totalIssuesCount + totalClashesCount;

    let status = CoordinationStatuses.COORDINATION_PASSED;
    if (criticalIssuesCount > 0 || totalClashesCount > 0) {
      status = CoordinationStatuses.CRITICAL_BLOCKERS_FOUND;
    } else if (majorIssuesCount > 0 || structuredChangeRequests.length > 0) {
      status = CoordinationStatuses.CHANGES_REQUIRED;
    } else if (minorIssuesCount > 0 || advisoryIssuesCount > 0) {
      status = CoordinationStatuses.PASSED_WITH_ADVISORIES;
    }

    const rulesUsedMap = new Map();
    for (const iss of allIssues) {
      if (iss.ruleReference?.ruleId && !rulesUsedMap.has(iss.ruleReference.ruleId)) {
        try {
          const ruleObj = EngineeringRulesRegistry.getRule(iss.ruleReference.ruleId);
          rulesUsedMap.set(ruleObj.ruleId, {
            ruleId: ruleObj.ruleId,
            title: ruleObj.title,
            classification: ruleObj.classification,
            documentId: ruleObj.source.documentId || 'N/A',
            authority: ruleObj.source.authority,
            edition: ruleObj.source.edition,
            section: ruleObj.source.section,
            subsection: ruleObj.source.subsection,
            reference: ruleObj.source.reference,
            effectiveFrom: ruleObj.source.effectiveFrom,
            verifiedAt: ruleObj.source.verifiedAt,
            confidence: ruleObj.confidence,
            isStatutoryCode: ruleObj.isStatutoryCode
          });
        } catch {
        }
      }
    }

    const coordinationPackage = {
      packageId: `ECP-${adaptedGeometry.geometry.projectId}-${Date.now()}`,
      projectId: adaptedGeometry.geometry.projectId,
      sourceSchemaVersion: adaptedGeometry.sourceSchemaVersion,
      sourceGeometryHash: adaptedGeometry.sourceGeometryHash,
      coordinationStage: CoordinationStage,
      disclaimer: OFFICIAL_DISCLAIMER,
      generatedAt: new Date().toISOString(),
      status,
      summaryMetrics: {
        totalFindingsCount,
        totalIssuesCount,
        criticalIssuesCount,
        majorIssuesCount,
        minorIssuesCount,
        advisoryIssuesCount,
        totalClashesCount,
        hardClashesCount,
        softClashesCount,
        zoneClashesCount,
        totalStructuredChangeRequests: structuredChangeRequests.length
      },
      architecturalReview: {
        issues: architecturalResult.issues,
        evaluatedChecksCount: architecturalResult.evaluatedChecksCount
      },
      structuralCoordination: {
        issues: structuralResult.issues,
        maxObservedSpanMeters: structuralResult.maxObservedSpanMeters,
        irregularStackingDetected: structuralResult.irregularStackingDetected
      },
      electricalCoordination: {
        issues: electricalResult.issues,
        estimatedTotalConnectedKVA: electricalResult.estimatedTotalConnectedKVA,
        panelClearanceViolations: electricalResult.panelClearanceViolations
      },
      plumbingCoordination: {
        issues: plumbingResult.issues,
        wetStackingEfficiencyRatio: plumbingResult.wetStackingEfficiencyRatio,
        criticalZoningViolations: plumbingResult.criticalZoningViolations
      },
      hvacCoordination: {
        issues: hvacResult.issues,
        totalEstimatedTonsRefrigeration: hvacResult.totalEstimatedTonsRefrigeration,
        plenumDeficitSpaces: hvacResult.plenumDeficitSpaces
      },
      crossDisciplineClashes,
      structuredChangeRequests,
      engineeringProvenance: {
        appliedRules: Array.from(rulesUsedMap.values()),
        calculationSolvers: [
          { name: 'PreliminaryEmpiricalStructuralReviewer', version: '1.0.0', type: 'PRELIMINARY_DETERMINISTIC' },
          { name: 'StandardDiversityElectricalEstimator', version: '1.0.0', type: 'PRELIMINARY_DETERMINISTIC' },
          { name: 'RegionalThermalHeuristicHVACReviewer', version: '1.0.0', type: 'PRELIMINARY_DETERMINISTIC' }
        ]
      }
    };

    return coordinationPackage;
  }
}
