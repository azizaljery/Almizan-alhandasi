import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomViewer } from '../dist/viewer3d.mjs';
import { generateModel, defaultRooms, wallPieces, center, openingPoint } from '../dist/planner.mjs';

// Minimal Three/DOM doubles exercise our geometry and controller logic, not WebGL rendering.
class Vector3 { constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); } set(x, y, z) { Object.assign(this, { x, y, z }); } }
class Group {
  constructor() { this.children = []; this.position = new Vector3(); this.rotation = {}; this.visible = true; }
  add(...objects) { this.children.push(...objects); } clear() { this.children = []; }
  traverse(fn) { fn(this); this.children.forEach(o => o.traverse ? o.traverse(fn) : fn(o)); }
}
class Geometry { constructor(...args) { this.args = args; } setFromPoints(p) { this.points = p; return this; } dispose() { this.disposed = true; } }
class Material { constructor(props) { Object.assign(this, props); } dispose() { this.disposed = true; } }
class Mesh extends Group { constructor(g, m) { super(); this.geometry = g; this.material = m; } computeLineDistances() {} }
class Camera extends Group { constructor() { super(); } updateProjectionMatrix() {} lookAt(...args) { this.look = args; } }
class Canvas extends EventTarget { setAttribute() {} setPointerCapture() {} focus() {} remove() { this.removed = true; } }
class Renderer { constructor() { this.domElement = new Canvas(); this.renders = 0; } setPixelRatio() {} setSize(w, h) { this.size = [w, h]; } render() { this.renders++; } dispose() { this.disposed = true; } }
const fakeThree = { Scene: Group, Color: class { constructor(value) { this.value = value; } }, PerspectiveCamera: Camera, WebGLRenderer: Renderer, HemisphereLight: Group, DirectionalLight: Group, Group, Vector3, Mesh, BoxGeometry: Geometry, MeshStandardMaterial: Material, BufferGeometry: Geometry, Line: Mesh, LineDashedMaterial: Material, SRGBColorSpace: 'srgb' };
globalThis.THREE = fakeThree;
globalThis.ResizeObserver = class { observe() {} disconnect() { this.disconnected = true; } };
const plot = { width: 20, length: 30, floors: 1, entry: 's', streets: { s: true } }, model = generateModel(plot, defaultRooms());
const container = () => ({ clientWidth: 950, clientHeight: 500, canvases: [], prepend(c) { this.canvases.push(c); } });

test('Claude model renders through the existing 3D geometry controller', () => {
  const claude = generateModel(plot, defaultRooms(), { strategy: 'claude-rect' });
  const viewer = new RoomViewer(container());
  viewer.setModel(claude);
  assert.ok(viewer.group.children.length > claude.rooms.length);
  for (const object of viewer.group.children) {
    if (object.position) assert.ok([object.position.x, object.position.y, object.position.z].every(Number.isFinite));
  }
  viewer.destroy();
});

test('3D reuses one renderer, builds wall pieces with real openings, and disposes prior geometry', () => {
  const box = container(), v = new RoomViewer(box); v.setModel(model);
  const render = v.renderer, previous = [...v.group.children], pieces = wallPieces(model);
  for (const p of pieces) assert.ok(v.group.children.some(mesh => mesh.geometry?.args[0] === p.length && mesh.geometry?.args[1] === p.height && mesh.geometry?.args[2] === p.thickness && Math.abs(mesh.position.x - p.x) < 1e-6 && Math.abs(mesh.position.z + p.y) < 1e-6));
  assert.equal(v.roof.visible, false);
  for (let i = 0; i < 3; i++) v.setModel(model, 'modern');
  assert.equal(box.canvases.length, 1); assert.equal(v.renderer, render);
  assert.ok(previous.every(o => !o.geometry || o.geometry.disposed)); assert.ok(previous.every(o => !o.material || o.material.disposed));
  v.destroy(); assert.equal(render.disposed, true); assert.equal(render.domElement.removed, true);
});

