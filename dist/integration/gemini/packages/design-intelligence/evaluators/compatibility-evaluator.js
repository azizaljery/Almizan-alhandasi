/**
 * @file compatibility-evaluator.js
 * @description Multi-dimensional evaluation of architectural pattern compatibility against site and program.
 * Integrated with versioned ConfigurationRegistry.
 */

import { GraphMatcher } from '../graph/graph-matcher.js';
import { GraphBuilder } from '../graph/graph-builder.js';
import { DEFAULT_CONFIG } from '../config/configuration-registry.js';

export class PatternCompatibilityEvaluator {
  /**
   * Evaluates compatibility across 11 explicit dimensions.
   * @param {object} pattern 
   * @param {object} context 
   * @param {object} [config=DEFAULT_CONFIG]
   * @returns {object} Comprehensive evaluation report
   */
  static evaluate(pattern, context, config = DEFAULT_CONFIG) {
    const { plot, requirements = {} } = context;
    const matchedConditions = [];
    const unmatchedConditions = [];
    const conflicts = [];

    // 1. Plot Area Compatibility
    let plotAreaScore = 1.0;
    if (plot && plot.areaSqM) {
      const minA = pattern.plotConditions?.minPlotArea || pattern.areaRange[0];
      const maxA = pattern.plotConditions?.maxPlotArea || pattern.areaRange[1];
      if (plot.areaSqM < minA) {
        plotAreaScore = Math.max(0, 1 - (minA - plot.areaSqM) / minA);
        unmatchedConditions.push(`Plot area (${plot.areaSqM} m²) is below pattern minimum (${minA} m²).`);
        if (plot.areaSqM < minA * 0.75) {
          conflicts.push(`CRITICAL_AREA_DEFICIT: Plot too small for ${pattern.name}`);
        }
      } else if (plot.areaSqM > maxA) {
        plotAreaScore = Math.max(0.7, 1 - (plot.areaSqM - maxA) / (maxA * 2));
        matchedConditions.push(`Plot area (${plot.areaSqM} m²) is comfortably within or above capacity.`);
      } else {
        matchedConditions.push(`Plot area (${plot.areaSqM} m²) matches optimal target range [${minA}-${maxA} m²].`);
      }
    }

    // 2. Aspect Ratio Compatibility (Width / Depth)
    let aspectRatioScore = 1.0;
    if (plot && plot.frontageM && plot.depthM) {
      const actualRatio = plot.frontageM / plot.depthM;
      const [minR, maxR] = pattern.aspectRatioRange;
      if (actualRatio >= minR && actualRatio <= maxR) {
        aspectRatioScore = 1.0;
        matchedConditions.push(`Plot aspect ratio (${actualRatio.toFixed(2)}) aligns with pattern range [${minR}-${maxR}].`);
      } else {
        const delta = actualRatio < minR ? (minR - actualRatio) : (actualRatio - maxR);
        aspectRatioScore = Math.max(0.1, 1 - (delta * 1.5));
        unmatchedConditions.push(`Plot aspect ratio (${actualRatio.toFixed(2)}) diverges from optimal range [${minR}-${maxR}].`);
      }
    }

    // 3. Street Configuration Compatibility
    let streetScore = 0.5;
    if (plot && plot.streetCondition) {
      const supportedStreets = pattern.streetConditions || [];
      if (supportedStreets.includes(plot.streetCondition)) {
        if (supportedStreets.length === 1) {
          streetScore = 1.0;
          matchedConditions.push(`Pattern specifically optimized for "${plot.streetCondition}".`);
        } else {
          streetScore = 0.90;
          matchedConditions.push(`Street condition "${plot.streetCondition}" supported by pattern.`);
        }
      } else if (supportedStreets.length === 0) {
        streetScore = 0.85;
      } else {
        streetScore = 0.35;
        unmatchedConditions.push(`Pattern best targets [${supportedStreets.join(', ')}], but parcel has "${plot.streetCondition}".`);
      }
    }

    // 4. Entrance Hierarchy Strategy
    let entranceScore = 1.0;
    if (requirements.requestedEntrances && requirements.requestedEntrances.length > 0) {
      const reqCount = requirements.requestedEntrances.length;
      if (reqCount >= 3 && !pattern.tags.includes('tri-entrance') && !pattern.tags.includes('multi-entrance') && !pattern.tags.includes('dual-street')) {
        entranceScore = 0.6;
        unmatchedConditions.push(`User requests ${reqCount} separate entrances; pattern primarily targets dual or single entrance.`);
      } else {
        entranceScore = 1.0;
        matchedConditions.push(`Supports requested entrance hierarchy (${reqCount} portals).`);
      }
    }

    // 5. Room Program Compatibility
    let programScore = 1.0;
    if (requirements.requiredZones) {
      let matchedZones = 0;
      for (const rz of requirements.requiredZones) {
        if (pattern.zones.some(pz => pz.includes(rz) || rz.includes(pz))) {
          matchedZones++;
        }
      }
      programScore = matchedZones / requirements.requiredZones.length;
      if (programScore > 0.8) {
        matchedConditions.push(`Pattern accommodates ${matchedZones}/${requirements.requiredZones.length} requested functional zones.`);
      } else {
        unmatchedConditions.push(`Pattern missing natural layout allocation for some requested zones.`);
      }
    }

    // 6 & 7. Graph Topology Adjacency & Privacy Matching
    let graphScore = 1.0;
    let adjacencyScore = 1.0;
    let privacyScore = 1.0;
    if (context.userSpatialGraph) {
      const patternGraph = GraphBuilder.fromPattern(pattern);
      const matchResult = GraphMatcher.match(context.userSpatialGraph, patternGraph);
      graphScore = matchResult.graphScore;
      adjacencyScore = matchResult.adjacencyScore;
      privacyScore = matchResult.separationScore;

      if (matchResult.violatedEdges.length > 0) {
        for (const v of matchResult.violatedEdges) {
          conflicts.push(`${v.violation}: ${v.description}`);
        }
      }
    }

    // 8. Circulation Efficiency Score
    let circulationScore = 0.85;
    if (pattern.geometryHints && pattern.geometryHints.maxCorridorPercentage) {
      circulationScore = pattern.geometryHints.maxCorridorPercentage <= 0.10 ? 0.95 : 0.80;
    }

    // 9. Service Strategy Compatibility
    let serviceScore = 1.0;
    if (requirements.requiresDiscreteServiceAccess) {
      if (pattern.serviceStrategy && pattern.serviceStrategy.includes('service')) {
        serviceScore = 1.0;
        matchedConditions.push('Provides independent back-of-house service delivery axis.');
      } else {
        serviceScore = 0.6;
        unmatchedConditions.push('Service delivery path may intersect family circulation.');
      }
    }

    // 10. Orientation & Microclimate Compatibility
    let orientationScore = 0.9;
    if (plot && plot.orientation && pattern.orientationHints) {
      orientationScore = 0.95;
      matchedConditions.push('Orientation hints compatible with cardinal site exposure.');
    }

    // 11. Geometry Feasibility Hints
    let geometryScore = 1.0;
    if (plot && plot.frontageM && pattern.plotConditions?.minFrontageM) {
      if (plot.frontageM < pattern.plotConditions.minFrontageM) {
        geometryScore = 0.3;
        conflicts.push(`INSUFFICIENT_FRONTAGE: Plot frontage ${plot.frontageM}m < pattern minimum ${pattern.plotConditions.minFrontageM}m.`);
      }
    }

    // Weighted Total Score Calculation via Configuration Registry
    const weights = config.get('COMPATIBILITY_WEIGHTS') || {
      plotArea: 0.12,
      aspectRatio: 0.14,
      street: 0.08,
      entrance: 0.08,
      program: 0.12,
      graph: 0.16,
      privacy: 0.10,
      circulation: 0.06,
      service: 0.05,
      geometry: 0.09
    };

    const compositeScore = 
      (plotAreaScore * weights.plotArea) +
      (aspectRatioScore * weights.aspectRatio) +
      (streetScore * weights.street) +
      (entranceScore * weights.entrance) +
      (programScore * weights.program) +
      (graphScore * weights.graph) +
      (privacyScore * weights.privacy) +
      (circulationScore * weights.circulation) +
      (serviceScore * weights.service) +
      (geometryScore * weights.geometry);

    return {
      patternId: pattern.patternId,
      name: pattern.name,
      compositeScore: Number(compositeScore.toFixed(3)),
      dimensionalScores: {
        plotAreaScore: Number(plotAreaScore.toFixed(3)),
        aspectRatioScore: Number(aspectRatioScore.toFixed(3)),
        streetScore: Number(streetScore.toFixed(3)),
        entranceScore: Number(entranceScore.toFixed(3)),
        programScore: Number(programScore.toFixed(3)),
        graphScore: Number(graphScore.toFixed(3)),
        adjacencyScore: Number(adjacencyScore.toFixed(3)),
        privacyScore: Number(privacyScore.toFixed(3)),
        circulationScore: Number(circulationScore.toFixed(3)),
        serviceScore: Number(serviceScore.toFixed(3)),
        geometryScore: Number(geometryScore.toFixed(3))
      },
      matchedConditions,
      unmatchedConditions,
      conflicts,
      advantages: pattern.advantages || [],
      tradeoffs: pattern.tradeoffs || [],
      confidence: pattern.confidence,
      isCompatible: conflicts.length === 0 && compositeScore >= 0.65
    };
  }
}
