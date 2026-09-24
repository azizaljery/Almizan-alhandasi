// planner.mjs — Local, deterministic concept planner. Metres; x east, y north. Not a code-compliance engine.
// v2: supports multiple footprint shapes (rectangle, L, U) built from rectangular "wings",
// each wing packed by the same proven packWing algorithm as before.

/**
 * Public types come from the contract (single source of truth).
 * @typedef {import('./PlannerOutputContract.mjs').Point} Point
 * @typedef {import('./PlannerOutputContract.mjs').Rect} Rect
 * @typedef {import('./PlannerOutputContract.mjs').Polygon} Polygon
 * @typedef {import('./PlannerOutputContract.mjs').Direction} Direction
 * @typedef {import('./PlannerOutputContract.mjs').ShapeKey} ShapeKey
 * @typedef {import('./PlannerOutputContract.mjs').RoomType} RoomType
 * @typedef {import('./PlannerOutputContract.mjs').Position} Position
 * @typedef {import('./PlannerOutputContract.mjs').Side} Side
 * @typedef {import('./PlannerOutputContract.mjs').ResolvedSide} ResolvedSide
 * @typedef {import('./PlannerOutputContract.mjs').Edge} Edge
 * @typedef {import('./PlannerOutputContract.mjs').PlotInput} PlotInput
 * @typedef {import('./PlannerOutputContract.mjs').RoomRequest} RoomRequest
 * @typedef {import('./PlannerOutputContract.mjs').Plot} Plot
 * @typedef {import('./PlannerOutputContract.mjs').Footprint} Footprint
 * @typedef {import('./PlannerOutputContract.mjs').ProgramRoom} ProgramRoom
 * @typedef {import('./PlannerOutputContract.mjs').Room} Room
 * @typedef {import('./PlannerOutputContract.mjs').Corridor} Corridor
 * @typedef {import('./PlannerOutputContract.mjs').Reserve} Reserve
 * @typedef {import('./PlannerOutputContract.mjs').Courtyard} Courtyard
 * @typedef {import('./PlannerOutputContract.mjs').RoofPolicy} RoofPolicy
 * @typedef {import('./PlannerOutputContract.mjs').Wall} Wall
 * @typedef {import('./PlannerOutputContract.mjs').Opening} Opening
 * @typedef {import('./PlannerOutputContract.mjs').Link} Link
 * @typedef {import('./PlannerOutputContract.mjs').ValidatedDesignGeometry} ValidatedDesignGeometry
 * @typedef {import('./PlannerOutputContract.mjs').WallPiece} WallPiece
 * @typedef {import('./PlannerOutputContract.mjs').Quantities} Quantities
 */
/**
 * Internal (non-contract) planning types.
 * @typedef {{ rooms: ProgramRoom[], depth: number, branch: number }} PackRow
 * @typedef {{ rows: PackRow[], height: number }} Packed
 * @typedef {Packed & { score: number }} ScoredPacked
 * @typedef {{ left: Packed, right: Packed, height: number, score: number }} ZonePair
 * @typedef {{ position: Position, left: Packed, right: Packed, height: number, score: number }} SolvedZone
 * @typedef {{ zones: SolvedZone[] }} ZoneSet
 * @typedef {{ width: number, depth: number, zones: ZoneSet, score: number, requiredArea: number, singleSided: false }} WingSolution
 * @typedef {{ width: number, depth: number, packed: Packed, score: number, requiredArea: number, singleSided: true }} SingleWingSolution
 * @typedef {Rect & { id: string }} WingBox
 * @typedef {{ id: string, box: WingBox, program: ProgramRoom[], openEdges?: Edge[] }} ArmBase
 * @typedef {ArmBase & { single?: false, zone: ZoneSet }} DoubleArm
 * @typedef {ArmBase & { single: true, zone: SingleWingSolution, corridorSide: 'left'|'right', vertical?: false }} SingleArm
 * @typedef {ArmBase & { single: true, zone: SingleWingSolution, corridorSide: 'top'|'bottom', vertical: true }} VerticalArm
 *   No shape planner produces a VerticalArm in v2.1, so buildSingleSidedWingGeometryVertical() is unreachable.
 *   The type records the protocol that path requires (corridorSide 'top'|'bottom', not 'left'|'right').
 * @typedef {DoubleArm | SingleArm | VerticalArm} Arm
 * @typedef {{ x1: number, y1: number, x2: number, y2: number, type: 'ext'|'int' }} WallSeg
 * @typedef {WallSeg & { t: number }} RawWall
 * @typedef {{ type: 'door'|'window', x: number, y: number, axis: 'h'|'v', w: number, h: number, sill: number, roomId?: string, connects?: [string, string] }} Portal
 * @typedef {{ corridors: Corridor[], walls: WallSeg[], doors: Portal[], courtyards: (Rect & { name: string })[] }} ShapeExtra
 * @typedef {{ arms: Arm[], overallW: number, overallH: number, footprintPolygon: Polygon, extra?: ShapeExtra }} ShapePlan
 * @typedef {{ rooms: Room[], corridors: Corridor[], reserves: Reserve[], links: Link[], wing?: number }} WingGeometry
 * @typedef {{ vertical: boolean, fixed: number, type: 'ext'|'int', t: number, ranges: [number, number][] }} WallBin
 */
export const TYPES = {
  bedroom: { name: 'غرفة نوم', area: 20, min: 2.6, color: '#e4e7f2' },
  majlis: { name: 'مجلس', area: 32, min: 3, color: '#f3e6c8' },
  living: { name: 'صالة عائلية', area: 28, min: 2.8, color: '#dceee7' },
  dining: { name: 'صالة طعام', area: 20, min: 2.5, color: '#f1e9d5' },
  kitchen: { name: 'مطبخ', area: 18, min: 2.2, color: '#e3edda' },
  bath: { name: 'دورة مياه', area: 6, min: 1.5, color: '#dcebf2' },
  storage: { name: 'مستودع', area: 8, min: 1.3, color: '#e9e5df' },
  service: { name: 'غرفة خدمة', area: 12, min: 2.2, color: '#f0e0dd' },
  corridor: { name: 'ممر إضافي', area: 8, min: 1.2, color: '#f4f1e8' },
};
export const POSITIONS = { front: 'أمام', middle: 'وسط', back: 'خلف' };
export const SIDES = { any: 'تلقائي', left: 'يسار المدخل', right: 'يمين المدخل' };
export const DIRECTIONS = { s: 'جنوب', n: 'شمال', e: 'شرق', w: 'غرب' };
export const SHAPES = { rect: 'مستطيل مصمت', l: 'حرف L', u: 'حرف U (فناء ثلاثي الجهات)' };
/** Allowed courtyard roof states (contract v2). v2.1 emits only 'OPEN_TO_SKY'. @type {readonly RoofPolicy[]} */
export const ROOF_POLICIES = Object.freeze(/** @type {RoofPolicy[]} */ (['OPEN_TO_SKY', 'PARTIALLY_COVERED', 'COVERED_ATRIUM']));
export const GEOMETRY = { exterior: .25, partition: .15, corridor: 1.6, branch: 1.2, height: 3.2 };
const E = 1e-5, T = GEOMETRY.partition, X = GEOMETRY.exterior;
/** @template T @param {T[]} list @param {(v: T) => number} fn @returns {number} */
const sum = (list, fn) => list.reduce((a, v) => a + fn(v), 0);
/** @param {number} a @param {number} b */
const near = (a, b) => Math.abs(a - b) < E;
/** Open-interior overlap of two rectangles. @param {Rect} a @param {Rect} b @returns {boolean} */
export const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > E && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > E;
/** @param {Rect} a @param {Rect} b @returns {boolean} */
export const inside = (a, b) => a.x >= b.x - E && a.y >= b.y - E && a.x + a.w <= b.x + b.w + E && a.y + a.h <= b.y + b.h + E;
/** @param {Rect} r @returns {Point} */
export const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// --- Polygon geometry -------------------------------------------------------------
// buildingFootprint (an arbitrary simple polygon; winding order is not load-bearing —
// pointInPolygon uses the even-odd rule, not signed area) is the geometric
// source of truth for the building's true outline — L and U are real notched shapes,
// not their bounding rectangles. boundingBox is always DERIVED from the polygon (never
// hand-built), for callers that only need axis-aligned bounds (e.g. a quick overlap
// pre-check, or a 2D viewport fit).

