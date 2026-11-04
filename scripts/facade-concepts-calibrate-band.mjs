// R4: نطاق عدم اليقين من بيانات التذبذب، لا رقم مخترع. node scripts/facade-concepts-calibrate-band.mjs [--write]
// الفكرة: نقيس كم يتحرك تباعد زوج حقيقي حين تُزاح حدود مناطقه إزاحات هندسية صغيرة (ضجيج تنفيذي)، ونأخذ P95 كنصف عرض النطاق حول 0.35.
import fs from 'node:fs'; import * as L from '../tests/adversarial/lib.mjs'; import { generate } from '../dist/facade-kit/concepts/generate.mjs'; import { compareSignatures } from '../dist/facade-kit/concepts/signature.mjs';
const AMP=0.10, P=0.25, REPS=3, CENTER=0.35, write=process.argv.includes('--write'); const rng=L.mulberry(2026);
const deltas=[], near=[]; let pairs=0;
for(const n of ['C1','C4','C7','RECT','L','U']){ const c=await L.ctx(n); const g=await generate(c.built,c.front,{count:24,seed:4,maxTries:3000}); const cs=g.candidates;
  const base=cs.map(k=>({k,z:L.zonesOf(c.a,k.params)})); const sigOf=(z)=>L.sigOf(c.a,L.compsOf(c.a,c.built,c.front,z)); const s0=base.map(b=>sigOf(b.z));
  for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++){ const n0=compareSignatures(s0[i],s0[j]).novelty; if(n0<.15||n0>.6) continue; pairs++;
    for(let r=0;r<REPS;r++){ const n1=compareSignatures(sigOf(L.jitterSparse(base[i].z,rng,AMP,P)),sigOf(L.jitterSparse(base[j].z,rng,AMP,P))).novelty; deltas.push(Math.abs(n1-n0)); if(Math.abs(n0-CENTER)<=.1) near.push(Math.abs(n1-n0)); } } }
const q=(a,p)=>{ const s=[...a].sort((x,y)=>x-y); return s.length?s[Math.min(s.length-1,Math.floor(p*s.length))]:0; };
const w=+q(near.length>=30?near:deltas,.95).toFixed(3), band={lower:+(CENTER-w).toFixed(3),upper:+(CENTER+w).toFixed(3)};
const info={center:CENTER,jitterAmplitudeM:AMP,sparseP:P,reps:REPS,pairsMeasured:pairs,samples:deltas.length,samplesNearCenter:near.length,halfWidthP95:w,medianAbsDelta:+q(deltas,.5).toFixed(3),p99:+q(deltas,.99).toFixed(3),...band};
console.log(JSON.stringify(info));
if(write){ fs.writeFileSync(new URL('../dist/facade-kit/concepts/calibration.mjs',import.meta.url),`// مولَّد بـ scripts/facade-concepts-calibrate-band.mjs --write من بيانات تذبذب هندسي (إزاحة ≤ ${AMP} م). لا يُضبط لينجح اختبار.\nexport const UNCERTAINTY_BAND={lower:${band.lower},upper:${band.upper},derivedFrom:${JSON.stringify(info)}};\n`); fs.mkdirSync('docs/research/facade-concepts-adversarial',{recursive:true}); fs.writeFileSync('docs/research/facade-concepts-adversarial/band-calibration.json',JSON.stringify(info,null,1)); }
