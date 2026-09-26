import { EngineeringRulesRegistry } from '../rules-registry/rules-registry.js';
import { getPolygonCentroid2D, getPolygonAABB2D, aabbIntersects2D, distance2D } from '../clash-detection/spatial-math.js';
import { ActionTypes } from '../contracts/coordination-package.contract.js';

export class PlumbingCoordinator {
  static coordinate(adaptedGeometry) {
    const issues = [];
    const structuredChangeRequests = [];
    let criticalZoningViolations = 0;

    const { geometry, unitScaleToMm } = adaptedGeometry;
    const waterOverElecRule = EngineeringRulesRegistry.getRule('RULE-PLUMB-HEURISTIC-WATER-OVER-ELEC-01');
    const stackingRule = EngineeringRulesRegistry.getRule('RULE-PLUMB-HEURISTIC-WET-STACKING-02');

    const WET_TYPES = ['BATHROOM', 'POWDER_ROOM', 'KITCHEN'];
    const spaces = geometry.spaces || [];

    const spacesByLevel = new Map();
    for (const space of spaces) {
      if (!spacesByLevel.has(space.levelId)) {
        spacesByLevel.set(space.levelId, []);
      }
      const polyMm = (space.polygon2D || []).map(p => [p[0] * unitScaleToMm, p[1] * unitScaleToMm]);
      const aabb = getPolygonAABB2D(polyMm);
      const centroid = getPolygonCentroid2D(polyMm);
      spacesByLevel.get(space.levelId).push({ ...space, polyMm, aabb, centroid });
    }

    const levels = geometry.levels || [];
    let totalUpperWetSpaces = 0;
    let successfullyStackedWetSpaces = 0;

    for (let l = 1; l < levels.length; l++) {
      const upperLevelId = levels[l].levelId;
      const lowerLevelId = levels[l - 1].levelId;
      const upperSpaces = spacesByLevel.get(upperLevelId) || [];
      const lowerSpaces = spacesByLevel.get(lowerLevelId) || [];

      const upperWet = upperSpaces.filter(s => WET_TYPES.includes(s.functionalType));
      const lowerWet = lowerSpaces.filter(s => WET_TYPES.includes(s.functionalType));
      const lowerElec = lowerSpaces.filter(s => s.functionalType === 'ELECTRICAL_ROOM');

      for (const uWet of upperWet) {
        totalUpperWetSpaces++;

        for (const lElec of lowerElec) {
          if (aabbIntersects2D(uWet.aabb, lElec.aabb)) {
            criticalZoningViolations++;
            const issueId = `ISSUE-PLUMB-OVER-ELEC-${uWet.spaceId}-${lElec.spaceId}`;
            issues.push({
              issueId,
              discipline: 'PLUMBING',
              severity: waterOverElecRule.severityOnViolation,
              title: waterOverElecRule.title,
              description: `Upper level wet area "${uWet.name || uWet.spaceId}" is positioned directly above electrical space "${lElec.name || lElec.spaceId}".`,
              rootCause: 'Gravity drainage and plumbing lines above electrical equipment present water intrusion risk (cross-referencing dedicated equipment space requirements).',
              affectedElementIds: [],
              affectedSpaceIds: [uWet.spaceId, lElec.spaceId],
              location: { levelId: upperLevelId },
              ruleReference: {
                ruleId: waterOverElecRule.ruleId,
                authority: waterOverElecRule.source.authority,
                clause: waterOverElecRule.source.subsection,
                confidence: waterOverElecRule.confidence
              },
              suggestedRemedy: 'Relocate wet space or shift electrical room to eliminate vertical spatial overlap.'
            });

            structuredChangeRequests.push({
              requestId: `SCR-ZONING-${uWet.spaceId}`,
              targetDiscipline: 'ARCHITECTURAL',
              actionType: ActionTypes.REALIGN_WET_SPACE,
              targetElementIds: [uWet.spaceId, lElec.spaceId],
              proposedParameters: { conflictType: 'PROHIBITED_VERTICAL_OVERLAP' },
              justification: `Enforce plumbing and electrical isolation per preliminary coordination guideline.`,
              originatingIssueId: issueId
            });
          }
        }

        let minWetOffset = Infinity;
        let closestLowerWet = null;

        for (const lWet of lowerWet) {
          const dist = distance2D(uWet.centroid, lWet.centroid);
          if (dist < minWetOffset) {
            minWetOffset = dist;
            closestLowerWet = lWet;
          }
        }

        if (minWetOffset <= stackingRule.parameters.maxAdvisoryOffsetMm) {
          successfullyStackedWetSpaces++;
        } else {
          const hasLowerReference = (closestLowerWet !== null && minWetOffset !== Infinity);
          const offsetDescription = hasLowerReference
            ? `an offset of ${(minWetOffset / 1000).toFixed(2)} m from closest lower wet area "${closestLowerWet.name || closestLowerWet.spaceId}"`
            : `no reference lower wet area on level "${lowerLevelId}"`;

          const issueId = `ISSUE-PLUMB-UNSTACKED-${uWet.spaceId}`;
          issues.push({
            issueId,
            discipline: 'PLUMBING',
            severity: stackingRule.severityOnViolation,
            title: stackingRule.title,
            description: `Upper level wet space "${uWet.name || uWet.spaceId}" has ${offsetDescription}.`,
            rootCause: 'Unstacked wet areas necessitate long horizontal drainage suspensions across lower floor ceiling plenums.',
            affectedElementIds: [],
            affectedSpaceIds: [uWet.spaceId, ...(closestLowerWet ? [closestLowerWet.spaceId] : [])],
            location: { levelId: upperLevelId },
            ruleReference: {
              ruleId: stackingRule.ruleId,
              authority: stackingRule.source.authority,
              clause: stackingRule.source.subsection,
              confidence: stackingRule.confidence
            },
            suggestedRemedy: 'Align wet area vertically above lower plumbing clusters or incorporate a dedicated local vertical pipe chase.'
          });

          structuredChangeRequests.push({
            requestId: `SCR-PLUMB-STACK-${uWet.spaceId}`,
            targetDiscipline: 'ARCHITECTURAL',
            actionType: ActionTypes.ADD_SERVICE_CHASE,
            targetElementIds: [uWet.spaceId],
            proposedParameters: { 
              observedOffsetMm: hasLowerReference ? Number(minWetOffset.toFixed(0)) : null,
              referenceStatus: hasLowerReference ? 'MISALIGNED' : 'NO_REFERENCE_WET_AREA',
              recommendedChaseDimensionsMm: [400, 600] 
            },
            justification: 'Provide local vertical plumbing drops to prevent excessive horizontal ceiling drainage.',
            originatingIssueId: issueId
          });
        }
      }
    }

    const wetStackingEfficiencyRatio = totalUpperWetSpaces > 0 
      ? Number((successfullyStackedWetSpaces / totalUpperWetSpaces).toFixed(2)) 
      : 1.0;

    return {
      issues,
      structuredChangeRequests,
      wetStackingEfficiencyRatio,
      criticalZoningViolations
    };
  }
}
