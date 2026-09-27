import { canonicalJSON } from '../../../reference/identity.mjs';

// This module is imported transitively by the browser bundle (app.mjs -> multi-engine.mjs ->
// integration/pipeline.mjs -> mizan-ir-v1.adapter.js -> deepFreeze), where only `deepFreeze` is
// used. A static `import crypto from 'node:crypto'` fails to resolve in the browser and aborts
// the entire ES module graph before any click handlers are bound. Load node:crypto lazily and
// only inside Node, so `computeGeometryHash` keeps its exact Node-side SHA-256 behavior while the
// browser bundle no longer depends on a Node-only builtin it never calls.
const nodeCrypto = (typeof process !== 'undefined' && process.versions?.node)
  ? await import('node:crypto')
  : null;

export function computeGeometryHash(geometry) {
  if (!geometry || typeof geometry !== 'object') {
    throw new Error('Invalid geometry: must be a non-null object');
  }
  if (!nodeCrypto) {
    throw new Error('computeGeometryHash requires a Node.js runtime with the node:crypto module.');
  }
  const serialized = canonicalJSON(geometry);
  return nodeCrypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
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
