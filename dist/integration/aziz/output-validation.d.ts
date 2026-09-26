import type { EngineAdapter, DesignCandidate } from './types.js';
export interface OutputValidationResult {
    ok: boolean;
    reason?: string;
    validCandidates?: DesignCandidate[];
    invalidCandidateIds?: string[];
}
export declare function validateEngineOutput(raw: unknown, adapter: Pick<EngineAdapter, 'engineId' | 'engineVersion'>, inputHash: string): OutputValidationResult;
//# sourceMappingURL=output-validation.d.ts.map