import { documentHash } from './delivery-ui.mjs';
export const SNAPSHOT_KEY = 'mizan.studio.snap3d.bound.v1';
export async function saveBoundSnapshot(storage, doc, image, meta = {}) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image || '') || image.length > 6000000) return false;
  storage.setItem(SNAPSHOT_KEY, JSON.stringify({ documentHash: await documentHash(doc), image, view: meta.view === 'facade' ? 'facade' : 'model', width: meta.width || null, height: meta.height || null, at: new Date().toISOString() }));
  return true;
}
export async function loadBoundSnapshot(storage, doc) {
  try { const s = JSON.parse(storage.getItem(SNAPSHOT_KEY) || 'null'); return s?.documentHash === await documentHash(doc) && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s.image || '') ? s : null; } catch { return null; }
}
