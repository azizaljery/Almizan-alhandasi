import type { ScoreAxis, AzizConfig } from './types.js';
export declare const DEFAULT_PROFILES: Record<string, Partial<Record<ScoreAxis, number>>>;
export type AzizConfigInput = Omit<Partial<AzizConfig>, 'weights' | 'weightProfiles'> & {
    weights?: Partial<Record<ScoreAxis, number>>;
    weightProfiles?: Record<string, Partial<Record<ScoreAxis, number>>>;
};
export declare function defaultConfig(): AzizConfig;
export declare function normalizeConfig(input?: AzizConfigInput): AzizConfig;
export declare function resolveWeights(config: AzizConfig, _context: {
    plotArea: number;
    cityCode: string;
    locale: string;
}): Record<ScoreAxis, number>;
//# sourceMappingURL=consensus-engine.d.ts.map