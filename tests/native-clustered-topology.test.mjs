import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, routeObjective, validateModel } from '../dist/claude/planner.mjs';
import { defaultRooms, normalizeRooms } from '../dist/planner.mjs';
const plot={width:35,length:45,entry:'s',streets:{s:true},floors:1,coverage:.75,streetSetback:3,neighborSetback:1.5,shape:'rect'};
test('clustered search creates connected short halls instead of a full depth central spine',()=>{
 const model=generateModel(plot,defaultRooms(),{search:{topology:'clustered',variant:0}});
 assert.deepEqual(validateModel(model),[]);
 assert.deepEqual(model.program,normalizeRooms(defaultRooms()));
 assert.ok(model.corridors.some(c=>c.id.startsWith('vestibule-')));
 assert.ok(!model.corridors.some(c=>c.h>model.building.h*.9));
 assert.ok(new Set(model.corridors.filter(c=>c.id.startsWith('hall-')).map(c=>c.x)).size>1);
});
test('route objective follows the physical linked corridor graph, independent of array order',()=>{
 const geometry={
  corridors:[
   {id:'hall-front',x:0,y:0,w:2,h:2},
   {id:'vestibule',x:0,y:2,w:2,h:1},
   {id:'hall-back',x:0,y:3,w:2,h:2},
   {id:'unrelated',x:10,y:0,w:2,h:2},
  ],
  rooms:[
   {id:'majlis',corridorId:'hall-front',doorSide:'left',x:2.15,y:.5,w:3,h:1},
   {id:'dining',corridorId:'hall-back',doorSide:'left',x:2.15,y:3.5,w:3,h:1},
  ],links:[['hall-front','vestibule'],['vestibule','hall-back']],
 };
 const relation=[{roomIds:['majlis','dining'],relation:'near',weight:1}];
 const score=routeObjective(geometry,relation);
 assert.ok(Number.isFinite(score)&&score>0);
 assert.equal(routeObjective({...geometry,corridors:[...geometry.corridors].reverse()},relation),score);
 assert.ok(routeObjective({...geometry,links:[]},relation)>score);
});
