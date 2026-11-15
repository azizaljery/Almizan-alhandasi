// أرض ضيقة بدورين: نمط الأحزمة العرضية (صف ضيافة أمامي، صالة وسطى بعرض المبنى تحمل السلم، صف خلفي)
// يقصّر المبنى بدل صالة علوية طولها 20 م، ويبقى سليمًا ومطابقًا للارتداد، والبديل يختلف هندسيًا عن النمط الجانبي.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaTwoFloors, checkDoc, planMetrics, BANDS_MAX_W, visualSim } from '../dist/villa-layout.mjs';
import { checkMunicipal } from '../dist/municipal-rules.mjs';

const land = (w, l) => ({ width: w, length: l, streets: ['s'], entries: ['s'], floors: 2, streetWidths: { s: 15 } });
const counts = { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 };

for (const [w, l] of [[12.5, 25], [12.5, 30], [13, 22]]) test(`${w}×${l} بدورين: الأحزمة العرضية تعطي صالة علوية قصيرة ومسطحًا أقصر من الجانبي`, () => {
  const out = generateVillaTwoFloors({ land: land(w, l), counts, requirements: {}, keep: 5 });
  const b = out.designs.find(d => d.mode === 'bands'); assert.ok(b, 'نمط الأحزمة غائب: ' + out.designs.map(d => d.mode).join(','));
  assert.ok(checkDoc(b.doc).ok);
  const m = planMetrics(b.doc), up = m.levels[1];
  assert.ok(up.hall.l <= 12, 'الصالة العلوية ' + up.hall.l + ' م (كانت 20 م في الجانبي)');
  for (const r of m.levels.flatMap(x => x.rooms).filter(x => x.type === 'master')) assert.ok(r.area <= 31, 'رئيسية متضخمة ' + r.area);
  const mun = checkMunicipal(b.doc, land(w, l)).items.filter(i => i.verdict === 'fail');
  assert.equal(mun.length, 0, mun.map(i => i.id).join(','));
  // أول بديل ليس الجانبي الطويل: الأحزمة تتصدر لأن عيوبها أقل
  assert.notEqual(out.designs[0].mode, 'side');
});

test('الأحزمة لا تظهر على الأراضي العريضة (الصالة الوسطى تصير شريطًا)', () => {
  assert.ok(BANDS_MAX_W <= 12.5);
  const out = generateVillaTwoFloors({ land: land(25, 30), counts: { ...counts, bedrooms: 5 }, requirements: {}, keep: 5 });
  assert.ok(!out.designs.some(d => d.mode === 'bands'));
});

test('بدائل الأرض الضيقة بدورين أكثر من واحد وكلها مختلفة مرئيًا', () => {
  const out = generateVillaTwoFloors({ land: land(12.5, 25), counts, requirements: {}, keep: 5 });
  assert.ok(out.designs.length >= 2, 'عدد البدائل ' + out.designs.length);
  for (let i = 0; i < out.designs.length; i++) for (let j = 0; j < i; j++) assert.ok(visualSim(out.designs[i].vsig, out.designs[j].vsig) <= .75);
});
