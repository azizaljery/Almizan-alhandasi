import { deterministicId } from './util.js';
export function buildDecisionTrace(winner, winnerScore, allScores, conflicts, provenance, weights) {
    const steps = [];
    let order = 0;
    const runnerUp = allScores
        .filter((s) => s.candidateId !== winner.candidateId)
        .sort((a, b) => b.confidenceAdjustedTotal - a.confidenceAdjustedTotal)[0];
    steps.push({
        stepId: deterministicId('trace', [winner.candidateId, 'selection']),
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
            stepId: deterministicId('trace', [winner.candidateId, 'axis', axis.axis]),
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
            stepId: deterministicId('trace', [winner.candidateId, 'conflict', c.conflictId]),
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
            stepId: deterministicId('trace', [winner.candidateId, 'objection', p.entryId]),
            order: order++,
            subject: p.subject,
            summary: `Objection noted: ${p.statement}`,
            drivingEvidence: p.evidence,
            participatingEngines: [p.actor],
            weights: [],
        });
    }
    return {
        traceId: deterministicId('trace', [winner.candidateId, 'full']),
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
//# sourceMappingURL=decision-trace.js.map