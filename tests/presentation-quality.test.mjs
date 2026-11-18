import test from 'node:test';
import assert from 'node:assert/strict';
import { shadowFrame, hqCapture, keepContextPlant, fitPresentationCamera } from '../dist/facade-j/facade-realism/presentation-quality.mjs';
import * as THREE from '../dist/facade-j/vendor/three.module.js';

test('opening presentation fits the whole building on desktop and mobile without placing the camera underground', () => {
  for (const aspect of [1366 / 900, 390 / 844]) for (const [w, h, d] of [[10, 5, 12], [35, 12, 40]]) {
    const box = new THREE.Box3(new THREE.Vector3(0, 0, -d), new THREE.Vector3(w, h, 0)), camera = new THREE.PerspectiveCamera(46, aspect, .1, 400);
    camera.position.set(w + 5, 4, 12); fitPresentationCamera(THREE, camera, box);
    for (const x of [0, w]) for (const y of [0, h]) for (const z of [-d, 0]) {
      const p = new THREE.Vector3(x, y, z).project(camera); assert.ok(Math.abs(p.x) <= .89 && Math.abs(p.y) <= .89, JSON.stringify({ w, h, d, aspect, point: p.toArray() }));
    }
    assert.ok(camera.position.y >= 1.6);
  }
});

test('presentation removes foreground context trees without touching customer landscaping or background trees', () => {
  const camera = { x: 12, y: 5, z: 16 }, box = { min: { x: 0, y: 0, z: -30 }, max: { x: 25, y: 8, z: 0 } };
  assert.equal(keepContextPlant({ kind: 'palm', outside: true, x: 12, y: -10 }, camera, box), false);
  assert.equal(keepContextPlant({ kind: 'palm', outside: false, x: 12, y: -10 }, camera, box), true);
  assert.equal(keepContextPlant({ kind: 'palm', outside: true, x: -40, y: 0 }, camera, box), true);
  assert.equal(keepContextPlant({ kind: 'olive', outside: true, x: 12, y: 45 }, camera, box), true);
});

test('shadow frame follows the actual building, height and projected ground shadow at every size', () => {
  const dir = { x: .4, y: .6, z: -.69282 };
  for (const [w, h, d] of [[8, 4, 12], [35, 12, 45], [60, 16, 35]]) {
    const b = { min: { x: 0, y: 0, z: -d }, max: { x: w, y: h, z: 0 } }, f = shadowFrame(b, dir);
    for (const x of [0, w]) for (const y of [0, h]) for (const z of [-d, 0]) {
      assert.ok(Math.hypot(x - f.center.x, y - f.center.y, z - f.center.z) < f.extent);
      const t = y / dir.y; assert.ok(Math.hypot(x - dir.x * t - f.center.x, -f.center.y, z - dir.z * t - f.center.z) < f.extent);
    }
    assert.ok(f.far > f.distance + f.extent); if (w > 30) assert.ok(f.extent > 15);
  }
});
function fixture(fail = false) {
  let pr = 1; const canvas = { width: 1280, height: 800, toBlob(cb) { cb(fail ? null : new Blob(['png'])); } };
  const renderer = { getPixelRatio: () => pr, getSize: target => target.set(1280, 800), setPixelRatio: n => { pr = n; }, setSize(w, h) { canvas.width = Math.round(w * pr); canvas.height = Math.round(h * pr); } };
  let settles = 0, started = 0;
  const refiner = { cancel() {}, async settle(n) { settles++; await Promise.resolve(); return n; }, render() {}, start() { started++; } };
  return { renderer, canvas, refiner, count: () => ({ settles, started }) };
}
test('HQ output is bounded, concurrent captures share one render, and navigation resolution is restored', async () => {
  const f = fixture(), capture = hqCapture(f), a = capture({ scale: 100, samples: 1000 }), b = capture();
  assert.equal(a, b); const out = await a; assert.ok(out.width * out.height <= 6000000); assert.ok(out.width <= 3840 && out.height <= 2400); assert.equal(out.samples, 128);
  assert.equal(f.renderer.getPixelRatio(), 1); assert.equal(f.canvas.width, 1280); assert.deepEqual(f.count(), { settles: 1, started: 1 });
});
test('failed image encoding still restores interactive rendering and allows a later retry', async () => {
  const f = fixture(true), capture = hqCapture(f); await assert.rejects(capture(), /ترميز/); assert.equal(f.renderer.getPixelRatio(), 1); assert.equal(f.canvas.height, 800); assert.equal(f.count().started, 1);
  f.canvas.toBlob = cb => cb(new Blob(['ok'])); assert.ok((await capture()).blob.size);
});
