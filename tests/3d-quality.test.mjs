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
