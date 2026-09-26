/**
 * @file reference-import.contract.js
 * @description Contract for importing real-world architectural reference projects, CAD/BIM drawings,
 * elevations, sections, facade imagery, and statutory regulatory citations.
 * Enforces that no drawing or image is accepted as EngineeringTruth without independent verification.
 */

export const DrawingType = Object.freeze({
  FLOOR_PLAN: 'FLOOR_PLAN',
  ELEVATION: 'ELEVATION',
  SECTION: 'SECTION',
  MEP_DETAIL: 'MEP_DETAIL',
  SITE_PLAN: 'SITE_PLAN',
  AXONOMETRIC: 'AXONOMETRIC'
});

export const RegulatoryAuthority = Object.freeze({
  SAUDI_BUILDING_CODE: 'SAUDI_BUILDING_CODE',
  MUNICIPAL_BALADY: 'MUNICIPAL_BALADY',
  CIVIL_DEFENSE: 'CIVIL_DEFENSE',
  SPECIAL_SECURITY_REGULATION: 'SPECIAL_SECURITY_REGULATION'
});

export class RegulatoryCitation {
  constructor({ code, article, clause, description, effectiveYear, authority = RegulatoryAuthority.SAUDI_BUILDING_CODE }) {
    if (!code || !article) {
      throw new Error('RegulatoryCitation requires code (e.g., SBC-201) and article reference.');
    }
    this.code = code;
    this.article = article;
    this.clause = clause || '';
    this.description = description || '';
    this.effectiveYear = effectiveYear || 2024;
    this.authority = authority;
  }
}

export class DrawingArtifact {
  constructor({ id, type, uriOrPath, description, scale = '1:100', isEngineeringTruth = false, verificationAudit = null }) {
    this.id = id;
    this.type = type;
    this.uriOrPath = uriOrPath;
    this.description = description;
    this.scale = scale;
    // INVARIANT: An imported drawing is NEVER EngineeringTruth by default!
    this.isEngineeringTruth = Boolean(isEngineeringTruth && verificationAudit && verificationAudit.verifiedBy);
    this.verificationAudit = verificationAudit;
  }
}

export class ReferenceImportPayload {
  constructor({
    caseId,
    projectTitle,
    location,
    buildingTypology,
    plotParameters,
    spatialMetrics,
    authoringEntity,
    drawings = [],
    images = [],
    regulatoryCitations = [],
    provenance,
    verificationAudit = null
  }) {
    if (!caseId || !projectTitle || !buildingTypology) {
      throw new Error('ReferenceImportPayload requires caseId, projectTitle, and buildingTypology.');
    }
    this.caseId = caseId;
    this.projectTitle = projectTitle;
    this.location = location;
    this.buildingTypology = buildingTypology;
    this.plotParameters = plotParameters || {};
    this.spatialMetrics = spatialMetrics || {};
    this.authoringEntity = authoringEntity || {};
    this.drawings = drawings.map(d => (d instanceof DrawingArtifact ? d : new DrawingArtifact(d)));
    this.images = images;
    this.regulatoryCitations = regulatoryCitations.map(r => (r instanceof RegulatoryCitation ? r : new RegulatoryCitation(r)));
    this.provenance = provenance;
    this.verificationAudit = verificationAudit;
    this.importedAt = new Date().toISOString();
  }

  /**
   * Certifies an imported drawing as EngineeringTruth after licensed engineer review.
   */
  certifyDrawingTruth(drawingId, { engineerName, licenseNumber, verificationDate, remarks }) {
    const drawing = this.drawings.find(d => d.id === drawingId);
    if (!drawing) {
      throw new Error(`Drawing "${drawingId}" not found in project payload.`);
    }
    if (!licenseNumber || !engineerName) {
      throw new Error('Certifying EngineeringTruth requires engineerName and licenseNumber.');
    }
    drawing.isEngineeringTruth = true;
    drawing.verificationAudit = {
      verifiedBy: engineerName,
      licenseNumber,
      verificationDate: verificationDate || new Date().toISOString(),
      remarks: remarks || 'Officially verified and approved as true engineering representation.'
    };
    return true;
  }
}
