// الفكرة المعمارية لكل بديل، والكتل غير الصندوقية (تراس علوي، جلسة خارجية محفورة، غرفة نوم أرضية)، وخلوّ التصميم الأول
// من عيبَي المراجعة الثابتين (مساحة دورة مياه الضيوف، وباب يعترضه المرحاض).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors, checkDoc, patIdea, patCore, ideaText, IDEA_CAP, OPEN_CAPS, planMetrics } from '../dist/villa-layout.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';

const land = (w, l, floors = 1) => ({ width: w, length: l, streets: ['s'], entries: ['s'], floors });
const counts = (beds, maj = 1) => ({ bedrooms: beds, majlis: maj, baths: beds, kitchens: 1, halls: 1, dining: 1 });
const terraces = (doc, upper = true) => doc.labels.filter(l => l.type === 'balcony' && (l.level !== doc.levels[0].id) === upper);

test('لكل بديل فكرة معمارية مسماة تُشرح للعميل، ومفتاحها محفوظ في توقيعه', () => {
  for (const out of [generateVillaDesigns({ land: land(20, 30), counts: counts(3), requirements: {}, keep: 5 }), generateVillaTwoFloors({ land: land(20, 30, 2), counts: counts(5), requirements: {}, keep: 5 })]) {
    assert.ok(out.designs.length >= 3);
    for (const d of out.designs) {
      assert.ok(d.idea && ideaText(d.idea).name, 'فكرة: ' + d.idea);
      assert.equal(patIdea(d.pat), d.idea); assert.ok(!patCore(d.pat).includes('~'));
      assert.ok(d.notes.some(n => n.startsWith('فكرة التصميم: «' + ideaText(d.idea).name)), 'الفكرة مشروحة في الملاحظات');
    }
    // لا تتكرر الفكرة نفسها بأسماء مختلفة في البدائل الأولى
    const per = {}; for (const d of out.designs) per[d.idea] = (per[d.idea] || 0) + 1;
    assert.ok(Math.max(...Object.values(per)) <= IDEA_CAP, JSON.stringify(per));
    assert.ok(Object.keys(per).length >= Math.min(3, out.designs.length), 'ثلاث أفكار مختلفة: ' + Object.keys(per).join('، '));
  }
});

test('دوران: الأرضي نفسه بعلوي آخر لا يُعرض تصميمًا جديدًا', () => {
  const { designs } = generateVillaTwoFloors({ land: land(20, 30, 2), counts: counts(4), requirements: {}, keep: 5 });
  const grounds = designs.map(d => patCore(d.pat).split('/')[0]); assert.equal(new Set(grounds).size, grounds.length);
});

test('«ابي تراس»: تراس علوي مكشوف فوق جزء من الأرضي في البديل الأول، بحاجز منخفض وباب زجاجي منزلق، وبند الطلب منفّذ', () => {
  const req = extractRequirements('ابي فيلا دورين 4 غرف نوم ومجلس وصالة ومطبخ وتراس فوق', {});
  assert.equal(req.prefs.terrace, true); assert.deepEqual(req.unsupported, []); assert.ok(!req.rules.some(r => r.kind === 'floor'), '«تراس فوق» لا يرفع المجلس للعلوي');
  const b = buildBrief('ابي فيلا دورين 4 غرف نوم ومجلس وصالة ومطبخ وتراس', { land: land(20, 30, 2) });
  const { designs } = generateVillaTwoFloors({ land: land(20, 30, 2), counts: b.counts, requirements: b.requirements, keep: 5 });
  const d = designs[0], T = terraces(d.doc);
  assert.equal(T.length, 1, 'تراس واحد في العلوي'); assert.match(d.idea, /terrace/); assert.ok(checkDoc(d.doc).ok);
  assert.ok(d.ledger.find(x => x.id === 'T-terrace')?.ok, 'بند التراس منفّذ');
  const up = d.doc.levels[1].id, fences = d.doc.walls.filter(w => w.level === up && w.kind === 'fence');
  assert.ok(fences.length >= 1 && fences.every(w => Math.abs(w.h - OPEN_CAPS.parapet) < 1e-6), 'الحافة الحرة حاجز منخفض لا جدار');
  assert.ok(d.doc.openings.some(o => o.kind === 'slider' && o.level === up), 'باب منزلق زجاجي إلى التراس');
  const m = planMetrics(d.doc).levels[1].rooms.find(r => r.type === 'balcony'); assert.ok(m.area >= OPEN_CAPS.terrace.min * .8 && m.area <= OPEN_CAPS.terrace.max * 1.15, 'مساحة التراس ' + m.area);
  // الدور العلوي أصغر من الأرضي: الكتلة غير صندوقية
  const lv = planMetrics(d.doc).levels; assert.ok(lv[1].rooms.filter(r => r.type !== 'balcony').reduce((a, r) => a + r.area, 0) < lv[0].rooms.reduce((a, r) => a + r.area, 0));
  // دور واحد: يُقال بصدق إن التراس العلوي يلزمه دوران
  const one = generateVillaDesigns({ land: land(20, 30), counts: counts(3), requirements: extractRequirements('3 غرف ومجلس وتراس', {}), keep: 3 }).designs[0];
  assert.match(one.ledger.find(x => x.id === 'T-terrace').why, /دوران/);
});

