import test from 'node:test';
import assert from 'node:assert';
import { SpatialGraph, EdgeType } from '../contracts/graph.contract.js';
import { GraphMatcher } from '../graph/graph-matcher.js';

test('Spatial Graph Matching: Accurately scores connection compliance and catches privacy leaks', () => {
  // User wants Guest Majlis separated from Family Living
  const userGraph = new SpatialGraph();
  userGraph.addNode({ id: 'GUEST_MAJLIS', label: 'Guest Majlis' });
  userGraph.addNode({ id: 'FAMILY_LIVING', label: 'Family Living' });
  userGraph.addNode({ id: 'DINING', label: 'Dining' });

  userGraph.addEdge('GUEST_MAJLIS', 'FAMILY_LIVING', EdgeType.MUST_SEPARATE);
  userGraph.addEdge('GUEST_MAJLIS', 'DINING', EdgeType.MUST_CONNECT);

  // Pattern 1: Compliant (Separates guest and family, connects dining)
  const patternGraphCompliant = new SpatialGraph();
  patternGraphCompliant.addEdge('GUEST_MAJLIS', 'FAMILY_LIVING', EdgeType.MUST_SEPARATE);
  patternGraphCompliant.addEdge('GUEST_MAJLIS', 'DINING', EdgeType.MUST_CONNECT);

  const resCompliant = GraphMatcher.match(userGraph, patternGraphCompliant);
  assert.strictEqual(resCompliant.graphScore, 1.0, 'Compliant pattern should score 1.0');
  assert.strictEqual(resCompliant.violatedEdges.length, 0);

  // Pattern 2: Defective (Directly connects guest majlis to family living -> Privacy leak!)
  const patternGraphLeaky = new SpatialGraph();
  patternGraphLeaky.addEdge('GUEST_MAJLIS', 'FAMILY_LIVING', EdgeType.MUST_CONNECT);
  patternGraphLeaky.addEdge('GUEST_MAJLIS', 'DINING', EdgeType.MUST_CONNECT);

  const resLeaky = GraphMatcher.match(userGraph, patternGraphLeaky);
  assert.ok(resLeaky.graphScore <= 0.35, 'Leaky pattern must be penalized heavily');
  assert.ok(resLeaky.violatedEdges.some(v => v.violation === 'PRIVACY_LEAK'), 'Must flag PRIVACY_LEAK');
});