// The axis-aligned bounding box of a polygon's own points — a pure derivation, never a
// second source of truth. Any caller wanting "the building's box" should get it from
// here (or from model.boundingBox, itself built by this function), not invent one.
/** @param {Polygon} polygon @returns {Rect} */
export function polygonBoundingBox(polygon) {
  const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Standard ray-casting point-in-polygon test (even-odd rule). Points exactly on an edge
// are treated as inside (within E) so a room wall flush with the footprint boundary is
// not flagged as "outside" by floating-point noise.
/** @param {Polygon} polygon @param {Point} p @returns {boolean} */
export function pointInPolygon(polygon, p) {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n];
    const onSegment = Math.abs((b.y - a.y) * (p.x - a.x) - (b.x - a.x) * (p.y - a.y)) < E * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
      && p.x >= Math.min(a.x, b.x) - E && p.x <= Math.max(a.x, b.x) + E && p.y >= Math.min(a.y, b.y) - E && p.y <= Math.max(a.y, b.y) + E;
    if (onSegment) return true;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// True containment of a rectangle inside a polygon: every corner must test inside, AND
// no polygon edge may cross the rectangle's interior (guards against a polygon notch —
// e.g. U's courtyard cut — poking into the rectangle between two "inside" corners, which
// corner-testing alone would miss for a rectangle straddling the notch).
/** @param {Rect} rect @param {Polygon} polygon @returns {boolean} */
export function rectInPolygon(rect, polygon) {
  const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h }];
  if (!corners.every(c => pointInPolygon(polygon, c))) return false;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n];
    const edgeMinX = Math.min(a.x, b.x), edgeMaxX = Math.max(a.x, b.x), edgeMinY = Math.min(a.y, b.y), edgeMaxY = Math.max(a.y, b.y);
    if (edgeMaxX <= rect.x + E || edgeMinX >= rect.x + rect.w - E || edgeMaxY <= rect.y + E || edgeMinY >= rect.y + rect.h - E) continue;
    if (edgeMinX > rect.x + E && edgeMaxX < rect.x + rect.w - E) return false;
    if (edgeMinY > rect.y + E && edgeMaxY < rect.y + rect.h - E) return false;
  }
  return true;
}

/** @param {Rect} rect @param {Polygon} polygon @returns {boolean} */
export function rectIntersectsPolygonArea(rect, polygon) {
  if (!overlap(rect, polygonBoundingBox(polygon))) return false;
  const inset = Math.min(E * 10, rect.w / 4, rect.h / 4);
  const samples = [
    center(rect),
    { x: rect.x + inset, y: rect.y + inset }, { x: rect.x + rect.w - inset, y: rect.y + inset },
    { x: rect.x + inset, y: rect.y + rect.h - inset }, { x: rect.x + rect.w - inset, y: rect.y + rect.h - inset },
  ];
  return samples.some(p => pointInPolygon(polygon, p));
}

/** Unsigned area (shoelace). @param {Polygon} polygon @returns {number} */
export function polygonArea(polygon) {
  let a = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) a += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
  return Math.abs(a) / 2;
}

/** @param {unknown} rawShape @returns {ShapeKey} */
function normalizeShapeKey(rawShape) {
  const key = typeof rawShape === 'string' ? rawShape.trim().toLowerCase() : '';
  return Object.hasOwn(SHAPES, key) ? /** @type {ShapeKey} */ (key) : 'rect';
}
/** @param {PlotInput} raw @returns {Plot} @throws {Error} Arabic message on invalid input */
export function validatePlot(raw) {
  if (!raw || !Number.isFinite(raw.width) || raw.width < 8 || raw.width > 100 || !Number.isFinite(raw.length) || raw.length < 8 || raw.length > 100) throw Error('أدخل طولاً وعرضاً بين 8 و100 متر.');
  if (!Number.isInteger(raw.floors) || raw.floors < 1 || raw.floors > 3) throw Error('عدد الأدوار من 1 إلى 3؛ هذه النسخة توزّع الأرضي فقط.');
  const streets = Object.fromEntries(/** @type {Direction[]} */ (Object.keys(DIRECTIONS)).map(s => [s, raw.streets?.[s] === true]));
  if (!Object.hasOwn(DIRECTIONS, raw.entry) || !streets[raw.entry]) throw Error('اختر جهة مدخل مطلة على أحد الشوارع المفعّلة.');
  const streetSetback = raw.streetSetback ?? 3, neighborSetback = raw.neighborSetback ?? 1.5, coverage = raw.coverage ?? .75;
  if (![streetSetback, neighborSetback].every(n => Number.isFinite(n) && n >= 0 && n <= 15) || !Number.isFinite(coverage) || coverage < .1 || coverage > .9) throw Error('راجع افتراضات الارتدادات ونسبة البناء.');
  const shape = normalizeShapeKey(raw.shape);
  return { width: raw.width, length: raw.length, floors: raw.floors, streets, entry: raw.entry, streetSetback, neighborSetback, coverage, shape };
}
/** @param {PlotInput} raw @returns {Footprint} */
export function footprint(raw) {
  const p = validatePlot(raw);
  const sb = Object.fromEntries(Object.entries(p.streets).map(([s, on]) => [s, on ? p.streetSetback : p.neighborSetback]));
  const w = Math.max(0, p.width - sb.w - sb.e), h = Math.max(0, p.length - sb.n - sb.s);
  const area = Math.min(w * h, p.width * p.length * p.coverage);
  const scale = w * h > 0 ? Math.sqrt(area / (w * h)) : 0;
  return { x: sb.w + (w - w * scale) / 2, y: sb.s + (h - h * scale) / 2, w: w * scale, h: h * scale, sb, area };
}
/** @param {RoomRequest[]} raw @returns {ProgramRoom[]} */
export function normalizeRooms(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 30) throw Error('البرنامج يحتاج من 1 إلى 30 فراغاً.');
  return raw.map((r, i) => {
    if (!r || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 70 || !Object.hasOwn(TYPES, r.type) || !Number.isFinite(r.area) || r.area < 4 || r.area > 120 || !Object.hasOwn(POSITIONS, r.position) || !Object.hasOwn(SIDES, r.side)) throw Error('راجع اسم ونوع ومساحة وموقع الفراغ رقم ' + (i + 1) + '؛ المساحة بين 4 و120 م².');
    return { id: 'room-' + i, name: r.name.trim(), type: r.type, area: r.area, targetArea: r.area, position: r.position, side: r.side };
  });
}
/** @param {{ bedrooms?: number, majlis?: number, baths?: number, kitchens?: number, halls?: number, dining?: number }} [counts] @returns {RoomRequest[]} */
export function defaultRooms({ bedrooms = 4, majlis = 2, baths = 3, kitchens = 1, halls = 1, dining = 1 } = {}) {
  /** @type {RoomRequest[]} */
  const result = [];
  /** @param {RoomType} type @param {number} count @param {Position} position */
  const add = (type, count, position) => {
    if (!Number.isInteger(count) || count < 0 || count > 10) throw Error('أعداد الفراغات يجب أن تكون أعداداً صحيحة بين 0 و10.');
    for (let i = 0; i < count; i++) result.push({ name: TYPES[type].name + (count > 1 ? ' ' + (i + 1) : ''), type, area: TYPES[type].area, position, side: type === 'majlis' && count === 2 ? (i ? 'right' : 'left') : 'any' });
  };
  add('majlis', majlis, 'front'); add('living', halls, 'middle'); add('dining', dining, 'middle'); add('kitchen', kitchens, 'middle'); add('bedroom', bedrooms, 'back');
  add('bath', baths, 'back');
  if (baths) result[result.length - baths].position = 'middle';
  return result;
}

// ── packWing: partition a set of rooms into full-width rows within ONE rectangular wing.
// Unchanged core algorithm — this is the proven part. Small rooms share a row with a cross passage.
// A bounded search can reject a program it cannot fit; this is not a proof of impossibility.
/** @param {ProgramRoom[]} rooms @param {number} width @returns {Packed | null} */
function packWing(rooms, width) {
  if (!rooms.length) return { rows: [], height: 0 };
  /** @type {Map<string, ScoredPacked | null>} */
  const memo = new Map(); let visits = 0;
  /** @param {ProgramRoom[]} list @returns {ScoredPacked | null} */
  function solve(list) {
    if (!list.length) return { rows: [], height: 0, score: 0 };
    const key = list.map(r => r.id).sort().join(',');
    if (memo.has(key)) return /** @type {ScoredPacked | null} */ (memo.get(key));
    if (++visits > 1800) return null;
    const first = [...list].sort((a, b) => a.area - b.area)[0], other = list.filter(r => r !== first);
    const groups = [[first]];
    other.forEach((r, i) => { groups.push([first, r]); other.slice(i + 1).forEach(s => groups.push([first, r, s])); });
    /** @type {ScoredPacked | null} */
    let best = null;
    for (const group of groups) {
      const depth = sum(group, r => r.area) / (width - T * (group.length - 1));
      if (group.some(r => depth < TYPES[r.type].min - E || r.area / depth < TYPES[r.type].min - E || Math.max(depth * depth / r.area, r.area / (depth * depth)) > 5)) continue;
      const rest = solve(list.filter(r => !group.includes(r)));
      if (!rest) continue;
      const branch = group.length > 1 ? GEOMETRY.branch + T : 0;
      const height = depth + branch + (rest.rows.length ? T : 0) + rest.height;
      const aspectPenalty = sum(group, r => Math.abs(Math.log((r.area / depth) / depth))) * .035;
      const score = height + rest.score - rest.height + aspectPenalty;
      if (!best || score < best.score) best = { rows: [{ rooms: group, depth, branch }, ...rest.rows], height, score };
    }
    memo.set(key, best); return best;
  }
  return solve(rooms);
}
/** @param {ProgramRoom[]} rooms @param {number} width @returns {ZonePair | null} */
function packZone(rooms, width) {
  let states = [{ left: rooms.filter(r => r.side === 'left'), right: rooms.filter(r => r.side === 'right') }];
  for (const r of rooms.filter(r => r.side === 'any').sort((a, b) => b.area - a.area)) {
    states = states.flatMap(s => [{ left: [...s.left, r], right: s.right }, { left: s.left, right: [...s.right, r] }]);
    states.sort((a, b) => Math.abs(sum(a.left, r => r.area) - sum(a.right, r => r.area)) - Math.abs(sum(b.left, r => r.area) - sum(b.right, r => r.area)));
    states = states.slice(0, 48);
  }
  /** @type {Map<string, Packed | null>} */
  const cache = new Map();
  /** @param {ProgramRoom[]} list */
  const pack = list => { const key = list.map(r => r.id).sort().join(','); if (!cache.has(key)) cache.set(key, packWing(list, width)); return cache.get(key); };
  /** @type {ZonePair | null} */
  let best = null;
  for (const s of states) {
    const left = pack(s.left), right = pack(s.right);
    if (!left || !right) continue;
    const height = Math.max(left.height, right.height);
    const score = height + Math.abs(left.height - right.height) * .02;
    if (!best || score < best.score) best = { left, right, height, score };
  }
  return best;
}

