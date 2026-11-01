export class InputError extends Error {
  constructor(code, path, message = code) { super(`${message} (${path})`); this.name = 'InputError'; this.code = code; this.path = path; }
}
export const fail = (code, path, message) => { throw new InputError(code, path, message); };
export function number(v, path, { min = -Infinity, max = Infinity, positive = false } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (positive && v <= 0)) fail('INVALID_NUMBER', path);
  return v;
}
export function identifier(v, path) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(v)) fail('INVALID_ID', path);
  return v;
}
export function canonical(value) {
  const seen = new Set(); let nodes = 0;
  function visit(v, path) {
    if (++nodes > 500000) fail('RESOURCE_LIMIT', path);
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') { number(v, path); return JSON.stringify(v); }
    if (!v || typeof v !== 'object' || seen.has(v)) fail('NON_JSON_VALUE', path);
    if (Object.getPrototypeOf(v) !== Object.prototype && !Array.isArray(v) && Object.getPrototypeOf(v) !== null) fail('NON_PLAIN_OBJECT', path);
    seen.add(v);
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(v))) if (d.get || d.set) fail('ACCESSOR_NOT_ALLOWED', path + '.' + k);
    let out;
    if (Array.isArray(v)) {
      if (Object.keys(v).length !== v.length) fail('NON_JSON_ARRAY', path);
      out = '[' + v.map((x, i) => visit(x, `${path}[${i}]`)).join(',') + ']';
    } else {
      out = '{' + Object.keys(v).sort().map(k => {
        if (['__proto__', 'constructor', 'prototype'].includes(k)) fail('UNSAFE_KEY', path + '.' + k);
        return JSON.stringify(k) + ':' + visit(v[k], path + '.' + k);
      }).join(',') + '}';
    }
    seen.delete(v); return out;
  }
  return visit(value, '$');
}
export const copy = value => JSON.parse(canonical(value));
export function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const v of Object.values(value)) freeze(v); } return value; }
export async function hash(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export function unique(items, path) {
  if (!Array.isArray(items)) fail('ARRAY_REQUIRED', path);
  const seen = new Set();
  for (const item of items) { identifier(item.id, path + '.id'); if (seen.has(item.id)) fail('DUPLICATE_ID', path + ':' + item.id); seen.add(item.id); }
}
export const issue = (discipline, code, messageAr, details = {}, severity = 'pending') => ({ discipline, code, severity, messageAr, details });
export function calculation(id, method, inputs, fn, unit, issues, discipline, sourceRefs = []) {
  try { const value = fn(inputs); canonical(value); return { id, method, inputs: copy(inputs), value, unit, status: 'CALCULATED', basis: 'SUPPLIED_INPUTS', sourceRefs }; }
  catch (e) {
    if (!(e instanceof InputError)) throw e;
    issues.push(issue(discipline, 'CALCULATION_INPUT_REQUIRED', 'بيانات الحساب ناقصة أو غير صالحة.', { id, path: e.path, error: e.code }));
    // Inputs with undefined fields are deliberately omitted from the JSON record.
    const supplied = Object.fromEntries(Object.entries(inputs).filter(([, v]) => v !== undefined));
    return { id, method, inputs: copy(supplied), value: null, unit, status: 'NOT_CALCULATED', basis: 'INCOMPLETE_INPUTS', sourceRefs };
  }
}
export function emptyDiscipline(id) { return { id, stage: 'PRELIMINARY', constructionApproved: false, codeCompliance: 'NOT_EVALUATED', devices: [], routes: [], calculations: [], schedules: [], issues: [], limitations: [] }; }
export const sum = a => a.reduce((s, v) => s + v, 0);
