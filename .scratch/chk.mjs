import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
const txt='فيلا دورين مجلس وثلاث غرف نوم ومصعد'; const b=buildBrief(txt,{land:{width:20,length:30,floors:2}});
const out=await generateInitialDesign({land:{width:20,length:30,streets:['s'],entries:['s'],floors:2},rooms:[],idea:txt,counts:b.counts,requirements:b.requirements});
const d=out.doc; const el=d.labels.filter(l=>l.type==='elevator');
for (const L of d.levels) { const c=el.find(l=>l.level===L.id).seed; const near=d.walls.filter(w=>w.level===L.id && w.t===0.2 && [w.a,w.b].every(p=>Math.abs(p.x-c.x)<1.2&&Math.abs(p.y-c.y)<1.2)); console.log(L.id, near.map(w=>`${w.id}:(${w.a.x},${w.a.y})->(${w.b.x},${w.b.y})`).join(' ')); console.log(d.openings.filter(o=>near.some(w=>w.id===o.wall)).map(o=>o.kind+'@'+o.wall+' at '+o.at+' w'+o.w).join(';'), d.fixtures.filter(f=>f.kind==='elevator-car'&&f.level===L.id).map(f=>JSON.stringify(f)).join('')); }
