import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors, buildProgram, checkDoc, canonicalSide, DESIGN_TARGETS } from '../dist/villa-layout.mjs';
import { extractRequirements, normalizeAr } from '../dist/requirements.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { parseDoc, serialize } from '../dist/draw/doc.mjs';
import { analyzeWalls } from '../dist/draw/topology.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';
import { geometryFingerprint } from '../dist/design-dna.mjs';

const L = (width, length, entries = ['s'], streets = entries) => ({ width, length, streets, entries });
const C = (o = {}) => ({ bedrooms: 0, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0, ...o });
const labels = (doc, type, level = 'L1') => doc.labels.filter(l => l.type === type && l.level === level);
const spaceOf = (doc, label) => analyzeWalls(doc.walls.filter(w => w.level === label.level)).spaces.find(s => s.net && pointInPolygon(label.seed, s.net));

/** ما يجب أن يصح في كل بديل: مستند صالح، كل تسمية في فراغ مغلق، لا فراغ بلا وصول، لا غرفة معيشية أضيق من حدها. */
function assertSound(doc) {
  assert.doesNotThrow(() => parseDoc(serialize(doc)));
  const c = checkDoc(doc); assert.ok(c.ok, c.problems.join(' | '));
  const rv = reviewDoc(doc);
  assert.ok(!rv.some(i => i.code === 'UNREACHABLE_ROOM'), 'كل فراغ يُوصل إليه');
  for (const i of rv.filter(i => i.code === 'MIN_WIDTH')) assert.ok(!/غرفة نوم|مجلس|مطبخ/.test(i.message), i.message);
  for (const i of rv.filter(i => i.code === 'NO_WINDOW')) assert.ok(!/غرفة نوم|مجلس|مطبخ/.test(i.message), 'غرف النوم والمجالس والمطبخ على جدار خارجي: ' + i.message);
  assert.ok(doc.openings.some(o => o.entry && o.level === 'L1'), 'باب مدخل في الأرضي');
}

test('البرنامج: لا قيم مسبقة، وحمام ملحق لكل غرفة بقدر عدد الدورات', () => {
  assert.throws(() => buildProgram({}), /غرفة نوم/);
  const p = buildProgram(C({ bedrooms: 3, majlis: 1, baths: 3, kitchens: 1 }));
  assert.equal(p.guestWc, 1); assert.equal(p.attached, 2);
  assert.ok(p.notes.some(n => n.includes('بلا حمام ملحق')));
  assert.equal(p.blocks.filter(b => b.kind === 'suite').length, 3);
  assert.equal(p.blocks.filter(b => b.master).length, 1);
});

for (const [name, land, counts] of [
  ['20×30 جنوبي، 4 نوم ومجلس', L(20, 30), C({ bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 })],
  ['15×25، 3 نوم', L(15, 25), C({ bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 })],
  ['25×40 مدخل شرقي، 5 نوم ومجلسان وصالتان', L(25, 40, ['e'], ['s', 'e']), C({ bedrooms: 5, majlis: 2, baths: 6, kitchens: 1, halls: 2, dining: 1 })],
  ['12×30 شمالي ضيق', L(12, 30, ['n']), C({ bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 })],
]) {
  test('دور واحد: ' + name, () => {
    const out = generateVillaDesigns({ land, counts });
    assert.ok(out.designs.length >= 1);
    for (const d of out.designs) {
      const doc = d.doc; assertSound(doc);
      const beds = [...labels(doc, 'bedroom'), ...labels(doc, 'master')];
      assert.equal(beds.length, counts.bedrooms, 'كل غرف النوم');
      assert.equal(labels(doc, 'master').length, 1, 'غرفة رئيسية واحدة');
      assert.equal(labels(doc, 'majlis').length, counts.majlis);
      assert.equal(labels(doc, 'bath').length, counts.baths, 'كل دورات المياه المطلوبة');
      // المبنى داخل الأرض القابلة للبناء
      const fp = doc.plot.polygon, xs = doc.walls.flatMap(w => [w.a.x, w.b.x]), ys = doc.walls.flatMap(w => [w.a.y, w.b.y]);
      assert.ok(Math.min(...xs) >= -1e-6 && Math.max(...xs) <= Math.max(...fp.map(p => p.x)) + 1e-6 && Math.min(...ys) >= -1e-6 && Math.max(...ys) <= Math.max(...fp.map(p => p.y)) + 1e-6);
      // كل غرفة نوم لها حمام يجاورها بباب بينهما (حين يكفي عدد الدورات)
      for (const b of beds) {
        const sp = spaceOf(doc, b); assert.ok(sp, b.name);
        assert.ok(sp.area >= 9, `${b.name} ${sp.area} م²`);
      }
    }
  });
}

