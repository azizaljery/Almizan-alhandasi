import { clearDimension, commonWall, realDoorConnects, overlapsInterior } from './geometry.mjs';
import { RELATIONS, LEVELS } from './brief.mjs';
export function violation(id, message, { level = LEVELS.HARD, source = 'system', detail = null } = {}) {
  return { id, level, source, message, detail };
}
export function roomIndex(plan) { return new Map((plan.rooms ?? []).map(r => [r.id, r])); }
function matchingRoom(room, query) { return room.id === query || room.type === query; }
export function resolveRooms(plan, query) { return (plan.rooms ?? []).filter(r => matchingRoom(r, query)); }
/** Graph is built from REAL door geometry, never a coarse grid adjacency. */
export function doorGraph(plan, { minDoorWidth = 0.8, endClearance = 0.1 } = {}) {
  const index = roomIndex(plan);
  const graph = new Map([...index.keys()].map(id => [id, []]));
  const rejected = [];
  for (const door of plan.doors ?? []) {
    const a = index.get(door.from), b = index.get(door.to);
    if (!a || !b || !realDoorConnects(a, b, door, minDoorWidth, endClearance)) {
      rejected.push(door); continue;
    }
    graph.get(a.id).push(b.id); graph.get(b.id).push(a.id);
  }
  return { graph, rejected };
}
export function hasGuestRoute(plan, fromQuery = 'majlis', toQuery = 'dining', forbiddenZones = ['family']) {
  const index = roomIndex(plan), { graph } = doorGraph(plan);
  const starts = resolveRooms(plan, fromQuery), targets = new Set(resolveRooms(plan, toQuery).map(r => r.id));
  const visited = new Set(), queue = starts.map(r => r.id);
  for (const id of queue) visited.add(id);
  while (queue.length) {
    const id = queue.shift();
    if (targets.has(id)) return true;
    for (const next of graph.get(id) ?? []) {
      const room = index.get(next);
      if (visited.has(next) || forbiddenZones.includes(room.zone)) continue;
      visited.add(next); queue.push(next);
    }
  }
  return false;
}
export function validatePlan(plan, brief, { extraValidators = [] } = {}) {
  const problems = [];
  const rooms = plan.rooms ?? [];
  const byId = roomIndex(plan);
  if (byId.size !== rooms.length) problems.push(violation('DUPLICATE_ROOM_ID', 'Repeated room ID'));
  for (const required of brief.rooms ?? []) {
    const found = resolveRooms(plan, required.type ?? required.id);
    if (found.length < (required.count ?? 1)) problems.push(violation('ROOM_MISSING', `Missing ${required.type ?? required.id}`,
      { source: required.source ?? 'user', detail: required }));
  }
  for (const dim of brief.dimensions ?? []) {
    const matches = resolveRooms(plan, dim.room);
    if (!matches.length) { problems.push(violation('DIM_ROOM_MISSING', `Room not found: ${dim.room}`, { source: dim.source })); continue; }
    for (const room of matches) {
      // The adapter must supply CLEAR interior dimensions. Room bounding boxes alone may be gross.
      if (!room.clear || !Number.isFinite(room.clear.width) || !Number.isFinite(room.clear.length)) {
        problems.push(violation('DIM_MEASUREMENT_MISSING', `No measured clear dimensions: ${room.id}`, { source: dim.source })); continue;
      }
      const normal = clearDimension(room.clear.width, dim.width, dim.tolerance).valid &&
        clearDimension(room.clear.length, dim.length, dim.tolerance).valid;
      const rotated = dim.allowRotation !== false &&
        clearDimension(room.clear.width, dim.length, dim.tolerance).valid &&
        clearDimension(room.clear.length, dim.width, dim.tolerance).valid;
      if (!normal && !rotated) problems.push(violation('DIM_MISMATCH', `Clear dimensions differ for ${room.id}`,
        { level: dim.level, source: dim.source, detail: { required: dim, actual: room.clear } }));
    }
  }
  for (const relation of brief.relations ?? []) {
    if (relation.kind === RELATIONS.GUEST_ACCESS) {
      if (!hasGuestRoute(plan, relation.from, relation.to, relation.avoidZones ?? ['family'])) {
        problems.push(violation('GUEST_ACCESS', `No private guest route ${relation.from} -> ${relation.to}`,
          { level: relation.level, source: relation.source, detail: relation }));
      }
    } else if (relation.kind === RELATIONS.DIRECT_DOOR) {
      const A = new Set(resolveRooms(plan, relation.from).map(r => r.id));
      const B = new Set(resolveRooms(plan, relation.to).map(r => r.id));
      const { graph } = doorGraph(plan);
      if (![...A].some(id => (graph.get(id) ?? []).some(next => B.has(next)))) {
        problems.push(violation('DIRECT_DOOR', `Direct door missing ${relation.from} -> ${relation.to}`,
          { level: relation.level, source: relation.source }));
      }
    } else if (relation.kind === RELATIONS.NEAR) {
      // Near is evaluated separately with distance / circulation metrics. Never convert to DIRECT_DOOR.
      if (!resolveRooms(plan, relation.from).length || !resolveRooms(plan, relation.to).length) {
        problems.push(violation('NEAR_UNMEASURABLE', 'Near relation lacks rooms', { level: relation.level, source: relation.source }));
      }
    }
  }
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    if (rooms[i].floor === rooms[j].floor && overlapsInterior(rooms[i], rooms[j])) {
      problems.push(violation('ROOM_OVERLAP', `${rooms[i].id} overlaps ${rooms[j].id}`));
    }
  }
  for (const check of extraValidators) {
    const added = check(plan, brief);
    if (!Array.isArray(added)) throw new Error('Validator must return an array');
    problems.push(...added);
  }
  return { valid: !problems.some(p => p.level === LEVELS.HARD), violations: problems,
    hard: problems.filter(p => p.level === LEVELS.HARD), advisory: problems.filter(p => p.level !== LEVELS.HARD) };
}
export function applySafeEdit(original, brief, edit, options = {}) {
  const before = validatePlan(original, brief, options);
  const candidate = structuredClone(original);
  edit(candidate);
  const after = validatePlan(candidate, brief, options);
  if (!after.valid) return { accepted: false, plan: original, before, after, reason: 'HARD_CONSTRAINT_VIOLATION' };
  return { accepted: true, plan: candidate, before, after, reason: null };
}
/** Cheap topology-stage filter: never claims geometry validity. */
export function topologyGuestRoute(topology, start, target, forbiddenZones = ['family']) {
  const nodes = new Map(topology.nodes.map(n => [n.id, n]));
  const graph = new Map([...nodes.keys()].map(k => [k, []]));
  for (const e of topology.edges ?? []) {
    if (e.doorCapable !== true || !(e.availableLength >= (e.requiredLength ?? 1.0))) continue;
    if (!graph.has(e.from) || !graph.has(e.to)) continue;
    graph.get(e.from).push(e.to); graph.get(e.to).push(e.from);
  }
  const queue = [start], seen = new Set([start]);
  while (queue.length) {
    const n = queue.shift();
    if (n === target) return true;
    for (const next of graph.get(n) ?? []) {
      if (seen.has(next) || forbiddenZones.includes(nodes.get(next).zone)) continue;
      seen.add(next); queue.push(next);
    }
  }
  return false;
}
