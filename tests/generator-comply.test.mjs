// المولّد يطابق الاشتراطات البلدية من الأصل: حدود البناء من requiredSetbacks (المصدر نفسه الذي تحكم به بطاقة المطابقة)،
// ووجه الجدار الخارجي على خط الارتداد أو داخله، وسترة السطح الافتراضية ضمن 1.70–2.00 م.
// لكل حالة: كل بديل مولَّد (لا الأول فقط) ← لا «مخالف» في بنود الارتداد ولا السترة ولا نسبة البناء، وفروق المولّد كلها ≥ 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInitialDesign, SharaSession } from '../dist/home-flow.mjs';
import { checkDoc, generatorFootprint, EXT_WALL } from '../dist/villa-layout.mjs';
import { checkMunicipal, generatorSetbackGaps, requiredSetbacks, buildEnvelope, ruleById } from '../dist/municipal-rules.mjs';
import { createDoc, parseDoc, ROOF_PARAPET_DEFAULT } from '../dist/draw/doc.mjs';
import { validatePlot } from '../dist/planner.mjs';
import { fitFacts } from '../dist/fit-ladder.mjs';

const ONE = 'ابي فيلا دور واحد 3 غرف نوم ومجلس رجال وصالة ومطبخ';
const TWO = 'ابي فيلا دورين 4 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ وغرفة طعام';
const land = (width, length, streets, entry, streetWidths) => ({ width, length, streets, entries: [entry], ...(streetWidths ? { streetWidths } : {}) });
/** [الاسم، الأرض، البرنامج، عدد الأدوار المتوقع] — أراضٍ 12.5×30، 15×25، 20×30، 25×35؛ شارع، شارعان (أمامي وخلفي)، زاوية؛ عرض 12، 15، 20، 30، 40 وبدون عرض. */
const CASES = [
  ['12.5×30 شارع بلا عرض، دور', land(12.5, 30, ['s'], 's'), ONE, 1],
  ['12.5×30 شارع 15 م، دوران', land(12.5, 30, ['s'], 's', { s: 15 }), TWO, 2],
  ['12.5×30 زاوية 20 م و12 م، دوران', land(12.5, 30, ['s', 'e'], 's', { s: 20, e: 12 }), TWO, 2],
  ['12.5×30 شارع 40 م، دوران', land(12.5, 30, ['s'], 's', { s: 40 }), TWO, 2],
  ['15×25 شارع 12 م، دور', land(15, 25, ['s'], 's', { s: 12 }), ONE, 1],
  ['15×25 شارع 30 م، دوران', land(15, 25, ['n'], 'n', { n: 30 }), TWO, 2],
  ['15×25 زاوية بلا عرض، دوران', land(15, 25, ['s', 'w'], 's'), TWO, 2],
  ['20×30 شارع بلا عرض، دوران', land(20, 30, ['s'], 's'), TWO, 2],
  ['20×30 شارعان 20 م و15 م (أمامي وخلفي)، دوران', land(20, 30, ['s', 'n'], 's', { s: 20, n: 15 }), TWO, 2],
  ['20×30 زاوية 40 م و20 م، مدخل شرقي، دوران', land(20, 30, ['e', 'n'], 'e', { e: 40, n: 20 }), TWO, 2],
  ['20×30 شارع 20 م، مدخل غربي، دور', land(20, 30, ['w'], 'w', { w: 20 }), ONE, 1],
  ['25×35 زاوية 30 م و15 م، دوران', land(25, 35, ['s', 'e'], 's', { s: 30, e: 15 }), TWO, 2],
  ['25×35 شارع 40 م، دور', land(25, 35, ['s'], 's', { s: 40 }), ONE, 1],
  ['25×35 شارعان 15 م وبلا عرض للخلفي، دوران', land(25, 35, ['n', 's'], 'n', { n: 15 }), TWO, 2],
  ['20×30 شارع 13.3 م (خُمسه خارج شبكة المولّد)، دوران', land(20, 30, ['s'], 's', { s: 13.3 }), TWO, 2],
  ['15×25 زاوية 17 م و11 م، دور', land(15, 25, ['n', 'e'], 'n', { n: 17, e: 11 }), ONE, 1],
  // أرض قليلة العمق على شارع عريض: الارتداد الأمامي 5–6 م يترك عمقًا 4.75–5.75 م؛ يُصمَّم شريطًا ضحلًا (لا يُرفض ولا يُخفَّف الاشتراط)
  ['30×12.5 شارع 40 م (عمق البناء 4.75 م)، دور', land(30, 12.5, ['s'], 's', { s: 40 }), ONE, 1],
  ['30×12.5 زاوية 25 م و15 م (عمق البناء 5.75 م)، دور', land(30, 12.5, ['s', 'e'], 's', { s: 25, e: 15 }), ONE, 1],
];
const GUARDED = ['setback_front', 'setback_street', 'setback_neighbor', 'roof_parapet', 'coverage_ground', 'coverage_first'];
const TOL = 0.011, SIDES = ['n', 's', 'e', 'w'];
function ask(l, text) { const s = new SharaSession({ land: l }); s.start(); s.answer('mode', 'free'); s.answer('free', text); return s; }

