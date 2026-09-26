/**
 * @file scoring-engine.js
 * @description Evaluates compatibility, ranks patterns, and pairs micro-patterns.
 */

import { PatternCompatibilityEvaluator } from '../evaluators/compatibility-evaluator.js';
import { KnowledgeConflictDetector } from '../evaluators/conflict-evaluator.js';
import { MICRO_PATTERNS } from '../library/micro-patterns.js';

export class ScoringEngine {
  /**
   * Scores, pairs micro-patterns, and ranks candidates.
   * @param {Array<object>} macroPatterns 
   * @param {object} context 
   * @returns {Array<object>} Ranked candidates
   */
  static scoreAndRank(macroPatterns, context) {
    const scoredCandidates = [];
    const { requirements = {} } = context;

    for (const pattern of macroPatterns) {
      const evaluation = PatternCompatibilityEvaluator.evaluate(pattern, context);
      const conflicts = KnowledgeConflictDetector.detectConflicts(pattern, context);

      // Select recommended micro-patterns based on user priorities
      const recommendedMicroPatterns = [];
      if (requirements.needsMenMajlis) {
        recommendedMicroPatterns.push('PAT-MICRO-MEN-MAJLIS');
      }
      if (requirements.needsWomenMajlis) {
        recommendedMicroPatterns.push('PAT-MICRO-WOMEN-MAJLIS');
      }
      if (requirements.needsMotherSuite || requirements.needsElderlySuite) {
        recommendedMicroPatterns.push('PAT-MICRO-MOTHER-SUITE');
      }
      if (requirements.highPrivacy || requirements.privacyLevel === 'HIGH') {
        recommendedMicroPatterns.push('PAT-MICRO-PRIVACY-VESTIBULE');
      }
      if (requirements.needsDualKitchen || requirements.needsDirtyKitchen) {
        recommendedMicroPatterns.push('PAT-MICRO-KITCHEN-SERVICE');
      }
      if (requirements.needsSharedDining) {
        recommendedMicroPatterns.push('PAT-MICRO-DINING-CONNECTION');
      }
      recommendedMicroPatterns.push('PAT-MICRO-WET-CORE');

      // Reason for retrieval synthesis
      let reasonForRetrieval = `High morphological alignment with plot geometry (${evaluation.dimensionalScores.aspectRatioScore * 100}% aspect match) and program requirements.`;
      if (evaluation.compositeScore >= 0.90) {
        reasonForRetrieval = `Optimal match: excels in spatial zoning, aspect ratio harmony, and client privacy constraints.`;
      } else if (conflicts.length > 0) {
        reasonForRetrieval = `Retrieved as secondary alternative; exhibits potential conflicts requiring architectural negotiation.`;
      }

      scoredCandidates.push({
        patternId: pattern.patternId,
        name: pattern.name,
        category: pattern.category,
        matchScore: evaluation.compositeScore,
        dimensionalScores: evaluation.dimensionalScores,
        matchedConditions: evaluation.matchedConditions,
        unmatchedConditions: evaluation.unmatchedConditions,
        conflicts: [...evaluation.conflicts, ...conflicts.map(c => c.description)],
        conflictObjects: conflicts,
        advantages: pattern.advantages,
        tradeoffs: pattern.tradeoffs,
        confidence: pattern.confidence,
        reasonForRetrieval,
        recommendedMicroPatterns,
        tags: pattern.tags,
        circulationStrategy: pattern.circulationStrategy,
        privacyStrategy: pattern.privacyStrategy,
        serviceStrategy: pattern.serviceStrategy,
        entranceStrategies: pattern.entranceStrategies,
        aspectRatioRange: pattern.aspectRatioRange,
        zones: pattern.zones
      });
    }

    // Sort strictly descending by matchScore
    scoredCandidates.sort((a, b) => b.matchScore - a.matchScore);
    return scoredCandidates;
  }
}
