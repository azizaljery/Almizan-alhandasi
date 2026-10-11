import test from 'node:test';
import assert from 'node:assert/strict';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { layoutDescriptor, layoutDistance, DIVERSITY_THRESHOLD, selectDiverse, selectDiverseWithEvidence } from '../dist/design-exploration.mjs';
import { defaultRooms, normalizeRooms, validatePlot, validateModel, generateModel } from '../dist/planner.mjs';
const plot = validatePlot({width:35,length:45,floors:1,entry:'s',streets:{s:true},streetSetback:3,neighborSetback:1.5,coverage:.75});
const rooms = normalizeRooms(defaultRooms());
const descriptor = layoutDescriptor;

test('displayed ideas differ structurally and a new batch excludes previous ideas', async () => {
  const first = await runMultiEngineDesign({plot,rooms,seed:1});
  const second = await runMultiEngineDesign({plot,rooms,seed:2,previous:first.models});
  assert.equal(first.models.length, 6);
  assert.ok(second.models.length >= 3);
  for (const batch of [first.models, second.models]) batch.forEach((a, i) => batch.slice(i+1).forEach(b => assert.ok(layoutDistance(descriptor(a),descriptor(b)) >= DIVERSITY_THRESHOLD - 1e-9)));
  for (const a of second.models) for (const b of first.models) assert.ok(layoutDistance(descriptor(a),descriptor(b)) >= DIVERSITY_THRESHOLD - 1e-9);
  for (const m of [...first.models,...second.models]) {
    assert.deepEqual(validateModel(m), []);
    assert.deepEqual(m.program, rooms);
    assert.deepEqual(m.plot.streets, plot.streets);
    assert.equal(m.plot.width, plot.width); assert.equal(m.plot.coverage, plot.coverage);
    for (const r of rooms) {
      const built=m.rooms.find(b=>b.id===r.id);
      assert.ok(Math.abs(built.w*built.h-r.area)<1e-8);
      assert.equal(built.side,r.side);
      assert.equal(built.position,r.position);
      if(r.side!=='any') assert.equal(built.resolvedSide,r.side);
    }
  }
});

test('labels, translation, reflection, rotation and equal-room swaps cannot earn novelty', async () => {
  const {models:[m]} = await runMultiEngineDesign({plot,rooms,seed:1});
  const transform = (source, point, rename = false) => {
    const out=structuredClone(source), rect=r=>{const a=point(r.x,r.y),b=point(r.x+r.w,r.y+r.h);return {...r,x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)}};
    for(const key of ['rooms','corridors','reserves','courtyards','massingParts']) if(out[key])out[key]=out[key].map(rect);
    for(const key of ['building','boundingBox','footprint'])if(out[key])out[key]=rect(out[key]);
    if(out.buildingFootprint)out.buildingFootprint=out.buildingFootprint.map(p=>point(p.x,p.y));
    out.walls=out.walls.map(w=>{const a=point(w.x1,w.y1),b=point(w.x2,w.y2);return {...w,x1:a.x,y1:a.y,x2:b.x,y2:b.y}});
    if(rename){const id=value=>value==='outside'?value:'renamed-'+value;for(const key of ['rooms','corridors','walls','openings','program'])out[key]=out[key].map(v=>({...v,id:id(v.id),...(v.wallId?{wallId:id(v.wallId)}:{}),...(v.roomId?{roomId:id(v.roomId)}:{}),...(v.connects?{connects:v.connects.map(id)}:{})}));out.links=out.links.map(pair=>pair.map(id));out.rooms.reverse();out.rooms.forEach(r=>r.name='تسمية أخرى');}
    return out;
  };
  const renamed=transform(m,(x,y)=>({x:x+100,y:y-70}),true);renamed.architecture.tag='اسم مختلف';
  const mirrored=transform(m,(x,y)=>({x:100-x,y}));
  const rotated=transform(m,(x,y)=>({x:-y,y:x}));
  for(const clone of [renamed,mirrored,rotated]) assert.ok(layoutDistance(descriptor(m),descriptor(clone))<1e-12);
  assert.equal(selectDiverse([m,renamed,mirrored,rotated].map(geometry=>({candidate:{geometry}}))).length,1);
});

test('L exploration retains explicit side requests rather than silently dropping them', async () => {
  const out=await runMultiEngineDesign({plot,rooms,seed:1});
  assert.ok(out.failures.some(f=>/الجانب المطلوب/.test(f.reason)));
  assert.ok(!out.models.some(m=>m.shape==='l'));
  const free=rooms.map(r=>({...r,side:'any'}));
  const permitted=await runMultiEngineDesign({plot,rooms:free,seed:1});
  assert.ok(permitted.models.some(m=>m.shape==='l'));
});

