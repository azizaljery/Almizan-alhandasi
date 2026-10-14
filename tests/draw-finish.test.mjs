import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, DrawError } from '../dist/draw/doc.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { buildBuildingScene } from '../dist/draw/scene3d.mjs';
import * as THREE from '../dist/vendor/three.module.js';

test('set-meta finish: validates colours and enums, merges, and null clears', () => {
  let d = sampleVilla();
  d = applyCommand(d, { type: 'set-meta', finish: { facade: { base: 'stone', color: '#C8B28A', accent: 'all', plinth: false }, aluminium: '#222222', floors: { majlis: 'wood' } } }).doc;
  assert.equal(d.finish.facade.color, '#c8b28a'); assert.equal(d.finish.floors.majlis, 'wood');
  d = applyCommand(d, { type: 'set-meta', finish: { facade: { color: null }, floors: { majlis: null } } }).doc;
  assert.equal(d.finish.facade.color, undefined); assert.equal(d.finish.floors.majlis, undefined); assert.equal(d.finish.facade.base, 'stone');
  for (const bad of [{ facade: { color: 'red' } }, { facade: { base: 'gold' } }, { floors: { nope: 'wood' } }, { floors: { majlis: 'lava' } }]) assert.throws(() => applyCommand(d, { type: 'set-meta', finish: bad }), DrawError);
});

test('the 3D scene follows the finish: wall colour, floor material of a room type', () => {
  let d = applyCommand(sampleVilla(), { type: 'set-meta', finish: { facade: { color: '#aa3322' }, floors: { majlis: 'wood' } } }).doc;
  const scene = buildBuildingScene(d, THREE, { textures: false, site: false });
  assert.equal('#' + scene.lib.m.render.color.getHexString(), '#aa3322');
  assert.ok([...(scene.rooms.values?.() ?? scene.rooms)].some(r => r.type === 'majlis' && r.floorKind === 'wood'));
  scene.dispose();
});
