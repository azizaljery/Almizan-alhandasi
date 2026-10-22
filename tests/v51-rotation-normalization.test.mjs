import './_gen-cache.mjs'; // (الجولة الثالثة عشرة) ذاكرة نتائج المولّدات والمراجع بين ملفات الاختبار وبين التشغيلات
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRooms, validatePlot } from '../dist/planner.mjs';
import { buildDesignRequest } from '../dist/multi-engine.mjs';
test('normalization and public request preserve explicit no-rotation metadata', async () => {
  const raw = [{ name: 'kitchen', type: 'kitchen', area: 48, position: 'middle', side: 'any', dimensions: { width: 8, length: 6, allowRotation: false } }];
  const before = structuredClone(raw);
  const normalized = normalizeRooms(raw);
  assert.equal(normalized[0].dimensions.allowRotation, false);
  const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1 });
  const request = await buildDesignRequest({ plot, rooms: normalized, idea: 'kitchen 8x6 m, no rotation' });
  assert.equal(request.hardConstraints.find(c => c.kind === 'room_dimensions_exact').value.rotationAllowed, false);
  assert.deepEqual(raw, before);
});
test('public design never selects swapped geometry after a no-rotation request', async () => {
  const { defaultRooms } = await import('../dist/planner.mjs');
  const { runMultiEngineDesign } = await import('../dist/multi-engine.mjs');
  const raw = defaultRooms();
  const kitchen = raw.find(room => room.type === 'kitchen');
  kitchen.area = 48;
  kitchen.dimensions = { width: 8, length: 6, allowRotation: false };
  const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1 });
  let output;
  try { output = await runMultiEngineDesign({ plot, rooms: normalizeRooms(raw), idea: 'kitchen 8x6 m, no rotation', selectedShape: 'rect' }); }
  catch (error) {
    assert.match(error.message, /EXPLICIT_GEOMETRY_CONSTRAINT_VIOLATED/);
    return;
  }
  assert.ok(output.models.length > 0);
  for (const model of output.models) {
    const actual = model.rooms.find(room => room.type === 'kitchen');
    assert.ok(Math.abs(actual.w - 8) <= 1e-5 && Math.abs(actual.h - 6) <= 1e-5, `selected ${actual.w}×${actual.h} violates no rotation`);
  }
});
