import { EngineeringRulesRegistry } from '../rules-registry/rules-registry.js';
import { ActionTypes } from '../contracts/coordination-package.contract.js';

export class ArchitecturalReviewer {
  static review(adaptedGeometry) {
    const issues = [];
    const structuredChangeRequests = [];
    let evaluatedChecksCount = 0;

    const { geometry, unitScaleToMm } = adaptedGeometry;
    const corridorRule = EngineeringRulesRegistry.getRule('RULE-SBC-1101-CORRIDOR-WIDTH-01');
    const ceilingRule = EngineeringRulesRegistry.getRule('RULE-SBC-1101-CEILING-HEIGHT-02');
    const doorSwingRule = EngineeringRulesRegistry.getRule('RULE-ARCH-HEURISTIC-DOOR-SWING-03');

    for (const space of (geometry.spaces || [])) {
      evaluatedChecksCount++;

      if (space.functionalType === 'CORRIDOR') {
        const widthMm = (space.nominalWidthMm || space.widthMm || 1000) * unitScaleToMm;
        if (widthMm < corridorRule.parameters.minWidthMm) {
          const issueId = `ISSUE-ARCH-CORR-${space.spaceId}`;
          issues.push({
            issueId,
            discipline: 'ARCHITECTURAL',
            severity: corridorRule.severityOnViolation,
            title: corridorRule.title,
            description: `Corridor "${space.name || space.spaceId}" width is ${widthMm} mm, which is below the statutory minimum of ${corridorRule.parameters.minWidthMm} mm.`,
            rootCause: 'Architectural space width deficit along primary circulation route.',
            affectedElementIds: [],
            affectedSpaceIds: [space.spaceId],
            location: { levelId: space.levelId },
            ruleReference: {
              ruleId: corridorRule.ruleId,
              authority: corridorRule.source.authority,
              clause: corridorRule.source.subsection,
              confidence: corridorRule.confidence
            },
            suggestedRemedy: `Widen corridor to at least ${corridorRule.parameters.minWidthMm} mm clear width.`
          });

          structuredChangeRequests.push({
            requestId: `SCR-ARCH-${space.spaceId}`,
            targetDiscipline: 'ARCHITECTURAL',
            actionType: ActionTypes.RESIZE_ELEMENT,
            targetElementIds: [space.spaceId],
            proposedParameters: { targetWidthMm: corridorRule.parameters.minWidthMm },
            justification: `Enforce statutory corridor clear width per ${corridorRule.source.authority} ${corridorRule.source.subsection}.`,
            originatingIssueId: issueId
          });
        }
      }

      const requiredHeadroomMm = (space.requiredHeadroomMm || 2400) * unitScaleToMm;
      if (requiredHeadroomMm < ceilingRule.parameters.minClearHeightMm) {
        evaluatedChecksCount++;
        const issueId = `ISSUE-ARCH-HEIGHT-${space.spaceId}`;
        issues.push({
          issueId,
          discipline: 'ARCHITECTURAL',
          severity: ceilingRule.severityOnViolation,
          title: ceilingRule.title,
          description: `Space "${space.name || space.spaceId}" ceiling height is ${requiredHeadroomMm} mm, less than statutory minimum of ${ceilingRule.parameters.minClearHeightMm} mm.`,
          rootCause: 'Sub-code ceiling clear height specified in architectural space definition.',
          affectedElementIds: [],
          affectedSpaceIds: [space.spaceId],
          location: { levelId: space.levelId },
          ruleReference: {
            ruleId: ceilingRule.ruleId,
            authority: ceilingRule.source.authority,
            clause: ceilingRule.source.subsection,
            confidence: ceilingRule.confidence
          },
          suggestedRemedy: `Increase space clear height to at least ${ceilingRule.parameters.minClearHeightMm} mm.`
        });
      }
    }

    for (const opening of (geometry.openings || [])) {
      if (opening.type === 'DOOR' && opening.adjacentCorridorSpaceId) {
        evaluatedChecksCount++;
        const corridor = (geometry.spaces || []).find(s => s.spaceId === opening.adjacentCorridorSpaceId);
        if (corridor) {
          const corridorWidth = (corridor.nominalWidthMm || 1000) * unitScaleToMm;
          const doorWidth = (opening.widthMm || 900) * unitScaleToMm;
          const residualPassage = corridorWidth - doorWidth;
          if (residualPassage < doorSwingRule.parameters.minResidualWidthMm && opening.swingDirection?.startsWith('OUTWARD')) {
            const issueId = `ISSUE-ARCH-SWING-${opening.openingId}`;
            issues.push({
              issueId,
              discipline: 'ARCHITECTURAL',
              severity: doorSwingRule.severityOnViolation,
              title: doorSwingRule.title,
              description: `Door "${opening.openingId}" swings outward into corridor leaving only ${residualPassage} mm residual passage (advisory heuristic recommends ${doorSwingRule.parameters.minResidualWidthMm} mm).`,
              rootCause: 'Outward door swing encroaches into circulation corridor clearance.',
              affectedElementIds: [opening.openingId],
              affectedSpaceIds: [corridor.spaceId],
              location: { levelId: corridor.levelId },
              ruleReference: {
                ruleId: doorSwingRule.ruleId,
                authority: doorSwingRule.source.authority,
                clause: doorSwingRule.source.subsection,
                confidence: doorSwingRule.confidence
              },
              suggestedRemedy: 'Reorient door swing to inward or use sliding / recessed pocket configuration.'
            });

            structuredChangeRequests.push({
              requestId: `SCR-SWING-${opening.openingId}`,
              targetDiscipline: 'ARCHITECTURAL',
              actionType: ActionTypes.REORIENT_DOOR_SWING,
              targetElementIds: [opening.openingId],
              proposedParameters: { recommendedSwing: 'INWARD' },
              justification: 'Prevent corridor obstruction per preliminary circulation heuristic.',
              originatingIssueId: issueId
            });
          }
        }
      }
    }

    return { issues, structuredChangeRequests, evaluatedChecksCount };
  }
}
