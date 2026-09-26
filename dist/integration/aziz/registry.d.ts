import type { EngineAdapter, EngineInputContract, EngineOutputContract } from './types.js';
export interface InvocationResult {
    engineId: string;
    engineVersion: string;
    ok: boolean;
    output?: EngineOutputContract;
    error?: string;
}
export declare class AdapterRegistry {
    private adapters;
    register(adapter: EngineAdapter): void;
    unregister(engineId: string): boolean;
    get(engineId: string): EngineAdapter | undefined;
    all(): EngineAdapter[];
    size(): number;
    invokeAll(input: EngineInputContract, timeoutMs?: number): Promise<InvocationResult[]>;
    private invokeOne;
}
//# sourceMappingURL=registry.d.ts.map