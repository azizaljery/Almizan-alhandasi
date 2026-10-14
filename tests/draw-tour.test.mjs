import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { buildBuildingScene } from '../dist/draw/scene3d.mjs';
import { planDrawTour, runDrawTour, TOUR, ENTRY_AZIMUTH } from '../dist/draw/tour.mjs';

const room = (key, type, area, x, y, level = 0, extra = {}) => ({ key, name: key, type, area, levelIndex: level, inside: { x, y }, centroid: { x: x + 1, y }, open: false, ...extra });

test('the plan is an orbit, an approach to the door, then the rooms: entrance first, then a walk through the level', () => {
  const rooms = [room('bed', 'bedroom', 12, 10, 10), room('hall', 'entrance', 6, 2, 1), room('maj', 'majlis', 20, 3, 4), room('liv', 'living', 18, 8, 3), room('bath', 'bath', 4, 11, 9)];
  const plan = planDrawTour(rooms, { entry: 'e' });
  assert.deepEqual(plan.segments.slice(0, 2).map(s => s.kind), ['orbit', 'approach']);
  assert.equal(plan.entryAzimuthDeg, 90);
  assert.deepEqual(plan.segments.slice(2).map(s => s.key), ['hall', 'maj', 'liv', 'bath', 'bed'], 'nearest-neighbour route from the entrance hall');
  assert.equal(plan.rooms, 5);
  assert.equal(plan.totalMs, TOUR.orbitMs + TOUR.approachMs + 5 * TOUR.roomMs);
  assert.deepEqual(Object.keys(ENTRY_AZIMUTH).sort(), ['e', 'n', 's', 'w']);
});

test('too many rooms: the important ones are kept, tiny and open-air spaces are left out, levels go bottom-up', () => {
  const rooms = [
    ...Array.from({ length: 8 }, (_, i) => room('store' + i, 'storage', 3 + i, i, 0)),
    room('maj', 'majlis', 20, 0, 5), room('kit', 'kitchen', 10, 3, 5), room('up-bed', 'bedroom', 14, 0, 0, 1), room('closet', 'storage', 1.2, 1, 1),
    room('yard', 'courtyard', 40, 5, 5, 0, { open: true }),
  ];
  const plan = planDrawTour(rooms, { maxRooms: 4 });
  const keys = plan.segments.slice(2).map(s => s.key);
  // majlis, kitchen and the upstairs bedroom outrank storage; the roomiest store fills the 4th place.
  // ground floor first (walking from the majlis to the nearest room), then the upper level.
  assert.deepEqual(keys, ['maj', 'kit', 'store7', 'up-bed']);
  assert.ok(!keys.includes('yard') && !keys.includes('closet'), 'open-air and tiny spaces are not visited');
  assert.equal(planDrawTour(rooms, { maxRooms: 0 }).rooms, 0);
});

test('timings are clamped and bad input never throws', () => {
  const p = planDrawTour([room('a', 'living', 12, 0, 0)], { orbitMs: 1, approachMs: 1, roomMs: 999999, maxRooms: 'x' });
  assert.equal(p.segments[0].ms, 2000); assert.equal(p.segments[1].ms, 500);
  assert.equal(planDrawTour(null).segments.length, 2);
  assert.equal(planDrawTour([null, {}, { key: 'x' }]).rooms, 0);
  assert.equal(planDrawTour([room('a', 'living', 12, 0, 0)], { roomMs: 999999 }).segments[2].ms, 10000);
});

test('each stop looks from the doorway across the room and sweeps through its length', () => {
  const plan = planDrawTour([room('a', 'living', 12, 0, 0, 0, { centroid: { x: 0, y: 4 } })], { sweepDeg: 200 });
  const seg = plan.segments[2];
  assert.equal(seg.heading0, 0 - 100, 'looking north at the centre, starting 100 degrees to the left');
  assert.equal(seg.sweepDeg, 200);
  assert.equal(planDrawTour([room('b', 'living', 12, 1, 1, 0, { centroid: { x: 1, y: 1 } })]).segments[2].heading0, -TOUR.sweepDeg / 2, 'a room centred on the stop point: no preferred direction');
});