// ── Build ONE rectangular wing's full geometry (rooms, corridors, reserves) inside a local
// axis-aligned box, given a two-sided packZone result. Reusable for rect / each arm of L / each arm of U.
/** @param {ZoneSet} zone @param {WingBox} wingBox @returns {WingGeometry} */
function buildWingGeometry(zone, wingBox) {
  const { x: ox, y: oy, w: width } = wingBox;
  const wing = (width - X * 2 - T * 2 - GEOMETRY.corridor) / 2;
  // The single rectangle arm ('a') keeps the original v1 ids ('spine', 'branch-<pos>-<side>-<row>')
  // so existing UI/tests that reference them keep working; multi-arm shapes prefix the arm id.
  const spineId = wingBox.id === 'a' ? 'spine' : 'spine-' + wingBox.id, branchPrefix = wingBox.id === 'a' ? 'branch-' : 'branch-' + wingBox.id + '-';
  const rooms = /** @type {Room[]} */ ([]), corridors = /** @type {Corridor[]} */ ([{ id: spineId, name: 'ممر رئيسي', x: ox + X + wing + T, y: oy + X, w: GEOMETRY.corridor, h: wingBox.h - 2 * X }]), reserves = /** @type {Reserve[]} */ ([]), links = /** @type {Link[]} */ ([]);
  let cursor = oy + X;
  const active = zone.zones.filter(z => z.height);
  active.forEach((zoneEntry, zoneIndex) => {
    for (const side of /** @type {ResolvedSide[]} */ (['left', 'right'])) {
      const x = side === 'left' ? ox + X : ox + X + wing + 2 * T + GEOMETRY.corridor;
      let y = cursor;
      const packed = zoneEntry[side];
      packed.rows.forEach((row, rowIndex) => {
        let corridorId = spineId;
        if (row.branch) {
          corridorId = branchPrefix + zoneEntry.position + '-' + side + '-' + rowIndex;
          corridors.push({ id: corridorId, name: 'ممر فرعي', x: side === 'left' ? x : x - T, y, w: wing + T, h: GEOMETRY.branch });
          links.push([spineId, corridorId]);
          y += row.branch;
        }
        const order = [...row.rooms].sort((a, b) => TYPES[b.type].min - TYPES[a.type].min || b.area - a.area);
        if (side === 'right') order.reverse();
        let rx = x;
        order.forEach(r => { const w = r.area / row.depth; rooms.push({ ...r, x: rx, y, w, h: row.depth, resolvedSide: side, corridorId, doorSide: row.branch ? 'front' : side === 'left' ? 'right' : 'left' }); rx += w + T; });
        y += row.depth + (rowIndex < packed.rows.length - 1 ? T : 0);
      });
      const leftover = zoneEntry.height - packed.height - (packed.rows.length ? T : 0);
      if (leftover > .1) reserves.push({ name: 'غير موزّع', x, y: cursor + packed.height + (packed.rows.length ? T : 0), w: wing, h: leftover });
    }
    cursor += zoneEntry.height + (zoneIndex < active.length - 1 ? T : 0);
  });
  return { rooms, corridors, reserves, links, wing };
}

// ── Single-sided variant for a secondary arm that sits beside the main arm horizontally
// (shared vertical boundary). All rooms in one row along the OUTER edge; the access
// corridor is a vertical strip along the INNER edge (shared with the main arm), so it is
// always flush against the shared boundary — never centred, never blocked by a room.
// corridorSide: 'left' (corridor at box's left edge, rooms to its right) when this arm
// sits to the RIGHT of main; 'right' (corridor at box's right edge, rooms to its left)
// when this arm sits to the LEFT of main.
/** @param {SingleWingSolution} solved @param {WingBox} wingBox @param {'left'|'right'} corridorSide @returns {WingGeometry} */
function buildSingleSidedWingGeometry(solved, wingBox, corridorSide) {
  const { x: ox, y: oy, w: boxW, h: boxH } = wingBox;
  const rooms = /** @type {Room[]} */ ([]), reserves = /** @type {Reserve[]} */ ([]), links = /** @type {Link[]} */ ([]);
  const corridorId = 'spine-' + wingBox.id;
  const corridorX = corridorSide === 'left' ? ox : ox + boxW - GEOMETRY.corridor;
  const corridorEndX = corridorX + GEOMETRY.corridor;
  /** @type {Corridor[]} */
  const corridors = [{ id: corridorId, name: 'ممر رئيسي', x: corridorX, y: oy + X, w: GEOMETRY.corridor, h: boxH - 2 * X }];
  const rowsX = corridorSide === 'left' ? corridorEndX + T : ox + X;
  const rowsWidth = singleSidedRoomsWidth(boxW);
  const resolved = corridorSide === 'left' ? 'right' : 'left';
  let y = oy + X;
  solved.packed.rows.forEach((row, rowIndex) => {
    let rCorridorId = corridorId;
    if (row.branch) {
      rCorridorId = 'branch-' + wingBox.id + '-' + rowIndex;
      const branchX = corridorSide === 'left' ? corridorEndX : rowsX;
      const branchW = corridorSide === 'left' ? (rowsX + rowsWidth) - corridorEndX : corridorX - rowsX;
      corridors.push({ id: rCorridorId, name: 'ممر فرعي', x: branchX, y, w: branchW, h: GEOMETRY.branch });
      links.push([corridorId, rCorridorId]);
      y += row.branch;
    }
    const order = [...row.rooms].sort((a, b) => TYPES[b.type].min - TYPES[a.type].min || b.area - a.area);
    let rx = rowsX;
    order.forEach(r => {
      const w = r.area / row.depth;
      rooms.push({ ...r, x: rx, y, w, h: row.depth, resolvedSide: resolved, corridorId: rCorridorId, doorSide: row.branch ? 'front' : (corridorSide === 'left' ? 'left' : 'right') });
      rx += w + T;
    });
    y += row.depth + (rowIndex < solved.packed.rows.length - 1 ? T : 0);
  });
  const leftover = solved.depth - X * 2 - solved.packed.height;
  if (leftover > .1) reserves.push({ name: 'غير موزّع', x: rowsX, y: oy + X + solved.packed.height + T, w: rowsWidth, h: leftover });
  return { rooms, corridors, reserves, links };
}

function buildSingleSidedWingGeometryVertical(solved, wingBox, corridorSide) {
  const { x: ox, y: oy, w: boxW, h: boxH } = wingBox;
  const rooms = /** @type {Room[]} */ ([]), reserves = /** @type {Reserve[]} */ ([]), links = /** @type {Link[]} */ ([]);
  const corridorId = 'spine-' + wingBox.id;
  const corridorY = corridorSide === 'top' ? oy : oy + boxH - GEOMETRY.corridor;
  const corridorEndY = corridorY + GEOMETRY.corridor;
  /** @type {Corridor[]} */
  const corridors = [{ id: corridorId, name: 'ممر رئيسي', x: ox + X, y: corridorY, w: boxW - 2 * X, h: GEOMETRY.corridor }];
  const rowsY = corridorSide === 'top' ? corridorEndY + T : oy + X;
  const rowsHeight = singleSidedRoomsWidth(boxH);
  const resolved = corridorSide === 'top' ? 'right' : 'left';
  let x = ox + X;
  solved.packed.rows.forEach((row, rowIndex) => {
    let rCorridorId = corridorId;
    const rowTotalHeight = sum(row.rooms, r => r.area / row.depth) + T * (row.rooms.length - 1);
    if (row.branch) {
      rCorridorId = 'branch-' + wingBox.id + '-' + rowIndex;
      const branchY = corridorSide === 'top' ? corridorEndY : rowsY;
      corridors.push({ id: rCorridorId, name: 'ممر فرعي', x, y: branchY, w: GEOMETRY.branch, h: rowTotalHeight });
      links.push([corridorId, rCorridorId]);
      x += row.branch;
    }
    const order = [...row.rooms].sort((a, b) => TYPES[b.type].min - TYPES[a.type].min || b.area - a.area);
    let ry = rowsY;
    order.forEach(r => {
      const h = r.area / row.depth;
      rooms.push({ ...r, x, y: ry, w: row.depth, h, resolvedSide: resolved, corridorId: rCorridorId, doorSide: row.branch ? 'left' : (corridorSide === 'top' ? 'front' : 'back') });
      ry += h + T;
    });
    x += row.depth + (rowIndex < solved.packed.rows.length - 1 ? T : 0);
  });
  const leftover = solved.depth - X * 2 - solved.packed.height;
  if (leftover > .1) reserves.push({ name: 'غير موزّع', x: ox + X + solved.packed.height + T, y: rowsY, w: leftover, h: rowsHeight });
  return { rooms, corridors, reserves, links };
}

