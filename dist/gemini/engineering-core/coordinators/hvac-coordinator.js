import { EngineeringRulesRegistry } from '../rules-registry/rules-registry.js';
import { ActionTypes } from '../contracts/coordination-package.contract.js';

export class HVACCoordinator {
  static coordinate(adaptedGeometry) {
    const issues = [];
    const structuredChangeRequests = [];
    const plenumDeficitSpaces = [];

    const { geometry, unitScaleToMm } = adaptedGeometry;
    const plenumRule = EngineeringRulesRegistry.getRule('RULE-HVAC-HEURISTIC-PLENUM-DEPTH-01');
    const coolingRule = EngineeringRulesRegistry.getRule('RULE-HVAC-HEURISTIC-COOLING-RATE-02');

    let totalConditionedAreaSqM = 0;
    const spaces = geometry.spaces || [];
    for (const space of spaces) {
      if (!['BALCONY', 'PARKING', 'SERVICE_SHAFT'].includes(space.functionalType)) {
        totalConditionedAreaSqM += (space.netAreaSqM || 0);
      }
    }
    const totalEstimatedTonsRefrigeration = Number((totalConditionedAreaSqM / coolingRule.parameters.sqMPerTon).toFixed(1));

    const levelsMap = new Map((geometry.levels || []).map(l => [l.levelId, l]));

    for (const space of spaces) {
      const level = levelsMap.get(space.levelId);
      if (!level) continue;

      const systemType = space.hvacSystemType || geometry.defaultHVACSystem || 'CONCEALED_DUCT_SPLIT';
      if (systemType === 'CONCEALED_DUCT_SPLIT') {
        const floorToCeiling = (level.floorToCeilingHeight || 3400) * unitScaleToMm;
        const requiredHeadroom = (space.requiredHeadroomMm || 2800) * unitScaleToMm;
        const slabThickness = (level.slabThickness || 250) * unitScaleToMm;

        const availablePlenumMm = floorToCeiling - requiredHeadroom - slabThickness;

        if (availablePlenumMm < plenumRule.parameters.minPlenumDepthMm) {
          plenumDeficitSpaces.push(space.spaceId);
          const issueId = `ISSUE-HVAC-PLENUM-${space.spaceId}`;
          issues.push({
            issueId,
            discipline: 'HVAC',
            severity: plenumRule.severityOnViolation,
            title: plenumRule.title,
            description: `Space "${space.name || space.spaceId}" has only ${availablePlenumMm} mm residual ceiling plenum (preliminary heuristic advises at least ${plenumRule.parameters.minPlenumDepthMm} mm for concealed ducted split).`,
            rootCause: 'Insufficient vertical space between finished ceiling height and structural slab to route supply/return ducts and condensate slope.',
            affectedElementIds: [],
            affectedSpaceIds: [space.spaceId],
            location: { levelId: space.levelId },
            ruleReference: {
              ruleId: plenumRule.ruleId,
              authority: plenumRule.source.authority,
              clause: plenumRule.source.subsection,
              confidence: plenumRule.confidence
            },
            suggestedRemedy: `Adjust architectural clear ceiling height or specify wall-mounted/mini-split unit for this space.`
          });

          structuredChangeRequests.push({
            requestId: `SCR-HVAC-PLENUM-${space.spaceId}`,
            targetDiscipline: 'ARCHITECTURAL',
            actionType: ActionTypes.ADJUST_CLEAR_HEIGHT,
            targetElementIds: [space.spaceId],
            proposedParameters: { 
              currentPlenumMm: availablePlenumMm, 
              requiredPlenumMm: plenumRule.parameters.minPlenumDepthMm,
              recommendedClearHeadroomMm: floorToCeiling - slabThickness - plenumRule.parameters.minPlenumDepthMm
            },
            justification: `Provide minimum ${plenumRule.parameters.minPlenumDepthMm} mm ceiling plenum envelope per preliminary HVAC coordination heuristic.`,
            originatingIssueId: issueId
          });
        }
      }
    }

    return {
      issues,
      structuredChangeRequests,
      totalEstimatedTonsRefrigeration,
      plenumDeficitSpaces
    };
  }
}
