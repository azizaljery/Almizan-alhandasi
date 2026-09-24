// PlannerOutputContract.mjs -- Type contract of the Planner (JSDoc typedefs, checked by tsc --strict).
// Single source of truth for the shapes that generateModel() accepts and returns.
// planner.mjs and estimates.mjs import these types; a drift between this file and the
// runtime objects is a typecheck failure, not a documentation bug.
// No runtime code except CONTRACT_VERSION.

/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/** @typedef {Point[]} Polygon */
/** @typedef {'s'|'n'|'e'|'w'} Direction */
/** @typedef {'rect'|'l'|'u'} ShapeKey */
/** @typedef {'bedroom'|'majlis'|'living'|'dining'|'kitchen'|'bath'|'storage'|'service'|'corridor'} RoomType */
/** @typedef {'front'|'middle'|'back'} Position */
/** @typedef {'left'|'right'|'any'} Side */
/** @typedef {'left'|'right'} ResolvedSide */
/** @typedef {'front'|'back'|'left'|'right'} Edge */
/**
 * @typedef {Object} PlotInput
 * @property {number} width
 * @property {number} length
 * @property {number} floors
 * @property {Direction} entry
 * @property {Partial<Record<Direction, boolean>>} [streets]
 * @property {ShapeKey} [shape]
 * @property {number} [streetSetback]
 * @property {number} [neighborSetback]
 * @property {number} [coverage]
 */
/**
 * @typedef {Object} RoomRequest
 * @property {string} name
 * @property {RoomType} type
 * @property {number} area
 * @property {Position} position
 * @property {Side} side
 */
/**
 * @typedef {Object} Plot
 * @property {number} width
 * @property {number} length
 * @property {number} floors
 * @property {Record<string, boolean>} streets
 * @property {Direction} entry
 * @property {number} streetSetback
 * @property {number} neighborSetback
 * @property {number} coverage
 * @property {ShapeKey} shape
 */
/** @typedef {Rect & { sb: Record<string, number>, area: number }} Footprint */
/**
 * @typedef {Object} ProgramRoom
 * @property {string} id
 * @property {string} name
 * @property {RoomType} type
 * @property {number} area
 * @property {number} targetArea
 * @property {Position} position
 * @property {Side} side
 */
/** @typedef {ProgramRoom & Rect & { resolvedSide: ResolvedSide, corridorId: string, doorSide: Edge }} Room */
/** @typedef {Rect & { id: string, name: string }} Corridor */
/** @typedef {Rect & { name: string }} Reserve */
/** @typedef {'OPEN_TO_SKY'|'PARTIALLY_COVERED'|'COVERED_ATRIUM'} RoofPolicy */
/** @typedef {Rect & { name: string, roofPolicy: RoofPolicy, roofable: boolean }} Courtyard */
/**
 * @typedef {Object} Wall
 * @property {string} id
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {'ext'|'int'} type
 * @property {number} t
 * @property {number} h
 */
/**
 * @typedef {Object} Opening
 * @property {string} id
 * @property {'door'|'window'} type
 * @property {string} wallId
 * @property {number} pos
 * @property {number} w
 * @property {number} h
 * @property {number} sill
 * @property {string} [roomId]
 * @property {[string, string]} [connects]
 */
/** @typedef {[string, string]} Link */
/**
 * @typedef {Object} ValidatedDesignGeometry
 * @property {number} version
 * @property {Plot} plot
 * @property {Footprint} footprint
 * @property {Rect} building
 * @property {Polygon} buildingFootprint
 * @property {Rect} boundingBox
 * @property {ShapeKey} shape
 * @property {boolean} shapeFallback
 * @property {ProgramRoom[]} program
 * @property {Room[]} rooms
 * @property {Corridor[]} corridors
 * @property {Reserve[]} reserves
 * @property {Courtyard[]} courtyards
 * @property {Link[]} links
 * @property {Wall[]} walls
 * @property {Opening[]} openings
 * @property {number} drawnFloors
 * @property {string[]} warnings
 */
/**
 * @typedef {Object} WallPiece
 * @property {string} wallId
 * @property {number} x
 * @property {number} y
 * @property {number} length
 * @property {number} thickness
 * @property {number} height
 * @property {number} bottom
 * @property {number} angle
 * @property {'ext'|'int'} type
 */
/**
 * @typedef {Object} Quantities
 * @property {number} footprint
 * @property {number} courtyard
 * @property {number} rooms
 * @property {number} circulation
 * @property {number} reserve
 * @property {number} wallArea
 * @property {number} finishArea
 * @property {number} wallVolume
 * @property {number} doors
 * @property {number} windows
 * @property {number} floors
 */
/** @typedef {{ key: string, name: string, unit: string, quantity: number }} QuantityRow */
/** @typedef {Record<string, number | '' | undefined>} Rates */
/** @typedef {{ subtotal: number, contingency: number, tax: number, grand: number, priced: number, unpriced: number }} EstimateResult */
export const CONTRACT_VERSION = 2;
