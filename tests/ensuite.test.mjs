import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensuitePairs, ensuiteRelationships, applyEnsuiteDoors, ensuiteCoverage,
  worstProportion, presentationPenalty, explainPresentationPenalty, PRESENTATION_PENALTY_VERSION,
} from '../dist/ensuite.mjs';

// A bedroom directly above a bath, sharing a full-width wall — the geometry
// applyEnsuiteDoors needs to find a real door position on a real wall.
function adjacentPair({ bedId = 'bed1', bathId = 'bath1', x = 0 } = {}) {
  return {
    bedroom: { id: bedId, type: 'bedroom', x, y: 0, w: 4, h: 3, name: 'غرفة نوم' },
    bath: { id: bathId, type: 'bath', x, y: 3, w: 4, h: 2, name: 'حمام' },
    wall: { id: `wall-${bedId}`, x1: x, y1: 3, x2: x + 4, y2: 3 },
  };
}

test('ensuitePairs pairs bedrooms with real bathrooms and excludes guest/service baths', () => {
  const program = [
    { id: 'b1', type: 'bedroom', name: 'غرفة نوم 1' },
    { id: 'b2', type: 'bedroom', name: 'غرفة نوم 2' },
    { id: 'g1', type: 'bath', name: 'حمام ضيوف' },
    { id: 'p1', type: 'bath', name: 'حمام 1' },
    { id: 'p2', type: 'bath', name: 'حمام 2' },
  ];
  const pairs = ensuitePairs(program);
  // Only the two non-guest baths are eligible, so only two pairs form even though
  // there are two bedrooms and three total bath rooms.
  assert.deepEqual(pairs, [{ bedroomId: 'b1', bathId: 'p1' }, { bedroomId: 'b2', bathId: 'p2' }]);
});

test('ensuitePairs caps at 8 pairs even with a larger program', () => {
  const program = [];
  for (let i = 0; i < 10; i++) {
    program.push({ id: `b${i}`, type: 'bedroom', name: `غرفة نوم ${i + 1}` });
    program.push({ id: `p${i}`, type: 'bath', name: `حمام ${i + 1}` });
  }
  assert.equal(ensuitePairs(program).length, 8);
});

test('ensuiteRelationships exposes each pair as a near relation the rectangular engine understands', () => {
  const program = [
    { id: 'b1', type: 'bedroom', name: 'غرفة نوم 1' },
    { id: 'p1', type: 'bath', name: 'حمام 1' },
  ];
  assert.deepEqual(ensuiteRelationships(program), [{ roomIds: ['b1', 'p1'], relation: 'near', weight: 3 }]);
});

test('applyEnsuiteDoors links a bedroom to its bathroom only when they truly share a wall', () => {
  const { bedroom, bath, wall } = adjacentPair();
  const model = { rooms: [bedroom, bath], walls: [wall], openings: [] };
  const linked = applyEnsuiteDoors(model, [{ bedroomId: bedroom.id, bathId: bath.id }]);
  assert.equal(linked, 1);
  const door = model.openings.find(o => o.type === 'door');
  assert.ok(door, 'a door opening must be created on the shared wall');
  assert.deepEqual(door.connects, [bedroom.id, bath.id]);
  assert.equal(door.wallId, wall.id);
  assert.ok(door.pos > 0 && door.pos < 1);
});

test('applyEnsuiteDoors leaves a non-adjacent pair unlinked instead of inventing a connection', () => {
  const { bedroom, bath, wall } = adjacentPair();
  const farBath = { id: 'bath-far', type: 'bath', x: 50, y: 50, w: 4, h: 2, name: 'حمام بعيد' };
  const model = { rooms: [bedroom, bath, farBath], walls: [wall], openings: [] };
  const linked = applyEnsuiteDoors(model, [
    { bedroomId: bedroom.id, bathId: bath.id },
    { bedroomId: bedroom.id, bathId: farBath.id },
  ]);
  // Only the geometrically adjacent pair can be linked; the far bath has no
  // shared wall at all, so it must not get a fabricated door.
  assert.equal(linked, 1);
  assert.equal(model.openings.filter(o => o.type === 'door').length, 1);
});

