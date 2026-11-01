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


const thermal = a => ({ outdoorC: 44, indoorC: 24, surfaces: [{ areaM2: 22, uWm2K: .45 }, { areaM2: a, uWm2K: .25 }], solarW: 500, internalSensibleW: 300, internalLatentW: 150, infiltrationM3S: .003, outdoorAirM3S: .01, outdoorHumidityRatio: .012, indoorHumidityRatio: .009, densityKgM3: 1.2, cpJkgK: 1006, latentHeatJkg: 2450000 });
sec('S3 تكييف/تهوية/شفط (مدخلات اختبارية = قيم مثال الحزمة الافتراضية التوضيحية)');
{ const inputs=B.emptyInputs(); const a=room('r4').areaM2;
  inputs.services.hvac={equipment:[{...node('AC1','AIR_EQUIPMENT','r2',2.7,.5),ratedInputW:1400}],
   zones:[{id:'Z4',roomId:'r4',equipmentId:'AC1',thermal:thermal(a),supplyDeltaK:12,terminalHeightM:2.8,ductVelocityMS:4,ventilation:{persons:6,lSPerPerson:2.5,lSPerM2:.3,distributionEffectiveness:1},routing:route(2.8,.3,.25,.05)}],
   exhaust:[{id:'EF1',roomId:'r16',airChangesPerHour:8,fan:{position:at('r16',2.6,.3)},discharge:{id:'EX1',kind:'DISCHARGE',levelId:'L1',position:at('r16',2.6,.7)},routing:route(2.6,.15,.15)}]};
  const {r}=await run(inputs); show(r,'hvac'); const h=r.disciplines.find(d=>d.id==='hvac');
  const t=thermal(a), dT=20, cond=(22*.45+a*.25)*dT, air=1.2*1006*.013*dT, lat=1.2*2450000*.013*.003, sens=cond+500+300+air;
  console.log('يدوي: conduction',cond.toFixed(2),'airSens',air.toFixed(2),'airLat',lat.toFixed(2),'sens',sens.toFixed(2),'| supply m3/s',(sens/(1.2*1006*12)).toFixed(5),'| OA m3/s',((6*2.5+a*.3)/1000).toFixed(5),'| EF m3/s',(room('r16').areaM2*3.2*8/3600).toFixed(5));
  for(const s of h.schedules){console.log('schedule',s.id);for(const row of s.rows)console.log(JSON.stringify(row));}
  console.log('routes',h.routes.map(x=>x.id+':'+x.status+(x.reason?'/'+x.reason:'')+':'+(x.lengthM||0).toFixed(2)).join(' ; ')); console.log('issues',h.issues.map(i=>i.severity+':'+i.code).join(' ; ')); }

sec('S3b تكييف بمدخل ناقص (بلا cpJkgK) — NOT_CALCULATED ينتشر');
{ const inputs=B.emptyInputs(); const t=thermal(30); delete t.cpJkgK;
  inputs.services.hvac={zones:[{id:'Z4',roomId:'r4',thermal:t,supplyDeltaK:12,terminalHeightM:2.8,ductVelocityMS:4}]};
  const {r}=await run(inputs); show(r,'hvac'); console.log(JSON.stringify(r.disciplines.find(d=>d.id==='hvac').schedules[0].rows)); }

sec('S4 سباكة: ماء بارد + صرف بميل + خزان + مطر + تسخين + Darcy');
{ const inputs=B.emptyInputs();
  const mh={id:'MH1',kind:'MANHOLE',levelId:'L1',position:{...at('r16',-.342,.5),x:at('r16',0,.5).x}};
  inputs.services.plumbing={fixtures:[node('WC1','WC','r16',0,.2),node('BASIN1','BASIN','r16',.8,.8)],
   equipment:[node('MAN1','MANIFOLD','r16',.3,.5),{...mh,position:{x:at('r16',0,.5).x,y:at('r16',0,.5).y+0.0,z:-.342}}],
   connections:[{id:'CW1',system:'cold_water',fromId:'MAN1',toId:'BASIN1',flowM3S:.0002,velocityMS:1.5,selectedDiameterMm:20,routing:route(.4,.03,.03),hydraulics:{diameterM:.02,darcyFrictionFactor:.03,minorLossK:3,elevationRiseM:3,requiredResidualHeadM:10,gravityMS2:9.80665}},
                {id:'DR1',system:'sanitary',fromId:'WC1',toId:'MAN1',flowM3S:.001,velocityMS:.8,selectedDiameterMm:110,startInvertM:-.3,endInvertM:-.3-0.02*0.0,slope:.02,routing:route(-.3,.12,.12,.02)}],
   tank:{persons:6,litresPerPersonDay:200,autonomyDays:2}, roofDrainage:[{id:'ROOF1',intensityMmH:90,areaM2:168,runoffCoefficient:1}], hotWater:{flowM3S:.0001,deltaK:30,densityKgM3:998,cpJkgK:4180,efficiency:.9}};
  const {r}=await run(inputs); show(r,'plumbing'); const p=r.disciplines.find(d=>d.id==='plumbing');
  console.log('يدوي: D(CW1)=',Math.sqrt(4*.0002/(Math.PI*1.5)).toFixed(5),'tank L',6*200*2,'rain m3/s',(90*168*1/3600000).toFixed(6),'heater W',(.0001*998*4180*30/.9).toFixed(1));
  for(const s of p.schedules){console.log('schedule',s.id);for(const row of s.rows)console.log(JSON.stringify(row));}
  console.log('issues',p.issues.map(i=>i.severity+':'+i.code+(i.details?.reason?'/'+i.details.reason:'')).join(' ; ')); }

sec('S5 حريق/تيار خفيف/شمسي');
{ const inputs=B.emptyInputs();
  inputs.services.fire={devices:[node('SD1','SMOKE_DETECTOR','r4',3,.3),node('FACP1','FIRE_ALARM_PANEL','r2',1.4,.5)],connections:[{id:'F1',fromId:'FACP1',toId:'SD1',routing:route(2.65,.02,.02)}]};
  inputs.services.low_current={devices:[node('LAN1','DATA_RACK','r2',1.2,.3),node('DATA1','DATA_OUTLET','r4',.4,.5)],connections:[{id:'T1',fromId:'LAN1',toId:'DATA1',projectLengthLimitM:90,routing:route(2.45,.03,.03)}]};
  inputs.services.solar={capacity:{panelCount:2,wattsPerPanel:450},devices:[]};
  const {r}=await run(inputs); for(const d of ['fire','low_current','solar']){console.log('--',d); show(r,d); const x=r.disciplines.find(q=>q.id===d); console.log('devices',x.devices.length,'routes',x.routes.map(q=>q.id+':'+q.status+':'+(q.lengthM||0).toFixed(2)).join(','),'issues',x.issues.map(i=>i.code).join(','),'| limitations:',x.limitations.join(' / '));} }
