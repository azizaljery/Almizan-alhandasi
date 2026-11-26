import test from 'node:test';import assert from 'node:assert/strict';
import {architectInterview,recordArchitectAnswer} from '../dist/architect/interview.mjs';
import {SharaSession} from '../dist/home-flow.mjs';
const land={width:20,length:30,streets:['s','e'],entries:['s','e'],floors:2};
const start=text=>{const s=new SharaSession({land,interview:'adaptive'});s.start();s.answer('mode','free');s.answer('free',text);return s;};
test('childless family does not receive ages/sharing questions; children and resident mother do',()=>{
 const a=architectInterview({texts:['انا وزوجتي بدون اطفال'],land}),b=architectInterview({texts:['عندنا 3 اطفال وامي تسكن معنا'],land});
 assert.ok(!a.questions.some(q=>/^a_child|a_room_sharing|a_mobility/.test(q.id)));
 for(const id of ['a_child_ages','a_room_sharing','a_mobility'])assert.ok(b.questions.some(q=>q.id===id),id);
 assert.ok(b.questions.every(q=>q.reason.startsWith('أسأل لأن')&&q.affects.length));
});
test('visiting parents do not create a permanent-residence or mobility requirement',()=>{
 const a=architectInterview({texts:['انا وزوجتي بدون اطفال','امي تزورنا زيارة فقط'],land});
 assert.equal(a.facts.parents.value,'visiting');assert.equal(a.contract.parentsResident,false);assert.ok(!a.questions.some(q=>q.id==='a_mobility'));
 const s=start('انا وزوجتي بدون اطفال وامي تزورنا زيارة فقط');assert.ok(!s.program().some(r=>r.id==='elderly_room'));assert.notEqual(s.requirements.prefs.elderlyRoom,true);assert.equal(s.counts.majlis,1,'«زيارة فقط» does not delete the hospitality program');
});
test('city/site information changes relevant choices without inventing neighbours or acoustic facts',()=>{
 const a=architectInterview({texts:['بدون اطفال'],land:{...land,streets:['n'],entries:['n']}}),b=architectInterview({texts:['بدون اطفال'],land});
 assert.ok(!a.questions.some(q=>q.id==='a_guest_street'));assert.ok(b.questions.some(q=>q.id==='a_guest_street'));
 assert.deepEqual(a.questions.find(q=>q.id==='a_site_noise').options.map(o=>o.id),['n','none','unknown']);
 assert.equal(a.contract.quietSide,null);
 const coastal=architectInterview({land:{...land,geo:{city:'jeddah'}}}),hills=architectInterview({land:{...land,geo:{city:'abha'}}});
 assert.ok(coastal.questions.some(q=>q.id==='a_coastal_site'));assert.ok(!coastal.questions.some(q=>q.id==='a_sloped_site'));
 assert.ok(hills.questions.some(q=>q.id==='a_sloped_site'));assert.equal(coastal.contract.coastalExposure,null,'city does not automatically mean exposed');
});
test('adaptive session answers survive reload, do not repeat, and a changed plot invalidates site answers',()=>{
 const s=start('انا وزوجتي بدون اطفال');s.answer('a_parents','none');s.answer('a_entries','separate');s.answer('a_dining','separate');s.answer('a_guest_street','s');s.answer('a_site_noise','e');
 const restored=SharaSession.restore(s.toJSON());assert.equal(restored.interview,'adaptive');assert.equal(restored.requirements.architect.quietSide,'e');
 assert.ok(!restored.brief.questions.some(q=>q.id==='a_site_noise'));
 restored.setLand({...land,streets:['n'],entries:['n']});assert.ok(restored.brief.questions.some(q=>q.id==='a_site_noise'));assert.equal(restored.requirements.architect.quietSide,null);
});
test('free text is retained but does not pretend to resolve an unparsed structured decision',()=>{
 const q=architectInterview({land}).questions[0],a=recordArchitectAnswer(q,{text:'لم اقرر بعد'});
 assert.equal(a.resolved,false);assert.ok(architectInterview({land,answers:{[q.id]:a}}).questions.some(x=>x.id===q.id));
 assert.throws(()=>recordArchitectAnswer(q,{picks:['injected-choice']}));
});
test('new explicit child information opens child questions after a childless answer',()=>{
 const s=start('انا وزوجتي بدون اطفال');s.answer('more','الان عندنا طفلين صغار');
 assert.equal(s.architect.facts.children.value,true);assert.ok(s.brief.questions.some(q=>q.id==='a_room_sharing'));
});
test('individual children’s rooms change the real counts rather than only question wording',()=>{
 const s=start('عندنا 4 اطفال صغار');const before=s.counts.bedrooms;s.answer('a_room_sharing','individual');
 assert.ok(s.counts.bedrooms>before);assert.ok(s.program().some(r=>/طلبتَ غرفة مستقلة/.test(r.reason)));
});
test('guided web session now branches immediately and preserves the legacy saved-session contract',()=>{
 const s=new SharaSession({land,interview:'adaptive'});s.start();const out=s.answer('mode','guided');assert.equal(out.find(m=>m.kind==='ask').id,'a_household');
 assert.equal(s.answer('a_household','couple').find(m=>m.kind==='ask').id,'a_parents');
 const old=new SharaSession({land});old.start();assert.equal(old.answer('mode','guided').find(m=>m.kind==='ask').id,'g_family');
});
