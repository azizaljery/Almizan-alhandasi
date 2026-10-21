// الجولة الثانية عشرة (بعد المراجعة المعمارية المستقلة): القراءة الحرفية للتعارض غير المجاب، و«المجالس» سؤال بافتراض معلن،
// والبرنامج السعودي الافتراضي (مدخل منكسر، دهليز المجلس، المقلط، دورة مياه يومية، حمام الخادمة، مطبخ ≥ 14 م² بباب خدمة، المواقف)
// بطبقاته في المراجعة المستقلة، والموقع والمناخ (لا شريط على أرض عريضة، منور للعميق، تظليل، الشارع الثاني)، وتعديل الواجهة.
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { extractRequirements, detectConflicts, applyLiteralReadings, parseReadingAnswer } from '../dist/requirements.mjs';
import { generateVillaDesigns, generateVillaTwoFloors, programV2 } from '../dist/villa-layout-v2.mjs';
import { verifyRequest, docRooms } from '../dist/rules.mjs';
import { reviewDesign } from '../dist/plan-review.mjs';
import { measureSaudiProgram, clientAsks } from '../dist/saudi-program.mjs';
import { planParking, PARKING_RULE, requiredParking } from '../dist/site-parking.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { buildBuildingScene } from '../dist/draw/scene3d.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };

test('C7: التعارض غير المجاب يُرسم بالقراءة الحرفية (5 فوق + غرفة الأم تحت = 6) والسؤال باقٍ ويذكر ما رُسم', () => {
  const { C, r } = caseReq('C7');
  const q = detectConflicts(r, C.land), g = q.find(c => c.type === 'floor-group-member');
  assert.ok(g); assert.match(g.question_ar, /القراءة الحرفية/); assert.match(g.question_ar, /6 غرف نوم/);
  applyLiteralReadings(r);
  assert.equal(r.counts.bedrooms, 6);
  assert.equal(r.literal.length, 1); assert.equal(r.literal[0].groupCount, 5); assert.equal(r.literal[0].member, 'elderly');
  applyLiteralReadings(r); assert.equal(r.counts.bedrooms, 6, 'لا أثر مضاعف');
  // عدد النموذج 6 (= 5 + الأم) ليس تعارض عدد
  const r6 = extractRequirements(C.text, { counts: { ...C.counts, bedrooms: 6 } });
  assert.ok(!detectConflicts(r6, C.land).some(c => c.type === 'count-mismatch'));
});

test('«المجالس» بالجمع بلا تحديد: سؤال (مجلس أم مجلسان؟) بافتراض معلن — مجلس رجال واحد ما لم يحدد النموذج', () => {
  const r = extractRequirements('دورين: المجالس والطعام تحت و4 غرف فوق', {});
  assert.equal(r.counts.majlis, 1);
  assert.ok(r.understood.some(u => /قيمة تصميمية افتراضية للميزان/.test(u)));
  const q = detectConflicts(r, { floors: 2 }).find(c => c.type === 'majlis-plural');
  assert.ok(q); assert.match(q.question_ar, /مجلس رجال ومجلس نساء/); assert.match(q.question_ar, /قيمة تصميمية افتراضية للميزان/);
  // تحديد صريح لا يُسأل عنه
  assert.ok(!detectConflicts(extractRequirements('المجالس: مجلس رجال ومجلس نساء', {}), {}).some(c => c.type === 'majlis-plural'));
  assert.ok(!detectConflicts(extractRequirements('مجلسين وصالة', {}), {}).some(c => c.type === 'majlis-plural'));
});

test('جواب القراءة: «من ضمنها» / «زيادة» / «مجلسين» / «مجلس واحد» — ولا يُعدّ ما لا يطابق جوابًا', () => {
  const T = ['floor-group-member', 'majlis-plural'];
  assert.deepEqual(parseReadingAnswer('من ضمنها', T), { 'floor-group-member': 'included' });
  assert.deepEqual(parseReadingAnswer('لا، زيادة عليها', T), { 'floor-group-member': 'extra' });
  assert.deepEqual(parseReadingAnswer('مو من ضمن الخمس', T), { 'floor-group-member': 'extra' });
  assert.deepEqual(parseReadingAnswer('ابي مجلسين رجال ونساء', T), { 'majlis-plural': 2 });
  assert.deepEqual(parseReadingAnswer('مجلس واحد بس', T), { 'majlis-plural': 1 });
  assert.deepEqual(parseReadingAnswer('المطبخ في الخلف', T), {});
});