// ---------------------------------------------------------------------------------------------- runner with a recording fake of DrawViewer
function fakeViewer(keys) {
  const target = new THREE.Vector3(6, 3, -7);
  const v = {
    built: { rooms: new Map(keys.map(k => [k, {}])) }, disposed: false, lost: false, tween: 'x', mode: 'walk', walk: { yaw: 0, pitch: 0 }, orbit: { dist: 40, target }, calls: [], orbits: [], renders: 0,
    showLevel(l) { this.calls.push(['showLevel', l]); }, setMode(m) { this.calls.push(['setMode', m]); this.mode = m; }, frameBuilding() { this.calls.push(['frame']); },
    orbitTo(o) { this.orbits.push(o); }, walkToRoom(k, h) { this.calls.push(['walkToRoom', k, h]); this.walk.yaw = h * Math.PI / 180; }, walkPose() { return { yaw: this.walk.yaw }; },
    applyPose(p) { this.poses = [...(this.poses || []), p]; }, renderNow() { this.renders++; },
  };
  return v;
}
const clock = () => { let t = 0; const q = []; return { now: () => t, raf: fn => q.push(fn), run: (ms = 100) => { while (q.length) { t += ms; q.shift()(); } } }; };

test('the runner turns once around the building from the entrance side, approaches, then looks around each room', async () => {
  const v = fakeViewer(['a', 'b']), c = clock(), seen = [], kinds = [], frames = [];
  const plan = planDrawTour([room('a', 'entrance', 6, 0, 0), room('b', 'living', 14, 4, 0)], { entry: 'n', orbitMs: 2000, approachMs: 1000, roomMs: 1000 });
  const done = runDrawTour({ viewer: v, plan, raf: c.raf, now: c.now, onProgress: p => { seen.push(p.index); kinds.push(p.segment.kind); }, afterFrame: () => frames.push(v.renders) });
  c.run(100);
  assert.equal(await done, true);
  assert.equal(v.tween, null, 'any running camera transition is cancelled');
  assert.deepEqual(v.calls.slice(0, 3), [['showLevel', 'all'], ['setMode', 'orbit'], ['frame']]);
  const nOrbit = kinds.filter(k => k === 'orbit').length, az = v.orbits.slice(0, nOrbit).map(o => o.azimuthDeg);
  assert.equal(az[0] >= 180 && az[0] < 200, true, 'starts on the entrance side (north)');
  assert.ok(Math.abs(az.at(-1) - 540) < 1e-6, 'ends one full turn later, facing the entrance again: ' + az.at(-1));
  assert.ok(az.every((a, i) => i === 0 || a >= az[i - 1] - 1e-9), 'the orbit never turns back');
  const approach = v.orbits.slice(nOrbit); assert.equal(approach.length, kinds.filter(k => k === 'approach').length); assert.ok(approach.at(-1).distance < 40 * .55, 'the approach closes in on the door'); assert.equal(approach.at(-1).azimuthDeg, 180);
  assert.deepEqual(v.calls.filter(x => x[0] === 'walkToRoom').map(x => x[1]), ['a', 'b']);
  assert.ok(v.renders > 0 && frames.length === v.renders, 'every frame is drawn and handed to the recorder right after');
  assert.deepEqual([...new Set(seen)], [0, 1, 2, 3]);
  const yaws = v.poses.map(p => p.yaw); assert.ok(yaws.some((y, i) => i && y > yaws[i - 1]), 'the view sweeps while standing in a room');
});

test('the runner stops cleanly: abort, disposed viewer, lost context, missing model or room', async () => {
  const plan = planDrawTour([room('a', 'living', 12, 0, 0)], { orbitMs: 2000, roomMs: 1000 });
  for (const make of [
    () => { const v = fakeViewer(['a']), ac = new AbortController(); return { v, signal: ac.signal, after: () => ac.abort() }; },
    () => { const v = fakeViewer(['a']); return { v, after: () => { v.disposed = true; } }; },
    () => { const v = fakeViewer(['a']); return { v, after: () => { v.lost = true; } }; },
  ]) {
    const { v, signal, after } = make(), c = clock(); let n = 0;
    const done = runDrawTour({ viewer: v, plan, signal, raf: c.raf, now: c.now, afterFrame: () => { if (++n === 3) after(); } });
    c.run(100); assert.equal(await done, false); assert.ok(v.renders <= 4, 'stops drawing right away');
  }
  const c0 = clock();
  assert.equal(await runDrawTour({ viewer: { built: null }, plan, raf: c0.raf, now: c0.now }), false);
  assert.equal(await runDrawTour({ viewer: fakeViewer([]), plan: { segments: [] }, raf: c0.raf, now: c0.now }), false);
  const v2 = fakeViewer([]), c2 = clock(); // a room that vanished from the model is skipped, the tour still ends
  const done = runDrawTour({ viewer: v2, plan: planDrawTour([room('gone', 'living', 12, 0, 0)], { orbitMs: 2000, approachMs: 500, roomMs: 1000 }), raf: c2.raf, now: c2.now });
  c2.run(100); assert.equal(await done, true); assert.equal(v2.calls.filter(x => x[0] === 'walkToRoom').length, 0);
});

