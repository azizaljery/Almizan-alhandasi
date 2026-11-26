// Same inputs, deterministic generators, independent door/polygon checks. All refusals are reported.
import { mkdir, writeFile } from 'node:fs/promises';
import { generateVillaDesigns, generateVillaTwoFloors, clearVillaPools } from '../dist/villa-layout.mjs';
import { evaluateSaudiQuality } from '../dist/architect/saudi-quality.mjs';
const directory = process.argv[2] || '/tmp/architect-evidence'; await mkdir(directory,{recursive:true});
const cases = [
  {id:'standard-south',width:20,length:30,streets:['s'],entries:['s'],floors:1},
  {id:'wide-south',width:25,length:30,streets:['s'],entries:['s'],floors:1},
  {id:'east-front',width:30,length:20,streets:['e'],entries:['e'],floors:1},
  {id:'corner',width:24,length:30,streets:['s','e'],entries:['s','e'],floors:1},
  {id:'two-floors',width:20,length:30,streets:['s'],entries:['s'],floors:2},
  {id:'narrow',width:12,length:30,streets:['s'],entries:['s'],floors:1},
];
const counts={bedrooms:3,majlis:2,halls:1,kitchens:1,baths:4,dining:1};
const results=[];
for(const land of cases){
  clearVillaPools();const generate=land.floors===2?generateVillaTwoFloors:generateVillaDesigns;const t=Date.now();let before=null;
  try{const baseline=generate({land,counts,keep:3});before=evaluateSaudiQuality(baseline.designs[0].doc,{});if(land.id==='standard-south')await writeFile(directory+'/baseline-doc.json',JSON.stringify(baseline.designs[0].doc));}catch(e){before={error:e.code,message:e.message};}
  try{const after=generate({land,counts,keep:3,requirements:{architect:{enabled:true,enforce:true}}});const row={id:land.id,before,after:after.designs[0].architectQuality,checked:after.architectSearch.checked,returned:after.designs.length,changes:after.designs.reduce((s,d)=>s+(d.architectChanges?.length||0),0),ms:Date.now()-t};results.push(row);console.log(JSON.stringify({id:row.id,before:before.failed,after:row.after.failed,returned:row.returned,checked:row.checked,ms:row.ms}));
    if(land.id==='standard-south')await writeFile(directory+'/selected-doc.json',JSON.stringify(after.designs[0].doc));
  }catch(e){const row={id:land.id,before,after:{status:'refused',code:e.code,message:e.message},checked:e.architectQuality?.checked||0,rejected:e.architectQuality?.rejected?.map(r=>({mode:r.mode,failed:r.report.failed})),ms:Date.now()-t};results.push(row);console.log(JSON.stringify({id:row.id,before:before.failed,after:row.after.status,code:e.code,ms:row.ms}));}
}
const report={baseline:'4eb43b92e70835c65c76464185cbd53c74995852',counts,cases,scope:'Six synthetic plots, fixed three-bedroom/two-majlis program; not a general success rate or a photorealism benchmark.',results};
await writeFile(directory+'/benchmark.json',JSON.stringify(report,null,2));