test('C7 مولَّدًا: خمس غرف نوم في العلوي وغرفة الأم في الأرضي، والرئيسية بعيدة عن الدرج — مقيسًا من المستند', () => {
  const { r, land } = caseReq('C7');
  const out = generateVillaTwoFloors({ land, counts: r.counts, requirements: r, keep: 4 });
  assert.ok(out.designs.length >= 1);
  for (const d of out.designs) {
    const rooms = docRooms(d.doc).rooms, beds = rooms.filter(x => x.type === 'bedroom' || x.type === 'master');
    assert.equal(beds.filter(x => x.li === 1).length, 5, d.pat);
    assert.ok(rooms.some(x => x.name === 'غرفة كبار السن' && x.li === 0), d.pat);
    const led = verifyRequest(d.doc, r, { entry: 's' });
    assert.ok(led.every(x => x.ok), d.pat + ': ' + led.filter(x => !x.ok).map(x => x.text + ' ' + x.why).join(' | '));
    assert.ok(d.notes.some(n => /قراءة حرفية/.test(n)) && d.notes.some(n => /«المجالس» بالجمع/.test(n)));
  }
});

test('الجلسة: جواب «من ضمنها» يعيد التوليد ببرنامج 5 غرف، و«زيادة عليها» يسجَّل بلا تغيير، والأسئلة تُرفع بجوابها', async () => {
  const { r, land } = caseReq('C7');
  const first = await generateInitialDesign({ land: { ...land, floors: 2 }, counts: r.counts, requirements: r, engine: 'v2' });
  const s0 = createSession({ land: { ...land, floors: 2 }, counts: r.counts, requirements: r, result: first, engine: 'v2' });
  assert.deepEqual(s0.conflicts.map(c => c.type).sort(), ['floor-group-member', 'majlis-plural']);
  const a = await redesign(s0, { text: 'زيادة عليها' });
  assert.equal(a.reply.mode, 'answered'); assert.ok(!a.session.conflicts.some(c => c.type === 'floor-group-member'));
  const b = await redesign(s0, { text: 'من ضمنها' });
  assert.equal(b.reply.mode, 'answered-regenerated');
  const beds = docRooms(JSON.parse(b.session.designs.at(-1).doc)).rooms.filter(x => x.type === 'bedroom' || x.type === 'master');
  assert.equal(beds.length, 5);
});

