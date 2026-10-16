import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInitialDesign, normalizeLand, diagnoseFit, friendlyBuildError } from '../dist/home-flow.mjs';
import { splitProgram, verifyFloors, generateTwoFloors, MultiFloorError, STAIR_NAME, STAIR_W, STAIR_H } from '../dist/multi-floor.mjs';
import { defaultRooms, validateModel, overlap } from '../dist/planner.mjs';
import { docToLegacy } from '../dist/draw/export-legacy.mjs';
import { applyCommand, parseDoc, serialize } from '../dist/draw/doc.mjs';

const discovery = { likes: [], rejects: [], avoids: [], life: {} };
const base = { bedrooms: 3, majlis: 2, baths: 3, kitchens: 1, halls: 1, dining: 1 };
// هذه الاختبارات تخص المحرك السابق للدورين (الاحتياطي)؛ المولّد المهني له اختباراته في villa-layout.test.mjs
const make = (width, length, counts, floors = 2) => generateInitialDesign({ land: { length, width, streets: ['s'], entries: ['s'], floors }, rooms: defaultRooms(counts), discovery, counts, engine: 'legacy' });
const inRect = (a, b, t = 0.02) => a.x >= b.x - t && a.y >= b.y - t && a.x + a.w <= b.x + b.w + t && a.y + a.h <= b.y + b.h + t;

/** كل ما يجب أن يصح في أي نتيجة دورين ناجحة. */
function assertTwoFloors(out, counts) {
  const { doc } = out;
  assert.equal(out.floors, 2);
  assert.equal(doc.levels.length, 2, 'مستند بدورين');
  assert.doesNotThrow(() => parseDoc(serialize(doc)), 'المستند يجتاز التحقق ويُحفظ ويُقرأ');
  const lv = doc.levels.map(l => docToLegacy(doc, { level: l.id }));
  lv.forEach((r, i) => assert.deepEqual(r.report.validation, [], `validateModel فارغ للدور ${i + 1}`));
  // تطابق السلم تمامًا
  const s = lv.map(r => r.model.rooms.find(x => x.name === STAIR_NAME));
  assert.ok(s[0] && s[1], 'غرفة سلم في الدورين');
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(s[0][k] - s[1][k]) < 0.01, `السلم متطابق في ${k}`);
  assert.ok(Math.abs(s[0].w - STAIR_W) < 0.01 && Math.abs(s[0].h - STAIR_H) < 0.01);
  // لا تداخل غرف داخل كل دور
  lv.forEach(r => r.model.rooms.forEach((a, i) => r.model.rooms.slice(i + 1).forEach(b => assert.ok(!overlap(a, b), `تداخل ${a.name}/${b.name}`))));
  // العلوي داخل كتلة الأرضي
  assert.ok(inRect(lv[1].model.building, lv[0].model.building), 'العلوي داخل كتلة الأرضي');
  // التوزيع بين الدورين حسب الأنواع، وبلا حذف
  const types = r => r.model.rooms.reduce((o, x) => (o[x.name.split(' ')[0]] = (o[x.name.split(' ')[0]] || 0) + 1, o), {});
  const g = types(lv[0]), u = types(lv[1]);
  assert.equal(u['غرفة'] || 0, counts.bedrooms, 'كل غرف النوم في العلوي');
  assert.equal(g['غرفة'] || 0, 0, 'لا غرف نوم في الأرضي');
  assert.equal(g['مجلس'] || 0, counts.majlis, 'كل المجالس في الأرضي');
  assert.equal(g['مطبخ'] || 0, counts.kitchens);
  assert.equal(lv[0].model.rooms.length + lv[1].model.rooms.length, defaultRooms(counts).length + 2, 'كل فراغات البرنامج + سلمان');
  // لا باب إلى الخارج في العلوي، ولا دورين بمدخل
  assert.equal(doc.openings.filter(o => o.level === doc.levels[1].id && o.entry).length, 0, 'لا باب مدخل في العلوي');
  assert.ok(doc.openings.filter(o => o.level === doc.levels[0].id && o.entry).length >= 1, 'مدخل في الأرضي');
  assert.equal(lv[1].report.arrival, 'stairs');
  // مجسّم الدرج في الأرضي داخل غرفة السلم
  const st = doc.stairs.filter(x => x.level === doc.levels[0].id);
  assert.equal(st.length, 1);
  assert.ok(st[0].x > s[0].x && st[0].x < s[0].x + s[0].w && st[0].y >= s[0].y && st[0].y + st[0].run <= s[0].y + s[0].h + 1e-6, 'الدرج داخل غرفة السلم');
  // المساحات كما طُلبت
  assert.equal(out.report.areaMismatch.length, 0, 'لا اختلاف مساحات');
  assert.equal(out.report.unmatched.length, 0);
  assert.equal(out.dna, null);
  assert.ok(out.notes.some(n => /دوران/.test(n)));
  return { lv, doc };
}

