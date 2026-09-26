// PlannerOutputContract.mjs -- Type contract of the Planner (JSDoc typedefs, checked by tsc --strict).
// Single source of truth for the shapes that generateModel() accepts and returns.
// planner.mjs and estimates.mjs import these types; a drift between this file and the
// runtime objects is a typecheck failure, not a documentation bug.
// No runtime code except CONTRACT_VERSION.

// ---------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------
/** @typedef {{ x: number, y: number }} Point  Metres. */
/** @typedef {{ x: number, y: number, w: number, h: number }} Rect  Axis-aligned, metres. */
/** @typedef {Point[]} Polygon  Closed implicitly (last point joins first). Winding not load-bearing (even-odd rule). */
/** @typedef {'s'|'n'|'e'|'w'} Direction */
/** @typedef {'rect'|'l'|'u'} ShapeKey */
/** @typedef {'bedroom'|'majlis'|'living'|'dining'|'kitchen'|'bath'|'storage'|'service'|'corridor'} RoomType */
/** @typedef {'front'|'middle'|'back'} Position */
/** @typedef {'left'|'right'|'any'} Side */
/** @typedef {'left'|'right'} ResolvedSide */
/** @typedef {'front'|'back'|'left'|'right'} Edge */

// ---------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------
/**
 * What callers pass to generateModel() as the plot. Validated by validatePlot(), which throws
 * (Arabic message) on any violation.
 * @typedef {Object} PlotInput
 * @property {number} width   8..100 m
 * @property {number} length  8..100 m
 * @property {number} floors  integer 1..3 (only the ground floor is drawn)
 * @property {Direction} entry  must be a side whose street flag is true
 * @property {Partial<Record<Direction, boolean>>} [streets]  a side counts as a street only if exactly `true`
 * @property {string | null} [shape]  'rect'|'l'|'u', case- and space-insensitive; missing/null/blank -> 'rect';
 *   any other value throws (see normalizeShapeKey). v2.2.0 silently mapped unknown keys to 'rect'.
 * @property {number} [streetSetback]    0..15, default 3
 * @property {number} [neighborSetback]  0..15, default 1.5
 * @property {number} [coverage]         0.1..0.9, default 0.75
 */

/**
 * One requested space. generateModel() takes 1..30 of these.
 * @typedef {Object} RoomRequest
 * @property {string} name  non-empty after trim, <= 70 chars
 * @property {RoomType} type
 * @property {number} area  net m², 4..120; placed rooms keep it exactly (±1e-5)
 * @property {Position} position
 * @property {Side} side
 */

// ---------------------------------------------------------------------------------------
// Normalised / derived inputs (echoed back in the model)
// ---------------------------------------------------------------------------------------
/**
 * @typedef {Object} Plot  Output of validatePlot(): defaults applied, all four street flags present.
 * @property {number} width
 * @property {number} length
 * @property {number} floors
 * @property {Record<string, boolean>} streets  keys s,n,e,w
 * @property {Direction} entry
 * @property {number} streetSetback
 * @property {number} neighborSetback
 * @property {number} coverage
 * @property {ShapeKey} shape
 */

/** @typedef {Rect & { sb: Record<string, number>, area: number }} Footprint  Buildable area after setbacks/coverage; sb = setback per side. */

/**
 * @typedef {Object} ProgramRoom  Output of normalizeRooms().
 * @property {string} id  'room-<index>' in request order; stable across reruns
 * @property {string} name
 * @property {RoomType} type
 * @property {number} area
 * @property {number} targetArea  copy of area; validateModel checks w*h against it
 * @property {Position} position  may be rewritten to 'middle' inside L/U arms
 * @property {Side} side          may be rewritten to 'any' inside single-sided arms
 */

// ---------------------------------------------------------------------------------------
// Output geometry. ALL coordinates are in the PLOT frame: origin = plot SW corner,
// x east, y north, metres -- regardless of entry direction. (Shape planners work in a
// local frame with the entry at y = 0; mapper() converts to the plot frame before output.)
// ---------------------------------------------------------------------------------------
/** @typedef {ProgramRoom & Rect & { resolvedSide: ResolvedSide, corridorId: string, doorSide: Edge }} Room */
/** @typedef {Rect & { id: string, name: string }} Corridor  ids: 'spine', 'branch-*', 'spine-<arm>', 'bridge-i-j', 'gallery' */
/** @typedef {Rect & { name: string }} Reserve  Unassigned leftover area (shown grey, not a room). */

/**
 * Roof state of a courtyard -- a description of THIS courtyard, not a property of courtyards in general.
 *   OPEN_TO_SKY       IMPLEMENTED: emitted by the engine, excluded from quantities().footprint, viewers render an open void.
 *   PARTIALLY_COVERED RESERVED: schema-valid only. Never emitted; quantities() throws; no rendering requirement.
 *   COVERED_ATRIUM    RESERVED: same as above.
 * Runtime table: ROOF_POLICY_SUPPORT in planner.mjs. Stored v2.1.x models lack this field: load them
 * through importModel() in migrations.mjs (see docs/IMPORT-MIGRATION.md).
 * @typedef {'OPEN_TO_SKY'|'PARTIALLY_COVERED'|'COVERED_ATRIUM'} RoofPolicy
 */
