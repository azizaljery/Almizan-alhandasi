import { generateVillaTwoFloors as generateVillaDesigns } from '../dist/villa-layout.mjs';
import { analyzeWalls } from '../dist/draw/topology.mjs';
import { pointInPolygon, bounds } from '../dist/draw/geom.mjs';
const r = generateVillaDesigns({ land: { width: 20, length: 30, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 4, majlis: 1, baths: 4, kitchens: 1 }, requirements: { floors: 2, prefs: {} }, keep: 2 });
console.log(r.floors, r.designs.length);
const d = r.designs[0].doc;
for (const lv of d.levels) {
  console.log('LEVEL', lv.id, lv.name);
  const sp = analyzeWalls(d.walls.filter(w => w.level === lv.id)).spaces.filter(s => s.net);
  for (const s of sp) { const l = d.labels.find(l => l.level === lv.id && pointInPolygon(l.seed, s.net)); const b = bounds(s.net); console.log(' ', l?.type, l?.name, b.x0?.toFixed?.(1) ?? JSON.stringify(b)); }
  console.log(' stairs', JSON.stringify(d.stairs.filter(s => s.level === lv.id)));
}
const sp0 = analyzeWalls(d.walls.filter(w => w.level === 'L1')).spaces[0];
console.log(Object.keys(sp0), JSON.stringify(sp0.poly||sp0.centerline||'').slice(0,200), JSON.stringify(sp0.net).slice(0,200));
console.log(JSON.stringify(d.openings.filter(o=>o.level==='L1').slice(0,2)));
