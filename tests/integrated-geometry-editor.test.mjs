import test from 'node:test';
import assert from 'node:assert/strict';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { defaultRooms, normalizeRooms, validatePlot } from '../dist/planner.mjs';
import { eligiblePartitions, previewGeometryCommand } from '../dist/geometry-editor.mjs';
import { createGeometrySession } from '../dist/geometry-session.mjs';
import { createGeometryAdapter } from '../dist/geometry-adapter.mjs';
import { encodeProject, decodeProject } from '../dist/project.mjs';

async function generatedModel(){
 const plot=validatePlot({width:35,length:45,floors:1,entry:'s',streets:{s:true},coverage:.75,streetSetback:3,neighborSetback:1.5});
 const result=await runMultiEngineDesign({plot,rooms:normalizeRooms(defaultRooms()),selectedShape:'rect',seed:1});
 const model=result.models.find(row=>row.integration?.alternativeKey==='rect-clustered-1-0');
 assert.ok(model,'fixture must be a real integrated candidate selected for review');
 assert.equal(model.version,2);
 return {plot,model};
}
const openingCommand=(model,opening,width,baseRevision=0)=>({id:`edit-${opening.id}-${width}`,type:'edit-opening',baseRevision,openingId:opening.id,widthM:width});
const withoutRevision=value=>{const copy=structuredClone(value);delete copy.geometryRevision;return copy;};

test('integrated native candidate accepts a scoped opening edit without changing unrelated geometry',async()=>{
 const {model}=await generatedModel(),windowOpening=model.openings.find(o=>o.type==='window'&&o.w>.5);
 assert.ok(windowOpening);
 const result=previewGeometryCommand(model,openingCommand(model,windowOpening,windowOpening.w-.05));
 const edited=result.model,changed=edited.openings.find(o=>o.id===windowOpening.id);
 assert.ok(Math.abs(changed.w-(windowOpening.w-.05))<1e-10);
 assert.equal(changed.id,windowOpening.id);assert.equal(changed.wallId,windowOpening.wallId);assert.equal(changed.pos,windowOpening.pos);
 assert.deepEqual(edited.rooms,model.rooms);assert.deepEqual(edited.walls,model.walls);assert.deepEqual(edited.corridors,model.corridors);assert.deepEqual(edited.program,model.program);
 assert.deepEqual(edited.openings.filter(o=>o.id!==windowOpening.id),model.openings.filter(o=>o.id!==windowOpening.id));
 assert.equal(edited.integration.previousCandidateId,model.integration.candidateId);assert.equal(edited.integration.candidateId,null);assert.equal(edited.integration.requiresReview,true);
 assert.equal(result.impact.openingIds[0],windowOpening.id);
});

test('integrated native candidate opens supported partition and door targets only after geometry checks',async()=>{
 const {model}=await generatedModel();
 const eligible=eligiblePartitions(model).filter(p=>p.eligible);
 assert.ok(eligible.length>0);
 const door=model.openings.find(o=>o.type==='door'&&o.w>.6);assert.ok(door);
 const result=previewGeometryCommand(model,openingCommand(model,door,door.w-.05));
 assert.deepEqual(result.model.rooms,model.rooms);assert.deepEqual(result.model.walls,model.walls);
 assert.deepEqual(result.model.openings.filter(o=>o.id!==door.id),model.openings.filter(o=>o.id!==door.id));
 assert.deepEqual(result.model.openings.find(o=>o.id===door.id).connects,door.connects);
});

test('integrated opening edits commit, undo, redo and save/restore exact geometry',async()=>{
 const {plot,model}=await generatedModel(),session=createGeometrySession(model),original=session.getState().model;
 const windowOpening=original.openings.find(o=>o.type==='window'&&o.w>.5),doorOpening=original.openings.find(o=>o.type==='door'&&o.w>.6);
 for(const opening of [windowOpening,doorOpening]){
  const current=session.getState(),preview=session.preview(openingCommand(current.model,opening,opening.w-.05,current.revision));
  session.commit({previewId:preview.previewId});
 }
 const edited=session.getState().model;
 const text=encodeProject({plot:edited.plot,rooms:edited.program,palette:'resort',rates:{},costReserve:0,vat:0,idea:'',discovery:{likes:[],rejects:[],avoids:[],life:{}},model:edited,alternatives:[edited],history:[{model:original,palette:'resort'}]});
 assert.deepEqual(decodeProject(text).model,edited);
 assert.equal(session.getState().undoDepth,2);
 assert.equal(session.undo().model.openings.find(o=>o.id===doorOpening.id).w,doorOpening.w);
 assert.equal(session.undo().model.openings.find(o=>o.id===windowOpening.id).w,windowOpening.w);
 assert.deepEqual(session.redo().model,session.getState().model);
 assert.equal(session.redo().model.openings.find(o=>o.id===doorOpening.id).w,doorOpening.w-.05);
 assert.deepEqual(decodeProject(text).history[0].model,original);
});

test('neutral adapter validates, round-trips snapshots and preserves model identity through edit history',async()=>{
 const {plot,model}=await generatedModel(),adapter=createGeometryAdapter(model),before=adapter.getSnapshot();
 assert.equal(adapter.contract,'mizan.geometry.v1');assert.equal(adapter.capabilities.version2,true);
 const windowOpening=model.openings.find(o=>o.type==='window'&&o.w>.5);
 const preview=adapter.preview(openingCommand(model,windowOpening,windowOpening.w-.05,before.revision));
 assert.deepEqual(adapter.getSnapshot().model,before.model);
 const committed=adapter.commit({previewId:preview.previewId});
 const changed=committed.model.openings.find(o=>o.id===windowOpening.id);
 assert.equal(changed.id,windowOpening.id);assert.equal(changed.wallId,windowOpening.wallId);assert.equal(changed.pos,windowOpening.pos);
 assert.deepEqual(committed.model.rooms,before.model.rooms);assert.deepEqual(committed.model.walls,before.model.walls);
 const saved=encodeProject({plot,rooms:committed.model.program,palette:'resort',rates:{},costReserve:0,vat:0,idea:'',discovery:{likes:[],rejects:[],avoids:[],life:{}},model:committed.model,alternatives:[committed.model]});
 const decoded=decodeProject(saved);assert.deepEqual(decoded.model,committed.model);
 adapter.undo();assert.deepEqual(withoutRevision(adapter.getSnapshot().model),withoutRevision(before.model));assert.deepEqual(withoutRevision(adapter.redo().model),withoutRevision(committed.model));
 assert.throws(()=>createGeometryAdapter(null),{code:'INVALID_MODEL'});
});
