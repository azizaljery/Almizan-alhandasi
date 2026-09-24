/**
 * @file conflict-evaluator.js
 * @description Identifies conflicts and enforces strict precedence rules:
 * USER HARD REQUIREMENT (100) > VERIFIED GEOMETRY (90) > VERIFIED REGULATORY RULE (80) > REFERENCE PATTERN (50) > HEURISTIC (30).
 */

import { PatternConflict, ConflictPrecedence } from '../contracts/aziz-integration.contract.js';
import { KnowledgePrecedenceLevel, KnowledgePrecedenceResolver } from '../contracts/knowledge-taxonomy.contract.js';

export class KnowledgeConflictDetector {
  /**
   * Evaluates pattern against external hard boundaries with formal precedence arbitration.
   * @param {object} pattern 
   * @param {object} context 
   * @returns {Array<PatternConflict>}
   */
  static detectConflicts(pattern, context) {
    const conflicts = [];
    const { plot, requirements = {}, externalEngineFeedbacks = {} } = context;

    // 1. Conflict with VERIFIED GEOMETRY (Level 90 vs Pattern Level 50)
    // Physical reality strictly outranks reference archetype.
    if (plot && plot.frontageM && pattern.plotConditions?.minFrontageM) {
      if (plot.frontageM < pattern.plotConditions.minFrontageM) {
        conflicts.push(new PatternConflict({
          patternId: pattern.patternId,
          conflictingDomain: 'GEOMETRY',
          conflictType: 'GEOMETRY_IMPOSSIBILITY',
          description: `Pattern "${pattern.name}" requires minimum frontage of ${pattern.plotConditions.minFrontageM}m, but parcel frontage is physically only ${plot.frontageM}m.`,
          precedenceVerdict: ConflictPrecedence.PATTERN_SURRENDERS,
          mitigationRecommendation: 'Switch to Narrow-Deep or Compact Linear Villa pattern.',
          precedenceAudit: {
            dominantLevel: KnowledgePrecedenceLevel.VERIFIED_GEOMETRY,
            subordinateLevel: KnowledgePrecedenceLevel.REFERENCE_PATTERN,
            verdict: 'GEOMETRY_PREVAILS'
          }
        }));
      }
    }

    // 2. Conflict with VERIFIED REGULATORY RULE (Level 80 vs Pattern Level 50)
    // Statutory building code / zoning setback strictly outranks reference archetype.
    if (requirements.prohibitZeroLotLine && pattern.tags.includes('zero-lot-line')) {
      conflicts.push(new PatternConflict({
        patternId: pattern.patternId,
        conflictingDomain: 'REGULATORY',
        conflictType: 'STATUTORY_CODE_VIOLATION',
        description: `Local municipal zoning mandates 2.0m lateral setbacks; pattern "${pattern.name}" relies on zero-lot-line party wall construction.`,
        precedenceVerdict: ConflictPrecedence.PATTERN_SURRENDERS,
        mitigationRecommendation: 'Apply setback offsets or choose freestanding villa typology.',
        precedenceAudit: {
          dominantLevel: KnowledgePrecedenceLevel.VERIFIED_REGULATORY_RULE,
          subordinateLevel: KnowledgePrecedenceLevel.REFERENCE_PATTERN,
          verdict: 'REGULATION_PREVAILS'
        }
      }));
    }

    // 3. Conflict with USER HARD REQUIREMENT (Level 100 vs Pattern Level 50)
    // Explicit user constraint strictly outranks reference pattern defaults.
    if (requirements.mustIsolateMajlisAcoustically && pattern.tags.includes('open-concept')) {
      conflicts.push(new PatternConflict({
        patternId: pattern.patternId,
        conflictingDomain: 'USER',
        conflictType: 'PRIVACY_COMPROMISE',
        description: `Client explicitly mandates hermetic acoustic isolation for Majlis; pattern "${pattern.name}" proposes open-plan flowing reception halls.`,
        precedenceVerdict: ConflictPrecedence.PATTERN_SURRENDERS,
        mitigationRecommendation: 'Add acoustic sound-lock vestibule or switch to Three-Zone Tripartite Villa.',
        precedenceAudit: {
          dominantLevel: KnowledgePrecedenceLevel.USER_HARD_REQUIREMENT,
          subordinateLevel: KnowledgePrecedenceLevel.REFERENCE_PATTERN,
          verdict: 'USER_MANDATE_PREVAILS'
        }
      }));
    }

    // 4. Feedback from Architectural Analysis Engine
    if (externalEngineFeedbacks.architecturalPrivacyFailure && pattern.category === 'MACRO_LAYOUT') {
      conflicts.push(new PatternConflict({
        patternId: pattern.patternId,
        conflictingDomain: 'ARCHITECTURAL',
        conflictType: 'PRIVACY_COMPROMISE',
        description: `Architectural analysis engine flags that neighbor upper windows directly overlook this pattern's proposed open terrace.`,
        precedenceVerdict: ConflictPrecedence.ADVISORY_NEGOTIATION,
        mitigationRecommendation: 'Incorporate courtyard inward-facing fenestration or overhead architectural louver screens.',
        precedenceAudit: {
          dominantLevel: KnowledgePrecedenceLevel.VERIFIED_GEOMETRY,
          subordinateLevel: KnowledgePrecedenceLevel.REFERENCE_PATTERN,
          verdict: 'NEGOTIATION_REQUIRED'
        }
      }));
    }

    return conflicts;
  }
}
