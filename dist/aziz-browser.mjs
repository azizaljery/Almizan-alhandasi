// @mizan/aziz-engine Candidate #4R3 browser runtime. Source artifact SHA-256: b764fce4283fae21ebc4446308873b589e5c938916f6d82f4117688398807168
const __mods=Object.create(null);
__mods["./util.js"]=function(module,exports,require){"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NonJsonInputError = exports.systemClock = void 0;
exports.fixedClock = fixedClock;
exports.deterministicId = deterministicId;
exports.stableStringify = stableStringify;
exports.fnv1aHash = fnv1aHash;
exports.systemClock = {
    nowIso: () => new Date().toISOString(),
    monotonicMs: () => typeof performance !== 'undefined' ? performance.now() : Date.now(),
};
function fixedClock(iso, monotonic = 0) {
    return { nowIso: () => iso, monotonicMs: () => monotonic };
}
class NonJsonInputError extends Error {
    constructor(message) {
        super(`NON_JSON_INPUT: ${message}`);
        this.name = 'NonJsonInputError';
    }
}
exports.NonJsonInputError = NonJsonInputError;
function deterministicId(prefix, parts) {
    return (prefix +
        ':' +
        parts.map((p) => {
            const s = String(p);
            return `${s.length}#${s}`;
        }).join('|'));
}
function stableStringify(value, seen = new WeakSet()) {
    if (value === null)
        return 'null';
    const t = typeof value;
    if (t === 'undefined')
        throw new NonJsonInputError('undefined');
    if (t === 'function')
        throw new NonJsonInputError('function');
    if (t === 'symbol')
        throw new NonJsonInputError('symbol');
    if (t === 'bigint')
        throw new NonJsonInputError('bigint');
    if (t === 'number') {
        if (!Number.isFinite(value))
            throw new NonJsonInputError('non-finite number');
        return String(value);
    }
    if (t === 'boolean')
        return value ? 'true' : 'false';
    if (t === 'string')
        return JSON.stringify(value);
    if (Array.isArray(value)) {
        if (seen.has(value))
            throw new NonJsonInputError('cycle (array)');
        seen.add(value);
        const out = '[' + value.map((x) => stableStringify(x, seen)).join(',') + ']';
        seen.delete(value);
        return out;
    }
    if (value instanceof Date)
        throw new NonJsonInputError('Date');
    if (value instanceof Map)
        throw new NonJsonInputError('Map');
    if (value instanceof Set)
        throw new NonJsonInputError('Set');
    if (value instanceof RegExp)
        throw new NonJsonInputError('RegExp');
    const obj = value;
    const proto = Object.getPrototypeOf(obj);
    if (proto !== null && proto !== Object.prototype) {
        throw new NonJsonInputError(`exotic object: ${proto?.constructor?.name ?? 'unknown'}`);
    }
    if (seen.has(obj))
        throw new NonJsonInputError('cycle (object)');
    seen.add(obj);
    const keys = Object.keys(obj).sort();
    const out = '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k], seen)).join(',') + '}';
    seen.delete(obj);
    return out;
}
function fnv1aHash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}
};
__mods["./geometry.js"]=function(module,exports,require){"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signedArea = signedArea;
exports.pointOnSegment = pointOnSegment;
exports.segmentsIntersect = segmentsIntersect;
exports.isValidPolygon = isValidPolygon;
exports.polygonArea = polygonArea;
exports.bboxOf = bboxOf;
exports.bboxOverlap = bboxOverlap;
exports.polygonsOverlap = polygonsOverlap;
exports.polygonContains = polygonContains;
exports.pointInPolygon = pointInPolygon;
exports.centroidOf = centroidOf;
const EPS = 1e-9;
const finitePoint = (p) => Number.isFinite(p.x) && Number.isFinite(p.y);
const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function signedArea(pts) {
    if (pts.length < 3 || pts.some((p) => !finitePoint(p)))
        return 0;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        s += a.x * b.y - b.x * a.y;
    }
    return s / 2;
}
function pointOnSegment(p, a, b, eps = EPS) {
    if (![p, a, b].every(finitePoint))
        return false;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < EPS)
        return Math.abs(p.x - a.x) <= eps && Math.abs(p.y - a.y) <= eps;
    if (Math.abs(cross(a, b, p)) > eps * Math.max(1, len))
        return false;
    return (p.x >= Math.min(a.x, b.x) - eps &&
        p.x <= Math.max(a.x, b.x) + eps &&
        p.y >= Math.min(a.y, b.y) - eps &&
        p.y <= Math.max(a.y, b.y) + eps);
}
function properIntersection(p1, p2, p3, p4) {
    const d1 = cross(p1, p2, p3);
    const d2 = cross(p1, p2, p4);
    const d3 = cross(p3, p4, p1);
    const d4 = cross(p3, p4, p2);
    return (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
        ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS)));
}
function segmentsIntersect(p1, p2, p3, p4) {
    if (properIntersection(p1, p2, p3, p4))
        return true;
    return (pointOnSegment(p3, p1, p2) ||
        pointOnSegment(p4, p1, p2) ||
        pointOnSegment(p1, p3, p4) ||
        pointOnSegment(p2, p3, p4));
}
function ringLocation(p, ring) {
    if (ring.length < 3)
        return -1;
    for (let i = 0; i < ring.length; i++) {
        if (pointOnSegment(p, ring[i], ring[(i + 1) % ring.length]))
            return 0;
    }
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.y > p.y) !== (b.y > p.y) &&
            p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + EPS) + a.x) {
            inside = !inside;
        }
    }
    return inside ? 1 : -1;
}
function polygonLocation(p, poly) {
    const outer = ringLocation(p, poly.points);
    if (outer < 0)
        return -1;
    if (outer === 0)
        return 0;
    for (const h of poly.holes ?? []) {
        const loc = ringLocation(p, h);
        if (loc === 1)
            return -1;
        if (loc === 0)
            return 0;
    }
    return 1;
}
function ringSelfIntersects(r) {
    for (let i = 0; i < r.length; i++) {
        for (let j = i + 1; j < r.length; j++) {
            if (j === i + 1 || (i === 0 && j === r.length - 1))
                continue;
            if (segmentsIntersect(r[i], r[(i + 1) % r.length], r[j], r[(j + 1) % r.length])) {
                return true;
            }
        }
    }
    return false;
}
function isValidPolygon(p) {
    if (!p || !Array.isArray(p.points) || p.points.length < 3)
        return false;
    if (p.points.some((q) => !finitePoint(q)))
        return false;
    if (Math.abs(signedArea(p.points)) <= EPS)
        return false;
    if (ringSelfIntersects(p.points))
        return false;
    for (const h of p.holes ?? []) {
        if (h.length < 3 || h.some((q) => !finitePoint(q)))
            return false;
        if (Math.abs(signedArea(h)) <= EPS)
            return false;
        if (ringSelfIntersects(h))
            return false;
        for (const q of h)
            if (ringLocation(q, p.points) === -1)
                return false;
    }
    return true;
}
function polygonArea(p) {
    if (!isValidPolygon(p))
        return 0;
    let a = Math.abs(signedArea(p.points));
    for (const h of p.holes ?? [])
        a -= Math.abs(signedArea(h));
    return Math.max(0, a);
}
function bboxOf(p) {
    if (!p.points.length || p.points.some((q) => !finitePoint(q))) {
        return { x: NaN, y: NaN, w: NaN, h: NaN };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const q of p.points) {
        if (q.x < minX)
            minX = q.x;
        if (q.y < minY)
            minY = q.y;
        if (q.x > maxX)
            maxX = q.x;
        if (q.y > maxY)
            maxY = q.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function bboxOverlap(a, b, eps = 1e-6) {
    if (![a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h].every(Number.isFinite))
        return false;
    return !(a.x + a.w <= b.x + eps ||
        b.x + b.w <= a.x + eps ||
        a.y + a.h <= b.y + eps ||
        b.y + b.h <= a.y + eps);
}
const ringsOf = (p) => [p.points, ...(p.holes ?? [])];
function boundariesProperlyCross(a, b) {
    for (const ra of ringsOf(a)) {
        for (const rb of ringsOf(b)) {
            for (let i = 0; i < ra.length; i++) {
                for (let j = 0; j < rb.length; j++) {
                    if (properIntersection(ra[i], ra[(i + 1) % ra.length], rb[j], rb[(j + 1) % rb.length]))
                        return true;
                }
            }
        }
    }
    return false;
}
function polygonsOverlap(a, b) {
    if (!isValidPolygon(a) || !isValidPolygon(b))
        return false;
    if (!bboxOverlap(bboxOf(a), bboxOf(b)))
        return false;
    if (boundariesProperlyCross(a, b))
        return true;
    if (a.points.some((q) => polygonLocation(q, b) === 1))
        return true;
    if (b.points.some((q) => polygonLocation(q, a) === 1))
        return true;
    const allAOnB = a.points.every((q) => polygonLocation(q, b) === 0);
    const allBOnA = b.points.every((q) => polygonLocation(q, a) === 0);
    return allAOnB && allBOnA && polygonArea(a) > EPS && polygonArea(b) > EPS;
}
function polygonContains(outer, inner) {
    if (!isValidPolygon(outer) || !isValidPolygon(inner))
        return false;
    if (boundariesProperlyCross(outer, inner))
        return false;
    for (const q of inner.points)
        if (polygonLocation(q, outer) < 0)
            return false;
    for (let i = 0; i < inner.points.length; i++) {
        const a = inner.points[i];
        const b = inner.points[(i + 1) % inner.points.length];
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (polygonLocation(m, outer) < 0)
            return false;
    }
    for (const h of outer.holes ?? []) {
        if (h.some((q) => polygonLocation(q, inner) === 1))
            return false;
    }
    return true;
}
function pointInPolygon(p, poly) {
    return isValidPolygon(poly) && polygonLocation(p, poly) >= 0;
}
function centroidOf(poly) {
    if (!isValidPolygon(poly))
        return { x: NaN, y: NaN };
    const ringCentroid = (ring) => {
        let a2 = 0, cx = 0, cy = 0;
        for (let i = 0; i < ring.length; i++) {
            const p = ring[i];
            const q = ring[(i + 1) % ring.length];
            const k = p.x * q.y - q.x * p.y;
            a2 += k;
            cx += (p.x + q.x) * k;
            cy += (p.y + q.y) * k;
        }
        return { area: Math.abs(a2 / 2), x: cx / (3 * a2), y: cy / (3 * a2) };
    };
    const o = ringCentroid(poly.points);
    let mass = o.area;
    let sx = o.x * o.area;
    let sy = o.y * o.area;
    for (const h of poly.holes ?? []) {
        const c = ringCentroid(h);
        mass -= c.area;
        sx -= c.x * c.area;