/**
 * Void cut out of buildingFootprint (U only). No room or corridor may overlap it.
 * @typedef {Rect & { name: string, roofPolicy: RoofPolicy, roofable: boolean }} Courtyard
 * roofable: derived, kept for v2.0 callers. Invariant (checked by validateModel):
 *   roofable === (roofPolicy !== 'OPEN_TO_SKY')
 * quantities().footprint excludes every courtyard whatever its roofPolicy; how a covered
 * atrium enters floor/roof quantities is not defined in contract v2.
 */

/**
 * @typedef {Object} Wall  Merged where collinear.
 * @property {string} id
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {'ext'|'int'} type
 * @property {number} t  thickness: 0.25 ext, 0.15 int
 * @property {number} h  height of the drawn storey
 */

/**
 * @typedef {Object} Opening
 * @property {string} id
 * @property {'door'|'window'} type
 * @property {string} wallId
 * @property {number} pos   centre position along the wall, 0..1 of its length
 * @property {number} w
 * @property {number} h
 * @property {number} sill  0 for doors
 * @property {string} [roomId]  room doors and room windows; absent on the entry door and U gallery doors
 * @property {[string, string]} [connects]  doors only: two node ids (room, corridor, or 'outside')
 */

/** @typedef {[string, string]} Link  Two corridor ids that share an edge >= branch width (same-arm spine/branch, or a bridge). */

/**
 * @typedef {Object} ValidatedDesignGeometry  Return value of generateModel(); always passed validateModel().
 * @property {number} version  2
 * @property {Plot} plot
 * @property {Footprint} footprint
 * @property {Rect} building  DEPRECATED: equals boundingBox; kept for v1 callers
 * @property {Polygon} buildingFootprint  source of truth: rect 4 pts, L 6 pts, U 8 pts
 * @property {Rect} boundingBox  derived from buildingFootprint, never built independently
 * @property {ShapeKey} shape  shape actually built
 * @property {boolean} shapeFallback  true if the requested shape was replaced by 'rect'
 * @property {ProgramRoom[]} program
 * @property {Room[]} rooms
 * @property {Corridor[]} corridors
 * @property {Reserve[]} reserves
 * @property {Courtyard[]} courtyards  empty for rect and l
 * @property {Link[]} links
 * @property {Wall[]} walls
 * @property {Opening[]} openings
 * @property {number} drawnFloors  1
 * @property {string[]} warnings
 */

// ---------------------------------------------------------------------------------------
// Derived outputs
// ---------------------------------------------------------------------------------------
/**
 * @typedef {Object} WallPiece  Solid wall segment after removing openings (3D + take-off).
 * @property {string} wallId
 * @property {number} x
 * @property {number} y
 * @property {number} length
 * @property {number} thickness
 * @property {number} height
 * @property {number} bottom
 * @property {number} angle  radians
 * @property {'ext'|'int'} type
 */

/**
 * @typedef {Object} Quantities  Ground floor only.
 * @property {number} footprint  polygonArea(buildingFootprint) -- courtyard excluded
 * @property {number} courtyard
 * @property {number} rooms
 * @property {number} circulation
 * @property {number} reserve
 * @property {number} wallArea    net of openings, one face
 * @property {number} finishArea  wallArea * 2
 * @property {number} wallVolume
 * @property {number} doors
 * @property {number} windows
 * @property {number} floors  1
 */

/** @typedef {{ key: string, name: string, unit: string, quantity: number }} QuantityRow */
/** @typedef {Record<string, number | '' | undefined>} Rates  '' or undefined = unpriced (not zero) */
/** @typedef {{ subtotal: number, contingency: number, tax: number, grand: number, priced: number, unpriced: number }} EstimateResult */

// ---------------------------------------------------------------------------------------
// Invariants enforced by validateModel() (a model violating any of them is never returned):
//  - ids of rooms+corridors, walls and openings are unique
//  - every buildingFootprint vertex lies inside footprint
//  - rooms.length === program.length, and every room's w*h equals targetArea (±1e-5)
//  - every room and corridor lies inside buildingFootprint (rectInPolygon)
//  - no room or corridor overlaps a courtyard; no room overlaps a corridor or another room
//  - a requested left/right side is honoured
//  - every opening sits on an existing wall, within its length, without overlapping another
//  - windows sit on exterior walls only
//  - every door has sill 0, connects two nodes, and physically opens between them
//  - every link joins two corridors that share an edge >= GEOMETRY.branch
//  - no wall cuts through a room; no wall piece blocks a corridor's clear width at 1.6 m
//  - every room is reachable from 'outside' through links and doors
// NOT checked: polygon simplicity (non-self-intersection) -- true by construction for rect/L/U only.
// ---------------------------------------------------------------------------------------

export const CONTRACT_VERSION = 2;
