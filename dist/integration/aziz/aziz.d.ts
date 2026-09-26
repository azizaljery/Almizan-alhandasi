import type { AzizConfig, AzizDesignState, AzizInput } from './types.js';
import { type Clock } from './util.js';
import { type AzizConfigInput } from './consensus-engine.js';
export interface AzizEngine {
    process(input: AzizInput): Promise<AzizDesignState>;
    config(): AzizConfig;
}
export declare function createAziz(configInput?: AzizConfigInput, clock?: Clock): AzizEngine;
//# sourceMappingURL=aziz.d.ts.map