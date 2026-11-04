import {digestHex} from './sha256.mjs';
export class FacadeError extends Error { constructor(code, path, message = code) { super(`${message}: ${path}`); this.code = code; this.path = path; } }
export const fail = (code, path, message) => { throw new FacadeError(code, path, message); };
export function number(v, path, min = -Infinity, max = Infinity) { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail('INVALID_NUMBER', path); return v; }
export function id(v, path = 'id') { if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,150}$/.test(v) || v.includes('..')) fail('INVALID_ID', path); return v; }
export function canonical(value) {
  const seen = new Set(); let nodes = 0;
  const walk = v => {
    if (++nodes > 2000000) fail('RESOURCE_LIMIT', 'json');
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') { number(v, 'json'); return JSON.stringify(v); }
    if (!v || typeof v !== 'object' || seen.has(v) || !Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail('NON_JSON', 'json');
    for (const d of Object.values(Object.getOwnPropertyDescriptors(v))) if (d.get || d.set) fail('ACCESSOR', 'json');
    if (Object.getOwnPropertySymbols(v).length) fail('NON_JSON', 'json');
    seen.add(v); let s;
    if (Array.isArray(v)) { if (Object.keys(v).length !== v.length) fail('SPARSE_ARRAY', 'json'); s = '[' + v.map(walk).join(',') + ']'; }
    else s = '{' + Object.keys(v).sort().map(k => { if (['__proto__', 'constructor', 'prototype'].includes(k)) fail('UNSAFE_KEY', k); return JSON.stringify(k) + ':' + walk(v[k]); }).join(',') + '}';
    seen.delete(v); return s;
  };
  return walk(value);
}
export const copy = v => JSON.parse(canonical(v));
export function freeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(freeze); } return v; }
export async function hash(v) { return digestHex(new TextEncoder().encode(canonical(v))); }
export function unique(items, path) { const set = new Set(); for (const x of items) { id(x.id, path); if (set.has(x.id)) fail('DUPLICATE_ID', path + ':' + x.id); set.add(x.id); } }
export const issue = (code, messageAr, details = {}, severity = 'review') => ({ code, messageAr, details, severity });