test('on the real sample villa the route covers every named room it can and stays inside the model', () => {
  const doc = sampleVilla(), built = buildBuildingScene(doc, THREE, { textures: false });
  const plan = planDrawTour(built.rooms.values(), { entry: doc.entry });
  assert.equal(plan.entryAzimuthDeg, 0);
  const names = plan.segments.slice(2).map(s => s.name);
  assert.equal(names[0], 'المدخل', 'starts at the entrance hall');
  assert.ok(plan.rooms >= 6 && plan.rooms <= TOUR.maxRooms, 'rooms: ' + plan.rooms);
  for (const seg of plan.segments.slice(2)) { assert.ok(built.rooms.has(seg.key)); assert.ok(Number.isFinite(seg.heading0)); }
});

// ---------------------------------------------------------------------------------------------- glide between stops (no cuts)
function walkingViewer(spots) {
  const T = THREE, cam = { pos: new T.Vector3(2, 3, 14), quat: new T.Quaternion(), fov: 42 };
  const v = {
    built: { rooms: new Map(Object.keys(spots).map(k => [k, {}])) }, disposed: false, lost: false, walk: { x: 0, y: 0, yaw: 0, pitch: 0 }, orbit: { dist: 40, target: new T.Vector3() }, cam, shots: [],
    showLevel() {}, setMode() {}, frameBuilding() {}, orbitTo() {}, renderNow() {},
    currentPose() { return { pos: cam.pos.clone(), quat: cam.quat.clone(), fov: cam.fov }; },
    walkToRoom(k, h) { this.walk.x = spots[k][0]; this.walk.y = spots[k][1]; this.walk.yaw = h * Math.PI / 180; },
    walkPose() { const w = this.walk; return { pos: new T.Vector3(w.x, 1.6, -w.y), quat: new T.Quaternion().setFromEuler(new T.Euler(w.pitch, -w.yaw, 0, 'YXZ')), fov: 72 }; },
    applyPose(p) { cam.pos.copy(p.pos); cam.quat.copy(p.quat); cam.fov = p.fov; },
  };
  return v;
}
const forward = q => new THREE.Vector3(0, 0, -1).applyQuaternion(q);

test('between stops the camera glides: no frame jumps far or whips round, and each room is reached before its sweep ends', async () => {
  const spots = { a: [2, 2], b: [14, 9], c: [3, 12] }, v = walkingViewer(spots), c = clock(), frames = [];
  const rooms = [room('a', 'entrance', 6, 2, 2, 0, { centroid: { x: 2, y: 6 } }), room('b', 'living', 14, 14, 9, 0, { centroid: { x: 10, y: 9 } }), room('c', 'bedroom', 12, 3, 12, 0, { centroid: { x: 8, y: 12 } })];
  const plan = planDrawTour(rooms, { orbitMs: 2000, approachMs: 500, roomMs: 3000 });
  const done = runDrawTour({ viewer: v, plan, raf: c.raf, now: c.now, afterFrame: () => frames.push({ p: v.cam.pos.clone(), f: forward(v.cam.quat), fov: v.cam.fov }) });
  c.run(1000 / 30); assert.equal(await done, true);
  let worstMove = 0, worstTurn = 0;
  for (let i = 1; i < frames.length; i++) { worstMove = Math.max(worstMove, frames[i].p.distanceTo(frames[i - 1].p)); worstTurn = Math.max(worstTurn, Math.acos(Math.min(1, frames[i].f.dot(frames[i - 1].f))) * 180 / Math.PI); }
  assert.ok(worstMove < 1, 'largest step between frames: ' + worstMove + ' m');
  assert.ok(worstTurn < 9, 'largest turn between frames: ' + worstTurn + '°');
  assert.equal(frames.at(-1).fov, 72, 'the field of view has eased to the walking value');
});

test('a room reached from the opposite heading turns the short way round', async () => {
  const v = walkingViewer({ a: [5, 5] }), c = clock(), plan = planDrawTour([room('a', 'living', 12, 5, 5, 0, { centroid: { x: 5, y: 9 } })], { orbitMs: 2000, approachMs: 500, roomMs: 3000, sweepDeg: 0 });
  v.cam.quat.setFromEuler(new THREE.Euler(0, -Math.PI * .99, 0, 'YXZ')); // looking almost exactly backwards
  const yaws = [], done = runDrawTour({ viewer: v, plan, raf: c.raf, now: c.now, afterFrame: () => { const f = forward(v.cam.quat); yaws.push(Math.atan2(f.x, -f.z) * 180 / Math.PI); } });
  c.run(1000 / 30); await done;
  const steps = yaws.slice(1).map((y, i) => Math.abs(((y - yaws[i] + 540) % 360) - 180));
  assert.ok(steps.every(s => s < 12), 'no wrap-around jumps: ' + Math.max(...steps));
});
