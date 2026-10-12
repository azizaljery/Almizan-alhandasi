// Reproducible local topology probe. These are synthetic fixtures, not a client project.
import { mkdir, writeFile } from 'node:fs/promises';
import { generateModel, validateModel, normalizeRooms } from '../dist/claude/planner.mjs';
import { defaultRooms, validatePlot } from '../dist/planner.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { spatialRelationDescriptor, spatialRelationDistance } from '../dist/spatial-relations.mjs';

const out=process.env.MIZAN_EVIDENCE||'/workspace/v3-engineering-evidence/topology';
await mkdir(out,{recursive:true});
const plot=validatePlot({width:35,length:45,floors:1,entry:'s',streets:{s:true},coverage:.75,streetSetback:3,neighborSetback:1.5});
const fixtures=[
 {id:'default-12',rooms:defaultRooms()},
 {id:'reduced-9',rooms:defaultRooms({bedrooms:3,majlis:1,baths:2,kitchens:1})},
];
function corridorUnion(corridors){
 const xs=[...new Set(corridors.flatMap(c=>[c.x,c.x+c.w]))].sort((a,b)=>a-b);let area=0,longest=0;
 for(let i=0;i<xs.length-1;i++){
  const left=xs[i],right=xs[i+1];if(right-left<1e-9)continue;const x=(left+right)/2;
  const intervals=corridors.filter(c=>c.x<=x&&c.x+c.w>=x).map(c=>[c.y,c.y+c.h]).sort((a,b)=>a[0]-b[0]);
  let total=0,start=null,end=null;
  for(const [a,b]of intervals){if(start===null){start=a;end=b;}else if(a<=end+1e-8)end=Math.max(end,b);else{total+=end-start;longest=Math.max(longest,end-start);start=a;end=b;}}
  if(start!==null){total+=end-start;longest=Math.max(longest,end-start);}area+=(right-left)*total;
 }
 return {unionAreaM2:Number(area.toFixed(4)),longestContinuousVerticalSpanM:Number(longest.toFixed(4))};
}
const report={createdAt:new Date().toISOString(),fixtureNote:'Synthetic plans only. No mother-villa request, live provider call, or customer acceptance.',predeclaredAcceptance:{validGeometry:true,atLeastTwoEligiblePhysicalTopologyGraphsPerProgram:true,atLeastOneLongestContinuousVerticalCorridorUnionBelow:.75,boundedClusterVariantsPerProgram:3},fixtures:[]};
for(const fixture of fixtures){
 const rooms=normalizeRooms(fixture.rooms),direct=[];
 for(const topology of ['spine','clustered'])for(const variant of topology==='spine'?[0]:[0,1,2]){
  try{const model=generateModel(plot,rooms,{search:{topology,variant}}),errors=validateModel(model),spatial=spatialRelationDescriptor(model);direct.push({topology,variant,model,errors,spatial});}
  catch(error){direct.push({topology,variant,error:error.message});}
 }
 const integration=await runMultiEngineDesign({plot,rooms,selectedShape:'rect',seed:1});
 const candidates=direct.filter(x=>x.model).map(x=>({topology:x.topology,variant:x.variant,valid:x.errors.length===0,spatialValid:x.spatial.valid,corridors:x.model.corridors.length,...corridorUnion(x.model.corridors),depthM:x.model.building.h,continuousRatio:Number((corridorUnion(x.model.corridors).longestContinuousVerticalSpanM/x.model.building.h).toFixed(4)),graphFingerprint:x.spatial.fingerprint}));
 const clustered=candidates.filter(x=>x.topology==='clustered'&&x.valid&&x.spatialValid);
 report.fixtures.push({id:fixture.id,roomCount:rooms.length,directCandidates:candidates,clusteredPairwiseSpatialDistance:clustered.map((a,i)=>clustered.slice(i+1).map(b=>({a:a.variant,b:b.variant,distance:spatialRelationDistance(direct.find(x=>x.topology==='clustered'&&x.variant===a.variant).spatial,direct.find(x=>x.topology==='clustered'&&x.variant===b.variant).spatial)}))).flat(),selectedAlternativeKeys:integration.models.map(m=>m.integration?.alternativeKey),searchEvidence:integration.searchEvidence});
}
report.status='PARTIAL';report.reason='The validated clustered geometry removes the long vertical spine in these two fixtures. This run does not establish two eligible non-equivalent clustered corridor graphs for both programs; do not interpret a bounded probe as proof of impossibility.';
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
