/**
 * Independent acceptance oracle for orthogonal polygons and axis-aligned rectangles.
 * Not a production renderer or general polygon engine. Native geometry validation is a separate gate.
 * Integrates cells bounded by every polygon/rectangle coordinate; detects compensated missing/excess area.
 */
function point(p) { return !!p && Number.isFinite(p.x) && Number.isFinite(p.y); }
function rect(r) { return !!r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0; }
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > y) !== (b.y > y) && x < a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}
const inRect = (x, y, r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
export function auditMassing(footprint, parts, courtyards = []) {
  if (!Array.isArray(footprint) || footprint.length < 4 || footprint.some(p => !point(p))) throw new Error('INVALID_POLYGON');
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length];
    if (a.x !== b.x && a.y !== b.y) throw new Error('NON_ORTHOGONAL_UNSUPPORTED');
  }
  if (!Array.isArray(parts) || parts.some(r => !rect(r)) || !Array.isArray(courtyards) || courtyards.some(r => !rect(r))) throw new Error('INVALID_RECTANGLE');
  const xs = new Set(footprint.map(p => p.x)), ys = new Set(footprint.map(p => p.y));
  for (const r of [...parts, ...courtyards]) { xs.add(r.x); xs.add(r.x+r.w); ys.add(r.y); ys.add(r.y+r.h); }
  const xx = [...xs].sort((a,b)=>a-b), yy = [...ys].sort((a,b)=>a-b);
  if (xx.length * yy.length > 250000) throw new Error('AUDIT_RESOURCE_LIMIT');
  let footprintArea=0, unionArea=0, missingArea=0, excessArea=0, overlappingPartsArea=0, courtyardCoveredArea=0;
  for (let i=0;i<xx.length-1;i++) for (let j=0;j<yy.length-1;j++) {
    const x=(xx[i]+xx[i+1])/2, y=(yy[j]+yy[j+1])/2, area=(xx[i+1]-xx[i])*(yy[j+1]-yy[j]);
    const inside = inRing(x,y,footprint), count=parts.filter(r=>inRect(x,y,r)).length;
    if (inside) footprintArea+=area;
    if (count) unionArea+=area;
    if (inside&&!count) missingArea+=area;
    if (!inside&&count) excessArea+=area;
    if (count>1) overlappingPartsArea+=area;
    if (count&&courtyards.some(r=>inRect(x,y,r))) courtyardCoveredArea+=area;
  }
  const toleranceM2=Math.max(1e-6,footprintArea*1e-8), symmetricDifferenceArea=missingArea+excessArea;
  return { footprintArea,unionArea,missingArea,excessArea,symmetricDifferenceArea,overlappingPartsArea,courtyardCoveredArea,toleranceM2,
    pass: footprintArea>0 && symmetricDifferenceArea<=toleranceM2 && overlappingPartsArea<=toleranceM2 && courtyardCoveredArea<=toleranceM2 };
}
export function withinAreaCap(area, cap) {
  if (!Number.isFinite(area) || area<=0) throw new Error('INVALID_AREA');
  if (cap===null) return true;
  if (!Number.isFinite(cap) || cap<=0) throw new Error('INVALID_CAP');
  return area<=cap+Math.max(1e-6,Math.abs(cap)*1e-8);
}

