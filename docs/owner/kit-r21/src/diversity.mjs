/** Architectural comparison; preserve the frozen r19 criterion in production. This module is a pre-filter only. */
import { doorGraph } from './constraints.mjs';
const normalize = s => String(s ?? '').trim().toLowerCase();
function roomLabel(r) { return `${normalize(r.type)}:${normalize(r.zone)}`; }
function sortedMultiset(values) { return values.slice().sort().join('|'); }
function groupZoneSignature(plan) {
  const counts = new Map();
  for (const room of plan.rooms ?? []) {
    const key = `${roomLabel(room)}:floor${room.floor ?? 0}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return sortedMultiset([...counts].map(([k,v]) => `${k}=${v}`));
}
function edgeSignature(plan) {
  const rooms = new Map((plan.rooms ?? []).map(r => [r.id, r]));
  const { graph } = doorGraph(plan);
  const edges = [];
  for (const [a, neighbors] of graph) for (const b of neighbors) {
    if (a >= b) continue;
    const ra = rooms.get(a), rb = rooms.get(b);
    edges.push(sortedMultiset([roomLabel(ra), roomLabel(rb)]));
  }
  return sortedMultiset(edges);
}
function routeSignature(plan) {
  const rooms = new Map((plan.rooms ?? []).map(r => [r.id, r]));
  const { graph } = doorGraph(plan);
  const starts = (plan.rooms ?? []).filter(r => r.type === 'majlis');
  const targets = new Set((plan.rooms ?? []).filter(r => r.type === 'dining').map(r => r.id));
  const signatures = [];
  for (const start of starts) {
    const queue = [{ id: start.id, zones: [start.zone] }], seen = new Set([start.id]);
    let found = null;
    while (queue.length) {
      const { id, zones } = queue.shift();
      if (targets.has(id)) { found = zones.join('>'); break; }
      for (const n of graph.get(id) ?? []) if (!seen.has(n)) {
        seen.add(n); queue.push({ id: n, zones: [...zones, rooms.get(n).zone] });
      }
    }
    signatures.push(found ?? 'DISCONNECTED');
  }
  return sortedMultiset(signatures);
}
export function architecturalFeatures(plan) {
  return { zones: groupZoneSignature(plan), doorRelations: edgeSignature(plan), guestRoute: routeSignature(plan),
    serviceRelations: sortedMultiset((plan.rooms ?? []).filter(r => r.zone === 'service').map(roomLabel)) };
}
/** 0 identical; 1 entirely different across 4 axes. Mirror/rotation have same signature. */
export function preliminaryDistance(a, b) {
  const A = architecturalFeatures(a), B = architecturalFeatures(b);
  return Object.keys(A).filter(k => A[k] !== B[k]).length / Object.keys(A).length;
}
export function selectDiverse(candidates, count, { frozenDifferent, minScore = -Infinity } = {}) {
  if (typeof frozenDifferent !== 'function') throw new Error('Use frozen r19 architectural comparator');
  const ordered = candidates.filter(c => c.valid && c.score >= minScore).slice()
    .sort((a,b) => b.score - a.score || String(a.plan.id).localeCompare(String(b.plan.id)));
  const selected = [];
  for (const candidate of ordered) {
    if (selected.every(x => frozenDifferent(x.plan, candidate.plan) === true)) selected.push(candidate);
    if (selected.length === count) break;
  }
  return selected;
}
/** Topology diversity heuristic only; never overrides frozen criterion. */
export function diversifyTopologies(topologies, limit, fingerprint) {
  const seen = new Set(), result = [];
  for (const item of topologies) {
    const key = fingerprint(item);
    if (seen.has(key)) continue;
    seen.add(key); result.push(item);
    if (result.length === limit) break;
  }
  return result;
}