function solveWing(program, maxWidth, maxDepth) {
  const required = sum(program, r => r.area);
  let solution = null;
  for (let width = Math.min(20, maxWidth); width >= Math.max(7, Math.min(20, maxWidth) - 5); width -= .5) {
    const wing = (width - X * 2 - T * 2 - GEOMETRY.corridor) / 2;
    if (wing < 1.5) continue;
    const zones = /** @type {SolvedZone[]} */ (/** @type {Position[]} */ (Object.keys(POSITIONS)).map(position => ({ position, ...packZone(program.filter(r => r.position === position), wing) })));
    if (zones.some(z => !Number.isFinite(z.height))) continue;
    const depth = X * 2 + sum(zones, z => z.height) + T * (zones.filter(z => z.height).length - 1);
    if (depth > maxDepth + E) continue;
    const score = width * depth + Math.abs(width - depth) * .2;
    if (!solution || score < solution.score) solution = { width, depth, zones: { zones }, score, requiredArea: required, singleSided: false };
  }
  return solution;
}

function singleSidedRoomsWidth(boxWidth) {
  return boxWidth - GEOMETRY.corridor - T - X;
}

function solveSingleSidedWing(rawProgram, maxWidth, maxDepth) {
  const program = rawProgram.map(r => r.side === 'any' ? r : { ...r, side: 'any' });
  const required = sum(program, r => r.area);
  let solution = null;
  for (let width = Math.min(20, maxWidth); width >= Math.max(7, Math.min(20, maxWidth) - 5); width -= .5) {
    const wing = singleSidedRoomsWidth(width);
    if (wing < 1.5) continue;
    const packed = packWing(program, wing);
    if (!packed || !Number.isFinite(packed.height)) continue;
    const depth = X * 2 + packed.height;
    if (depth > maxDepth + E) continue;
    const score = width * depth + Math.abs(width - depth) * .2;
    if (!solution || score < solution.score) solution = { width, depth, packed, score, requiredArea: required, singleSided: true };
  }
  return solution;
}

function planRectangle(f, program, sideways) {
  const maxWidth = Math.min(20, sideways ? f.h : f.w), maxDepth = sideways ? f.w : f.h;
  const solved = solveWing(program, maxWidth, maxDepth);
  if (!solved) return null;
  const w = solved.width, h = solved.depth;
  const footprintPolygon = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  return { arms: [{ id: 'a', box: { id: 'a', x: 0, y: 0, w, h }, zone: solved.zones, program }], overallW: w, overallH: h, footprintPolygon };
}
// packWing/packZone logic; only their layout in the footprint differs from the single rectangle.
/** @param {Rect} f @param {ProgramRoom[]} program @param {boolean} sideways @returns {ShapePlan | null} */
function planL(f, program, sideways) {
  const localWidth = sideways ? f.h : f.w, localDepth = sideways ? f.w : f.h;
  const mainProgram = program.filter(r => r.position !== 'back');
  /** @type {ProgramRoom[]} */
  const backProgram = program.filter(r => r.position === 'back').map(r => ({ ...r, position: 'middle' }));
  if (!mainProgram.length || !backProgram.length) return null; // need both arms populated to form an L
  // Split available width by each arm's share of total room area, reserving at least 7m
  // per arm, so neither arm starves the other by greedily claiming up to 20m.
  const mainShare = sum(mainProgram, r => r.area) / sum(program, r => r.area);
  const usableWidth = localWidth - T * 2;
  const mainMaxWidth = Math.min(20, Math.max(7, usableWidth * mainShare));
  const mainMaxDepth = localDepth * .62;
  const main = solveSingleSidedWing(mainProgram, mainMaxWidth, mainMaxDepth);
  if (!main) return null;
  const armMaxWidth = Math.min(20, localWidth - main.width - T * 2);
  if (armMaxWidth < 7) return null;
  const armMaxDepth = localDepth - main.depth;
  // The secondary arm is single-sided: its corridor sits flush against the boundary
  // shared with the main arm (its own LEFT edge, since the arm is placed to main's
  // right), guaranteeing a bridge corridor across the small gap never crosses a room.
  const arm = solveSingleSidedWing(backProgram, armMaxWidth, armMaxDepth);
  if (!arm) return null;
  const mainBox = { id: 'main', x: 0, y: 0, w: main.width, h: main.depth };
  const armBox = { id: 'arm', x: main.width + T * 2, y: 0, w: arm.width, h: arm.depth };
  const overallW = main.width + T * 2 + arm.width, overallH = Math.max(main.depth, arm.depth);
  // footprintPolygon: a true L, six points, one interior (reflex) corner where the
  // shorter arm's far edge meets the taller arm's side — NOT the bounding rectangle.
  // Walked starting at the front-left corner, consistent winding with planRectangle's.
  // Handles either arm being
  // the taller one (main.depth vs arm.depth) so the notch always sits on the shorter side.
  const mainRight = main.width + T; // midpoint of the partition gap: true shared boundary
  const footprintPolygon = main.depth >= arm.depth
    ? [{ x: 0, y: 0 }, { x: overallW, y: 0 }, { x: overallW, y: arm.depth }, { x: mainRight, y: arm.depth }, { x: mainRight, y: overallH }, { x: 0, y: overallH }]
    : [{ x: 0, y: 0 }, { x: mainRight, y: 0 }, { x: mainRight, y: main.depth }, { x: overallW, y: main.depth }, { x: overallW, y: overallH }, { x: 0, y: overallH }];
  return {
    arms: [
      // main's corridor sits on its RIGHT edge (flush against the shared boundary with arm).
      { id: 'main', box: mainBox, zone: main, program: mainProgram, single: true, corridorSide: 'right', openEdges: ['right'] },
      { id: 'arm', box: armBox, zone: arm, program: backProgram, single: true, corridorSide: 'left', openEdges: ['left'] },
    ],
    overallW, overallH, footprintPolygon,
  };
}
// U-shape: a spine arm across the back plus two side arms flanking a central open courtyard
// facing the entry. Front/middle rooms split left/right by their requested side (or by area
// balance if unspecified) into the two flanking arms; back rooms form the connecting spine.
// U-shape, rebuilt to avoid the vertical single-sided wing entirely: instead of a spine
// arm stacked above/below two flanking arms (which needed packWing's row axis reversed —
// the source of an unresolved bug, see KNOWN-ISSUE-U-SHAPE.md), all three arms sit SIDE
// BY SIDE horizontally, each one a normal vertical rectangle built by the same
// buildSingleSidedWingGeometry() already proven correct for planL's two arms. Order left
// to right: left arm | spine (middle, widest) | right arm. Each arm's corridor runs along
// whichever inner edge faces its neighbour, so a bridge corridor connects flush to open
// corridor space on both sides exactly as in planL — no new geometry class needed.
// U-shape (true courtyard house): two single-sided front flanks with an open courtyard
// between them, a cross gallery corridor behind them, and a standard double-sided back
// wing behind the gallery. Every arm reuses geometry proven in planL / planRectangle; the
// only new element is the gallery, returned as `extra` (corridor + walls + doors) in local
// coordinates. Doors pass through exactly one exterior wall each (flank back wall or back
// wing front wall), so validateModel's physical door check holds.
/** @param {Rect} f @param {ProgramRoom[]} program @param {boolean} sideways @returns {ShapePlan | null} */
function planU(f, program, sideways) {
  const localWidth = sideways ? f.h : f.w, localDepth = sideways ? f.w : f.h;
  const G = GEOMETRY.corridor, COURT = 3;
  const frontMid = program.filter(r => r.position !== 'back');
  // Small rooms cannot fill a full row of a single-sided flank, so they go to the back wing.
  const SMALL = 12;
  /** @type {ProgramRoom[]} */
  const backProgram = [
    ...program.filter(r => r.position === 'back'),
    ...frontMid.filter(r => r.side === 'any' && r.area < SMALL),
  ].map(r => ({ ...r, position: 'middle' }));
  const flankRooms = frontMid.filter(r => !(r.side === 'any' && r.area < SMALL));
  if (!backProgram.length || flankRooms.length < 2) return null;
  const leftProgram = flankRooms.filter(r => r.side === 'left');
  const rightProgram = flankRooms.filter(r => r.side === 'right');
  flankRooms.filter(r => r.side === 'any').sort((a, b) => b.area - a.area)
    .forEach(r => (sum(leftProgram, x => x.area) <= sum(rightProgram, x => x.area) ? leftProgram : rightProgram).push(r));
  if (!leftProgram.length || !rightProgram.length) return null;
  /** @type {{ left: SingleWingSolution, right: SingleWingSolution, back: WingSolution, overallW: number, overallH: number, Fh: number, score: number } | null} */
  let best = null;
  for (let flankW = Math.min(20, (localWidth - COURT) / 2); flankW >= 7; flankW -= .5) {
    const back = solveWing(backProgram, Math.min(20, localWidth), localDepth - 8);
    if (!back) return null;
    const flankMaxDepth = localDepth - back.depth - G;
    const left = solveSingleSidedWing(leftProgram, flankW, flankMaxDepth);
    if (!left) continue;
    const right = solveSingleSidedWing(rightProgram, flankW, flankMaxDepth);
    if (!right) continue;
    const overallW = Math.max(left.width + COURT + right.width, back.width);
    if (overallW > localWidth + E) continue;
    const Fh = Math.max(left.depth, right.depth);
    const overallH = Fh + G + back.depth;
    const score = overallW * overallH;
    if (!best || score < best.score) best = { left, right, back, overallW, overallH, Fh, score };
  }
  if (!best) return null;
  const { back, overallW, overallH, Fh } = best;
  const left = { ...best.left, depth: Fh }, right = { ...best.right, depth: Fh };
  const leftBox = { id: 'left', x: 0, y: 0, w: left.width, h: Fh };
  const rightBox = { id: 'right', x: overallW - right.width, y: 0, w: right.width, h: Fh };
  const backBox = { id: 'back', x: (overallW - back.width) / 2, y: Fh + G, w: back.width, h: back.depth };
  const gy = Fh, gallery = { id: 'gallery', name: 'رواق', x: X, y: gy, w: overallW - 2 * X, h: G };
  /** @type {WallSeg[]} */
  const walls = [
    // courtyard-facing wall between the flanks, collinear with their back walls (merged).
    { x1: X / 2, y1: gy - X / 2, x2: overallW - X / 2, y2: gy - X / 2, type: 'ext' },
    // gallery rear wall, collinear with the back wing's front wall.
    { x1: X / 2, y1: gy + G + X / 2, x2: overallW - X / 2, y2: gy + G + X / 2, type: 'ext' },
    // courtyard-facing walls of each flank, just outside the flank box so the flank's
    // corridor (flush with its box edge) stays clear.
    { x1: leftBox.x + leftBox.w + X / 2, y1: X / 2, x2: leftBox.x + leftBox.w + X / 2, y2: gy - X / 2, type: 'ext' },
    { x1: rightBox.x - X / 2, y1: X / 2, x2: rightBox.x - X / 2, y2: gy - X / 2, type: 'ext' },
    // gallery end walls.
    { x1: X / 2, y1: gy - X / 2, x2: X / 2, y2: gy + G + X / 2, type: 'ext' },
    { x1: overallW - X / 2, y1: gy - X / 2, x2: overallW - X / 2, y2: gy + G + X / 2, type: 'ext' },
  ];
  // Corridor x-centres of each arm (single-sided flanks: corridor on the courtyard side).
  const leftCx = leftBox.x + leftBox.w - G / 2, rightCx = rightBox.x + G / 2;
  const backWing = (backBox.w - X * 2 - T * 2 - G) / 2, backCx = backBox.x + X + backWing + T + G / 2;
  /** @type {Portal[]} */
  const doors = [
    { type: 'door', x: leftCx, y: gy - X / 2, axis: 'h', w: 1.1, h: 2.2, sill: 0, connects: ['spine-left', 'gallery'] },
    { type: 'door', x: rightCx, y: gy - X / 2, axis: 'h', w: 1.1, h: 2.2, sill: 0, connects: ['spine-right', 'gallery'] },
    { type: 'door', x: backCx, y: gy + G + X / 2, axis: 'h', w: 1.1, h: 2.2, sill: 0, connects: ['gallery', 'spine-back'] },
  ];
  const courtyard = { name: 'فناء', x: leftBox.w + X, y: 0, w: rightBox.x - X - (leftBox.w + X), h: gy - X };
  // footprintPolygon: a true U, eight points, consistent winding with the other shapes,
  // with the courtyard
  // cut as an inward notch on the front edge (y=0..gy-X) between the two flanks. Built
  // directly from courtyard's own x/w and gy so the polygon can never disagree with the
  // hole validateModel checks rooms/corridors against.
  const cLeft = courtyard.x, cRight = courtyard.x + courtyard.w, cBack = courtyard.y + courtyard.h;
  const footprintPolygon = [
    { x: 0, y: 0 }, { x: cLeft, y: 0 }, { x: cLeft, y: cBack }, { x: cRight, y: cBack },
    { x: cRight, y: 0 }, { x: overallW, y: 0 }, { x: overallW, y: overallH }, { x: 0, y: overallH },
  ];
  return {
    arms: [
      { id: 'left', box: leftBox, zone: left, program: leftProgram, single: true, corridorSide: 'right', openEdges: ['right'] },
      { id: 'right', box: rightBox, zone: right, program: rightProgram, single: true, corridorSide: 'left', openEdges: ['left'] },
      { id: 'back', box: backBox, zone: back.zones, program: backProgram, single: false },
    ],
    extra: { corridors: [gallery], walls, doors, courtyards: [courtyard] },
    overallW, overallH, footprintPolygon,
  };
}
const SHAPE_PLANNERS = { rect: planRectangle, l: planL, u: planU };

