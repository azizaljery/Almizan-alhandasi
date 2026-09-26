export interface Clock {
    nowIso(): string;
    monotonicMs(): number;
}
export declare const systemClock: Clock;
export declare function fixedClock(iso: string, monotonic?: number): Clock;
export declare class NonJsonInputError extends Error {
    constructor(message: string);
}
export declare function deterministicId(prefix: string, parts: Array<string | number | boolean>): string;
export declare function stableStringify(value: unknown, seen?: WeakSet<object>): string;
export declare function fnv1aHash(s: string): string;
//# sourceMappingURL=util.d.ts.map