test('room entry uses eye-level camera, roof is hidden, and wall collision permits a door passage', () => {
  const v = new RoomViewer(container()); v.setModel(model); v.setRoof(true);
  const room = model.rooms.find(r => r.corridorId === 'spine'); v.enter(room.id);
  assert.equal(v.mode, 'inside'); assert.equal(v.roof.visible, false); assert.equal(v.camera.position.y, 1.6);
  const c = center(room); assert.equal(v.eye.x, c.x); assert.equal(v.eye.y, c.y);
  const door = model.openings.find(o => o.roomId === room.id && o.type === 'door'), p = openingPoint(model, door), wall = model.walls.find(w => w.id === door.wallId);
  assert.equal(v.blocked(p.x, p.y), false);
  const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1), shift = door.w / 2 + .4;
  assert.equal(v.blocked(p.x + (wall.x2 - wall.x1) / len * shift, p.y + (wall.y2 - wall.y1) / len * shift), true);
  // Camera initially looks at the room's door. A short crossing must enter the spine.
  const dx = p.x - c.x, dy = p.y - c.y, distance = Math.hypot(dx, dy);
  v.eye = { x: p.x - dx / distance * .5, y: p.y - dy / distance * .5 }; v.move('forward', 1.2);
  assert.ok(Math.hypot(v.eye.x - p.x, v.eye.y - p.y) > .5);
  v.view('top'); assert.equal(v.mode, 'orbit'); assert.equal(v.phi, .02); v.destroy();
});

test('roof choice survives camera presets and sun lighting updates for day and night', () => {
  const v = new RoomViewer(container()); v.setModel(model);
  v.setRoof(true);
  v.view('top'); assert.equal(v.roof.visible, true);
  v.view('front'); assert.equal(v.roof.visible, true);
  v.view('persp'); assert.equal(v.roof.visible, true);
  v.setSun({ visible: true, azimuth: 140, altitude: 32 });
  assert.equal(v.sunLight.visible, true);
  assert.equal(v.ambientLight.intensity, 1.5);
  assert.ok(v.sunLight.position.y > 0);
  v.setSun({ visible: false, azimuth: 140, altitude: -8 });
  assert.equal(v.sunLight.visible, false);
  assert.equal(v.ambientLight.intensity, 1.5);
  assert.equal(v.fillLight.intensity, .55);
  v.destroy();
});

test('hidden 3D does not render and resize reuses the same canvas', () => {
  const box = container(), v = new RoomViewer(box); v.setModel(model); v.setVisible(false); const before = v.renderer.renders;
  v.render(); v.resize(); assert.equal(v.renderer.renders, before);
  box.clientWidth = 390; box.clientHeight = 450; v.setVisible(true); assert.deepEqual(v.renderer.size, [390, 450]); assert.equal(v.camera.aspect, 390 / 450);
  assert.ok(v.renderer.renders > before); v.destroy();
});

test('missing Three and unavailable WebGL fail with actionable messages', () => {
  delete globalThis.THREE; assert.throws(() => new RoomViewer(container()), /تعذّر تحميل/);
  globalThis.THREE = { ...fakeThree, WebGLRenderer: class { constructor() { throw Error('unavailable'); } } };
  assert.throws(() => new RoomViewer(container()), /WebGL/); globalThis.THREE = fakeThree;
});