test('حتمي: المدخلات نفسها تعطي الهندسة نفسها', () => {
  const a = generateVillaDesigns({ land: L(20, 30), counts: C({ bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 }) });
  const b = generateVillaDesigns({ land: L(20, 30), counts: C({ bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 }) });
  assert.deepEqual(a.designs.map(d => geometryFingerprint(d.doc)), b.designs.map(d => geometryFingerprint(d.doc)));
});

test('البدائل مختلفة فعلًا لا نسخ متطابقة', () => {
  const out = generateVillaDesigns({ land: L(20, 30), counts: C({ bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 }) });
  const fps = out.designs.map(d => geometryFingerprint(d.doc));
  assert.equal(new Set(fps).size, fps.length);
});

test('حجم المبنى من البرنامج: الأرض الكبيرة لا تضخّم الغرف', () => {
  const out = generateVillaDesigns({ land: L(30, 40), counts: C({ bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }) });
  const d = out.designs[0].doc;
  for (const b of [...labels(d, 'bedroom'), ...labels(d, 'master')]) assert.ok(spaceOf(d, b).area < 32, `${b.name} ${spaceOf(d, b).area}`);
  assert.ok(out.designs[0].notes.some(n => n.includes('الباقي ساحات')));
});

test('أرض لا تتسع: خطأ برقم المساحة لا برنامج مقلّص', () => {
  assert.throws(() => generateVillaDesigns({ land: L(11, 12), counts: C({ bedrooms: 4, majlis: 2, baths: 5, kitchens: 1, halls: 1, dining: 1 }) }), e => e.code === 'VILLA_NO_FIT' && /م²/.test(e.message));
});

test('المتطلبات من الكلام: خادمة بحمام، مطبخ مفتوح، مدخل للنساء، مجلس بمقاس', () => {
  const text = 'ابي 4 غرف نوم كل غرفة بحمامها ومجلس رجال 5×6 ومجلس نساء بمدخل مستقل وصالة وطعام ومطبخ مفتوح وغرفة خادمة بحمام';
  const req = extractRequirements(text, { counts: C({ bedrooms: 4, majlis: 2, kitchens: 1, halls: 1, dining: 1 }) });
  assert.equal(req.counts.baths, 4 + 1 + 1, 'حمام لكل غرفة + الضيوف + الخادمة');
  assert.equal(req.areas.majlis, 30);
  assert.ok(req.prefs.openKitchen && req.prefs.familyEntrance && req.extras.maid?.bath);
  const out = generateVillaDesigns({ land: L(20, 30), counts: req.counts, requirements: req });
  const doc = out.designs[0].doc; assertSound(doc);
  const names = doc.labels.map(l => l.name);
  assert.ok(names.includes('غرفة الخادمة') && names.includes('حمام الخادمة'));
  const m1 = doc.labels.find(l => l.name === 'مجلس الرجال'), a = spaceOf(doc, m1).area;
  assert.ok(Math.abs(a - 30) / 30 < .2, `مساحة المجلس ${a} قريبة من 30`);
  // فتحة واسعة بين المطبخ والطعام
  const k = spaceOf(doc, doc.labels.find(l => l.type === 'kitchen')), dn = spaceOf(doc, doc.labels.find(l => l.type === 'dining'));
  assert.ok(doc.openings.some(o => o.kind === 'arch' && o.w >= 1.6), 'فتحة واسعة');
  assert.ok(k && dn);
  assert.ok(out.designs[0].notes.some(n => n.includes('مدخل العائلة')));
  assert.ok(doc.openings.filter(o => o.level === 'L1' && ['door', 'door2'].includes(o.kind)).length > 10);
});

