import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRooms, generateModel, validateModel, SHAPES, polygonBoundingBox, pointInPolygon, polygonArea, quantities } from '../src/planner.mjs';

/**
 * @typedef {import('../src/PlannerOutputContract.mjs').PlotInput} PlotInput
 * @typedef {import('../src/PlannerOutputContract.mjs').Direction} Direction
 */
/** Plot fields shared by every case; width/length are added per test. @type {Omit<PlotInput, 'width' | 'length'>} */
const base = { floors: 1, entry: 's', streets: { s: true } };
const program = () => defaultRooms({ bedrooms: 4, majlis: 2, baths: 3, kitchens: 1, halls: 1, dining: 1 });

test('rect: buildingFootprint is a simple axis-aligned rectangle with 4 points', () => {
  const m = generateModel({ ...base, width: 30, length: 40, shape: 'rect' }, program());
  assert.equal(m.shape, 'rect');
  assert.equal(m.buildingFootprint.length, 4);
  const bbox = polygonBoundingBox(m.buildingFootprint);
  assert.equal(m.boundingBox.w, bbox.w); assert.equal(m.boundingBox.h, bbox.h);
  // All four corners must be vertices
  const corners = [{ x: bbox.x, y: bbox.y }, { x: bbox.x + bbox.w, y: bbox.y }, { x: bbox.x + bbox.w, y: bbox.y + bbox.h }, { x: bbox.x, y: bbox.y + bbox.h }];
  corners.forEach(c => assert.ok(m.buildingFootprint.some(pt => Math.abs(pt.x - c.x) < 1e-4 && Math.abs(pt.y - c.y) < 1e-4)));
});

test('l: buildingFootprint is a true L with 6 points and one interior reflex corner', () => {
  const m = generateModel({ ...base, width: 30, length: 40, shape: 'l' }, program());
  assert.equal(m.shape, 'l');
  assert.equal(m.buildingFootprint.length, 6, 'L polygon has exactly 6 vertices');
  const polyArea = polygonArea(m.buildingFootprint);
  const bboxArea = m.boundingBox.w * m.boundingBox.h;
  assert.ok(polyArea < bboxArea, `L real area (${polyArea.toFixed(1)}) must be less than bounding box (${bboxArea.toFixed(1)})`);
  const notchExists = m.buildingFootprint.some(pt => {
    const inside = pointInPolygon(m.buildingFootprint, { x: m.boundingBox.x + m.boundingBox.w - 1e-3, y: pt.y });
    return !inside;
  });
  assert.ok(notchExists, 'L must have a notch (interior reflex edge)');
});

test('u: buildingFootprint is a true U with 8 points and a central front notch', () => {
  const m = generateModel({ ...base, width: 35, length: 45, shape: 'u' }, program());
  assert.equal(m.shape, 'u');
  assert.equal(m.buildingFootprint.length, 8, 'U polygon has exactly 8 vertices');
  assert.equal(m.courtyards.length, 1, 'U has exactly one courtyard');
  const polyArea = polygonArea(m.buildingFootprint);
  const bboxArea = m.boundingBox.w * m.boundingBox.h;
  const courtArea = m.courtyards[0].w * m.courtyards[0].h;
  assert.ok(polyArea < bboxArea, `U real area (${polyArea.toFixed(1)}) must be less than bounding box (${bboxArea.toFixed(1)})`);
  assert.ok(Math.abs(polyArea - (bboxArea - courtArea)) < 0.5, 'U area should equal (bbox - courtyard), within rounding');
  // The courtyard must be a hole cut from the front edge (y close to min y of bbox)
  assert.ok(m.courtyards[0].y < m.boundingBox.y + 5, 'Courtyard must be cut from the front edge');
  // No room or corridor overlaps the courtyard
  const overlap = [...m.rooms, ...m.corridors].find(r => !(
    r.x + r.w < m.courtyards[0].x - 1e-3 ||
    r.x > m.courtyards[0].x + m.courtyards[0].w + 1e-3 ||
    r.y + r.h < m.courtyards[0].y - 1e-3 ||
    r.y > m.courtyards[0].y + m.courtyards[0].h + 1e-3
  ));
  assert.equal(overlap, undefined, 'No room or corridor may overlap the courtyard');
});

test('L courtyard test: L shape has no courtyard', () => {
  const m = generateModel({ ...base, width: 30, length: 40, shape: 'l' }, program());
  assert.equal(m.courtyards.length, 0, 'L should have no courtyards');
});

test('rect courtyard test: rect shape has no courtyard', () => {
  const m = generateModel({ ...base, width: 30, length: 40, shape: 'rect' }, program());
  assert.equal(m.courtyards.length, 0, 'rect should have no courtyards');
});

test('courtyard.roofable is always false', () => {
  for (const shape of ['rect', 'l', 'u']) {
    const m = generateModel({ ...base, width: 35, length: 45, shape }, program());
    m.courtyards.forEach(c => assert.equal(c.roofable, false, `courtyard.roofable must be false, not ${c.roofable}`));
  }
});

test('buildingFootprint polygon area must be positive', () => {
  for (const entry of /** @type {Direction[]} */ (['s', 'n', 'e', 'w'])) for (const shape of ['rect', 'l', 'u']) {
    const m = generateModel({ ...base, width: 30, length: 40, entry, streets: { [entry]: true }, shape }, program());
    const area = polygonArea(m.buildingFootprint);
    assert.ok(area > 1, `buildingFootprint area (${area.toFixed(2)}) must be > 1 m²`);
  }
});
