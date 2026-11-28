// Pure adaptive interview: no DOM, provider, or ownership of the design engines.
import { records } from './question-bank.mjs';
import { labels } from './labels.mjs';
import { normalizeV3Land, factsForSite } from './context.mjs';
import { capability, requestsExecution, DOMAIN_WHY } from './capabilities.mjs';
import {askable} from './policy.mjs';
export const SCHEMA='SHARAA-BRIEF/3.0.0';
const clone=v=>JSON.parse(JSON.stringify(v));
const SOURCES=['client_answer','client_confirmed','client_free_text','ai_inference','design_default','land_step'];
const PRIORITIES=['mandatory','preferred','flexible'];
const ranges={
 'household.adults':[1,30],'household.children':[0,30],'household.staff':[0,15],'household.bedrooms':[1,10],'household.familyTogether':[1,60],
 'hospitality.typical':[1,100],'hospitality.peak':[1,200],'site.parking':[0,10],'services.kitchens':[1,10],
 'living.count':[0,10],'living.diningCount':[0,10],'living.baths':[1,10],'living.seating':[1,60],'living.height':[2,6],
 'future.extraRooms':[1,10],'budget.amount':[0,1e9],'budget.count':[1,6],
};
const optionLabels={
 'household.parents':{none:'لا يقيم أحدهما معنا',occasional:'يقيم معنا أحيانًا',permanent:'يقيم معنا بصفة دائمة'},
 'services.kitchenStyle':{closed:'مطبخ مغلق',open:'مفتوح على الطعام',open_to_hall:'مفتوح على الصالة'},
 'hospitality.dining':{shared:'غرفة طعام للأسرة والضيوف',separate:'غرفة طعام مستقلة للضيوف',inside_majlis:'داخل المجلس دون غرفة طعام مستقلة'},
 'hospitality.majlisDining':{near:'قرب وظيفي ومسار قصير',direct_access:'باب يربط المجلس بالطعام مباشرة',none:'لا أشترط قربهما'},
 'living.shape':{balanced:'صالة متوازنة الأبعاد',l_shape:'صالة على شكل L',multi_zone:'عدة مناطق جلوس'},
 'environment.climate':{dry:'حار وجاف',humid:'حار ورطب',mountain:'جبلي',unknown:'لا أعرف بعد'},
 'sleep.masterFloor':{ground:'الدور الأرضي',upper:'الدور العلوي'},
};
const totals=new Set(['household.bedrooms','hospitality.men','hospitality.women','services.kitchens','living.count','living.diningCount','living.baths']);
export const bank=Object.freeze(records.map((q,index)=>Object.freeze({
 ...q,index,consumer:capability(q.id,undefined).consumer,...(ranges[q.id]?{min:ranges[q.id][0],max:ranges[q.id][1]}:{}),
 text:q.id==='household.bedrooms'?'كم غرفة نوم إجمالًا، شاملة الرئيسية والوالدين وضيوف المبيت؟':q.id==='services.kitchens'?'كم مطبخًا إجمالًا، شاملًا التحضيري إن وجد؟':q.text,
 reason:DOMAIN_WHY[q.domain],defaultPriority:totals.has(q.id)?'mandatory':'preferred',
 options:q.type==='b'?[{value:true,label:'نعم'},{value:false,label:'لا'}]:q.type.includes('|')?q.type.split('|').map(value=>({value,label:optionLabels[q.id]?.[value]||labels[value]||value})):[],
})));
const byId=new Map(bank.map(q=>[q.id,q]));
const dependencies=q=>[...q.gate.matchAll(/(?:^|[;&])([^=>]+)[=>]/g)].map(m=>m[1]);
for(const q of bank)for(const id of dependencies(q))if(!id.startsWith('@')&&!byId.has(id))throw Error('Unknown dependency: '+id);
export const questionById=id=>byId.get(id)||null;
export const siteFacts=(land,facts={})=>factsForSite(land,facts);
export function createBrief(land){return{schemaVersion:SCHEMA,revision:0,land:normalizeV3Land(land),facts:{},history:[],deferred:[],acknowledged:[]};}
export function validate(q,value){
 if(!q)return false;
 if(q.type==='b')return typeof value==='boolean';
 if(q.type==='n'||q.type==='decimal')return typeof value==='number'&&Number.isFinite(value)&&(q.type!=='n'||Number.isSafeInteger(value))&&value>=(q.min??0)&&value<=(q.max??100);
 if(q.type==='t')return typeof value==='string'&&!!value.trim()&&value.length<=2000;
 return typeof value==='string'&&q.type.split('|').includes(value);
}
export function gateMatches(gate,b){
 if(!gate)return true;const site=siteFacts(b.land,b.facts);
 return gate.split(';').some(branch=>branch.split('&').every(term=>{
  const match=/^([^=>]+)([=>])(.+)$/.exec(term);if(!match)throw Error('Invalid gate: '+term);
  const [,id,op,rhs]=match,f=b.facts[id],value=id.startsWith('@')?site[id]:f?.verification==='confirmed'&&!f.recheck?f.value:undefined;
  if(value===undefined||value===null)return false;
  return op==='>'?typeof value==='number'&&value>Number(rhs):rhs.split(',').includes(String(value));
 }));
}
export function activeFacts(b){return Object.fromEntries(Object.entries(b.facts).filter(([id,f])=>byId.has(id)&&f.verification==='confirmed'&&!f.recheck&&gateMatches(byId.get(id).gate,b)));}
function event(b,kind,data){b.revision++;b.history.push({kind,...clone(data),revision:b.revision});if(b.history.length>1000)b.history=b.history.slice(-1000);b.acknowledged=[];}
function invalidate(b,roots,{includeRoots=false}={}){
 const affected=new Set(roots);let changed=true;
 while(changed){changed=false;for(const q of bank)if(!affected.has(q.id)&&dependencies(q).some(id=>affected.has(id))){affected.add(q.id);changed=true;}}
 for(const id of affected)if((includeRoots||!roots.includes(id))&&b.facts[id])b.facts[id].recheck=true;
}
export function answer(brief,id,value,{source='client_answer',priority='preferred',evidence='',revise=false}={}){
 const q=byId.get(id);
 if(!q||!validate(q,value)||!SOURCES.includes(source)||!PRIORITIES.includes(priority)||typeof evidence!=='string'||evidence.length>4000)throw Error('إجابة غير صالحة للسؤال.');
 if(!gateMatches(q.gate,brief))throw Error('هذا السؤال لا ينطبق على الإجابات الحالية.');
 const previous=brief.facts[id],confirmed=['client_answer','client_confirmed','land_step'].includes(source);
 if(previous?.verification==='confirmed'&&(!confirmed||(!revise&&JSON.stringify(previous.value)!==JSON.stringify(value))))throw Error('تغيير الإجابة المؤكدة يحتاج تعديلًا صريحًا.');
 if(!confirmed&&priority==='mandatory')priority='preferred';
 const b=clone(brief),normalized=typeof value==='string'?value.trim():value;
 event(b,previous?'answer_revision':'answer',{id,before:previous||null,value:normalized,source,priority});
 b.facts[id]={value:normalized,source,priority,verification:confirmed?'confirmed':'needs_confirmation',evidence,revision:b.revision};b.deferred=b.deferred.filter(key=>key!==id);
 if(previous&&JSON.stringify(previous.value)!==JSON.stringify(normalized))invalidate(b,[id]);
 if(id==='site.city')invalidate(b,bank.filter(n=>n.id!==id&&(n.domain==='site'||n.domain==='environment')).map(n=>n.id),{includeRoots:true});
 if(id==='environment.climate')invalidate(b,bank.filter(n=>n.id!==id&&(n.domain==='environment'||/@(?:dry|humid|mountain)/.test(n.gate))).map(n=>n.id),{includeRoots:true});
 return b;
}
export function conflicts(b){
 const facts=activeFacts(b),v=id=>facts[id]?.value,out=[],add=(id,fields,reason)=>out.push({id,fields,reason,kind:'conflict'});
 if(v('hospitality.peak')!==undefined&&v('hospitality.typical')!==undefined&&v('hospitality.peak')<v('hospitality.typical'))add('guest-capacity',['hospitality.peak','hospitality.typical'],'عدد ضيوف المناسبة الكبرى أقل من العدد المعتاد.');
 if(['shared','separate'].includes(v('hospitality.dining'))&&v('living.diningCount')===0)add('dining-count',['hospitality.dining','living.diningCount'],'طلبت غرفة طعام، لكن عدد غرف الطعام صفر.');
 if(v('hospitality.dining')==='inside_majlis'&&v('living.diningCount')>0)add('dining-mode',['hospitality.dining','living.diningCount'],'اخترت الطعام داخل المجلس دون غرفة مستقلة، لكن أضفت غرفة طعام.');
 if(v('hospitality.majlisDining')==='direct_access'&&v('living.diningCount')===0)add('door-no-dining',['hospitality.majlisDining','living.diningCount'],'الباب المباشر يحتاج غرفة طعام موجودة في البرنامج.');
 if(v('services.prep')===true&&v('services.kitchens')<2)add('prep-total',['services.prep','services.kitchens'],'التحضيري ضمن الإجمالي؛ اختر مطبخين على الأقل أو ألغِ التحضيري.');
 if(v('children.sharedBath')===true&&v('sleep.ensuite')===true)add('bath-mode',['children.sharedBath','sleep.ensuite'],'حمام لكل غرفة يتعارض مع مشاركة الأبناء للحمام.');
 if(v('household.guestBedroom')===true&&v('household.bedrooms')<2)add('guest-total',['household.guestBedroom','household.bedrooms'],'غرفة الضيوف المستقلة ضمن الإجمالي وتحتاج مساحة نوم أخرى للأسرة.');
 if(v('parents.independent')===true&&v('household.bedrooms')<2)add('parents-total',['parents.independent','household.bedrooms'],'جناح الوالدين المستقل ضمن الإجمالي يحتاج غرفة إضافية للأسرة.');
 if(v('parents.independent')===true&&v('household.guestBedroom')===true&&v('household.bedrooms')<3)add('bedroom-allocation',['household.bedrooms','parents.independent','household.guestBedroom'],'الرئيسية وجناح الوالدين وغرفة الضيوف المستقلون يحتاجون ثلاث غرف ضمن الإجمالي.');
 if(v('sleep.ensuite')===true&&v('sleep.guestBath')===false)add('guest-ensuite',['sleep.ensuite','sleep.guestBath'],'طلب حمام لكل غرفة يشمل غرفة الضيوف؛ حدد هل تريد استثناءها أم حمامًا لها.');
 if(v('sleep.ensuite')===true&&v('living.baths')!==undefined&&v('household.bedrooms')!==undefined){const guest=Number(v('hospitality.men')===true)+Number(v('hospitality.women')===true);if(v('living.baths')<v('household.bedrooms')+guest)add('ensuite-total',['sleep.ensuite','living.baths'],'عدد الحمامات لا يكفي لكل غرف النوم بالإضافة إلى حمامات المجالس.');}
 if(v('privacy.familyEntry')!==undefined&&v('hospitality.femaleEntry')!==undefined&&v('privacy.familyEntry')!==v('hospitality.femaleEntry'))add('family-entry',['privacy.familyEntry','hospitality.femaleEntry'],'مدخل النساء والعائلة يستخدم المسار نفسه حاليًا؛ احسم الاختيار المتعارض.');
 return out;
}
export function factSupport(q,f){
 if(f===undefined&&q?.schemaVersion===SCHEMA){const b=q;return Object.entries(b.facts).map(([id,fact])=>{
  const question=byId.get(id),row={id,domain:question.domain,consumer:capability(id,fact.value).consumer,importance:fact.priority,verification:fact.verification,source:fact.source,revision:fact.revision,mandatory:fact.priority==='mandatory'};
  if(!gateMatches(question.gate,b))return{...row,support:'not_applicable',reason:'لم تعد بوابة السؤال متحققة.'};
  if(fact.verification!=='confirmed'||fact.recheck)return{...row,support:'unconfirmed',reason:'تحتاج المعلومة تأكيد العميل أو مراجعتها بعد تغيير مرتبط.'};
  const support=factSupport(question,fact);return{...row,...support,support:support.mode==='context'?'context':support.limited?'unmapped':'candidate',reason:support.mode==='context'?'توجه سياق المقابلة؛ ليست وعدًا بتنفيذ هندسي.':support.limited?'موثقة للمراجعة المتخصصة.':'لها مستهلك في المحرك؛ التنفيذ يُراجع على المخطط.'};
 });}
 const c=capability(q.id,f.value),execution=requestsExecution(q,f.value)||f.priority==='mandatory';
 const limited=c.mode!=='context'&&execution&&(c.mode==='limited'||(f.priority==='mandatory'&&!c.verifiable));
 return{...c,limited,status:c.mode==='context'?'context':!execution?'not_requested':limited?'requires_review':'requested'};
}
export function readiness(b){
 const hasPolygon=[b.land.engineLand?.polygon,b.land.geo?.polygon,b.land.polygon].some(p=>Array.isArray(p)&&p.length>0);
 const landIssues=hasPolygon?[{code:'SITE_POLYGON_NOT_SUPPORTED',message:'حدود الأرض المضلعة تحتاج دراسة مطابقة للمساحة؛ مولّد المقابلة الحالي يعتمد أبعادًا مستطيلة، ولن يحوّل الحدود إلى مستطيل بصمت.'}]:[];
 const applies=q=>gateMatches(q.gate,b),complete=q=>b.facts[q.id]?.verification==='confirmed'&&!b.facts[q.id].recheck;
 const missing=bank.filter(q=>q.tier===1&&applies(q)&&!complete(q)).map(q=>q.id);
 const pending=bank.filter(q=>applies(q)&&b.facts[q.id]?.priority==='mandatory'&&!complete(q)).map(q=>q.id);
 const limits=Object.entries(activeFacts(b)).filter(([id,f])=>factSupport(byId.get(id),f).limited).map(([id])=>id),hard=limits.filter(id=>b.facts[id].priority==='mandatory');
 const accepted=new Set(b.acknowledged.filter(a=>a.revision===b.revision).map(a=>a.id));
 const c=conflicts(b),unaccepted=limits.filter(id=>!accepted.has(id));
 const status=c.length?'CONFLICT_REQUIRES_DECISION':landIssues.length?'SITE_REQUIRES_SPECIALIST':missing.length||pending.length?'NEEDS_CLARIFICATION':limits.length?'LIMITED_SUPPORT':'READY_TO_GENERATE';
 return{status,missing,pending,limits,hard,conflicts:c,unaccepted,landIssues,canGenerate:!landIssues.length&&!c.length&&!missing.length&&!pending.length&&!hard.length&&!unaccepted.length,answered:Object.keys(activeFacts(b)).length,applicable:bank.filter(applies).length};
}
export function nextQuestion(b,{depth='standard'}={}){
 const collision=conflicts(b)[0];if(collision)return collision;
 const chosen=bank.filter(q=>(askable(q,depth)||b.facts[q.id]?.priority==='mandatory')&&gateMatches(q.gate,b)&&(!b.facts[q.id]||b.facts[q.id].verification!=='confirmed'||b.facts[q.id].recheck)&&(!b.deferred.includes(q.id)||q.tier===1||b.facts[q.id]?.priority==='mandatory'));
 const score=q=>{const f=b.facts[q.id],children=b.facts['household.children'],parents=b.facts['household.parents'];const timely=q.id==='children.ages'&&children?.value>0||q.id==='parents.ground'&&parents?.value!=='none'&&parents?.verification==='confirmed';return(f?.recheck?220:f?.verification==='needs_confirmation'?210:timely?180:q.tier===1?140:q.tier===2?70:20)+Math.min(15,bank.filter(n=>dependencies(n).includes(q.id)).length*2)+(f?.priority==='mandatory'?30:0)-q.index/1000;};
 const q=chosen.sort((a,c)=>score(c)-score(a))[0];return q?{...q,kind:'question',score:score(q),needsConfirmation:b.facts[q.id]?.verification==='needs_confirmation',previous:b.facts[q.id]||null}:null;
}
export function acknowledge(b,ids){
 const r=readiness(b);if(!Array.isArray(ids)||ids.some(id=>!r.limits.includes(id)||r.hard.includes(id)))throw Error('لا يمكن تجاوز شرط إلزامي أو متطلب غير معروف.');
 const n=clone(b),already=n.acknowledged.filter(a=>a.revision===n.revision).map(a=>a.id);event(n,'accept_limitations',{ids});n.acknowledged=[...new Set([...already,...ids])].map(id=>({id,revision:n.revision}));return n;
}
export function defer(b,id){const q=byId.get(id);if(!q||q.tier===1||!gateMatches(q.gate,b)||b.facts[id]?.priority==='mandatory')throw Error('هذا السؤال لا يمكن تأجيله.');const n=clone(b);event(n,'defer',{id});n.deferred=[...new Set([...n.deferred,id])];return n;}
export function removeAnswer(b,id){if(!byId.has(id)||!b.facts[id])throw Error('لا توجد إجابة لحذفها.');const n=clone(b);event(n,'remove_answer',{id,before:n.facts[id]});delete n.facts[id];invalidate(n,[id]);return n;}
export function rejectProposals(b,ids){if(!Array.isArray(ids)||ids.some(id=>!byId.has(id)))throw Error('قرار غير صالح.');const n=clone(b);event(n,'reject_proposals',{ids});return n;}
export function recordIntake(b,text){if(typeof text!=='string'||text.length>4000)throw Error('وصف غير صالح.');const n=clone(b);event(n,'intake',{text,source:'client_free_text'});return n;}
export function recordIdea(b,kind,idea){if(!['accept_idea','decline_idea'].includes(kind)||!idea||typeof idea.id!=='string'||idea.id.length>100)throw Error('اقتراح غير صالح.');const n=clone(b);event(n,kind,{id:idea.id,key:idea.key,reason:idea.reason});return n;}
export function reviseLand(b,land){const n=clone(b),normalized=normalizeV3Land(land);if(JSON.stringify(normalized)===JSON.stringify(b.land))return n;event(n,'land_revision',{before:b.land,after:normalized});n.land=normalized;invalidate(n,bank.filter(q=>q.domain==='site'||q.domain==='environment'||q.gate.includes('@')).map(q=>q.id),{includeRoots:true});return n;}
export function ingest(b,proposals){
 if(!Array.isArray(proposals)||proposals.length>146)throw Error('اقتراحات غير صالحة.');
 let n=b;const rejected=[];for(const p of proposals){try{n=answer(n,p.id,p.value,{source:p.source==='client_free_text'?'client_free_text':'ai_inference',priority:p.priority||'preferred',evidence:p.evidence||''});}catch(e){rejected.push({id:p.id,reason:e.message});}}return{brief:n,rejected};
}
export function restoreBrief(raw){
 if(!raw||raw.schemaVersion!==SCHEMA||!Number.isSafeInteger(raw.revision)||raw.revision<0||!raw.facts||typeof raw.facts!=='object'||Array.isArray(raw.facts)||!Array.isArray(raw.history)||raw.history.length>1000)throw Error('حالة شرعاء المحفوظة غير صالحة.');
 const b=createBrief(raw.land);b.revision=raw.revision;
 for(const[id,f]of Object.entries(raw.facts)){
  if(!byId.has(id)||!f||!validate(byId.get(id),f.value)||!SOURCES.includes(f.source)||!PRIORITIES.includes(f.priority)||!['confirmed','needs_confirmation'].includes(f.verification)||!Number.isSafeInteger(f.revision)||f.revision>b.revision||typeof f.evidence!=='string'||f.evidence.length>4000)throw Error('إجابة محفوظة غير صالحة.');
  if(f.verification==='confirmed'&&!['client_answer','client_confirmed','land_step'].includes(f.source))throw Error('استنتاج غير مؤكد في ملف المشروع.');b.facts[id]=clone(f);
 }
 if(!Array.isArray(raw.deferred)||raw.deferred.some(id=>!byId.has(id)||byId.get(id).tier===1))throw Error('تأجيل غير صالح.');
 b.history=clone(raw.history);b.deferred=[...new Set(raw.deferred)];
 b.acknowledged=Array.isArray(raw.acknowledged)?raw.acknowledged.filter(a=>a&&byId.has(a.id)&&a.revision===b.revision&&b.facts[a.id]?.priority!=='mandatory').map(a=>({id:a.id,revision:a.revision})):[];return b;
}
// The bridge supplies the production contract; no stale V2 imports here.
export function projectNative(brief,native,api){if(typeof api?.projectV3!=='function')throw Error('استخدم محوّل شرعاء V3 المتوافق مع نسخة الإنتاج.');return api.projectV3(brief,native);}