test('tight plot does not pad alternatives with duplicates or shrink rooms', async () => {
  const small = validatePlot({...plot,width:18,length:22,coverage:.9});
  const smallRooms=normalizeRooms(defaultRooms({majlis:1,halls:1,bedrooms:1,baths:1,dining:0}));
  const out=await runMultiEngineDesign({plot:small,rooms:smallRooms,seed:1});
  assert.ok(out.models.length>=1 && out.models.length<6);
  for(const m of out.models){assert.deepEqual(validateModel(m),[]);assert.deepEqual(m.program,smallRooms);}
});


test('exhausted search reports no new ideas without mutating the existing designs', async () => {
  const small=validatePlot({...plot,width:18,length:22,coverage:.9});
  const program=normalizeRooms(defaultRooms({majlis:1,halls:1,bedrooms:1,baths:1,dining:0}));
  const first=await runMultiEngineDesign({plot:small,rooms:program,seed:1});
  const before=JSON.stringify(first.models);
  await assert.rejects(runMultiEngineDesign({plot:small,rooms:program,seed:1,previous:first.models}),/لم يجد البحث الحالي أفكارًا أخرى/);
  assert.equal(JSON.stringify(first.models),before);
});


test('new-idea search accepts previous designs from legacy project imports', async () => {
  const legacy=generateModel(plot,rooms,{strategy:'compact'});
  assert.equal(legacy.buildingFootprint,undefined);
  const result=await runMultiEngineDesign({plot,rooms,seed:1,previous:[legacy]});
  assert.ok(result.models.length>0);
  for(const model of result.models) assert.ok(layoutDistance(descriptor(model),descriptor(legacy))>=DIVERSITY_THRESHOLD-1e-9);
});

test('priority orders eligible layouts without bypassing pairwise or history diversity',()=>{
 const base=generateModel(plot,rooms,{strategy:'compact'}),duplicate=structuredClone(base),other=structuredClone(base);
 duplicate.rooms=duplicate.rooms.map(r=>({...r,x:r.x+15,y:r.y-8}));other.shape='u';
 const candidate=(candidateId,geometry)=>({candidate:{candidateId,geometry}});
 const candidates=[candidate('first',base),candidate('duplicate',duplicate),candidate('other',other)];
 const before=structuredClone(candidates);
 const batch=selectDiverse(candidates,[],6,['first','duplicate','other']);
 assert.deepEqual(batch.map(x=>x.candidate.candidateId),['first','other']);
 const next=selectDiverse(candidates,[base],6,['first','duplicate','other']);
 assert.deepEqual(next.map(x=>x.candidate.candidateId),['other']);assert.deepEqual(candidates,before);
});

test('route-priority real generation applies one diversity gate across seed batches',async()=>{
 const idea='avoid long corridors';
 const first=await runMultiEngineDesign({plot,rooms,idea,seed:1});
 const second=await runMultiEngineDesign({plot,rooms,idea,seed:2,previous:first.models});
 assert.ok(first.models.length>0);assert.ok(second.models.length>0);
 for(const batch of [first.models,second.models])for(let i=0;i<batch.length;i++)for(let j=i+1;j<batch.length;j++)assert.ok(layoutDistance(descriptor(batch[i]),descriptor(batch[j]))>=DIVERSITY_THRESHOLD-1e-9,`priority pair ${i}/${j} repeats geometry`);
 for(const a of second.models)for(const b of first.models)assert.ok(layoutDistance(descriptor(a),descriptor(b))>=DIVERSITY_THRESHOLD-1e-9,'priority repeated prior layout');
});


test('diversity evidence accounts for actual pool, history, batch rejection and display limit',()=>{
 const base=generateModel(plot,rooms,{strategy:'compact'});
 const variant=shape=>({...structuredClone(base),shape});
 const candidates=[['old',base],['new',variant('u')],['same-new',variant('u')],['deferred',variant('l')]].map(([candidateId,geometry])=>({candidate:{candidateId,geometry}}));
 const out=selectDiverseWithEvidence(candidates,[base],1,['old','new']);
 assert.deepEqual(out.summary,{generated:4,selected:1,excludedHistory:1,excludedBatch:1,limitDeferred:1,threshold:DIVERSITY_THRESHOLD});
 assert.deepEqual(out.rejections.map(r=>[r.candidateId,r.reason]),[['old','HISTORY_SIMILARITY'],['same-new','BATCH_SIMILARITY'],['deferred','LIMIT_REACHED']]);
 assert.equal(out.rejections[0].historyDistance,0);assert.equal(out.rejections[1].batchDistance,0);
 assert.deepEqual(selectDiverse(candidates,[base],1,['old','new']),out.selected);
});
