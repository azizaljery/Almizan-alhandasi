/**
 * @file production-knowledge-gate.js
 * @description Production Knowledge Gate preventing unverified, synthetic, or non-compliant knowledge records
 * from entering the Production Design Intelligence Knowledge Base.
 */

import { VerificationStatus, ProvenanceLevel } from '../contracts/knowledge-taxonomy.contract.js';

export class ProductionKnowledgeGate {
  /**
   * Audits a candidate pattern or reference case for production suitability.
   * @param {object} item - Pattern or ReferenceCase
   * @returns {{
   *   allowed: boolean,
   *   rejectionReasons: Array<string>,
   *   warnings: Array<string>,
   *   itemAudited: string
   * }}
   */
  static verifyForProduction(item) {
    const rejectionReasons = [];
    const warnings = [];
    const itemId = item.patternId || item.caseId || 'UNKNOWN_ITEM';

    // 1. Check Missing Provenance / Source
    if (!item.provenance || !item.provenance.source || item.provenance.source.trim() === '') {
      rejectionReasons.push(`MISSING_PROVENANCE: Record "${itemId}" must define a verifiable source.`);
    }

    // 2. Reject Anonymous Sources
    const sourceStr = (item.provenance?.source || item.source || '').toUpperCase();
    if (sourceStr.includes('ANONYMOUS') || sourceStr.includes('UNVERIFIED_WEB') || sourceStr.includes('UNNAMED')) {
      rejectionReasons.push(`ANONYMOUS_REFERENCE_REJECTED: Anonymous or crowdsourced sources prohibited in production.`);
    }

    // 3. Reject Synthetic Fixtures in Production
    if (
      item.verificationStatus === VerificationStatus.SYNTHETIC_TEST_FIXTURE ||
      item.provenance?.isSyntheticFixture === true ||
      itemId.startsWith('SYNTHETIC-')
    ) {
      rejectionReasons.push(`SYNTHETIC_FIXTURE_REJECTED: Synthetic test fixtures are strictly forbidden in production repository.`);
    }

    // 4. Verification Status must be CERTIFIED or PEER_REVIEWED for production
    if (item.verificationStatus !== VerificationStatus.CERTIFIED && item.verificationStatus !== VerificationStatus.PEER_REVIEWED) {
      rejectionReasons.push(`INSUFFICIENT_VERIFICATION_STATUS: Production requires PEER_REVIEWED or CERTIFIED status (got: ${item.verificationStatus}).`);
    }

    // 5. Source Type must not be UNVERIFIED
    if (!item.provenance?.sourceType || item.provenance.sourceType === ProvenanceLevel.UNVERIFIED) {
      rejectionReasons.push(`UNVERIFIED_SOURCE_TYPE: Source type cannot be UNVERIFIED in production.`);
    }

    // 6. Mandatory Version
    if (!item.version) {
      rejectionReasons.push(`MISSING_VERSION: Record must declare semantic version string.`);
    }

    // 7. VerifiedAt Timestamp
    if (!item.provenance?.verifiedAt) {
      rejectionReasons.push(`MISSING_AUDIT_TIMESTAMP: Production record must include verifiedAt timestamp.`);
    }

    // 8. Visual / Drawing License Check
    if (item.images && item.images.length > 0) {
      for (const img of item.images) {
        if (!img.uriOrPath) {
          rejectionReasons.push(`INVALID_IMAGE_REFERENCE: Image ${img.id} missing URI.`);
        }
      }
    }
    if (item.drawings && item.drawings.length > 0) {
      for (const dwg of item.drawings) {
        if (!dwg.uriOrPath) {
          rejectionReasons.push(`INVALID_DRAWING_REFERENCE: Drawing ${dwg.id} missing URI.`);
        }
      }
    }

    // 9. Minimum Confidence Threshold
    const minConfidence = 0.70;
    if (typeof item.confidence !== 'number' || item.confidence < minConfidence) {
      rejectionReasons.push(`INSUFFICIENT_CONFIDENCE: Record confidence (${item.confidence}) is below production threshold (${minConfidence}).`);
    }

    // 10. Check Unsupported Regulatory Claims
    if (item.tags && (item.tags.includes('sbc-mandated') || item.tags.includes('statutory-code'))) {
      if (!item.provenance?.regulatoryCitation || !item.provenance.regulatoryCitation.code) {
        rejectionReasons.push(`UNSUPPORTED_REGULATORY_CLAIM: Pattern claims statutory SBC compliance without formal regulatory citation.`);
      }
    }

    return {
      allowed: rejectionReasons.length === 0,
      rejectionReasons,
      warnings,
      itemAudited: itemId
    };
  }
}
