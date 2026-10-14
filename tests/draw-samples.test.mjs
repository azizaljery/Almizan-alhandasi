import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { validateDoc } from '../dist/draw/doc.mjs';
import { analyzeWalls, exteriorWallIds } from '../dist/draw/topology.mjs';

test('the sample villa is valid and every labelled room is a closed space', () => {
  const d = sampleVilla();
  assert.deepEqual(validateDoc(d), []);
  const a = analyzeWalls(d.walls);
  assert.equal(a.gaps.length, 0); assert.equal(a.stubs.length, 0);
  assert.ok(a.spaces.length >= 9, 'spaces: ' + a.spaces.length);
  const hit = new Set();
  for (const l of d.labels) { const s = a.spaces.find(s => s.net && require_pip(l.seed, s.net)); assert.ok(s, 'label has a room: ' + l.name); hit.add(s.id); }
  assert.equal(hit.size, d.labels.length, 'each label sits in its own room');
  assert.equal(exteriorWallIds(a).size, 4);
  assert.equal(a.outlines.length, 1);
});
import { pointInPolygon } from '../dist/draw/geom.mjs';
function require_pip(p, poly) { return pointInPolygon(p, poly); }