test('low sun keeps its true altitude and below-horizon light is disabled', () => {
  const v=new RoomViewer(container());v.setModel(model);v.setSun({visible:true,azimuth:90,altitude:1});
  const b=model.building,dx=v.sunLight.position.x-(b.x+b.w/2),dz=v.sunLight.position.z-(-b.y-b.h/2);
  assert.ok(Math.abs(Math.atan2(v.sunLight.position.y,Math.hypot(dx,dz))*180/Math.PI-1)<1e-9);
  v.setSun({visible:true,azimuth:90,altitude:-1});assert.equal(v.sunLight.visible,false);v.destroy();
});
test('context loss stops rendering and restoration retains exact model and renderer',()=>{
 const states=[],v=new RoomViewer(container(),null,{onState:s=>states.push(s)});v.setModel(model);const renderer=v.renderer,before=renderer.renders,snapshot=JSON.stringify(model);
 const lost=new Event('webglcontextlost',{cancelable:true});renderer.domElement.dispatchEvent(lost);assert.equal(lost.defaultPrevented,true);v.render();assert.equal(renderer.renders,before);assert.equal(states.at(-1).status,'context-lost');
 renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));assert.equal(states.at(-1).status,'ready');assert.equal(v.renderer,renderer);assert.equal(JSON.stringify(v.model),snapshot);assert.ok(renderer.renders>before);v.destroy();
});
test('inside hides roof temporarily and exterior restores the explicit roof choice',()=>{
 const v=new RoomViewer(container());v.setModel(model);v.setRoof(true);v.enter(model.rooms[0].id);assert.equal(v.roof.visible,false);v.view('persp');assert.equal(v.roof.visible,true);v.destroy();
});
test('roof uses modeled footprints without invented overhangs and silhouette ornaments',()=>{
 const v=new RoomViewer(container());v.setModel(model,'resort');const zones=[...model.rooms,...model.corridors];assert.equal(v.roof.children.length,zones.length);
 zones.forEach((r,i)=>{assert.equal(v.roof.children[i].geometry.args[0],r.w);assert.equal(v.roof.children[i].geometry.args[2],r.h);});assert.equal(v.illustrativeFurniture,false);v.destroy();
});
test('orbit presets animate on demand, cancel on model replacement, and respect reduced motion',()=>{
 const frames=new Map();let seq=0;globalThis.requestAnimationFrame=fn=>{frames.set(++seq,fn);return seq;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 try{const v=new RoomViewer(container(),null,{transitionMs:320});v.setModel(model);const start=v.phi;v.view('front');assert.equal(v.phi,start);assert.equal(frames.size,1);
 const tick=t=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(t));};tick(0);tick(160);assert.ok(v.phi>start&&v.phi<1.3);tick(320);assert.equal(v.phi,1.3);assert.equal(frames.size,0);
 v.view('top');assert.equal(frames.size,1);v.setModel(model);assert.equal(frames.size,0);v.view('front');v.renderer.domElement.dispatchEvent(new Event('wheel',{cancelable:true}));assert.equal(frames.size,0);v.destroy();
 const reduced=new RoomViewer(container(),null,{reducedMotion:true});reduced.setModel(model);reduced.view('front');assert.equal(reduced.phi,1.3);assert.equal(frames.size,0);reduced.destroy();
 }finally{delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;}
});

