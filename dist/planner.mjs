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
