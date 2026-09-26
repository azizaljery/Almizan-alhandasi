/**
 * @file graph.contract.js
 * @description Graph representation contracts for topological spatial relationships.
 */

export const EdgeType = {
  MUST_CONNECT: 'MUST_CONNECT',
  SHOULD_CONNECT: 'SHOULD_CONNECT',
  MAY_CONNECT: 'MAY_CONNECT',
  MUST_SEPARATE: 'MUST_SEPARATE',
  SHOULD_SEPARATE: 'SHOULD_SEPARATE',
  DIRECT_ACCESS: 'DIRECT_ACCESS',
  SERVICE_ACCESS: 'SERVICE_ACCESS',
  GUEST_ACCESS: 'GUEST_ACCESS',
  FAMILY_ACCESS: 'FAMILY_ACCESS',
  VISUAL_PRIVACY: 'VISUAL_PRIVACY'
};

export const NodeType = {
  SPACE: 'SPACE',
  ZONE: 'ZONE',
  ENTRANCE: 'ENTRANCE',
  SERVICE: 'SERVICE',
  OUTDOOR: 'OUTDOOR'
};

export const PrivacyLevel = {
  PUBLIC: 'PUBLIC',             // e.g. Men Majlis, Entrance foyer
  SEMI_PRIVATE: 'SEMI_PRIVATE', // e.g. Dining, Women Majlis, Family reception
  PRIVATE: 'PRIVATE',           // e.g. Family hall, Bedrooms, Mother suite
  SERVICE: 'SERVICE'            // e.g. Dirty kitchen, Maid room, Laundry, Mech
};

export class SpatialGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  addNode(node) {
    if (!node.id) throw new Error('Graph node must have an id');
    this.nodes.set(node.id, {
      type: NodeType.SPACE,
      privacyLevel: PrivacyLevel.PRIVATE,
      ...node
    });
    return this;
  }

  addEdge(source, target, edgeType, metadata = {}) {
    if (!this.nodes.has(source)) {
      this.addNode({ id: source, label: source });
    }
    if (!this.nodes.has(target)) {
      this.addNode({ id: target, label: target });
    }
    this.edges.push({
      source,
      target,
      edgeType,
      bidirectional: metadata.bidirectional !== false,
      metadata
    });
    return this;
  }

  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges
    };
  }

  static fromJSON(json) {
    const graph = new SpatialGraph();
    if (json && Array.isArray(json.nodes)) {
      for (const n of json.nodes) graph.addNode(n);
    }
    if (json && Array.isArray(json.edges)) {
      for (const e of json.edges) graph.addEdge(e.source, e.target, e.edgeType, e.metadata);
    }
    return graph;
  }
}