test('destroy releases shared textures, materials, shadows and renderer lists exactly once',()=>{
 const v=new RoomViewer(container());v.setModel(model);let textures=0,shadows=0,lists=0;
 const texture={dispose(){textures++;}};v.textures={stone:texture,wood:texture};v.sunLight.shadow={map:{dispose(){shadows++;}},mapPass:{dispose(){shadows++;}}};v.renderer.renderLists={dispose(){lists++;}};
 const geometry=v.group.children.find(o=>o.geometry).geometry;v.destroy();v.destroy();assert.equal(textures,1);assert.equal(shadows,2);assert.equal(lists,1);assert.equal(geometry.disposed,true);assert.equal(v.resizeObserver.disconnected,true);
});
test('failed restoration reports unavailable, preserves model and remains render-suspended',()=>{
 const states=[],v=new RoomViewer(container(),null,{onState:s=>states.push(s)});v.setModel(model);v.renderer.domElement.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
 v.renderer.render=()=>{throw Error('GPU unavailable');};v.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));assert.equal(states.at(-1).status,'unavailable');assert.equal(v.contextLost,true);assert.equal(v.model,model);assert.doesNotThrow(()=>v.render());v.destroy();
});
test('inside entry and hidden viewer cancel exterior camera frames without flying through walls',()=>{
 const frames=new Map();let seq=0;globalThis.requestAnimationFrame=fn=>{frames.set(++seq,fn);return seq;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 try{const v=new RoomViewer(container());v.setModel(model);v.view('front');assert.equal(frames.size,1);v.enter(model.rooms[0].id);assert.equal(frames.size,0);assert.equal(v.camera.position.y,1.6);v.view('persp');assert.equal(frames.size,0);v.view('top');assert.equal(frames.size,1);v.setVisible(false);assert.equal(frames.size,0);const before=v.renderer.renders;v.render();assert.equal(v.renderer.renders,before);v.destroy();}finally{delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;}
});

test('measured sustained cost lowers quality once; isolated slow frames and hardware guesses do not',()=>{
 let time=0,cost=30;const v=new RoomViewer(container(),null,{now:()=>{time+=cost;return time;}});v.setModel(model);const snapshot=JSON.stringify(model);
 for(let i=0;i<12;i++)v.render();assert.equal(v.getPerformanceStats().tier,'low');assert.equal(v.getPerformanceStats().pixelRatioCap,1);assert.match(v.getPerformanceStats().reason,/12 consecutive/);cost=1;for(let i=0;i<20;i++)v.render();assert.equal(v.getPerformanceStats().tier,'low');assert.equal(JSON.stringify(model),snapshot);v.destroy();
 const balanced=new RoomViewer(container(),null,{now:()=>0});balanced.setModel(model);balanced.measureQuality(30);balanced.measureQuality(1);assert.equal(balanced.getPerformanceStats().tier,'balanced');balanced.renderer.info={render:{calls:1001,triangles:20}};for(let i=0;i<3;i++)balanced.render();assert.equal(balanced.getPerformanceStats().tier,'low');balanced.destroy();
});
test('no directional sun is invented before an explicit calculated solar preview',()=>{const v=new RoomViewer(container());v.setModel(model);assert.equal(v.sunLight.visible,false);v.destroy();});

test('changing reduced-motion preference finishes active transition and removes future animation frames',()=>{
 const frames=new Map(),query=new EventTarget();query.matches=false;let id=0;const previousMatch=globalThis.matchMedia;globalThis.matchMedia=()=>query;globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 try{const v=new RoomViewer(container());v.setModel(model);v.view('front');assert.equal(frames.size,1);const event=new Event('change');event.matches=true;query.dispatchEvent(event);assert.equal(v.reducedMotion,true);assert.equal(v.phi,1.3);assert.equal(frames.size,0);v.view('top');assert.equal(v.phi,.02);assert.equal(v.currentViewName,'top');v.destroy();}finally{if(previousMatch)globalThis.matchMedia=previousMatch;else delete globalThis.matchMedia;delete globalThis.requestAnimationFrame;delete globalThis.cancelAnimationFrame;}
});

test('openings contribute only glazing at exact window bounds, without invented frames or door lintels',()=>{
 const v=new RoomViewer(container());v.setModel(model);const glass=v.group.children.filter(mesh=>mesh.material?.opacity===.34),windows=model.openings.filter(o=>o.type==='window');assert.equal(glass.length,windows.length);
 windows.forEach((o,i)=>{const point=openingPoint(model,o);assert.deepEqual(glass[i].geometry.args,[o.w,o.h,.045]);assert.equal(glass[i].position.x,point.x);assert.equal(glass[i].position.y,o.sill+o.h/2);assert.equal(glass[i].position.z,-point.y);});
 const nonWallCount=v.group.children.filter(mesh=>mesh.geometry).length-v.pieces.length;
 v.setModel({...model,openings:[]});const sealedNonWallCount=v.group.children.filter(mesh=>mesh.geometry).length-v.pieces.length;
 assert.equal(nonWallCount-sealedNonWallCount,windows.length,'only one glazing surface per modeled window; doors add no unmodeled hardware');v.destroy();
});

test('neutral preview lighting remains legible for missing latitude and night without inventing sun',()=>{const v=new RoomViewer(container());v.setModel(model);v.setSun({status:'not-calculated',visible:false});assert.equal(v.sunLight.visible,false);assert.ok(v.ambientLight.intensity>=1.5);assert.ok(v.studioLight.intensity>=1);assert.equal(v.studioLight.castShadow,false);const before=[v.ambientLight.intensity,v.studioLight.intensity,v.fillLight.intensity];v.setSun({visible:true,azimuth:140,altitude:32});assert.deepEqual([v.ambientLight.intensity,v.studioLight.intensity,v.fillLight.intensity],before);v.setSun({visible:false,azimuth:140,altitude:-8});assert.deepEqual([v.ambientLight.intensity,v.studioLight.intensity,v.fillLight.intensity],before);assert.equal(v.sunLight.visible,false);v.destroy();});
