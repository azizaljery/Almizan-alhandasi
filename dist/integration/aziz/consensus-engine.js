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
export const DEFAULT_PROFILES = {
    balanced: {},
    privacyFirst: { privacy: 3, guestFamilySeparation: 2, geometryValidity: 2 },
    geometryFirst: { geometryValidity: 4, hardConstraintCompliance: 4 },
    requirementsFirst: { requirementCoverage: 3.5, hardConstraintCompliance: 3.5 },
    referenceInspired: { referenceCompatibility: 1.5, designEfficiency: 1.3 },
};
const cloneProfile = (p) => ({ ...p });
const cloneProfiles = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, cloneProfile(v)]));
export function defaultConfig() {
    return {
        weights: { ...DEFAULT_WEIGHTS },
        weightProfiles: cloneProfiles(DEFAULT_PROFILES),
        activeProfile: 'balanced',
        confidenceFloor: 0.3,
        tieThreshold: 2,
        maxRefinementAttempts: 3,
        areaTolerancePercent: 10,
        engineTimeoutMs: 30000,
    };
}
export function normalizeConfig(input = {}) {
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
export function resolveWeights(config, _context) {
    const profile = config.weightProfiles[config.activeProfile] ?? {};
    const out = { ...DEFAULT_WEIGHTS, ...config.weights };
    for (const [k, v] of Object.entries(profile))
        out[k] = v;
    return out;
}
//# sourceMappingURL=consensus-engine.js.map