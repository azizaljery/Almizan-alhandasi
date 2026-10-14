// AUDIT probe — is geometryHash RECOMPUTABLE from a saved/restored model? (feasibility of a restore-time check)
import schema from '../../dist/integration/control/contracts/mizan-envelope-v1.schema.mjs';
import { defaultRooms, normalizeRooms, validatePlot } from '../../dist/planner.mjs';
import { runMultiEngineDesign } from '../../dist/multi-engine.mjs';
import { encodeProject, decodeProject } from '../../dist/project.mjs';
import { contentHash, UNITS, FRAME } from '../../dist/integration/control/reference/identity.mjs';
const KEYS = [...Object.keys(schema.$defs.geometry.properties), 'footprint', 'program'];
const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
const rooms = normalizeRooms(defaultRooms());
const out = await runMultiEngineDesign({ plot, rooms, selectedShape: 'rect', idea: '', seed: 1 });
const text = encodeProject({ plot, rooms, palette: 'modern', rates: {}, costReserve: 10, vat: 15, idea: '', discovery: { likes: [], rejects: [], avoids: [], life: {} }, model: out.selectedModel });
const restored = decodeProject(text).model;
const recompute = async (m) => (await contentHash({ units: UNITS, frame: FRAME, geometry: Object.fromEntries(KEYS.filter((k) => m[k] !== undefined).map((k) => [k, m[k]])) })).value;
const stored = restored.integration.geometryHash.value;
const fresh = await recompute(restored);
console.log('recompute(restored) === stored geometryHash :', fresh === stored);
const t = JSON.parse(text); const d = t.design.embedded.openings.find((o) => o.type === 'door' && typeof o.pos === 'number'); d.pos += 0.1;
const tam = decodeProject(JSON.stringify(t)).model;
console.log('recompute(tampered)  === stored geometryHash :', (await recompute(tam)) === stored, '(false = a restore-time check WOULD detect the tamper)');
