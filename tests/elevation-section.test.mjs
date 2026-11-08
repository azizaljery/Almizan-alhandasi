// لوحات الواجهات والقطاع والموقع العام وجدول الفتحات: اتساق الأرقام مع المستند لا مجرد وجود الرسم.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc, applyCommand } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { buildingModel, facadeSides, elevationGeometry, SIDE_VECTORS } from '../dist/draw/building-model.mjs';
import { elevationSheet, elevationSheets, elevationData, levelMarks } from '../dist/draw/elevation-sheet.mjs';
import { sectionModel, sectionSheet, chooseCut } from '../dist/draw/section-sheet.mjs';
import { openingSchedule, scheduleTables, scheduleHtml, scheduleSheet } from '../dist/draw/schedules.mjs';
import { siteModel, siteSheet } from '../dist/draw/site-sheet.mjs';
import { buildDrawingSet, drawingSetFiles } from '../dist/draw/drawing-set.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { PX_PER_MM } from '../dist/draw/sheet-frame.mjs';

const LAND = (width, length, floors = 1) => ({ width, length, floors, streets: ['s'], entries: ['s'] });
const C = { bedrooms: 4, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
const DOCS = {
  one: () => generateVillaDesigns({ land: LAND(20, 30), counts: C }).designs[0].doc,
  two: () => generateVillaTwoFloors({ land: LAND(20, 30, 2), counts: { bedrooms: 5, majlis: 2, baths: 7, kitchens: 1, halls: 1, dining: 1 } }).designs[0].doc,
  court: () => generateVillaDesigns({ land: LAND(20, 30), counts: C, requirements: { prefs: { courtyard: true } } }).designs[0].doc,
};
const cache = {}; const get = n => (cache[n] ||= DOCS[n]());
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

function house() {
  let doc = createDoc({ title: 'بيت الاختبار' });
  const run = c => { doc = applyCommand(doc, c).doc; };
  run({ type: 'add-rect', level: 'L1', a: { x: 0, y: 0 }, b: { x: 8, y: 6 }, t: .25 });
  run({ type: 'add-wall', level: 'L1', a: { x: 3, y: 0 }, b: { x: 3, y: 6 }, t: .12 });
  run({ type: 'add-label', level: 'L1', name: 'مجلس', roomType: 'majlis', seed: { x: 5.5, y: 3 } });
  run({ type: 'add-label', level: 'L1', name: 'مطبخ', roomType: 'kitchen', seed: { x: 1.5, y: 3 } });
  const south = doc.walls.find(w => Math.abs(w.a.y) < 1e-6 && Math.abs(w.b.y) < 1e-6);
  const east = doc.walls.find(w => Math.abs(w.a.x - 8) < 1e-6 && Math.abs(w.b.x - 8) < 1e-6);
  run({ type: 'add-opening', wall: south.id, kind: 'door', at: 1.5, w: .9, swing: 'in', hinge: 'left', entry: true });
  run({ type: 'add-opening', wall: south.id, kind: 'window', at: 5, w: 1.4 });
  run({ type: 'add-opening', wall: east.id, kind: 'window2', at: 3, w: 2.2 });
  run({ type: 'set-plot', polygon: [{ x: -3, y: -4 }, { x: 11, y: -4 }, { x: 11, y: 10 }, { x: -3, y: 10 }], setbacks: { s: 3, n: 2, e: 2, w: 2 }, streets: ['s'], entries: ['s'] });
  return doc;
}
/** جهة الواجهة التي تطل عليها فتحة خارجية (من تحليل المستند). */
function outwardSides(doc) {
  const out = new Map();
  for (const lv of analyzeDoc(doc).levels) for (const op of lv.openings) {
    const ext = op.sides.filter(s => s.exterior && s.other === 'outside'); if (!ext.length) continue;
    const v = ext[0].outward, side = Object.entries(SIDE_VECTORS).sort((a, b) => (b[1].x * v.x + b[1].y * v.y) - (a[1].x * v.x + a[1].y * v.y))[0][0];
    out.set(op.id, side);
  }
  return out;
}

test('الواجهات: الأمامية جهة المدخل، واليمنى يمين الناظر إليها، والأربع مختلفة', () => {
  const f = facadeSides(house());
  assert.deepEqual(f.map(x => x.role), ['front', 'back', 'right', 'left']);
  assert.deepEqual(f.map(x => x.side), ['s', 'n', 'e', 'w']);
  const g = facadeSides({ ...house(), entries: ['e'], entry: 'e' });
  assert.deepEqual(g.map(x => x.side), ['e', 'w', 'n', 's']);
});

test('الواجهات: البيت اليدوي — العرض والمناسيب وجلسات الفتحات وأعتابها مطابقة للمستند', () => {
  const doc = house(), { model, elevations } = elevationData(doc);
  assert.equal(model.roofTop, 3.2); assert.ok(near(model.parapetTop, 3.2 + doc.roof.parapet)); assert.equal(model.ground, -.45);
  const front = elevations.find(e => e.facade.role === 'front');
  assert.ok(near(front.buildingExtent.u1 - front.buildingExtent.u0, 8.25, 1e-6), 'عرض الواجهة = 8 + سماكة الجدار');
  assert.ok(near(front.extent.z1, model.parapetTop), 'أعلى الواجهة = أعلى الدروة');
  const byId = new Map(front.openings.map(o => [o.id, o]));
  for (const o of doc.openings.filter(o => doc.walls.find(w => w.id === o.wall).a.y === 0 && doc.walls.find(w => w.id === o.wall).b.y === 0)) {
    const e = byId.get(o.id); assert.ok(e, 'الفتحة على الواجهة الأمامية: ' + o.id);
    assert.ok(near(e.z0, o.sill) && near(e.z1, o.sill + o.h), `جلسة/عتب ${o.kind}: ${e.z0}/${e.z1}`);
    assert.ok(near(e.u1 - e.u0, o.w, 1e-6));
  }
  const right = elevations.find(e => e.facade.role === 'right');
  assert.deepEqual(right.openings.map(o => o.kind), ['window2']);
  assert.ok(near(right.openings[0].z0, .8) && near(right.openings[0].z1, 2.3));
  const marks = levelMarks(model).map(m => m.z);
  assert.deepEqual(marks.map(z => +z.toFixed(2)), [-.45, 0, 3.2, 4.1]);
});

for (const name of ['one', 'two', 'court']) {
  test(`الواجهات (${name}): كل فتحة خارجية تظهر على واجهة جهتها، والمناسيب من المستند`, () => {
    const doc = get(name), { model, elevations } = elevationData(doc), sides = outwardSides(doc);
    assert.ok(sides.size > 0);
    for (const [id, side] of sides) {
      const el = elevations.find(e => e.facade.side === side);
      assert.ok(el.openings.some(o => o.id === id), `الفتحة ${id} غائبة عن واجهة ${side}`);
    }
    // الفتحات المرسومة في اللوحتين = فتحات الواجهات الأربع، والظاهرة منها لها عنصر data-id
    const sheets = elevationSheets(doc, { date: '2026-11-08' });
    const svg = sheets.map(s => s.svg).join('');
    for (const e of elevations) for (const o of e.openings) assert.ok(svg.includes(`data-id="${o.id}"`), 'مرسومة: ' + o.id);
    // المناسيب: أرضية كل دور، السطح، أعلى الدروة
    const z = sheets[0].meta.elevations[0].marks.map(m => +m.z.toFixed(3));
    for (const L of doc.levels) assert.ok(z.includes(+L.elevation.toFixed(3)), 'منسوب ' + L.name);
    const top = doc.levels[doc.levels.length - 1];
    assert.ok(z.includes(+(top.elevation + top.height).toFixed(3)) && z.includes(+(top.elevation + top.height + doc.roof.parapet).toFixed(3)));
    assert.ok(near(sheets[0].meta.elevations[0].height, top.elevation + top.height + doc.roof.parapet + model.plinth, 1e-6), 'الارتفاع الكلي');
    // ارتفاعات الوجوه: جدار الدور = منسوبه + ارتفاعه (+ الدروة إن كان سطحه مكشوفًا)
    for (const e of elevations) for (const f of e.faces.filter(f => f.kind === 'wall')) {
      const L = model.levels.find(l => l.id === f.level), want = L.E + L.H + (f.parapet ? model.parapet : 0);
      assert.ok(near(f.z1, want, 1e-6), `ارتفاع وجه ${f.segId}: ${f.z1} ≠ ${want}`);
      assert.ok(near(f.z0, L.i === 0 ? model.ground : L.E));
    }
    for (const s of sheets) { assert.equal(s.meta.textOverlaps, 0); assert.ok(!/NaN|undefined/.test(s.svg)); assert.match(s.svg, /width="420mm" height="297mm"/); }
    assert.equal(sheets[0].meta.scale, sheets[1].meta.scale, 'مقياس موحّد للواجهات الأربع');
  });
}

test('الواجهات: الأقرب يحجب الأبعد — فتحة خلف كتلة أقرب لا تُعد ظاهرة', () => {
  const doc = get('court'), { elevations } = elevationData(doc);
  const right = elevations.find(e => e.facade.role === 'right');
  const hidden = right.openings.filter(o => o.hidden);
  assert.ok(hidden.length > 0, 'فتحات الجناح المقابل المطلة على الفناء محجوبة');
  for (const o of hidden) assert.ok(!right.visible.includes(o.id));
});

test('القطاع: عبر الدرج في الدورين، وعبر الصالة بلا درج؛ بلاطة لكل منسوب وفتحة الدرج مقطوعة من البلاطة', () => {
  const two = get('two'), S = sectionModel(two);
  assert.equal(S.cut.through, 'stair');
  assert.ok(S.stairCut.length >= 3, 'درجات مقطوعة'); assert.ok(S.stairSeen.length >= 3, 'القلبة الثانية خلف القطع');
  assert.equal(S.slabs.length, two.levels.length + 1);
  for (const [i, L] of two.levels.entries()) { const s = S.slabs[i + 1]; assert.ok(near(s.z1, L.elevation + L.height) && near(s.z1 - s.z0, S.model.slab)); }
  const floor = S.slabs.find(s => s.kind === 'floor'), cutU = S.stairCut.filter(s => s.type === 'tread').map(s => (s.u0 + s.u1) / 2);
  const holeFree = cutU.filter(u => !floor.iv.some(([a, b]) => u > a + .01 && u < b - .01));
  assert.ok(holeFree.length >= cutU.length - 1, 'البلاطة لا تغطي الدرج المقطوع (فتحة الدرج)');
  // الجدران المقطوعة: أعلاها = سقف دورها أو الدروة
  for (const w of S.walls.filter(w => !w.fence)) { const L = S.model.levels.find(l => l.id === w.level); assert.ok(near(w.z1, L.E + L.H + (w.parapet ? S.model.parapet : 0))); }
  assert.ok(S.walls.some(w => w.opening), 'فتحة مقطوعة في جدار');
  const one = get('one'); assert.equal(chooseCut(one, sectionModel(one).model).through, 'hall');
  for (const n of ['one', 'two', 'court']) {
    const r = sectionSheet(get(n), { date: '2026-11-08' });
    assert.ok(!/NaN|undefined/.test(r.svg)); assert.match(r.svg, /class="cut-line"/); assert.equal(r.meta.textOverlaps, 0);
    assert.ok(r.meta.rooms.length >= 1); assert.ok(r.svg.includes('±0.00'));
  }
});

test('جدول الفتحات: مجموع الطرز = فتحات المستند، كل فتحة في طراز واحد متطابق، والأعداد لكل دور صحيحة', () => {
  for (const n of ['one', 'two', 'court']) {
    const doc = get(n), s = openingSchedule(doc);
    assert.equal(s.totals.all, doc.openings.length);
    assert.equal(s.totals.door + s.totals.passage + s.totals.window, doc.openings.length);
    const seen = new Set();
    for (const t of s.types) {
      for (const id of t.ids) { assert.ok(!seen.has(id)); seen.add(id); const o = doc.openings.find(x => x.id === id); assert.equal(o.kind, t.kind); assert.ok(near(o.w, t.w, .006) && near(o.h, t.h, .006) && near(o.sill ?? 0, t.sill, .006)); }
      assert.equal(t.levels.reduce((a, l) => a + l.count, 0), t.count);
    }
    assert.equal(seen.size, doc.openings.length);
    for (const L of doc.levels) assert.equal(s.types.reduce((a, t) => a + (t.byLevel[L.id] || 0), 0), doc.openings.filter(o => o.level === L.id).length);
    assert.equal(s.totals.window, doc.openings.filter(o => /window/.test(o.kind)).length);
    assert.deepEqual(new Set(s.types.map(t => t.code)).size, s.types.length, 'رموز فريدة');
    const tables = scheduleTables(s);
    for (const t of tables) assert.equal(t.rows.length, s.groups[t.id].length + 1);
    assert.match(scheduleHtml(s), /جدول الأبواب/);
    const sheet = scheduleSheet(doc);
    assert.equal(sheet.meta.rows, s.types.length); assert.equal((sheet.svg.match(/class="schedule-row"/g) || []).length, s.types.length);
  }
});

test('الموقع العام: أضلاع الأرض، الشارع، الارتدادات الفعلية مقيسة من الجدران، المداخل، الشمال', () => {
  const doc = house(), S = siteModel(doc);
  assert.deepEqual(S.edges.map(e => +e.length.toFixed(2)).sort(), [14, 14, 14, 14]);
  const by = Object.fromEntries(S.edges.map(e => [e.side, e]));
  // المبنى من −0.125 إلى 8.125 أفقيًا ومن −0.125 إلى 6.125 رأسيًا؛ الأرض من −3 إلى 11 ومن −4 إلى 10
  assert.ok(near(by.s.actual, 3.875, 1e-6) && near(by.n.actual, 3.875, 1e-6) && near(by.w.actual, 2.875, 1e-6) && near(by.e.actual, 2.875, 1e-6), JSON.stringify(S.edges.map(e => [e.side, e.actual])));
  assert.equal(by.s.required, 3); assert.ok(by.s.street && by.s.entry && !by.n.street);
  assert.equal(S.entries.length, 1);
  assert.ok(near(S.areas.plot, 196) && S.areas.coverage > 0 && S.areas.coverage < 1);
  const r = siteSheet(doc, { date: '2026-11-08' });
  for (const s of ['مخطط الموقع العام', 'شارع — الجهة الجنوبية', 'عرض الشارع غير مُدخل', 'ارتداد 3.88 م', 'المُدخل 3.00 م', 'مدخل', '14.00 م']) assert.ok(r.svg.includes(s), 'ينقص: ' + s);
  assert.match(r.svg, /class="north"/); assert.ok(!/NaN|undefined/.test(r.svg));
  for (const n of ['one', 'two', 'court']) { const m = siteSheet(get(n)).meta; assert.equal(m.edges.length, 4); assert.equal(m.streets, 1); assert.ok(m.entries >= 1); assert.ok(m.edges.every(e => e.actual > 0)); }
});

test('مجموعة اللوحات: خمس لوحات SVG بأرقامها، والفشل في واحدة لا يُسقط الباقي', () => {
  const set = buildDrawingSet(get('two'), { date: '2026-11-08', fingerprint: 'fp' });
  assert.deepEqual(set.sheets.map(s => s.no), ['A-00', 'A-E1', 'A-E2', 'A-S1', 'A-D1']);
  assert.equal(set.errors.length, 0);
  for (const s of set.sheets) { assert.match(s.svg, /^<svg /); assert.ok(s.svg.includes('fp')); assert.ok(s.svg.includes('معتمدًا للترخيص'), 'تنويه ليس للتنفيذ: ' + s.id); }
  const files = drawingSetFiles(set); assert.equal(files.length, 5); assert.ok(files.every(f => /^mizan-A-[0-9A-Z]+-[a-z0-9-]+\.svg$/.test(f.name)));
  const empty = buildDrawingSet(createDoc({ title: 'فارغ' }));
  assert.ok(Array.isArray(empty.sheets));
  assert.equal(PX_PER_MM, 4);
});

test('لوحة الواجهتين: الأدوار المطلوبة فقط، وعنوان كل واجهة بجهتها', () => {
  const r = elevationSheet(house(), { roles: ['right'] });
  assert.equal(r.meta.elevations.length, 1); assert.ok(r.svg.includes('الواجهة اليمنى (الشرقية)'));
  assert.ok(r.svg.includes('direction="ltr"'), 'المناسيب ذات الإشارة بعزل اتجاه');
  const g = elevationGeometry(buildingModel(house()), facadeSides(house())[0]);
  assert.ok(g.faces.every((f, i, a) => !i || a[i - 1].depth <= f.depth), 'مرتبة من الأبعد إلى الأقرب');
});
