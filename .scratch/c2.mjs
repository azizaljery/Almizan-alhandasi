import { generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { elevatorCandidates, DBG } from './ep-dbg.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
for (const [w,l] of [[30,40],[22,35]]) {
const b = buildBrief('فيلا دورين مجلس وثلاث غرف نوم', { land: { width: w, length: l, floors: 2 } });
const r = generateVillaTwoFloors({ land: { width: w, length: l, streets: ['s'], entries: ['s'] }, counts: b.counts, requirements: {...b.requirements, prefs:{...b.requirements.prefs,floors:2}}, keep: 5 });
for (const d of r.designs) { const c = elevatorCandidates(d.doc); console.log(w,l,d.mode,c.length, JSON.stringify(DBG)); }}
