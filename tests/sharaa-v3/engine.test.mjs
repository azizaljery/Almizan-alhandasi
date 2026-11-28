import test from 'node:test';
import assert from 'node:assert/strict';
import {bank,siteFacts,gateMatches,createBrief,answer,nextQuestion,readiness,projectNative,siteFacts as sf} from '../../dist/sharaa-v3/core.mjs';
import {depthOf,askable} from '../../dist/sharaa-v3/policy.mjs';
import {previewProjection} from '../../dist/sharaa-v3/native-bridge.mjs';

const LAND={widthM:18,depthM:30,entries:['n'],streets:[{side:'n'}],floors:1};
const PROFILES={
 smallNoKids:{'household.adults':2,'household.children':0,'household.parents':'none','household.overnight':false,'household.bedrooms':3,'hospitality.men':false,'hospitality.women':false,'services.kitchens':1,'living.count':1,'living.diningCount':1,'living.baths':2,'site.parking':1,'budget.count':1},
 bigFamilyKids:{'household.adults':2,'household.children':4,'household.parents':'permanent','household.overnight':true,'household.bedrooms':5,'hospitality.men':true,'hospitality.women':true,'services.kitchens':2,'living.count':2,'living.diningCount':1,'living.baths':6,'children.ages':'mixed','children.play':true,'parents.independent':true,'hospitality.dining':'separate','hospitality.majlisDining':'direct_access','site.parking':3,'budget.count':2},
};
function run(profile,depth='standard',land=LAND){
  let b=createBrief(land);const asked=[];
  for(let i=0;i<200;i++){
    const q=nextQuestion(b,{depth});
    if(!q)break;
    if(q.kind==='conflict'){b=answer(b,q.fields[0],profile[q.fields[0]]??0,{revise:true});continue}
    asked.push(q.id);
    b=answer(b,q.id,valueFor(q,profile));
  }
  return {asked,brief:b};
}
const ids=new Set(bank.map(q=>q.id));
function valueFor(q,profile){
  if(profile[q.id]!==undefined)return profile[q.id];
  if(q.type==='b')return false; if(q.type==='n')return 1; if(q.type==='t')return 'لا'; if(q.type==='decimal')return 3;
  return q.type.split('|')[0];
}
const siteKeys=new Set(Object.keys(siteFacts(LAND)));

