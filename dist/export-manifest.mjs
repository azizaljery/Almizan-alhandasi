// EX-01 — Export Provenance Manifest (DEC-003). Traceability ONLY: it describes an export, it never changes it.
// The exported bytes are untouched; the manifest is a separate small JSON that names the exact bytes (SHA-256),
// the candidate/geometry identity they came from (re-verified at export time) and the app build that produced them.

export const MANIFEST_SCHEMA = 'mizan-export-manifest/1';
const HEX = /^[a-f0-9]{64}$/;

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('WEB_CRYPTO_UNAVAILABLE');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function toBytes(payload) {
  if (typeof payload === 'string') return new TextEncoder().encode(payload);
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (typeof Blob !== 'undefined' && payload instanceof Blob) return new Uint8Array(await payload.arrayBuffer());
  throw new Error('EXPORT_PAYLOAD_UNSUPPORTED');
}

/** What the model claims about its own identity, checked against a fresh recomputation of its geometry. */
export async function identityOf(model) {
  const i = model?.integration;
  if (!i) return { identityStatus: 'NONE', candidateId: null, geometryHash: null, geometryHashRecomputed: null, geometryMatches: null, reviewId: null, reviewOverall: null, requiresReview: null, previousCandidateId: null, geometryRevision: model?.geometryRevision ?? null, engineVersion: model?.engineVersion ?? null };
  const stored = typeof i.geometryHash?.value === 'string' && HEX.test(i.geometryHash.value) ? i.geometryHash.value : null;
  let recomputed = null;
  try { recomputed = (await import('./project.mjs')).recomputeGeometryHash(model); } catch { recomputed = null; } // lazy: the drawing studio never loads the planner
  const bound = !!(i.candidateId && stored);
  const identityStatus = bound ? (recomputed && recomputed === stored ? 'VERIFIED' : 'MISMATCH') : 'INVALIDATED';
  return { identityStatus, candidateId: i.candidateId ?? null, geometryHash: stored, geometryHashRecomputed: recomputed, geometryMatches: stored && recomputed ? stored === recomputed : null,
    reviewId: i.reviewId ?? null, reviewOverall: i.reviewOverall ?? null, requiresReview: i.requiresReview === true, previousCandidateId: i.previousCandidateId ?? null,
    geometryRevision: model.geometryRevision ?? null, engineVersion: model.engineVersion ?? null };
}

/** `source` is a model (legacy/candidate world) or { studioDocument: <serialized text> } (the drawing studio has no candidate identity yet — AR-01). */
export async function buildExportManifest({ kind, fileName, mime = null, payload, model = null, studioDocument = null, app = null, now = new Date() }) {
  if (typeof kind !== 'string' || !kind || typeof fileName !== 'string' || !fileName) throw new Error('EXPORT_MANIFEST_ARGS');
  const bytes = await toBytes(payload);
  const source = studioDocument !== null
    ? { ...await identityOf(null), sourceKind: 'studio-document', identityStatus: 'NONE', documentSha256: await sha256Hex(await toBytes(studioDocument)) }
    : { ...await identityOf(model), sourceKind: 'design-model' };
  return {
    schema: MANIFEST_SCHEMA,
    createdAt: now instanceof Date ? now.toISOString() : String(now),
    export: { kind, fileName, mime, bytes: bytes.length, sha256: await sha256Hex(bytes) },
    source,
    app: { commit: app?.commit ?? null, builtAt: app?.builtAt ?? null },
  };
}
export const manifestFileName = fileName => fileName.replace(/\.[^./\\]+$/, '') + '.manifest.json';
export const serializeManifest = manifest => JSON.stringify(manifest, null, 2) + '\n';

let cachedApp;
/** Deployed build identity from /version.json (written by scripts/build.mjs). Never throws; unavailable ⇒ nulls. */
export async function loadAppVersion(fetchImpl = globalThis.fetch) {
  if (cachedApp) return cachedApp;
  try {
    const r = await fetchImpl('/version.json', { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    cachedApp = { commit: typeof j?.commit === 'string' ? j.commit : null, builtAt: typeof j?.builtAt === 'string' ? j.builtAt : null };
  } catch { cachedApp = { commit: null, builtAt: null }; }
  return cachedApp;
}

/** Browser helper: build and download the manifest next to an export that was just downloaded. Never blocks or fails the export. */
export async function downloadManifest(args, save) {
  try {
    const manifest = await buildExportManifest({ ...args, app: args.app ?? await loadAppVersion() });
    save(new Blob([serializeManifest(manifest)], { type: 'application/json' }), manifestFileName(args.fileName));
    return manifest;
  } catch { return null; }
}
