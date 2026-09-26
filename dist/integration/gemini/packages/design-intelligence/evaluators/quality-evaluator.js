/**
 * @file quality-evaluator.js
 * @description Audits knowledge records for provenance rigor, metadata sanity, staleness, and duplicates.
 * Integrated with versioned ConfigurationRegistry.
 */

import { ProvenanceLevel, VerificationStatus } from '../contracts/knowledge-taxonomy.contract.js';
import { DEFAULT_CONFIG } from '../config/configuration-registry.js';

export class KnowledgeQualityEvaluator {
  /**
   * Evaluates a pattern or library collection for architectural data hygiene.
   * @param {object} item - Pattern or ReferenceCase
   * @param {Array<object>} [existingLibrary=[]] - For duplicate detection
   * @param {object} [config=DEFAULT_CONFIG] - Configuration Registry instance
   * @returns {{
   *   qualityScore: number,
   *   isValid: boolean,
   *   issues: Array<string>,
   *   blockingIssues: Array<string>
   * }}
   */
  static evaluateItem(item, existingLibrary = [], config = DEFAULT_CONFIG) {
    const issues = [];
    const blockingIssues = [];
    let scoreDeductions = 0;

    const staleYearsLimit = config.get('STALE_YEARS_THRESHOLD') || 8;
    const qualityPassScore = config.get('QUALITY_PASS_SCORE') || 60;

    // 1. Check Missing Provenance
    if (!item.provenance || !item.provenance.source || item.provenance.source.trim() === '') {
      blockingIssues.push(`PROVENANCE_MISSING: Item "${item.patternId || item.caseId}" lacks mandatory source attribution.`);
      scoreDeductions += 40;
    } else if (item.provenance.source === 'ANONYMOUS' || item.provenance.source === 'UNVERIFIED_WEB') {
      blockingIssues.push(`UNVERIFIED_SOURCE: Anonymous or unverified source not permitted in production registry.`);
      scoreDeductions += 35;
    }

    // 2. Check Stale Source (audit date check against configured threshold)
    if (item.provenance && item.provenance.verifiedAt) {
      const verifiedYear = new Date(item.provenance.verifiedAt).getFullYear();
      const currentYear = new Date().getFullYear();
      if (currentYear - verifiedYear > staleYearsLimit) {
        issues.push(`STALE_PROVENANCE: Last audited in ${verifiedYear} (>${staleYearsLimit} years ago); re-audit advised.`);
        scoreDeductions += 15;
      }
    } else {
      issues.push(`AUDIT_DATE_MISSING: verifiedAt timestamp missing in provenance.`);
      scoreDeductions += 10;
    }

    // 3. Check Duplicate Detection
    if (existingLibrary && existingLibrary.length > 0) {
      const duplicates = existingLibrary.filter(other => 
        other !== item && (
          (other.patternId && other.patternId === item.patternId) ||
          (other.name && item.name && other.name.toLowerCase().trim() === item.name.toLowerCase().trim())
        )
      );
      if (duplicates.length > 0) {
        blockingIssues.push(`DUPLICATE_RECORD: Conflict with existing library record ID "${duplicates[0].patternId || duplicates[0].caseId}".`);
        scoreDeductions += 50;
      }
    }

    // 4. Check Contradictory Metadata
    if (item.plotConditions) {
      const { minPlotArea, maxPlotArea, aspectRatioRange } = item.plotConditions;
      if (minPlotArea && maxPlotArea && minPlotArea > maxPlotArea) {
        blockingIssues.push(`CONTRADICTORY_METADATA: minPlotArea (${minPlotArea}) > maxPlotArea (${maxPlotArea}).`);
        scoreDeductions += 30;
      }
      if (aspectRatioRange && aspectRatioRange[0] > aspectRatioRange[1]) {
        blockingIssues.push(`CONTRADICTORY_METADATA: minAspectRatio (${aspectRatioRange[0]}) > maxAspectRatio (${aspectRatioRange[1]}).`);
        scoreDeductions += 30;
      }
    }

    // 5. Check Geometry Hints Sanity
    if (item.geometryHints) {
      for (const [k, val] of Object.entries(item.geometryHints)) {
        if (typeof val === 'number' && val <= 0) {
          issues.push(`INVALID_GEOMETRY_HINT: Geometry parameter "${k}" has non-positive dimension (${val}).`);
          scoreDeductions += 10;
        }
      }
    }

    // 6. Check Confidence Invariant
    if (item.provenance?.sourceType === ProvenanceLevel.UNVERIFIED && item.confidence > 0.6) {
      issues.push(`OVERCONFIDENCE_MISMATCH: UNVERIFIED source cannot claim confidence > 0.60.`);
      scoreDeductions += 15;
    }

    // 7. Check Synthetic Reference Status: Synthetic fixtures cannot be marked VERIFIED or CERTIFIED
    if (
      (item.verificationStatus === VerificationStatus.CERTIFIED || item.verificationStatus === VerificationStatus.PEER_REVIEWED) &&
      (item.provenance?.isSyntheticFixture === true || (item.caseId && item.caseId.startsWith('SYNTHETIC-')))
    ) {
      blockingIssues.push(`SYNTHETIC_VERIFICATION_PROHIBITED: Synthetic test fixture cannot be marked as VERIFIED or CERTIFIED.`);
      scoreDeductions += 50;
    }

    const qualityScore = Math.max(0, 100 - scoreDeductions);
    const isValid = blockingIssues.length === 0 && qualityScore >= qualityPassScore;

    return {
      qualityScore,
      isValid,
      issues,
      blockingIssues
    };
  }

  /**
   * Audits an entire pattern library collection.
   */
  static evaluateLibrary(library, config = DEFAULT_CONFIG) {
    const report = {
      totalItems: library.length,
      validItems: 0,
      invalidItems: 0,
      averageQualityScore: 0,
      itemReports: []
    };

    let totalScore = 0;
    for (const item of library) {
      const itemRes = this.evaluateItem(item, library, config);
      report.itemReports.push({ id: item.patternId || item.caseId, ...itemRes });
      totalScore += itemRes.qualityScore;
      if (itemRes.isValid) report.validItems++;
      else report.invalidItems++;
    }

    report.averageQualityScore = library.length > 0 ? Math.round(totalScore / library.length) : 100;
    return report;
  }
}
