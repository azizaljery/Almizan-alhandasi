import { generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { elevatorCandidates } from './ep-dbg.mjs';
const r = generateVillaTwoFloors({ land: { width: 20, length: 30, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 4, majlis: 1, baths: 4, kitchens: 1 }, requirements: { floors: 2, prefs: {} }, keep: 1 });
const d = r.designs[0].doc;
const c = elevatorCandidates(d);
console.log(JSON.stringify(c.map(x=>({box:x.box,door:x.door.n,tucked:x.tucked,rm:x.remove.length,score:x.score}))));
import {DBG} from './ep-dbg.mjs'; console.log(JSON.stringify(DBG));
