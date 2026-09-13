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