/** Local planning frame -> plot frame. @param {Plot} p @param {Rect} f */
function mapper(p, f) {
  /** @param {number} x @param {number} y @returns {Point} */
  const point = (x, y) => p.entry === 's' ? { x: f.x + x, y: f.y + y } : p.entry === 'n' ? { x: f.x + f.w - x, y: f.y + f.h - y } : p.entry === 'e' ? { x: f.x + f.w - y, y: f.y + x } : { x: f.x + y, y: f.y + f.h - x };
  /** @template {Rect} R @param {R} r @returns {R} */
  const rect = r => { const a = point(r.x, r.y), b = point(r.x + r.w, r.y + r.h); return { ...r, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; };
  return { point, rect };
}
/** @param {RawWall[]} raw @returns {Wall[]} */
function mergeWalls(raw) {
  /** @type {Map<string, WallBin>} */
  const bins = new Map();
  raw.forEach(w => {
    const vertical = near(w.x1, w.x2), fixed = vertical ? w.x1 : w.y1;
    const a = Math.min(vertical ? w.y1 : w.x1, vertical ? w.y2 : w.x2), b = Math.max(vertical ? w.y1 : w.x1, vertical ? w.y2 : w.x2);
    const key = (vertical ? 'v' : 'h') + fixed.toFixed(5) + w.type;
    if (!bins.has(key)) bins.set(key, { vertical, fixed, type: w.type, t: w.t, ranges: [] });
    /** @type {WallBin} */ (bins.get(key)).ranges.push([a, b]);
  });
  /** @type {Wall[]} */
  const walls = [];
  for (const bin of bins.values()) {
    /** @type {[number, number][]} */
    const ranges = [];
    bin.ranges.sort((a, b) => a[0] - b[0]).forEach(r => {
      const last = ranges.at(-1);
      if (last && r[0] <= last[1] + E) last[1] = Math.max(last[1], r[1]); else ranges.push([...r]);
    });
    ranges.forEach(([a, b]) => walls.push({ id: 'wall-' + walls.length, x1: bin.vertical ? bin.fixed : a, y1: bin.vertical ? a : bin.fixed, x2: bin.vertical ? bin.fixed : b, y2: bin.vertical ? b : bin.fixed, type: bin.type, t: bin.t, h: GEOMETRY.height }));
  }
  return walls;
}

// ── Generate full wall/opening geometry for one rectangular arm's rooms, in LOCAL
// (pre-transform) coordinates, given the arm's own bounding box for exterior-edge detection.
/** @param {Room[]} armRooms @param {Rect} armBox @param {Edge[]} [openEdges] @returns {{ rawWalls: RawWall[], portals: Portal[] }} */
function buildArmWalls(armRooms, armBox, openEdges = []) {
  const rawWalls = /** @type {RawWall[]} */ ([]), portals = /** @type {Portal[]} */ ([]);
  /** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {'ext'|'int'} type */
  const wall = (x1, y1, x2, y2, type) => rawWalls.push({ x1, y1, x2, y2, type, t: type === 'ext' ? X : T });
  const { x: bx, y: by, w: bw, h: bh } = armBox;
  // An edge in openEdges is where this arm physically joins another arm (via a bridge
  // corridor) — no exterior wall is built there, so the bridge can actually connect.
  if (!openEdges.includes('front')) wall(bx + X / 2, by + X / 2, bx + bw - X / 2, by + X / 2, 'ext');
  if (!openEdges.includes('back')) wall(bx + X / 2, by + bh - X / 2, bx + bw - X / 2, by + bh - X / 2, 'ext');
  if (!openEdges.includes('left')) wall(bx + X / 2, by + X / 2, bx + X / 2, by + bh - X / 2, 'ext');
  if (!openEdges.includes('right')) wall(bx + bw - X / 2, by + X / 2, bx + bw - X / 2, by + bh - X / 2, 'ext');
  armRooms.forEach(r => {
    const leftExt = near(r.x, bx + X), rightExt = near(r.x + r.w, bx + bw - X), frontExt = near(r.y, by + X), backExt = near(r.y + r.h, by + bh - X);
    if (!leftExt) wall(r.x - T / 2, r.y - T / 2, r.x - T / 2, r.y + r.h + T / 2, 'int');
    if (!rightExt) wall(r.x + r.w + T / 2, r.y - T / 2, r.x + r.w + T / 2, r.y + r.h + T / 2, 'int');
    if (!frontExt) wall(r.x - T / 2, r.y - T / 2, r.x + r.w + T / 2, r.y - T / 2, 'int');
    if (!backExt) wall(r.x - T / 2, r.y + r.h + T / 2, r.x + r.w + T / 2, r.y + r.h + T / 2, 'int');
    const frontDoor = r.doorSide === 'front', backDoor = r.doorSide === 'back';
    const doorX = (frontDoor || backDoor) ? r.x + r.w / 2 : r.doorSide === 'right' ? r.x + r.w + T / 2 : r.x - T / 2;
    portals.push({ type: 'door', x: doorX, y: frontDoor ? r.y - T / 2 : backDoor ? r.y + r.h + T / 2 : r.y + r.h / 2, axis: (frontDoor || backDoor) ? 'h' : 'v', w: r.type === 'bath' ? .8 : .9, h: 2.1, sill: 0, roomId: r.id, connects: [r.id, r.corridorId] });
    const extEdge = leftExt ? 'left' : rightExt ? 'right' : backExt ? 'back' : frontExt ? 'front' : null;
    if (extEdge) {
      const horizontal = ['front', 'back'].includes(extEdge);
      portals.push({ type: 'window', x: horizontal ? r.x + r.w / 2 : extEdge === 'left' ? bx + X / 2 : bx + bw - X / 2, y: horizontal ? extEdge === 'front' ? by + X / 2 : by + bh - X / 2 : r.y + r.h / 2, axis: horizontal ? 'h' : 'v', w: Math.min(r.type === 'bath' ? .7 : 1.4, (horizontal ? r.w : r.h) - .5), h: r.type === 'bath' ? .6 : 1.2, sill: r.type === 'bath' ? 1.7 : 1.1, roomId: r.id });
    }
  });
  return { rawWalls, portals };
}

/** @param {PlotInput} rawPlot @param {RoomRequest[]} rawRooms @returns {ValidatedDesignGeometry} */
function generateModelCore(rawPlot, rawRooms) {
  const plot = validatePlot(rawPlot), f = footprint(plot), program = normalizeRooms(rawRooms);
  const sideways = ['e', 'w'].includes(plot.entry);
  const required = sum(program, r => r.area);
  if (required > f.area) throw Error('مجموع مساحات الغرف أكبر من المساحة المتاحة قبل إضافة الجدران والممرات. لم تتغيّر مساحاتك.');

  /** @type {ShapeKey[]} */
  const planners = plot.shape === 'rect' ? ['rect'] : [plot.shape, 'rect'];
  let plan = /** @type {ShapePlan | null} */ (null), usedShape = plot.shape, shapeFallback = false;
  for (const shapeKey of planners) {
    plan = SHAPE_PLANNERS[shapeKey](f, program, sideways);
    if (plan) { usedShape = shapeKey; shapeFallback = shapeKey !== plot.shape; break; }
  }
  if (!plan) throw Error('لم يجد محرك التخطيط توزيعاً يحافظ على المساحات والمواقع المطلوبة وممرات الوصول لهذا الشكل والأرض. جرّب تعديل المواقع أو المساحات أو أبعاد الأرض، أو اختر شكلاً آخر؛ لم تُحذف أو تُصغّر أي غرفة.');

  const localWidth = sideways ? f.h : f.w, localDepth = sideways ? f.w : f.h;
  const offsetX = (localWidth - plan.overallW) / 2, offsetY = (localDepth - plan.overallH) / 2;
  const transform = mapper(plot, f);

  const allRooms = /** @type {Room[]} */ ([]), allCorridors = /** @type {Corridor[]} */ ([]), allReserves = /** @type {Reserve[]} */ ([]), allLinks = /** @type {Link[]} */ ([]);
  const armGeoms = plan.arms.map(arm => {
    const shiftedBox = { ...arm.box, x: arm.box.x + offsetX, y: arm.box.y + offsetY };
    const geo = !arm.single ? buildWingGeometry(arm.zone, shiftedBox) : arm.vertical ? buildSingleSidedWingGeometryVertical(arm.zone, shiftedBox, arm.corridorSide) : buildSingleSidedWingGeometry(arm.zone, shiftedBox, arm.corridorSide);
    return { ...arm, box: shiftedBox, geo };
  });
  armGeoms.forEach(({ geo }) => { allRooms.push(...geo.rooms); allCorridors.push(...geo.corridors); allReserves.push(...geo.reserves); allLinks.push(...geo.links); });

  // Cross-arm connectivity is proven only through real physical doorways added below
  // (validateModel's reachability graph walks both `links`, meant for geometrically
  // touching same-arm spine/branch corridor pairs, and door `connects` pairs together).
  // No placeholder cross-arm link is added here, so nothing needs superseding later.
  const entryArm = armGeoms[0];

  const rawWalls = /** @type {RawWall[]} */ ([]), portals = /** @type {Portal[]} */ ([]);
  armGeoms.forEach(({ box, geo, openEdges }) => {
    const { rawWalls: w, portals: p } = buildArmWalls(geo.rooms, box, openEdges || []);
    rawWalls.push(...w); portals.push(...p);
  });
  // Where two arms sit side by side with a gap between them (the T*2 partition gap left
  // by the shape planners), fill that gap with an actual bridge corridor that spans
  // EXACTLY from one arm's own spine to the other's — not just the raw gap — because
  // packZone always centers each arm's spine mid-wing, which is generally not flush
  // with the shared boundary between arms. The bridge's own span (its y-range for
  // side-by-side arms, x-range for stacked arms) is the INTERSECTION of both spines'
  // own ranges, guaranteeing every point of the bridge sits directly against open
  // corridor on both ends — never against a room, since a spine's full length is by
  // construction corridor, not room, space. (rect shape has one arm: loop is a no-op.)
  /** @type {Corridor[]} */
  const bridgeCorridors = [];
  for (let i = 0; i < armGeoms.length; i++) {
    for (let j = i + 1; j < armGeoms.length; j++) {
      const prev = armGeoms[i], curr = armGeoms[j];
      const prevSpine = prev.geo.corridors[0], currSpine = curr.geo.corridors[0];
      const prevBox = prev.box, currBox = curr.box;
      // "Adjacent" means one arm's box starts roughly where the other's ends, within the
      // small partition gap the shape planners leave (T*2) — not merely "somewhere to
      // the right", which would also match arms on opposite sides of a shared spine (e.g.
      // U's left and right arms, which never touch each other directly).
      const maxGap = T * 2 + X + E;
      const gapX = currBox.x >= prevBox.x + prevBox.w - E ? currBox.x - (prevBox.x + prevBox.w) : prevBox.x - (currBox.x + currBox.w);
      const sideBySide = Math.abs(gapX) <= maxGap && (currBox.x >= prevBox.x + prevBox.w - E || prevBox.x >= currBox.x + currBox.w - E);
      if (sideBySide) {
        const spineOverlapStart = Math.max(prevSpine.y, currSpine.y), spineOverlapEnd = Math.min(prevSpine.y + prevSpine.h, currSpine.y + currSpine.h);
        const bridgeX = Math.min(prevSpine.x + prevSpine.w, currSpine.x), bridgeEnd = Math.max(prevSpine.x, currSpine.x + currSpine.w);
        const bridgeW = bridgeEnd - bridgeX;
        if (bridgeW > E && spineOverlapEnd - spineOverlapStart > E) {
          const bridge = { id: 'bridge-' + i + '-' + j, name: 'ممر رابط', x: bridgeX, y: spineOverlapStart, w: bridgeW, h: spineOverlapEnd - spineOverlapStart };
          bridgeCorridors.push(bridge);
          allLinks.push([prevSpine.id, bridge.id], [bridge.id, currSpine.id]);
          continue;
        }
      }
      const gapY = currBox.y >= prevBox.y + prevBox.h - E ? currBox.y - (prevBox.y + prevBox.h) : prevBox.y - (currBox.y + currBox.h);
      const stacked = Math.abs(gapY) <= maxGap && (currBox.y >= prevBox.y + prevBox.h - E || prevBox.y >= currBox.y + currBox.h - E);
      if (stacked) {
        const spineOverlapStart = Math.max(prevSpine.x, currSpine.x), spineOverlapEnd = Math.min(prevSpine.x + prevSpine.w, currSpine.x + currSpine.w);
        const bridgeY = Math.min(prevSpine.y + prevSpine.h, currSpine.y), bridgeEnd = Math.max(prevSpine.y, currSpine.y + currSpine.h);
        const bridgeH = bridgeEnd - bridgeY;
        if (bridgeH > E && spineOverlapEnd - spineOverlapStart > E) {
          const bridge = { id: 'bridge-' + i + '-' + j, name: 'ممر رابط', x: spineOverlapStart, y: bridgeY, w: spineOverlapEnd - spineOverlapStart, h: bridgeH };
          bridgeCorridors.push(bridge);
          allLinks.push([prevSpine.id, bridge.id], [bridge.id, currSpine.id]);
        }
      }
    }
  }
  allCorridors.push(...bridgeCorridors);
  // Shape-specific extras (e.g. the U-shape's gallery), given in local coordinates.
  if (plan.extra) {
    plan.extra.corridors.forEach(c => allCorridors.push({ ...c, x: c.x + offsetX, y: c.y + offsetY }));
    plan.extra.walls.forEach(w => rawWalls.push({ x1: w.x1 + offsetX, y1: w.y1 + offsetY, x2: w.x2 + offsetX, y2: w.y2 + offsetY, type: w.type, t: w.type === 'ext' ? X : T }));
    plan.extra.doors.forEach(d => portals.push({ ...d, x: d.x + offsetX, y: d.y + offsetY }));
  }
  /** @type {Courtyard[]} */
  const courtyardsLocal = (plan.extra?.courtyards || []).map(c => ({ ...c, x: c.x + offsetX, y: c.y + offsetY, roofPolicy: 'OPEN_TO_SKY', roofable: false }));
  const entrySpine = entryArm.geo.corridors[0];
  portals.push({ type: 'door', x: entrySpine.x + entrySpine.w / 2, y: entryArm.box.y + X / 2, axis: 'h', w: 1.1, h: 2.2, sill: 0, connects: ['outside', entrySpine.id] });

  const localWalls = mergeWalls(rawWalls);
  const openings = portals.map((o, i) => {
    const w = localWalls.find(w => o.axis === 'h' ? near(w.y1, w.y2) && near(w.y1, o.y) && o.x - o.w / 2 >= w.x1 - E && o.x + o.w / 2 <= w.x2 + E : near(w.x1, w.x2) && near(w.x1, o.x) && o.y - o.w / 2 >= w.y1 - E && o.y + o.w / 2 <= w.y2 + E);
    if (!w) throw Error('تعذر ربط إحدى الفتحات بجدار صالح.');
    const length = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    const pos = Math.hypot(o.x - w.x1, o.y - w.y1) / length;
    const { x, y, axis, ...rest } = o;
    return { ...rest, id: 'opening-' + i, wallId: w.id, pos };
  });
  const walls = localWalls.map(w => { const a = transform.point(w.x1, w.y1), b = transform.point(w.x2, w.y2); return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; });
  const buildingLocal = { x: offsetX, y: offsetY, w: plan.overallW, h: plan.overallH };
  // buildingFootprint: the true outer polygon, in world coordinates (offset applied,
  // then rotated/mirrored for entry direction). Every shape planner returns its own
  // footprintPolygon in the same local frame as its arm boxes; rect's is just its four
  // corners, so this path is uniform across all three shapes — no shape-specific case
  // needed here. boundingBox is derived FROM this polygon, never built independently,
  // so it can never silently drift from the true outline (Priority 1's requirement).
  const buildingFootprint = plan.footprintPolygon.map(pt => transform.point(pt.x + offsetX, pt.y + offsetY));
  const boundingBox = polygonBoundingBox(buildingFootprint);
  /** @type {ValidatedDesignGeometry} */
  const model = {
    version: 2, plot, footprint: f, building: transform.rect(buildingLocal), buildingFootprint, boundingBox, program,
    shape: usedShape, shapeFallback,
    rooms: allRooms.map(transform.rect), corridors: allCorridors.map(transform.rect), reserves: allReserves.map(transform.rect),
    courtyards: courtyardsLocal.map(transform.rect), links: allLinks, walls, openings, drawnFloors: 1, warnings: [],
  };
  const errors = validateModel(model);
  if (errors.length) throw Error(errors[0]);
  if (plot.floors > 1) model.warnings.push('المعروض والكميات للدور الأرضي فقط؛ الأدوار الأخرى والسلالم لم تُصمّم.');
  if (shapeFallback) model.warnings.push('تعذّر ملاءمة شكل «' + SHAPES[plot.shape] + '» ضمن الأرض والمساحات الحالية؛ استُخدم المستطيل المصمت بدلاً منه.');
  /** @type {Opening[]} */
  const typedOpenings = openings;
  const noWindows = model.rooms.filter(r => !typedOpenings.some(o => o.roomId === r.id && o.type === 'window'));
  if (noWindows.length) model.warnings.push('فراغات دون نافذة خارجية في هذا الحل: ' + noWindows.map(r => r.name).join('، ') + '. تحتاج مراجعة الإضاءة والتهوية.');
  if (model.courtyards.length) model.warnings.push('الفناء الأوسط مساحة مفتوحة غير مسقوفة، ومستثناة من مساحة الكتلة المبنية؛ الرواق الخلفي يربط الجناحين الأماميين بالجناح الخلفي.');
  if (allReserves.length) model.warnings.push('المساحات الرمادية غير موزعة وليست غرفاً مطلوبة؛ تظهر مساحتها مستقلة.');
  model.warnings.push('المساحات صافية بين أوجه الجدران. مدخل واحد؛ لا ضمان للفصل التام بين الضيوف والعائلة أو مطابقة كود البناء.');
  return model;
}

// Public entry point. If a non-rectangular shape solves geometrically but its model is
// rejected by validateModel, fall back to the proven rectangle rather than failing — the
// user's rooms are never shrunk or dropped either way.
/** @param {PlotInput} rawPlot @param {RoomRequest[]} rawRooms @returns {ValidatedDesignGeometry} @throws {Error} Arabic message if no valid layout exists */
export function generateModel(rawPlot, rawRooms) {
  const requestedShape = normalizeShapeKey(rawPlot?.shape);
  const normalizedPlot = rawPlot && typeof rawPlot === 'object' ? { ...rawPlot, shape: requestedShape } : rawPlot;
  try { return generateModelCore(normalizedPlot, rawRooms); }
  catch (error) {
    if (!normalizedPlot || requestedShape === 'rect') throw error;
    const model = generateModelCore({ ...normalizedPlot, shape: 'rect' }, rawRooms);
    model.shapeFallback = true;
    model.warnings.unshift('تعذّر إخراج شكل «' + SHAPES[requestedShape] + '» سليماً لهذه الأرض والمساحات؛ عُرض المستطيل المصمت بدلاً منه.');
    return model;
  }
}

/**
 * Precondition: o.wallId names a wall of model (true for every opening of a model returned by
 * generateModel). Otherwise this throws a TypeError -- it does not validate.
 * @param {ValidatedDesignGeometry} model @param {Opening} o @returns {Point}
 */
export function openingPoint(model, o) {
  const w = /** @type {Wall} */ (model.walls.find(w => w.id === o.wallId));
  return { x: w.x1 + (w.x2 - w.x1) * o.pos, y: w.y1 + (w.y2 - w.y1) * o.pos };
}
/** @param {ValidatedDesignGeometry} m @returns {string[]} unique Arabic error messages; empty = valid */
export function validateModel(m) {
  const errors = /** @type {string[]} */ ([]), fail = (/** @type {string} */ s) => errors.push(s);
  /** @param {Rect} r @param {Point} p */
  const containsPoint = (r, p) => p.x >= r.x - E && p.x <= r.x + r.w + E && p.y >= r.y - E && p.y <= r.y + r.h + E;
  const nodes = new Map([...m.rooms, ...m.corridors].map(r => /** @type {[string, Rect]} */ ([r.id, r])));
  if (nodes.size !== m.rooms.length + m.corridors.length || new Set(m.walls.map(w => w.id)).size !== m.walls.length || new Set(m.openings.map(o => o.id)).size !== m.openings.length) fail('معرّفات هندسية مكررة.');
  // Uses the true polygon, not just its bounding box: a notched shape (L/U) can have a
  // bounding box that pokes outside the plot even when the actual built area does not,
  // or vice versa for an oddly-shaped plot — checking every polygon vertex is precise
  // either way, since this engine only ever produces axis-aligned rectangular plots.
  if (!m.buildingFootprint.every(pt => containsPoint(m.footprint, pt))) fail('كتلة المبنى تتجاوز المساحة المتاحة.');
  if (m.rooms.length !== m.program.length) fail('عدد الغرف لا يطابق البرنامج.');
  const programById = new Map(m.program.map(p => [p.id, p]));
  if (programById.size !== m.program.length) fail('معرّفات البرنامج مكررة.');
  m.program.forEach(p => {
    if (!p || typeof p.id !== 'string' || !p.id || !Number.isFinite(p.area) || !Number.isFinite(p.targetArea) || p.area <= 0 || p.targetArea <= 0 || Math.abs(p.area - p.targetArea) > E) fail('برنامج غرف غير صالح.');
  });
  m.corridors.forEach(c => { if (![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.w <= 0 || c.h <= 0 || !rectInPolygon(c, m.buildingFootprint)) fail('ممر غير صالح.'); });
  // Explicit courtyard-void proof (Priority 2): a courtyard is a hole, not a room, a
  // corridor, built area, an interior slab, or a future roof surface — no room and no
  // corridor may overlap ANY courtyard's rectangle, checked directly against
  // model.courtyards rather than only inferred from buildingFootprint's notch shape.
  const courtyards = Array.isArray(m.courtyards) ? m.courtyards : [];
  if (m.shape === 'u' && courtyards.length !== 1) fail('شكل U يتطلب فناءً واحداً مطابقاً لفتحة الكتلة.');
  if (m.shape !== 'u' && courtyards.length) fail('الفناء غير متوقع لهذا الشكل.');
  courtyards.forEach(c => {
    if (![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.w <= 0 || c.h <= 0 || !containsPoint(m.footprint, { x: c.x, y: c.y }) || !containsPoint(m.footprint, { x: c.x + c.w, y: c.y + c.h })) fail('أبعاد أو موقع الفناء غير صالح: ' + (c.name || 'فناء') + '.');
    if (m.shape === 'u') {
      const corners = [{ x: c.x, y: c.y }, { x: c.x + c.w, y: c.y }, { x: c.x + c.w, y: c.y + c.h }, { x: c.x, y: c.y + c.h }];
      /** @param {Point} p */
      /** @param {Point} p */
      const matchesVertex = p => m.buildingFootprint.some(v => near(v.x, p.x) && near(v.y, p.y));
      if (!corners.every(matchesVertex)) fail('الفناء لا يطابق فتحة شكل U.');
    }
    if (m.rooms.some(r => overlap(r, c))) fail('غرفة تقع داخل الفناء: ' + c.name + '.');
    if (m.corridors.some(cor => overlap(cor, c))) fail('ممر يعبر الفناء: ' + c.name + '.');
    if (!ROOF_POLICIES.includes(c.roofPolicy) || c.roofable !== (c.roofPolicy !== 'OPEN_TO_SKY')) fail('حالة تسقيف الفناء غير صالحة أو غير متسقة: ' + c.name + '.');
  });
  m.openings.forEach(o => {
    const wall = m.walls.find(w => w.id === o.wallId);
    if (!wall || ![o.pos, o.w, o.h, o.sill].every(Number.isFinite) || o.w <= 0 || o.h <= 0 || o.sill < 0 || !['door', 'window'].includes(o.type)) { fail('فتحة غير صالحة.'); return; }
    if (o.type !== 'door') return;
    if (o.sill !== 0 || o.connects?.length !== 2) { fail('اتصال باب غير صالح.'); return; }
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1), dx = (wall.x2 - wall.x1) / length, dy = (wall.y2 - wall.y1) / length, p = openingPoint(m, o);
    /** @param {string} id @param {Point} point */
    const onNode = (id, point) => id === 'outside' ? !pointInPolygon(m.buildingFootprint, point) : nodes.has(id) && containsPoint(/** @type {Rect} */ (nodes.get(id)), point);
    for (const along of [-o.w / 2 + .02, 0, o.w / 2 - .02]) {
      const a = { x: p.x + dx * along - dy * (wall.t / 2 + .02), y: p.y + dy * along + dx * (wall.t / 2 + .02) };
      const b = { x: p.x + dx * along + dy * (wall.t / 2 + .02), y: p.y + dy * along - dx * (wall.t / 2 + .02) };
      if (!(onNode(o.connects[0], a) && onNode(o.connects[1], b) || onNode(o.connects[1], a) && onNode(o.connects[0], b))) fail('الباب لا يفتح فعلياً بين الفراغين المرتبطين به.');
    }
  });
  m.links.forEach(([aId, bId]) => {
    const a = m.corridors.find(c => c.id === aId), b = m.corridors.find(c => c.id === bId);
    if (!a || !b) { fail('اتصال ممر مفقود.'); return; }
    const sharedX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), sharedY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (!(sharedX >= -.001 && sharedY >= GEOMETRY.branch - E || sharedY >= -.001 && sharedX >= GEOMETRY.branch - E)) fail('الممر الفرعي غير متصل هندسياً بالممر الرئيسي.');
  });
  for (const r of m.rooms) {
    if (![r.x, r.y, r.w, r.h, r.targetArea].every(Number.isFinite) || r.w <= 0 || r.h <= 0 || r.targetArea <= 0 || !rectInPolygon(r, m.buildingFootprint)) fail('أبعاد غير صالحة للفراغ: ' + r.name);
    const requested = programById.get(r.id);
    if (!requested || !Number.isFinite(requested.targetArea) || Math.abs(r.targetArea - requested.targetArea) > E || Math.abs(r.w * r.h - requested.targetArea) > E) fail('المساحة غير مطابقة لطلبك: ' + r.name);
    if (r.side !== 'any' && r.resolvedSide !== r.side) fail('الجانب المطلوب لم يتحقق: ' + r.name);
    if (m.corridors.some(c => overlap(r, c))) fail('غرفة تتداخل مع ممر: ' + r.name);
  }
  m.rooms.forEach((a, i) => m.rooms.slice(i + 1).forEach(b => { if (overlap(a, b)) fail('غرف متداخلة: ' + a.name + ' و' + b.name); }));
  for (const w of m.walls) {
    if (![w.x1, w.y1, w.x2, w.y2, w.t, w.h].every(Number.isFinite) || w.t <= 0 || w.h <= 0 || Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < E || !(near(w.x1, w.x2) || near(w.y1, w.y2))) { fail('جدار غير صالح.'); continue; }
    if (m.rooms.some(r => near(w.x1, w.x2) ? w.x1 > r.x + E && w.x1 < r.x + r.w - E && Math.min(w.y1, w.y2) < r.y + r.h - E && Math.max(w.y1, w.y2) > r.y + E : w.y1 > r.y + E && w.y1 < r.y + r.h - E && Math.min(w.x1, w.x2) < r.x + r.w - E && Math.max(w.x1, w.x2) > r.x + E)) fail('يوجد جدار يقطع داخل غرفة.');
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), ops = m.openings.filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos);
    ops.forEach((o, i) => {
      if (o.pos * len - o.w / 2 < -E || o.pos * len + o.w / 2 > len + E || o.sill + o.h > w.h + E) fail('فتحة خارج حدود الجدار.');
      if (i && (o.pos - ops[i - 1].pos) * len < (o.w + ops[i - 1].w) / 2 - E) fail('فتحات متداخلة.');
      if (o.type === 'window' && w.type !== 'ext') fail('نافذة على جدار غير خارجي.');
    });
  }
  if (!errors.length) wallPieces(m).filter(p => p.bottom < 1.6 && p.bottom + p.height > 1.6).forEach(p => {
    const horizontal = Math.abs(Math.sin(p.angle)) < E;
    const r = { x: p.x - (horizontal ? p.length : p.thickness) / 2, y: p.y - (horizontal ? p.thickness : p.length) / 2, w: horizontal ? p.length : p.thickness, h: horizontal ? p.thickness : p.length };
    if (m.corridors.some(c => overlap(c, r))) fail('يوجد جدار يعوق المساحة الصافية للممر.');
  });
  const graph = /** @type {Map<string, Set<string>>} */ (new Map()), connect = (/** @type {string} */ a, /** @type {string} */ b) => { if (!graph.has(a)) graph.set(a, new Set()); /** @type {Set<string>} */ (graph.get(a)).add(b); };
  [...m.links, ...m.openings.filter(o => o.type === 'door').map(o => o.connects)].forEach(pair => { if (pair?.length === 2) { connect(...pair); connect(pair[1], pair[0]); } });
  const reached = new Set(['outside']), queue = ['outside'];
  while (queue.length) for (const b of graph.get(/** @type {string} */ (queue.shift())) || []) if (!reached.has(b)) { reached.add(b); queue.push(b); }
  m.rooms.forEach(r => { if (!reached.has(r.id)) fail('لا يوجد مسار باب متصل بالمدخل للفراغ: ' + r.name); });
  return [...new Set(errors)];
}

