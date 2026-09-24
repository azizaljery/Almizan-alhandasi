/**
 * @file diversity-evaluator.js
 * @description Rigorous evaluation of architectural concept diversity across 7 orthogonal dimensions.
 * Rejects candidates that are merely cosmetic variants of the same spatial archetype.
 * Integrated with ConfigurationRegistry.
 */

import { DEFAULT_CONFIG } from '../config/configuration-registry.js';

export const DIVERSITY_MIN_THRESHOLD = DEFAULT_CONFIG.get('DIVERSITY_MIN_THRESHOLD') || 0.42;

export class ConceptDiversityEvaluator {
  /**
   * Evaluates pairwise diversity across concepts.
   * @param {Array<object>} concepts - Array of evaluated pattern candidate objects
   * @param {number} [threshold]
   * @param {object} [config=DEFAULT_CONFIG]
   * @returns {{
   *   isDiverseEnough: boolean,
   *   overallDiversityScore: number,
   *   pairwiseDistanceMatrix: Array<object>,
   *   redundantPairs: Array<string>,
   *   evaluationNotes: Array<string>
   * }}
   */
  static evaluate(concepts, threshold = null, config = DEFAULT_CONFIG) {
    const effectiveThreshold = threshold !== null && threshold !== undefined 
      ? threshold 
      : config.get('DIVERSITY_MIN_THRESHOLD');

    if (!concepts || concepts.length < 2) {
      return {
        isDiverseEnough: true,
        overallDiversityScore: 1.0,
        pairwiseDistanceMatrix: [],
        redundantPairs: [],
        evaluationNotes: ['Single concept provided; diversity evaluation not applicable.']
      };
    }

    const pairwiseDistanceMatrix = [];
    const redundantPairs = [];
    let totalDistanceSum = 0;
    let comparisonCount = 0;

    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const cA = concepts[i];
        const cB = concepts[j];
        const distanceReport = this.computePairwiseDistance(cA, cB, config);

        totalDistanceSum += distanceReport.totalDistance;
        comparisonCount++;

        pairwiseDistanceMatrix.push({
          conceptA: cA.patternId || cA.name,
          conceptB: cB.patternId || cB.name,
          distance: distanceReport.totalDistance,
          dimensionalDistances: distanceReport.dimensions
        });

        if (distanceReport.totalDistance < effectiveThreshold) {
          redundantPairs.push(`${cA.patternId || cA.name} <-> ${cB.patternId || cB.name} (distance: ${distanceReport.totalDistance.toFixed(2)})`);
        }
      }
    }

    const overallDiversityScore = comparisonCount > 0 
      ? Number((totalDistanceSum / comparisonCount).toFixed(3)) 
      : 1.0;

    const isDiverseEnough = redundantPairs.length === 0 && overallDiversityScore >= effectiveThreshold;
    const evaluationNotes = [];

    if (!isDiverseEnough) {
      evaluationNotes.push(
        `DIVERSITY_REJECTION: Candidate concepts exhibit insufficient architectural divergence (Score: ${overallDiversityScore} < Threshold: ${effectiveThreshold}). Redundant pairs detected: ${redundantPairs.join('; ')}`
      );
    } else {
      evaluationNotes.push(
        `DIVERSITY_VERIFIED: Candidate set provides genuinely distinct architectural concepts across zoning, circulation, and morphological strategies (Score: ${overallDiversityScore}).`
      );
    }

    return {
      isDiverseEnough,
      overallDiversityScore,
      pairwiseDistanceMatrix,
      redundantPairs,
      evaluationNotes
    };
  }

  /**
   * Computes multi-dimensional distance between two concepts.
   */
  static computePairwiseDistance(cA, cB, config = DEFAULT_CONFIG) {
    // 1. Zoning / Typology Family Distance
    const familyA = (cA.patternId || '').split('-')[2] || cA.name;
    const familyB = (cB.patternId || '').split('-')[2] || cB.name;
    const zoningDistance = familyA === familyB ? 0.1 : 1.0;

    // 2. Circulation Strategy Distance
    const circA = cA.circulationStrategy || '';
    const circB = cB.circulationStrategy || '';
    const circulationDistance = circA === circB ? 0.0 : (circA && circB ? 0.8 : 0.5);

    // 3. Entrance Strategy Distance
    const entA = JSON.stringify(cA.entranceStrategies || []);
    const entB = JSON.stringify(cB.entranceStrategies || []);
    const entranceDistance = entA === entB ? 0.0 : 0.85;

    // 4. Geometry & Aspect Ratio Target Distance
    const aspA = cA.aspectRatioRange || [1, 1];
    const aspB = cB.aspectRatioRange || [1, 1];
    const aspectDelta = Math.abs(aspA[0] - aspB[0]) + Math.abs(aspA[1] - aspB[1]);
    const geometryDistance = Math.min(1.0, aspectDelta);

    // 5. Privacy Mechanism Distance
    const privA = cA.privacyStrategy || '';
    const privB = cB.privacyStrategy || '';
    const privacyDistance = privA === privB ? 0.0 : 0.9;

    // 6. Service Strategy Distance
    const servA = cA.serviceStrategy || '';
    const servB = cB.serviceStrategy || '';
    const serviceDistance = servA === servB ? 0.0 : 0.75;

    // 7. Graph Topology Distance
    const tagsA = new Set(cA.tags || []);
    const tagsB = new Set(cB.tags || []);
    const intersection = new Set([...tagsA].filter(x => tagsB.has(x)));
    const union = new Set([...tagsA, ...tagsB]);
    const jaccardSimilarity = union.size > 0 ? (intersection.size / union.size) : 1.0;
    const graphTopologyDistance = 1.0 - jaccardSimilarity;

    const weights = config.get('DIVERSITY_WEIGHTS') || {
      zoning: 0.28,
      circulation: 0.18,
      entrance: 0.14,
      geometry: 0.12,
      privacy: 0.12,
      service: 0.08,
      topology: 0.08
    };

    const totalDistance = 
      (zoningDistance * weights.zoning) +
      (circulationDistance * weights.circulation) +
      (entranceDistance * weights.entrance) +
      (geometryDistance * weights.geometry) +
      (privacyDistance * weights.privacy) +
      (serviceDistance * weights.service) +
      (graphTopologyDistance * weights.topology);

    return {
      totalDistance: Number(totalDistance.toFixed(3)),
      dimensions: {
        zoningDistance,
        circulationDistance,
        entranceDistance,
        geometryDistance,
        privacyDistance,
        serviceDistance,
        graphTopologyDistance
      }
    };
  }
}
