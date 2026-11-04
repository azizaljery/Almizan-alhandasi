// R6: مصفوفة السببية. لكل مبنى: أساس أدنى، ثم تغيير سبب واحد (خيار واحد في محور واحد) ورصد الأبعاد التي تتحرك.
import fs from 'node:fs'; import * as L from './lib.mjs';
const PMIN={entrance:'plain',grouping:'rings',emphasis:'none',zoning:'monolithic',roof:'none',corner:'none',palette:'P1',seed:{base:.9,side:0}};
const DIMS=['entrance','rhythm','emphasis','zoning','blocks','roof','corners'];
const rows=[]; const co={}; DIMS.forEach(a=>{co[a]={};DIMS.forEach(b=>co[a][b]=0);}); const moved={}; DIMS.forEach(d=>moved[d]=0);
for(const n of ['C1','C4','C7','RECT','L','U']){ const c=await L.ctx(n); const mk=p=>L.sigOf(c.a,L.realize(c.a,c.built,c.front,p)); const base=mk(PMIN);
  for(const ax of Object.keys(L.AXES)) for(const opt of L.AXES[ax]){ if(opt===PMIN[ax]) continue; const s=mk({...PMIN,[ax]:opt}); const j=L.judge(base,s);
    const diff=DIMS.filter(d=>j.dims[d]>=.45), mv=DIMS.filter(d=>j.dims[d]>=.2); rows.push({n,cause:ax+':'+opt,dims:j.dims,different:diff,moved:mv,novelty:j.novelty,accepted:j.accepted});
    for(const a of mv){ moved[a]++; for(const b of mv) co[a][b]++; } } }
// معامل الارتباط المشروط: P(b يتحرك | a يتحرك)
const cond={}; DIMS.forEach(a=>{cond[a]={}; DIMS.forEach(b=>cond[a][b]=moved[a]?+(co[a][b]/moved[a]).toFixed(2):0);});
const out={rows,cond,moved,multiDimSingleCause:rows.filter(r=>r.different.length>=4).length,total:rows.length};
fs.writeFileSync(process.argv[2]||'/tmp/claude-0/causal.json',JSON.stringify(out,null,1));
console.log('single-cause rows',rows.length,'with ≥4 different dims',out.multiDimSingleCause,'accepted',rows.filter(r=>r.accepted).length);
console.log('cond P(col|row):'); console.log('        '+DIMS.map(d=>d.slice(0,6).padStart(7)).join('')); for(const a of DIMS) console.log(a.padEnd(8)+DIMS.map(b=>String(cond[a][b]).padStart(7)).join(''));
const byAx={}; for(const r of rows){ const ax=r.cause.split(':')[0]; byAx[ax]=byAx[ax]||{}; for(const d of r.different) byAx[ax][d]=(byAx[ax][d]||0)+1; } console.log(JSON.stringify(byAx));