// Exact wall pieces, with openings removed; consumed by both 3D and quantity take-off.
/** @param {ValidatedDesignGeometry} model @returns {WallPiece[]} */
export function wallPieces(model) {
  /** @type {WallPiece[]} */
  const pieces = [];
  model.walls.forEach(w => {
    const length = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), ux = (w.x2 - w.x1) / length, uy = (w.y2 - w.y1) / length;
    /** @param {number} start @param {number} end @param {number} bottom @param {number} height */
    const add = (start, end, bottom, height) => { if (end - start > E && height > E) pieces.push({ wallId: w.id, x: w.x1 + ux * (start + end) / 2, y: w.y1 + uy * (start + end) / 2, length: end - start, thickness: w.t, height, bottom, angle: Math.atan2(uy, ux), type: w.type }); };
    let cursor = 0;
    model.openings.filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos).forEach(o => {
      const start = o.pos * length - o.w / 2, end = o.pos * length + o.w / 2;
      add(cursor, start, 0, w.h); add(start, end, 0, o.sill); add(start, end, o.sill + o.h, w.h - o.sill - o.h); cursor = end;
    });
    add(cursor, length, 0, w.h);
  });
  return pieces;
}
/** @param {ValidatedDesignGeometry} model @returns {Quantities} */
export function quantities(model) {
  const netWallArea = sum(wallPieces(model), p => p.length * p.height);
  return { footprint: polygonArea(model.buildingFootprint), courtyard: sum(model.courtyards || [], c => c.w * c.h), rooms: sum(model.rooms, r => r.w * r.h), circulation: sum(model.corridors, r => r.w * r.h), reserve: sum(model.reserves, r => r.w * r.h), wallArea: netWallArea, finishArea: netWallArea * 2, wallVolume: sum(wallPieces(model), p => p.length * p.height * p.thickness), doors: model.openings.filter(o => o.type === 'door').length, windows: model.openings.filter(o => o.type === 'window').length, floors: 1 };
}

// Alias for backward compat and convenience
export const plan = generateModel;