const CASES = [
  ['20×30 (4 نوم، 2 مجلس)', 20, 30, { ...base, bedrooms: 4 }],
  ['25×25 (3 نوم، 2 مجلس)', 25, 25, base],
  ['15×20 (2 نوم، مجلس واحد، بلا صالة/طعام)', 15, 20, { bedrooms: 2, majlis: 1, baths: 2, kitchens: 1, halls: 0, dining: 0 }],
];
for (const [name, w, l, counts] of CASES) {
  test('دوران: ' + name, async () => {
    const out = await make(w, l, counts);
    assertTwoFloors(out, counts);
  });
}

test('دوران: مدخل شرقي (أرض بشارعين) يُنتج دورين صالحين أيضًا', async () => {
  const counts = { ...base, bedrooms: 4 };
  const out = await generateInitialDesign({ land: { length: 30, width: 20, streets: ['e', 's'], entries: ['e'], floors: 2 }, rooms: defaultRooms(counts), discovery, counts, engine: 'legacy' }).catch(e => e);
  if (out instanceof Error) { assert.ok(out instanceof MultiFloorError, 'الفشل إن وقع فبسبب معلن لا استثناء عابر: ' + out.message); assert.ok(out.code.startsWith('MULTI_')); return; }
  assertTwoFloors(out, counts);
});

test('دور واحد لا يتغير: floors=1 أو بلا floors يعطي مستندًا بدور واحد وبصمة', async () => {
  const counts = { ...base, bedrooms: 3, majlis: 1 };
  const one = await make(20, 30, counts, 1);
  assert.equal(one.doc.levels.length, 1);
  assert.ok(one.dna, 'بصمة التصميم موجودة لدور واحد');
  const { land } = normalizeLand({ length: 30, width: 20, streets: ['s'], entries: ['s'] });
  assert.equal(land.floors, 1);
});

test('normalizeLand: عدد الأدوار 1 أو 2 فقط وبرسالة واضحة', () => {
  const raw = { length: 30, width: 20, streets: ['s'], entries: ['s'] };
  assert.equal(normalizeLand({ ...raw, floors: 2 }).land.floors, 2);
  assert.equal(normalizeLand({ ...raw, floors: 2 }).plot.floors, 1, 'plot المحرك لدور واحد دائمًا');
  assert.throws(() => normalizeLand({ ...raw, floors: 3 }), /ثلاثة أدوار/);
  assert.throws(() => normalizeLand({ ...raw, floors: 0 }), /1 أو 2/);
  assert.throws(() => normalizeLand({ ...raw, floors: 1.5 }), /1 أو 2/);
});

test('splitProgram: توزيع بالأنواع بلا حذف، وإعلان الحالات الحدّية', () => {
  const all = defaultRooms({ ...base, bedrooms: 4, halls: 2, baths: 3 });
  const s = splitProgram(all);
  assert.equal(s.ground.length + s.upper.length, all.length);
  assert.deepEqual(s.ground.filter(r => r.type === 'bath').length, 1, 'دورة ضيوف واحدة في الأرضي');
  assert.equal(s.upper.filter(r => r.type === 'bath').length, 2);
  assert.equal(s.ground.filter(r => r.type === 'living').length, 1);
  assert.equal(s.upper.filter(r => r.type === 'living').length, 1, 'الصالة الثانية عائلية في العلوي');
  assert.equal(s.upper.filter(r => r.type === 'bedroom').length, 4);
  assert.ok(s.notes.some(n => /صالة/.test(n)));
  const one = splitProgram(defaultRooms({ ...base, baths: 1 }));
  assert.ok(one.notes.some(n => /دورة مياه واحدة/.test(n)), 'دورة واحدة: تُعلن أن العلوي بلا دورة');
  assert.equal(one.upper.filter(r => r.type === 'bath').length, 0);
  assert.throws(() => splitProgram([{ name: STAIR_NAME, type: 'bedroom', area: 20 }]), e => e.code === 'MULTI_NAME_CLASH');
});

// ------------------------------------------------------------------------------------------------ فحص الصدق
test('verifyFloors يكشف سلمًا مفقودًا أو غير متطابق أو غير موصول', async () => {
  const out = await make(20, 30, { ...base, bedrooms: 4 });
  assert.ok(verifyFloors(out.doc).ok);
  // حذف تسمية سلم العلوي
  const lbl = out.doc.labels.find(l => l.name === STAIR_NAME && l.level === out.doc.levels[1].id);
  const noLabel = applyCommand(out.doc, { type: 'delete', ids: [lbl.id] }).doc;
  assert.ok(verifyFloors(noLabel).problems.some(p => /لا توجد غرفة سلم/.test(p)));
  // إزالة أبواب غرفة نوم في العلوي: لا يصل إليها السلم
  const L2 = out.doc.levels[1].id, r2 = docToLegacy(out.doc, { level: L2 }).model;
  const bed = r2.rooms.find(r => r.type === 'bedroom');
  const doorIds = r2.openings.filter(o => o.type === 'door' && o.connects.includes(bed.id)).map(o => o.id);
  assert.ok(doorIds.length > 0);
  const cut = applyCommand(out.doc, { type: 'delete', ids: doorIds }).doc;
  const v = verifyFloors(cut);
  assert.ok(!v.ok && v.problems.some(p => /لا يصل السلم إلى الفراغ/.test(p)), v.problems.join('|'));
});

