import test from 'node:test';
import assert from 'node:assert/strict';
import {generateModel,defaultRooms,placeOpening,removeOpening,openingPoint,validateModel,wallPieces} from '../dist/planner.mjs';
import {circulationNetwork} from '../dist/circulation.mjs';
import {RoomViewer} from '../dist/viewer3d.mjs';
const base=()=>generateModel({width:20,length:30,floors:1,entry:'s',streets:{s:true}},defaultRooms());
function roomAccessEdit(){const original=base(),wall=original.walls.find(w=>w.id==='wall-6');const added=placeOpening(original,{type:'door',point:{x:wall.x1+(wall.x2-wall.x1)*.25,y:wall.y1+(wall.y2-wall.y1)*.25}});const direct=added.openings.find(o=>o.type==='door'&&o.roomId==='room-4');return removeOpening(added,openingPoint(added,direct));}
function viewer(model){return {model,mode:'orbit',eye:{x:123,y:456},yaw:0,pitch:0,roof:{visible:true},render(){this.renders=(this.renders||0)+1;},onMode(){this.callbacks=(this.callbacks||0)+1;},renderer:{domElement:{focus(){}}}};}
function assertPhysical(model,route){const solids=wallPieces(model).filter(w=>w.bottom<1.6&&w.bottom+w.height>1.6);let length=0;for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i];assert.ok(Math.abs(a.x-b.x)<1e-6||Math.abs(a.y-b.y)<1e-6,'orthogonal segment');length+=Math.hypot(a.x-b.x,a.y-b.y);for(let t=.01;t<1;t+=.01){const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};for(const w of solids){const dx=p.x-w.x,dy=p.y-w.y;const along=dx*Math.cos(w.angle)+dy*Math.sin(w.angle),normal=-dx*Math.sin(w.angle)+dy*Math.cos(w.angle);assert.ok(!(Math.abs(along)<w.length/2-1e-6&&Math.abs(normal)<w.thickness/2-1e-6),`crossed ${w.wallId}`);}}}assert.ok(Math.abs(length-route.metres)<1e-6);}
test('room-to-room door edit yields physical orthogonal route after original corridor door removal',()=>{
 const model=roomAccessEdit();assert.deepEqual(validateModel(model),[]);const route=circulationNetwork(model).toRoom('room-4');assert.ok(route);assert.ok(route.spaces.includes('room-0'));assertPhysical(model,route);
});
test('viewer enters edited accessible room using connects without legacy roomId',()=>{
 const model=roomAccessEdit(),v=viewer(model);assert.equal(model.openings.some(o=>o.type==='door'&&o.roomId==='room-4'),false);assert.equal(RoomViewer.prototype.enter.call(v,'room-4'),true);assert.equal(v.mode,'inside');assert.equal(v.roof.visible,false);
});
test('unreachable room fails gracefully with camera and roof unchanged',()=>{
 const model=base();model.openings=model.openings.filter(o=>!o.connects?.includes('room-4'));const v=viewer(model),before={mode:v.mode,eye:{...v.eye},yaw:v.yaw,pitch:v.pitch,roof:{...v.roof}};
 assert.equal(RoomViewer.prototype.enter.call(v,'room-4'),false);assert.deepEqual({mode:v.mode,eye:v.eye,yaw:v.yaw,pitch:v.pitch,roof:v.roof},before);assert.equal(v.renders,undefined);assert.equal(v.callbacks,undefined);
});
test('connects wins over stale roomId for route and room entry',()=>{
 const model=base();for(const o of model.openings)if(o.type==='door')o.roomId='stale';const v=viewer(model);assert.ok(circulationNetwork(model).toRoom('room-4'));assert.equal(RoomViewer.prototype.enter.call(v,'room-4'),true);
});
test('a forged connects room reference cannot create a physical room route',()=>{
 const model=base();model.openings=model.openings.filter(o=>!o.connects?.includes('room-4'));
 const wrong=model.openings.find(o=>o.type==='door'&&o.connects?.includes('room-0'));wrong.connects=wrong.connects.map(id=>id==='room-0'?'room-4':id);
 assert.equal(circulationNetwork(model).toRoom('room-4'),null);assert.equal(RoomViewer.prototype.enter.call(viewer(model),'room-4'),false);
});
test('missing door wall fails gracefully before viewer state mutation',()=>{
 const model=base();for(const o of model.openings.filter(o=>o.connects?.includes('room-4')))o.wallId='missing-wall';
 const v=viewer(model);assert.equal(RoomViewer.prototype.enter.call(v,'room-4'),false);assert.equal(v.mode,'orbit');assert.equal(v.roof.visible,true);assert.equal(v.renders,undefined);
});
