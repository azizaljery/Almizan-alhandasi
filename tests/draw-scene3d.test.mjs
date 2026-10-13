import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';
import { buildBuildingScene, buildSectionCap, stairLayout, stairHeightAt } from '../dist/draw/scene3d.mjs';

const twoLevels = () => {
  let d = sampleVilla();
  d = applyCommand(d, { type: 'add-level', name: 'الدور الأول', copyFrom: 'L1' }).doc;
  const l2 = d.levels[1].id;
  d = applyCommand(d, { type: 'add-label', level: l2, name: 'غرفة نوم 1', roomType: 'bedroom', seed: { x: 3, y: 2.5 } }).doc;
  d = applyCommand(d, { type: 'add-label', level: l2, name: 'صالة', roomType: 'living', seed: { x: 9, y: 2.5 } }).doc;
  return d;
};

test('sample villa builds: rooms, levels, merged meshes, finite geometry', () => {
  const doc = sampleVilla();
  const built = buildBuildingScene(doc, THREE, { textures: false });
  assert.equal(built.levels.length, 1);
  assert.equal(built.rooms.size, 9);
  const names = [...built.rooms.values()].map(r => r.name);
  assert.ok(names.includes('مجلس الرجال') && names.includes('المطبخ'));
  const majlis = [...built.rooms.values()].find(r => r.type === 'majlis');
  assert.equal(majlis.floorKind, 'marble');
  assert.ok(majlis.floor.isMesh && majlis.area > 27);
  assert.ok(built.stats.meshes < 140, `few meshes (${built.stats.meshes})`);
  assert.ok(built.stats.triangles > 5000 && built.stats.triangles < 160000);
  let bad = 0;
  built.group.traverse(o => { if (o.isMesh) { const p = o.geometry.attributes.position.array; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) bad++; } });
  assert.equal(bad, 0);
  assert.equal(built.roomAt(3, 2.5, 0).type, 'majlis');
  assert.equal(built.roomAt(50, 50, 0), null);
  assert.ok(built.entry && built.entry.normal.y < 0, 'entry door faces south');
  built.dispose();
});

test('two level variant: levels stacked, stairwell hole, top level only has the roof', () => {
  const doc = twoLevels();
  const built = buildBuildingScene(doc, THREE, { textures: false });
  assert.equal(built.levels.length, 2);
  assert.ok(built.levels[1].elevation > 3);
  assert.ok(built.rooms.size > 0);
  const roofMeshes = lv => lv.parts.roof.children.length;
  assert.equal(roofMeshes(built.levels[0]), 0, 'lower level is covered by the upper one');
  assert.ok(roofMeshes(built.levels[1]) > 0);
  const hole = built.levels[0].stairs[0].layout.hole;
  assert.equal(hole.length, 4);
  built.dispose();
});

test('stair layout reaches exactly the upper floor height', () => {
  for (const kind of ['straight', 'L', 'U']) {
    const lay = stairLayout({ x: 2, y: 1, rot: 0.4, w: 1.1, run: 3.2, kind }, 3.2);
    const tops = lay.steps.map(s => s.top);
    assert.ok(Math.abs(Math.max(...tops) - (3.2 - lay.riser)) < 1e-9, kind + ' last step is one riser below the floor above');
    assert.ok(lay.riser <= .2 + 1e-9 && lay.riser > .12);
    assert.ok(lay.steps.every(s => s.poly.length === 4 && s.poly.every(p => Number.isFinite(p.x))));
    const first = lay.steps[0], c = { x: first.poly.reduce((s, p) => s + p.x, 0) / 4, y: first.poly.reduce((s, p) => s + p.y, 0) / 4 };
    const h = stairHeightAt(lay, c);
    assert.ok(h.inside && h.h > 0 && h.h <= first.top + 1e-9);
  }
});

test('section cap covers wall cuts only at the right level and height', () => {
  const built = buildBuildingScene(sampleVilla(), THREE, { textures: false });
  const mat = new THREE.MeshBasicMaterial();
  assert.ok(buildSectionCap(THREE, built, 1.2, mat).children.length > 0);
  assert.equal(buildSectionCap(THREE, built, 9, mat).children.length, 0);
  built.dispose();
});

test('options: no site, no fixtures reduce the geometry', () => {
  const doc = sampleVilla();
  const full = buildBuildingScene(doc, THREE, { textures: false });
  const bare = buildBuildingScene(doc, THREE, { textures: false, site: false, fixtures: false });
  assert.ok(bare.stats.triangles < full.stats.triangles);
  assert.equal(bare.site, null);
});
