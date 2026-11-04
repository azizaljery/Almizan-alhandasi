// تحليل هندسة الواجهة الفعلية (من الطبقات المبنية) — لا يعتمد على أي مادة أو لون.
import { layerMask, bounds } from '../src/polygons.mjs';
const r3=v=>Math.round(v*1000)/1000;
export function analyzeFacade(built, side) {
  const B=built[side], walls=B.layers.filter(l=>l.role==='wall');
  const pieces=walls.map(w=>{
    const bb=bounds(layerMask(w)), pc=(B.F?.pieces||[]).find(p=>p.i===w.piece), all=pc?.openings||[];
    const ops=all.map(o=>({id:o.id,kind:o.kind,entry:!!o.entry&&!/^window/.test(o.kind),window:/^window/.test(o.kind),u0:o.u0,u1:o.u1,z0:o.z0,z1:o.z1,cu:(o.u0+o.u1)/2,w:o.u1-o.u0,h:o.z1-o.z0})).sort((a,b)=>a.u0-b.u0);
    const windows=ops.filter(o=>o.window), entries=ops.filter(o=>o.entry), others=ops.filter(o=>!o.window&&!o.entry);
    // فجوات أعمدة بلا أي فتحة (u) وفترات ارتفاع خالية من الفتحات (z)
    const gapsU=[]; let cur=bb.u0; for(const o of ops){ if(o.u0-cur>=.5) gapsU.push([cur,o.u0]); cur=Math.max(cur,o.u1); } if(bb.u1-cur>=.5) gapsU.push([cur,bb.u1]);
    const zs=ops.map(o=>[o.z0,o.z1]).sort((a,b)=>a[0]-b[0]), freeZ=[]; let z=bb.z0; for(const [a,b] of zs){ if(a-z>=.12) freeZ.push([z,a]); z=Math.max(z,b); } if(bb.z1-z>=.12) freeZ.push([z,bb.z1]);
    return {piece:w.piece, wallId:w.id, C:w.C, bb:{u0:r3(bb.u0),u1:r3(bb.u1),z0:r3(bb.z0),z1:r3(bb.z1)}, span:r3(bb.u1-bb.u0), height:r3(bb.z1-bb.z0), ops, windows, entries, others, gapsU, freeZ,
      minSill:windows.length?Math.min(...windows.map(o=>o.z0)):null, maxHead:windows.length?Math.max(...windows.map(o=>o.z1)):null};
  }).sort((a,b)=>a.piece-b.piece);
  const u0=Math.min(...pieces.map(p=>p.bb.u0)), u1=Math.max(...pieces.map(p=>p.bb.u1)), zTop=Math.max(...pieces.map(p=>p.bb.z1));
  const area=pieces.reduce((s,p)=>s+p.span*p.height,0), openArea=pieces.reduce((s,p)=>s+p.ops.reduce((q,o)=>q+o.w*o.h,0),0);
  return {side, pieces, frame:{u0,u1,zTop}, wallArea:r3(area), openingArea:r3(openArea), voidRatio:r3(openArea/area), openingCount:pieces.reduce((s,p)=>s+p.ops.length,0), windowCount:pieces.reduce((s,p)=>s+p.windows.length,0), entryCount:pieces.reduce((s,p)=>s+p.entries.length,0)};
}
