import test from 'node:test';
import assert from 'node:assert/strict';
import { generateModel, defaultRooms, validateModel, quantities } from '../dist/planner.mjs';
import { legacyToDoc } from '../dist/draw/import-legacy.mjs';
import { docToLegacy } from '../dist/draw/export-legacy.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';
import { calculateMizanScore } from '../dist/mizan-score.mjs';

const STRATEGIES = ['claude-rect', 'compact', 'balanced', 'frontage', 'courtyard', 'u-court', 'pavilions', 'staggered'];
const plot = { width: 20, length: 30, floors: 1, streets: { s: true }, entry: 's' };
const rooms = defaultRooms({ bedrooms: 3, majlis: 1 });
const toDoc = m => applyCommand(legacyToDoc(m).doc, { type: 'set-plot', streets: ['s'], entries: ['s'] }).doc;

for (const strategy of STRATEGIES) {
  test(`docToLegacy: ذهاب وإياب بلا فقد (${strategy})`, () => {
    const m = generateModel(plot, rooms, { strategy });
    const { model, report } = docToLegacy(toDoc(m));
    assert.deepEqual(report.validation, [], 'validateModel يجب ألا يجد أخطاء');
    assert.equal(model.rooms.length, m.rooms.length);
    assert.equal(model.openings.length, m.openings.length);
    assert.equal(model.walls.length, m.walls.length);
    assert.equal(report.skipped.length, 0);
    assert.equal(report.unnamed.length, 0);
    assert.equal(calculateMizanScore(model).score, calculateMizanScore(m).score, 'الدرجة لا تتغير بلا تعديل');
    assert.deepEqual(validateModel(model), []);
    assert.ok(quantities(model), 'الكميات تُحسب على النموذج الناتج');
  });
}

test('docToLegacy: ما يُعدَّل في الرسم يظهر في النموذج ولا يُخفى ما لا يُترجم', () => {
  const m = generateModel(plot, rooms, { strategy: 'compact' });
  let doc = toDoc(m);
  const first = doc.labels[0];
  doc = applyCommand(doc, { type: 'delete', ids: [first.id] }).doc;
  const { model, report } = docToLegacy(doc);
  assert.equal(model.rooms.length, m.rooms.length - 1, 'حُذف اسم غرفة فخرجت من البرنامج');
  assert.equal(report.unnamed.length, 1, 'الفراغ بلا اسم مُعلَن لا مخفيّ');
  assert.match(report.program, /الغرف المرسومة/);
});

test('docToLegacy: بلا جدران يرفض بوضوح', () => {
  const m = generateModel(plot, rooms, { strategy: 'compact' });
  const doc = toDoc(m); doc.walls = [];
  assert.throws(() => docToLegacy(doc), /لا توجد جدران/);
});
