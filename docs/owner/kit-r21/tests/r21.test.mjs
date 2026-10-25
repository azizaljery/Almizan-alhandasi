import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBrief, attachSharedBrief, sharedReviewRequest, diningRelation, parseRequestedCount,
  grossSpanFromClear, clearSpanFromGross, clearDimension, allocateSpans, commonWall,
  realDoorConnects, unsupportedUpperWallSegments, isSleepKey,
  hasGuestRoute, topologyGuestRoute, validatePlan, applySafeEdit,
  provenInfeasible, searchIncomplete, solved, explainToClient, lintClientText,
  selectDiverse, preliminaryDistance, generateR21
} from '../src/index.mjs';
const basePlan = () => ({ id: 'A', rooms: [
  { id: 'm', type: 'majlis', zone: 'guest', floor: 0, x: 0, y: 0, width: 5, height: 6, clear: {width: 5, length: 6} },
  { id: 'd', type: 'dining', zone: 'guest', floor: 0, x: 5, y: 0, width: 4, height: 6, clear: {width: 4, length: 6} },
  { id: 'k', type: 'kitchen', zone: 'service', floor: 0, x: 9, y: 0, width: 4, height: 5, clear: {width: 4, length: 5} },
  { id: 'f', type: 'hall', zone: 'family', floor: 0, x: 0, y: 6, width: 5, height: 5, clear: {width: 5, length: 5} }
], doors: [
  { from: 'm', to: 'd', kind: 'interior', width: 0.9, offset: 2 },
  { from: 'd', to: 'k', kind: 'interior', width: 0.9, offset: 2 }
] });
const brief = () => createBrief({ text: 'أريد ثلاثة تصاميم', rooms: [{type:'majlis'},{type:'dining'},{type:'kitchen'}],
  relations: diningRelation({ near: true, guestAccess: true }),
  dimensions: [{room:'majlis', width:5, length:6}, {room:'kitchen', width:4, length:5}] });

