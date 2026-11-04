// Novelty Explanation: لكل زوج مقبول/مرفوض. node tests/adversarial/explain.mjs <outDir>
import fs from 'node:fs'; import * as L from './lib.mjs';
import { generate, gateAndSelect, conceptLabel } from '../../dist/facade-kit/concepts/generate.mjs';
import { compareSignatures, DIMENSIONS, levelOf, LEVEL_AR, verdict } from '../../dist/facade-kit/concepts/signature.mjs';
const out=process.argv[2]||'docs/research/facade-concepts-adversarial';
const AX={entrance:'استراتيجية المدخل',rhythm:'إيقاع الفتحات',emphasis:'التأكيد الرأسي',zoning:'تقسيم المواد',roof:'خط السقف',corners:'معالجة الزوايا',blocks:'تنظيم الكتل'};
const ord=['entrance','rhythm','emphasis','zoning','roof','corners','blocks'];
function explain(a,b,A,B){ const c=compareSignatures(A.sig,B.sig), v=verdict(c); const dims=ord.map(k=>{const d=c.dims.find(x=>x.key===k); return {key:k,label:AX[k],distance:+d.distance.toFixed(3),level:levelOf(d.distance)};});
  const diffs=dims.filter(d=>d.level==='different').map(d=>d.label), valueOnly=c.edgeZone<.35&&dims.filter(d=>d.level==='different').length<4;
  const reason=v.accepted?null:(c.edgeZone<.2?'الحواف شبه متطابقة: الفرق في المادة/القيمة وليس في البنية.':c.differentDims<4?`أبعاد مختلفة ${c.differentDims} فقط من 7 (${diffs.join('، ')||'—'}).`:c.novelty<.35?'التباعد الكلي دون العتبة التجريبية.':'الحواف دون الحد.');
  return {a,b,labelA:A.params?conceptLabel(A.params):'',labelB:B.params?conceptLabel(B.params):'',dims,signatureDistance:+c.novelty.toFixed(3),edgeDistance:+c.edgeZone.toFixed(3),differentDims:c.differentDims,fidelity:(A.assess?.fidelity.pass&&B.assess?.fidelity.pass)?'PASS':'PASS (مُتحقَّق في التوليد)',plausibility:(A.assess?.plausibility.pass&&B.assess?.plausibility.pass)?'PASS':'—',verdict:v.accepted?'GENUINELY DISTINCT':'NEAR-DUPLICATE',reason}; }
const res={selected:[],rejected:[],coverage:{}};
for(const n of ['C1','C4','C7']){ const c=await L.ctx(n); const g=await generate(c.built,c.front,{count:12,seed:1,maxTries:600}); const s=gateAndSelect(g.candidates); if(!s.selected){ res.selected.push({building:n,note:'INSUFFICIENT DESIGN-SPACE COVERAGE',candidates:g.candidates.length}); continue; }
  const T=s.selected.ids.map(i=>g.candidates.find(x=>x.id===i)); const leads=T.map(t=>L.leadAxis(c.a,t.sig).lead); res.coverage[n]={leads,distinct:new Set(leads).size};
  for(let i=0;i<3;i++)for(let k=i+1;k<3;k++){ const e=explain(T[i].id,T[k].id,T[i],T[k]); e.building=n; e.coverageContribution=`${leads[i]} ↔ ${leads[k]}`; res.selected.push(e); }
  const rej=[...Object.entries(s.dupOf)].slice(0,3); for(const [id,of] of rej){ const A=g.candidates.find(x=>x.id===id),B=g.candidates.find(x=>x.id===of); const e=explain(id,of,A,B); e.building=n; res.rejected.push(e); } }
fs.writeFileSync(out+'/novelty-explanations.json',JSON.stringify(res,null,1));
const ar=(e)=>[`**${e.building}: ${e.a} ↔ ${e.b}** — ${e.verdict}`,'','| البُعد | الحكم | المسافة |','|---|---|---|',...e.dims.map(d=>`| ${d.label} | ${d.level==='different'?'مختلف':d.level==='same'?'متشابه':'متوسط'} | ${d.distance} |`),'',`مسافة التوقيع ${e.signatureDistance} · مسافة الحواف ${e.edgeDistance} · أبعاد مختلفة ${e.differentDims}/7 · مساهمة التغطية: ${e.coverageContribution||'—'} · Fidelity ${e.fidelity} · Plausibility ${e.plausibility}`,e.reason?`\nالسبب: ${e.reason}`:'',''].join('\n');
fs.writeFileSync(out+'/novelty-explanations.md','# Novelty Explanation\n\n## أزواج مقبولة (الثلاثيات المختارة)\n\n'+res.selected.map(e=>e.dims?ar(e):`**${e.building}**: ${e.note}`).join('\n')+'\n## أزواج مرفوضة (NEAR-DUPLICATE)\n\n'+res.rejected.map(ar).join('\n'));
console.log(JSON.stringify(res.coverage),res.selected.length,res.rejected.length);
