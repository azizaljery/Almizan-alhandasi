import type { EngineAdapter } from './types.js';
import { type Clock } from './util.js';
interface FakeConfig {
    engineId: string;
    role: 'requirements' | 'architectural' | 'geometry' | 'reference' | 'custom';
    candidateCount?: number;
    confidence?: number;
    delayMs?: number;
    fail?: 'throw' | 'timeout' | 'empty' | 'malformed' | 'version-mismatch';
    roomTypeOverride?: string;
    placementSeed?: number;
}
export declare function createFakeEngine(cfg: FakeConfig, clock?: Clock): EngineAdapter;
export {};
//# sourceMappingURL=fake-engines.d.ts.map