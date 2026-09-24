import { EngineeringRulesRegistry } from '../rules-registry/rules-registry.js';
import { getPolygonCentroid2D, distance2D } from '../clash-detection/spatial-math.js';
import { ActionTypes } from '../contracts/coordination-package.contract.js';

export class StructuralCoordinator {
  static coordinate(adaptedGeometry) {
    const issues = [];
    const structuredChangeRequests = [];
    let maxObservedSpanMeters = 0;
    let irregularStackingDetected = false;

    const { geometry, unitScaleToMm } = adaptedGeometry;
    const spanRule = EngineeringRulesRegistry.getRule('RULE-STRUCT-HEURISTIC-SPAN-01');
    const stackingRule = EngineeringRulesRegistry.getRule('RULE-STRUCT-HEURISTIC-STACKING-02');

    const columns = (geometry.structuralElements || []).filter(el => el.type === 'COLUMN');

    const columnsByLevel = new Map();
    for (const col of columns) {
      if (!columnsByLevel.has(col.levelId)) {
        columnsByLevel.set(col.levelId, []);
      }
      const centroid = getPolygonCentroid2D(col.boundaryPolygon.map(p => [p[0] * unitScaleToMm, p[1] * unitScaleToMm]));
      columnsByLevel.get(col.levelId).push({ ...col, centroidMm: centroid });
    }

    for (const [levelId, cols] of columnsByLevel.entries()) {
      for (let i = 0; i < cols.length; i++) {
        let nearestDist = Infinity;
        let nearestCol = null;

        for (let j = 0; j < cols.length; j++) {
          if (i === j) continue;
          const dist = distance2D(cols[i].centroidMm, cols[j].centroidMm);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestCol = cols[j];
          }
        }

        const spanMeters = nearestDist !== Infinity ? nearestDist / 1000 : 0;
        if (spanMeters > maxObservedSpanMeters) {
          maxObservedSpanMeters = spanMeters;
        }

        if (nearestDist !== Infinity && nearestDist > spanRule.parameters.advisoryMaxSpanMm) {
          const issueId = `ISSUE-STRUCT-SPAN-${cols[i].elementId}`;
          if (!issues.some(iss => iss.affectedElementIds.includes(cols[i].elementId) && iss.affectedElementIds.includes(nearestCol?.elementId))) {
            issues.push({
              issueId,
              discipline: 'STRUCTURAL',
              severity: spanRule.severityOnViolation,
              title: spanRule.title,
              description: `Preliminary column span between "${cols[i].elementId}" and nearest column "${nearestCol?.elementId}" is ${(nearestDist / 1000).toFixed(2)} m, exceeding preliminary heuristic threshold of ${spanRule.parameters.advisoryMaxSpanMm / 1000} m.`,
              rootCause: 'Large unsupported span identified during scheme coordination; may require non-standard slab depth or deflection study.',
              affectedElementIds: [cols[i].elementId, nearestCol.elementId],
              affectedSpaceIds: [],
              location: { levelId },
              ruleReference: {
                ruleId: spanRule.ruleId,
                authority: spanRule.source.authority,
                clause: spanRule.source.subsection,
                confidence: spanRule.confidence
              },
              suggestedRemedy: 'Review layout for possibility of adding an intermediate column or verifying drop beam capacity in detailed engineering.'
            });

            structuredChangeRequests.push({
              requestId: `SCR-STRUCT-SPAN-${cols[i].elementId}`,
              targetDiscipline: 'STRUCTURAL',
              actionType: ActionTypes.RELOCATE_ELEMENT,
              targetElementIds: [cols[i].elementId, nearestCol.elementId],
              proposedParameters: { observedSpanMm: nearestDist, recommendation: 'ADD_INTERMEDIATE_SUPPORT_OR_DEEPEN_SLAB' },
              justification: `Span ${(nearestDist / 1000).toFixed(2)} m exceeds preliminary scheme guidance.`,
              originatingIssueId: issueId
            });
          }
        }
      }
    }

    const levels = geometry.levels || [];
    for (let l = 1; l < levels.length; l++) {
      const upperLevelId = levels[l].levelId;
      const lowerLevelId = levels[l - 1].levelId;
      const upperCols = columnsByLevel.get(upperLevelId) || [];
      const lowerCols = columnsByLevel.get(lowerLevelId) || [];

      for (const uCol of upperCols) {
        let minOffset = Infinity;
        let closestLowerCol = null;

        for (const lCol of lowerCols) {
          const offset = distance2D(uCol.centroidMm, lCol.centroidMm);
          if (offset < minOffset) {
            minOffset = offset;
            closestLowerCol = lCol;
          }
        }

        if (minOffset > stackingRule.parameters.maxPermissibleOffsetMm) {
          irregularStackingDetected = true;
          const issueId = `ISSUE-STRUCT-STACKING-${uCol.elementId}`;
          issues.push({
            issueId,
            discipline: 'STRUCTURAL',
            severity: stackingRule.severityOnViolation,
            title: stackingRule.title,
            description: `Upper level column "${uCol.elementId}" on "${upperLevelId}" is offset by ${(minOffset / 1000).toFixed(2)} m from nearest lower level column "${closestLowerCol?.elementId || 'NONE'}" on "${lowerLevelId}".`,
            rootCause: 'Discontinuous vertical load path; creates eccentric loading requiring structural transfer members.',
            affectedElementIds: [uCol.elementId, ...(closestLowerCol ? [closestLowerCol.elementId] : [])],
            affectedSpaceIds: [],
            location: { levelId: upperLevelId },
            ruleReference: {
              ruleId: stackingRule.ruleId,
              authority: stackingRule.source.authority,
              clause: stackingRule.source.subsection,
              confidence: stackingRule.confidence
            },
            suggestedRemedy: 'Align column with lower floor grid or introduce designated transfer slab/beam system.'
          });

          structuredChangeRequests.push({
            requestId: `SCR-STRUCT-STACK-${uCol.elementId}`,
            targetDiscipline: 'STRUCTURAL',
            actionType: ActionTypes.RELOCATE_ELEMENT,
            targetElementIds: [uCol.elementId],
            proposedParameters: { targetAlignmentElementId: closestLowerCol?.elementId, currentOffsetMm: minOffset },
            justification: 'Restore vertical continuity per preliminary stacking heuristic.',
            originatingIssueId: issueId
          });
        }
      }
    }

    return {
      issues,
      structuredChangeRequests,
      maxObservedSpanMeters: Number(maxObservedSpanMeters.toFixed(2)),
      irregularStackingDetected
    };
  }
}
