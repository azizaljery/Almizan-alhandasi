/**
 * @file hybrid-retrieval-engine.js
 * @description Orchestrates deterministic filtering, multi-dimensional scoring,
 * and diversity evaluation to produce top-K architectural reference concepts.
 */

import { DeterministicFilter } from './deterministic-filter.js';
import { ScoringEngine } from './scoring-engine.js';
import { ConceptDiversityEvaluator } from '../evaluators/diversity-evaluator.js';
import { DesignIntelligenceResult } from '../contracts/aziz-integration.contract.js';

// This module is imported transitively by the browser bundle (app.mjs -> multi-engine.mjs ->
// integration/pipeline.mjs -> mizan-review-v1.js -> DesignIntelligenceEngine), and
// HybridRetrievalEngine.retrieve() runs live in the browser during design generation. A static
// `import crypto from 'node:crypto'` fails to resolve in the browser and aborts the entire ES
// module graph before any click handlers are bound. Use Node's SHA-256 when available and fall
// back to a deterministic, non-cryptographic fingerprint (audit tracking only, never a security
// hash) so the browser bundle keeps working without a Node-only builtin.
const nodeCrypto = (typeof process !== 'undefined' && process.versions?.node)
  ? await import('node:crypto')
  : null;
function fnv1a(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
function fallbackFingerprint(text) {
  return [0x811c9dc5, 0x9e3779b9].map(seed => fnv1a(text, seed).toString(16).padStart(8, '0')).join('');
}

export class HybridRetrievalEngine {
  /**
   * Retrieves top-K diverse candidates.
   * @param {Array<object>} patternLibrary 
   * @param {object} context 
   * @param {number} [topK=3]
   * @returns {DesignIntelligenceResult}
   */
  static retrieve(patternLibrary, context, topK = 3) {
    const startTime = Date.now();
    const warnings = [];
    const assumptions = [];
    const unresolved = [];

    // Deterministic context hash for audit tracking
    const canonicalContext = JSON.stringify(context);
    const deterministicHash = (nodeCrypto
      ? nodeCrypto.createHash('sha256').update(canonicalContext).digest('hex')
      : fallbackFingerprint(canonicalContext)).substring(0, 16);

    // 1. Deterministic Hard Filtering
    const { filteredPatterns, excludedRecords } = DeterministicFilter.filter(patternLibrary, context);

    if (filteredPatterns.length === 0) {
      warnings.push(`NO_SUITABLE_PATTERN: All ${patternLibrary.length} library patterns excluded by hard physical constraints.`);
      unresolved.push('Parcel dimensional parameters or extreme constraints exclude all standard macro typologies.');

      return new DesignIntelligenceResult({
        requestId: context.requestId || `REQ-${deterministicHash}`,
        retrievedPatterns: [],
        candidateStrategies: [],
        compatibilityScores: {},
        diversityAnalysis: {
          isDiverseEnough: false,
          overallDiversityScore: 0,
          pairwiseDistanceMatrix: [],
          notes: ['No candidates survived deterministic filtering.']
        },
        warnings,
        unresolved,
        confidence: 0.20,
        executionMetadata: {
          executionTimeMs: Date.now() - startTime,
          deterministicHash,
          evaluatedPatternCount: patternLibrary.length
        }
      });
    }

    // 2. Score and Rank
    const rankedCandidates = ScoringEngine.scoreAndRank(filteredPatterns, context);

    // 3. Select Top-K Candidates
    const topCandidates = rankedCandidates.slice(0, topK);

    // 4. Evaluate Diversity of Top Candidates
    const diversityAnalysis = ConceptDiversityEvaluator.evaluate(topCandidates);

    // 5. Gather All Detected Conflicts
    const allConflicts = [];
    for (const cand of topCandidates) {
      if (cand.conflictObjects && cand.conflictObjects.length > 0) {
        allConflicts.push(...cand.conflictObjects);
      }
    }

    if (!diversityAnalysis.isDiverseEnough && topCandidates.length >= 2) {
      warnings.push('DIVERSITY_WARNING: Top-scoring candidates exhibit low architectural variance. Consider evaluating alternative typologies.');
    }

    // Assumptions record
    if (!context.plot?.soilType) {
      assumptions.push('Assumed standard competent soil bearing capacity (200 kPa) in absence of geotechnical data.');
    }
    if (!context.requirements?.privacyLevel) {
      assumptions.push('Assumed standard contemporary Saudi family privacy thresholds.');
    }

    const compatibilityScores = {};
    for (const cand of topCandidates) {
      compatibilityScores[cand.patternId] = {
        compositeScore: cand.matchScore,
        dimensionalScores: cand.dimensionalScores
      };
    }

    return new DesignIntelligenceResult({
      requestId: context.requestId || `REQ-${deterministicHash}`,
      retrievedPatterns: topCandidates,
      candidateStrategies: topCandidates,
      compatibilityScores,
      diversityAnalysis,
      conflicts: allConflicts,
      warnings,
      assumptions,
      unresolved,
      confidence: topCandidates.length > 0 ? topCandidates[0].confidence : 0.5,
      executionMetadata: {
        executionTimeMs: Date.now() - startTime,
        deterministicHash,
        evaluatedPatternCount: patternLibrary.length
      }
    });
  }
}
