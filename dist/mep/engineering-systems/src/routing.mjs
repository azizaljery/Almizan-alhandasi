import { fail, number } from './core.mjs';
import { point, polygon, bounds, segmentBox, segmentWithin, routeLength, distance } from './geometry.mjs';
class Heap {
  data = [];
  push(item) { const a = this.data; a.push(item); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].score <= item.score) break; a[i] = a[p]; i = p; } a[i] = item; }
  pop() { const a = this.data, first = a[0], last = a.pop(); if (a.length) { let i = 0; while (true) { let j = i * 2 + 1; if (j >= a.length) break; if (j + 1 < a.length && a[j + 1].score < a[j].score) j++; if (a[j].score >= last.score) break; a[i] = a[j]; i = j; } a[i] = last; } return first; }
}
export function routeOrthogonal({ start, end, zM, domain, obstacles = [], widthM, heightM, clearanceM, stepM, maxCells = 100000 }) {
  point(start, 'route.start', true); point(end, 'route.end', true); number(zM, 'route.zM');
  number(widthM, 'route.widthM', { positive: true }); number(heightM, 'route.heightM', { positive: true }); number(clearanceM, 'route.clearanceM', { min: 0 }); number(stepM, 'route.stepM', { positive: true });
  if (!Number.isInteger(maxCells) || maxCells < 1 || maxCells > 200000) fail('ROUTING_RESOURCE_LIMIT', 'maxCells');
  if (!domain) fail('ROUTING_DOMAIN_REQUIRED', 'domain'); polygon(domain.polygon, 'domain.polygon');
  for (const h of domain.holes || []) polygon(h, 'domain.hole');
  const radius = Math.max(widthM, heightM) / 2 + clearanceM;
  const free = (a, b) => !obstacles.some(o => segmentBox(a, b, o, radius)) && [[-radius, -radius], [-radius, radius], [radius, -radius], [radius, radius]].every(([x, y]) => segmentWithin({ x: a.x + x, y: a.y + y }, { x: b.x + x, y: b.y + y }, domain));
  const s = { ...start, z: zM }, t = { ...end, z: zM };
  if (!free(start, s) || !free(t, end)) return { status: 'BLOCKED', points: [], lengthM: null, reason: 'ENDPOINT_OR_RISER_BLOCKED' };
  const simplify = path => {
    const out = [];
    for (const p of path) {
      if (out.length && distance(out.at(-1), p) < 1e-8) continue;
      while (out.length >= 2 && Math.abs(distance(out.at(-2), p) - distance(out.at(-2), out.at(-1)) - distance(out.at(-1), p)) < 1e-8) out.pop();
      out.push(p);
    }
    return { status: 'PROPOSED', points: out, lengthM: routeLength(out), reason: 'GEOMETRIC_PROPOSAL_ONLY' };
  };
  const direct = [
    [s, { x: t.x, y: s.y, z: zM }, t],
    [s, { x: s.x, y: t.y, z: zM }, t]
  ];
  for (const p of direct) if (p.slice(1).every((b, i) => free(p[i], b))) return simplify([start, ...p, end]);
  const bb = bounds(domain.polygon), nx = Math.floor((bb.maxX - bb.minX) / stepM) + 1, ny = Math.floor((bb.maxY - bb.minY) / stepM) + 1;
  if (nx * ny > maxCells) fail('ROUTING_RESOURCE_LIMIT', 'domain.grid');
  const at = id => ({ x: bb.minX + id % nx * stepM, y: bb.minY + Math.floor(id / nx) * stepM, z: zM });
  const connectors = p => {
    const cx = Math.round((p.x - bb.minX) / stepM), cy = Math.round((p.y - bb.minY) / stepM), list = [];
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      if (x < 0 || x >= nx || y < 0 || y >= ny) continue;
      const id = y * nx + x, q = at(id);
      for (const mid of [{ x: q.x, y: p.y, z: zM }, { x: p.x, y: q.y, z: zM }]) {
        if (free(p, mid) && free(mid, q)) { list.push({ id, path: [p, mid, q], length: distance(p, mid) + distance(mid, q) }); break; }
      }
    }
    return list;
  };
  const starts = connectors(s), ends = new Map(connectors(t).map(v => [v.id, v]));
  const heap = new Heap(), costs = new Map(), parents = new Map(), roots = new Map();
  for (const c of starts) if (!costs.has(c.id) || c.length < costs.get(c.id)) { costs.set(c.id, c.length); roots.set(c.id, c); heap.push({ id: c.id, g: c.length, score: c.length + distance(at(c.id), t) }); }
  let expanded = 0, winner = null, best = Infinity;
  while (heap.data.length) {
    const cur = heap.pop(); if (cur.score >= best) break; if (cur.g !== costs.get(cur.id)) continue;
    if (++expanded > maxCells) fail('ROUTING_RESOURCE_LIMIT', 'search');
    const cEnd = ends.get(cur.id);
    if (cEnd && cur.g + cEnd.length < best) { best = cur.g + cEnd.length; winner = cur.id; }
    const x = cur.id % nx, y = Math.floor(cur.id / nx), a = at(cur.id);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (x + dx < 0 || x + dx >= nx || y + dy < 0 || y + dy >= ny) continue;
      const id = (y + dy) * nx + x + dx, b = at(id), g = cur.g + stepM;
      if (g >= (costs.get(id) ?? Infinity) || !free(a, b)) continue;
      costs.set(id, g); parents.set(id, cur.id); heap.push({ id, g, score: g + distance(b, t) });
    }
  }
  if (winner === null) return { status: 'BLOCKED', points: [], lengthM: null, reason: 'NO_PATH_AT_CONFIGURED_GRID' };
  const ids = [winner]; while (parents.has(ids[0])) ids.unshift(parents.get(ids[0]));
  const root = roots.get(ids[0]);
  return simplify([start, ...root.path, ...ids.slice(1).map(at), ...ends.get(winner).path.slice(0, -1).reverse(), end]);
}
