import { deterministicId } from './util.js';
import { centroidOf, bboxOf, isValidPolygon } from './geometry.js';
export function detectConflicts(candidates, outputs) {
    const conflicts = [];
    const byType = new Map();
    for (const c of candidates) {
        if (!isValidPolygon(c.footprint))
            continue;
        const bb = bboxOf(c.footprint);
        for (const room of c.rooms) {
            if (!isValidPolygon(room.boundary))
                continue;
            const cen = centroidOf(room.boundary);
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
            conflictId: deterministicId('conflict', ['placement', type, ...participants.map((p) => p.engineId).sort()]),
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
            conflictId: deterministicId('conflict', ['constraint-eval', cid, ...[...byEngine.keys()].sort()]),
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
                conflictId: deterministicId('conflict', ['warning', o.engineId, warn.id]),
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
//# sourceMappingURL=conflict-engine.js.map