test('Arabic requested count, digits and words', () => {
  assert.equal(parseRequestedCount('أريد ٣ تصاميم').count, 3);
  assert.equal(parseRequestedCount('أريد ثلاثة تصاميم').count, 3);
  assert.equal(parseRequestedCount('خمسة بدائل').count, 5);
  assert.equal(parseRequestedCount('مخطط مناسب').count, 4);
});
test('shared brief is identical for generator and reviewer', () => {
  const req = attachSharedBrief({prefs:{quiet:true}}, {text:'أريد ٣ تصاميم'}, {relations:diningRelation({guestAccess:true})});
  const review = sharedReviewRequest(req, {}, {});
  assert.equal(review.brief, req.brief);
  assert.equal(req.want, 3);
  assert.equal(review.brief.relations.find(r=>r.kind==='NEAR').kind, 'NEAR');
});
test('NEAR never implicitly requires direct door', () => {
  const b = createBrief({relations:diningRelation({near:true, directDoor:false, guestAccess:false})});
  const p = basePlan(); p.doors = [];
  assert.equal(validatePlan(p,b).valid, true);
});
test('explicit dimension: both clear sides checked', () => {
  const p = basePlan(); p.rooms.find(r=>r.id==='k').clear.length = 4.9;
  assert.ok(validatePlan(p, brief()).hard.some(v=>v.id==='DIM_MISMATCH'));
});
test('5cm tolerance boundary accepted, 6cm rejected', () => {
  assert.equal(clearDimension(4.95,5,0.05).valid,true);
  assert.equal(clearDimension(4.94,5,0.05).valid,false);
});
test('gross span uses actual wall offsets, not 0.2', () => {
  assert.equal(grossSpanFromClear(5,0.12,0.25),5.37);
  assert.equal(clearSpanFromGross(5.37,0.12,0.25),5);
});
test('fixed dimensions allocated before flexible space', () => {
  const result = allocateSpans(12,[{id:'majlis',min:5,fixed:6},{id:'hall',min:3,weight:1}]);
  assert.equal(result.ok,true);
  assert.equal(result.parts[0].assigned,6);
  assert.equal(result.parts[1].assigned,6);
});
test('local dimension overflow is not global infeasibility proof', () => {
  const result = allocateSpans(8,[{id:'a',min:5,fixed:6},{id:'b',min:4}]);
  assert.equal(result.reason,'LOCAL_SPAN_OVERFLOW');
});
test('real shared wall and door clearance required', () => {
  const p = basePlan(), m=p.rooms[0], d=p.rooms[1];
  assert.equal(commonWall(m,d).length,6);
  assert.equal(realDoorConnects(m,d,p.doors[0]),true);
  assert.equal(realDoorConnects(m,d,{...p.doors[0],offset:5.5}),false);
});
test('private guest route accepts legitimate real doors', () => assert.equal(hasGuestRoute(basePlan(),'majlis','kitchen'),true));
test('guest route does not cross family zone', () => {
  const p = basePlan(); p.doors = [
    {from:'m',to:'f',kind:'interior',width:0.9,offset:2},
    {from:'f',to:'d',kind:'interior',width:0.9,offset:2} // not a shared wall, must be rejected
  ];
  assert.equal(hasGuestRoute(p,'majlis','dining'),false);
});
test('topology rejects adjacency too short for door', () => {
  const t = {nodes:[{id:'m',zone:'guest'},{id:'d',zone:'guest'}],
    edges:[{from:'m',to:'d',doorCapable:true,availableLength:0.5,requiredLength:1.1}]};
  assert.equal(topologyGuestRoute(t,'m','d'),false);
  t.edges[0].availableLength=1.2;
  assert.equal(topologyGuestRoute(t,'m','d'),true);
});
test('hard gate blocks missing real guest route', () => {
  const p=basePlan(); p.doors=[];
  assert.ok(validatePlan(p,brief()).hard.some(v=>v.id==='GUEST_ACCESS'));
});
test('safe edit rolls back hard regression', () => {
  const p=basePlan(), b=brief();
  const res=applySafeEdit(p,b,draft=>{ draft.rooms.find(r=>r.id==='k').clear.width=3; });
  assert.equal(res.accepted,false);
  assert.equal(res.plan.rooms.find(r=>r.id==='k').clear.width,4);
});
test('safe edit commits valid change', () => {
  const p=basePlan(), b=brief();
  const res=applySafeEdit(p,b,draft=>{draft.rooms.find(r=>r.id==='f').zone='neutral';});
  assert.equal(res.accepted,true);
});
test('ST stair not classified as sleeping room', () => {
  assert.equal(isSleepKey('ST'),false);
  assert.equal(isSleepKey('S1'),true);
});
test('upper support is diagnostic, never structural certification', () => {
  const unsupported=unsupportedUpperWallSegments([
    {axis:'vertical',position:4,from:0,to:5},
    {axis:'horizontal',position:3,from:0,to:2}
  ],[{axis:'vertical',position:4.01,from:0,to:5}]);
  assert.equal(unsupported.length,1);
});
test('unverified infeasibility is refused', () => {
  assert.throws(()=>provenInfeasible(createBrief(),{type:'AREA_ESTIMATE',a:'a',b:'b'}),/Unverified/);
});
test('verified logical contradiction allowed with explicit hard requirements', () => {
  const b=createBrief({constraints:[
    {id:'a',subject:'room:wc',predicate:'present',op:'REQUIRE',level:'HARD'},
    {id:'b',subject:'room:wc',predicate:'present',op:'FORBID',level:'HARD'}
  ]});
  assert.equal(provenInfeasible(b,{type:'LOGICAL_CONTRADICTION',a:'a',b:'b'}).status,'PROVEN_INFEASIBLE');
});
test('time limit is not infeasibility', () => {
  const r=searchIncomplete('TIME_LIMIT');
  assert.equal(r.status,'SEARCH_INCOMPLETE');
  assert.match(explainToClient(r),/لم نثبت/);
});
test('shortfall notification states actual number', () => {
  const message=explainToClient(solved([basePlan()],5));
  assert.match(message,/1 من أصل 5/);
});
test('client lint catches internal phrases', () => {
  assert.ok(lintClientText('شبكة 4×3 القيود الصلبة').length);
  assert.deepEqual(lintClientText(explainToClient(searchIncomplete('NO_VALID_CANDIDATES'))),[]);
});
test('mirrored/repositioned plans share relational features', () => {
  const a=basePlan(), b=basePlan();
  b.id='B'; b.rooms.forEach(r=>{r.x+=20; r.y+=20;});
  assert.equal(preliminaryDistance(a,b),0);
});
test('frozen comparator required, no invented threshold', () => {
  assert.throws(()=>selectDiverse([],5),/frozen/);
  const a=basePlan(), b=basePlan(); b.id='B';
  const chosen=selectDiverse([{plan:a,valid:true,score:2},{plan:b,valid:true,score:1}],5,
    {frozenDifferent:(x,y)=>preliminaryDistance(x,y)>0});
  assert.equal(chosen.length,1);
});
test('pipeline always executes second pass if first builds nothing', async () => {
  const b=brief(); let calls=[];
  const result=await generateR21(b,{
    enumerate: async (_,opts)=>{calls.push(opts.pass); return opts.pass===1?[]:[{id:1}];},
    solve:async ()=>basePlan(), review:async ()=>({valid:true,score:10}),
    frozenDifferent:()=>false
  });
  assert.deepEqual(calls,[1,2]);
  assert.equal(result.status,'SOLVED');
  assert.equal(result.shortfall,2);
});
test('pipeline never accepts a candidate with hard violation despite reviewer approval', async () => {
  const b=brief(), p=basePlan(); p.doors=[];
  const result=await generateR21(b,{
    enumerate:async()=>[{id:1}], solve:async()=>p,
    review:async()=>({valid:true,score:100}), frozenDifferent:()=>true
  });
  assert.equal(result.status,'SEARCH_INCOMPLETE');
});
test('pipeline refuses fake feasibility proof', async () => {
  await assert.rejects(generateR21(brief(),{
    prove:async()=>({type:'AREA_ESTIMATE',a:'x',b:'y'}),
    enumerate:async()=>[],solve:async()=>null,review:async()=>({valid:true,score:1}),frozenDifferent:()=>true
  }),/Unverified/);
});

