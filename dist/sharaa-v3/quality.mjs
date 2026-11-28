// Eligibility and evidence only. Aziz and Mizan Score keep their own scoring.
import { analyzeDoc } from '../draw/digest.mjs';
import { evaluateSaudiQuality } from '../architect/saudi-quality.mjs';
import { geometryFingerprint } from '../design-dna.mjs';
import { verifyRequest } from '../rules.mjs';
import { projectToProduction } from './native-bridge.mjs';
import { activeFacts, restoreBrief, questionById, factSupport, readiness } from './core.mjs';
const rounded=v=>Math.round(v*100)/100;
const stable=v=>JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
export function validateV3Generation(args){
 const raw=args.requirements?.sharaaV3;if(!raw)return;
 const b=restoreBrief(raw),projected=projectToProduction(b),r=readiness(b);
 const error=(code,message)=>{const e=Error(message);e.code=code;throw e;};
 if(!r.canGenerate)error('SHARAA_V3_NOT_READY','احسم الإجابات المؤكدة والشروط الإلزامية قبل التوليد.');
 const actual=args.counts||args.requirements.counts;
 if(Object.entries(projected.counts).some(([key,value])=>actual?.[key]!==value||args.requirements.counts?.[key]!==value))error('SHARAA_V3_EDIT_REQUIRED','تغيّر البرنامج خارج إجابات شرعاء؛ راجع التعديل وأكده في المقابلة.');
 for(const key of ['prefs','extras','areas','privacy'])if(stable(args.requirements[key]||{})!==stable(projected.requirements[key]||{}))error('SHARAA_V3_EDIT_REQUIRED','تغيّر قرار معماري خارج إجابات شرعاء؛ راجعه وأكده في المقابلة.');
 const rules=req=>(req.rules||[]).map(({id,text,...rule})=>rule).sort((a,b)=>stable(a).localeCompare(stable(b)));
 if(stable(rules(args.requirements))!==stable(rules(projected.requirements)))error('SHARAA_V3_EDIT_REQUIRED','تغيّرت العلاقات الهندسية خارج إجابات شرعاء؛ راجعها في المقابلة.');
 const land=args.land||{},expected=projected.land;
 if(land.width!==expected.width||land.length!==expected.length||(land.floors??1)!==expected.floors||JSON.stringify(land.entries)!==JSON.stringify(expected.entries)||JSON.stringify([...(land.streets||[])].sort())!==JSON.stringify([...expected.streets].sort()))error('SHARAA_V3_LAND_CHANGED','تغيّرت الأرض؛ ارجع إلى المقابلة لمراجعة إجابات الموقع قبل التوليد.');
}
export function reviewV3(doc,raw){
 const b=restoreBrief(raw),facts=activeFacts(b),v=id=>facts[id]?.value,checks=[];
 let model;try{model=analyzeDoc(doc);}catch{return{checks:[{id:'geometry',state:'unverified',priority:'mandatory',title:'قراءة هندسة المخطط',reason:'تعذّر تحليل المستند.',evidence:{},roomIds:[]}],eligible:false};}
 const all=model.levels.flatMap(l=>l.rooms),ground=model.levels[0];
 const add=(id,ok,reason,evidence={},rooms=[])=>checks.push({id,priority:facts[id]?.priority||'preferred',title:questionById(id)?.text||id,state:ok===null?'unverified':ok?'verified':'violated',reason,evidence,roomIds:rooms.map(r=>r.id),levelId:rooms[0]?.levelId||null});
 const counts={
  'household.bedrooms':all.filter(r=>['bedroom','master'].includes(r.type)),
  'services.kitchens':all.filter(r=>r.type==='kitchen'),'living.count':all.filter(r=>r.type==='living'),
  'living.diningCount':all.filter(r=>r.type==='dining'),'living.baths':all.filter(r=>r.type==='bath'),
 };
 for(const[id,rooms]of Object.entries(counts))if(v(id)!==undefined)add(id,rooms.length===v(id),`المطلوب ${v(id)}، الموجود في الغرف المغلقة المسمّاة ${rooms.length}.`,{expected:v(id),actual:rooms.length},rooms);
 const majlis=all.filter(r=>r.type==='majlis'),total=Number(v('hospitality.men')===true)+Number(v('hospitality.women')===true);
 for(const id of ['hospitality.men','hospitality.women'])if(v(id)!==undefined){const role=majlis.filter(r=>id.endsWith('.men')?/رجال|رجالي/.test(r.name):/نساء|نسائي|حريم/.test(r.name)),ambiguous=majlis.some(r=>!/رجال|رجالي|نساء|نسائي|حريم/.test(r.name));const expected=Number(v(id));add(id,ambiguous?null:role.length===expected,`المجالس المطلوبة ${total}، الموجودة ${majlis.length}؛ العدد المسمى لهذا الدور ${role.length} مقابل ${expected}.${ambiguous?' يوجد مجلس بلا دور موثق فلا أعتمده باسم الرجال أو النساء.':''}`,{expected,actual:role.length,totalRequested:total,totalActual:majlis.length},role);}
 const guestRooms=all.filter(r=>['bedroom','master'].includes(r.type)&&/ضيوف|ضيف/.test(r.name));
 if(v('household.guestBedroom')!==undefined)add('household.guestBedroom',v('household.guestBedroom')?guestRooms.length===1:guestRooms.length===0,'وجود غرفة مبيت للضيوف يُقاس من الغرفة المسمّاة المرسومة، وهي ضمن إجمالي غرف النوم.',{actual:guestRooms.length},guestRooms);
 if(v('sleep.guestBath')===true){const baths=[];for(const lv of model.levels)for(const room of guestRooms.filter(r=>r.levelId===lv.level.id))for(const edge of lv.graph.get(room.id)||[]){const bath=lv.roomsById.get(edge.to);if(bath?.type==='bath'&&(lv.graph.get(bath.id)||[]).every(e=>e.to===room.id))baths.push(bath);}add('sleep.guestBath',!!baths.length,'حمام خاص لغرفة الضيوف: باب فعلي يصل إليها ولا يفتح على غرفة أخرى.',{bathIds:baths.map(r=>r.id)},guestRooms.concat(baths));}
 let saudi=null;
 const detail=()=>saudi||=(evaluateSaudiQuality(doc,{separateEntries:true,diningService:true,parentsResident:v('parents.ground')===true},{model}));
 const use=(id,code)=>{const c=detail().checks.find(c=>c.id===code);add(id,!c||['unknown','na'].includes(c.state)?null:c.state==='pass',c?.reason||'لا تكفي بيانات البرنامج لإثبات هذا الشرط.',c?.evidence||{},(c?.roomIds||[]).map(id=>model.roomIndex.get(id)?.room).filter(Boolean));};
 const men=(ground?.rooms||[]).filter(r=>r.type==='majlis'&&(/رجال/.test(r.name)||(majlis.length===1&&v('hospitality.men')===true)));
 if(v('hospitality.majlisDining')==='direct_access'){
  const dining=(ground?.rooms||[]).filter(r=>r.type==='dining');
  const doors=(ground?.openings||[]).filter(op=>['door','door2','slider'].includes(op.kind)&&op.sides.some(s=>men.some(r=>r.id===s.room.id))&&op.sides.some(s=>dining.some(r=>r.id===s.room.id)));
  add('hospitality.majlisDining',!!doors.length,'الباب المباشر يُثبت بفتحة باب فعلية تربط المجلس والطعام؛ تلاصق الغرف أو قربهما لا يكفي.',{openingIds:doors.map(o=>o.id)},men.concat(dining));
 }else if(v('hospitality.majlisDining')==='near')use('hospitality.majlisDining','men-dining');
 if(v('hospitality.kitchenDining')===true)use('hospitality.kitchenDining','kitchen-dining');
 for(const id of ['hospitality.maleEntry','hospitality.femaleEntry','privacy.familyEntry'])if(v(id)===true)use(id,'independent-entries');
 if(v('parents.ground')===true)use('parents.ground','parents-ground');
 if(v('sleep.masterFloor')!==undefined){const master=all.filter(r=>r.type==='master'||/رئيسي|ماستر/.test(r.name)),want=v('sleep.masterFloor')==='ground'?0:1;add('sleep.masterFloor',master.length?master.every(r=>model.levels.findIndex(l=>l.level.id===r.levelId)===want):null,'يُقاس الدور من الغرفة الرئيسية المرسومة فعلًا.',{expectedLevelIndex:want,actual:master.map(r=>r.levelId)},master);}
 if(v('privacy.bathSight')===true){const bad=model.levels.flatMap(l=>l.openings.filter(o=>o.door&&o.sides.some(s=>s.room.type==='bath')&&o.sides.some(s=>s.room.type==='living')));add('privacy.bathSight',!bad.length,'الفحص على الأبواب المباشرة بين الحمامات والصالة، وليس على نية المولّد.',{openingIds:bad.map(o=>o.id)});}
 if(v('living.shape')==='balanced'){
  const halls=all.filter(r=>r.type==='living'),measurements=halls.map(r=>({id:r.id,width:rounded(r.rect.w),length:rounded(r.rect.l),aspect:rounded(r.rect.l/Math.max(.01,r.rect.w)),shape:r.shape}));
  add('living.shape',halls.length?measurements.every(r=>r.shape==='rectangle'&&r.aspect<=2.02):null,'الهدف الإرشادي للصالة المتوازنة نسبة طول إلى عرض ≤ 2؛ الشكل غير المستطيل يحتاج مراجعة توزيع الجلسة.',{maxAspect:2,measurements},halls);
 }
 const covered=new Set(checks.map(c=>c.id));
 for(const[id,f]of Object.entries(facts)){
  if(covered.has(id))continue;const s=factSupport(questionById(id),f);
  if(s.mode==='context'||s.status==='not_requested')continue;
  add(id,null,s.limited?'طلب موثق يحتاج مراجعة متخصصة؛ لا يثبت تنفيذه في هذا النموذج.':'وُجّه الطلب إلى المحرك، لكن هذا الفحص لا يملك دليلًا هندسيًا كافيًا لاعتماده.',{consumer:s.consumer,value:f.value});
 }
 return{schema:'sharaa-quality/3',checks,eligible:!checks.some(c=>c.priority==='mandatory'&&c.state!=='verified'),limitations:['القياسات على المخطط والأبواب الفعلية؛ لا تتضمن خلو مسار جسم الإنسان من الأثاث أو تفاصيل البناء الإنشائية.','حدود القرب والتناسب أهداف تصميمية إرشادية وليست نصوص اشتراطات نظامية.']};
}
export function enforceV3Result(result,requirements){
 const raw=requirements?.sharaaV3;if(!raw)return result;
 const r=readiness(restoreBrief(raw));if(!r.canGenerate){const error=Error('لم تُحسم الإجابات أو الشروط الإلزامية في شرعاء V3.');error.code='SHARAA_V3_NOT_READY';throw error;}
 const initial=[{...(result.alternatives?.find(a=>a.index===result.selectedIndex)||{}),doc:result.doc,index:result.selectedIndex??0},...(result.alternatives||[]).filter(a=>a.doc!==result.doc)];
 const seen=new Set(),evaluated=[];
 for(const a of initial){const key=JSON.stringify(a.doc);if(seen.has(key))continue;seen.add(key);const report=reviewV3(a.doc,raw);evaluated.push({...a,sharaaQuality:report});}
 const allowed=evaluated.filter(a=>a.sharaaQuality.eligible);
 if(!allowed.length){const error=Error('لم أجد ضمن البدائل المولّدة تصميمًا يثبت جميع شروطك الإلزامية. راجع التقرير أو عدّل طلبك صراحة؛ لن أخفّض الشروط تلقائيًا.');error.code='SHARAA_V3_NO_MATCH';error.v3Findings=evaluated[0]?.sharaaQuality.checks.filter(c=>c.priority==='mandatory'&&c.state!=='verified')||[];throw error;}
 const chosen=allowed[0],changed=chosen.doc!==result.doc;
 const selected=changed?{summary:chosen.summary||'',pat:chosen.pat??null,strategy:chosen.strategy||'',mirror:chosen.mirror??null,same:chosen.same??null,fit:chosen.fit??null,report:chosen.report||{areaMismatch:[],unmatched:[]},ledger:verifyRequest(chosen.doc,requirements,{entry:chosen.doc.plot?.entry||'s'}),floors:chosen.doc.levels?.length||result.floors||1}:{};
 return{...result,...selected,doc:chosen.doc,selectedIndex:chosen.index,alternatives:allowed,alternativesCount:allowed.length,
  dna:changed&&result.dna?{...result.dna,selectedIndex:chosen.index,openingAware:null,geometryFingerprint:geometryFingerprint(chosen.doc),selectionSource:'sharaa-eligibility-filter'}:result.dna,
  // A filter changes eligibility, not either engine's score or weights.
  sharaaQuality:chosen.sharaaQuality,selectionSource:changed?'sharaa-eligibility-filter':result.selectionSource,
  notes:[...(changed?chosen.notes||[]:result.notes||[]),...(changed?['استُبعد الاختيار الأول لعدم إثبات شرط إلزامي، وعُرض أول بديل مستوفٍ وفق ترتيب المحرك القائم.']:[]),...chosen.sharaaQuality.checks.filter(c=>c.state!=='verified'&&c.priority!=='mandatory').map(c=>'يُراجع: '+c.title+' — '+c.reason)]};
}
