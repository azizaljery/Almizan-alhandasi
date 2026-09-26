import { getPolygonAABB2D, aabbIntersects2D } from './spatial-math.js';
import { ClashTypes, IssueSeverities } from '../contracts/coordination-package.contract.js';

export class ClashDetectionEngine {
  static detectClashes(adaptedGeometry, disciplineResults) {
    const clashes = [];
    const { geometry, unitScaleToMm } = adaptedGeometry;

    const columns = (geometry.structuralElements || []).filter(el => el.type === 'COLUMN' || el.type === 'SHEAR_WALL');
    const serviceZones = geometry.mepServiceZones || [];

    for (const col of columns) {
      const colAABB = getPolygonAABB2D(col.boundaryPolygon.map(p => [p[0] * unitScaleToMm, p[1] * unitScaleToMm]));
      for (const zone of serviceZones) {
        if (zone.levelId === col.levelId) {
          const zoneAABB = getPolygonAABB2D(zone.boundaryPolygon.map(p => [p[0] * unitScaleToMm, p[1] * unitScaleToMm]));
          if (aabbIntersects2D(colAABB, zoneAABB)) {
            clashes.push({
              clashId: `CLASH-HARD-${col.elementId}-${zone.zoneId}`,
              clashType: ClashTypes.HARD_STRUCTURAL_PENETRATION,
              severity: IssueSeverities.CRITICAL,
              involvedElementIds: [col.elementId, zone.zoneId],
              involvedDisciplines: ['STRUCTURAL', zone.discipline || 'HVAC'],
              description: `Structural member "${col.elementId}" penetrates reserved MEP service envelope "${zone.zoneId}" without coordinated sleeve allowance.`,
              clearanceDeficitMm: 0,
              ruleReference: 'RULE-STRUCT-HEURISTIC-PENETRATION-03'
            });
          }
        }
      }
    }

    const elecIssues = disciplineResults.electricalResult.issues || [];
    for (const iss of elecIssues) {
      if (iss.ruleReference?.ruleId === 'RULE-SBC-401-PANEL-CLEARANCE-01') {
        const [elA, elB] = iss.affectedElementIds;
        clashes.push({
          clashId: `CLASH-CLEARANCE-${elA}-${elB || 'OBSTRUCTION'}`,
          clashType: ClashTypes.SOFT_MAINTENANCE_CLEARANCE,
          severity: IssueSeverities.CRITICAL,
          involvedElementIds: [elA, elB || 'SPATIAL_CLEARANCE'],
          involvedDisciplines: ['ELECTRICAL', 'ARCHITECTURAL'],
          description: iss.description,
          clearanceDeficitMm: 900,
          ruleReference: iss.ruleReference.ruleId
        });
      }
    }

    const plumbIssues = disciplineResults.plumbingResult.issues || [];
    for (const iss of plumbIssues) {
      if (iss.ruleReference?.ruleId === 'RULE-PLUMB-HEURISTIC-WATER-OVER-ELEC-01') {
        const [spA, spB] = iss.affectedSpaceIds;
        clashes.push({
          clashId: `CLASH-ZONE-${spA}-${spB}`,
          clashType: ClashTypes.ZONE_RESTRICTION_INCOMPATIBILITY,
          severity: IssueSeverities.CRITICAL,
          involvedElementIds: [spA, spB],
          involvedDisciplines: ['PLUMBING', 'ELECTRICAL'],
          description: iss.description,
          clearanceDeficitMm: 0,
          ruleReference: iss.ruleReference.ruleId
        });
      }
    }

    return clashes;
  }
}
