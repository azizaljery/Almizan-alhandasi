import { SharaSession as LegacySession } from '../home-flow.mjs';
import { defaultRooms } from '../planner.mjs';
import { createBrief,restoreBrief,reviseLand,answer,bank,questionById,nextQuestion,readiness,acknowledge,defer,gateMatches,validate,removeAnswer,rejectProposals,recordIntake,recordIdea } from './core.mjs';
import { projectToProduction } from './native-bridge.mjs';
import { proposeFromText } from './intake.mjs';
import { architecturalIdeas } from './ideas.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
export class AdaptiveSharaSession extends LegacySession{
 constructor(options={}){super(options);this.adaptive=null;this.proposals=[];this.focusQuestion=null;this.depth='standard';}
 start(){const messages=super.start();const choice=messages.find(m=>m.id==='mode');if(choice)choice.options.unshift({id:'adaptive',label:'مقابلة معمارية متكيفة — شرعاء V3'});return messages;}
 #sync(){const p=projectToProduction(this.adaptive);this.projection=p;this.counts=p.counts;this.requirements=p.requirements;this.brief=p.brief;this.idea=p.idea;return p;}
 #packet(){
  this.#sync();let question=this.focusQuestion?questionById(this.focusQuestion):null;
  if(question&&!gateMatches(question.gate,this.adaptive))question=null;
  if(!question)question=nextQuestion(this.adaptive,{depth:this.depth});
  const r=readiness(this.adaptive);
  const rejected=new Set(this.adaptive.history.filter(e=>e.kind==='decline_idea').map(e=>e.key));
  return[{kind:'adaptive',id:'v3',depth:this.depth,text:'شرعاء V3 — مقابلة تتبع احتياجاتك',question:question?clone(question):null,brief:clone(this.adaptive),readiness:{...r,canGenerate:r.canGenerate&&!this.proposals.length},proposals:clone(this.proposals),ideas:architecturalIdeas(this.adaptive).filter(i=>!rejected.has(i.key)),projection:{program:this.projection.brief.program,environment:this.projection.environment,ledger:this.projection.ledger,requestedCounts:this.projection.requestedCounts},canSkip:question?.kind!=='conflict'&&question?.tier!==1&&this.adaptive.facts[question?.id]?.priority!=='mandatory'}];
 }
 answer(id,value){
  if(id==='mode'&&value==='adaptive'){this.mode='adaptive';this.phase='adaptive';this.texts=['مقابلة معمارية متكيفة'];this.adaptive=createBrief(this.land);this.proposals=[];return this.#packet();}
  if(this.mode!=='adaptive')return super.answer(id,value);
  if(id==='v3.depth'){if(!['core','standard','full'].includes(value))throw Error('عمق مقابلة غير معروف.');this.depth=value;this.focusQuestion=null;
  }else if(id==='v3.answer'){
   const q=questionById(value?.id);if(!q)throw Error('سؤال غير معروف.');
   this.adaptive=answer(this.adaptive,q.id,value.value,{priority:value.priority||q.defaultPriority,evidence:value.evidence||q.text,revise:!!this.adaptive.facts[q.id]});this.proposals=this.proposals.filter(p=>p.id!==q.id);this.focusQuestion=null;
  }else if(id==='v3.focus'){
   const q=questionById(value);if(!q||!gateMatches(q.gate,this.adaptive))throw Error('السؤال لا ينطبق على الطلب الحالي.');this.focusQuestion=q.id;
  }else if(id==='v3.defer'){this.adaptive=defer(this.adaptive,value);this.focusQuestion=null;
  }else if(id==='v3.acknowledge'){this.adaptive=acknowledge(this.adaptive,value);
  }else if(id==='v3.free'){
   const text=String(value||'').trim();if(text.length<3)throw Error('اكتب وصفًا قصيرًا على الأقل.');
   const proposed=proposeFromText(text);this.adaptive=recordIntake(this.adaptive,text);this.texts.push(text.slice(0,4000));
   const merged=new Map(this.proposals.map(p=>[p.id,p]));
   for(const p of proposed){const old=merged.get(p.id);if(old&&p.id==='budget.nonnegotiable'&&old.value!==p.value){merged.set(p.id,{...p,value:old.value+'؛ '+p.value,evidence:(old.evidence+'\n'+p.evidence).slice(0,4000),priority:old.priority==='mandatory'||p.priority==='mandatory'?'mandatory':'preferred'});}else merged.set(p.id,{...p,...(old?.priority==='mandatory'?{priority:'mandatory'}:{})});}
   this.proposals=[...merged.values()];
   if(!this.proposals.length)throw Error('لم أستخرج قرارًا واضحًا. اختر السؤال المناسب أو اذكر العدد والمتطلب مباشرة.');
  }else if(id==='v3.confirm'){
   const ids=value==='all'?this.proposals.map(p=>p.id):[value];let remaining=[...this.proposals],candidate=this.adaptive;
   if(remaining.some(p=>ids.includes(p.id)&&!validate(questionById(p.id),p.value)))throw Error('إحدى القيم المقترحة خارج المدى المتاح؛ عدّلها أو استبعدها أولًا.');
   // Apply prerequisites in bank order. An inapplicable proposal stays visible.
   for(const q of bank){const p=remaining.find(p=>p.id===q.id&&ids.includes(p.id));if(!p||!gateMatches(q.gate,candidate))continue;
    candidate=answer(candidate,p.id,p.value,{source:'client_confirmed',priority:p.priority||q.defaultPriority,evidence:p.evidence,revise:true});remaining=remaining.filter(x=>x.id!==p.id);
   }this.adaptive=candidate;this.proposals=remaining;this.focusQuestion=null;
  }else if(id==='v3.reject'){const ids=value==='all'?this.proposals.map(p=>p.id):[value];this.adaptive=rejectProposals(this.adaptive,ids);this.proposals=value==='all'?[]:this.proposals.filter(p=>p.id!==value);
  }else if(id==='v3.remove'){this.adaptive=removeAnswer(this.adaptive,value);this.focusQuestion=null;
  }else if(id==='v3.idea'||id==='v3.declineIdea'){
   const idea=architecturalIdeas(this.adaptive).find(i=>i.id===value);if(!idea)throw Error('تغيّر سياق الاقتراح؛ راجعه من جديد.');
   let candidate=this.adaptive;if(id==='v3.idea')for(const action of idea.actions)candidate=answer(candidate,action.id,action.value,{source:'client_confirmed',priority:'preferred',evidence:idea.reason});this.adaptive=recordIdea(candidate,id==='v3.idea'?'accept_idea':'decline_idea',idea);
  }else if(id==='program'){
   const q=questionById(String(value?.id||'').replace(/^v3:/,''));if(!q)throw Error('استخدم تعديل الإجابة من ملخص شرعاء.');
   const old=this.adaptive.facts[q.id]?.value,current=typeof old==='boolean'?Number(old):old||0;
   let want=value.op==='inc'?current+1:value.op==='dec'?current-1:value.op==='remove'?0:Number(value.count);
   if(q.type==='b')want=want>0;this.adaptive=answer(this.adaptive,q.id,want,{priority:this.adaptive.facts[q.id]?.priority||q.defaultPriority,revise:true,evidence:'تعديل البرنامج المعماري'});
  }else throw Error('خطوة غير معروفة في المقابلة المتكيفة.');
  return this.#packet();
 }
 setLand(land){if(!this.adaptive)return super.setLand(land);this.land=land;this.adaptive=reviseLand(this.adaptive,land);this.focusQuestion=null;this.#sync();}
 discovery(){return this.adaptive?this.projection.discovery:super.discovery();}
 rooms(){return this.adaptive?defaultRooms(this.counts):super.rooms();}
 resume(){return this.adaptive?this.#packet():super.resume();}
 toJSON(){return{...super.toJSON(),...(this.adaptive?{mode:'adaptive',phase:'adaptive',adaptive:clone(this.adaptive),proposals:clone(this.proposals),focusQuestion:this.focusQuestion,depth:this.depth}:{} )};}
 static restore(data,{land=null}={}){
  if(!data?.adaptive){const legacy=LegacySession.restore(data,{land});if(!legacy)return null;const session=new AdaptiveSharaSession({land:legacy.land});Object.assign(session,legacy);return session;}
  try{
   const session=new AdaptiveSharaSession({land:land||data.adaptive.land});session.adaptive=restoreBrief(data.adaptive);
   if(land)session.adaptive=reviseLand(session.adaptive,land);
   session.mode='adaptive';session.phase='adaptive';session.texts=Array.isArray(data.texts)?data.texts.filter(t=>typeof t==='string').slice(-80):['مقابلة معمارية متكيفة'];
   if(!session.texts.length)session.texts=['مقابلة معمارية متكيفة'];
   session.proposals=Array.isArray(data.proposals)?data.proposals.filter(p=>questionById(p?.id)&&typeof p.evidence==='string').slice(0,146):[];
   session.focusQuestion=questionById(data.focusQuestion)?.id||null;session.depth=['core','standard','full'].includes(data.depth)?data.depth:'standard';session.#sync();return session;
  }catch{return null;}
 }
 generationReady(){return this.adaptive?readiness(this.adaptive).canGenerate&&!this.proposals.length:true;}
}