for (const [name, l, text, floors] of CASES) test(`مطابقة من الأصل — ${name}`, async () => {
  const s = ask(l, text);
  const out = await generateInitialDesign({ land: l, rooms: s.rooms(), discovery: s.discovery(), idea: s.idea, counts: s.counts, requirements: s.requirements });
  const docs = (out.alternatives?.length ? out.alternatives.map(a => a.doc) : [out.doc]).map(d => (typeof d === 'string' ? parseDoc(d) : d));
  assert.ok(docs.length >= 1); assert.match(out.strategy, /^villa/, 'المولّد المهني لا المحرك السابق');
  assert.equal(docs[0].levels.length, floors, 'عدد الأدوار');
  const need = requiredSetbacks(l), widthsKnown = l.streets.every(x => l.streetWidths?.[x]);
  for (const [i, doc] of docs.entries()) {
    const tag = `${name} · بديل ${i + 1}`;
    assert.ok(checkDoc(doc).ok, tag);
    assert.equal(doc.roof.parapet, ROOF_PARAPET_DEFAULT, tag + ': سترة السطح');
    const res = checkMunicipal(doc, l);
    for (const id of GUARDED) {
      const it = res.items.find(x => x.id === id); assert.ok(it, tag + ': بند ' + id);
      assert.notEqual(it.verdict, 'fail', `${tag}: ${id} — ${it.text}`);
      // بعرض شارع مُدخل لكل الشوارع لا يبقى «يُراجع» في الارتدادات: الحكم «مطابق» (أو «لا ينطبق» حيث لا ضلع من هذا النوع)
      if (/^setback_/.test(id) && widthsKnown) assert.ok(['ok', 'na'].includes(it.verdict), `${tag}: ${id} = ${it.verdict} — ${it.text}`);
    }
    assert.equal(res.setbacks.length, 4, tag + ': قيست الأضلاع الأربعة');
    for (const r of res.setbacks) {
      // وجه الجدار (الأرضي والعلوي) على خط الارتداد أو داخله، ومحوره أبعد بنصف سماكة الجدار الخارجي
      assert.ok(r.ground >= r.required - TOL, `${tag}: الضلع ${r.side} أرضي ${r.ground} < ${r.required}`);
      if (r.upper !== null) assert.ok(r.upper >= r.required - TOL, `${tag}: الضلع ${r.side} علوي ${r.upper} < ${r.required}`);
      assert.ok(r.axis >= r.required + EXT_WALL / 2 - TOL, `${tag}: الضلع ${r.side} محور ${r.axis} < ${r.required} + ${EXT_WALL / 2}`);
      assert.equal(r.required, need.sides[r.side].required, tag + ': المطلوب من requiredSetbacks');
    }
    const gaps = generatorSetbackGaps(doc, l);
    assert.equal(gaps.length, 4, tag + ': ارتدادات المولّد مخزّنة للأضلاع الأربعة');
    for (const g of gaps) {
      assert.ok(g.diff >= 0, `${tag}: فرق المولّد عن المطلوب في الضلع ${g.side} = ${g.diff}`);
      const row = res.setbacks.find(r => r.side === g.side), face = row.upper !== null ? Math.min(row.ground, row.upper) : row.ground;
      assert.ok(face >= g.generator - TOL, `${tag}: وجه الجدار ${face} داخل خط المولّد ${g.generator} في الضلع ${g.side}`);
    }
  }
});

