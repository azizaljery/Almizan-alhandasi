import { generateVillaTwoFloors, checkDoc } from '../dist/villa-layout.mjs';
import { planElevator } from '../dist/elevator-plan.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
const [w,l]=[22,35];
const b = buildBrief('فيلا دورين مجلس وثلاث غرف نوم', { land: { width: w, length: l, floors: 2 } });
const r = generateVillaTwoFloors({ land: { width: w, length: l, streets: ['s'], entries: ['s'] }, counts: b.counts, requirements: {...b.requirements, prefs:{...b.requirements.prefs,floors:2}}, keep: 5 });
const d = r.designs[0].doc; const key = i => i.code+':'+i.targetIds.join('+'); const base = reviewDoc(d).map(key);
planElevator(d, { verify: doc => { const c = checkDoc(doc); console.log('ok', c.ok, c.problems.slice(0,2)); console.log(reviewDoc(doc).filter(i=>!base.includes(key(i))).map(i=>i.code+' '+i.message.slice(0,100))); return false; } });