test('البرنامج السعودي الافتراضي: علامات البرنامج معلنة ومطبخ ≥ 15.6 م² هدفًا، والمقلط لا يُفرض على دورين ولا مع اعتراض العميل', () => {
  const P = programV2({ bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, extractRequirements('3 غرف ومجلس وصالة ومطبخ وطعام', {}));
  assert.ok(P.mizanDefaults.some(m => m.id === 'kitchen') && P.mizanDefaults.some(m => m.id === 'familyEntry'));
  assert.ok(P.blocks.find(b => b.id === 'kitchen1').area >= 15.6);
  assert.equal(P.majlisDiningDefault, true);
  const P2 = programV2({ bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, extractRequirements('دورين: 3 غرف ومجلس وطعام', {}));
  assert.equal(P2.majlisDiningDefault, false);
  const P3 = programV2({ bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, extractRequirements('3 غرف ومجلس والمجلس بعيد عن الطعام', {}));
  assert.equal(P3.majlisDiningDefault, false);
  // مطبخ بمقاس صريح لا يُكبَّر
  const P4 = programV2({ bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, extractRequirements('المطبخ 3×3 و3 غرف', {}));
  assert.ok(!P4.mizanDefaults.some(m => m.id === 'kitchen'));
  // «خادمة بدون حمام» نفي صريح
  assert.equal(extractRequirements('غرفة خادمة بدون حمام', {}).extras.maid.noBath, true);
  assert.equal(extractRequirements('غرفة خادمة بدون حمام', {}).extras.maid.bath, false);
});

test('C1 وC9 مولَّدين: مدخل العائلة منكسر، ودهليز للمجلس، ومطبخ ≥ 14 م² بباب خدمة، وموقف مرسوم داخل الأرض، وحمام الخادمة (طلبه العميل في C1)', () => {
  for (const id of ['C1', 'C9']) {
    const { C, r, land } = caseReq(id);
    const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
    for (const d of out.designs) {
      const m = Object.fromEntries(measureSaudiProgram(d.doc, { text: C.text, counts: C.counts }, analyzeDoc(d.doc)).map(g => [g.id, g]));
      assert.ok(m.FAMILY_ENTRY_SCREEN.pass, `${id} ${d.pat}: ${m.FAMILY_ENTRY_SCREEN.reasons_ar}`);
      assert.ok(m.KITCHEN_SERVICE.pass, `${id} ${d.pat}: ${m.KITCHEN_SERVICE.reasons_ar}`);
      assert.ok(m.PARKING.pass, `${id} ${d.pat}`);
      assert.ok(m.SITE_FIT.pass, `${id} ${d.pat}`);
      if (id === 'C1') { assert.ok(m.MAID_BATH.clientAsked && m.MAID_BATH.pass, `${id} ${d.pat}`); }
    }
    assert.ok(out.designs.some(d => measureSaudiProgram(d.doc, { text: C.text }, analyzeDoc(d.doc)).find(g => g.id === 'MAJLIS_LOBBY').pass));
  }
});

test('المراجعة المستقلة: بند البرنامج السعودي بوابة إن طلبه العميل، وملاحظة معلنة إن كان قيمة افتراضية للميزان، والمواقف اشتراط نظامي بمصدره', () => {
  const { C, r, land } = caseReq('C9');
  const d = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 }).designs[0];
  const noShade = JSON.parse(JSON.stringify(d.doc)); noShade.finish = { ...(noShade.finish || {}), facade: { ...(noShade.finish?.facade || {}), shading: false } };
  const asDefault = reviewDesign(noShade, { text: C.text, counts: C.counts }, { external: false, heavy: false }).gates.find(g => g.id === 'SHADING');
  assert.equal(asDefault.ok, true); assert.equal(asDefault.tier, 'mizan-default'); assert.ok(asDefault.notes_ar.length >= 1);
  const asked = reviewDesign(noShade, { text: C.text + '، مع تظليل النوافذ', counts: C.counts }, { external: false, heavy: false }).gates.find(g => g.id === 'SHADING');
  assert.equal(asked.ok, false); assert.equal(asked.tier, 'client');
  // المواقف: العدد اشتراط نظامي متحقق (موقف لأرض ≤ 400 م²، وموقفان لما فوقها) — يرسب بلا طلب العميل، ومصدره مذكور
  const oneBay = JSON.parse(JSON.stringify(d.doc)); oneBay.zones = oneBay.zones.filter(z => z.type === 'garage').slice(0, 1);
  const pk1 = reviewDesign(oneBay, { text: C.text, counts: C.counts }, { external: false, heavy: false }).gates.find(g => g.id === 'PARKING');
  assert.equal(pk1.ok, false, 'أرض 600 م² بموقف واحد: نقص عن المطلوب نظاميًا'); assert.equal(pk1.tier, 'regulation');
  assert.match(pk1.source, /اشتراطات إنشاء المباني السكنية/); assert.equal(pk1.value.required, 2);
  // مستند لا يمثّل مواقف الموقع (مرسوم يدويًا أو بالمولّد الأول): البوابة غير منطبقة ومذكور أنها لم تُقس — لا رسوب ولا نجاح مدّعى
  const noBays = JSON.parse(JSON.stringify(d.doc)); noBays.zones = [];
  const pk0 = reviewDesign(noBays, { text: C.text, counts: C.counts }, { external: false, heavy: false }).gates.find(g => g.id === 'PARKING');
  assert.equal(pk0.ok, true); assert.equal(pk0.applicable, false); assert.match(pk0.reasons_ar[0], /لم يُقس/);
  assert.equal(requiredParking(400), 1); assert.equal(requiredParking(401), 2); assert.equal(PARKING_RULE.level, 'official-confirmed');
  assert.equal(clientAsks({ text: 'غرفة خادمة بحمام' }).MAID_BATH, true);
  assert.equal(clientAsks({ text: 'غرفة خادمة بدون حمام' }).MAID_BATH, false);
});

test('الموقع: لا كتلة «شريط ضيق» على أرض عريضة (C5، C9)، والمنور في الأرض الضيقة العميقة (C4)', () => {
  for (const id of ['C5', 'C9']) {
    const { r, land } = caseReq(id), out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
    for (const d of out.designs) assert.ok(!(d.env.w < .6 * out.W && d.env.d > 2 * d.env.w), `${id} ${d.pat}: ${d.env.w}×${d.env.d}`);
  }
  const { r, land } = caseReq('C4'), out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
  assert.ok(out.designs.some(d => docRooms(d.doc).rooms.some(x => x.name === 'منور')), out.designs.map(d => d.pat).join(' '));
});

test('المواقف: العدد النظامي مرسوم داخل الأرض وخارج المبنى وممرات الأبواب، والمبنى يُزاح إلى الخلف إن لم يتسع أمامه', () => {
  const { r, land } = caseReq('C5'); const d = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 }).designs[0];
  const bays = d.doc.zones.filter(z => z.type === 'garage');
  assert.equal(bays.length, 2, 'أرض 630 م²: موقفان نظاميًا');
  const p = planParking(d.doc); assert.equal(p.bays.length, bays.length); assert.equal(p.required, 2);
  // الأرض الضيقة العميقة (C4، 432 م²): لا يتسع موقفان أمام المبنى في الارتداد 3 م، فيُزاح المبنى إلى الخلف ويُذكر ذلك
  const c4 = caseReq('C4'), d4 = generateVillaDesigns({ land: c4.land, counts: c4.r.counts, requirements: c4.r, keep: 4 }).designs[0];
  assert.equal(d4.doc.zones.filter(z => z.type === 'garage').length, 2);
  assert.ok(d4.notes.some(n => /أُزيح المبنى/.test(n)), d4.notes.join(' | '));
});

