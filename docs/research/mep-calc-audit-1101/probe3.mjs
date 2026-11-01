import { readFileSync } from 'node:fs';
const R='/home/claude/wt-calcaudit/';
const B = await import(R+'dist/mep-binding.mjs');
const doc = JSON.parse(readFileSync(R+'tests/fixtures/mep/C6-v3.json','utf8')).alternatives[0].doc;
const sec = t => console.log('\n=== '+t+' ===');
const route=(h,w,hh,c=.03)=>({routeHeightM:h,widthM:w,heightM:hh,clearanceM:c});
const run = async (inputs,id='AUDIT') => { const b=await B.bindArchitecture(doc,{alternativeId:id,revision:'audit',inputs}); if(!b.ok) throw Error(JSON.stringify(b.error)); const r=await B.computeSystems(b.project); return {b,r}; };
const rooms = (await run(B.emptyInputs())).b.project.architecture.rooms; const room=id=>rooms.find(r=>r.id===id);
const G = await import(R+'dist/engineering-systems/src/geometry.mjs');
const cands=(id)=>{const rr=room(id),xs=rr.polygon.map(p=>p.x),ys=rr.polygon.map(p=>p.y),out=[];for(let x=Math.min(...xs)+.3;x<Math.max(...xs);x+=.3)for(let y=Math.min(...ys)+.3;y<Math.max(...ys);y+=.3)if(G.inRoom({x,y},rr)&&rr.polygon.every(p=>true))out.push({x:+x.toFixed(3),y:+y.toFixed(3)});return out;};
const at=(id,z,k=0)=>{const c=cands(id);const p=c[Math.min(c.length-1,Math.floor(c.length*(k||.5)))];return {...p,z};};
const node=(id,kind,roomId,z,k=.5)=>({id,kind,roomId,levelId:'L1',position:at(roomId,z,k)});
const show = (r,d,filter=()=>true)=>{ for (const c of B.calcRows(r,d).filter(filter)) console.log(c.id,'|',c.method,'|',c.status,'|',JSON.stringify(c.value),c.unit,c.reason?'| '+c.reason:''); };


const L = (lux)=>({targetLux:lux,lumensPerFixture:1600,utilizationFactor:.6,maintenanceFactor:.8,wattsPerFixture:14,mountHeightM:2.9});
const cable={sizeMm2:2.5,resistanceOhmPerKm:8,reactanceOhmPerKm:.08};
const prot={ratedA:16,correctedAmpacityA:18,voltageDropLimitPercent:3,source:'TEST-INPUT (not a code value)'};
sec('S4b صرف بميل صحيح (endInvert = -0.342)');
{ const inputs=B.emptyInputs();
  inputs.services.plumbing={fixtures:[node('WC1','WC','r16',0,.2)],equipment:[node('MAN1','MANIFOLD','r16',.3,.5)],
   connections:[{id:'DR1',system:'sanitary',fromId:'WC1',toId:'MAN1',flowM3S:.001,velocityMS:.8,selectedDiameterMm:110,startInvertM:-.3,endInvertM:-.342,slope:.02,routing:route(-.3,.12,.12,.02)}]};
  const {r}=await run(inputs); show(r,'plumbing'); console.log(JSON.stringify(r.disciplines.find(d=>d.id==='plumbing').schedules[0].rows)); }

sec('S6 تصدير وواجهة: مخرجات الدوال التي تستدعيها systems.mjs');
{ const inputs=B.emptyInputs(); inputs.services.electrical={ panels:[node('DB1','PANEL','r2',1.6,.9)], lightingByRoom:{ r4:{...L(150),powerFactor:.95,demandFactor:1,panelId:'DB1',phase:'L1',voltageV:230,routing:route(2.85,.03,.03),cable,protection:prot} } };
  const {b,r}=await run(inputs); const f=await B.freshness(r,b.project,b.sourceHash); console.log('freshness',f.fresh,f.reason);
  const json=await B.buildExport('json-result',{project:b.project,result:r,sourceHash:b.sourceHash}); const jr=JSON.parse(json.text); console.log('json-result',json.name,json.text.length,'bytes | calculations in JSON:',jr.disciplines.flatMap(d=>d.calculations).map(c=>c.id).join(','));
  for (const sid of ['electrical-circuits','electrical-panels','quantities']){ const c=await B.buildExport('csv',{project:b.project,result:r,sourceHash:b.sourceHash,scheduleId:sid}); console.log('csv',sid,'\n'+c.text.replace(/^\ufeff/,'').trim()); }
  const svg=await B.buildExport('svg',{project:b.project,result:r,sourceHash:b.sourceHash,levelId:'L1',discipline:'electrical'}); console.log('svg',svg.name,svg.text.length,'bytes | E-LIGHT layer in svg:',svg.text.includes('E-LIGHT'),'| LUMINAIRE glyph circles:',(svg.text.match(/<circle/g)||[]).length);
  const dxf=await B.buildExport('dxf',{project:b.project,result:r,sourceHash:b.sourceHash,levelId:'L1',discipline:'electrical'}); console.log('dxf',dxf.name,dxf.text.length,'bytes | E-LIGHT:',dxf.text.includes('E-LIGHT'));
  const A=await (await import(R+'dist/engineering-systems/src/index.mjs')).exportArtifacts(b.project,r); console.log('artifact keys',[...A.keys()].join(', '));
  console.log('layers',JSON.stringify(B.levelLayers(r,'L1','electrical')).slice(0,400));
  // stale: change lux and reuse old result
  const inputs2=JSON.parse(JSON.stringify(inputs)); inputs2.services.electrical.lightingByRoom.r4.targetLux=300; const b2=await B.bindArchitecture(doc,{alternativeId:'AUDIT',revision:'audit',inputs:inputs2});
  const f2=await B.freshness(r,b2.project,b2.sourceHash); console.log('after editing lux: fresh',f2.fresh,f2.reason); try{await B.buildExport('csv',{project:b2.project,result:r,sourceHash:b2.sourceHash,scheduleId:'quantities'});}catch(e){console.log('export refused:',e.code);} }
