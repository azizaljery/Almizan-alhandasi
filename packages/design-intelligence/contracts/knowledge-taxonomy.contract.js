/**
 * @file knowledge-taxonomy.contract.js
 * @description Formal taxonomy isolating regulatory, architectural, cultural, and user knowledge domains.
 */

export const KnowledgeDomain = Object.freeze({
  REGULATORY: 'REGULATORY',
  ARCHITECTURAL: 'ARCHITECTURAL',
  CULTURAL_PREFERENCE: 'CULTURAL_PREFERENCE',
  USER_SPECIFIC: 'USER_SPECIFIC',
  REFERENCE_PATTERN: 'REFERENCE_PATTERN'
});

export const ProvenanceLevel = Object.freeze({
  VERIFIED: 'VERIFIED',
  DERIVED: 'DERIVED',
  HEURISTIC: 'HEURISTIC',
  UNVERIFIED: 'UNVERIFIED'
});

export const VerificationStatus = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  SYNTHETIC_TEST_FIXTURE: 'SYNTHETIC_TEST_FIXTURE',
  COMMUNITY_PROPOSED: 'COMMUNITY_PROPOSED',
  PEER_REVIEWED: 'PEER_REVIEWED',
  CERTIFIED: 'CERTIFIED'
});

/**
 * Knowledge Precedence Hierarchy (Highest to Lowest)
 * USER_HARD_REQUIREMENT (100) > VERIFIED_GEOMETRY (90) > VERIFIED_REGULATORY_RULE (80) > REFERENCE_PATTERN (50) > HEURISTIC (30)
 */
export const KnowledgePrecedenceLevel = Object.freeze({
  USER_HARD_REQUIREMENT: 100,
  VERIFIED_GEOMETRY: 90,
  VERIFIED_REGULATORY_RULE: 80,
  REFERENCE_PATTERN: 50,
  HEURISTIC: 30
});

export class KnowledgePrecedenceResolver {
  /**
   * Evaluates if dominantDomain strictly outranks subordinateDomain.
   * @param {number} dominantLevel - from KnowledgePrecedenceLevel
   * @param {number} subordinateLevel - from KnowledgePrecedenceLevel
   * @returns {boolean}
   */
  static outranks(dominantLevel, subordinateLevel) {
    return dominantLevel > subordinateLevel;
  }
}

export class KnowledgeTaxonomyItem {
  constructor(data) {
    this.domain = data.domain;
    this.source = data.source;
    this.sourceType = data.sourceType || ProvenanceLevel.UNVERIFIED;
    this.version = data.version || '1.0.0';
    this.verifiedAt = data.verifiedAt || null;
    this.verificationStatus = data.verificationStatus || VerificationStatus.UNVERIFIED;
    this.confidence = typeof data.confidence === 'number' ? data.confidence : 0.5;
  }
}
