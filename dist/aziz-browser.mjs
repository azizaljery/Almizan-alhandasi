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
        sy -= c.y * c.area;
    }
    return mass > EPS ? { x: sx / mass, y: sy / mass } : { x: NaN, y: NaN };
}
};
__mods["./output-validation.js"]=function(module,exports,require){"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEngineOutput = validateEngineOutput;
const MAX_CANDIDATES_PER_OUTPUT = 200;
const MAX_ROOMS_PER_CANDIDATE = 500;
const MAX_POINTS_PER_POLYGON = 5000;
const MAX_RAW_BYTES = 1_000_000;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const finite01 = (n) => finite(n) && n >= 0 && n <= 1;
const nonNegInt = (n) => finite(n) && Number.isInteger(n) && n >= 0;
function validCapabilities(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const c = value;
    return (Array.isArray(c.disciplines) && c.disciplines.every((d) => typeof d === 'string') &&
        typeof c.supportsGeometry === 'boolean' &&
        typeof c.supportsRequirements === 'boolean' &&
        typeof c.supportsScoring === 'boolean' &&
        typeof c.deterministic === 'boolean' &&
        (c.custom === undefined || (!!c.custom && typeof c.custom === 'object' && !Array.isArray(c.custom))));
}
function validPoint(p) {
    if (!p || typeof p !== 'object')
        return false;
    const pt = p;
    return finite(pt.x) && finite(pt.y);
}
function validAssumption(a) {
    if (!a || typeof a !== 'object')
        return false;
    const assumption = a;
    return (typeof assumption.id === 'string' && assumption.id.length > 0 &&
        typeof assumption.statement === 'string' &&
        finite01(assumption.confidence));
}
function validWarning(w) {
    if (!w || typeof w !== 'object')
        return false;
    const warning = w;
    return (typeof warning.id === 'string' && warning.id.length > 0 &&
        typeof warning.code === 'string' &&
        typeof warning.message === 'string' &&
        ['info', 'warning', 'critical'].includes(String(warning.severity)));
}
function validConstraintEvaluation(ce) {
    if (!ce || typeof ce !== 'object')
        return false;
    const evaluation = ce;
    return (typeof evaluation.constraintId === 'string' && evaluation.constraintId.length > 0 &&
        typeof evaluation.satisfied === 'boolean' &&
        (evaluation.evidence === undefined || typeof evaluation.evidence === 'string') &&
        finite01(evaluation.confidence));
}
function validPolygonShape(p) {
    if (!p || typeof p !== 'object')
        return false;
    const poly = p;
    if (!Array.isArray(poly.points))
        return false;
    if (poly.points.length < 3 || poly.points.length > MAX_POINTS_PER_POLYGON)
        return false;
    if (!poly.points.every(validPoint))
        return false;
    if (poly.holes !== undefined) {
        if (!Array.isArray(poly.holes))
            return false;
        for (const h of poly.holes) {
            if (!Array.isArray(h) || h.length < 3 || h.length > MAX_POINTS_PER_POLYGON)
                return false;
            if (!h.every(validPoint))
                return false;
        }
    }
    return true;
}
function validCandidateShape(c) {
    if (!c || typeof c !== 'object')
        return false;
    const cand = c;
    if (typeof cand.candidateId !== 'string' || !cand.candidateId)
        return false;
    if (typeof cand.producedBy !== 'string' || !cand.producedBy)
        return false;
    if (typeof cand.producedByVersion !== 'string' || !cand.producedByVersion)
        return false;
    if (typeof cand.invocationId !== 'string' || !cand.invocationId)
        return false;
    if (cand.schemaVersion !== '1.0.0')
        return false;
    if (typeof cand.createdAt !== 'string' || !cand.createdAt)
        return false;
    if (typeof cand.label !== 'string')
        return false;
    if (cand.description !== undefined && typeof cand.description !== 'string')
        return false;
    if (typeof cand.geometryHash !== 'string' || !cand.geometryHash)
        return false;
    if (!validPolygonShape(cand.footprint))
        return false;
    if (!Array.isArray(cand.rooms) || cand.rooms.length > MAX_ROOMS_PER_CANDIDATE)
        return false;
    for (const r of cand.rooms) {
        if (!r || typeof r !== 'object')
            return false;
        const room = r;
        if (typeof room.roomId !== 'string' || !room.roomId)
            return false;
        if (typeof room.type !== 'string')
            return false;
        if (typeof room.zone !== 'string')
            return false;
        if (!validPolygonShape(room.boundary))
            return false;
        if (!finite(room.clearArea) || room.clearArea < 0)
            return false;
    }
    if (!Array.isArray(cand.adjacency))
        return false;
    for (const a of cand.adjacency) {
        if (!a || typeof a !== 'object')
            return false;
        const adj = a;
        if (typeof adj.a !== 'string' || !adj.a || typeof adj.b !== 'string' || !adj.b)
            return false;
        if (!finite(adj.sharedLength) || adj.sharedLength < 0)
            return false;
    }
    if (!Array.isArray(cand.entryPoints))
        return false;
    for (const e of cand.entryPoints) {
        if (!e || typeof e !== 'object')
            return false;
        const ep = e;
        if (typeof ep.id !== 'string' || !ep.id || typeof ep.side !== 'string' || !ep.side || typeof ep.roomId !== 'string' || !ep.roomId)
            return false;
    }
    if (!cand.metrics || typeof cand.metrics !== 'object')
        return false;
    const m = cand.metrics;
    if (!finite(m.grossArea) || m.grossArea < 0)
        return false;
    if (!finite(m.buildRatio) || m.buildRatio < 0)
        return false;
    if (!nonNegInt(m.roomCount) || m.roomCount !== cand.rooms.length)
        return false;
    if (!finite01(cand.engineConfidence))
        return false;
    if (cand.engineSelfReportedScore !== undefined && !finite(cand.engineSelfReportedScore))
        return false;
    if (cand.tags !== undefined) {
        if (!Array.isArray(cand.tags))
            return false;
        if (!cand.tags.every((t) => typeof t === 'string'))
            return false;
    }
    if (cand.raw !== undefined) {
        try {
            const s = JSON.stringify(cand.raw);
            if (s && s.length > MAX_RAW_BYTES)
                return false;
        }
        catch {
            return false;
        }
    }
    return true;
}
function validateEngineOutput(raw, adapter, inputHash) {
    if (!raw || typeof raw !== 'object')
        return { ok: false, reason: 'NOT_OBJECT' };
    const o = raw;
    if (o.engineId !== adapter.engineId)
        return { ok: false, reason: 'ENGINE_ID_MISMATCH' };
    if (o.engineVersion !== adapter.engineVersion)
        return { ok: false, reason: 'ENGINE_VERSION_MISMATCH' };
    if (typeof o.invocationId !== 'string' || !o.invocationId)
        return { ok: false, reason: 'INVOCATION_ID_MISSING' };
    if (!finite01(o.confidence))
        return { ok: false, reason: 'CONFIDENCE_INVALID' };
    if (!validCapabilities(o.capabilities))
        return { ok: false, reason: 'CAPABILITIES_INVALID' };
    if (!o.execution || typeof o.execution !== 'object')
        return { ok: false, reason: 'EXECUTION_MISSING' };
    if (!['ok', 'partial', 'failed'].includes(o.execution.status))
        return { ok: false, reason: 'EXECUTION_STATUS_INVALID' };
    if (typeof o.execution.startedAt !== 'string' || !o.execution.startedAt || typeof o.execution.completedAt !== 'string' || !o.execution.completedAt)
        return { ok: false, reason: 'EXECUTION_TIMESTAMPS_MISSING' };
    if (typeof o.execution.version !== 'string' || o.execution.version !== o.engineVersion)
        return { ok: false, reason: 'EXECUTION_VERSION_MISMATCH' };
    if (o.execution.errorMessage !== undefined && typeof o.execution.errorMessage !== 'string')
        return { ok: false, reason: 'EXECUTION_ERROR_MESSAGE_INVALID' };
    if (!finite(o.execution.durationMs) || o.execution.durationMs < 0)
        return { ok: false, reason: 'EXECUTION_DURATION_INVALID' };
    if (!o.provenance || typeof o.provenance !== 'object')
        return { ok: false, reason: 'PROVENANCE_MISSING' };
    if (o.provenance.engineId !== o.engineId)
        return { ok: false, reason: 'PROVENANCE_ENGINE_MISMATCH' };
    if (o.provenance.engineVersion !== o.engineVersion)
        return { ok: false, reason: 'PROVENANCE_VERSION_MISMATCH' };
    if (o.provenance.invocationId !== o.invocationId)
        return { ok: false, reason: 'PROVENANCE_INVOCATION_MISMATCH' };
    if (typeof o.provenance.requestedAt !== 'string' || !o.provenance.requestedAt || typeof o.provenance.completedAt !== 'string' || !o.provenance.completedAt)
        return { ok: false, reason: 'PROVENANCE_TIMESTAMPS_INVALID' };
    if (o.provenance.inputHash !== inputHash)
        return { ok: false, reason: 'INPUT_HASH_MISMATCH' };
    if (!Array.isArray(o.assumptions))
        return { ok: false, reason: 'ASSUMPTIONS_NOT_ARRAY' };
    if (!o.assumptions.every(validAssumption))
        return { ok: false, reason: 'ASSUMPTION_INVALID' };
    if (!Array.isArray(o.warnings))
        return { ok: false, reason: 'WARNINGS_NOT_ARRAY' };
    if (!o.warnings.every(validWarning))
        return { ok: false, reason: 'WARNING_INVALID' };
    if (!Array.isArray(o.constraintsEvaluated))
        return { ok: false, reason: 'CONSTRAINTS_NOT_ARRAY' };
    if (!o.constraintsEvaluated.every(validConstraintEvaluation))
        return { ok: false, reason: 'CONSTRAINT_EVALUATION_INVALID' };
    if (!Array.isArray(o.candidates))
        return { ok: false, reason: 'CANDIDATES_NOT_ARRAY' };
    if (o.candidates.length > MAX_CANDIDATES_PER_OUTPUT)
        return { ok: false, reason: 'TOO_MANY_CANDIDATES' };
    const validCandidates = [];
    const invalidCandidateIds = [];
    const seen = new Set();
    for (const c of o.candidates) {
        if (!validCandidateShape(c)) {
            const id = c?.candidateId ?? 'unknown';
            invalidCandidateIds.push(id);
            continue;
        }
        if (c.producedBy !== o.engineId) {
            invalidCandidateIds.push(c.candidateId);
            continue;
        }
        if (c.producedByVersion !== o.engineVersion) {
            invalidCandidateIds.push(c.candidateId);
            continue;
        }
        if (c.invocationId !== o.invocationId) {
            invalidCandidateIds.push(c.candidateId);
            continue;
        }
        if (seen.has(c.candidateId)) {
            invalidCandidateIds.push(c.candidateId);
            continue;
        }
        seen.add(c.candidateId);
        validCandidates.push(c);
    }
    return {
        ok: true,
        validCandidates,
        ...(invalidCandidateIds.length ? { invalidCandidateIds } : {}),
    };
}
};
__mods["./hard-constraints.js"]=function(module,exports,require){"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateHardConstraints = evaluateHardConstraints;
const geometry_js_1 = require("./geometry.js");
function reject(candidate, code, description, evidence, severity = 'critical', constraintId) {
    return {
        candidateId: candidate.candidateId,
        engineId: candidate.producedBy,
        code,
        description,
        evidence,
        severity,
        ...(constraintId ? { violatedConstraintId: constraintId } : {}),
    };
}
function evaluateHardConstraints(candidate, constraints, config) {
    const violations = [];
    const satisfiedIds = [];
    const evidence = [];
    if (candidate.rooms.length === 0) {
        violations.push(reject(candidate, 'EMPTY_CANDIDATE', 'Candidate contains no rooms', []));
        return { violations, satisfiedIds, axisScore: 0, evidence };
    }
    if (!(0, geometry_js_1.isValidPolygon)(candidate.footprint)) {
        violations.push(reject(candidate, 'INVALID_SCHEMA', 'Candidate footprint is not a valid polygon', []));
        return { violations, satisfiedIds, axisScore: 0, evidence };
    }
    for (const r of candidate.rooms) {
        if (!r.roomId || !Number.isFinite(r.clearArea) || r.clearArea <= 0 || !(0, geometry_js_1.isValidPolygon)(r.boundary)) {
            violations.push(reject(candidate, 'INVALID_SCHEMA', `Room ${r.roomId ?? '?'} geometry or area invalid`, [`room=${r.roomId ?? 'unknown'}`]));
            return { violations, satisfiedIds, axisScore: 0, evidence };
        }
    }
    for (let i = 0; i < candidate.rooms.length; i++) {
        for (let j = i + 1; j < candidate.rooms.length; j++) {
            const a = candidate.rooms[i];
            const b = candidate.rooms[j];
            if ((0, geometry_js_1.polygonsOverlap)(a.boundary, b.boundary)) {
                violations.push(reject(candidate, 'ROOM_OVERLAP', `Rooms ${a.roomId} and ${b.roomId} overlap`, [`room-a=${a.roomId}`, `room-b=${b.roomId}`]));
            }
        }
    }
    for (const r of candidate.rooms) {
        if (!(0, geometry_js_1.polygonContains)(candidate.footprint, r.boundary)) {
            violations.push(reject(candidate, 'OUTSIDE_BUILDING_BOUNDARY', `Room ${r.roomId} extends outside the footprint`, [`room=${r.roomId}`]));
            break;
        }
    }
    for (const c of constraints) {
        const ok = evaluateSingle(candidate, c, config);
        if (ok) {
            satisfiedIds.push(c.id);
            evidence.push(`${c.id}=ok`);
        }
        else {
            violations.push(reject(candidate, codeFor(c), `Hard constraint failed: ${c.description}`, [`constraint=${c.id}`], 'critical', c.id));
        }
    }
    const axisScore = violations.length === 0 ? 100 : 0;
