import test from 'node:test';
import assert from 'node:assert/strict';
import { spatialRelationDescriptor, spatialRelationDistance } from '../dist/spatial-relations.mjs';
import { generateModel } from '../dist/claude/planner.mjs';
import { defaultRooms } from '../dist/planner.mjs';
const plot = { width: 35, length: 45, floors: 1, entry: 's', streets: { s: true }, shape: 'rect' };
const original = () => generateModel(plot, defaultRooms());
function transformed(model, point) {
  const out = structuredClone(model);
  const rect = r => { const p = [point(r.x,r.y),point(r.x+r.w,r.y),point(r.x,r.y+r.h),point(r.x+r.w,r.y+r.h)]; const x=Math.min(...p.map(p=>p.x)), y=Math.min(...p.map(p=>p.y)); return {...r,x,y,w:Math.max(...p.map(p=>p.x))-x,h:Math.max(...p.map(p=>p.y))-y}; };
  for(const key of ['rooms','corridors','reserves','courtyards','massingParts']) if(out[key])out[key]=out[key].map(rect);
  for(const key of ['building','boundingBox','footprint']) if(out[key])out[key]=rect(out[key]);
  if(out.buildingFootprint)out.buildingFootprint=out.buildingFootprint.map(p=>point(p.x,p.y));
  out.walls=out.walls.map(w=>{const a=point(w.x1,w.y1),b=point(w.x2,w.y2);return {...w,x1:a.x,y1:a.y,x2:b.x,y2:b.y};});
  return out;
}
function renamed(model) {
  const out=structuredClone(model), ids=new Map(); let n=0;
  for(const key of ['rooms','corridors','walls','openings'])for(const row of out[key])ids.set(row.id,`anonymous-${n++}`);
  const id=x=>ids.get(x)??x;
  for(const key of ['rooms','corridors','walls','openings'])out[key]=out[key].map(row=>({...row,id:id(row.id),name:'different',...(row.wallId?{wallId:id(row.wallId)}:{}),...(row.roomId?{roomId:id(row.roomId)}:{}),...(row.corridorId?{corridorId:id(row.corridorId)}:{}),...(row.connects?{connects:row.connects.map(id)}:{})})).reverse();
  out.links=out.links.map(pair=>pair.map(id)).reverse();
  return out;
}
test('native generated rectangle has verified actual shared-wall and rooted access evidence',()=>{
  const descriptor=spatialRelationDescriptor(original());
  assert.equal(descriptor.valid,true,JSON.stringify(descriptor.issues));
  assert.ok(descriptor.evidence.sharedWalls.length>0);
  assert.ok(descriptor.evidence.accessEdges.some(edge=>edge.kind==='link'));
  assert.ok(descriptor.evidence.roomAccess.every(room=>room.depth>=2));
});
test('full geometric transforms, consistent ID renaming, and input ordering cannot earn novelty',()=>{
  const model=original(),base=spatialRelationDescriptor(model);
  for(const other of [renamed(model),transformed(model,(x,y)=>({x:x+71,y:y-37})),transformed(model,(x,y)=>({x:-y,y:x})),transformed(model,(x,y)=>({x:90-x,y}))]){
    const descriptor=spatialRelationDescriptor(other);
    assert.equal(descriptor.valid,true,JSON.stringify(descriptor.issues));
    assert.equal(descriptor.fingerprint,base.fingerprint);
    assert.equal(spatialRelationDistance(base,descriptor),0);
  }
});
test('forged access through a remote hosted door is rejected and earns no novelty',()=>{
  const model=original(),base=spatialRelationDescriptor(model),copy=structuredClone(model);
  const door=copy.openings.find(o=>o.type==='door'&&o.roomId);
  door.connects[0]=copy.rooms.find(r=>r.id!==door.roomId&&r.type==='bedroom').id;
  const bad=spatialRelationDescriptor(copy);
  assert.equal(bad.valid,false);assert.ok(bad.issues.some(issue=>issue.code==='DOOR_NOT_PHYSICAL'));
  assert.equal(spatialRelationDistance(base,bad),0);
});
test('disconnected corridor metadata cannot create a physical branch',()=>{
  const model=original(),base=spatialRelationDescriptor(model),copy=structuredClone(model);
  const corridor=copy.corridors.find(c=>c.id===copy.links[0][1]);corridor.x+=100;
  const bad=spatialRelationDescriptor(copy);
  assert.equal(bad.valid,false);assert.ok(bad.issues.some(issue=>issue.code==='LINK_NOT_PHYSICAL'));
  assert.equal(spatialRelationDistance(base,bad),0);
});
test('malformed or incomplete evidence cannot earn novelty',()=>{
  const base=spatialRelationDescriptor(original());
  for(const value of [{}, {...original(),walls:[]}, {...original(),openings:[]}]){
    const bad=spatialRelationDescriptor(value);assert.equal(bad.valid,false);assert.equal(spatialRelationDistance(base,bad),0);
  }
});
test('missing solid wall and invalid corridor rectangles cannot gain relationship novelty',()=>{
  const model=original(),base=spatialRelationDescriptor(model),without=structuredClone(model);
  const sharedId=base.evidence.sharedWalls[0].walls[0];
  without.walls=without.walls.filter(w=>w.id!==sharedId);
  const bad=spatialRelationDescriptor(without);assert.equal(bad.valid,false);assert.equal(spatialRelationDistance(base,bad),0);
  const malformed=structuredClone(model);malformed.corridors[0].w=NaN;
  assert.equal(spatialRelationDescriptor(malformed).valid,false);
});
test('cosmetic corridor segmentation cannot earn access novelty',()=>{
  const model=original(),copy=structuredClone(model),branch=copy.corridors.find(c=>c.id.includes('middle-right'));
  assert.ok(branch&&branch.w>branch.h);
  const left={...branch,id:branch.id+'-a',w:branch.w/2},right={...branch,id:branch.id+'-b',x:branch.x+branch.w/2,w:branch.w/2};
  copy.corridors=copy.corridors.filter(c=>c.id!==branch.id).concat(left,right);
  copy.links=copy.links.map(pair=>pair.map(id=>id===branch.id?left.id:id));copy.links.push([left.id,right.id]);
  for(const door of copy.openings.filter(o=>o.connects?.includes(branch.id))){const wall=copy.walls.find(w=>w.id===door.wallId),x=wall.x1+(wall.x2-wall.x1)*door.pos;door.connects=door.connects.map(id=>id===branch.id?(x<right.x?left.id:right.id):id);}
  const a=spatialRelationDescriptor(model),b=spatialRelationDescriptor(copy);
  assert.equal(b.valid,true,JSON.stringify(b.issues));assert.equal(spatialRelationDistance(a,b),0);assert.equal(a.fingerprint,b.fingerprint);
});
test('actual native packing variants differ through physical adjacency or access branching', async()=>{
  const {defaultRooms:nativeRooms}=await import('../dist/claude/planner.mjs');
  const p={...plot,width:30,length:40},models=[0,1,2].map(variant=>generateModel(p,nativeRooms(),{search:{variant}}));
  const descriptors=models.map(spatialRelationDescriptor);
  assert.ok(descriptors.every(d=>d.valid),JSON.stringify(descriptors.map(d=>d.issues)));
  assert.ok(spatialRelationDistance(descriptors[0],descriptors[1])>.12);
  assert.ok(spatialRelationDistance(descriptors[0],descriptors[2])>.12);
});
test('splitting a physical wall into collinear segments does not create diversity',()=>{
  const model=original(),copy=structuredClone(model);
  const wall=copy.walls.find(w=>!copy.openings.some(o=>o.wallId===w.id));assert.ok(wall);
  const a={...wall,id:wall.id+'-a',x2:(wall.x1+wall.x2)/2,y2:(wall.y1+wall.y2)/2};
  const b={...wall,id:wall.id+'-b',x1:a.x2,y1:a.y2};
  copy.walls=copy.walls.filter(w=>w.id!==wall.id).concat(a,b);
  const before=spatialRelationDescriptor(model),after=spatialRelationDescriptor(copy);
  assert.equal(after.valid,true,JSON.stringify(after.issues));assert.equal(after.fingerprint,before.fingerprint);
});
test('opening claims cannot join corridors across a solid wall',()=>{
  const model=original(),copy=structuredClone(model),[aId,bId]=copy.links[0],a=copy.corridors.find(c=>c.id===aId),b=copy.corridors.find(c=>c.id===bId);
  const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),top=Math.min(a.y+a.h,b.y+b.h);
  copy.walls.push({id:'forged-blocker',type:'int',t:.15,h:3.2,x1:x,y1:y,x2:x,y2:top});
  const bad=spatialRelationDescriptor(copy);assert.equal(bad.valid,false);assert.ok(bad.issues.some(issue=>issue.code==='LINK_NOT_PHYSICAL'));
});
test('ambiguous fine corridor tessellation is unsupported evidence and cannot earn novelty',()=>{
  const model=original(),copy=structuredClone(model),branch=copy.corridors.find(c=>c.id.includes('middle-right'));
  const parts=[{...branch,id:'fine-0',w:.05},{...branch,id:'fine-1',x:branch.x+.05,w:.05},{...branch,id:'fine-2',x:branch.x+.1,w:branch.w-.1}];
  copy.corridors=copy.corridors.filter(c=>c.id!==branch.id).concat(parts);
  copy.links=copy.links.map(pair=>pair.map(id=>id===branch.id?parts[0].id:id));
  for(let i=1;i<parts.length;i++)copy.links.push([parts[i-1].id,parts[i].id]);
  for(const door of copy.openings.filter(o=>o.connects?.includes(branch.id))){const wall=copy.walls.find(w=>w.id===door.wallId),x=wall.x1+(wall.x2-wall.x1)*door.pos;const part=parts.find(part=>x>=part.x&&x<=part.x+part.w);door.connects=door.connects.map(id=>id===branch.id?part.id:id);}
  const before=spatialRelationDescriptor(model),after=spatialRelationDescriptor(copy);
  assert.equal(after.valid,false);assert.ok(after.issues.some(issue=>issue.code==='CORRIDOR_SEGMENTATION_AMBIGUOUS'));assert.equal(spatialRelationDistance(before,after),0);
});
test('native rect, L and U remain supported including overlapping bridge corridors',async()=>{
  const {defaultRooms:nativeRooms}=await import('../dist/claude/planner.mjs');
  for(const shape of ['rect','l','u']){
    const model=generateModel({...plot,width:40,length:50,shape},nativeRooms().map(room=>({...room,side:'any'})));
    const descriptor=spatialRelationDescriptor(model);assert.equal(descriptor.valid,true,shape+JSON.stringify(descriptor.issues));
  }
});
