import { deterministicFingerprint } from '../../shared/deterministic-hash.js';

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const sortedKeys = Object.keys(value).sort();
  const result = {};
  for (const key of sortedKeys) {
    result[key] = canonicalize(value[key]);
  }
  return result;
}

export function computeGeometryHash(geometry) {
  if (!geometry || typeof geometry !== 'object') {
    throw new Error('Invalid geometry: must be a non-null object');
  }
  const canonicalObj = canonicalize(geometry);
  const serialized = JSON.stringify(canonicalObj);
  return deterministicFingerprint(serialized);
}

export function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}