test('bank: 148 unique ids, unique texts, every consumer set', () => {
  assert.equal(new Set(bank.map(q=>q.text)).size,bank.length);
  assert.ok(bank.every(q=>q.consumer));
});
test('bank: every gate key is a known fact or site key', () => {
  for(const q of bank){ if(!q.gate)continue;
    for(const term of q.gate.split(/[;&]/)){ const key=term.match(/^([^=>]+)[=>]/)[1];
      assert.ok(key.startsWith('@')?siteKeys.has(key):ids.has(key),`${q.id} gate uses unknown ${key}`) } }
});
test('future.elevator needs both multi-storey AND expansion', () => {
  const q=bank.find(x=>x.id==='future.elevator');
  assert.equal(gateMatches(q.gate,{land:{...LAND,floors:2},facts:{'future.expand':{value:true,verification:'confirmed'}}}),true);
  assert.equal(gateMatches(q.gate,{land:LAND,facts:{'future.expand':{value:true,verification:'confirmed'}}}),false);
  assert.equal(gateMatches(q.gate,{land:{...LAND,floors:2},facts:{}}),false);
});
test('majlis bath asked only when men majlis is confirmed', () => {
  const q=bank.find(x=>x.id==='hospitality.majlisBath');
  let b=answer(createBrief(LAND),'hospitality.men',false);
  assert.equal(gateMatches(q.gate,b),false);
  b=answer(b,'hospitality.men',true,{revise:true});
  assert.equal(gateMatches(q.gate,b),true);
});
test('qibla question only under prayer confirmation', () => {
  const q=bank.find(x=>x.id==='daily.qibla');
  let b=answer(createBrief(LAND),'daily.prayer',false);
  assert.equal(gateMatches(q.gate,b),false);
  assert.equal(gateMatches(q.gate,answer(b,'daily.prayer',true,{revise:true})),true);
});
test('depth: standard never asks detail or optional; full asks them', () => {
  const std=run(PROFILES.bigFamilyKids,'standard').asked, full=run(PROFILES.bigFamilyKids,'full').asked;
  assert.ok(std.every(id=>askable(bank.find(q=>q.id===id),'standard')));
  assert.ok(full.some(id=>depthOf(bank.find(q=>q.id===id))==='optional'));
  assert.ok(std.length<full.length);
});
test('depth: invalid depth rejected', () => {
  assert.throws(()=>askable(bank[0],'bogus'));
});
test('profiles differ: small household asks no child/parent/guest questions', () => {
  const a=run(PROFILES.smallNoKids).asked;
  assert.ok(!a.some(id=>id.startsWith('children.')||id.startsWith('parents.')));
  assert.ok(!a.some(id=>id.startsWith('hospitality.')&&!['hospitality.men','hospitality.women'].includes(id)));
  assert.ok(a.length<50, `asked ${a.length}`);
});
test('profiles differ: large family asks children, parents and hospitality sets', () => {
  const a=run(PROFILES.bigFamilyKids).asked;
  assert.ok(a.some(id=>id.startsWith('children.')));
  assert.ok(a.some(id=>id.startsWith('parents.')));
  assert.ok(a.some(id=>id==='hospitality.majlisBath'));
  assert.ok(a.length>run(PROFILES.smallNoKids).asked.length);
});
test('every asked question is applicable at the moment it was asked', () => {
  let b=createBrief(LAND);
  for(let i=0;i<200;i++){const q=nextQuestion(b,{depth:'full'});if(!q)break;
    if(q.kind==='conflict'){b=answer(b,q.fields[0],0,{revise:true});continue}
    assert.ok(gateMatches(q.gate,b),q.id);
    b=answer(b,q.id,valueFor(q,PROFILES.bigFamilyKids));
  }
});
test('mandatory unsupported requirement is withheld, listed as hard, never silently dropped', () => {
  let b=answer(createBrief(LAND),'privacy.entrySight',true,{priority:'mandatory',source:'client_confirmed'});
  const r=readiness(b);
  assert.ok(r.hard.includes('privacy.entrySight'));
  const p=previewProjection(b);
  assert.ok(p.withheld.includes('privacy.entrySight'));
  assert.ok(!p.sent.includes('privacy.entrySight'));
  assert.equal(r.canGenerate,false);
});
import {factSupport} from '../../dist/sharaa-v3/core.mjs';
test('factSupport: every fact appears with a status; mandatory unmapped is never dropped', () => {
  let b=answer(createBrief(LAND),'privacy.entrySight',true,{priority:'mandatory',source:'client_confirmed'});
  b=answer(b,'household.children',2,{source:'client_confirmed'});
  const rows=factSupport(b);
  const ids=rows.map(r=>r.id);
  assert.ok(ids.includes('privacy.entrySight')&&ids.includes('household.children'));
  const pe=rows.find(r=>r.id==='privacy.entrySight');
  assert.equal(pe.mandatory,true);
  assert.notEqual(pe.support,'candidate');
  assert.equal(rows.find(r=>r.id==='household.children').support,'context','demographics guide questions without pretending to be generated space');
  assert.ok(rows.every(r=>['candidate','context','unmapped','unconfirmed','not_applicable'].includes(r.support)&&r.consumer));
});
test('factSupport: unconfirmed AI inference is reported, not treated as supported', () => {
  const b=answer(createBrief(LAND),'household.children',2,{source:'ai_inference'});
  const r=factSupport(b).find(x=>x.id==='household.children');
  assert.equal(r.support,'unconfirmed');
});
