// سقوف تضخم الفراغ (ROOM_CAPS): فائض مسطح الدور لا يُصبّ في غرفة واحدة، وطلب العميل الصريح يبقى فوق افتراض الميزان.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors, planMetrics, ROOM_CAPS } from '../dist/villa-layout.mjs';

const L = (width, length, floors = 1) => ({ width, length, floors, streets: ['s'], entries: ['s'] });
const C = (bedrooms, majlis = 1) => ({ bedrooms, majlis, baths: bedrooms + majlis, kitchens: 1, halls: 1, dining: 1 });
const beds = (doc, n) => planMetrics(doc, { bedrooms: n }).levels.flatMap(l => l.rooms).filter(r => r.type === 'bedroom' || r.type === 'master');
const LIMIT = 32; // أقصى صافي مقبول لغرفة نوم بلا طلب من العميل (السقف التصميمي 31 + هامش قياس الجدران)

test('دوران: لا غرفة نوم متضخمة في أي بديل (كانت تصل 41 و74 م²)', () => {
  for (const [w, l, n] of [[20, 30, 4], [25, 30, 3], [20, 30, 5]]) {
    const out = generateVillaTwoFloors({ land: L(w, l, 2), counts: C(n), requirements: {}, keep: 5 });
    assert.ok(out.designs.length >= 1);
    for (const d of out.designs) for (const r of beds(d.doc, n)) assert.ok(r.area <= LIMIT, `${w}×${l} ${n} غرف: ${r.name} ${r.area} م² في بديل ${d.mode}`);
  }
});

test('دور واحد: لا غرفة نوم متضخمة، والبدائل لا تقل عن اثنين على أرض متوسطة', () => {
  for (const [w, l, n] of [[20, 30, 4], [18, 27, 4], [15, 25, 4]]) {
    const out = generateVillaDesigns({ land: L(w, l), counts: C(n), requirements: {}, keep: 5 });
    assert.ok(out.designs.length >= 2, `${w}×${l}: ${out.designs.length} بديل`);
    for (const d of out.designs) for (const r of beds(d.doc, n)) assert.ok(r.area <= LIMIT, `${w}×${l}: ${r.name} ${r.area} م²`);
  }
});

test('فراغ الفائض يُعلن في الملاحظات باسمه، ومساحته ضمن سقفه', () => {
  const out = generateVillaTwoFloors({ land: L(25, 30, 2), counts: C(3), requirements: {}, keep: 5 });
  const withFiller = out.designs.filter(d => d.doc.labels.some(l => l.name === 'جلسة عائلية' || l.name === 'غرفة متعددة الاستعمال'));
  assert.ok(withFiller.length >= 1, 'برنامج علوي أصغر من الأرضي: يُخصَّص الفائض');
  for (const d of withFiller) {
    assert.ok(d.notes.some(n => /خُصّص الفائض/.test(n) && /لم يطلبها العميل/.test(n)), 'الإضافة معلنة وغير منسوبة للعميل');
    const m = planMetrics(d.doc, { bedrooms: 3 }).levels.flatMap(l => l.rooms);
    for (const r of m.filter(r => r.name === 'جلسة عائلية')) assert.ok(r.area <= ROOM_CAPS.filler.max * ROOM_CAPS.fillerHard, `جلسة ${r.area} م²`);
  }
});

test('مقاس طلبه العميل للرئيسية يتقدم على السقف الافتراضي', () => {
  const out = generateVillaDesigns({ land: L(25, 35), counts: C(3), requirements: { areas: { master: 36 } }, keep: 3 });
  const master = beds(out.designs[0].doc, 3).find(r => r.type === 'master' || /الرئيسية/.test(r.name));
  assert.ok(master && master.area >= 30, 'الرئيسية بمقاس العميل لا بمقاس الافتراض: ' + master?.area);
});
