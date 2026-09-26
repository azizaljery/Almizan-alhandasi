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
export function validateEngineOutput(raw, adapter, inputHash) {
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
//# sourceMappingURL=output-validation.js.map