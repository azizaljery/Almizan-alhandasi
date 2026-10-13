import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { FIXTURES } from '../dist/draw/catalog.mjs';
import { buildFixture, createFixtureMaterials, FIXTURE_KINDS, roundedBoxGeometry } from '../dist/draw/fixtures3d.mjs';

const triangles = g => { let n = 0; g.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };

test('every catalog fixture kind has a recognisable model sitting on the floor', () => {
  const mats = createFixtureMaterials(THREE);
  for (const kind of Object.keys(FIXTURES)) {
    const def = FIXTURES[kind], g = buildFixture(THREE, kind, { w: def.w, d: def.d, h: def.h }, mats);
    assert.ok(g.isGroup, kind);
    const meshes = []; g.traverse(o => o.isMesh && meshes.push(o));
    assert.ok(meshes.length >= 2 || kind === 'rug', `${kind} should be built from several parts, got ${meshes.length}`);
    const box = new THREE.Box3().setFromObject(g);
    assert.ok(Number.isFinite(box.min.x) && Number.isFinite(box.max.y), kind);
    assert.ok(box.min.y > -.03 && box.min.y < .05, `${kind} rests on the floor (min y ${box.min.y})`);
    assert.ok(triangles(g) < 4000, `${kind} stays light (${triangles(g)} triangles)`);
    // footprint is within a sensible factor of the requested size (decor may overhang a little; dining table adds chairs)
    const size = box.getSize(new THREE.Vector3());
    assert.ok(size.x > def.w * .45 && size.x < def.w * 2.2 + .6, `${kind} width ${size.x} vs ${def.w}`);
    assert.ok(size.z > def.d * .45 && size.z < def.d * 2.2 + 1.2, `${kind} depth ${size.z} vs ${def.d}`);
    assert.ok(size.y < def.h * 2.6 + .5, `${kind} height ${size.y} vs ${def.h}`);
    g.traverse(o => { if (o.isMesh) { for (const a of ['position', 'normal', 'uv']) assert.ok(o.geometry.attributes[a], `${kind} has ${a}`); } });
  }
});

test('garden kinds exist and fixture kinds list is complete', () => {
  for (const k of ['palm', 'shrub', 'tree']) { const g = buildFixture(THREE, k, { w: 2, d: 2, h: k === 'palm' ? 6 : 3 }); assert.ok(triangles(g) > 50); }
  for (const k of Object.keys(FIXTURES)) assert.ok(FIXTURE_KINDS.includes(k));
});

test('unknown kinds fall back to a plain box instead of throwing', () => {
  const g = buildFixture(THREE, 'something-new', { w: 1, d: 1, h: 1 });
  assert.equal(g.children.length, 1);
});

test('rounded box normals are unit length and bounds match', () => {
  const geo = roundedBoxGeometry(THREE, 1, .5, 2, .08);
  geo.computeBoundingBox();
  assert.ok(Math.abs(geo.boundingBox.max.x - .5) < 1e-6 && Math.abs(geo.boundingBox.max.z - 1) < 1e-6);
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-4);
});
