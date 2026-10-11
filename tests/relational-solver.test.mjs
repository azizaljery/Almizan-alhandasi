import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generateModel, defaultRooms, validateModel } from '../dist/claude/planner.mjs';
import { circulationNetwork } from '../dist/circulation.mjs';
const plot = { width: 30, length: 40, entry: 's', floors: 1, streets: { s: true }, shape: 'rect' };
const rooms = defaultRooms();
const search = (variant, relation) => ({ search: { variant, relationships: relation ? [{ roomIds: ['room-3','room-4'], relation, weight: 1 }] : [] } });
const access = model => model.corridors.map(c => model.rooms.filter(r => r.corridorId === c.id).map(r => `${r.type}:${r.area}`).sort().join('|')).filter(Boolean).sort();
const route = model => circulationNetwork(model).betweenRooms('room-3','room-4')?.metres;
test('bounded native row search creates different physical access groups for same inputs', () => {
  const input = JSON.stringify({ plot, rooms });
  const models = [0,1,2].map(variant => generateModel(plot, rooms, search(variant)));
  for (const model of models) {
    assert.deepEqual(validateModel(model), []);
    assert.deepEqual(model.program.map(({name,type,area,position,side}) => ({name,type,area,position,side})), rooms);
    assert.deepEqual(model.plot, models[0].plot);
  }
  assert.ok(new Set(models.map(m => JSON.stringify(access(m)))).size >= 2);
  assert.equal(JSON.stringify({ plot, rooms }), input);
});
test('relationship request changes packing choice and measured physical door route', () => {
  const near = generateModel(plot, rooms, search(0, 'near'));
  const far = generateModel(plot, rooms, search(0, 'far'));
  assert.ok(Number.isFinite(route(near)) && Number.isFinite(route(far)));
  assert.ok(route(near) + .5 < route(far), `near=${route(near)}, far=${route(far)}`);
  assert.deepEqual(generateModel(plot, rooms, search(0, 'near')), near);
});
test('search rejects out-of-bound variants and unsupported relationships without silent fallback', () => {
  for (const options of [{ search: { variant: 3 } }, { search: { variant: -1 } }, { search: { relationships: [{ roomIds: ['room-0','missing'], relation: 'near' }] } }, { search: { relationships: [{ roomIds: ['room-0','room-1'], relation: 'teleport' }] } }]) {
    assert.throws(() => generateModel(plot, rooms, options));
  }
  assert.throws(() => generateModel({ ...plot, shape: 'u' }, rooms, search(0)), /SEARCH_RECTANGLE_ONLY/);
});
test('entry-aware locked dimensions preserve flag and orientation across search variants', () => {
  const exact = [{ name: 'مكتب', type: 'office', area: 12, dimensions: { width: 4, length: 3, allowRotation: false }, position: 'middle', side: 'left' }, { name: 'صالة', type: 'living', area: 24, position: 'middle', side: 'right' }];
  for (const entry of ['s','n','e','w']) for (const variant of [0,1,2]) {
    const model = generateModel({ ...plot, entry, streets: { [entry]: true } }, exact, search(variant));
    assert.deepEqual(validateModel(model), []);
    const office = model.rooms.find(r => r.id === 'room-0');
    assert.ok(Math.abs(office.w - 4) < 1e-5 && Math.abs(office.h - 3) < 1e-5);
    assert.equal(model.program[0].dimensions.allowRotation, false);
    assert.equal(office.resolvedSide, 'left');
    assert.equal(office.position, 'middle');
  }
});
test('native planner copies stay identical', () => {
  assert.deepEqual(readFileSync('vendor/claude-planner/src/planner.mjs'), readFileSync('dist/claude/planner.mjs'));
});

test('supported dining-to-both-majlis relationship affects real access branches and route lengths', () => {
  const build = relation => generateModel(plot, rooms, { search: { variant: 0, relationships: [0,1].map(i => ({ roomIds: ['room-3', `room-${i}`], relation, weight: 1 })) } });
  const near = build('near'), far = build('far');
  assert.deepEqual(validateModel(near), []);
  assert.deepEqual(validateModel(far), []);
  assert.notDeepEqual(access(near), access(far));
  for (const id of ['room-0','room-1']) {
    const short = circulationNetwork(near).betweenRooms('room-3', id);
    const long = circulationNetwork(far).betweenRooms('room-3', id);
    assert.ok(short.metres + 3 < long.metres, `${id}: ${short.metres} vs ${long.metres}`);
    assert.ok(short.spaces.some(space => space === 'spine'));
  }
});
test('no-search legacy geometry remains byte-equivalent to first-stage baseline in every entry direction', () => {
  const baselineHashes = { s: '8c19b6aac1026ef759f4040909cc4349421d04cddcf21799d787769ff4843649', n: '389122be9900faa8fef603771cdec8c4361c306b57c4c85e312eb523b29b93d5', e: '794c0da2a95318c807d5e92f67721a9c92e06634605d00a447c4dd0c4a4d3069', w: '4421f2017d688e926b95afc9ea54090a9aeafb2ff4a38c0894bfafa45f62adb1' };
  for (const entry of Object.keys(baselineHashes)) {
    const model = generateModel({ ...plot, entry, streets: { [entry]: true } }, rooms);
    assert.equal(createHash('sha256').update(JSON.stringify(model)).digest('hex'), baselineHashes[entry]);
  }
});
test('native locked dimensions also remain locked without opt-in search', () => {
  const exact = [{ name: 'مكتب', type: 'office', area: 12, dimensions: { width: 4, length: 3, allowRotation: false }, position: 'middle', side: 'left' }];
  for (const entry of ['s','n','e','w']) {
    const model = generateModel({ ...plot, entry, streets: { [entry]: true } }, exact);
    assert.equal(model.program[0].dimensions.allowRotation, false);
    assert.ok(Math.abs(model.rooms[0].w - 4) < 1e-5 && Math.abs(model.rooms[0].h - 3) < 1e-5);
  }
});
