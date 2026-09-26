import crypto from 'node:crypto';
import { canonicalJSON } from '../../../reference/identity.mjs';

export function computeGeometryHash(geometry) {
  if (!geometry || typeof geometry !== 'object') {
    throw new Error('Invalid geometry: must be a non-null object');
  }
  const serialized = canonicalJSON(geometry);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
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