test('applyEnsuiteDoors refuses to place a door that would clash with an existing opening', () => {
  const { bedroom, bath, wall } = adjacentPair();
  // Pre-occupy the exact spot the computed door would use.
  const model = { rooms: [bedroom, bath], walls: [wall], openings: [{ id: 'opening-0', type: 'door', wallId: wall.id, pos: .72, w: .8, h: 2.1, sill: 0, roomId: bedroom.id, connects: [bedroom.id, 'outside'] }] };
  const linked = applyEnsuiteDoors(model, [{ bedroomId: bedroom.id, bathId: bath.id }]);
  assert.equal(linked, 0);
  assert.equal(model.openings.length, 1, 'no second door should be added into a clashing position');
});

test('ensuiteCoverage counts only pairs that actually have a connecting door in the model', () => {
  const { bedroom, bath, wall } = adjacentPair();
  const program = [
    { id: bedroom.id, type: 'bedroom', name: bedroom.name },
    { id: bath.id, type: 'bath', name: bath.name },
  ];
  const model = { rooms: [bedroom, bath], walls: [wall], openings: [], program };
  assert.deepEqual(ensuiteCoverage(model), { wanted: 1, linked: 0 });
  applyEnsuiteDoors(model, ensuitePairs(program));
  assert.deepEqual(ensuiteCoverage(model), { wanted: 1, linked: 1 });
});

test('worstProportion reports 1 (perfectly square) when there is nothing to compare and the true ratio otherwise', () => {
  assert.equal(worstProportion({ rooms: [] }), 1);
  assert.equal(worstProportion({ rooms: [{ type: 'bath', w: 10, h: 1 }] }), 1, 'bath rooms are not in the comparison set');
  const model = { rooms: [
    { type: 'bedroom', w: 4, h: 3 }, // ratio 1.333..
    { type: 'majlis', w: 10, h: 2 }, // ratio 5 — the worst one
  ] };
  assert.equal(worstProportion(model), 5);
});

test('presentationPenalty and explainPresentationPenalty always agree, and the breakdown is never a fabricated split', () => {
  const connectedScenario = (() => {
    const { bedroom, bath, wall } = adjacentPair();
    const program = [{ id: bedroom.id, type: 'bedroom', name: bedroom.name }, { id: bath.id, type: 'bath', name: bath.name }];
    const model = { rooms: [bedroom, bath], walls: [wall], openings: [], program };
    applyEnsuiteDoors(model, ensuitePairs(program));
    return model;
  })();
  const partiallyConnectedScenario = (() => {
    const { bedroom, bath, wall } = adjacentPair({ bedId: 'bed1', bathId: 'bath1' });
    const second = adjacentPair({ bedId: 'bed2', bathId: 'bath2', x: 100 });
    second.bath.x = 200; second.bath.y = 200; // move the second bath far away: unreachable by door
    const program = [
      { id: bedroom.id, type: 'bedroom', name: bedroom.name }, { id: bath.id, type: 'bath', name: bath.name },
      { id: second.bedroom.id, type: 'bedroom', name: second.bedroom.name }, { id: second.bath.id, type: 'bath', name: second.bath.name },
    ];
    const model = { rooms: [bedroom, bath, second.bedroom, second.bath], walls: [wall, second.wall], openings: [], program };
    applyEnsuiteDoors(model, ensuitePairs(program));
    return model;
  })();
  const skewedProportionScenario = { rooms: [{ type: 'bedroom', w: 10, h: 2 }], walls: [], openings: [], program: [] };

  for (const model of [connectedScenario, partiallyConnectedScenario, skewedProportionScenario]) {
    const explained = explainPresentationPenalty(model);
    assert.equal(explained.ensuitePenalty + explained.proportionPenalty, explained.penalty);
    assert.equal(explained.penalty, presentationPenalty(model));
    const coverage = ensuiteCoverage(model);
    assert.equal(explained.wanted, coverage.wanted);
    assert.equal(explained.linked, coverage.linked);
    assert.equal(explained.worstProportion, worstProportion(model));
  }

  // The two concrete scenarios resolve to the penalties their geometry implies,
  // not placeholder numbers.
  assert.equal(explainPresentationPenalty(connectedScenario).penalty, 0);
  assert.equal(explainPresentationPenalty(partiallyConnectedScenario).ensuitePenalty, 10);
  assert.ok(explainPresentationPenalty(skewedProportionScenario).proportionPenalty > 0);
});

test('PRESENTATION_PENALTY_VERSION is a stable, non-empty version tag', () => {
  assert.equal(typeof PRESENTATION_PENALTY_VERSION, 'string');
  assert.ok(PRESENTATION_PENALTY_VERSION.length > 0);
});