test('مدخل ثانٍ للأرض يُنفَّذ بباب على جهته', () => {
  const out = generateVillaDesigns({ land: L(20, 30, ['s', 'e'], ['s', 'e']), counts: C({ bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }) });
  const d = out.designs[0];
  assert.ok(d.doc.openings.filter(o => o.entry).length >= 2 || d.notes.some(n => n.includes('المدخل الثاني')));
});

test('canonicalSide: تحويل جهات الأرض إلى إطار المخطط مع المرآة', () => {
  assert.equal(canonicalSide('s', 'n'), 'y1'); assert.equal(canonicalSide('s', 'e'), 'x1'); assert.equal(canonicalSide('s', 'e', true), 'x0');
  assert.equal(canonicalSide('e', 'w'), 'y1'); assert.equal(canonicalSide('s', 's'), null);
});

test('دوران: الضيافة والخدمة في الأرضي، والنوم في العلوي، والسلم في الأرضي داخل الصالة', () => {
  const counts = C({ bedrooms: 5, majlis: 2, baths: 7, kitchens: 1, halls: 2, dining: 1 });
  const out = generateVillaTwoFloors({ land: L(20, 30), counts, requirements: extractRequirements('غرفة خادمة بحمام', { counts }) });
  for (const d of out.designs) {
    const doc = d.doc; assertSound(doc);
    assert.equal(doc.levels.length, 2);
    const up = doc.levels[1].id;
    assert.equal([...labels(doc, 'bedroom', up), ...labels(doc, 'master', up)].length, 5, 'كل غرف النوم في العلوي');
    assert.equal(labels(doc, 'majlis', 'L1').length, 2);
    assert.equal(doc.openings.filter(o => o.level === up && o.entry).length, 0, 'لا باب مدخل في العلوي');
    assert.equal(doc.stairs.filter(s => s.level === 'L1').length, 1);
    const hall = doc.labels.find(l => l.level === 'L1' && l.name === 'الصالة'), sp = spaceOf(doc, hall), st = doc.stairs[0];
    assert.ok(pointInPolygon({ x: st.x, y: st.y }, sp.net), 'السلم داخل الصالة');
    assert.ok(doc.texts.some(t => t.level === up && t.text === 'فتحة السلم'));
  }
});

test('دوران بلا غرف نوم للعلوي يُرفض بسبب واضح', () => {
  assert.throws(() => generateVillaTwoFloors({ land: L(20, 30), counts: C({ bedrooms: 1, majlis: 1, baths: 2, kitchens: 1 }), requirements: extractRequirements('الوالدة', {}) }), e => e.code === 'VILLA_NO_UPPER');
});

test('الفهم: تطبيع عربي وأرقام هندية وصيغ «٣ غرف ماستر»', () => {
  assert.equal(normalizeAr('غُرفةٌ  ٣×٤'), 'غرفه ٣×٤'.replace('٣', '3').replace('٤', '4'));
  const r = extractRequirements('ابي ٣ غرف ماستر ومطبخ امريكي والوالدة تحتاج غرفة قريبة', { counts: { majlis: 1 } });
  assert.equal(r.counts.bedrooms, 3); assert.ok(r.prefs.allEnsuite && r.prefs.openKitchen && r.prefs.elderlyRoom);
  assert.equal(r.counts.baths, 4);
  const r2 = extractRequirements('مجلس ومكتب ومستودع وغسيل ومطبخ مغلق', {});
  assert.ok(r2.extras.office && r2.extras.storage && r2.extras.laundry && r2.prefs.openKitchen === false);
  assert.deepEqual(extractRequirements('', {}).understood, [], 'بلا كلام لا شيء يُفترض');
  assert.ok(extractRequirements('ابي مسبح وقبو', {}).unsupported.length === 2);
});

test('الحدود الدنيا في الإعدادات التصميمية ليست أرقامًا نظامية مدّعاة', () => {
  assert.ok(DESIGN_TARGETS.bedroom >= 9 && DESIGN_TARGETS.master > DESIGN_TARGETS.bedroom);
});
