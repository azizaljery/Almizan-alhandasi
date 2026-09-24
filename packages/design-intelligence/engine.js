/**
 * @file engine.js
 * @description Main facade for @mizan/design-intelligence engine (v1.1.0-dev).
 */

import { MACRO_PATTERNS } from './library/macro-patterns.js';
import { MICRO_PATTERNS } from './library/micro-patterns.js';
import { SYNTHETIC_REFERENCE_CASES } from './library/reference-cases.js';
import { KNOWN_NEGATIVE_PATTERNS } from './library/negative-patterns.js';
import { PatternRegistry } from './library/pattern-registry.js';
import { HybridRetrievalEngine } from './retrieval/hybrid-retrieval-engine.js';
import { PatternCompatibilityEvaluator } from './evaluators/compatibility-evaluator.js';
import { ConceptDiversityEvaluator } from './evaluators/diversity-evaluator.js';
import { KnowledgeQualityEvaluator } from './evaluators/quality-evaluator.js';
import { ProductionKnowledgeGate } from './gates/production-knowledge-gate.js';
import { DEFAULT_CONFIG, ConfigurationRegistry } from './config/configuration-registry.js';
import { validatePattern } from './contracts/pattern.contract.js';

export class DesignIntelligenceEngine {
  constructor(options = {}) {
    this.config = options.config instanceof ConfigurationRegistry ? options.config : new ConfigurationRegistry(options.configOverrides || {});
    this.patternRegistry = new PatternRegistry();
    this.macroPatterns = options.macroPatterns ? [...options.macroPatterns] : [...MACRO_PATTERNS];
    this.microPatterns = options.microPatterns ? [...options.microPatterns] : [...MICRO_PATTERNS];
    this.referenceCases = options.referenceCases ? [...options.referenceCases] : [...SYNTHETIC_REFERENCE_CASES];
    this.negativePatterns = options.negativePatterns ? [...options.negativePatterns] : [...KNOWN_NEGATIVE_PATTERNS];
    this.acceptedFeedbacks = [];

    // Register initial patterns into indexed registry
    for (const p of this.macroPatterns) {
      this.patternRegistry.register(p, false);
    }
    for (const m of this.microPatterns) {
      this.patternRegistry.register(m, false);
    }
  }

  /**
   * Retrieves top-K reference design strategies for AZIZ engine.
   * @param {object} context - Site plot, requirements, and constraints
   * @param {number} [topK=3]
   * @returns {import('./contracts/aziz-integration.contract.js').DesignIntelligenceResult}
   */
  retrieveCandidates(context, topK = 3) {
    return HybridRetrievalEngine.retrieve(this.macroPatterns, context, topK);
  }

  /**
   * Detailed compatibility evaluation of a single pattern.
   */
  evaluatePattern(patternId, context) {
    const pattern = this.patternRegistry.get(patternId) ||
                    this.macroPatterns.find(p => p.patternId === patternId) ||
                    this.microPatterns.find(p => p.patternId === patternId);
    if (!pattern) {
      throw new Error(`Pattern "${patternId}" not found in Design Intelligence repository.`);
    }
    return PatternCompatibilityEvaluator.evaluate(pattern, context, this.config);
  }

  /**
   * Evaluates pairwise diversity of proposed concepts.
   */
  evaluateDiversity(concepts, threshold) {
    return ConceptDiversityEvaluator.evaluate(concepts, threshold, this.config);
  }

  /**
   * Audits the entire knowledge base for provenance, metadata, and quality.
   */
  auditQuality() {
    return KnowledgeQualityEvaluator.evaluateLibrary([...this.macroPatterns, ...this.microPatterns], this.config);
  }

  /**
   * Audits a candidate record against the Production Knowledge Gate.
   */
  verifyForProduction(item) {
    return ProductionKnowledgeGate.verifyForProduction(item);
  }

  /**
   * Registers a new pattern into the repository with strict schema validation.
   */
  registerPattern(pattern, { isProduction = false } = {}) {
    validatePattern(pattern);

    if (isProduction) {
      const gateResult = ProductionKnowledgeGate.verifyForProduction(pattern);
      if (!gateResult.allowed) {
        throw new Error(`Production Knowledge Gate rejected pattern: ${gateResult.rejectionReasons.join('; ')}`);
      }
    } else {
      const qualityAudit = KnowledgeQualityEvaluator.evaluateItem(pattern, this.macroPatterns, this.config);
      if (!qualityAudit.isValid) {
        throw new Error(`Pattern quality audit failed: ${qualityAudit.blockingIssues.join('; ')}`);
      }
    }

    this.macroPatterns.push(pattern);
    this.patternRegistry.register(pattern, false);
    return true;
  }

  /**
   * Records user feedback from an accepted or modified concept (versioned & auditable).
   */
  recordFeedback(feedback) {
    this.acceptedFeedbacks.push(feedback);
    return true;
  }

  /**
   * Records an anti-pattern or spatial failure mode into negative knowledge.
   */
  recordNegativeCase(rejectedCase) {
    this.negativePatterns.push(rejectedCase);
    return true;
  }
}
