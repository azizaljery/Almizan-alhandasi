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

sec('S0 مدخلات فارغة (كما يفتحها المستخدم)');
{ const {r}=await run(B.emptyInputs()); console.log('status',r.status,'constructionApproved',r.constructionApproved,'codeCompliance',r.codeCompliance);
  for (const d of r.disciplines) console.log(d.id,'calcs',d.calculations.length,'devices',d.devices.length,'issues',d.issues.map(i=>i.code).join(','));
  console.log('rule codes in result issues:',r.issues.filter(i=>i.discipline==='project').map(i=>i.code)); }

sec('S1 إنارة: لومن فقط (بلا لوحة) — مدخلات اختبارية معلنة 150lux/1600lm/UF0.6/MF0.8');
const L = (lux)=>({targetLux:lux,lumensPerFixture:1600,utilizationFactor:.6,maintenanceFactor:.8,wattsPerFixture:14,mountHeightM:2.9});
{ const inputs=B.emptyInputs(); inputs.services.electrical={lightingByRoom:{r4:L(150),r2:L(150),r16:L(100),r8:L(300)}};
  const {r}=await run(inputs); const e=r.disciplines.find(d=>d.id==='electrical'); show(r,'electrical',c=>c.id.startsWith('E-LUX'));
  for (const id of ['r4','r2','r16','r8']){ const a=room(id).areaM2; const n=Math.ceil({r4:150,r2:150,r16:100,r8:300}[id]*a/(1600*.6*.8)); console.log('يدوي',id,'A=',a.toFixed(4),'N=',n,'| luminaires placed:',e.devices.filter(d=>d.roomId===id&&d.kind==='LUMINAIRE').length); }
  console.log('luminaire sample',JSON.stringify(e.devices.find(d=>d.kind==='LUMINAIRE')));
  console.log('issues',e.issues.map(i=>i.code+(i.details?.roomId?':'+i.details.roomId:'')).join(' ; ')); }

sec('S1b إنارة بمدخلات ناقصة (بلا UF) + ارتفاع تركيب خارج الغرفة');
{ const inputs=B.emptyInputs(); const bad=L(150); delete bad.utilizationFactor; const bad2=L(150); bad2.mountHeightM=9;
  inputs.services.electrical={lightingByRoom:{r4:bad,r2:bad2}};
  const {r}=await run(inputs); show(r,'electrical',c=>c.id.startsWith('E-LUX')); const e=r.disciplines.find(d=>d.id==='electrical'); console.log('luminaires',e.devices.filter(d=>d.kind==='LUMINAIRE').length,'issues',e.issues.map(i=>i.code+JSON.stringify(i.details||{})).join(' ; ').slice(0,700)); }

sec('S1c تجاوز حد الرسم (>160 وحدة): lumens صغير');
{ const inputs=B.emptyInputs(); inputs.services.electrical={lightingByRoom:{r2:{...L(500),lumensPerFixture:100}}};
  const {r}=await run(inputs); show(r,'electrical',c=>c.id.startsWith('E-LUX')); console.log(r.disciplines[0].issues.filter(i=>i.code==='LAYOUT_RESOURCE_LIMIT').map(i=>JSON.stringify(i.details))); }

sec('S2 كهرباء كاملة: لوحة + إنارة r4 على دائرة + مقبس + حمل مكيف');
const cable={sizeMm2:2.5,resistanceOhmPerKm:8,reactanceOhmPerKm:.08};
const prot={ratedA:16,correctedAmpacityA:18,voltageDropLimitPercent:3,source:'TEST-INPUT (not a code value)'};
let full;
{ const inputs=B.emptyInputs();
  inputs.services.electrical={ panels:[node('DB1','PANEL','r2',1.6,.9)],
   lightingByRoom:{ r4:{...L(150),powerFactor:.95,demandFactor:1,panelId:'DB1',phase:'L1',voltageV:230,routing:route(2.85,.03,.03),cable,protection:prot} },
   loads:[{...node('SO1','SOCKET','r2',.4,.1),powerW:1000,powerFactor:.95,demandFactor:.4},{...node('AC1-LOAD','EQUIPMENT_LOAD','r2',2.7,.6),powerW:1400,powerFactor:.9,demandFactor:1}],
   circuits:[{id:'C-SOCKET',panelId:'DB1',loadIds:['SO1'],phases:1,phase:'L2',voltageV:230,cable,protection:prot,routing:route(2.85,.03,.03)},{id:'C-AC',panelId:'DB1',loadIds:['AC1-LOAD'],phases:1,phase:'L3',voltageV:230,cable,protection:prot,routing:route(2.85,.03,.03)}] };
  full=await run(inputs); const {r}=full; show(r,'electrical',c=>!c.id.startsWith('E-P-EL-'));
  const e=r.disciplines.find(d=>d.id==='electrical'); for(const s of e.schedules){console.log('schedule',s.id); for(const row of s.rows) console.log(JSON.stringify(row));}
  console.log('issues',e.issues.map(i=>i.severity+':'+i.code).join(' ; ')); }