test('المجسّم: تظليل النوافذ الخارجية (بروز أفقي، وزعانف على الشرق والغرب)، والشارعان في أرض الزاوية، والسيارة على الموقف المرسوم', () => {
  const { r, land } = caseReq('C3'); const d = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 }).designs[0];
  const on = buildBuildingScene(d.doc, THREE, { textures: false }), off = buildBuildingScene({ ...d.doc, finish: { ...(d.doc.finish || {}), facade: { ...(d.doc.finish?.facade || {}), shading: false } } }, THREE, { textures: false });
  const tri = b => b.levels.reduce((a, l) => a + l.triangles, 0);
  assert.ok(tri(on) > tri(off) + 100, `${tri(on)} > ${tri(off)}`);
  assert.equal(on.site.streets.length, 2);
  assert.ok(Array.isArray(on.site.parking) && on.site.parking.length === d.doc.zones.filter(z => z.type === 'garage').length);
});

test('تعديل الواجهة (C9): المادة في المستند حجر والتوزيع حرفيًا كما هو، وبند الواجهة «نُفّذ» مقيسًا من المستند', async () => {
  const { C, r, land } = caseReq('C9');
  const first = await generateInitialDesign({ land, counts: r.counts, requirements: r, engine: 'v2' });
  const s0 = createSession({ land, counts: r.counts, requirements: r, result: first, engine: 'v2' });
  const { session, reply } = await redesign(s0, { text: C.edit });
  const after = JSON.parse(session.designs.at(-1).doc);
  assert.equal(after.finish.facade.base, 'stone');
  assert.ok(reply.geometryIdentical);
  assert.ok(reply.done.some(t => /الواجهة/.test(t)));
});

test('المواقف النظامية على أرض 15×30 (450 م²): لا يتسع موقفان ولا بالحجز — يُعرض البديل ونقصه النظامي معلن وبوابته راسبة ظاهرة', () => {
  const BASE = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, text = 'غرف النوم في الخلف والصالة تطل على الحوش الخلفي';
  const req = extractRequirements(text, { counts: { ...BASE } }); req.counts = { ...BASE, ...req.counts };
  const out = generateVillaDesigns({ land: { width: 15, length: 30, streets: ['s'], entries: ['s'], floors: 1 }, counts: req.counts, requirements: req });
  assert.ok(out.designs.length >= 1);
  for (const d of out.designs) {
    const n = d.doc.zones.filter(z => z.type === 'garage').length;
    if (n >= 2) continue;
    assert.ok(d.parkingShortfall); assert.ok(d.notes.some(x => /نقص نظامي معلن/.test(x) && /اشتراطات إنشاء المباني السكنية/.test(x)), d.notes.join(' | '));
    assert.deepEqual(d.review.failedGates, ['PARKING']);
  }
});
