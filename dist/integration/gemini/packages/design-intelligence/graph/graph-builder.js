/**
 * @file graph-builder.js
 * @description Constructs standardized SpatialGraph models from user requirements and pattern specifications.
 */

import { SpatialGraph, EdgeType, NodeType, PrivacyLevel } from '../contracts/graph.contract.js';

export class GraphBuilder {
  /**
   * Builds a spatial graph from explicit user requirements.
   * @param {object} requirements 
   * @returns {SpatialGraph}
   */
  static fromUserRequirements(requirements) {
    const graph = new SpatialGraph();

    // 1. Add Entrances
    if (requirements.entrances) {
      for (const ent of requirements.entrances) {
        graph.addNode({
          id: ent.id || `ENT_${ent.type}`,
          label: ent.name || ent.type,
          type: NodeType.ENTRANCE,
          privacyLevel: ent.type === 'GUEST' ? PrivacyLevel.PUBLIC : PrivacyLevel.PRIVATE
        });
      }
    }

    // 2. Add Spaces & Zones
    if (requirements.spaces) {
      for (const sp of requirements.spaces) {
        graph.addNode({
          id: sp.id,
          label: sp.name || sp.id,
          type: NodeType.SPACE,
          privacyLevel: sp.privacyLevel || PrivacyLevel.PRIVATE,
          zone: sp.zone
        });
      }
    }

    // 3. Add Connections / Adjacencies
    if (requirements.requiredAdjacencies) {
      for (const [src, tgt] of requirements.requiredAdjacencies) {
        graph.addEdge(src, tgt, EdgeType.MUST_CONNECT);
      }
    }

    if (requirements.preferredAdjacencies) {
      for (const [src, tgt] of requirements.preferredAdjacencies) {
        graph.addEdge(src, tgt, EdgeType.SHOULD_CONNECT);
      }
    }

    if (requirements.forbiddenAdjacencies) {
      for (const [src, tgt] of requirements.forbiddenAdjacencies) {
        graph.addEdge(src, tgt, EdgeType.MUST_SEPARATE);
      }
    }

    if (requirements.visualPrivacyConstraints) {
      for (const [src, tgt] of requirements.visualPrivacyConstraints) {
        graph.addEdge(src, tgt, EdgeType.VISUAL_PRIVACY);
      }
    }

    return graph;
  }

  /**
   * Converts a Pattern's declared topology into a SpatialGraph.
   * @param {object} pattern 
   * @returns {SpatialGraph}
   */
  static fromPattern(pattern) {
    if (pattern.spatialGraph instanceof SpatialGraph) {
      return pattern.spatialGraph;
    }
    if (pattern.spatialGraph && Array.isArray(pattern.spatialGraph.nodes)) {
      return SpatialGraph.fromJSON(pattern.spatialGraph);
    }

    const graph = new SpatialGraph();

    for (const zone of (pattern.zones || [])) {
      graph.addNode({ id: zone, label: zone, type: NodeType.ZONE });
    }

    for (const [src, tgt] of (pattern.requiredAdjacencies || [])) {
      graph.addEdge(src, tgt, EdgeType.MUST_CONNECT);
    }

    for (const [src, tgt] of (pattern.preferredAdjacencies || [])) {
      graph.addEdge(src, tgt, EdgeType.SHOULD_CONNECT);
    }

    for (const [src, tgt] of (pattern.forbiddenAdjacencies || [])) {
      graph.addEdge(src, tgt, EdgeType.MUST_SEPARATE);
    }

    return graph;
  }
}
