// تنوع أنماط التنظيم بين البدائل: لا يطرد النمط الأرخص (الصالة المركزية) كل نمط آخر صالح، ولا يُعرض معيب ولا مكرر.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors, checkDoc, visualSim, VISUAL_LIMIT, MODE_CAP, OTHER_MODE_LIMITS } from '../dist/villa-layout.mjs';

const land = (w, l, floors = 1) => ({ width: w, length: l, streets: ['s'], entries: ['s'], floors });
const counts = (beds, majlis = 1) => ({ bedrooms: beds, majlis, baths: beds, kitchens: 1, halls: 1, dining: 1 });
const modes = ds => ds.map(d => d.mode), distinct = ds => new Set(modes(ds)).size;
const perMode = ds => Object.values(modes(ds).reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {}));
const sound = ds => { for (const d of ds) { const c = checkDoc(d.doc); assert.ok(c.ok, d.mode + ': ' + c.problems.join(' | ')); } };
const notCopies = ds => { for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) assert.ok(visualSim(ds[i].vsig, ds[j].vsig) <= VISUAL_LIMIT.relaxed + 1e-9, `البديلان ${i + 1} و${j + 1} متشابهان مرئيًا`); };

test('دور واحد على أرض متسعة: البدائل تمتد على ثلاثة أنماط تنظيم على الأقل، ولا أكثر من بديلين بالنمط نفسه', () => {
  // 20×30 بثلاث غرف: نمطان فقط؛ الثالث (T أو L) لا يتسع إلا بغلاف متضخم ترفضه سقوف المقاسات (ROOM_CAPS) أو يطابق المركزي مرئيًا فوق الحد
  for (const [w, l, beds, minModes = 3] of [[25, 30, 3], [20, 30, 3, 2], [30, 40, 4]]) {
    const { designs } = generateVillaDesigns({ land: land(w, l), counts: counts(beds), requirements: {}, keep: 5 });
    // لا تُكرَّر الفكرة نفسها لإكمال العدد: 20×30 بثلاث غرف له ثلاث أفكار سليمة (مركزية، فناء، مركزية بجلسة خارجية)
    assert.ok(designs.length >= (minModes === 2 ? 3 : 4), `${w}×${l}: ${designs.length} بدائل`);
    assert.ok(distinct(designs) >= minModes, `${w}×${l}: الأنماط ${modes(designs).join(',')}`);
    assert.ok(Math.max(...perMode(designs)) <= MODE_CAP, `${w}×${l}: ${modes(designs).join(',')}`);
    sound(designs); notCopies(designs);
  }
});

test('الأفضل جودةً يبقى أولًا، وكل بديل لا يخفق في بنود الطلب أكثر من الأول', () => {
  for (const gen of [() => generateVillaDesigns({ land: land(20, 30), counts: counts(4), requirements: {}, keep: 5 }), () => generateVillaTwoFloors({ land: land(20, 30, 2), counts: counts(5), requirements: {}, keep: 5 })]) {
    const { designs } = gen();
    // الأول هو الأقل كلفة بين البدائل بالتنظيم المعتاد؛ أفكار «غرفة نوم أرضية» و«التراس العلوي» بدائل بعده ولو قاربته جودةً
    const plain = designs.filter(d => !/bedDown|terrace/.test(d.idea)); assert.equal(plain[0], designs[0], 'الأول بالتنظيم المعتاد');
    assert.ok(plain.every(d => d.quality >= designs[0].quality - 1e-9), 'الأول هو الأقل كلفة');
    assert.ok(designs.every(d => d.fails === designs[0].fails));
  }
});

test('دوران بأربع غرف على أرض 20×30 فأعرض: ثلاثة بدائل على الأقل بنمطين مختلفين، والبديل من نمط آخر غير متضخم', () => {
  for (const [w, l] of [[20, 30], [25, 35], [30, 40]]) {
    const { designs } = generateVillaTwoFloors({ land: land(w, l, 2), counts: counts(4), requirements: {}, keep: 5 });
    assert.ok(designs.length >= 3, `${w}×${l}: ${designs.length} بدائل`);
    assert.ok(distinct(designs) >= 2, `${w}×${l}: ${modes(designs).join(',')}`);
    const best = designs[0];
    for (const d of designs.filter(x => x.mode !== best.mode)) assert.ok(d.penalty <= best.penalty + Math.max(120, best.penalty * 1.5) || (d.area <= best.area * OTHER_MODE_LIMITS.areaRatio && d.maxBed <= Math.max(OTHER_MODE_LIMITS.bed, best.maxBed * OTHER_MODE_LIMITS.bedRatio)), d.mode + ' متضخم');
    sound(designs); notCopies(designs);
  }
});

test('أرضي الدورين بمجلسين: يظهر نمط صف الخدمة الخلفي (مطبخ وطعام على الحوش الخلفي بممر خدمة) بديلًا سليمًا', () => {
  const { designs } = generateVillaTwoFloors({ land: land(25, 35, 2), counts: counts(5, 2), requirements: {}, keep: 5 });
  const tee = designs.find(d => d.mode === 'tee');
  assert.ok(tee, 'الأنماط ' + modes(designs).join(','));
  assert.match(tee.summary, /ممر خدمة/);
  assert.ok(tee.doc.labels.some(r => r.name === 'ممر الخدمة'));
  assert.ok(distinct(designs) >= 3, modes(designs).join(','));
  sound(designs);
});

test('tweaks.preferModes: يُقدَّم النمط المفضَّل إلى الصدارة إن صلح، ولا يُفرض ما لا يصلح، والمجهول يُهمل', () => {
  const base = { land: land(20, 30), counts: counts(4), keep: 5 };
  const plain = generateVillaDesigns({ ...base, requirements: {} }).designs;
  const court = generateVillaDesigns({ ...base, requirements: { tweaks: { preferModes: ['court'] } } }).designs;
  assert.equal(court[0].mode, 'court'); sound(court);
  assert.ok(court.every(d => d.fails === court[0].fails));
  const bogus = generateVillaDesigns({ ...base, requirements: { tweaks: { preferModes: ['bogus', 7, null] } } }).designs;
  assert.deepEqual(bogus.map(d => d.pat), plain.map(d => d.pat));
  // L لا يتسع لهذا البرنامج على هذه الأرض: لا يُفرض، وتبقى البدائل سليمة
  const l = generateVillaDesigns({ ...base, requirements: { tweaks: { preferModes: ['L'] } } }).designs;
  assert.ok(l.length >= 3); sound(l);
  const two = generateVillaTwoFloors({ land: land(20, 30, 2), counts: counts(4), requirements: { tweaks: { preferModes: ['court'] } }, keep: 5 }).designs;
  assert.equal(two[0].mode, 'court'); sound(two);
});