import {parkingPathPrecheck, sightlinePrecheck, upperCandidatePrecheck, extractSleepKeys} from '../src/index.mjs';
test('parking precheck detects impossible stall', () => {
  const p=parkingPathPrecheck({stall:{x:0,y:0,width:1.5,height:3},path:[{x:1,y:-1},{x:1,y:1}]});
  assert.ok(p.failures.includes('STALL_TOO_SMALL'));
  assert.equal(p.requiresSweptPathSimulation,true);
});
test('parking precheck catches obstacle along supplied path', () => {
  const p=parkingPathPrecheck({stall:{x:0,y:4,width:3,height:6},path:[{x:1.5,y:0},{x:1.5,y:5}],
    obstacles:[{x:0.5,y:2,width:2,height:1}]});
  assert.ok(p.failures.includes('PATH_OBSTRUCTED'));
});
test('privacy sightline precheck finds opaque screen', () => {
  const blocked=sightlinePrecheck({viewer:{x:0,y:0},windowPoint:{x:5,y:0},
    opaqueScreens:[{a:{x:2,y:-1},b:{x:2,y:1}}]});
  assert.equal(blocked.visible,false);
});
test('upper precheck does not demand full ground coverage', () => {
  const ground={rooms:[{type:'stair',x:0,y:0,width:2,height:2}],supportLines:[{axis:'vertical',position:4,from:0,to:5}]};
  const upper={rooms:[{type:'stair',x:0,y:0,width:2,height:2}],wallSegments:[{axis:'vertical',position:4,from:0,to:5}]};
  assert.equal(upperCandidatePrecheck({ground,upper}).validPreliminary,true);
  assert.deepEqual(extractSleepKeys({S1:{},ST:{},S2:{},Sitting:{}}),['S1','S2']);
});
