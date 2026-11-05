// المنطقة المناخية للفراغات: التصنيف من solar.mjs، الزجاج الحار، الإشغال الطويل، والحاجز الحراري الغربي.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc } from '../dist/draw/doc.mjs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { analyzeSolar } from '../dist/facade-j/facade-realism/solar.mjs';
import { climateZoning, classifyBearing, THRESHOLDS } from '../dist/intel/climate-zoning.mjs';
import { rect, label, open } from './fixtures/draw-cases.mjs';

const base = (north = 0) => ({ ...createDoc({ title: 'اختبار المناخ' }), north });
const crit = (r, id) => r.criteria.find(c => c.id === id);
/** غرفة واحدة 5×4 بنافذة على الجدار الغربي (x=0) ومدخل جنوبي. */
const westRoom = (type, name, north = 0) => { let d = rect(base(north), 0, 0, 5, 4); d = open(d, 2.5, 0, 'door', { entry: true }); d = open(d, 0, 2, 'window'); return label(d, 2.5, 2, name, type); };

test('classifyBearing يطابق جدول solar.mjs حرفيًا لكل الجهات الثماني', () => {
  for (const b of [0, 45, 90, 135, 180, 225, 270, 315, 300, 17]) {
    const mine = classifyBearing(b), ref = analyzeSolar({ entry: 'n', north: b });
    assert.equal(mine.compass, ref.compass); assert.equal(mine.level, ref.level); assert.equal(mine.risk, ref.risk);
  }
  assert.equal(classifyBearing(270).compass, 'غرب'); assert.equal(classifyBearing(270).level, 5);
  assert.equal(classifyBearing(0).level, 0); assert.equal(classifyBearing(180).level, 3);
});

test('جهة النافذة تتبع doc.north: الغربية مع north=0 تصبح شرقية مع north=180', () => {
  const west = climateZoning(westRoom('bedroom', 'غرفة نوم'));
  const rotated = climateZoning(westRoom('bedroom', 'غرفة نوم', 180));
  assert.equal(west.rooms[0].glass[0].compass, 'غرب'); assert.equal(rotated.rooms[0].glass[0].compass, 'شرق');
  assert.ok(crit(west, 'hotGlass').earned < THRESHOLDS.weights.hotGlass);
  assert.equal(crit(rotated, 'hotGlass').earned, THRESHOLDS.weights.hotGlass);
  assert.ok(rotated.score > west.score);
});

test('غرفة نوم على الغرب بزجاج: مكشوفة مع توصيات ساتر ونقل؛ مطبخ على الغرب: حاجز حراري', () => {
  const bed = climateZoning(westRoom('bedroom', 'غرفة نوم'));
  const r = bed.rooms[0];
  assert.equal(r.status, 'hot'); assert.equal(r.exposed, true); assert.equal(r.worst, 'غرب');
  assert.ok(bed.recommendations.some(x => x.kind === 'screen' && /غرفة نوم/.test(x.text)));
  assert.ok(bed.recommendations.some(x => x.kind === 'move'));
  assert.equal(crit(bed, 'longOccupancy').earned, 0);
  assert.equal(crit(bed, 'westBuffer').earned, 0);
  const kit = climateZoning(westRoom('kitchen', 'المطبخ'));
  assert.equal(kit.rooms[0].status, 'buffer');
  assert.equal(crit(kit, 'longOccupancy').earned, null);
  assert.equal(crit(kit, 'westBuffer').earned, THRESHOLDS.weights.westBuffer);
  assert.ok(kit.score > bed.score);
});

test('بلا نوافذ: معيار الزجاج غير منطبق والدرجة من المعايير المنطبقة؛ مستند فارغ يعيد null', () => {
  let d = rect(base(), 0, 0, 5, 4); d = open(d, 2.5, 0, 'door', { entry: true }); d = label(d, 2.5, 2, 'مخزن', 'storage');
  const r = climateZoning(d);
  assert.equal(crit(r, 'hotGlass').earned, null); assert.equal(crit(r, 'longOccupancy').earned, null);
  assert.equal(crit(r, 'westBuffer').earned, THRESHOLDS.weights.westBuffer); assert.equal(r.score, 100);
  assert.equal(climateZoning(createDoc()).score, null);
});

test('الفيلا النموذجية: درجة 0-100، تفاصيل لكل فراغ، واجهات بأطوال، وملاحظة تعلن أن العتبات تقديرية', () => {
  const r = climateZoning(sampleVilla());
  assert.ok(r.score >= 0 && r.score <= 100); assert.equal(r.criteria.length, 3);
  assert.equal(r.rooms.length, 9);
  for (const room of r.rooms) { assert.match(room.name, /[؀-ۿ]/); assert.ok(Array.isArray(room.walls) && Array.isArray(room.glass)); assert.ok(['ok', 'hot', 'warm', 'buffer'].includes(room.status)); }
  assert.ok(r.facades.some(f => f.compass === 'غرب' && f.length > 0));
  const applicable = r.criteria.filter(c => c.earned !== null);
  assert.equal(r.score, Math.round(applicable.reduce((s, c) => s + c.earned, 0) / applicable.reduce((s, c) => s + c.weight, 0) * 100));
  assert.match(r.note, /غير معايرة/);
  for (const x of r.recommendations) assert.match(x.text, /[؀-ۿ]/);
});
