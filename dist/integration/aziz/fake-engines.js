import { systemClock, deterministicId, fnv1aHash, stableStringify } from './util.js';
function rect(x, y, w, h) {
    return { points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] };
}
function makeCandidate(engineId, version, idx, seed, roomType, requestId, inputFingerprint) {
    const x = 5 + (seed % 3);
    const y = 5 + idx * 2;
    const rooms = [
        { roomId: 'r-majlis', type: 'majlis', zone: 'public', boundary: rect(x, y, 6, 6), clearArea: 36 },
        { roomId: 'r-living', type: 'living', zone: 'family', boundary: rect(x + 7, y, 7, 6), clearArea: 42 },
        { roomId: 'r-kitchen', type: 'kitchen', zone: 'family', boundary: rect(x, y + 7, 5, 5), clearArea: 25 },
        { roomId: 'r-bedroom-1', type: 'bedroom', zone: 'private', boundary: rect(x + 6, y + 7, 4, 5), clearArea: 20 },
        { roomId: 'r-service', type: 'service', zone: 'service', boundary: rect(x + 11, y + 7, 3, 5), clearArea: 15 },
    ];
    void roomType;
    const adjacency = [
        { a: 'r-majlis', b: 'r-living', sharedLength: 0.5 },
        { a: 'r-living', b: 'r-kitchen', sharedLength: 0.5 },
        { a: 'r-living', b: 'r-bedroom-1', sharedLength: 0.5 },
        { a: 'r-kitchen', b: 'r-service', sharedLength: 0.5 },
    ];
    const footprint = rect(5, 5, 15, 15);
    const geometryHash = fnv1aHash(stableStringify({ rooms, footprint, seed, roomType }));
    const invocationId = deterministicId('inv', [requestId, inputFingerprint, engineId, seed]);
    return {
        candidateId: deterministicId('cand', [engineId, requestId, inputFingerprint, seed, idx]),
        producedBy: engineId,
        producedByVersion: version,
        invocationId,
        schemaVersion: '1.0.0',
        createdAt: '2026-01-01T00:00:00.000Z',
        label: `Candidate ${idx + 1}`,
        geometryHash,
        footprint,
        rooms,
        adjacency,
        entryPoints: [{ id: 'entry-1', side: 'south', roomId: 'r-majlis' }],
        metrics: { grossArea: 225, buildRatio: 1, roomCount: rooms.length },
        engineConfidence: 0.8,
    };
}
export function createFakeEngine(cfg, clock = systemClock) {
    const version = '1.0.0';
    const candidateCount = cfg.candidateCount ?? 1;
    const confidence = cfg.confidence ?? 0.8;
    const delayMs = cfg.delayMs ?? 0;
    const fail = cfg.fail;
    const seed = cfg.placementSeed ?? 0;
    return {
        engineId: cfg.engineId,
        engineVersion: version,
        role: cfg.role,
        capabilities: {
            disciplines: [cfg.role],
            supportsGeometry: true,
            supportsRequirements: cfg.role === 'requirements',
            supportsScoring: false,
            deterministic: true,
        },
        async execute(input) {
            const startedAt = clock.nowIso();
            const t0 = clock.monotonicMs();
            const inputFingerprint = fnv1aHash(stableStringify(input));
            if (delayMs > 0)
                await new Promise((res) => setTimeout(res, delayMs));
            if (fail === 'throw')
                throw new Error('FAKE_ENGINE_THROW');
            if (fail === 'timeout')
                await new Promise((res) => setTimeout(res, 10_000));
            if (fail === 'empty')
                return makeOutput(cfg, version, clock, startedAt, t0, [], input, inputFingerprint);
            if (fail === 'malformed')
                return { engineId: cfg.engineId };
            if (fail === 'version-mismatch') {
                const c = makeCandidate(cfg.engineId, version, 0, seed, cfg.roomTypeOverride ?? 'majlis', input.requestId, inputFingerprint);
                c.schemaVersion = '2.0.0';
                return makeOutput(cfg, version, clock, startedAt, t0, [c], input, inputFingerprint);
            }
            const candidates = [];
            for (let i = 0; i < candidateCount; i++) {
                const c = makeCandidate(cfg.engineId, version, i, seed, cfg.roomTypeOverride ?? 'majlis', input.requestId, inputFingerprint);
                c.engineConfidence = confidence;
                candidates.push(c);
            }
            return makeOutput(cfg, version, clock, startedAt, t0, candidates, input, inputFingerprint);
        },
    };
}
function makeOutput(cfg, version, clock, startedAt, t0, candidates, input, inputFingerprint) {
    const completedAt = clock.nowIso();
    const invocationId = candidates[0]?.invocationId ?? deterministicId('inv', [input.requestId, inputFingerprint, cfg.engineId, 'empty']);
    return {
        engineId: cfg.engineId,
        engineVersion: version,
        invocationId,
        capabilities: {
            disciplines: [cfg.role],
            supportsGeometry: true,
            supportsRequirements: cfg.role === 'requirements',
            supportsScoring: false,
            deterministic: true,
        },
        confidence: cfg.confidence ?? 0.8,
        execution: { startedAt, completedAt, durationMs: clock.monotonicMs() - t0, version, status: 'ok' },
        provenance: {
            engineId: cfg.engineId,
            engineVersion: version,
            invocationId,
            requestedAt: startedAt,
            completedAt,
            inputHash: inputFingerprint,
        },
        assumptions: [],
        warnings: [],
        constraintsEvaluated: [],
        candidates,
    };
}
//# sourceMappingURL=fake-engines.js.map