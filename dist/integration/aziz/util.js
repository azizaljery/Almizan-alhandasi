export const systemClock = {
    nowIso: () => new Date().toISOString(),
    monotonicMs: () => typeof performance !== 'undefined' ? performance.now() : Date.now(),
};
export function fixedClock(iso, monotonic = 0) {
    return { nowIso: () => iso, monotonicMs: () => monotonic };
}
export class NonJsonInputError extends Error {
    constructor(message) {
        super(`NON_JSON_INPUT: ${message}`);
        this.name = 'NonJsonInputError';
    }
}
export function deterministicId(prefix, parts) {
    return (prefix +
        ':' +
        parts.map((p) => {
            const s = String(p);
            return `${s.length}#${s}`;
        }).join('|'));
}
export function stableStringify(value, seen = new WeakSet()) {
    if (value === null)
        return 'null';
    const t = typeof value;
    if (t === 'undefined')
        throw new NonJsonInputError('undefined');
    if (t === 'function')
        throw new NonJsonInputError('function');
    if (t === 'symbol')
        throw new NonJsonInputError('symbol');
    if (t === 'bigint')
        throw new NonJsonInputError('bigint');
    if (t === 'number') {
        if (!Number.isFinite(value))
            throw new NonJsonInputError('non-finite number');
        return String(value);
    }
    if (t === 'boolean')
        return value ? 'true' : 'false';
    if (t === 'string')
        return JSON.stringify(value);
    if (Array.isArray(value)) {
        if (seen.has(value))
            throw new NonJsonInputError('cycle (array)');
        seen.add(value);
        const out = '[' + value.map((x) => stableStringify(x, seen)).join(',') + ']';
        seen.delete(value);
        return out;
    }
    if (value instanceof Date)
        throw new NonJsonInputError('Date');
    if (value instanceof Map)
        throw new NonJsonInputError('Map');
    if (value instanceof Set)
        throw new NonJsonInputError('Set');
    if (value instanceof RegExp)
        throw new NonJsonInputError('RegExp');
    const obj = value;
    const proto = Object.getPrototypeOf(obj);
    if (proto !== null && proto !== Object.prototype) {
        throw new NonJsonInputError(`exotic object: ${proto?.constructor?.name ?? 'unknown'}`);
    }
    if (seen.has(obj))
        throw new NonJsonInputError('cycle (object)');
    seen.add(obj);
    const keys = Object.keys(obj).sort();
    const out = '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k], seen)).join(',') + '}';
    seen.delete(obj);
    return out;
}
export function fnv1aHash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}
//# sourceMappingURL=util.js.map