import { polygonContains, polygonsOverlap, isValidPolygon, centroidOf } from './geometry.js';
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
export function evaluateHardConstraints(candidate, constraints, config) {
    const violations = [];
    const satisfiedIds = [];
    const evidence = [];
    if (candidate.rooms.length === 0) {
        violations.push(reject(candidate, 'EMPTY_CANDIDATE', 'Candidate contains no rooms', []));
        return { violations, satisfiedIds, axisScore: 0, evidence };
    }
    if (!isValidPolygon(candidate.footprint)) {
        violations.push(reject(candidate, 'INVALID_SCHEMA', 'Candidate footprint is not a valid polygon', []));
        return { violations, satisfiedIds, axisScore: 0, evidence };
    }
    for (const r of candidate.rooms) {
        if (!r.roomId || !Number.isFinite(r.clearArea) || r.clearArea <= 0 || !isValidPolygon(r.boundary)) {
            violations.push(reject(candidate, 'INVALID_SCHEMA', `Room ${r.roomId ?? '?'} geometry or area invalid`, [`room=${r.roomId ?? 'unknown'}`]));
            return { violations, satisfiedIds, axisScore: 0, evidence };
        }
    }
    for (let i = 0; i < candidate.rooms.length; i++) {
        for (let j = i + 1; j < candidate.rooms.length; j++) {
            const a = candidate.rooms[i];
            const b = candidate.rooms[j];
            if (polygonsOverlap(a.boundary, b.boundary)) {
                violations.push(reject(candidate, 'ROOM_OVERLAP', `Rooms ${a.roomId} and ${b.roomId} overlap`, [`room-a=${a.roomId}`, `room-b=${b.roomId}`]));
            }
        }
    }
    for (const r of candidate.rooms) {
        if (!polygonContains(candidate.footprint, r.boundary)) {
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
            const ca = centroidOf(a.boundary);
            const cb = centroidOf(b.boundary);
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
//# sourceMappingURL=hard-constraints.js.map