import { copy, fail, identifier, number, unique } from './core.mjs';
import { point, polygon, area, inside, segmentsIntersect } from './geometry.mjs';
export const INPUT_SCHEMA = 'MIZAN-MEP-INPUT/1';
export const FRAME = 'X_EAST_Y_NORTH_Z_UP';
export function validateProject(raw) {
  const p = copy(raw);
  if (p.schema !== INPUT_SCHEMA || p.units !== 'm' || p.frame !== FRAME) fail('CONTRACT_OR_UNITS', '$');
  identifier(p.projectId, 'projectId');
  const a = p.architecture; if (!a) fail('ARCHITECTURE_REQUIRED', 'architecture');
  for (const key of ['levels', 'rooms', 'walls', 'openings', 'obstacles']) unique(a[key], 'architecture.' + key);
  if (!a.levels.length || !a.rooms.length || a.rooms.length > 500 || a.obstacles.length > 2000) fail('MODEL_SIZE', 'architecture');
  if (!a.source?.sha256 || !/^[a-f0-9]{64}$/.test(a.source.sha256)) fail('SOURCE_BINDING_REQUIRED', 'architecture.source');
  const levels = new Map(a.levels.map(l => [l.id, l]));
  for (const l of a.levels) { number(l.elevationM, l.id + '.elevationM'); number(l.heightM, l.id + '.heightM', { positive: true }); }
  for (const r of a.rooms) {
    if (!levels.has(r.levelId)) fail('UNKNOWN_LEVEL', r.id);
    polygon(r.polygon, r.id + '.polygon'); if (!Array.isArray(r.holes)) fail('HOLES_ARRAY_REQUIRED', r.id);
    for (let k = 0; k < r.holes.length; k++) {
      const h = r.holes[k]; polygon(h, r.id + '.holes');
      if (!h.every(v => inside(v, r.polygon, false))) fail('HOLE_OUTSIDE_ROOM', r.id);
      for (const [j, other] of r.holes.entries()) if (j < k && (h.some(v => inside(v, other)) || other.some(v => inside(v, h)) || h.some((v, i) => other.some((w, q) => segmentsIntersect(v, h[(i + 1) % h.length], w, other[(q + 1) % other.length]))))) fail('OVERLAPPING_HOLES', r.id);
      for (let i = 0; i < h.length; i++) for (let j = 0; j < r.polygon.length; j++) if (segmentsIntersect(h[i], h[(i + 1) % h.length], r.polygon[j], r.polygon[(j + 1) % r.polygon.length])) fail('HOLE_CROSSES_ROOM', r.id);
    }
    r.areaM2 = area(r.polygon) - r.holes.reduce((s, h) => s + area(h), 0);
    number(r.areaM2, r.id + '.areaM2', { positive: true });
    number(r.heightM, r.id + '.heightM', { positive: true });
  }
  const walls = new Map(a.walls.map(w => [w.id, w]));
  for (const w of a.walls) {
    if (!levels.has(w.levelId)) fail('UNKNOWN_LEVEL', w.id);
    point(w.a, w.id); point(w.b, w.id); if (w.a.x === w.b.x && w.a.y === w.b.y) fail('ZERO_WALL', w.id);
    number(w.thicknessM, w.id + '.thicknessM', { positive: true }); number(w.heightM, w.id + '.heightM', { positive: true });
  }
  for (const o of a.openings) {
    const w = walls.get(o.wallId); if (!w || o.levelId !== w.levelId) fail('UNKNOWN_OPENING_WALL', o.id);
    number(o.atM, o.id + '.atM', { min: 0 }); number(o.widthM, o.id + '.widthM', { positive: true });
    number(o.heightM, o.id + '.heightM', { positive: true }); number(o.sillM, o.id + '.sillM', { min: 0 });
    if (o.atM - o.widthM / 2 < -1e-6 || o.atM + o.widthM / 2 > Math.hypot(w.a.x - w.b.x, w.a.y - w.b.y) + 1e-6 || o.sillM + o.heightM > w.heightM + 1e-6) fail('OPENING_OUTSIDE_WALL', o.id);
  }
  for (const box of a.obstacles) { point(box.min, box.id, true); point(box.max, box.id, true); for (const k of ['x', 'y', 'z']) if (box.max[k] < box.min[k]) fail('INVALID_BOX', box.id); }
  if (!p.services || Array.isArray(p.services) || !p.rules || Array.isArray(p.rules)) fail('SERVICES_AND_RULES_REQUIRED', '$');
  return p;
}
