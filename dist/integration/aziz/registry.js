import { fnv1aHash, stableStringify, NonJsonInputError } from './util.js';
import { validateEngineOutput } from './output-validation.js';
async function bounded(work, timeoutMs) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        throw new Error('INVALID_TIMEOUT');
    const controller = new AbortController();
    let timer;
    try {
        return await Promise.race([
            work(controller.signal),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    controller.abort();
                    reject(new Error('ENGINE_TIMEOUT'));
                }, timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
export class AdapterRegistry {
    adapters = new Map();
    register(adapter) {
        if (!adapter.engineId.trim())
            throw new Error('Adapter engineId is required');
        if (this.adapters.has(adapter.engineId))
            throw new Error(`Adapter ${adapter.engineId} already registered`);
        this.adapters.set(adapter.engineId, adapter);
    }
    unregister(engineId) { return this.adapters.delete(engineId); }
    get(engineId) { return this.adapters.get(engineId); }
    all() { return [...this.adapters.values()]; }
    size() { return this.adapters.size; }
    async invokeAll(input, timeoutMs = 30000) {
        return Promise.all(this.all().map((a) => this.invokeOne(a, input, timeoutMs)));
    }
    async invokeOne(adapter, input, timeoutMs) {
        let inputHash;
        try {
            inputHash = fnv1aHash(stableStringify(input));
        }
        catch (e) {
            return {
                engineId: adapter.engineId,
                engineVersion: adapter.engineVersion,
                ok: false,
                error: e instanceof NonJsonInputError ? `INVALID_ENGINE_INPUT: ${e.message}` : 'INVALID_ENGINE_INPUT',
            };
        }
        try {
            if (adapter.healthCheck) {
                const h = await bounded(() => adapter.healthCheck(), timeoutMs);
                if (!h?.healthy) {
                    return {
                        engineId: adapter.engineId,
                        engineVersion: adapter.engineVersion,
                        ok: false,
                        error: `unhealthy: ${h?.reason ?? 'unknown'}`,
                    };
                }
            }
            const output = await bounded((signal) => adapter.execute(input, { signal, deadlineMs: timeoutMs }), timeoutMs);
            const check = validateEngineOutput(output, adapter, inputHash);
            if (!check.ok) {
                return {
                    engineId: adapter.engineId,
                    engineVersion: adapter.engineVersion,
                    ok: false,
                    error: `INVALID_ENGINE_OUTPUT: ${check.reason ?? 'unknown'}`,
                };
            }
            return {
                engineId: adapter.engineId,
                engineVersion: adapter.engineVersion,
                ok: true,
                output: output,
            };
        }
        catch (e) {
            return {
                engineId: adapter.engineId,
                engineVersion: adapter.engineVersion,
                ok: false,
                error: e instanceof Error ? e.message : 'UNKNOWN_ENGINE_ERROR',
            };
        }
    }
}
//# sourceMappingURL=registry.js.map