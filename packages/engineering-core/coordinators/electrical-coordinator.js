import { EngineeringRulesRegistry } from '../rules-registry/rules-registry.js';
import { aabbIntersects2D } from '../clash-detection/spatial-math.js';
import { ActionTypes } from '../contracts/coordination-package.contract.js';

export class ElectricalCoordinator {
  static coordinate(adaptedGeometry) {
    const issues = [];
    const structuredChangeRequests = [];
    let panelClearanceViolations = 0;

    const { geometry, unitScaleToMm } = adaptedGeometry;
    const panelRule = EngineeringRulesRegistry.getRule('RULE-SBC-401-PANEL-CLEARANCE-01');
    const loadRule = EngineeringRulesRegistry.getRule('RULE-ELEC-HEURISTIC-LOAD-DENSITY-02');

    let totalGrossAreaSqM = 0;
    for (const space of (geometry.spaces || [])) {
      totalGrossAreaSqM += (space.netAreaSqM || 0);
    }
    const estimatedTotalConnectedKVA = Number(((totalGrossAreaSqM * loadRule.parameters.nominalVAPerSqM) / 1000).toFixed(1));

    const electricalPanels = (geometry.electricalEquipment || []).filter(eq => eq.type === 'DISTRIBUTION_BOARD' || eq.type === 'MDB');

    for (const panel of electricalPanels) {
      const panelLocation = [panel.position[0] * unitScaleToMm, panel.position[1] * unitScaleToMm];
      const clearDepth = panelRule.parameters.clearDepthMm;
      const clearWidth = panelRule.parameters.clearWidthMm;

      const orientation = panel.frontFacingDirection || 'SOUTH';
      let clearanceBox;
      if (orientation === 'SOUTH') {
        clearanceBox = {
          minX: panelLocation[0] - clearWidth / 2,
          maxX: panelLocation[0] + clearWidth / 2,
          minY: panelLocation[1] - clearDepth,
          maxY: panelLocation[1]
        };
      } else if (orientation === 'NORTH') {
        clearanceBox = {
          minX: panelLocation[0] - clearWidth / 2,
          maxX: panelLocation[0] + clearWidth / 2,
          minY: panelLocation[1],
          maxY: panelLocation[1] + clearDepth
        };
      } else if (orientation === 'EAST') {
        clearanceBox = {
          minX: panelLocation[0],
          maxX: panelLocation[0] + clearDepth,
          minY: panelLocation[1] - clearWidth / 2,
          maxY: panelLocation[1] + clearWidth / 2
        };
      } else {
        clearanceBox = {
          minX: panelLocation[0] - clearDepth,
          maxX: panelLocation[0],
          minY: panelLocation[1] - clearWidth / 2,
          maxY: panelLocation[1] + clearWidth / 2
        };
      }

      for (const opening of (geometry.openings || [])) {
        if (opening.type === 'DOOR' && opening.levelId === panel.levelId && opening.position) {
          const doorPt = [opening.position[0] * unitScaleToMm, opening.position[1] * unitScaleToMm];
          const doorWidth = (opening.widthMm || 900) * unitScaleToMm;
          const doorBox = {
            minX: doorPt[0] - doorWidth / 2,
            maxX: doorPt[0] + doorWidth / 2,
            minY: doorPt[1] - doorWidth / 2,
            maxY: doorPt[1] + doorWidth / 2
          };

          if (aabbIntersects2D(clearanceBox, doorBox)) {
            panelClearanceViolations++;
            const issueId = `ISSUE-ELEC-CLEARANCE-${panel.elementId}-${opening.openingId}`;
            issues.push({
              issueId,
              discipline: 'ELECTRICAL',
              severity: panelRule.severityOnViolation,
              title: panelRule.title,
              description: `Door "${opening.openingId}" encroaches into statutory clear working space of electrical panel "${panel.elementId}".`,
              rootCause: 'Architectural door swing intersects 900 mm mandatory clearance zone in front of electrical panel.',
              affectedElementIds: [panel.elementId, opening.openingId],
              affectedSpaceIds: panel.spaceId ? [panel.spaceId] : [],
              location: { levelId: panel.levelId },
              ruleReference: {
                ruleId: panelRule.ruleId,
                authority: panelRule.source.authority,
                clause: panelRule.source.subsection,
                confidence: panelRule.confidence
              },
              suggestedRemedy: `Relocate panel or reorient door to preserve statutory ${clearDepth} mm working space depth.`
            });

            structuredChangeRequests.push({
              requestId: `SCR-ELEC-PANEL-${panel.elementId}`,
              targetDiscipline: 'ELECTRICAL',
              actionType: ActionTypes.RELOCATE_ELEMENT,
              targetElementIds: [panel.elementId],
              proposedParameters: { requiredClearanceDepthMm: clearDepth, requiredWidthMm: clearWidth },
              justification: `Preserve dedicated electrical working space per ${panelRule.source.authority} ${panelRule.source.subsection}.`,
              originatingIssueId: issueId
            });
          }
        }
      }
    }

    return {
      issues,
      structuredChangeRequests,
      estimatedTotalConnectedKVA,
      panelClearanceViolations
    };
  }
}
