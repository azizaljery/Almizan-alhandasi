import { deterministicId } from './util.js';
export function buildRefinementRequest(input, rejections, attempt, clock, deadlineMs) {
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
        requestId: deterministicId('refine', [input.requestId, attempt]),
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
//# sourceMappingURL=refinement-engine.js.map