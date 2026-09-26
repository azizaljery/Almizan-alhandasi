import type { Point, Polygon, BoundingBox } from './types.js';
export declare function signedArea(pts: Point[]): number;
export declare function pointOnSegment(p: Point, a: Point, b: Point, eps?: number): boolean;
export declare function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean;
export declare function isValidPolygon(p: Polygon | undefined | null): p is Polygon;
export declare function polygonArea(p: Polygon): number;
export declare function bboxOf(p: Polygon): BoundingBox;
export declare function bboxOverlap(a: BoundingBox, b: BoundingBox, eps?: number): boolean;
export declare function polygonsOverlap(a: Polygon, b: Polygon): boolean;
export declare function polygonContains(outer: Polygon, inner: Polygon): boolean;
export declare function pointInPolygon(p: Point, poly: Polygon): boolean;
export declare function centroidOf(poly: Polygon): Point;
//# sourceMappingURL=geometry.d.ts.map