// Reference oracle above copied byte-for-byte from the frozen kit; package-local for ZIP verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAlternatives,generateModelLegacy,CONCEPT_PROFILES} from '../src/compat-layer.mjs';
import {defaultRooms,generateModel,validateModel} from '../src/planner.mjs';
const rooms=()=>defaultRooms({bedrooms:4,majlis:2,baths:3,kitchens:1,halls:1,dining:1});
const plot=(entry='s',extra={})=>({width:35,length:45,floors:1,entry,streets:{[entry]:true},...extra});
for (const entry of ['s','n','e','w']) for (const [strategy,shape] of [['compact','rect'],['l','l'],['courtyard','u']]) {
  test('P1 C01-C04 '+shape+' '+entry+' exact mass union and unchanged native geometry',()=>{
    const p=plot(entry), r=rooms(), before=JSON.stringify({p,r});
    const native=generateModel({...p,shape},r);
    const m=generateModelLegacy(p,r,{strategy});
    assert.equal(m.shape,shape); assert.equal(m.actualShape,shape);
    assert.equal(m.requestedShape,shape); assert.equal(m.fallback.applied,false);
    assert.deepEqual(validateModel(m),[]);
    for (const field of ['buildingFootprint','rooms','corridors','walls','openings','courtyards','reserves']) assert.deepEqual(m[field],native[field],field);
    const audit=auditMassing(m.buildingFootprint,m.massingParts??[m.building],m.courtyards);
    assert.ok(audit.pass,JSON.stringify(audit));
    assert.equal(m.rooms.length,r.length);
    for (const [i,room] of r.entries()) {
      const actual=m.rooms.find(x=>x.id==='room-'+i);
      assert.ok(actual);assert.ok(Math.abs(actual.w*actual.h-room.area)<1e-5);
    }
    assert.equal(JSON.stringify({p,r}),before);
  });
}
test('P1 C05 caps 228 and 250 in every direction never shrink/drop rooms',()=>{
 for(const entry of ['s','n','e','w']) for(const maxBuiltArea of [228,250]) {
  const p=plot(entry,{maxBuiltArea}), r=rooms();
  try {
    const result=generateAlternatives(p,r);
    for(const m of result.models) {
      assert.equal(m.plot.maxBuiltArea,maxBuiltArea);
      assert.ok(withinAreaCap(m.builtArea,maxBuiltArea));
      assert.equal(m.rooms.length,r.length);
      for(const [i,x] of r.entries()) assert.equal(m.rooms.find(v=>v.id==='room-'+i).targetArea,x.area);
    }
  } catch(e) {assert.match(e.message,/MAX_BUILT_AREA_EXCEEDED/);}
 }
});
test('P1 C06 exact tolerance boundary and canonical maxBuiltAreaM2',()=>{
 const r=rooms(), p=plot(), area=generateModelLegacy(p,r).builtArea;
 for(const cap of [area,area+1e-4,area-1e-7,area-1e-4]) {
   if(withinAreaCap(area,cap)) assert.equal(generateModelLegacy({...p,maxBuiltAreaM2:cap},r).plot.maxBuiltArea,cap);
   else assert.throws(()=>generateModelLegacy({...p,maxBuiltAreaM2:cap},r),/MAX_BUILT_AREA_EXCEEDED/);
 }
 assert.equal(generateModelLegacy({...p,maxBuiltArea:null},r).plot.maxBuiltArea,null);
 for(const cap of [0,-1,NaN,Infinity,'250']) assert.throws(()=>generateAlternatives({...p,maxBuiltArea:cap},r),/INVALID_MAX_BUILT_AREA/);
 assert.throws(()=>generateAlternatives({...p,maxBuiltArea:250,maxBuiltAreaM2:251},r),/CONFLICTING_AREA_CAP/);
});
test('P1 C07 explicit fallback permission, requested/actual/reason and 8x8 failure',()=>{
 const p=plot('s',{width:20,length:30}), r=rooms();
 for(const strategy of ['l','courtyard']) {
   assert.throws(()=>generateModelLegacy(p,r,{strategy}),/SHAPE_FIT_FAILED/);
   const m=generateModelLegacy(p,r,{strategy,allowFallback:true});
   assert.equal(m.actualShape,'rect');assert.equal(m.requestedShape,strategy==='l'?'l':'u');
   assert.equal(m.fallback.allowed,true);assert.equal(m.fallback.applied,true);
   assert.ok(m.fallback.reason);assert.deepEqual(validateModel(m),[]);
 }
 assert.throws(()=>generateAlternatives(plot('s',{width:8,length:8}),r),/لم يجد المولد الحالي/);
});
test('P1 C08 real L, aliases, deterministic dedup and immutable arguments',()=>{
 const p=plot(),r=rooms(),before=JSON.stringify({p,r});
 const a=generateAlternatives(p,r);
 assert.deepEqual(a,generateAlternatives(p,r));
 assert.deepEqual(a.models.map(m=>m.shape).sort(),['l','rect','u']);
 assert.ok(CONCEPT_PROFILES.l);
 const u=generateModelLegacy(p,r,{strategy:'u-court'}),c=generateModelLegacy(p,r,{strategy:'courtyard'});
 assert.deepEqual(u.buildingFootprint,c.buildingFootprint);
 assert.deepEqual(u.rooms,c.rooms);assert.deepEqual(u.openings,c.openings);
 assert.equal(JSON.stringify({p,r}),before);
 assert.throws(()=>generateModelLegacy(p,r,{strategy:'unknown'}),/UNKNOWN_STRATEGY/);
});
