import { systemClock, deterministicId, fnv1aHash, stableStringify, NonJsonInputError, } from './util.js';
import { validateEngineOutput } from './output-validation.js';
import { evaluateHardConstraints } from './hard-constraints.js';
import { detectConflicts } from './conflict-engine.js';
import { scoreCandidate } from './scoring-engine.js';
import { resolveWeights, normalizeConfig } from './consensus-engine.js';
import { buildRefinementRequest } from './refinement-engine.js';
import { buildDecisionTrace } from './decision-trace.js';
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
    return stableStringify({
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
export function createAziz(configInput = {}, clock = systemClock) {
    const config = normalizeConfig(configInput);
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
                    entryId: deterministicId('prov', [safeInput.requestId, 'input', inputValidationError]),
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
            inputFingerprint = fnv1aHash(stableStringify({
                requestId: input.requestId,
                hardConstraints: input.hardConstraints,
                softPreferences: input.softPreferences,
                context: input.context,
                ...(input.previousRefinement ? { previousFeedback: input.previousRefinement } : {}),
            }));
        }
        catch (e) {
            return emptyState('no-candidates', input, config, [], rejections, [{
                    entryId: deterministicId('prov', [input.requestId, 'input', 'invalid']),
                    at: clock.nowIso(),
                    actor: 'aziz',
                    action: 'objected',
                    subject: 'input',
                    statement: e instanceof NonJsonInputError ? `Input is not JSON-compatible: ${e.message}` : 'Input fingerprint failed',
                    evidence: [],
                    confidence: 0,
                }], null, clock, t0);
        }
        const engineOutputsIndex = [];
        let receivedCount = 0;
        for (const rawOutput of input.engineOutputs) {
            const engineId = rawOutput?.engineId ?? '';
            const engineVersion = rawOutput?.engineVersion ?? '';
            const validation = validateEngineOutput(rawOutput, { engineId, engineVersion }, inputFingerprint);
            if (!validation.ok) {
                provenance.push({
                    entryId: deterministicId('prov', [input.requestId, engineId, 'invalid-output', validation.reason ?? 'unknown']),
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
            const rawValidatedOutput = rawOutput;
            const output = {
                ...rawValidatedOutput,
                candidates: validation.validCandidates ?? [],
            };
            if (validation.invalidCandidateIds?.length) {
                provenance.push({
                    entryId: deterministicId('prov', [input.requestId, output.engineId, 'invalid-candidates', ...validation.invalidCandidateIds]),
                    at: clock.nowIso(), actor: output.engineId, action: 'objected',
                    subject: 'candidate-validation',
                    statement: `Rejected invalid candidates: ${validation.invalidCandidateIds.join(', ')}`,
                    evidence: validation.invalidCandidateIds,
                    confidence: 0,
                });
            }
            engineOutputsIndex.push({
                engineId: output.engineId,
                engineVersion: output.engineVersion,
                invocationId: output.invocationId,
                candidateCount: output.candidates.length,
                confidence: output.confidence,
                warnings: output.warnings.length,
                status: output.execution.status,
            });
            if (output.execution.status === 'failed') {
                provenance.push({
                    entryId: deterministicId('prov', [input.requestId, output.engineId, 'failed']),
                    at: clock.nowIso(),
                    actor: output.engineId,
                    action: 'objected',
                    subject: 'execution',
                    statement: `Engine ${output.engineId} failed: ${output.execution.errorMessage ?? 'unknown'}`,
                    evidence: [],
                    confidence: 0,
                });
                continue;
            }
            acceptedOutputs.push(output);
            for (const cand of output.candidates) {
                if (cand.schemaVersion !== '1.0.0') {
                    rejections.push({
                        candidateId: cand.candidateId, engineId: output.engineId, code: 'VERSION_MISMATCH',
                        description: `Schema version ${cand.schemaVersion} not supported`, evidence: [], severity: 'critical',
                    });
                    continue;
                }
                receivedCount++;
                allCandidates.push(cand);
                provenance.push({
                    entryId: deterministicId('prov', [input.requestId, cand.candidateId, 'proposed']),
                    at: clock.nowIso(), actor: output.engineId, action: 'proposed',
                    subject: cand.candidateId,
                    statement: `Proposed candidate with confidence ${cand.engineConfidence}`,
                    evidence: [`rooms=${cand.rooms.length}`, `footprintArea=${cand.metrics.grossArea.toFixed(1)}`],
                    confidence: cand.engineConfidence,
                });
            }
            for (const warn of output.warnings) {
                provenance.push({
                    entryId: deterministicId('prov', [input.requestId, output.engineId, 'warn', warn.id]),
                    at: clock.nowIso(), actor: output.engineId,
                    action: warn.severity === 'critical' ? 'objected' : 'supported',
                    subject: `warning:${warn.code}`, statement: warn.message,
                    evidence: [warn.code], confidence: output.confidence,
                });
            }
        }
        // Reject low-confidence candidates before any duplicate arbitration so a
        // low-confidence candidate can never suppress a stronger design.
        const confidenceEligible = [];
        for (const c of allCandidates) {
            if (c.engineConfidence < config.confidenceFloor) {
                rejections.push({
                    candidateId: c.candidateId, engineId: c.producedBy, code: 'LOW_CONFIDENCE',
                    description: `Candidate confidence ${c.engineConfidence} below floor ${config.confidenceFloor}`,
                    evidence: [], severity: 'critical',
                });
                provenance.push({
                    entryId: deterministicId('prov', [input.requestId, c.candidateId, 'low-confidence']),
                    at: clock.nowIso(), actor: 'aziz', action: 'rejected', subject: c.candidateId,
                    statement: `Low confidence (${c.engineConfidence} < ${config.confidenceFloor})`,
                    evidence: [], confidence: 1,
                });
                continue;
            }
            confidenceEligible.push(c);
        }
        // Candidate IDs are global identities. Reject every collision rather than
        // keeping whichever engine happened to appear first.
        const idCounts = new Map();
        for (const c of confidenceEligible)
            idCounts.set(c.candidateId, (idCounts.get(c.candidateId) ?? 0) + 1);
        const idUniqueCandidates = [];
        for (const c of confidenceEligible) {
            if ((idCounts.get(c.candidateId) ?? 0) > 1) {
                const rejection = {
                    candidateId: c.candidateId, engineId: c.producedBy, code: 'DUPLICATE_CANDIDATE',
                    description: `Candidate ID ${c.candidateId} is not globally unique`,
                    evidence: [`candidateId=${c.candidateId}`], severity: 'major',
                };
                rejections.push(rejection);
                provenance.push({
                    entryId: deterministicId('prov', [input.requestId, c.producedBy, c.candidateId, 'duplicate-id']),
                    at: clock.nowIso(), actor: 'aziz', action: 'rejected', subject: c.candidateId,
                    statement: rejection.description, evidence: rejection.evidence, confidence: 1,
                });
                continue;
            }
            idUniqueCandidates.push(c);
        }
        // The engine-supplied geometryHash is provenance only; it is not trusted
        // for arbitration. Deduplicate by canonical validated design content and
        // choose the representative deterministically, independent of input order.
        const designGroups = new Map();
        for (const c of idUniqueCandidates) {
            const key = canonicalDesignKey(c);
            const group = designGroups.get(key) ?? [];
            group.push(c);
            designGroups.set(key, group);
        }
        const uniqueCandidates = [];
        for (const group of designGroups.values()) {
            const ordered = [...group].sort(duplicateRepresentativeOrder);
            const keep = ordered[0];
            uniqueCandidates.push(keep);
            for (const c of ordered.slice(1)) {
                const rejection = {
                    candidateId: c.candidateId, engineId: c.producedBy, code: 'DUPLICATE_CANDIDATE',
                    description: `Duplicate design of candidate ${keep.candidateId}`,
                    evidence: [`kept=${keep.candidateId}`, `reportedGeometryHash=${c.geometryHash}`], severity: 'minor',
                };
                rejections.push(rejection);
                provenance.push({
                    entryId: deterministicId('prov', [input.requestId, c.candidateId, 'duplicate-design', keep.candidateId]),
                    at: clock.nowIso(), actor: 'aziz', action: 'rejected', subject: c.candidateId,
                    statement: rejection.description, evidence: rejection.evidence, confidence: 1,
                });
            }
        }
        if (uniqueCandidates.length === 0) {
            const attempt = (input.previousRefinement?.attempt ?? 0) + 1;
            const refinement = rejections.length > 0 && attempt <= config.maxRefinementAttempts
                ? buildRefinementRequest(input, rejections, attempt, clock, config.engineTimeoutMs)
                : null;
            return {
                ...emptyState(rejections.length > 0 ? 'all-rejected' : 'no-candidates', input, config, engineOutputsIndex, rejections, provenance, refinement, clock, t0),
                candidatesReceived: receivedCount,
            };
        }
        const survivorsAfterHard = [];
        for (const c of uniqueCandidates) {
            const hc = evaluateHardConstraints(c, input.hardConstraints, config);
            if (hc.violations.length > 0) {
                rejections.push(...hc.violations);
                for (const v of hc.violations) {
                    provenance.push({
                        entryId: deterministicId('prov', [input.requestId, c.candidateId, v.code, v.description]),
                        at: clock.nowIso(), actor: 'aziz', action: 'rejected',
                        subject: c.candidateId, statement: v.description, evidence: v.evidence, confidence: 1,
                    });
                }
            }
            else {
                survivorsAfterHard.push(c);
            }
        }
        if (survivorsAfterHard.length === 0) {
            const attempt = (input.previousRefinement?.attempt ?? 0) + 1;
            const refinement = attempt <= config.maxRefinementAttempts
                ? buildRefinementRequest(input, rejections, attempt, clock, config.engineTimeoutMs)
                : null;
            return {
                ...emptyState('all-rejected', input, config, engineOutputsIndex, rejections, provenance, refinement, clock, t0),
                candidatesReceived: receivedCount,
            };
        }
        const conflicts = detectConflicts(survivorsAfterHard, acceptedOutputs);
        for (const cf of conflicts) {
            provenance.push({
                entryId: deterministicId('prov', [input.requestId, 'conflict', cf.conflictId]),
                at: clock.nowIso(), actor: 'aziz', action: 'objected',
                subject: cf.subject, statement: cf.description, evidence: cf.evidence, confidence: 1,
            });
        }
        const criticalConflictCandidateIds = new Set();
        for (const cf of conflicts) {
            if (cf.severity !== 'critical')
                continue;
            for (const p of cf.participants) {
                if (p.candidateId && p.candidateId !== 'n/a')
                    criticalConflictCandidateIds.add(p.candidateId);
            }
        }
        const survivors = [];
        for (const c of survivorsAfterHard) {
            if (criticalConflictCandidateIds.has(c.candidateId)) {
                rejections.push({
                    candidateId: c.candidateId, engineId: c.producedBy, code: 'UNRESOLVED_ENGINE_CONFLICT',
                    description: 'Candidate involved in a critical cross-engine conflict',
                    evidence: conflicts
                        .filter((cf) => cf.severity === 'critical' && cf.participants.some((p) => p.candidateId === c.candidateId))
                        .map((cf) => cf.conflictId),
                    severity: 'critical',
                });
                provenance.push({
                    entryId: deterministicId('prov', [input.requestId, c.candidateId, 'critical-conflict']),
                    at: clock.nowIso(), actor: 'aziz', action: 'rejected',
                    subject: c.candidateId,
                    statement: 'Rejected due to critical cross-engine conflict',
                    evidence: [], confidence: 1,
                });
            }
            else {
                survivors.push(c);
            }
        }
        if (survivors.length === 0) {
            const attempt = (input.previousRefinement?.attempt ?? 0) + 1;
            const refinement = attempt <= config.maxRefinementAttempts
                ? buildRefinementRequest(input, rejections, attempt, clock, config.engineTimeoutMs)
                : null;
            return {
                ...emptyState('all-rejected', input, config, engineOutputsIndex, rejections, provenance, refinement, clock, t0),
                candidatesReceived: receivedCount,
            };
        }
        const weights = resolveWeights(config, input.context);
        const scores = survivors.map((c) => scoreCandidate(c, input.hardConstraints, input.softPreferences, conflicts, weights, config));
        const byId = new Map(survivors.map((c) => [c.candidateId, c]));
        const ranked = [...scores].sort((a, b) => b.confidenceAdjustedTotal - a.confidenceAdjustedTotal || a.candidateId.localeCompare(b.candidateId));
        const topScore = ranked[0].confidenceAdjustedTotal;
        const tieGroup = ranked
            .filter((s) => topScore - s.confidenceAdjustedTotal < config.tieThreshold)
            .sort((a, b) => {
            const aConf = byId.get(a.candidateId).engineConfidence;
            const bConf = byId.get(b.candidateId).engineConfidence;
            return bConf - aConf || a.candidateId.localeCompare(b.candidateId);
        });
        const winnerScore = tieGroup[0];
        const sortedScores = [winnerScore, ...ranked.filter((s) => s !== winnerScore)];
        const winner = byId.get(winnerScore.candidateId);
        const trace = buildDecisionTrace(winner, winnerScore, sortedScores, conflicts, provenance, weights);
        for (const step of trace.steps) {
            provenance.push({
                entryId: deterministicId('prov', [input.requestId, 'trace', step.stepId]),
                at: clock.nowIso(), actor: 'aziz', action: 'accepted',
                subject: step.subject, statement: step.summary,
                evidence: step.drivingEvidence, confidence: 1,
            });
        }
        return {
            requestId: input.requestId,
            builtAt: clock.nowIso(),
            config,
            inputs: input,
            candidatesReceived: receivedCount,
            candidatesRejected: rejections,
            candidatesSurvived: survivors.map((s) => s.candidateId),
            scores: sortedScores,
            conflicts,
            selectedCandidateId: winner.candidateId,
            selectionReason: `Highest weighted total (${winnerScore.confidenceAdjustedTotal.toFixed(2)})`,
            decisionTrace: trace,
            provenance,
            refinementRequest: null,
            engineOutputsIndex,
            status: 'selected',
            durationMs: clock.monotonicMs() - t0,
        };
    }
    return {
        process,
        config: () => ({
            ...config,
            weights: { ...config.weights },
            weightProfiles: Object.fromEntries(Object.entries(config.weightProfiles).map(([k, v]) => [k, { ...v }])),
        }),
    };
}
function emptyState(status, input, config, engineOutputsIndex, rejections, provenance, refinement, clock, t0) {
    return {
        requestId: input.requestId,
        builtAt: clock.nowIso(),
        config,
        inputs: input,
        candidatesReceived: 0,
        candidatesRejected: rejections,
        candidatesSurvived: [],
        scores: [],
        conflicts: [],
        selectedCandidateId: null,
        selectionReason: null,
        decisionTrace: null,
        provenance,
        refinementRequest: refinement,
        engineOutputsIndex,
        status,
        durationMs: clock.monotonicMs() - t0,
    };
}
//# sourceMappingURL=aziz.js.map