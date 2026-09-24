// Browser-safe deterministic fingerprints for traceability only.
// This is deliberately not a cryptographic hash and must not be used for security.
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

function fnv1a(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function deterministicFingerprint(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(canonicalize(value));
  return [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map(seed => fnv1a(text, seed).toString(16).padStart(8, '0'))
    .join('');
}

export const DETERMINISTIC_FINGERPRINT_ALGORITHM = 'FNV1A_MULTI_SEED_NON_CRYPTOGRAPHIC';
