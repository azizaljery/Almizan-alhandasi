import { generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { analyzeWalls } from '../dist/draw/topology.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';
const r = generateVillaTwoFloors({ land: { width: 20, length: 30, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 4, majlis: 1, baths: 4, kitchens: 1 }, requirements: { floors: 2, prefs: {} }, keep: 1 });
const d = r.designs[0].doc;
for (const L of ['L1','L2']) for (const s of analyzeWalls(d.walls.filter(w=>w.level===L)).spaces.filter(s=>s.net)) { const l=d.labels.find(l=>l.level===L&&pointInPolygon(l.seed,s.net)); if (l && ['living','corridor','entrance'].includes(l.type)) console.log(L,l.type,l.name,JSON.stringify(s.polygon.map(p=>[p.x,p.y]))); }
console.log(JSON.stringify(d.stairs));
for (const f of d.fixtures.filter(f=>f.x>8&&f.x<13.2)) console.log(f.level,f.kind,f.x,f.y,f.w,f.d,f.rot);
console.log(JSON.stringify(d.openings.filter(o=>true).map(o=>{const w=d.walls.find(x=>x.id===o.wall);return [o.level,o.kind,o.at,o.w,w.a,w.b]}).filter(a=>a[4].x>=8&&a[4].x<=13.2||a[5].x>=8&&a[5].x<=13.2)));
