// SHARAA V3 — سيناريوهات معمارية تُختبر على محرك التوليد الحالي dist/villa-layout.mjs.
// كل سيناريو: أرض + إجابات عميل مُحاكاة. المخرجات: الأسئلة الظاهرة والمستبعدة، العقد، البدائل، التقييم.
import * as C from './core.mjs';
import {depthOf} from './policy.mjs';
import {generateVillaDesigns, checkDoc, quality} from '../villa-layout.mjs';

const L=(width,length,entry,streets)=>({width,length,entries:[entry],streets});
export const SCENARIOS=[
 {id:'S01',name:'أسرة بلا أطفال',land:L(18,30,'n',['n']),answers:{'household.adults':2,'household.children':0,'household.parents':'none','household.bedrooms':3,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':2,'budget.count':1}},
 {id:'S02',name:'أطفال صغار',land:L(18,30,'n',['n']),answers:{'household.children':2,'children.ages':'young','children.play':true,'household.bedrooms':4,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':4,'budget.count':1}},
 {id:'S03',name:'أبناء كبار ومراهقون',land:L(18,30,'n',['n']),answers:{'household.children':3,'children.ages':'teen','children.study':true,'household.bedrooms':4,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':4,'budget.count':1}},
 {id:'S04',name:'إقامة الوالد',land:L(18,30,'n',['n']),answers:{'household.parents':'permanent','parents.independent':true,'household.bedrooms':4,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1}},
 {id:'S05',name:'إقامة الوالدة',land:L(18,30,'n',['n']),answers:{'household.parents':'permanent','parents.ground':true,'household.bedrooms':4,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1}},
 {id:'S06',name:'إقامة الوالدين',land:L(20,30,'n',['n']),answers:{'household.parents':'permanent','parents.independent':true,'household.bedrooms':5,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':4,'budget.count':1}},
 {id:'S07',name:'ضيافة متزامنة رجال ونساء',land:L(22,30,'n',['n']),answers:{'household.bedrooms':4,'hospitality.men':true,'hospitality.women':true,'hospitality.simultaneous':true,'hospitality.dining':'separate','hospitality.majlisDining':'near','services.kitchens':2,'living.count':1,'living.diningCount':2,'living.baths':6,'budget.count':1}},
 {id:'S08',name:'أرض ضيقة وطويلة 12x36',land:L(12,36,'n',['n']),answers:{'household.bedrooms':3,'hospitality.men':true,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1}},
 {id:'S09',name:'أرض عريضة 30x16',land:L(30,16,'n',['n']),answers:{'household.bedrooms':4,'hospitality.men':true,'hospitality.women':true,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':5,'budget.count':1}},
 {id:'S10',name:'أرض زاوية شارعين',land:L(18,24,'n',['n','e']),answers:{'household.bedrooms':4,'hospitality.men':true,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':4,'budget.count':1}},
 {id:'S11',name:'أرض غير منتظمة (مضلع)',land:{...L(18,30,'n',['n']),polygon:[[0,0],[18,0],[18,20],[10,30],[0,30]]},answers:{'household.bedrooms':3,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'site.irregularUse':true,'budget.count':1},expect:'NOT_EVALUATED: المحرك لا يقبل مضلعًا غير منتظم في هذا المسار'},
 {id:'S12',name:'واجهة غربية',land:L(18,30,'w',['w']),answers:{'household.bedrooms':4,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'environment.westShade':true,'budget.count':1}},
 {id:'S13',name:'ساحلية رطبة',land:{...L(18,30,'n',['n']),climate:'humid'},answers:{'household.bedrooms':3,'environment.climate':'humid','environment.humidity':true,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1}},
 {id:'S14',name:'صحراوية جافة',land:{...L(18,30,'n',['n']),climate:'dry'},answers:{'household.bedrooms':3,'environment.climate':'dry','environment.dust':true,'environment.courtyardShade':true,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1}},
 {id:'S15',name:'فناء داخلي مطلوب',land:L(24,30,'n',['n']),answers:{'household.bedrooms':4,'architecture.concept':'courtyard','hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1},expect:'NOT_SUPPORTED: لا يوجد نمط فناء داخلي في محرك التوليد الحالي'},
 {id:'S16',name:'أجنحة متقابلة',land:L(26,30,'n',['n']),answers:{'household.bedrooms':4,'architecture.mass':'wings','site.wideWings':true,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1}},
 {id:'S17',name:'طلبات متعارضة: ضيوف الذروة أقل من المعتاد',land:L(18,30,'n',['n']),answers:{'household.bedrooms':3,'hospitality.men':true,'hospitality.women':true,'hospitality.typical':10,'hospitality.peak':5,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1},expect:'CONFLICT'},
 {id:'S18',name:'طلب غير قابل للتحقق: لا شمس في أي غرفة',land:L(18,30,'n',['n']),answers:{'household.bedrooms':3,'environment.daylight':'low','architecture.reference':'بلا شمس نهائيًا','hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1},expect:'NOT_VERIFIABLE'},
 {id:'S19',name:'تصميم واحد',land:L(18,30,'n',['n']),answers:{'household.bedrooms':3,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1}},
 {id:'S20',name:'عدة بدائل',land:L(18,30,'n',['n']),answers:{'household.bedrooms':3,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':3}},
 {id:'S21',name:'أسرة كبيرة وضيافة وإقامة والدين',land:L(24,30,'n',['n']),answers:{'household.children':4,'household.parents':'permanent','parents.independent':true,'household.bedrooms':6,'hospitality.men':true,'hospitality.women':true,'hospitality.simultaneous':true,'services.kitchens':2,'living.count':2,'living.diningCount':1,'living.baths':8,'budget.count':2}},
 {id:'S22',name:'غرفة نوم واحدة',land:L(12,20,'n',['n']),answers:{'household.bedrooms':1,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':1,'hospitality.men':false,'hospitality.women':false,'budget.count':1}},
 {id:'S23',name:'ست غرف نوم',land:L(28,34,'n',['n']),answers:{'household.bedrooms':6,'hospitality.men':true,'hospitality.women':true,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':7,'budget.count':1}},
 {id:'S24',name:'مطبخان',land:L(22,30,'n',['n']),answers:{'household.bedrooms':4,'services.kitchens':2,'living.count':1,'living.diningCount':1,'living.baths':4,'hospitality.men':false,'hospitality.women':false,'budget.count':1}},
 {id:'S25',name:'مجلس رجال فقط',land:L(18,30,'n',['n']),answers:{'household.bedrooms':3,'hospitality.men':true,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1}},
 {id:'S26',name:'مجلس نساء فقط',land:L(18,30,'n',['n']),answers:{'household.bedrooms':3,'hospitality.men':false,'hospitality.women':true,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':3,'budget.count':1}},
 {id:'S27',name:'بلا مجلس',land:L(18,30,'n',['n']),answers:{'household.bedrooms':3,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':2,'budget.count':1}},
 {id:'S28',name:'صالتان',land:L(24,30,'n',['n']),answers:{'household.bedrooms':4,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':2,'living.diningCount':1,'living.baths':3,'budget.count':1}},
 {id:'S29',name:'حمامات كثيرة',land:L(22,30,'n',['n']),answers:{'household.bedrooms':4,'hospitality.men':true,'hospitality.women':true,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':9,'budget.count':1}},
 {id:'S30',name:'أرض بدوّر (طابقان مطلوبان)',land:{...L(18,30,'n',['n']),floors:2},answers:{'household.bedrooms':4,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':4,'future.expand':true,'budget.count':1},expect:'NOT_EVALUATED: مسار الطابقين مختلف ولم يُشغّل هنا'},
];
// يحاكي الجلسة بإجابات السيناريو فقط
export function interview(sc,depth='standard'){
  let b=C.createBrief({widthM:sc.land.width,depthM:sc.land.length,entries:sc.land.entries,streets:sc.land.streets.map(s=>({side:s})),floors:sc.land.floors||1,...(sc.land.climate?{climate:sc.land.climate}:{})});
  const asked=[],excluded=[];
  for(let i=0;i<200;i++){const q=C.nextQuestion(b,{depth});if(!q)break;
    if(q.kind==='conflict'){excluded.push('CONFLICT:'+q.fields.join('/'));break}
    asked.push(q.id);const v=sc.answers[q.id]!==undefined?sc.answers[q.id]:defaultFor(q);
    try{b=C.answer(b,q.id,v,{priority:'preferred'})}catch(e){b=C.defer(b,q.id)}}
  for(const q of C.bank)if(!C.gateMatches(q.gate,b))excluded.push(q.id);
  return {brief:b,asked,excluded,depth};
}
function defaultFor(q){if(q.type==='b')return false;if(q.type==='n')return 1;if(q.type==='t')return 'لا';if(q.type==='decimal')return 3;return q.type.split('|')[0]}
export function countsFrom(b){
  const f=k=>b.facts[k]?.verification==='confirmed'?b.facts[k].value:undefined;
  const men=f('hospitality.men')===true, women=f('hospitality.women')===true;
  return {bedrooms:f('household.bedrooms')??2, majlis:(men?1:0)+(women?1:0), baths:f('living.baths')??2, kitchens:f('services.kitchens')??1, halls:f('living.count')??1, dining:f('living.diningCount')??1};
}
// بوابة التوليد: لا توليد مع تعارض أو مع معلومة إلزامية غير مدعومة أو سؤال أساسي مفقود.
export function generationGate(b){
  const r=C.readiness(b);
  if(r.status==='CONFLICT_REQUIRES_DECISION')return 'CONFLICT: '+r.conflicts.map(c=>c.id).join(',');
  if(r.missing.length)return 'MISSING_CORE: '+r.missing.join(',');
  if(r.pending.length)return 'PENDING_CONFIRMATION: '+r.pending.join(',');
  if(r.hard.length)return 'MANDATORY_UNSUPPORTED: '+r.hard.join(',');
  return null;
}
export function generate(sc,counts,keep=4){
  const land={width:sc.land.width,length:sc.land.length,entries:sc.land.entries,streets:sc.land.streets};
  const t0=Date.now();
  try{const out=generateVillaDesigns({land,counts,requirements:{},keep});
    const designs=out.designs||[];
    const checks=designs.map(d=>{const cd=checkDoc(d.doc);const qs=quality(d.doc);return {errors:cd.problems?.length??null,issues:qs.issues??qs,rejected:!!qs.reject}});
    return {ok:true,ms:Date.now()-t0,alternatives:designs.length,checks};
  }catch(e){return {ok:false,ms:Date.now()-t0,reason:String(e.message||e)}}
}
export function runScenario(sc){
  const it=interview(sc,'standard');
  const full=interview(sc,'full');
  const counts=countsFrom(it.brief);
  const baselineCounts={bedrooms:counts.bedrooms,majlis:0,baths:1,kitchens:1,halls:1,dining:1};
  const support=C.factSupport(it.brief);
  const contract={schemaVersion:it.brief.schemaVersion,readiness:C.readiness(it.brief).status,support:support.reduce((a,r)=>(a[r.support]=(a[r.support]||0)+1,a),{}),
    unmappedRequested:support.filter(r=>r.support==='unmapped'&&r.importance!=='flexible').map(r=>r.id)};
  const gate=generationGate(it.brief);
  const keep=it.brief.facts['budget.count']?.value??4;
  const after=gate?{ok:false,blocked:gate}:generate(sc,counts,keep);
  return {id:sc.id,name:sc.name,land:sc.land,asked:it.asked.length,askedFull:full.asked.length,excludedCount:it.excluded.length,expect:sc.expect||null,contract,counts,keep,
    after,before:generate(sc,baselineCounts,4),baselineCounts};
}
