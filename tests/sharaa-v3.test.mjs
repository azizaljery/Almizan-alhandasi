// Root entry is intentional: npm test and both CI glob commands discover V3.
import './sharaa-v3/core.test.mjs';
import './sharaa-v3/engine.test.mjs';
import './sharaa-v3/quality.test.mjs';
import './sharaa-v3/scenarios.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {bank,createBrief,answer,validate,gateMatches,questionById,readiness,nextQuestion,reviseLand,restoreBrief,acknowledge,defer,ingest,removeAnswer} from '../dist/sharaa-v3/core.mjs';
import {projectToProduction,previewProjection} from '../dist/sharaa-v3/native-bridge.mjs';
import {AdaptiveSharaSession} from '../dist/sharaa-v3/session.mjs';
import {proposeFromText} from '../dist/sharaa-v3/intake.mjs';
import {reviewV3,enforceV3Result} from '../dist/sharaa-v3/quality.mjs';
import {environmentalContext} from '../dist/sharaa-v3/context.mjs';
import {buildProgram} from '../dist/villa-layout.mjs';
import {generateInitialDesign} from '../dist/home-flow.mjs';
import {reviewDesign,planVersion} from '../dist/design-review.mjs';
import {architectVilla} from './fixtures/sharaa-v3-villa.mjs';
import {applyCommand} from '../dist/draw/doc.mjs';
import {redesign,createSession} from '../dist/design-session.mjs';
import {mergeRules,verifyRequest} from '../dist/rules.mjs';
import {v3RequestPriorityResolver} from '../dist/sharaa-v3/provenance.mjs';
import {architecturalIdeas} from '../dist/sharaa-v3/ideas.mjs';
import {validateV3Generation} from '../dist/sharaa-v3/quality.mjs';
const land={width:20,length:30,floors:1,streets:['n'],entries:['n']};
const essential={'household.adults':2,'household.children':0,'household.parents':'none','household.bedrooms':3,'hospitality.men':true,'hospitality.women':true,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':4};
function complete(values={},l=land){let b=createBrief(l);for(const [id,value]of Object.entries({...essential,...values}))b=answer(b,id,value,{priority:questionById(id).defaultPriority});return b;}
const set=(b,id,value,priority='preferred')=>answer(b,id,value,{priority,revise:true});
function applicable(q){
 let l={...land,floors:2,streets:['n','e','w']};
 if(q.gate.includes('@narrow'))l={...l,width:12,length:30};if(q.gate.includes('@wide'))l={...l,width:36,length:20};
 for(const [token,climate]of [['@dry','dry'],['@humid','humid'],['@mountain','mountain']])if(q.gate.includes(token))l.climate=climate;
 if(q.gate.includes('@irregular'))l.engineLand={polygon:[{x:0,y:0},{x:20,y:0},{x:18,y:30},{x:0,y:30}]};
 let b=createBrief(l);
 const ensure=target=>{if(!target.gate)return;for(const term of target.gate.split(';')[0].split('&')){const [,id,op,rhs]=/^([^=>]+)([=>])(.+)$/.exec(term);if(id.startsWith('@'))continue;const parent=questionById(id);ensure(parent);const first=rhs.split(',')[0],value=op==='>'?Number(first)+1:first==='true'?true:first==='false'?false:first;b=answer(b,id,value,{revise:true});}};
 ensure(q);assert.ok(gateMatches(q.gate,b),q.id+' fixture must satisfy its real gates');return b;
}
for(const q of bank)test('V3 actual answer contract and saved-state validation: '+q.id,()=>{
 const b=applicable(q),before=JSON.stringify(b),value=q.type==='b'?true:q.options.length?q.options[0].value:q.type==='t'?'اختيار العميل':q.type==='decimal'?3.2:q.min??0;
 assert.ok(validate(q,value));const next=answer(b,q.id,value);assert.equal(JSON.stringify(b),before,'answer must not mutate prior decisions');assert.equal(next.facts[q.id].value,value);
 assert.deepEqual(restoreBrief(next),next);assert.equal(validate(q,q.type==='t'?'':q.type==='b'?'true':q.options.length?'invalid-option':Infinity),false);
 if(q.type==='n'){assert.equal(validate(q,-1),false);assert.equal(validate(q,.5),false);assert.equal(validate(q,(q.max??100)+1),false);}
});
test('V3 production bridge imports; production streets and inherited city are preserved',()=>{
 const b=createBrief({...land,streets:['n','e'],geo:{city:'riyadh'}});assert.equal(b.land.city,'riyadh');assert.equal(gateMatches('@corner=true',b),true);assert.equal(gateMatches('@cityMissing=true',b),false);assert.equal(environmentalContext(b.land,b.facts).cityName,'الرياض');
 assert.equal(gateMatches('@corner=true',createBrief({...land,streets:['n','s']})),false);
 for(const value of [Infinity,NaN,0,-1,'20'])assert.throws(()=>createBrief({...land,width:value}));
});
test('V3 supported mandatory room totals generate readiness without demographic waivers',()=>{
 const b=complete();const r=readiness(b);assert.equal(r.canGenerate,true);assert.deepEqual(r.limits,[]);assert.equal(r.status,'READY_TO_GENERATE');
 const native=previewProjection(b);assert.equal(native.canApply,true);assert.equal(native.engineInput.counts.bedrooms,3);
});
test('V3 children and parents alter the next question; absent family branches do not appear',()=>{
 let couple=complete();assert.equal(bank.filter(q=>q.domain==='children'||q.domain==='parents').some(q=>gateMatches(q.gate,couple)),false);
 const family=set(couple,'household.children',2);assert.equal(nextQuestion(family).id,'children.ages');
 const parents=set(couple,'household.parents','permanent');assert.equal(nextQuestion(parents).id,'parents.ground');
 const young=set(family,'children.ages','young'),teens=set(family,'children.ages','teen');
 assert.equal(gateMatches(questionById('children.play').gate,young),true);assert.equal(gateMatches(questionById('children.play').gate,teens),false);
 assert.equal(gateMatches(questionById('children.study').gate,teens),true);
});
test('V3 family correction removes dormant hard preferences from readiness AND engine input',()=>{
 let b=complete({'household.parents':'permanent'});b=set(b,'parents.ground',true,'mandatory');assert.equal(projectToProduction(b).requirements.prefs.elderlyRoom,true);
 b=set(b,'household.parents','none');assert.equal(readiness(b).pending.includes('parents.ground'),false);assert.equal(readiness(b).canGenerate,true);assert.equal(projectToProduction(b).requirements.prefs.elderlyRoom,undefined);
});
test('V3 revision rebuilds current numbers and false preferences instead of appending old text',()=>{
 let b=complete();b=set(b,'household.bedrooms',4,'mandatory');b=set(b,'services.kitchenStyle','closed');assert.equal(projectToProduction(b).requirements.prefs.openKitchen,false);
 b=set(b,'services.kitchenStyle','open_to_hall');let p=projectToProduction(b);assert.equal(p.counts.bedrooms,4);assert.equal(p.requirements.prefs.openKitchen,false);assert.equal(p.requirements.prefs.kitchenOpenHall,true);
 b=set(b,'services.kitchenStyle','closed');p=projectToProduction(b);assert.equal(p.requirements.prefs.openKitchen,false);assert.equal(p.requirements.prefs.kitchenOpenHall,false);
});
test('V3 guest, parent and prep rooms are allocated inside stated totals in actual buildProgram',()=>{
 let b=complete({'household.parents':'permanent','household.bedrooms':4,'services.kitchens':2});
 b=set(b,'household.overnight',true);b=set(b,'household.guestBedroom',true);b=set(b,'parents.ground',true);b=set(b,'services.prep',true);
 const p=projectToProduction(b),program=buildProgram(p.counts,p.requirements);
 assert.equal(p.requestedCounts.bedrooms,4);assert.equal(p.counts.bedrooms,3);assert.equal(program.blocks.filter(x=>x.kind==='suite').length,4);
 assert.equal(program.blocks.filter(x=>x.kind==='kitchen').length,2);assert.equal(program.blocks.filter(x=>x.elderly).length,1);
});
test('V3 land changes invalidate site decisions transitively without deleting family decisions',()=>{
 let b=complete({'household.children':2});b=set(b,'site.neighbor',true);b=set(b,'privacy.windows',true);b=set(b,'environment.climate','dry');
 b=reviseLand(b,{...land,streets:['n','w'],geo:{city:'jeddah'}});assert.equal(b.facts['privacy.windows'].recheck,true);assert.equal(b.facts['household.children'].recheck,undefined);
 b=set(b,'site.neighbor',true);assert.equal(b.facts['privacy.windows'].recheck,true);assert.equal(gateMatches('@west=true',b),true);
});
test('V3 city and climate answers do not invalidate themselves or each other; city reaches the native land',()=>{
 let b=complete();b=set(b,'site.city','الرياض');b=set(b,'environment.climate','dry');
 assert.equal(b.facts['site.city'].recheck,undefined);assert.equal(gateMatches('@dry=true',b),true);assert.equal(gateMatches(questionById('site.city').gate,b),true);
 const p=projectToProduction(b);assert.equal(p.land.geo.city,'riyadh');assert.equal(p.land.geo.source,'city');
 b=set(b,'site.city','جدة');assert.equal(b.facts['environment.climate'].recheck,true);assert.equal(gateMatches('@dry=true',b),false);
});
test('V3 unsupported mandatory constraints cannot be waived, while preferred limitations require a recorded decision',()=>{
 let b=set(complete(),'site.vestibule',true,'mandatory');assert.equal(readiness(b).canGenerate,false);assert.throws(()=>acknowledge(b,['site.vestibule']));
 b=set(b,'site.vestibule',true,'preferred');assert.equal(readiness(b).canGenerate,false);b=acknowledge(b,['site.vestibule']);assert.equal(readiness(b).canGenerate,true);assert.equal(b.history.at(-1).kind,'accept_limitations');
 b=set(b,'living.count',2,'mandatory');assert.equal(readiness(b).canGenerate,false,'an old waiver cannot silently carry across a new plan request');
 b=removeAnswer(b,'site.vestibule');assert.equal(b.history.at(-1).kind,'remove_answer');assert.equal(readiness(b).canGenerate,true);
});
test('V3 inference is withheld from the native contract and cannot replace a confirmed value',()=>{
 const b=complete(),n=ingest(b,[{id:'services.kitchenStyle',value:'open',priority:'mandatory'}]).brief;
 assert.equal(n.facts['services.kitchenStyle'].verification,'needs_confirmation');assert.equal(n.facts['services.kitchenStyle'].priority,'preferred');assert.equal(projectToProduction(n).requirements.prefs.openKitchen,undefined);
 assert.equal(ingest(b,[{id:'household.bedrooms',value:9}]).rejected.length,1);
});
test('V3 kitchen, dining and ensuite contradictions require explicit corrections',()=>{
 let b=set(complete(),'services.prep',true);assert.equal(nextQuestion(b).kind,'conflict');b=set(b,'services.kitchens',2,'mandatory');assert.notEqual(nextQuestion(b).kind,'conflict');
 b=set(b,'hospitality.dining','separate');b=set(b,'living.diningCount',0,'mandatory');assert.equal(nextQuestion(b).id,'dining-count');
});
test('V3 actual doorway, not shared wall, proves a direct men/dining door',()=>{
 let b=complete({'household.bedrooms':1,'living.baths':1});b=set(b,'hospitality.dining','separate');b=set(b,'hospitality.majlisDining','direct_access','mandatory');
 const good=reviewV3(architectVilla().doc,b),bad=reviewV3(architectVilla({diningDoor:false}).doc,b);
 assert.equal(good.checks.find(x=>x.id==='hospitality.majlisDining').state,'verified');assert.equal(bad.checks.find(x=>x.id==='hospitality.majlisDining').state,'violated');
 assert.ok(good.checks.find(x=>x.id==='hospitality.majlisDining').evidence.openingIds.length);
});
test('V3 measured hall shape rejects the long strip despite good styling or other scores',()=>{
 const b=set(complete(),'living.shape','balanced','mandatory');
 assert.equal(reviewV3(architectVilla().doc,b).checks.find(c=>c.id==='living.shape').state,'verified');
 assert.equal(reviewV3(architectVilla({longHall:true}).doc,b).checks.find(c=>c.id==='living.shape').state,'violated');
});
test('V3 independent entry proof fails when the second external entrance is missing',()=>{
 const b=set(complete(),'hospitality.maleEntry',true,'mandatory');
 assert.equal(reviewV3(architectVilla().doc,b).checks.find(c=>c.id==='hospitality.maleEntry').state,'verified');
 assert.equal(reviewV3(architectVilla({femaleEntry:false}).doc,b).checks.find(c=>c.id==='hospitality.maleEntry').state,'violated');
});
test('V3 review follows edits and binds to the current review version without changing Aziz or Mizan Score',()=>{
 let b=complete({'household.bedrooms':1,'living.baths':1});b=set(b,'hospitality.dining','separate');b=set(b,'hospitality.majlisDining','direct_access','mandatory');const p=projectToProduction(b),fixture=architectVilla();
 const ctx={requirements:p.requirements,land};let report=reviewDesign(fixture.doc,ctx);assert.equal(report.findings.find(f=>f.id==='sharaa-v3:hospitality.majlisDining').state,'verified');
 const door=fixture.doc.openings.find(o=>!o.entry&&o.wall===fixture.walls.men[1]);const edited=applyCommand(fixture.doc,{type:'delete',ids:[door.id]}).doc;
 report=reviewDesign(edited,ctx);assert.equal(report.findings.find(f=>f.id==='sharaa-v3:hospitality.majlisDining').state,'violated');assert.notEqual(planVersion(fixture.doc,ctx).planVersion,planVersion(edited,ctx).planVersion);
});
test('V3 preserves an existing confirmed native program until replacement is explicitly allowed',()=>{
 const b=complete(),old={counts:{bedrooms:5}};const p=previewProjection(b,old);assert.equal(p.canApply,false);assert.equal(p.migrationConflicts[0].before,5);assert.equal(previewProjection(b,old,{allowOverride:true}).canApply,true);assert.deepEqual(old,{counts:{bedrooms:5}});
});
test('V3 interview saves, restores, corrects and retains the old free/guided modes',()=>{
 const s=new AdaptiveSharaSession({land});assert.deepEqual(s.start().find(m=>m.id==='mode').options.map(x=>x.id),['adaptive','free','guided']);s.answer('mode','adaptive');
 for(const[id,value]of Object.entries(essential))s.answer('v3.answer',{id,value});assert.equal(s.generationReady(),true);
 s.answer('v3.free','أريد ٤ غرف نوم ومطبخ مغلق');assert.equal(s.counts.bedrooms,3);assert.equal(s.generationReady(),false);s.answer('v3.confirm','all');assert.equal(s.counts.bedrooms,4);
 const restored=AdaptiveSharaSession.restore(s.toJSON(),{land});assert.equal(restored.counts.bedrooms,4);assert.deepEqual(restored.adaptive,s.adaptive);
 const old=AdaptiveSharaSession.restore({v:1,mode:'free',phase:'ready',texts:['أريد 3 غرف نوم ومطبخ وصالة']},{land});assert.ok(old);assert.equal(old.adaptive,null);assert.equal(old.mode,'free');
});
test('V3 malformed saved or proposed answers cannot become confirmed generation facts',()=>{
 const b=complete();let bad=structuredClone(b);bad.facts['household.bedrooms'].value=1e9;assert.throws(()=>restoreBrief(bad));
 bad=structuredClone(b);bad.facts['household.bedrooms'].source='ai_inference';assert.throws(()=>restoreBrief(bad));
 const s=new AdaptiveSharaSession({land});s.answer('mode','adaptive');s.proposals=[{id:'household.adults',value:2,evidence:'two adults'},{id:'household.bedrooms',value:1e9,evidence:'invalid'}];const before=JSON.stringify(s.adaptive);assert.throws(()=>s.answer('v3.confirm','all'));assert.equal(JSON.stringify(s.adaptive),before);
});
test('V3 unclassified explicit hard wishes are surfaced rather than lost behind a parsed room count',()=>{
 const proposals=proposeFromText('لازم 3 غرف نوم وعازل للصوت');assert.ok(proposals.some(p=>p.id==='household.bedrooms'));assert.ok(proposals.some(p=>p.id==='budget.nonnegotiable'&&p.priority==='mandatory'));
});
test('V3 actual production generation and post-generation gate preserve requested bedroom totals', {timeout:120000},async()=>{
 const b=complete({'household.bedrooms':2,'hospitality.women':false,'living.baths':3}),p=projectToProduction(b);
 const output=await generateInitialDesign({land,counts:p.counts,requirements:p.requirements,discovery:p.discovery,idea:p.idea,keep:1});
 assert.equal(output.sharaaQuality.checks.find(c=>c.id==='household.bedrooms').state,'verified');assert.equal(output.sharaaQuality.eligible,true);assert.ok(output.doc.walls.length);
});
test('V3 pending hard wishes survive a later free-text addition until explicitly resolved',()=>{
 const s=new AdaptiveSharaSession({land});s.answer('mode','adaptive');s.answer('v3.free','لازم عزل صوتي');assert.ok(s.proposals.some(p=>p.id==='budget.nonnegotiable'&&p.priority==='mandatory'));
 s.answer('v3.free','أريد 3 غرف نوم');assert.ok(s.proposals.some(p=>p.id==='budget.nonnegotiable'&&p.priority==='mandatory'));
 s.answer('v3.answer',{id:'household.bedrooms',value:4});assert.equal(s.proposals.some(p=>p.id==='household.bedrooms'),false);assert.equal(s.adaptive.facts['household.bedrooms'].value,4);
 assert.ok(s.proposals.some(p=>p.id==='budget.nonnegotiable'));
});
test('V3 women-only reception is an actual native role and cannot be verified against a male-labelled room',()=>{
 const b=complete({'hospitality.men':false,'hospitality.women':true}),p=projectToProduction(b),program=buildProgram(p.counts,p.requirements);
 const rooms=program.blocks.filter(b=>b.kind==='majlis');assert.equal(rooms.length,1);assert.equal(rooms[0].women,true);assert.equal(rooms[0].men,false);assert.equal(rooms[0].name,'مجلس النساء');assert.equal(rooms[0].guestWc,true);
 const fixture=architectVilla().doc;const bad=reviewV3(fixture,b);assert.equal(bad.checks.find(c=>c.id==='hospitality.men').state,'violated');
});
test('V3 women-only production generation retains the requested semantic role', {timeout:120000},async()=>{
 const b=complete({'hospitality.men':false,'hospitality.women':true,'household.bedrooms':2,'living.baths':3}),p=projectToProduction(b);
 const out=await generateInitialDesign({land,counts:p.counts,requirements:p.requirements,discovery:p.discovery,idea:p.idea,keep:1});
 assert.ok(out.doc.labels.some(l=>l.type==='majlis'&&/نساء/.test(l.name)));assert.equal(out.doc.labels.some(l=>l.type==='majlis'&&/رجال/.test(l.name)),false);assert.equal(out.sharaaQuality.checks.find(c=>c.id==='hospitality.women').state,'verified');
});
test('V3 male hard role does not make an independently preferred missing female role mandatory',()=>{
 let b=complete();b=set(b,'hospitality.men',true,'mandatory');b=set(b,'hospitality.women',true,'preferred');
 const fixture=architectVilla(),doc=applyCommand(fixture.doc,{type:'update',id:fixture.ids.women,patch:{type:'office',name:'مكتب'}}).doc;
 const report=reviewV3(doc,b);assert.equal(report.checks.find(c=>c.id==='hospitality.men').state,'verified');assert.equal(report.checks.find(c=>c.id==='hospitality.women').state,'violated');assert.equal(report.checks.find(c=>c.id==='hospitality.women').priority,'preferred');
});
test('V3 independent entries are not presented as proof that all guest circulation avoids family areas',()=>{
 const b=set(complete(),'privacy.guestRoute',true,'mandatory');assert.equal(readiness(b).hard.includes('privacy.guestRoute'),true);
 const report=reviewV3(architectVilla().doc,b);assert.equal(report.checks.find(c=>c.id==='privacy.guestRoute').state,'unverified');
});
test('V3 hall-open kitchen clears the separate dining-open connection; styles use native fields',()=>{
 let b=set(complete(),'services.kitchenStyle','open_to_hall');b=set(b,'architecture.style','modern');const p=projectToProduction(b);
 assert.equal(p.requirements.prefs.openKitchen,false);assert.equal(p.requirements.prefs.kitchenOpenHall,true);assert.equal(p.requirements.prefs.style,'modern');assert.equal(p.requirements.prefs.styleWish,'حديث معاصر');assert.equal(p.requirements.prefs.tasteStyle,undefined);
 b=set(b,'architecture.style','traditional');assert.ok(readiness(b).limits.includes('architecture.style'));assert.equal(projectToProduction(b).requirements.prefs.style,undefined,'a regional tradition must not silently become Najdi');
});
test('V3 garden and parking requests carry actual native output parameters rather than an empty placeholder',()=>{
 let b=set(complete(),'garden.wanted',true);b=set(b,'site.parking',3);b=set(b,'site.parkingShade',true);
 const p=projectToProduction(b);assert.equal(p.requirements.prefs.outdoor.lawn,true);assert.equal(p.requirements.prefs.outdoor.carport,3);
 b=set(b,'garden.type','rear');assert.ok(readiness(b).limits.includes('garden.type'),'rear placement is not falsely claimed from a generic lawn');
});
test('V3 future elevator reservation is never silently converted into an installed elevator',()=>{
 let b=complete({}, {...land,floors:2});b=set(b,'future.expand',true);b=set(b,'future.elevator',true,'mandatory');const p=projectToProduction(b);assert.ok(readiness(b).hard.includes('future.elevator'));assert.equal(p.requirements.prefs.elevator,undefined);
});
test('V3 native spatial-rule provenance survives renumbering and keeps preferred requests soft',()=>{
 let b=set(complete(),'hospitality.dining','separate');b=set(b,'hospitality.majlisDining','near','preferred');const p=projectToProduction(b),req=structuredClone(p.requirements);req.rules=mergeRules([],req.rules);
 const rule=req.rules.find(r=>r.v3FactId==='hospitality.majlisDining');assert.ok(rule);assert.equal(v3RequestPriorityResolver(req)({id:rule.id}),'warning');
 req.rules[0].kind='far';assert.equal(v3RequestPriorityResolver(req)({id:rule.id}),null,'no severity downgrade after a native requirement diverges');
});
test('V3 preference priority does not alter unrelated municipal, geometry or legacy request severity',()=>{
 let b=set(complete(),'sleep.master',true);b=set(b,'sleep.dressing',true,'preferred');const p=projectToProduction(b),resolve=v3RequestPriorityResolver(p.requirements);
 assert.equal(resolve({id:'P-dress'}),'warning');assert.equal(resolve({id:'P-floors'}),null);assert.equal(resolve({id:'unknown'}),null);
 const report=reviewDesign(architectVilla().doc,{requirements:p.requirements,land});assert.equal(report.findings.find(f=>f.id==='request:P-dress').severity,'warning');assert.ok(report.findings.some(f=>f.source==='geometry'&&f.severity==='mandatory'));
});
test('V3 role names invalidate V3 review evidence while ordinary legacy renaming remains geometry-neutral',()=>{
 const b=complete(),p=projectToProduction(b),fixture=architectVilla(),renamed=applyCommand(fixture.doc,{type:'update',id:fixture.ids.men,patch:{name:'مجلس النساء'}}).doc;
 assert.notEqual(planVersion(fixture.doc,{requirements:p.requirements}).planVersion,planVersion(renamed,{requirements:p.requirements}).planVersion);
 assert.equal(planVersion(fixture.doc).planVersion,planVersion(renamed).planVersion);
});
test('V3 preflight rejects stale native room counts or land before entering the generator',()=>{
 const b=complete(),p=projectToProduction(b),args={land,counts:p.counts,requirements:p.requirements};assert.doesNotThrow(()=>validateV3Generation(args));
 assert.throws(()=>validateV3Generation({...args,counts:{...p.counts,bedrooms:9}}),e=>e.code==='SHARAA_V3_EDIT_REQUIRED');
 assert.throws(()=>validateV3Generation({...args,land:{...land,width:25}}),e=>e.code==='SHARAA_V3_LAND_CHANGED');
});
test('V3 post-generation count changes require confirmation in the authoritative interview',async()=>{
 const p=projectToProduction(complete()),s={input:{requirements:p.requirements}};
 await assert.rejects(()=>redesign(s,{text:'أريد 4 غرف نوم'}),e=>e.code==='SHARAA_V3_EDIT_REQUIRED');assert.equal(s.input.requirements.counts.bedrooms,3);
});
test('V3 architecture options depend on confirmed context and apply only after an explicit decision',()=>{
 const s=new AdaptiveSharaSession({land:{...land,width:12,length:30,floors:2}});s.answer('mode','adaptive');const before=JSON.stringify(s.adaptive.facts);const ideas=architecturalIdeas(s.adaptive);assert.ok(ideas.some(i=>i.id==='light-court'));assert.equal(JSON.stringify(s.adaptive.facts),before);
 s.answer('v3.idea','light-court');assert.equal(s.requirements.prefs.courtyard,true);assert.equal(s.adaptive.history.at(-1).kind,'accept_idea');assert.equal(s.adaptive.facts['architecture.concept'].source,'client_confirmed');
});
test('V3 mixed alternative requests and canonical preference divergence cannot bypass confirmation',async()=>{
 const p=projectToProduction(set(complete(),'services.kitchenStyle','closed')),s={input:{requirements:p.requirements}};
 for(const text of ['تصميم آخر والمطبخ مفتوح على الصالة','تصميم بديل مع عازل صوتي','ابي تصميم بديل و5 غرف نوم'])await assert.rejects(()=>redesign(s,{text}),e=>e.code==='SHARAA_V3_EDIT_REQUIRED');
 const changed=structuredClone(p.requirements);changed.prefs.kitchenOpenHall=true;
 assert.throws(()=>validateV3Generation({land,counts:p.counts,requirements:changed}),e=>e.code==='SHARAA_V3_EDIT_REQUIRED');
 changed.prefs=structuredClone(p.requirements.prefs);changed.rules.push({kind:'near',a:'kitchen',b:'hall'});
 assert.throws(()=>validateV3Generation({land,counts:p.counts,requirements:changed}),e=>e.code==='SHARAA_V3_EDIT_REQUIRED');
});
test('V3 alternate selection keeps the chosen geometry, evidence, fingerprint and metadata together',()=>{
 let b=complete({'household.bedrooms':1});b=set(b,'living.baths',1,'preferred');b=set(b,'living.shape','balanced','mandatory');const p=projectToProduction(b);
 const bad=architectVilla({longHall:true}).doc,good=architectVilla().doc;
 const score={unchanged:73},weights={unchanged:2};
 const source={doc:bad,selectedIndex:0,pat:'bad',ledger:[{id:'BAD'}],mirror:true,notes:['bad note'],summary:'bad',dna:{selectedIndex:0,rows:[score],weights,openingAware:{selected:0}},alternatives:[{doc:bad,index:0},{doc:good,index:1,pat:'good',mirror:false,summary:'good',strategy:'fixture-good',notes:['good note']}]};
 const output=enforceV3Result(source,p.requirements);
 assert.equal(output.selectedIndex,1);assert.equal(output.doc,good);assert.equal(output.pat,'good');assert.equal(output.mirror,false);assert.equal(output.summary,'good');assert.equal(output.strategy,'fixture-good');assert.ok(output.notes.includes('good note'));assert.ok(!output.notes.includes('bad note'));
 assert.deepEqual(output.ledger,verifyRequest(good,p.requirements,{entry:good.plot?.entry||'s'}));assert.deepEqual(output.dna.rows,[score]);assert.equal(output.dna.weights,weights);assert.equal(output.dna.openingAware,null);assert.equal(output.dna.selectedIndex,1);assert.equal(source.pat,'bad');
 const session=createSession({land,counts:p.counts,requirements:p.requirements,result:output});assert.equal(session.designs[0].pat,'good');assert.deepEqual(session.designs[0].ledger,output.ledger);
});
test('V3 pending hard priority survives rephrasing; negated obligation is not promoted automatically',()=>{
 const s=new AdaptiveSharaSession({land});s.answer('mode','adaptive');s.answer('v3.free','لازم مطبخ مغلق');s.answer('v3.free','مطبخ مفتوح على الصالة');assert.equal(s.proposals.find(p=>p.id==='services.kitchenStyle').priority,'mandatory');
 assert.ok(proposeFromText('مو لازم مطبخ مفتوح').every(p=>p.priority!=='mandatory'));
});
test('V3 interview depth restores without hiding an unresolved mandatory dependent question',()=>{
 const s=new AdaptiveSharaSession({land});s.answer('mode','adaptive');s.answer('v3.depth','full');const restored=AdaptiveSharaSession.restore(s.toJSON());assert.equal(restored.depth,'full');
 let b=complete({'household.children':2});b=set(b,'children.ages','teen');b=set(b,'children.sharedRooms',true,'mandatory');b=set(b,'household.children',3);
 assert.equal(nextQuestion(b,{depth:'core'}).id,'children.sharedRooms');assert.ok(readiness(b).pending.includes('children.sharedRooms'));
});
