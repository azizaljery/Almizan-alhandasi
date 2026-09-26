/**
 * MIZAN-IR/1.0.0 control-room reference; NOT an AZIZ/Claude/Gemini replacement.
 * Profile: mizan-json-sorted-keys-v1. Not RFC 8785 / JCS and not geometric equivalence.
 * Browser/Node parity uses Web Crypto over the same UTF-8 bytes; no external dependency.
 */
export const PROFILE = 'mizan-json-sorted-keys-v1';
export const CONTRACT_VERSION = '1.0.0';
export const FRAME = 'PLOT_SW_X_EAST_Y_NORTH';
export const UNITS = Object.freeze({ length: 'm', area: 'm2', volume: 'm3' });
export class ContractError extends Error {
  constructor(code, path = '$') { super(`${code}: ${path}`); this.name = 'ContractError'; this.code = code; this.path = path; }
}
export function canonicalJSON(value) {
  const active = new WeakSet(); let visited = 0;
  function walk(v, path, depth) {
    if (depth > 64 || ++visited > 100000) throw new ContractError('RESOURCE_LIMIT', path);
    if (v === null) return 'null';
    if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new ContractError('NON_FINITE', path);
      return JSON.stringify(v);
    }
    if (typeof v !== 'object') throw new ContractError('NON_JSON', path);
    if (active.has(v)) throw new ContractError('CYCLE', path);
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) throw new ContractError('NON_PLAIN_OBJECT', path);
    if (Object.getOwnPropertySymbols(v).length) throw new ContractError('SYMBOL_KEY', path);
    active.add(v);
    try {
      if (Array.isArray(v)) {
        if (v.length > 100000 || Object.keys(v).length !== v.length) throw new ContractError('SPARSE_OR_EXTENDED_ARRAY', path);
        const out = [];
        for (let i = 0; i < v.length; i++) {
          const d = Object.getOwnPropertyDescriptor(v, String(i));
          if (!d || !('value' in d)) throw new ContractError('ACCESSOR_OR_HOLE', `${path}[${i}]`);
          out.push(walk(d.value, `${path}[${i}]`, depth + 1));
        }
        return '[' + out.join(',') + ']';
      }
      return '{' + Object.keys(v).sort().map(k => {
        const d = Object.getOwnPropertyDescriptor(v, k);
        if (!d || !('value' in d)) throw new ContractError('ACCESSOR', path + '.' + k);
        return JSON.stringify(k) + ':' + walk(d.value, path + '.' + k, depth + 1);
      }).join(',') + '}';
    } finally { active.delete(v); }
  }
  return walk(value, '$', 0);
}
export async function contentHash(value) {
  if (!globalThis.crypto?.subtle) throw new ContractError('WEB_CRYPTO_UNAVAILABLE');
  const data = new TextEncoder().encode(canonicalJSON(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
  return { algorithm: 'SHA-256', profile: PROFILE, value: [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('') };
}
export function equalHash(a, b) {
  return !!a && !!b && a.algorithm === 'SHA-256' && b.algorithm === 'SHA-256' && a.profile === PROFILE && b.profile === PROFILE && /^[a-f0-9]{64}$/.test(a.value) && a.value === b.value;
}
export function assertUnitsAndFrame(units, frame) {
  if (!units || units.length !== 'm' || units.area !== 'm2' || units.volume !== 'm3') throw new ContractError('UNIT_UNSUPPORTED');
  if (frame !== FRAME) throw new ContractError('FRAME_UNSUPPORTED');
}
export async function geometryHash(candidate) {
  assertUnitsAndFrame(candidate.units, candidate.frame);
  return contentHash({ units: candidate.units, frame: candidate.frame, geometry: candidate.geometry });
}
export async function candidateId(candidate) {
  const hash = await contentHash({ requestId: candidate.requestId, inputHash: candidate.inputHash, geometryHash: candidate.geometryHash, producer: candidate.producer, alternativeKey: candidate.alternativeKey });
  return 'cand:' + hash.value;
}
/** Shape validation is a SEPARATE gate using the JSON Schema. */
export async function verifyCandidateBinding(candidate, request) {
  if (!candidate || !request || candidate.requestId !== request.requestId || candidate.projectId !== request.projectId) throw new ContractError('REQUEST_BINDING_MISMATCH');
  if (candidate.actualShape !== candidate.geometry?.shape || candidate.fallback?.used !== candidate.geometry?.shapeFallback || candidate.fallback?.used !== (candidate.requestedShape !== candidate.actualShape)) throw new ContractError('SHAPE_METADATA_MISMATCH');
  if (!equalHash(candidate.inputHash, await contentHash(request))) throw new ContractError('INPUT_HASH_MISMATCH');
  if (!equalHash(candidate.geometryHash, await geometryHash(candidate))) throw new ContractError('GEOMETRY_HASH_MISMATCH');
  if (candidate.candidateId !== await candidateId(candidate)) throw new ContractError('CANDIDATE_ID_MISMATCH');
  return true;
}
export function summarizeChecks(checks) {
  if (!Array.isArray(checks)) throw new ContractError('CHECKS_NOT_ARRAY');
  const counts = { pass: 0, fail: 0, notEvaluated: 0, estimate: 0, notApplicable: 0 };
  const keys = { PASS: 'pass', FAIL: 'fail', NOT_EVALUATED: 'notEvaluated', ESTIMATE: 'estimate', NOT_APPLICABLE: 'notApplicable' };
  const seen = new Set();
  for (const c of checks) {
    if (!c || typeof c.id !== 'string' || !c.id.trim() || seen.has(c.id) || !Object.hasOwn(keys, c.status)) throw new ContractError('INVALID_CHECK');
    if (!Array.isArray(c.evidenceIds) || c.evidenceIds.some(id => typeof id !== 'string' || !id.trim())) throw new ContractError('INVALID_EVIDENCE_IDS');
    if (typeof c.reason !== 'string' || !c.reason.trim()) throw new ContractError('CHECK_REASON_REQUIRED');
    if ((c.status === 'PASS' || c.status === 'FAIL' || c.status === 'NOT_APPLICABLE') && !c.evidenceIds.length) throw new ContractError('CHECK_EVIDENCE_REQUIRED');
    seen.add(c.id); counts[keys[c.status]]++;
  }
  const total = checks.length, applicable = total - counts.notApplicable;
  return { total, ...counts, evaluatedRatio: applicable > 0 ? (counts.pass + counts.fail) / applicable : null };
}
export function verifyReviewBinding(review, candidate) {
  if (!review || !candidate || review.projectId !== candidate.projectId || review.requestId !== candidate.requestId || review.candidateId !== candidate.candidateId || !equalHash(review.inputHash, candidate.inputHash) || !equalHash(review.geometryHash, candidate.geometryHash)) throw new ContractError('REVIEW_BINDING_MISMATCH');
  if (canonicalJSON(review.coverage) !== canonicalJSON(summarizeChecks(review.checks))) throw new ContractError('COVERAGE_MISMATCH');
  if (review.overall === 'PASS_WITHIN_SCOPE' && (review.coverage.total === 0 || review.coverage.fail || review.coverage.notEvaluated || review.coverage.estimate || review.coverage.evaluatedRatio !== 1)) throw new ContractError('UNSUPPORTED_PASS');
  if (review.preliminaryOnly !== true) throw new ContractError('PRELIMINARY_SCOPE_REQUIRED');
  return true;
}
