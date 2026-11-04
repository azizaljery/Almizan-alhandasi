// Phase 1.3: تحقق R6 (سبب واحد) + R7/R8 (العائلات والاستنفاد) + بيانات Surface Dependency (بلا معادلة حكم ولا عتبة).
import fs from 'node:fs'; import * as L from './lib.mjs';
import { generate, gateAndSelect, exploreDesignSpace } from '../../dist/facade-kit/concepts/generate.mjs';
import { compareSignatures, verdict } from '../../dist/facade-kit/concepts/signature.mjs';
import { independentCauses } from '../../dist/facade-kit/concepts/causal.mjs';
import { classifyFamily } from '../../dist/facade-kit/concepts/families.mjs';
const out={r6:{},buildings:{},surface:[]}; const PMIN={entrance:'plain',grouping:'rings',emphasis:'none',zoning:'monolithic',roof:'none',corner:'none',palette:'P1',seed:{base:.9,side:0}};
const B=['C1','C4','C7','RECT','L','U']; let sc=0,scOld=0,scRows=[];
for(const n of B){ const c=await L.ctx(n); const mk=p=>L.sigOf(c.a,L.realize(c.a,c.built,c.front,p)); const base=mk(PMIN);
  for(const ax of Object.keys(L.AXES)) for(const opt of L.AXES[ax]){ if(opt===PMIN[ax]) continue; const s=mk({...PMIN,[ax]:opt}); const cmp=compareSignatures(base,s), v=verdict(cmp); if(!v.accepted) continue; scOld++; const k=independentCauses(c.a,base,s,cmp); if(k.ok){ sc++; } scRows.push({n,cause:ax+':'+opt,differentDims:cmp.differentDims,novelty:cmp.novelty,independentCauses:k.count,regions:k.regions,stillAccepted:k.ok}); } }
out.r6={singleCauseAcceptedBefore:scOld,singleCauseAcceptedAfter:sc,rows:scRows};
const merged=sig=>{ const g=sig._grid.map(v=>v>=2&&v!==255?3:v); return {...sig,_grid:g}; };
for(const n of B){ const c=await L.ctx(n); const row={};
  for(const count of [12,36]){ const g=await generate(c.built,c.front,{count}); const s=gateAndSelect(g.candidates); const o=s.offered; const picks=o?o.ids.map(i=>g.candidates.find(k=>k.id===i)):[];
    row['pool'+count]={status:s.status,offered:o?.ids||[],families:o?.families||[],familiesFound:s.stats.familiesFound,singleCauseBlocked:s.stats.singleCausePairsBlocked,uncertain:s.stats.uncertainPairs,recommendation:s.recommendation};
    for(let i=0;i<picks.length;i++)for(let j=i+1;j<picks.length;j++){ const A=picks[i],Bq=picks[j], nN=compareSignatures(A.sig,Bq.sig).novelty, eN=compareSignatures(A.sig,Bq.sig).edgeZone; const gA=L.gridDiff(merged(A.sig),merged(Bq.sig)).cellsDiffer, gN=L.gridDiff(A.sig,Bq.sig).cellsDiffer;
      out.surface.push({n,pool:count,a:A.id,b:Bq.id,noveltyNormal:nN,edgeZone:eN,cellsDifferNormal:gN,cellsDifferToneMerged:gA,toneOnlyShare:gN?+(1-gA/gN).toFixed(3):0,uniformGreyDifference:0}); } }
  out.buildings[n]=row; }
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1)); console.log(JSON.stringify(out.r6).slice(0,90)); for(const [n,r] of Object.entries(out.buildings)) console.log(n,JSON.stringify(r.pool12).slice(0,230),'|36',JSON.stringify(r.pool36.families),r.pool36.status);
const ts=out.surface.map(x=>x.toneOnlyShare); console.log('toneOnlyShare median',ts.sort((a,b)=>a-b)[ts.length>>1],'max',Math.max(...ts));
