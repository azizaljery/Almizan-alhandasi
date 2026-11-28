// Adapter to the ACTUAL production contract (dist/shara + home-flow), not staging V2.
import { activeFacts, bank, factSupport, readiness, restoreBrief } from './core.mjs';
import { environmentalContext, landWithConfirmedCity } from './context.mjs';
import { normalizeDiscovery } from '../client-brief.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
const countMap={'household.bedrooms':'bedrooms','services.kitchens':'kitchens','living.count':'halls','living.diningCount':'dining','living.baths':'baths'};
const rowLabels={'household.bedrooms':'إجمالي غرف النوم','hospitality.men':'مجلس الرجال','hospitality.women':'مجلس النساء','services.kitchens':'إجمالي المطابخ','living.count':'الصالات العائلية','living.diningCount':'غرف الطعام','living.baths':'إجمالي دورات المياه'};
const rowAreas={bedrooms:16,majlis:26,kitchens:13,halls:30,dining:15,baths:5};
const prefMap={'sleep.dressing':'masterDressing','sleep.ensuite':'allEnsuite','children.sharedBath':'sharedBaths','hospitality.maleEntry':'guestEntrance','hospitality.femaleEntry':'familyEntrance','privacy.familyEntry':'familyEntrance','privacy.bathSight':'bathsOffHall','parents.ground':'elderlyRoom'};
const extraMap={'household.staffRoom':'maid','household.guestBedroom':'guestRoom','daily.office':'office','daily.prayer':'prayer','daily.storage':'storage','services.pantry':'storage','services.laundry':'laundry'};
function valueText(q,value){return q.options.find(o=>o.value===value)?.label??String(value);}
export function projectToProduction(raw,native=null,{allowOverride=false}={}){
 const b=restoreBrief(raw),facts=activeFacts(b),v=id=>facts[id]?.value;
 const counts={bedrooms:0,majlis:0,kitchens:0,halls:0,dining:0,baths:0},requestedCounts={},prefs={},extras={},rules=[],ledger=[];
 for(const[id,key]of Object.entries(countMap))if(v(id)!==undefined){counts[key]=v(id);requestedCounts[key]=v(id);}
 counts.majlis=Number(v('hospitality.men')===true)+Number(v('hospitality.women')===true);requestedCounts.majlis=counts.majlis;
 prefs.receptionRoles=[...(v('hospitality.men')===true?['men']:[]),...(v('hospitality.women')===true?['women']:[])];
 for(const[id,key]of Object.entries(prefMap))if(v(id)!==undefined)prefs[key]=v(id);
 for(const[id,key]of Object.entries(extraMap))if(v(id)!==undefined){
  // Two questions can refer to one pantry: a positive request wins only while
  // both remain active; no extra room is added twice.
  if(v(id)===true)extras[key]=true;else if(extras[key]===undefined)extras[key]=false;
 }
 // Guest and parents rooms are INCLUDED in the requested bedroom total.
 // Native guestRoom is an extra suite; reserve one of the total for it.
 if(extras.guestRoom===true){counts.bedrooms=Math.max(0,counts.bedrooms-1);const bath=v('sleep.guestBath')===true||v('sleep.ensuite')===true;extras.guestRoom={bath,reserveBath:bath};}
 if(v('daily.officeGuests')!==undefined&&extras.office)extras.office={ext:v('daily.officeGuests')};
 if(v('services.kitchenStyle')!==undefined){prefs.openKitchen=v('services.kitchenStyle')==='open';prefs.kitchenOpenHall=v('services.kitchenStyle')==='open_to_hall';}
 if(v('architecture.concept')==='l_shape')prefs.shape='L';
 if(v('architecture.concept')==='courtyard'||v('garden.type')==='courtyard')prefs.courtyard=true;
 if(['modern','classic'].includes(v('architecture.style'))){prefs.style=v('architecture.style');prefs.styleWish=({modern:'حديث معاصر',classic:'كلاسيكي'})[v('architecture.style')];}
 if(v('garden.wanted')===true&&v('garden.type')!=='courtyard'){prefs.outdoor={lawn:true};if(v('garden.seating')===true)prefs.outdoor.pergola=true;}
 if(v('site.parkingShade')===true)prefs.outdoor={...(prefs.outdoor||{}),carport:v('site.parking')||1};
 const rule=(id,kind,a,c,extra={})=>rules.push({id:'V3-'+id,v3FactId:id,kind,a,...(c?{b:c}:{}),...extra,text:bank.find(q=>q.id===id)?.text||id});
 if(['near','direct_access'].includes(v('hospitality.majlisDining')))rule('hospitality.majlisDining',v('hospitality.majlisDining')==='near'?'near':'adjacent','majlis','dining');
 if(v('hospitality.kitchenDining')===true)rule('hospitality.kitchenDining','near','kitchen','dining');
 if(v('sleep.masterFloor')!==undefined)rule('sleep.masterFloor','floor','master',null,{floor:v('sleep.masterFloor')});
 if(v('parents.nearLiving')===true)rule('parents.nearLiving','near','elderly','hall');
 if(v('parents.quiet')===true)rule('parents.quiet','far','elderly','majlis');
 if(v('daily.storage')===true)rule('daily.storage','near','storage','entrance');
 const environment=environmentalContext(b.land,b.facts),notes=[];
 const program=[];
 for(const q of bank){
  const f=facts[q.id];if(!f)continue;
  const support=factSupport(q,f);
  ledger.push({id:q.id,label:q.text,value:f.value,valueLabel:valueText(q,f.value),priority:f.priority,source:f.source,verification:f.verification,evidence:f.evidence,revision:f.revision,...support});
  if(support.mode==='limited'||support.limited)notes.push({id:q.id,text:q.text,value:f.value,priority:f.priority,status:'requires_review',reason:'موثق للمهندس؛ لا يُدّعى تنفيذه أو التحقق منه في المولّد الحالي.'});
  if(rowLabels[q.id]){
   const key=countMap[q.id]||'majlis',count=typeof f.value==='boolean'?Number(f.value):f.value;
   program.push({id:'v3:'+q.id,label:rowLabels[q.id],count,source:'said',sourceLabel:'أكدتَه',reason:q.id==='household.bedrooms'?'إجمالي يشمل الرئيسية والوالدين والضيوف؛ لا تضاف غرفة الضيوف فوقه.':q.id==='services.kitchens'?'التحضيري ضمن الإجمالي، وليس إضافة فوقه.':'من إجابتك المؤكدة، قابل للتعديل.',floor:'any',area:rowAreas[key]});
  }
 }
 const migrationConflicts=[];
 if(native&&!allowOverride){
  if(!native.counts)throw Error('عقد موجز سابق غير معروف؛ لا يمكن دمجه تلقائيًا.');
  for(const[id,key]of Object.entries(countMap))if(v(id)!==undefined&&native.counts[key]!==undefined&&native.counts[key]!==counts[key])migrationConflicts.push({id,before:native.counts[key],after:counts[key],reason:'تعارض مع برنامج سابق؛ يحتاج اعتماد استبداله صراحة.'});
 }
 const requirements={counts:{...counts},prefs,extras,rules,areas:{},tweaks:{},sources:Object.fromEntries(program.map(r=>[r.id,'said'])),
  sharaaV3:clone(b),requestedCounts,architecturalNotes:notes,
  understood:ledger.filter(f=>f.status==='requested').map(f=>f.label+' '+f.valueLabel),unsupported:notes.map(n=>n.text),unclear:[]};
 const discovery=normalizeDiscovery({life:{...(v('household.parents')!==undefined?{seniors:v('household.parents')==='none'?'غير موجودين':'موجودون'}:{})},likes:[],rejects:[],avoids:[]});
 const idea=ledger.filter(f=>f.mode!=='context').map(f=>f.label+' '+f.valueLabel).join('؛ ').slice(0,4000);
 const brief={program,counts,requirements,discovery,idea,customs:[],addable:[],questions:[],unsupported:notes.map(n=>n.text),understood:requirements.understood,notes:environment.notes,floors:b.land.floors,
  family:{children:v('household.children')??null,parents:v('household.parents')??null},totals:{area:program.reduce((a,r)=>a+r.area*r.count,0),rooms:program.reduce((a,r)=>a+r.count,0)}};
 return{brief,counts,requestedCounts,requirements,discovery,idea,land:landWithConfirmedCity(b.land,b.facts),environment,ledger,
  sent:ledger.filter(f=>f.mode!=='limited'&&!f.limited).map(f=>f.id),withheld:ledger.filter(f=>f.mode==='limited'||f.limited).map(f=>f.id),
  handoff:{architecturalNotes:notes,environment,decisions:clone(b.history),originalDescriptions:b.history.filter(e=>e.kind==='intake').map(e=>e.text)},migrationConflicts,canApply:!migrationConflicts.length,
  readiness:readiness(b),requiresIntegrationReview:false};
}
export function previewProjection(v3,native=null,options={}){
 const projection=projectToProduction(v3,native,options);
 return{...projection,engineInput:{land:projection.land,counts:projection.counts,requirements:projection.requirements,discovery:projection.discovery,idea:projection.idea}};
}
