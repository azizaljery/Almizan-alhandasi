import test from 'node:test';
import assert from 'node:assert/strict';
import {generateModel,defaultRooms,placeOpening,removeOpening,openingPoint,validateModel} from '../dist/planner.mjs';
import {circulationNetwork} from '../dist/circulation.mjs';
const plot={width:20,length:30,floors:1,entry:'s',streets:{s:true}};
test('accepted room-door edit has a route for every room and disconnecting last door is atomic',()=>{
 const base=generateModel(plot,defaultRooms()), wall=base.walls.find(w=>w.id==='wall-6');
 const shared=placeOpening(base,{type:'door',point:{x:wall.x1+(wall.x2-wall.x1)*.25,y:wall.y1+(wall.y2-wall.y1)*.25}});
 const corridorDoor=shared.openings.find(o=>o.type==='door'&&o.roomId==='room-4');
 const edited=removeOpening(shared,openingPoint(shared,corridorDoor));
 assert.deepEqual(validateModel(edited),[]);
 const network=circulationNetwork(edited);
 for(const room of edited.rooms) assert.ok(network.toRoom(room.id),room.id);
 const onlyDoor=edited.openings.find(o=>o.type==='door'&&o.connects?.includes('room-4'));
 const before=structuredClone(edited);
 assert.throws(()=>removeOpening(edited,openingPoint(edited,onlyDoor)),/مسار|اتصال|وصول/);
 assert.deepEqual(edited,before);
});
