import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { adaptCandidateEnvelope, validateEnvelope, polygonArea } from '../contracts/mizan-ir-v1.adapter.js';
import { ClaudeGeometryAdapter } from '../contracts/claude-geometry-adapter.js';
import { CoordinationOrchestrator } from '../core/coordination-orchestrator.js';
import { canonicalJSON, contentHash, geometryHash, candidateId } from '../../../reference/identity.mjs';
const fixture=(group,name)=>JSON.parse(fs.readFileSync(new URL(`../../../fixtures/${group}/${name}.json`,import.meta.url)));
const pair=(name='u-s')=>[fixture('candidates',name),fixture('requests',name)];
const rebind=async(c,r)=>{c.inputHash=await contentHash(r);c.geometryHash=await geometryHash(c);c.candidateId=await candidateId(c);};

for(const shape of ['rect','l','u']) for(const direction of ['s','n','e','w']) {
  test(`G01/G03/G08 native ${shape}-${direction}: one conversion, exact preservation and polygon area`,async()=>{
    const [c,r]=pair(`${shape}-${direction}`),before=canonicalJSON(c),a=await adaptCandidateEnvelope(c,r);
    assert.equal(canonicalJSON(c),before);assert.deepEqual(a.nativeGeometry,c.geometry);
    assert.equal(a.coreGeometry.units,'METRIC_MM');assert.equal(a.unitScaleToMm,1);
    assert.equal(a.conversion.count,1);assert.equal(a.coreGeometry.frame,c.frame);
    assert.deepEqual(a.coreGeometry.links,c.geometry.links);
    c.geometry.buildingFootprint.forEach((p,i)=>assert.deepEqual(a.coreGeometry.buildingFootprint[i],{x:p.x*1000,y:p.y*1000}));
    c.geometry.courtyards.forEach((v,i)=>{const out=a.coreGeometry.courtyards[i];assert.equal(out.x,v.x*1000);assert.equal(out.w,v.w*1000);assert.equal(out.roofPolicy,'OPEN_TO_SKY');assert.equal(out.roofable,false);});
    c.geometry.openings.forEach((o,i)=>{const out=a.coreGeometry.openings[i],w=c.geometry.walls.find(w=>w.id===o.wallId);assert.equal(out.openingId,o.id);assert.equal(out.parentElementId,o.wallId);assert.equal(out.widthMm,o.w*1000);assert.deepEqual(out.position,[(w.x1+(w.x2-w.x1)*o.pos)*1000,(w.y1+(w.y2-w.y1)*o.pos)*1000]);});
    assert.equal(a.areaM2,polygonArea(c.geometry.buildingFootprint));
    if(shape==='u') assert.ok(a.areaM2<c.geometry.building.w*c.geometry.building.h);
    assert.deepEqual(a.geometryAudit.outsideSpaces,[]);assert.ok(a.geometryAudit.courtyardOverlapM2<=a.geometryAudit.toleranceM2);
    assert.throws(()=>{a.nativeGeometry.rooms[0].w=1;},TypeError);
  });
}
test('G01 legacy m/mm equivalents preserve Mm fields and produce equivalent findings/loads',()=>{
  const mm=JSON.parse(fs.readFileSync(new URL('../fixtures/conflicted-villa.fixture.json',import.meta.url)));
  const m=structuredClone(mm);m.units='METRIC_M';
  function convert(v){for(const [k,x] of Object.entries(v)){
    if(['polygon2D','boundaryPolygon'].includes(k))v[k]=x.map(p=>p.map(n=>n/1000));
    else if(['position'].includes(k)&&Array.isArray(x))v[k]=x.map(n=>n/1000);
    else if(['floorToCeilingHeight','slabThickness'].includes(k))v[k]=x/1000;
    else if(x&&typeof x==='object')convert(x);
  }}convert(m);
  const a=CoordinationOrchestrator.coordinate(mm),b=CoordinationOrchestrator.coordinate(m);
  assert.deepEqual(a.summaryMetrics,b.summaryMetrics);assert.deepEqual(a.architecturalReview,b.architecturalReview);
  assert.deepEqual(a.hvacCoordination,b.hvacCoordination);assert.deepEqual(a.electricalCoordination,b.electricalCoordination);
});
test('G01 Mm regression: 800 mm corridor stays 800 mm even in METRIC_M',()=>{
  const g={projectId:'P1',units:'METRIC_M',levels:[{levelId:'L1'}],spaces:[{spaceId:'C',levelId:'L1',functionalType:'CORRIDOR',nominalWidthMm:800,netAreaSqM:1,polygon2D:[[0,0],[1,0],[1,1],[0,1]]}],structuralElements:[],enclosureElements:[]};
  assert.match(CoordinationOrchestrator.coordinate(g).architecturalReview.issues[0].description,/800 mm/);
  g.spaces[0].nominalWidthMm='800';assert.throws(()=>ClaudeGeometryAdapter.adapt(g),/INVALID_MEASUREMENT/);
});
test('G02 strict boundary rejects each supplied negative schema fixture',()=>{
  for(const file of fs.readdirSync(new URL('../../../fixtures/negative/',import.meta.url))){
    const v=fixture('negative',file.replace('.json','')),def={CandidateEnvelope:'candidate',DesignRequest:'request',ReviewEnvelope:'review'}[v.kind];
    assert.throws(()=>validateEnvelope(v,def),/SCHEMA_INVALID/,file);
  }
});
test('G02 unknown units, frame, non-finite, undefined, cyclic, accessor and sparse arrays reject',async()=>{
  for(const mutate of [c=>{c.units.length='mm';},c=>{c.frame='OTHER';},c=>{c.geometry.rooms[0].w=NaN;},c=>{c.geometry.rooms[0].w=Infinity;},c=>{c.geometry.rooms[0].extra=undefined;},c=>{c.geometry.loop=c;},c=>{Object.defineProperty(c.geometry,'bad',{enumerable:true,get(){throw Error('getter must not execute');}});},c=>{delete c.geometry.rooms[0];}]){
    const [c,r]=pair();mutate(c);await assert.rejects(adaptCandidateEnvelope(c,r));
  }
  const g={projectId:'P',levels:[{levelId:'L1'}],spaces:[],structuralElements:[],enclosureElements:[]};
  assert.throws(()=>ClaudeGeometryAdapter.adapt({...g,units:'unknown'}),/UNIT_UNSUPPORTED/);
  assert.throws(()=>ClaudeGeometryAdapter.adapt({...g,value:NaN}),/NON_FINITE/);
});
test('G02 recomputed hash does not excuse broken references, duplicate IDs or self-intersection',async()=>{
  for(const mutate of [c=>{c.geometry.openings[0].wallId='absent';},c=>{c.geometry.rooms[1].id=c.geometry.rooms[0].id;},c=>{c.geometry.buildingFootprint=[{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}];}]){
    const [c,r]=pair();mutate(c);await rebind(c,r);await assert.rejects(adaptCandidateEnvelope(c,r),/BROKEN|DUPLICATE|INTERSECT/);
  }
});
test('G04 stale input, candidate identity and geometry hashes are independently rejected',async()=>{
  for(const mutate of [(c,r)=>{r.plot.widthM++;},c=>{c.candidateId='cand:'+'0'.repeat(64);},c=>{c.geometry.rooms[0].x+=0.1;}]){
    const [c,r]=pair();mutate(c,r);await assert.rejects(adaptCandidateEnvelope(c,r),/HASH_MISMATCH|ID_MISMATCH/);
  }
});
test('G05 SHA-256 parity: independent node:createHash vs Web Crypto reference bytes',async()=>{
  for(const [c] of [pair('u-e'),pair('l-w'),pair('rect-n')]){
    const payload={units:c.units,frame:c.frame,geometry:c.geometry},bytes=canonicalJSON(payload);
    const node=createHash('sha256').update(bytes,'utf8').digest('hex');
    const web=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(bytes))).toString('hex');
    assert.equal(node,web);assert.equal(node,(await contentHash(payload)).value);assert.equal(node,c.geometryHash.value);
  }
});
test('G08 boundary snapshot remains stable during asynchronous hashing',async()=>{
  const [c,r]=pair(),old=structuredClone(c);const pending=adaptCandidateEnvelope(c,r);c.geometry.rooms[0].w+=1;
  const a=await pending;assert.deepEqual(a.nativeGeometry,old.geometry);
});
test('G02 nested mixed units reject even after rehashing; Mm extension stays intact',async()=>{
  const [c,r]=pair();c.geometry.rooms[0].units='METRIC_MM';await rebind(c,r);
  await assert.rejects(adaptCandidateEnvelope(c,r),/UNIT_UNSUPPORTED/);
  delete c.geometry.rooms[0].units;c.geometry.rooms[0].requiredHeadroomMm=2450;await rebind(c,r);
  const a=await adaptCandidateEnvelope(c,r);assert.equal(a.nativeGeometry.rooms[0].requiredHeadroomMm,2450);
});
