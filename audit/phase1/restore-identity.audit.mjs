// AUDIT probe — Save/Restore identity. Does decodeProject() notice that restored geometry no longer matches the
// geometryHash / candidateId stored inside the model.integration block?
import { defaultRooms, normalizeRooms, validatePlot } from '../../dist/planner.mjs';
import { runMultiEngineDesign } from '../../dist/multi-engine.mjs';
import { encodeProject, decodeProject } from '../../dist/project.mjs';
import { contentHash } from '../../dist/integration/control/reference/identity.mjs';
import { quantities } from '../../dist/claude/compat-layer.mjs';

const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
const rooms = normalizeRooms(defaultRooms());
const out = await runMultiEngineDesign({ plot, rooms, selectedShape: 'rect', idea: '', seed: 1 });
const model = out.selectedModel;
const text = encodeProject({ plot, rooms, palette: 'modern', rates: {}, costReserve: 10, vat: 15, idea: '', discovery: { likes: [], rejects: [], avoids: [], life: {} }, model });
const raw = JSON.parse(text);
console.log('saved integration keys:', Object.keys(raw.design.embedded.integration ?? {}), '| top-level candidateId stored outside model?', 'candidateId' in raw);

// (1) honest round trip
const back = decodeProject(text);
console.log('round-trip integration identical:', JSON.stringify(back.model.integration) === JSON.stringify(model.integration));

// (2) tamper: move a door by 0.1 in the saved JSON (geometry changes, identity block untouched)
const t = structuredClone(raw);
const door = t.design.embedded.openings.find((o) => o.type === 'door' && typeof o.pos === 'number');
const before = door.pos; door.pos = before < 0.5 ? before + 0.1 : before - 0.1;
let accepted = false, stale = null, err = null;
try {
  const r = decodeProject(JSON.stringify(t));
  accepted = true;
  stale = { restoredHash: r.model.integration.geometryHash?.value?.slice(0, 12), candidateId: r.model.integration.candidateId?.slice(0, 14), requiresReview: r.model.integration.requiresReview ?? false, reviewOverall: r.model.integration.reviewOverall };
} catch (e) { err = e.message; }
console.log('tampered door accepted by decodeProject:', accepted, accepted ? JSON.stringify(stale) : err);

// (3) tamper: change a wall height (affects BOQ) the same way
const t2 = structuredClone(raw); t2.design.embedded.walls[0].h += 0.3;
let q1 = quantities(model), accepted2 = false, q2 = null;
try { const r = decodeProject(JSON.stringify(t2)); accepted2 = true; q2 = quantities(r.model); } catch (e) { q2 = e.message; }
console.log('tampered wall height accepted:', accepted2, '| quantities changed:', accepted2 ? JSON.stringify({ wallsBefore: q1.walls ?? q1.wallArea ?? null, wallsAfter: q2.walls ?? q2.wallArea ?? null }) : q2);

// (4) does the saved geometry still hash to the stored geometryHash? (can only be answered for the candidate-level hash;
//     the model is a derived structure, so record whether any recomputation is even possible from the saved file)
console.log('model-level hash recomputable from saved file (geometry keys only):', 'UNKNOWN -> see report');