test('الدور العلوي: validateModel الخام لا يشكو إلا من غياب المدخل (والسلم بديله)', async () => {
  const out = await make(20, 30, { ...base, bedrooms: 4 });
  const r = docToLegacy(out.doc, { level: out.doc.levels[1].id });
  const raw = validateModel(r.model);
  assert.ok(raw.length > 0 && raw.every(e => /المدخل/.test(e)), 'الأخطاء الخام كلها «لا مسار إلى المدخل»: ' + raw.slice(0, 2).join('|'));
  assert.deepEqual(r.report.validation, []);
  // الأرضي لا يُستثنى منه شيء
  assert.deepEqual(validateModel(docToLegacy(out.doc, { level: out.doc.levels[0].id }).model), []);
});

// ------------------------------------------------------------------------------------------------ حالات الفشل
test('فشل: أرض صغيرة يعطي سببًا برقم لا برنامجًا مقلّصًا', async () => {
  const err = await make(12, 20, base).catch(e => e);
  assert.ok(err instanceof MultiFloorError);
  assert.equal(err.code, 'MULTI_GROUND_FAILED');
  assert.ok(err.details.required > 100 && Number.isFinite(err.details.required));
  assert.equal(friendlyBuildError(err), err.message);
  assert.match(err.message, /الأرضي/);
  assert.match(err.message, /12×20/);
  assert.match(err.message, /\d+(\.\d+)? م²/);
});

test('فشل: لا فراغات للأرضي أو للعلوي', async () => {
  const noGround = await make(20, 30, { bedrooms: 3, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0 }).catch(e => e);
  assert.equal(noGround.code, 'MULTI_EMPTY_GROUND');
  const { plot, land } = normalizeLand({ length: 30, width: 20, streets: ['s'], entries: ['s'], floors: 2 });
  const noUpper = await generateTwoFloors({ plot, land, rooms: defaultRooms({ bedrooms: 0, majlis: 1, baths: 0, kitchens: 1, halls: 0, dining: 0 }), discovery, toDoc: () => { throw Error('لا يجب الوصول'); } }).catch(e => e);
  assert.equal(noUpper.code, 'MULTI_EMPTY_UPPER');
});

test('فشل: برنامج لا يتسع علويًا يعطي أسباب المحاولات بأرقام', async () => {
  // ثمانية غرف نوم: الأرضي يتسع على الأرض الكبيرة، والعلوي داخل كتلته لا يتسع أو لا يتطابق سلمه
  const counts = { bedrooms: 10, majlis: 1, baths: 1, kitchens: 1, halls: 0, dining: 0 };
  const err = await make(20, 30, counts).catch(e => e);
  assert.ok(err instanceof MultiFloorError, err.message);
  assert.ok(['MULTI_NO_ALIGNED_PAIR', 'MULTI_GROUND_FAILED'].includes(err.code));
  if (err.code === 'MULTI_NO_ALIGNED_PAIR') {
    assert.ok(err.details.attempts > 0 && err.details.required.upper > 200 && Object.keys(err.details.reasons).length > 0);
  }
});

test('تشخيص الفشل لدورين: حقائق لكل دور وخيارات مجرَّبة فعلًا (لا تُطبَّق وحدها)', async () => {
  const counts = base, land = { length: 20, width: 12, streets: ['s'], entries: ['s'], floors: 2 };
  const d = await diagnoseFit({ land, counts, discovery, maxGrow: 2 });
  assert.equal(d.facts.floors, 2);
  assert.equal(d.facts.floorsFacts.length, 2);
  assert.ok(d.facts.floorsFacts.every(f => f.required > 0 && f.available > 0));
  assert.ok(d.options.length > 0 && d.options.every(o => typeof o.ok === 'boolean' && o.land && o.counts));
  assert.ok(d.options.every(o => o.land.floors === 2), 'كل خيار يبقي عدد الأدوار كما طلب العميل');
  assert.deepEqual(land, { length: 20, width: 12, streets: ['s'], entries: ['s'], floors: 2 }, 'المدخلات لم تتغير');
  // كل خيار «ينجح» ينجح فعلًا عند التوليد
  const good = d.options.find(o => o.ok);
  if (good) { const out = await generateInitialDesign({ land: good.land, rooms: defaultRooms(good.counts), discovery }); assert.equal(out.doc.levels.length, 2); }
});
