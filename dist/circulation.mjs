import { openingPoint } from './planner.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Walk along the centre lines of connected clear corridors, not through rooms or walls.
// This is an illustrative route, not an egress or accessibility certification.
export function circulationNetwork(model) {
  const nodes = new Map(), edges = new Map(), lines = new Map();
  const add = (id, point) => { if (!nodes.has(id)) { nodes.set(id, point); edges.set(id, []); } return id; };
  const connect = (a, b, space = null) => {
    const length = distance(nodes.get(a), nodes.get(b));
    edges.get(a).push({ to: b, length, space }); edges.get(b).push({ to: a, length, space });
  };
  const corridors = new Map(model.corridors.map(c => [c.id, c]));
  const attach = (corridor, point, id) => {
    const horizontal = corridor.w >= corridor.h;
    const projected = horizontal
      ? { x: clamp(point.x, corridor.x, corridor.x + corridor.w), y: corridor.y + corridor.h / 2 }
      : { x: corridor.x + corridor.w / 2, y: clamp(point.y, corridor.y, corridor.y + corridor.h) };
    const projectedId = add(`${id}@${corridor.id}`, projected);
    add(id, point); connect(id, projectedId, corridor.id);
    if (!lines.has(corridor.id)) lines.set(corridor.id, []);
    lines.get(corridor.id).push(projectedId);
  };
  const doors = model.openings.filter(o => o.type === 'door');
  for (const door of doors) {
    const point = openingPoint(model, door); add(door.id, point);
    for (const space of door.connects || []) if (corridors.has(space)) attach(corridors.get(space), point, door.id);
  }
  for (const [index, [aId, bId]] of model.links.entries()) {
    const a = corridors.get(aId), b = corridors.get(bId);
    if (!a || !b) continue;
    const point = { x: (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2, y: (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2 };
    attach(a, point, `junction-${index}`); attach(b, point, `junction-${index}`);
  }
  for (const [id, points] of lines) {
    const c = corridors.get(id), axis = c.w >= c.h ? 'x' : 'y';
    points.sort((a, b) => nodes.get(a)[axis] - nodes.get(b)[axis]);
    for (let i = 1; i < points.length; i++) connect(points[i - 1], points[i], id);
  }
  function path(from, to) {
    if (!nodes.has(from) || !nodes.has(to)) return null;
    const distances = new Map([[from, 0]]), previous = new Map(), visited = new Set();
    while (true) {
      let current = null, best = Infinity;
      for (const [id, d] of distances) if (!visited.has(id) && d < best) { current = id; best = d; }
      if (current === null) return null;
      if (current === to) break;
      visited.add(current);
      for (const edge of edges.get(current)) {
        const d = best + edge.length;
        if (d < (distances.get(edge.to) ?? Infinity) - 1e-10) { distances.set(edge.to, d); previous.set(edge.to, { from: current, space: edge.space }); }
      }
    }
    const ids = [to], spaces = [];
    while (ids[0] !== from) { const step = previous.get(ids[0]); if (!step) return null; ids.unshift(step.from); if (step.space) spaces.unshift(step.space); }
    const points = ids.map(id => nodes.get(id)).filter((point, i, list) => !i || distance(point, list[i - 1]) > 1e-8);
    return { metres: distances.get(to), points, spaces: [...new Set(spaces)] };
  }
  const entries = doors.filter(o => o.connects?.includes('outside'));
  const roomDoor = id => doors.find(o => o.roomId === id);
  const bestPath = (from, to) => from.map(entry => path(entry.id, to.id)).filter(Boolean).sort((a, b) => a.metres - b.metres)[0] || null;
  return {
    toRoom(id) { const door = roomDoor(id); return door ? bestPath(entries, door) : null; },
    betweenRooms(a, b) { const from = roomDoor(a), to = roomDoor(b); return from && to ? path(from.id, to.id) : null; },
  };
}
