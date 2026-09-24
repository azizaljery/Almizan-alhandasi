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
    return { violations, satisfiedIds, axisScore, evidence };
}
function codeFor(c) {
    switch (c.kind) {
        case 'room_count_exact':
        case 'room_count_min':
        case 'room_count_max':
        case 'room_type_required':
        case 'room_type_forbidden':
            return 'HARD_REQUIREMENT_MISSING';
        case 'explicit_area':
            return 'AREA_TOLERANCE_EXCEEDED';
        case 'entry_side_required':
        case 'access_required':
            return 'INVALID_ACCESS';
        case 'privacy_required':
            return 'PRIVACY_CONFLICT';
        case 'custom':
            return 'INVALID_SCHEMA';
        default:
            return 'HARD_REQUIREMENT_MISSING';
    }
}
function evaluateSingle(candidate, c, config) {
    switch (c.kind) {
        case 'room_count_exact': {
            const n = c.value?.count;
            return typeof n === 'number' && candidate.rooms.length === n;
        }
        case 'room_count_min': {
            const n = c.value?.count;
            return typeof n === 'number' && candidate.rooms.length >= n;
        }
        case 'room_count_max': {
            const n = c.value?.count;
            return typeof n === 'number' && candidate.rooms.length <= n;
        }
        case 'room_type_required': {
            const t = c.value?.type;
            return typeof t === 'string' && candidate.rooms.some((r) => r.type === t);
        }
        case 'room_type_forbidden': {
            const t = c.value?.type;
            return typeof t === 'string' && !candidate.rooms.some((r) => r.type === t);
        }
        case 'explicit_area': {
            const v = c.value;
            if (!Number.isFinite(v?.area) || v.area <= 0)
                return false;
            const tol = Number.isFinite(v?.tolerance) && v.tolerance >= 0
                ? v.tolerance
                : config.areaTolerancePercent / 100;
            const matched = v.roomId
                ? candidate.rooms.filter((r) => r.roomId === v.roomId)
                : v.type
                    ? candidate.rooms.filter((r) => r.type === v.type)
                    : [];
            if (matched.length === 0)
                return false;
            return matched.every((r) => Math.abs(r.clearArea - v.area) / v.area <= tol);
        }
        case 'entry_side_required': {
            const side = c.value?.side;
            return typeof side === 'string' && candidate.entryPoints.some((e) => e.side === side);
        }
        case 'privacy_required': {
            const v = c.value;
            if (typeof v?.fromType !== 'string' || typeof v?.toType !== 'string' || !Number.isFinite(v?.minDistance))
                return false;
            const a = candidate.rooms.find((r) => r.type === v.fromType);
            const b = candidate.rooms.find((r) => r.type === v.toType);
            if (!a || !b)
                return false;
            const ca = (0, geometry_js_1.centroidOf)(a.boundary);
            const cb = (0, geometry_js_1.centroidOf)(b.boundary);
            if (!Number.isFinite(ca.x) || !Number.isFinite(cb.x))
                return false;
            return Math.hypot(ca.x - cb.x, ca.y - cb.y) >= v.minDistance;
        }
        case 'access_required': {
            const v = c.value;
            if (typeof v?.roomId !== 'string')
                return false;
            const room = candidate.rooms.find((r) => r.roomId === v.roomId);
            if (!room)
                return false;
            if (typeof v.fromRoomId === 'string') {
                return candidate.adjacency.some((adj) => (adj.a === room.roomId && adj.b === v.fromRoomId) ||
                    (adj.b === room.roomId && adj.a === v.fromRoomId));
            }
            if (typeof v.fromEntryId === 'string') {
                const entry = candidate.entryPoints.find((e) => e.id === v.fromEntryId);
                if (!entry)
                    return false;
                return candidate.adjacency.some((adj) => (adj.a === room.roomId && adj.b === entry.roomId) ||
                    (adj.b === room.roomId && adj.a === entry.roomId));
            }
            return candidate.adjacency.some((a) => a.a === room.roomId || a.b === room.roomId);
        }
        case 'custom':
            return false;
        default:
            return false;
    }
}
};
__mods["./conflict-engine.js"]=function(module,exports,require){"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectConflicts = detectConflicts;
const util_js_1 = require("./util.js");
const geometry_js_1 = require("./geometry.js");
function detectConflicts(candidates, outputs) {
    const conflicts = [];
    const byType = new Map();
    for (const c of candidates) {
        if (!(0, geometry_js_1.isValidPolygon)(c.footprint))
            continue;
        const bb = (0, geometry_js_1.bboxOf)(c.footprint);
        for (const room of c.rooms) {
            if (!(0, geometry_js_1.isValidPolygon)(room.boundary))
                continue;
            const cen = (0, geometry_js_1.centroidOf)(room.boundary);
            if (!Number.isFinite(cen.x))
                continue;
            const side = sideOf(cen, bb);
            if (!byType.has(room.type))
                byType.set(room.type, new Map());
            const m = byType.get(room.type);
            if (!m.has(c.producedBy))
                m.set(c.producedBy, []);
            m.get(c.producedBy).push({ candidateId: c.candidateId, side, confidence: c.engineConfidence });
        }
    }
    for (const [type, perEngine] of byType) {
        if (perEngine.size < 2)
            continue;
        const engineSide = new Map();
        for (const [engineId, placements] of perEngine) {
            const tally = new Map();
            for (const p of placements)
                tally.set(p.side, (tally.get(p.side) ?? 0) + 1);
            let best = '';
            let bestCount = -1;
            for (const [s, cnt] of tally) {
                if (cnt > bestCount || (cnt === bestCount && s < best)) {
                    best = s;
                    bestCount = cnt;
                }
            }
            engineSide.set(engineId, best);
        }
        const sides = new Set(engineSide.values());
        if (sides.size < 2)
            continue;
        const participants = [];
        for (const [engineId, placements] of perEngine) {
            const side = engineSide.get(engineId);
            const rep = placements.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0];
            participants.push({ engineId, candidateId: rep.candidateId, position: side, confidence: rep.confidence });
        }
        conflicts.push({
            conflictId: (0, util_js_1.deterministicId)('conflict', ['placement', type, ...participants.map((p) => p.engineId).sort()]),
            severity: 'major',
            subject: `room-type:${type}`,
            participants,
            description: `Engines disagree on ${type} placement (${[...sides].sort().join(' vs ')})`,
            evidence: participants.map((p) => `${p.engineId}:${p.position}`),
        });
    }
    const constraintEvalMap = new Map();
    for (const o of outputs) {
        for (const ce of o.constraintsEvaluated) {
            if (!constraintEvalMap.has(ce.constraintId))
                constraintEvalMap.set(ce.constraintId, new Map());
            constraintEvalMap.get(ce.constraintId).set(o.engineId, ce.satisfied);
        }
    }
    for (const [cid, byEngine] of constraintEvalMap) {
        if (new Set(byEngine.values()).size < 2)
            continue;
        conflicts.push({
            conflictId: (0, util_js_1.deterministicId)('conflict', ['constraint-eval', cid, ...[...byEngine.keys()].sort()]),
            severity: 'major',
            subject: `constraint-eval:${cid}`,
            participants: [...byEngine.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([engineId, satisfied]) => {
                const out = outputs.find((o) => o.engineId === engineId);
                const candidateIds = out?.candidates.map((c) => c.candidateId) ?? [];
                if (candidateIds.length === 0) {
                    return [{ engineId, candidateId: 'n/a', position: satisfied ? 'satisfied' : 'violated', confidence: 1 }];
                }
                return candidateIds.map((candidateId) => ({
                    engineId,
                    candidateId,
                    position: satisfied ? 'satisfied' : 'violated',
                    confidence: 1,
                }));
            }),
            description: `Engines disagree on constraint ${cid}`,
            evidence: [...byEngine.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([e, s]) => `${e}:${s}`),
        });
    }
    for (const o of outputs) {
        for (const warn of o.warnings) {
            if (warn.severity !== 'critical')
                continue;
            const candidateIds = o.candidates.map((c) => c.candidateId);
            conflicts.push({
                conflictId: (0, util_js_1.deterministicId)('conflict', ['warning', o.engineId, warn.id]),
                severity: 'critical',
                subject: `warning:${warn.code}`,
                participants: candidateIds.length > 0
                    ? candidateIds.map((candidateId) => ({
                        engineId: o.engineId,
                        candidateId,
                        position: 'critical-warning',
                        confidence: o.confidence,
                    }))
                    : [{ engineId: o.engineId, candidateId: 'n/a', position: 'critical-warning', confidence: o.confidence }],
                description: `Critical warning from ${o.engineId}: ${warn.message}`,
                evidence: [warn.code],
            });
        }
    }
    return conflicts;
}
function sideOf(p, bb) {
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    const dx = p.x - cx, dy = p.y - cy;
    if (Math.abs(dx) > Math.abs(dy))
        return dx > 0 ? 'east' : 'west';
    return dy > 0 ? 'north' : 'south';
}
};
__mods["./scoring-engine.js"]=function(module,exports,require){"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreCandidate = scoreCandidate;
const geometry_js_1 = require("./geometry.js");
const hard_constraints_js_1 = require("./hard-constraints.js");
function clamp(v) {
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}
function scoreCandidate(candidate, hardConstraints, softPreferences, conflicts, weights, config) {
    const axes = [];
    const mk = (axis, value, evidence) => ({
        axis, value: clamp(value), weight: weights[axis] ?? 0, evidence,
    });
    axes.push(mk('requirementCoverage', requirementCoverage(candidate, softPreferences), [`softPrefs=${softPreferences.length}`]));
    const hc = (0, hard_constraints_js_1.evaluateHardConstraints)(candidate, hardConstraints, config);
    axes.push(mk('hardConstraintCompliance', hc.violations.length === 0 ? 100 : 0, [`violations=${hc.violations.length}`]));
    axes.push(mk('geometryValidity', geometryValidity(candidate), ['checked']));
    axes.push(mk('areaAccuracy', areaAccuracy(candidate, hardConstraints, config), ['checked']));
    axes.push(mk('adjacency', adjacencyScore(candidate, softPreferences), ['checked']));
    axes.push(mk('circulation', circulationScore(candidate), ['checked']));
    axes.push(mk('privacy', privacyScore(candidate), ['checked']));
    axes.push(mk('guestFamilySeparation', guestFamilySeparation(candidate), ['checked']));
    axes.push(mk('serviceFlow', serviceFlow(candidate), ['checked']));
    axes.push(mk('accessibility', accessibility(candidate), ['checked']));
    axes.push(mk('daylightPotential', daylightPotential(candidate), ['checked']));
    axes.push(mk('ventilationPotential', daylightPotential(candidate), ['checked']));
    axes.push(mk('designEfficiency', designEfficiency(candidate), ['checked']));
    axes.push(mk('referenceCompatibility', referenceCompatibility(candidate, conflicts), ['checked']));
    const relevant = conflicts.filter((c) => c.participants.some((p) => p.candidateId === candidate.candidateId));
    const critical = relevant.filter((c) => c.severity === 'critical').length;
    const major = relevant.filter((c) => c.severity === 'major').length;
    const penalty = Math.min(100, critical * 25 + major * 5);
    axes.push(mk('unresolvedPenalty', 100 - penalty, [`critical=${critical}`, `major=${major}`]));
    let weightedSum = 0, weightSum = 0;
    for (const a of axes) {
        weightedSum += a.value * a.weight;
        weightSum += a.weight;
    }
    const rawTotal = weightSum > 0 ? weightedSum / weightSum : 0;
    const conf = Math.max(0, Math.min(1, candidate.engineConfidence));
    const confidenceFactor = 0.5 + 0.5 * conf;
    return {
        candidateId: candidate.candidateId,
        axes,
        rawTotal,
        confidenceAdjustedTotal: rawTotal * confidenceFactor,
    };
}
function requirementCoverage(c, prefs) {
    if (prefs.length === 0)
        return 100;
    let covered = 0, total = 0;
    for (const p of prefs) {
        const w = Number.isFinite(p.weight) ? Math.max(0, p.weight) : 1;
        total += w;
        const r = prefResult(c, p);
        if (r === 'unsupported') {
            total -= w;
            continue;
        }
        if (r === true)
            covered += w;
    }
    return total > 0 ? (covered / total) * 100 : 100;
}
function prefResult(c, p) {
    switch (p.kind) {
        case 'prefer_zone_placement': {
            const v = p.value;
            if (!v?.type || !v?.zone)
                return 'unsupported';
            const room = c.rooms.find((r) => r.type === v.type);
            return room ? room.zone === v.zone : false;
        }
        case 'prefer_adjacency': {
            const v = p.value;
            if (!v?.a || !v?.b)
                return 'unsupported';
            return c.adjacency.some((adj) => (adj.a === v.a && adj.b === v.b) || (adj.a === v.b && adj.b === v.a));
        }
        case 'prefer_orientation': {
            const v = p.value;
            if (!v?.type || !v?.side)
                return 'unsupported';
            const room = c.rooms.find((r) => r.type === v.type);
            if (!room)
                return false;
            const cen = (0, geometry_js_1.centroidOf)(room.boundary);
            if (!Number.isFinite(cen.x))
                return 'unsupported';
            return sideOfPoint(cen, c) === v.side;
        }
        default:
            return 'unsupported';
    }
}
function sideOfPoint(p, c) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of c.footprint.points) {
        if (pt.x < minX)
            minX = pt.x;
        if (pt.y < minY)
            minY = pt.y;
        if (pt.x > maxX)
            maxX = pt.x;
        if (pt.y > maxY)
            maxY = pt.y;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const dx = p.x - cx, dy = p.y - cy;
    if (Math.abs(dx) > Math.abs(dy))
        return dx > 0 ? 'east' : 'west';
    return dy > 0 ? 'north' : 'south';
}
function geometryValidity(c) {
    if (!(0, geometry_js_1.isValidPolygon)(c.footprint))
        return 0;
    let score = 100;
    for (let i = 0; i < c.rooms.length; i++) {
        for (let j = i + 1; j < c.rooms.length; j++) {
            if ((0, geometry_js_1.polygonsOverlap)(c.rooms[i].boundary, c.rooms[j].boundary))
                score -= 10;
        }
    }
    for (const r of c.rooms) {
        if (!(0, geometry_js_1.isValidPolygon)(r.boundary)) {
            score -= 15;
            continue;
        }
        if (!(0, geometry_js_1.polygonContains)(c.footprint, r.boundary))
            score -= 15;
    }
    return clamp(score);
}
function areaAccuracy(c, constraints, config) {
    const acs = constraints.filter((x) => x.kind === 'explicit_area');
    if (acs.length === 0)
        return 100;
    let sum = 0;
    for (const ac of acs) {
        const v = ac.value;
        if (!Number.isFinite(v.area) || v.area <= 0) {
            sum += 0;
            continue;
        }
        const tol = Number.isFinite(v.tolerance) && v.tolerance >= 0
            ? v.tolerance
            : config.areaTolerancePercent / 100;
        const matched = v.roomId
            ? c.rooms.filter((r) => r.roomId === v.roomId)
            : v.type
                ? c.rooms.filter((r) => r.type === v.type)
                : [];
        if (matched.length === 0) {
            sum += 0;
            continue;
        }
        const avgDev = matched.reduce((s, r) => s + Math.abs(r.clearArea - v.area) / v.area, 0) / matched.length;
        sum += Math.max(0, 100 * (1 - avgDev / Math.max(tol, 0.01)));
    }
    return sum / acs.length;
}
function adjacencyScore(c, prefs) {
    const adj = prefs.filter((p) => p.kind === 'prefer_adjacency');
    if (adj.length === 0)
        return 100;
    let total = 0, covered = 0;
    for (const p of adj) {
        const w = Number.isFinite(p.weight) ? Math.max(0, p.weight) : 1;
        total += w;
        const v = p.value;
        if (v?.a && v?.b && c.adjacency.some((a) => (a.a === v.a && a.b === v.b) || (a.a === v.b && a.b === v.a)))
            covered += w;
    }
    return total > 0 ? (covered / total) * 100 : 100;
}
function circulationScore(c) {
    const seen = new Set();
    for (const adj of c.adjacency) {
        const key = [adj.a, adj.b].sort().join('|');
        seen.add(key);
    }
    return seen.size === 0 ? 0 : clamp(30 + seen.size * 8);
}
function footprintSpan(c) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of c.footprint.points) {
        if (pt.x < minX)
            minX = pt.x;
        if (pt.y < minY)
            minY = pt.y;
        if (pt.x > maxX)
            maxX = pt.x;
        if (pt.y > maxY)
            maxY = pt.y;
    }
    return Math.hypot(maxX - minX, maxY - minY);
}
function privacyScore(c) {
    const entryRoom = c.entryPoints[0]?.roomId;
    const bedrooms = c.rooms.filter((r) => r.type === 'bedroom' || r.type === 'master-bedroom');
    if (!entryRoom || bedrooms.length === 0)
        return 50;
    const entry = c.rooms.find((r) => r.roomId === entryRoom);
    if (!entry)
        return 50;
    const ec = (0, geometry_js_1.centroidOf)(entry.boundary);
    if (!Number.isFinite(ec.x))
        return 50;
    const span = footprintSpan(c);
    if (span <= 0)
        return 50;
    const avgD = bedrooms.reduce((s, b) => {
        const bc = (0, geometry_js_1.centroidOf)(b.boundary);
        if (!Number.isFinite(bc.x))
            return s;
        return s + Math.hypot(ec.x - bc.x, ec.y - bc.y);
    }, 0) / bedrooms.length;
    return clamp((avgD / span) * 100);
}
function guestFamilySeparation(c) {
    const majlis = c.rooms.find((r) => r.type === 'majlis');
    const living = c.rooms.find((r) => r.type === 'living');
    if (!majlis || !living)
        return 50;
    const span = footprintSpan(c);
    if (span <= 0)
        return 50;
    const mc = (0, geometry_js_1.centroidOf)(majlis.boundary);
    const lc = (0, geometry_js_1.centroidOf)(living.boundary);
    if (!Number.isFinite(mc.x) || !Number.isFinite(lc.x))
        return 50;
    return clamp((Math.hypot(mc.x - lc.x, mc.y - lc.y) / span) * 100);
}
function serviceFlow(c) {
    const kitchen = c.rooms.find((r) => r.type === 'kitchen');
    const service = c.rooms.find((r) => r.type === 'service' || r.type === 'maid' || r.type === 'storage');
    if (!kitchen || !service)
        return 50;
    const span = footprintSpan(c);
    if (span <= 0)
        return 50;
    const kc = (0, geometry_js_1.centroidOf)(kitchen.boundary);
    const sc = (0, geometry_js_1.centroidOf)(service.boundary);
    if (!Number.isFinite(kc.x) || !Number.isFinite(sc.x))
        return 50;
    return clamp(100 - (Math.hypot(kc.x - sc.x, kc.y - sc.y) / span) * 100);
}
function accessibility(c) {
    const linked = new Set();
    for (const adj of c.adjacency) {
        linked.add(adj.a);
        linked.add(adj.b);
    }
    if (c.rooms.length === 0)
        return 0;
    return clamp(((c.rooms.length - c.rooms.filter((r) => !linked.has(r.roomId)).length) / c.rooms.length) * 100);
}
function daylightPotential(c) {
    if (c.rooms.length === 0)
        return 0;
    let onExterior = 0;
    for (const r of c.rooms)
        if (isOnExteriorWall(r.boundary, c.footprint))
            onExterior++;
    return (onExterior / c.rooms.length) * 100;
}
function isOnExteriorWall(room, footprint) {
    for (const rp of room.points) {
        for (let i = 0; i < footprint.points.length; i++) {
            const a = footprint.points[i];
            const b = footprint.points[(i + 1) % footprint.points.length];
            if (pointOnSegmentLite(rp, a, b))
                return true;
        }
    }
    return false;
}
function pointOnSegmentLite(p, a, b) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9)
        return Math.hypot(p.x - a.x, p.y - a.y) < 1e-3;
    const cr = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (Math.abs(cr) > 1e-3)
        return false;
    const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    return dot >= -1e-3 && dot <= len * len + 1e-3;
}
function designEfficiency(c) {
    if (c.metrics.grossArea <= 0)
        return 0;
    const roomArea = c.rooms.reduce((s, r) => s + r.clearArea, 0);
    return clamp((roomArea / c.metrics.grossArea) * 100);
}
function referenceCompatibility(c, conflicts) {
    let score = 100;
    for (const cf of conflicts) {
        if (cf.participants.some((p) => p.candidateId === c.candidateId)) {
            score -= cf.severity === 'critical' ? 25 : cf.severity === 'major' ? 10 : 3;
        }
    }
    return clamp(score);
}
};
__mods["./consensus-engine.js"]=function(module,exports,require){"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROFILES = void 0;
exports.defaultConfig = defaultConfig;
exports.normalizeConfig = normalizeConfig;
exports.resolveWeights = resolveWeights;
const DEFAULT_WEIGHTS = {
    requirementCoverage: 1.5,
    hardConstraintCompliance: 3,
    geometryValidity: 3,
    areaAccuracy: 1.2,
    adjacency: 0.9,
    circulation: 0.9,
    privacy: 1.3,
    guestFamilySeparation: 1,
    serviceFlow: 0.8,
    accessibility: 1,
    daylightPotential: 0.7,
    ventilationPotential: 0.7,
    designEfficiency: 1,
    referenceCompatibility: 0.6,
    unresolvedPenalty: 1.5,
};
exports.DEFAULT_PROFILES = {
    balanced: {},
    privacyFirst: { privacy: 3, guestFamilySeparation: 2, geometryValidity: 2 },
    geometryFirst: { geometryValidity: 4, hardConstraintCompliance: 4 },
    requirementsFirst: { requirementCoverage: 3.5, hardConstraintCompliance: 3.5 },
    referenceInspired: { referenceCompatibility: 1.5, designEfficiency: 1.3 },
};
const cloneProfile = (p) => ({ ...p });
const cloneProfiles = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, cloneProfile(v)]));
function defaultConfig() {
    return {
        weights: { ...DEFAULT_WEIGHTS },
        weightProfiles: cloneProfiles(exports.DEFAULT_PROFILES),
        activeProfile: 'balanced',
        confidenceFloor: 0.3,
        tieThreshold: 2,
        maxRefinementAttempts: 3,
        areaTolerancePercent: 10,
        engineTimeoutMs: 30000,
    };
}
function normalizeConfig(input = {}) {
    const d = defaultConfig();
    const mergedWeights = { ...d.weights };
    for (const [k, v] of Object.entries(input.weights ?? {})) {
        mergedWeights[k] = v;
    }
    const mergedProfiles = { ...d.weightProfiles };
    for (const [name, profile] of Object.entries(input.weightProfiles ?? {})) {
        mergedProfiles[name] = { ...(mergedProfiles[name] ?? {}), ...cloneProfile(profile) };
    }
    const c = {
        ...d,
        ...input,
        weights: mergedWeights,
        weightProfiles: mergedProfiles,
    };
    const check = (n, min, max, name) => {
        if (!Number.isFinite(n) || n < min || n > max)
            throw new Error(`Invalid AzizConfig.${name}: ${n}`);
    };
    check(c.confidenceFloor, 0, 1, 'confidenceFloor');
    check(c.tieThreshold, 0, 100, 'tieThreshold');
    check(c.maxRefinementAttempts, 0, 100, 'maxRefinementAttempts');
    if (!Number.isInteger(c.maxRefinementAttempts))
        throw new Error('Invalid AzizConfig.maxRefinementAttempts: must be integer');
    check(c.areaTolerancePercent, 0, 100, 'areaTolerancePercent');
    check(c.engineTimeoutMs, 1, 2_147_483_647, 'engineTimeoutMs');
    if (!mergedProfiles[c.activeProfile])
        throw new Error(`Unknown weight profile: ${c.activeProfile}`);
    for (const [axis, value] of Object.entries(mergedWeights)) {
        if (!Number.isFinite(value) || value < 0)
            throw new Error(`Invalid weight for ${axis}: ${value}`);
    }
    const effective = resolveWeights(c, { plotArea: 0, cityCode: '', locale: '' });
    if (Object.values(effective).every((v) => v === 0))
        throw new Error('At least one effective score weight must be positive');
    return c;
}
function resolveWeights(config, _context) {
    const profile = config.weightProfiles[config.activeProfile] ?? {};
    const out = { ...DEFAULT_WEIGHTS, ...config.weights };
    for (const [k, v] of Object.entries(profile))
        out[k] = v;
    return out;
}
};
__mods["./refinement-engine.js"]=function(module,exports,require){"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRefinementRequest = buildRefinementRequest;
const util_js_1 = require("./util.js");
function buildRefinementRequest(input, rejections, attempt, clock, deadlineMs) {
    const failedConstraints = new Map();
    const failedCandidatesMap = new Map();
    const enginesInvolved = new Set();
    for (const r of rejections) {
        enginesInvolved.add(r.engineId);
        const key = `${r.candidateId}|${r.engineId}|${r.code}`;
        if (!failedCandidatesMap.has(key)) {
            failedCandidatesMap.set(key, { candidateId: r.candidateId, engineId: r.engineId, reason: r.code });
        }
        if (r.violatedConstraintId) {
            const arr = failedConstraints.get(r.violatedConstraintId) ?? [];
            arr.push(r.description);
            failedConstraints.set(r.violatedConstraintId, arr);
        }
    }
    const explicitAreas = [];
    const requiredRooms = [];
    for (const c of input.hardConstraints) {
        if (c.kind === 'explicit_area') {
            const v = c.value;
            explicitAreas.push({ roomId: v.roomId ?? v.type ?? 'unknown', area: v.area ?? 0 });
        }
        if (c.kind === 'room_type_required') {
            const v = c.value;
            if (v.type)
                requiredRooms.push(v.type);
        }
    }
    return {
        requestId: (0, util_js_1.deterministicId)('refine', [input.requestId, attempt]),
        createdAt: clock.nowIso(),
        attempt,
        reason: `All candidates rejected in attempt ${attempt}`,
        failedConstraints: [...failedConstraints.entries()]
            .map(([constraintId, evidence]) => ({ constraintId, evidence }))
            .sort((a, b) => a.constraintId.localeCompare(b.constraintId)),
        failedCandidates: [...failedCandidatesMap.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
        engineHints: [...enginesInvolved].sort().map((engineId) => ({ engineId, hint: hintFor(engineId, rejections) })),
        mustPreserve: {
            hardConstraintIds: input.hardConstraints.map((c) => c.id),
            explicitAreas,
            requiredRooms,
        },
        mayChange: ['room positions within footprint', 'room areas within tolerance', 'candidate geometry'],
        mayNotChange: ['hard constraint set', 'explicit areas', 'entry side requirements'],
        deadlineMs,
    };
}
function hintFor(engineId, rejections) {
    const own = rejections.filter((r) => r.engineId === engineId);
    const codes = new Set(own.map((r) => r.code));
    const parts = [];
    if (codes.has('ROOM_OVERLAP'))
        parts.push('avoid overlapping room boundaries');
    if (codes.has('OUTSIDE_BUILDING_BOUNDARY'))
        parts.push('keep rooms inside footprint');
    if (codes.has('HARD_REQUIREMENT_MISSING'))
        parts.push('honor hard constraints');
    if (codes.has('AREA_TOLERANCE_EXCEEDED'))
        parts.push('meet explicit areas');
    if (codes.has('INVALID_ACCESS'))
        parts.push('ensure valid adjacency/access');
    if (codes.has('LOW_CONFIDENCE'))
        parts.push('increase confidence');
    if (codes.has('UNRESOLVED_ENGINE_CONFLICT'))
        parts.push('resolve cross-engine conflicts');
    if (parts.length === 0)
        parts.push('re-evaluate against hard constraints');
    return parts.join('; ');
}
};
__mods["./decision-trace.js"]=function(module,exports,require){"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDecisionTrace = buildDecisionTrace;
const util_js_1 = require("./util.js");
function buildDecisionTrace(winner, winnerScore, allScores, conflicts, provenance, weights) {
    const steps = [];
    let order = 0;
    const runnerUp = allScores
        .filter((s) => s.candidateId !== winner.candidateId)
        .sort((a, b) => b.confidenceAdjustedTotal - a.confidenceAdjustedTotal)[0];
    steps.push({
        stepId: (0, util_js_1.deterministicId)('trace', [winner.candidateId, 'selection']),
        order: order++,
        subject: 'candidate-selection',
        summary: runnerUp
            ? `Selected ${winner.candidateId} (${winnerScore.confidenceAdjustedTotal.toFixed(1)}) over ${runnerUp.candidateId} (${runnerUp.confidenceAdjustedTotal.toFixed(1)})`
            : `Selected ${winner.candidateId} (only surviving candidate) with score ${winnerScore.confidenceAdjustedTotal.toFixed(1)}`,
        drivingEvidence: winnerScore.axes.filter((a) => a.value >= 70).map((a) => `${a.axis}=${a.value.toFixed(0)}`),
        participatingEngines: [winner.producedBy],
        weights: winnerScore.axes.map((a) => ({ axis: a.axis, weight: weights[a.axis] ?? 0, source: 'config' })),
    });
    const topAxes = [...winnerScore.axes].sort((a, b) => b.value * b.weight - a.value * a.weight).slice(0, 5);
    for (const axis of topAxes) {
        steps.push({
            stepId: (0, util_js_1.deterministicId)('trace', [winner.candidateId, 'axis', axis.axis]),
            order: order++,
            subject: `axis:${axis.axis}`,
            summary: `${axis.axis} scored ${axis.value.toFixed(0)} (weight ${axis.weight})`,
            drivingEvidence: axis.evidence,
            participatingEngines: [winner.producedBy],
            weights: [{ axis: axis.axis, weight: weights[axis.axis] ?? 0, source: 'config' }],
        });
    }
    for (const c of conflicts.filter((x) => x.participants.some((p) => p.candidateId === winner.candidateId))) {
        steps.push({
            stepId: (0, util_js_1.deterministicId)('trace', [winner.candidateId, 'conflict', c.conflictId]),
            order: order++,
            subject: `conflict:${c.subject}`,
            summary: `${c.severity} conflict: ${c.description}`,
            drivingEvidence: c.evidence,
            participatingEngines: c.participants.map((p) => p.engineId),
            weights: [],
        });
    }
    for (const p of provenance.filter((x) => x.action === 'objected' && x.subject !== winner.candidateId)) {
        steps.push({
            stepId: (0, util_js_1.deterministicId)('trace', [winner.candidateId, 'objection', p.entryId]),
            order: order++,
            subject: p.subject,
            summary: `Objection noted: ${p.statement}`,
            drivingEvidence: p.evidence,
            participatingEngines: [p.actor],
            weights: [],
        });
    }
    return {
        traceId: (0, util_js_1.deterministicId)('trace', [winner.candidateId, 'full']),
        candidateId: winner.candidateId,
        steps,
        narrative: buildNarrative(winner, winnerScore, conflicts, provenance, runnerUp),
    };
}
function buildNarrative(winner, score, conflicts, provenance, runnerUp) {
    const parts = [];
    parts.push(`Selected ${winner.candidateId} from ${winner.producedBy} (v${winner.producedByVersion}).`);
    parts.push(`Weighted total: ${score.confidenceAdjustedTotal.toFixed(1)}.`);
    if (runnerUp)
        parts.push(`Margin over runner-up: ${(score.confidenceAdjustedTotal - runnerUp.confidenceAdjustedTotal).toFixed(1)}.`);
    const strong = score.axes.filter((a) => a.value >= 80).map((a) => a.axis);
    if (strong.length)
        parts.push(`Strong axes: ${strong.join(', ')}.`);
    const weak = score.axes.filter((a) => a.value < 50).map((a) => a.axis);
    if (weak.length)
        parts.push(`Weak axes: ${weak.join(', ')}.`);
    if (conflicts.length)
        parts.push(`Recorded conflicts: ${conflicts.length}.`);
    const objections = provenance.filter((p) => p.action === 'objected');
    if (objections.length)
        parts.push(`Objections: ${objections.map((o) => o.statement).slice(0, 3).join(' / ')}.`);
    return parts.join(' ');
}
};
__mods["./aziz.js"]=function(module,exports,require){"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAziz = createAziz;
const util_js_1 = require("./util.js");
const output_validation_js_1 = require("./output-validation.js");
const hard_constraints_js_1 = require("./hard-constraints.js");
const conflict_engine_js_1 = require("./conflict-engine.js");
const scoring_engine_js_1 = require("./scoring-engine.js");
const consensus_engine_js_1 = require("./consensus-engine.js");
const refinement_engine_js_1 = require("./refinement-engine.js");
const decision_trace_js_1 = require("./decision-trace.js");
const HARD_CONSTRAINT_KINDS = new Set([
    'room_count_exact', 'room_count_min', 'room_count_max',
    'room_type_required', 'room_type_forbidden', 'explicit_area',
    'entry_side_required', 'privacy_required', 'access_required', 'custom',
]);
const HARD_CONSTRAINT_SOURCES = new Set(['user', 'municipality', 'engineer', 'system']);
const SOFT_PREFERENCE_KINDS = new Set([
    'prefer_area_near', 'prefer_zone_placement', 'prefer_adjacency',
    'prefer_orientation', 'prefer_aesthetic', 'custom',
]);
const SOFT_PREFERENCE_SOURCES = new Set(['user', 'engineer', 'system']);
function validHardConstraint(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const c = value;
    return (typeof c.id === 'string' && c.id.length > 0 &&
        typeof c.kind === 'string' && HARD_CONSTRAINT_KINDS.has(c.kind) &&
        typeof c.description === 'string' &&
        (c.appliesTo === undefined || typeof c.appliesTo === 'string') &&
        typeof c.source === 'string' && HARD_CONSTRAINT_SOURCES.has(c.source) &&
        c.priority === 'must');
}
function validSoftPreference(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const p = value;
    return (typeof p.id === 'string' && p.id.length > 0 &&
        typeof p.kind === 'string' && SOFT_PREFERENCE_KINDS.has(p.kind) &&
        typeof p.description === 'string' &&
        typeof p.weight === 'number' && Number.isFinite(p.weight) &&
        (p.appliesTo === undefined || typeof p.appliesTo === 'string') &&
        typeof p.source === 'string' && SOFT_PREFERENCE_SOURCES.has(p.source));
}
function inputShapeError(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return 'INPUT_NOT_OBJECT';
    const input = value;
    if (typeof input.requestId !== 'string' || input.requestId.length === 0)
        return 'REQUEST_ID_INVALID';
    if (!input.context || typeof input.context !== 'object' || Array.isArray(input.context))
        return 'CONTEXT_INVALID';
    const context = input.context;
    if (typeof context.plotArea !== 'number' || !Number.isFinite(context.plotArea) || context.plotArea < 0)
        return 'PLOT_AREA_INVALID';
    if (typeof context.cityCode !== 'string' || context.cityCode.length === 0)
        return 'CITY_CODE_INVALID';
    if (typeof context.locale !== 'string' || context.locale.length === 0)
        return 'LOCALE_INVALID';
    if (!Array.isArray(input.engineOutputs))
        return 'ENGINE_OUTPUTS_NOT_ARRAY';
    if (!Array.isArray(input.hardConstraints))
        return 'HARD_CONSTRAINTS_NOT_ARRAY';
    if (!input.hardConstraints.every(validHardConstraint))
        return 'HARD_CONSTRAINT_INVALID';
    if (!Array.isArray(input.softPreferences))
        return 'SOFT_PREFERENCES_NOT_ARRAY';
    if (!input.softPreferences.every(validSoftPreference))
        return 'SOFT_PREFERENCE_INVALID';
    if (input.previousRefinement !== undefined && input.previousRefinement !== null) {
        if (typeof input.previousRefinement !== 'object' || Array.isArray(input.previousRefinement))
            return 'PREVIOUS_REFINEMENT_INVALID';
        const attempt = input.previousRefinement.attempt;
        if (typeof attempt !== 'number' || !Number.isInteger(attempt) || attempt < 0)
            return 'PREVIOUS_REFINEMENT_ATTEMPT_INVALID';
    }
    return null;
}
function safeInputForInvalidState(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const v = value;
        return {
            requestId: typeof v.requestId === 'string' && v.requestId.length > 0 ? v.requestId : 'invalid-request',
            context: { plotArea: 0, cityCode: 'invalid', locale: 'und' },
            hardConstraints: [],
            softPreferences: [],
            engineOutputs: [],
        };
    }
    return {
        requestId: 'invalid-request',
        context: { plotArea: 0, cityCode: 'invalid', locale: 'und' },
        hardConstraints: [],
        softPreferences: [],
        engineOutputs: [],
    };
}
function canonicalDesignKey(candidate) {
    return (0, util_js_1.stableStringify)({
        footprint: candidate.footprint,
        rooms: candidate.rooms,
        adjacency: candidate.adjacency,
        entryPoints: candidate.entryPoints,
        metrics: candidate.metrics,
    });
}
function duplicateRepresentativeOrder(a, b) {
    return (b.engineConfidence - a.engineConfidence ||
        a.candidateId.localeCompare(b.candidateId) ||
        a.producedBy.localeCompare(b.producedBy) ||
        a.producedByVersion.localeCompare(b.producedByVersion));
}
function createAziz(configInput = {}, clock = util_js_1.systemClock) {
    const config = (0, consensus_engine_js_1.normalizeConfig)(configInput);
    async function process(input) {
        const t0 = clock.monotonicMs();
        const provenance = [];
        const rejections = [];
        const allCandidates = [];
        const acceptedOutputs = [];
        const inputValidationError = inputShapeError(input);
        if (inputValidationError) {
            const safeInput = safeInputForInvalidState(input);
            return emptyState('no-candidates', safeInput, config, [], rejections, [{
                    entryId: (0, util_js_1.deterministicId)('prov', [safeInput.requestId, 'input', inputValidationError]),
                    at: clock.nowIso(),
                    actor: 'aziz',
                    action: 'objected',
                    subject: 'input-validation',
                    statement: `Invalid AZIZ input: ${inputValidationError}`,
                    evidence: [inputValidationError],
                    confidence: 1,
                }], null, clock, t0);
        }
        let inputFingerprint;
        try {
            inputFingerprint = (0, util_js_1.fnv1aHash)((0, util_js_1.stableStringify)({
                requestId: input.requestId,
                hardConstraints: input.hardConstraints,
                softPreferences: input.softPreferences,
                context: input.context,
                ...(input.previousRefinement ? { previousFeedback: input.previousRefinement } : {}),
            }));
        }
        catch (e) {
            return emptyState('no-candidates', input, config, [], rejections, [{
                    entryId: (0, util_js_1.deterministicId)('prov', [input.requestId, 'input', 'invalid']),
                    at: clock.nowIso(),
                    actor: 'aziz',
                    action: 'objected',
                    subject: 'input',
                    statement: e instanceof util_js_1.NonJsonInputError ? `Input is not JSON-compatible: ${e.message}` : 'Input fingerprint failed',
                    evidence: [],
                    confidence: 0,
                }], null, clock, t0);
        }
        const engineOutputsIndex = [];
        let receivedCount = 0;
        for (const rawOutput of input.engineOutputs) {
            const engineId = rawOutput?.engineId ?? '';
            const engineVersion = rawOutput?.engineVersion ?? '';
            const validation = (0, output_validation_js_1.validateEngineOutput)(rawOutput, { engineId, engineVersion }, inputFingerprint);
            if (!validation.ok) {
                provenance.push({
                    entryId: (0, util_js_1.deterministicId)('prov', [input.requestId, engineId, 'invalid-output', validation.reason ?? 'unknown']),
                    at: clock.nowIso(),
                    actor: engineId || 'unknown',
                    action: 'objected',
                    subject: 'output-validation',
                    statement: `Invalid engine output: ${validation.reason ?? 'unknown'}`,
                    evidence: [],
                    confidence: 0,
                });
                continue;
            }
