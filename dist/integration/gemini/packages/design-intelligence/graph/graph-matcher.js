/**
 * @file graph-matcher.js
 * @description Compares user spatial requirement graphs with architectural pattern graphs.
 */

import { EdgeType } from '../contracts/graph.contract.js';

export class GraphMatcher {
  /**
   * Evaluates topological compatibility between user requirement graph and pattern graph.
   * @param {SpatialGraph} userGraph 
   * @param {SpatialGraph} patternGraph 
   * @returns {{
   *   graphScore: number,
   *   matchedEdges: Array<object>,
   *   violatedEdges: Array<object>,
   *   adjacencyScore: number,
   *   separationScore: number
   * }}
   */
  static match(userGraph, patternGraph) {
    const matchedEdges = [];
    const violatedEdges = [];

    const patternEdgeMap = new Map();
    for (const edge of patternGraph.edges) {
      const key1 = `${edge.source}__${edge.target}`;
      const key2 = `${edge.target}__${edge.source}`;
      patternEdgeMap.set(key1, edge);
      if (edge.bidirectional) patternEdgeMap.set(key2, edge);
    }

    let requiredConnections = 0;
    let satisfiedConnections = 0;
    let requiredSeparations = 0;
    let satisfiedSeparations = 0;

    for (const reqEdge of userGraph.edges) {
      const key = `${reqEdge.source}__${reqEdge.target}`;
      const patternEdge = patternEdgeMap.get(key);

      if (reqEdge.edgeType === EdgeType.MUST_CONNECT) {
        requiredConnections++;
        if (patternEdge && (patternEdge.edgeType === EdgeType.MUST_CONNECT || patternEdge.edgeType === EdgeType.DIRECT_ACCESS || patternEdge.edgeType === EdgeType.SHOULD_CONNECT)) {
          satisfiedConnections++;
          matchedEdges.push({ edge: reqEdge, status: 'SATISFIED' });
        } else if (patternEdge && (patternEdge.edgeType === EdgeType.MUST_SEPARATE || patternEdge.edgeType === EdgeType.VISUAL_PRIVACY)) {
          violatedEdges.push({ edge: reqEdge, violation: 'HARD_SEPARATION_CONFLICT', description: `User requires direct connection between ${reqEdge.source} and ${reqEdge.target}, but pattern isolates them.` });
        } else {
          // Indirect or neutral connection
          satisfiedConnections += 0.5;
          matchedEdges.push({ edge: reqEdge, status: 'PARTIAL' });
        }
      } else if (reqEdge.edgeType === EdgeType.MUST_SEPARATE || reqEdge.edgeType === EdgeType.VISUAL_PRIVACY) {
        requiredSeparations++;
        if (patternEdge && (patternEdge.edgeType === EdgeType.MUST_CONNECT || patternEdge.edgeType === EdgeType.DIRECT_ACCESS)) {
          violatedEdges.push({ edge: reqEdge, violation: 'PRIVACY_LEAK', description: `User requires strict separation/privacy between ${reqEdge.source} and ${reqEdge.target}, but pattern connects them directly.` });
        } else {
          satisfiedSeparations++;
          matchedEdges.push({ edge: reqEdge, status: 'SATISFIED' });
        }
      }
    }

    const adjacencyScore = requiredConnections > 0 ? (satisfiedConnections / requiredConnections) : 1.0;
    const separationScore = requiredSeparations > 0 ? (satisfiedSeparations / requiredSeparations) : 1.0;

    // Hard penalty if any forbidden separation is violated
    const hasCriticalViolation = violatedEdges.some(v => v.violation === 'PRIVACY_LEAK' || v.violation === 'HARD_SEPARATION_CONFLICT');
    let graphScore = (adjacencyScore * 0.5) + (separationScore * 0.5);
    if (hasCriticalViolation) {
      graphScore = Math.min(graphScore, 0.35);
    }

    return {
      graphScore: Number(graphScore.toFixed(3)),
      adjacencyScore: Number(adjacencyScore.toFixed(3)),
      separationScore: Number(separationScore.toFixed(3)),
      matchedEdges,
      violatedEdges
    };
  }
}