test('المصدر واحد: مسطح المولّد = مسطح الاشتراطات مُزاحًا نصف سماكة الجدار، وحقائق السلّم منه', () => {
  for (const [, l] of CASES) {
    const plot = validatePlot({ width: l.width, length: l.length, floors: 1, streets: Object.fromEntries(l.streets.map(x => [x, true])), entry: l.entries[0] });
    const fp = generatorFootprint(l, plot), env = buildEnvelope(l, { wallT: EXT_WALL }), need = requiredSetbacks(l);
    for (const x of SIDES) assert.equal(fp.sb[x], need.sides[x].required);
    // محاور المولّد داخل مستطيل المحاور النظامي (كل حافة تُقرَّب للداخل على شبكة 5 سم) وإحداثياتها على الشبكة
    assert.ok(fp.x >= env.axis.x - 1e-9 && fp.y >= env.axis.y - 1e-9 && fp.x + fp.w <= env.axis.x + env.axis.w + 1e-9 && fp.y + fp.h <= env.axis.y + env.axis.h + 1e-9);
    assert.ok(env.axis.w - fp.w < .1 + 1e-9 && env.axis.h - fp.h < .1 + 1e-9);
    for (const v of [fp.x, fp.y, fp.w, fp.h]) assert.ok(Math.abs(v * 20 - Math.round(v * 20)) < 1e-6, 'على شبكة 5 سم: ' + v);
    // الوجه الخارجي: داخل خط الارتداد وضمن نسبة البناء
    assert.ok(fp.x - EXT_WALL / 2 >= need.sides.w.required - 1e-9 && fp.y - EXT_WALL / 2 >= need.sides.s.required - 1e-9);
    assert.ok(l.width - (fp.x + fp.w + EXT_WALL / 2) >= need.sides.e.required - 1e-9 && l.length - (fp.y + fp.h + EXT_WALL / 2) >= need.sides.n.required - 1e-9);
    assert.ok((fp.w + EXT_WALL) * (fp.h + EXT_WALL) <= l.width * l.length * ruleById('coverage_ground').value.max + 1e-6);
    const f = fitFacts(l), sn = ['s', 'n'].includes(l.entries[0]);
    assert.equal(f.W, Math.round((sn ? fp.w : fp.h) * 10) / 10); assert.equal(f.D, Math.round((sn ? fp.h : fp.w) * 10) / 10);
  }
});

test('أرقام الارتداد في المولّد: أمامي خُمس الشارع (3 م أدنى، 6 م لـ30 م فأكثر)، شارع جانبي خُمسه (2 م أدنى)، جار 1.5 م', () => {
  const sb = (l) => generatorFootprint(l, validatePlot({ width: l.width, length: l.length, floors: 1, streets: Object.fromEntries(l.streets.map(x => [x, true])), entry: l.entries[0] })).sb;
  assert.deepEqual(sb(land(20, 30, ['s'], 's')), { n: 1.5, s: 3, e: 1.5, w: 1.5 });
  assert.deepEqual(sb(land(20, 30, ['s', 'e'], 's')), { n: 1.5, s: 3, e: 2, w: 1.5 });
  assert.deepEqual(sb(land(20, 30, ['s', 'e'], 's', { s: 20, e: 12 })), { n: 1.5, s: 4, e: 2.4, w: 1.5 });
  assert.deepEqual(sb(land(20, 30, ['s', 'n'], 's', { s: 30, n: 15 })), { n: 3, s: 6, e: 1.5, w: 1.5 });
  assert.deepEqual(sb(land(20, 30, ['e'], 'e', { e: 40 })), { n: 1.5, s: 1.5, e: 6, w: 1.5 });
  assert.deepEqual(sb(land(20, 30, ['s'], 's', { s: 12 })), { n: 1.5, s: 3, e: 1.5, w: 1.5 });
});

test('سترة السطح: الافتراضي للمستندات الجديدة 1.80 م ضمن الحد النظامي، والمستند القديم لا يُرحَّل ويظهر «مخالف»', () => {
  const R = ruleById('roof_parapet').value;
  assert.equal(ROOF_PARAPET_DEFAULT, 1.8); assert.ok(ROOF_PARAPET_DEFAULT >= R.min && ROOF_PARAPET_DEFAULT <= R.max);
  const fresh = createDoc(); assert.equal(fresh.roof.parapet, 1.8);
  const old = { ...createDoc(), roof: { parapet: .9, overhang: 0 } }, back = parseDoc(JSON.stringify(old));
  assert.equal(back.roof.parapet, .9, 'لا ترحيل صامت');
  assert.equal(checkMunicipal(back, {}).items.find(x => x.id === 'roof_parapet').verdict, 'fail');
  assert.equal(checkMunicipal(fresh, {}).items.find(x => x.id === 'roof_parapet').verdict, 'ok');
});
