/**
 * @file reference-case.contract.js
 * @description Schema for storing and recalling verified architectural reference cases.
 * Strictly isolates visual references from verified engineering truth.
 */

import { VerificationStatus, ProvenanceLevel } from './knowledge-taxonomy.contract.js';

export const VisualReferenceType = {
  FLOOR_PLAN: 'FLOOR_PLAN',
  ELEVATION: 'ELEVATION',
  SECTION: 'SECTION',
  RENDER_3D: 'RENDER_3D',
  FACADE_REFERENCE: 'FACADE_REFERENCE',
  INTERIOR_REFERENCE: 'INTERIOR_REFERENCE',
  ENGINEERING_DETAIL: 'ENGINEERING_DETAIL'
};

export class VisualReference {
  constructor(data) {
    if (!data.id || !data.type || !data.uriOrPath) {
      throw new Error('VisualReference requires id, type, and uriOrPath.');
    }
    this.id = data.id;
    this.type = data.type;
    this.uriOrPath = data.uriOrPath;
    this.caption = data.caption || '';
    this.source = data.source || 'INTERNAL_ARCHIVE';
    this.license = data.license || 'PROPRIETARY_INTERNAL';
    // Explicit architectural boundary:
    this.isEngineeringTruth = false;
    this.disclaimer = 'VISUAL REFERENCE ONLY. DOES NOT CONSTITUTE VALIDATED BIM GEOMETRY OR STAMPED STRUCTURAL/MEP TRUTH.';
  }
}

export function validateReferenceCase(refCase) {
  const mandatory = [
    'caseId',
    'source',
    'projectType',
    'plot',
    'program',
    'designPatternIds',
    'geometrySummary',
    'zones',
    'verificationStatus',
    'provenance'
  ];

  for (const m of mandatory) {
    if (!refCase[m]) {
      throw new Error(`ReferenceCase validation error: Missing "${m}" in case ${refCase.caseId || 'UNKNOWN'}`);
    }
  }

  if (refCase.source === 'ANONYMOUS' || refCase.source.trim() === '') {
    throw new Error(`ReferenceCase ${refCase.caseId} must not have anonymous or unverified source.`);
  }

  return true;
}
