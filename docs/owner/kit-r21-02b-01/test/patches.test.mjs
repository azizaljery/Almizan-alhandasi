import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClearDimensions,largestClearRectangle,clearSpanFromCentrelines,toleranceFor,canonicalBrief,assertSharedBrief,hasGuestDining,rejection,assertBlocked,classifyRun,clientNotice,segmentHit,screenWindowPrivacy,compareAcceptance,evaluateBath} from '../src/index.mjs';
const rect=(w,h,x=0,y=0)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
test('4x5 exact clear footprint passes',()=>assert.equal(validateClearDimensions({outer:rect(4,5),required:{width:4,height:5},qualifier:'exact'}).ok,true));
test('4x5 minus 4cm exact fails',()=>assert.equal(validateClearDimensions({outer:rect(3.96,5),required:{width:4,height:5},qualifier:'exact'}).ok,false));
test('4x5 minus 4cm unspecified passes',()=>assert.equal(validateClearDimensions({outer:rect(3.96,5),required:{width:4,height:5}}).ok,true));
test('4x5 minus 20cm approximate passes',()=>assert.equal(validateClearDimensions({outer:rect(3.8,5),required:{width:4,height:5},qualifier:'approximate'}).ok,true));
test('4x5 minus 31cm approximate fails',()=>assert.equal(validateClearDimensions({outer:rect(3.69,5),required:{width:4,height:5},qualifier:'approximate'}).ok,false));
test('rotate dimensions when permitted',()=>assert.equal(validateClearDimensions({outer:rect(5,4),required:{width:4,height:5}}).ok,true));
test('rotation can be forbidden',()=>assert.equal(validateClearDimensions({outer:rect(5,4),required:{width:4,height:5},allowRotation:false}).ok,false));
test('L shaped 4x5 envelope is not enough',()=>{
 const L=[{x:0,y:0},{x:4,y:0},{x:4,y:4.5},{x:3.5,y:4.5},{x:3.5,y:5},{x:0,y:5}];
 assert.equal(validateClearDimensions({outer:L,required:{width:4,height:5}}).ok,false);
});
test('notch of 6.5cm invalidates exact clear rectangle',()=>{
 const poly=[{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:3.935,y:2},{x:3.935,y:3},{x:4,y:3},{x:4,y:5},{x:0,y:5}];
 assert.equal(validateClearDimensions({outer:poly,required:{width:4,height:5},qualifier:'exact'}).ok,false);
});
test('a central shaft void invalidates rectangle',()=>assert.equal(validateClearDimensions({outer:rect(4,5),holes:[rect(.3,.3,1,1)],required:{width:4,height:5}}).ok,false));
test('centerline span uses two different wall thicknesses',()=>assert.ok(Math.abs(clearSpanFromCentrelines(4.185,.25,.12)-4)<1e-9));
test('bad tolerance rejected',()=>assert.throws(()=>toleranceFor('exact',{exact:-1})));
test('unknown qualifier rejected',()=>assert.throws(()=>toleranceFor('other')));
test('unsupported nonorthogonal room rejected',()=>assert.throws(()=>largestClearRectangle([{x:0,y:0},{x:1,y:1},{x:0,y:2},{x:-1,y:1}])));
test('canonical brief recognizes muqlat as dining function',()=>{const b=canonicalBrief({text:'أبي مجلس رجال بمقلط'});assert.equal(hasGuestDining(b),true);assert.equal(b.requirements[0].directDoor,'unspecified');});
test('near majlis does not infer a door',()=>assert.equal(hasGuestDining(canonicalBrief({text:'طعام قريب من المجلس'})),false));
test('same brief object for reviewer and generator',()=>{const b=canonicalBrief({text:'مجلس رجال بمقلط'});assert.equal(assertSharedBrief(b,b),true);assert.throws(()=>assertSharedBrief(b,canonicalBrief({text:b.text})));});
test('structured parser requirements retained',()=>{const b=canonicalBrief({text:'مجلس رجال بمقلط',parsed:{requirements:[{id:'a',kind:'guest_dining',mandatory:true}]}});assert.equal(b.requirements.length,1);});
test('blocked candidate cannot lack evidence',()=>assert.throws(()=>assertBlocked({status:'blocked',rejections:[]})));
test('blocked candidate with evidence passes',()=>{const r=rejection({candidateId:'H2-1',stage:'review',rule:'PARKING_ACCESS',source:'client',reason:'لا يوجد وصول صالح',measured:2.1,limit:2.5,unit:'m'});assert.equal(assertBlocked({status:'blocked',rejections:[r]}),true);});
test('cannot invent numeric measured value',()=>assert.throws(()=>rejection({candidateId:'a',stage:'review',rule:'r',source:'s',reason:'x',measured:NaN})));
test('no candidate is search incomplete, not impossible',()=>assert.equal(classifyRun({candidates:[]}).status,'SEARCH_INCOMPLETE'));
test('contradiction requires verified certificate',()=>assert.equal(classifyRun({proof:{verified:false,kind:'contradiction',sources:['a','b']}}).status,'SEARCH_INCOMPLETE'));
test('verified contradiction is distinct from search failure',()=>assert.equal(classifyRun({proof:{verified:true,kind:'contradiction',sources:['a','b']}}).status,'PROVEN_CONFLICT'));
test('notice says 1 of 3, no internal search terms',()=>{const s=clientNotice(classifyRun({}),{requested:3,shown:1});assert.match(s,/1 من 3/);assert.doesNotMatch(s,/شبكة|القيود الصلبة/);});
test('sight line intersects window',()=>assert.ok(segmentHit({x:0,y:0},{x:4,y:0},{x:2,y:-1},{x:2,y:1})));
test('window C6 with direct view flags exposure',()=>{const s=screenWindowPrivacy({window:{a:{x:2,y:-1},b:{x:2,y:1},sillHeight:.8,headHeight:2.2},parkingPoints:[{x:0,y:0}],interiorPoints:[{x:4,y:0}]});assert.equal(s.potentialExposure,true);});
test('high sill blocks horizontal sight line at eye level',()=>{const s=screenWindowPrivacy({window:{a:{x:2,y:-1},b:{x:2,y:1},sillHeight:1.8,headHeight:2.4},parkingPoints:[{x:0,y:0}],interiorPoints:[{x:4,y:0}]});assert.equal(s.potentialExposure,false);});
test('privacy screen before window prevents sightline',()=>{const s=screenWindowPrivacy({window:{a:{x:2,y:-1},b:{x:2,y:1},sillHeight:.8,headHeight:2.2},parkingPoints:[{x:0,y:0}],interiorPoints:[{x:4,y:0}],opaqueScreens:[{a:{x:1,y:-1},b:{x:1,y:1},height:2}]});assert.equal(s.potentialExposure,false);});
test('regression gate catches C6 privacy degradation',()=>{const before={checks:{privacy:{passed:true}}},after={checks:{privacy:{passed:false}}};assert.equal(compareAcceptance(before,after,{protect:['privacy']}).pass,false);});
test('regression gate passes maintained checks',()=>assert.equal(compareAcceptance({checks:{privacy:{passed:true}}},{checks:{privacy:{passed:true},dims:{passed:true}}},{mandatory:['dims'],protect:['privacy']}).pass,true));
test('bath depth preferred but functionally invalid',()=>{const b=evaluateBath({type:'deep',depth:2.2});assert.equal(b.preferred,true);assert.equal(b.preliminaryAccept,false);});
test('bath depth outside preferred can be functionally valid',()=>{const b=evaluateBath({type:'side',depth:2.5,fixturesFit:true,doorClearance:true,ventilation:true});assert.equal(b.preferred,false);assert.equal(b.preliminaryAccept,true);});
test('correct rectangle may be smaller than largest-area rectangle',()=>{
 // L shape: 3x5 wing and 6x2 bottom wing; 3x5 is desired though 6x2 is largest area? 3x5 > 6x2
 const L=[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:3,y:2},{x:3,y:5},{x:0,y:5}];
 const r=largestClearRectangle(L);
 assert.ok(r.area>=12);
 // This case is rejected as an exact 3x5 room because the envelope is 6x5.
 assert.equal(validateClearDimensions({outer:L,required:{width:3,height:5}}).ok,false);
});
