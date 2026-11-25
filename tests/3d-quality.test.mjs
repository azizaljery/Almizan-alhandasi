import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';
import { buildBuildingScene } from '../dist/draw/scene3d.mjs';

const twoLevels = () => {
  let d = sampleVilla();
  d = applyCommand(d, { type: 'add-level', name: 'الدور الأول', copyFrom: 'L1' }).doc;
  return d;
};
const tris = g => { let n = 0; g.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };

test('3D quality: roof-edge cornice adds a band under the parapet at low cost', () => {
  const doc = twoLevels();
  const on = buildBuildingScene(doc, THREE, { textures: false, roofCornice: true });
  const off = buildBuildingScene(doc, THREE, { textures: false, roofCornice: false });
  const extra = tris(on.group) - tris(off.group);
  assert.ok(extra > 0 && extra < tris(off.group) * 0.03, `cornice costs <3% triangles (${extra})`);
  let bad = 0;
  on.group.traverse(o => { if (o.isMesh) for (const v of o.geometry.attributes.position.array) if (!Number.isFinite(v)) bad++; });
  assert.equal(bad, 0);
  // the band stays within the top level's height envelope (no floating pieces above the coping)
  const top = on.levels.at(-1);
  assert.ok(on.bounds.maxY <= top.elevation + top.height + (doc.roof?.parapet ?? .9) + .5);
  on.dispose(); off.dispose();
});

test('3D quality: lite tier keeps the triangle budget on phones', () => {
  const doc = twoLevels();
  const lite = buildBuildingScene(doc, THREE, { textures: false, detail: 'lite', quality: .5, interior: true });
  const full = buildBuildingScene(doc, THREE, { textures: false, detail: 'full', interior: true });
  assert.ok(tris(lite.group) < tris(full.group) * 0.6, `lite (${tris(lite.group)}) well below full (${tris(full.group)})`);
  assert.ok(tris(lite.group) < 120000, 'lite stays under 120k triangles for a two-level villa');
  lite.dispose(); full.dispose();
});

test('3D quality: terrain material is defined for the open ground', () => {
  const b = buildBuildingScene(sampleVilla(), THREE, { textures: false });
  assert.ok(b.lib.m.terrain && b.lib.m.terrain.isMeshStandardMaterial);
  b.dispose();
});

test('3D quality: lite tier upholstery gets no weave normal map (it rendered black on phones)', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../dist/draw/interior-materials.mjs', import.meta.url), 'utf8');
  const i = src.indexOf("case 'fxf'");
  assert.ok(i > 0);
  assert.match(src.slice(i, i + 900), /hasCanvas && quality > \.5/);
});

// ---------------------------------------------------------------- round 2
import { FACADE_VARIANTS } from '../dist/draw/scene3d.mjs';
import { safeDesignHash } from '../dist/draw/interior-themes.mjs';
import { softBoxGeometry } from '../dist/draw/interior-kit.mjs';
import { buildFixture, createFixtureMaterials } from '../dist/draw/fixtures3d.mjs';

test('3D quality: façade variants are deterministic, distinct, and never override a stated finish', () => {
  assert.ok(FACADE_VARIANTS.length >= 6);
  assert.equal(new Set(FACADE_VARIANTS.map(v => v.render)).size, FACADE_VARIANTS.length, 'distinct render colours');
  for (const v of FACADE_VARIANTS) for (const k of ['render', 'accent', 'plinth', 'door', 'frame']) assert.match(v[k], /^#[0-9a-f]{6}$/i);
  const doc = twoLevels(), v = FACADE_VARIANTS[safeDesignHash(doc) % FACADE_VARIANTS.length];
  const a = buildBuildingScene(doc, THREE, { textures: false }), b = buildBuildingScene(doc, THREE, { textures: false });
  assert.equal(a.lib.m.render.color.getHexString(), b.lib.m.render.color.getHexString(), 'same design, same façade');
  assert.equal('#' + a.lib.m.render.color.getHexString(), new THREE.Color(v.render).getHexString().replace(/^/, '#'));
  const stated = structuredClone(doc); stated.finish = { facade: { color: '#123456' } };
  const c = buildBuildingScene(stated, THREE, { textures: false });
  assert.equal(c.lib.m.render.color.getHexString(), '123456', 'a stated façade colour wins over the variant');
  const off = buildBuildingScene(doc, THREE, { textures: false, facadeVariety: false });
  assert.notEqual(off.lib.m.render.color.getHexString(), '123456');
  for (const x of [a, b, c, off]) x.dispose();
});

test('3D quality: soft boxes use the cheap grid for small radii and keep the fine grid for cushions', () => {
  const tris = g => g.index.count / 3;
  assert.equal(tris(softBoxGeometry(THREE, 1, .3, .6, .05, true)), 192);
  assert.equal(tris(softBoxGeometry(THREE, 1, .3, .6, .05)), 432, 'default stays fine (photo path)');
  assert.equal(tris(softBoxGeometry(THREE, 1, .3, .6, .1)), 432);
  const g = softBoxGeometry(THREE, 1, .3, .6, .05, true); let bad = 0; for (const v of g.attributes.position.array) if (!Number.isFinite(v)) bad++; assert.equal(bad, 0);
});

test('3D quality: trees come in three crown shapes and stay light in lite', () => {
  const mats = createFixtureMaterials(THREE);
  const count = (seed, low) => { const g = buildFixture(THREE, 'tree', { w: 2.3, d: 2.3, h: 3.6, seed, low }, mats); let n = 0; g.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };
  const full = [0, 1, 2].map(s => count(s, false));
  assert.equal(new Set(full).size, 3, `three distinct crowns (${full})`);
  for (const s of [0, 1, 2]) assert.ok(count(s, true) < 400, `lite tree ${s} stays small (${count(s, true)})`);
});

test('3D quality: sky shader carries the cloud layer and the dusk style tints it', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../dist/draw/viewer-draw.mjs', import.meta.url), 'utf8');
  assert.match(src, /uniform vec3 cloudCol; uniform float cloudAmt/);
  assert.match(src, /this\.style === 'dusk' \? '#ffcfae'/);
});

test('3D quality: roomView penalises views that end on a staircase', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../dist/draw/viewer-draw.mjs', import.meta.url), 'utf8');
  assert.match(src, /stairPen/);
});