test('بلا طلب: البديل الأول بالتنظيم المعتاد؛ التراس وغرفة النوم الأرضية بدائل بعده معلنة، و«بدون بلكونات» يمنع التراس', () => {
  const { designs } = generateVillaTwoFloors({ land: land(20, 30, 2), counts: counts(5), requirements: {}, keep: 5 });
  assert.ok(!/bedDown|terrace/.test(designs[0].idea), designs[0].idea);
  const bd = designs.find(d => /^bedDown/.test(d.idea)); assert.ok(bd, 'بديل بغرفة نوم أرضية: ' + designs.map(d => d.idea).join('، '));
  assert.ok(bd.notes.some(n => /في الدور الأرضي \(لم تطلب ذلك\)/.test(n)), 'نقل الغرفة معلن');
  assert.ok(bd.doc.labels.some(l => l.level === bd.doc.levels[0].id && l.type === 'bedroom'), 'غرفة نوم في الأرضي');
  assert.equal(bd.doc.labels.filter(l => ['bedroom', 'master'].includes(l.type)).length, 5, 'كل غرف النوم المطلوبة موجودة');
  const no = generateVillaTwoFloors({ land: land(20, 30, 2), counts: counts(4), requirements: extractRequirements('دورين 4 غرف ومجلس بدون بلكونات', {}), keep: 5 }).designs;
  assert.ok(no.every(d => !/terrace/.test(d.idea) && !terraces(d.doc).length), no.map(d => d.idea).join('، '));
});

test('دور واحد: بديل بجلسة خارجية محفورة في الكتلة تفتح عليها الصالة، معلنة أنها لم تُطلب', () => {
  const { designs } = generateVillaDesigns({ land: land(20, 30), counts: counts(3), requirements: {}, keep: 5 });
  const d = designs.find(x => /patio/.test(x.idea)); assert.ok(d, designs.map(x => x.idea).join('، '));
  assert.notEqual(d, designs[0], 'ليست البديل الأول');
  assert.equal(terraces(d.doc, false).length, 1); assert.ok(checkDoc(d.doc).ok);
  assert.ok(d.doc.openings.some(o => o.kind === 'slider')); assert.ok(d.notes.some(n => /جلسة خارجية» محفورة في الكتلة \(لم تطلبها\)/.test(n)));
  assert.ok(d.doc.walls.some(w => w.kind === 'fence' && Math.abs(w.h - OPEN_CAPS.seatWall) < 1e-6), 'حافتها جلسة منخفضة لا جدار');
});

test('مراجعة المخطط: لا تصميم أول فيه دورة مياه دون الحد الإرشادي ولا باب يعترض مساره قطعة (مصفوفة حالات)', () => {
  let n = 0;
  for (const [w, l] of [[15, 25], [20, 30], [25, 30]]) for (const floors of [1, 2]) for (const beds of [3, 5]) for (const maj of [1, 2]) {
    let out; try { out = (floors === 2 ? generateVillaTwoFloors : generateVillaDesigns)({ land: land(w, l, floors), counts: counts(beds, maj), requirements: {}, keep: 5 }); } catch { continue; }
    n++; const bad = reviewDoc(out.designs[0].doc).filter(i => i.code === 'MIN_AREA' || i.code === 'SWING_BLOCKED');
    assert.deepEqual(bad.map(i => i.message.slice(0, 60)), [], `${w}×${l} ${floors} دور ${beds} غرف ${maj} مجلس`);
  }
  assert.ok(n >= 20, 'حالات مولّدة: ' + n);
});
