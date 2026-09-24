import test from 'node:test';
import assert from 'node:assert/strict';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { defaultRooms, validateModel } from '../dist/planner.mjs';

const basePlot = {width:30,length:40,floors:1,entry:'s',streets:{s:true,n:false,e:false,w:false},streetSetback:3,neighborSetback:1.5,coverage:.75};
const clone = x => structuredClone(x);

test('auto mode runs Claude + Gemini + AZIZ and returns ranked alternatives', async()=>{
  const r=await runMultiEngineDesign({plot:basePlot,rooms:defaultRooms(),shapeMode:'auto'});
  assert.equal(r.aziz.status,'selected');
  assert.ok(['rect','l','u'].includes(r.selectedShape));
  assert.equal(r.alternatives.length,3);
  assert.equal(r.alternatives.filter(x=>x.selected).length,1);
  assert.deepEqual(validateModel(r.model),[]);
  assert.equal(r.engineering.status,'PRELIMINARY_REVIEW');
  assert.ok(r.engineering.intelligence.candidateStrategies.length>0);
  assert.ok(r.aziz.decisionTrace?.steps.length>0);
});

test('explicit U mode is respected and courtyard stays open-to-sky', async()=>{
  const r=await runMultiEngineDesign({plot:basePlot,rooms:defaultRooms(),shapeMode:'u'});
  assert.equal(r.selectedShape,'u');
  assert.equal(r.model.shape,'u');
  assert.equal(r.model.shapeFallback,false);
  assert.equal(r.model.courtyards.length,1);
  assert.equal(r.model.courtyards[0].roofPolicy,'OPEN_TO_SKY');
  assert.equal(r.model.courtyards[0].roofable,false);
  assert.deepEqual(validateModel(r.model),[]);
});

test('explicit L mode is respected', async()=>{
  const r=await runMultiEngineDesign({plot:basePlot,rooms:defaultRooms(),shapeMode:'l'});
  assert.equal(r.selectedShape,'l');
  assert.equal(r.model.shape,'l');
  assert.equal(r.model.shapeFallback,false);
  assert.equal(r.model.courtyards.length,0);
});

test('AI design intent is normalized, traceable and changes AZIZ weight profile', async()=>{
  const intent={priorities:['privacy','daylight','privacy','bogus'],preferredShapes:['U','l','bad'],conceptDirections:[{label:'فناء خاص',shapeHint:'U',rationale:'تعزيز الخصوصية',tradeoffs:['زيادة المحيط']}]};
  const r=await runMultiEngineDesign({plot:basePlot,rooms:defaultRooms(),shapeMode:'auto',designIntent:intent});
  assert.deepEqual(r.designIntent.priorities,['privacy','daylight']);
  assert.deepEqual(r.designIntent.preferredShapes,['u','l']);
  assert.equal(r.designIntent.conceptDirections[0].shapeHint,'u');
  assert.equal(r.aziz.config.weights.privacy,3.2);
  assert.equal(r.aziz.config.weights.daylightPotential,2.8);
  const u=r.alternatives.find(x=>x.shape==='u');
  const rect=r.alternatives.find(x=>x.shape==='rect');
  assert.ok(u.confidence>rect.confidence,'preferred shape must influence confidence signal');
});

test('same inputs produce same selected shape, candidate id and scores', async()=>{
  const args={plot:basePlot,rooms:defaultRooms(),shapeMode:'auto',designIntent:{priorities:['privacy'],preferredShapes:['u']}};
  const a=await runMultiEngineDesign(args), b=await runMultiEngineDesign(args);
  assert.equal(a.selectedShape,b.selectedShape);
  assert.equal(a.aziz.selectedCandidateId,b.aziz.selectedCandidateId);
  assert.deepEqual(a.aziz.scores,b.aziz.scores);
});

test('integration never mutates plot, program or intent', async()=>{
  const plot=clone(basePlot), rooms=defaultRooms(), intent={priorities:['efficiency'],preferredShapes:['l']};
  const before=JSON.stringify({plot,rooms,intent});
  await runMultiEngineDesign({plot,rooms,designIntent:intent,shapeMode:'auto'});
  assert.equal(JSON.stringify({plot,rooms,intent}),before);
});

test('selected model preserves every requested room id and exact area', async()=>{
  const rooms=defaultRooms();
  const r=await runMultiEngineDesign({plot:basePlot,rooms,shapeMode:'auto'});
  for(const source of r.model.program){
    const actual=r.model.rooms.find(x=>x.id===source.id);
    assert.ok(actual,source.id);
    assert.equal(actual.area,source.area);
    assert.equal(actual.targetArea,source.area);
  }
});

test('malformed designIntent is safely ignored, not executed as instructions', async()=>{
  const r=await runMultiEngineDesign({plot:basePlot,rooms:defaultRooms(),shapeMode:'auto',designIntent:{priorities:null,preferredShapes:[{},'__proto__'],conceptDirections:[null,{label:7,shapeHint:'hack'}]}});
  assert.deepEqual(r.designIntent.priorities,[]);
  assert.deepEqual(r.designIntent.preferredShapes,[]);
  assert.equal(r.aziz.status,'selected');
});

test('small infeasible plot fails closed with explicit per-shape reasons', async()=>{
  const plot={...basePlot,width:8,length:8,streetSetback:3,neighborSetback:1.5};
  await assert.rejects(()=>runMultiEngineDesign({plot,rooms:defaultRooms(),shapeMode:'auto'}),/لم ينتج أي محرك تصوراً صالحاً/);
});

test('engineering layer never fabricates structural/MEP evaluation without source data', async()=>{
  const r=await runMultiEngineDesign({plot:basePlot,rooms:defaultRooms(),shapeMode:'rect'});
  assert.equal(r.engineering.coverage.structuralSystem,'NOT_EVALUATED_NO_STRUCTURAL_ELEMENTS');
  assert.equal(r.engineering.coverage.electricalLayout,'NOT_EVALUATED_NO_ELECTRICAL_EQUIPMENT');
  assert.equal(r.engineering.coverage.hvacSystem,'NOT_EVALUATED_SYSTEM_NOT_SELECTED');
  assert.equal(r.engineering.geometry.structuralElements.length,0);
});
