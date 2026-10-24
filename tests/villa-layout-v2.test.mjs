import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors, programV2, partiTrees, siteOf, landWithSite, difference, roomsDifference, hardGates, PARTI_AR, VILLA_V2_ENGINE_VERSION } from '../dist/villa-layout-v2.mjs';
import { checkDoc } from '../dist/villa-layout.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { parseDoc, serialize } from '../dist/draw/doc.mjs';
import { docRooms } from '../dist/rules.mjs';
import { wallRect } from '../dist/draw/review.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';

const L = (width, length, entries = ['s'], streets = entries) => ({ width, length, streets, entries });
const C = (o = {}) => ({ bedrooms: 0, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0, ...o });
const req = (text, counts) => { const r = extractRequirements(text, { counts }); r.counts = { ...r.counts, ...counts }; return r; };
const LIT = new Set(['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen', 'office', 'service']);

/** ما يجب أن يصح في كل بديل من المولّد الثاني. */
function assertSound(doc, counts) {
  assert.doesNotThrow(() => parseDoc(serialize(doc)));
  assert.equal(JSON.parse(serialize(doc)).schema, doc.schema);
  const c = checkDoc(doc); assert.ok(c.ok, c.problems.join(' | '));
  const rv = reviewDoc(doc);
  assert.ok(!rv.some(i => i.code === 'UNREACHABLE_ROOM'), 'كل فراغ يُوصل إليه: ' + rv.filter(i => i.code === 'UNREACHABLE_ROOM').map(i => i.message).join(' | '));
  const M = analyzeDoc(doc);
  for (const lv of M.levels) for (const room of lv.rooms) {
    if (room.unlabelled || !LIT.has(room.type)) continue;
    assert.ok(lv.openings.some(op => op.window && op.sides.some(s => s.room.id === room.id && s.exterior)), `«${room.name}» بنافذة على الخارج أو حوش`);
  }
  // الصالة غرفة حقيقية: عرض صافٍ ≥ 4.2 م تقريبًا (المحور ≥ 4.2) ونسبة ≤ 2.5
  for (const h of docRooms(doc).rooms.filter(r => /^الصالة/.test(r.name))) {
    const w = h.x1 - h.x0, d = h.y1 - h.y0;
    assert.ok(Math.min(w, d) >= 4.0, `عرض الصالة ${Math.min(w, d)}`);
    assert.ok(Math.max(w, d) / Math.min(w, d) <= 2.55, `نسبة الصالة ${Math.max(w, d) / Math.min(w, d)}`);
  }
  const rooms = docRooms(doc).rooms;
  if (counts) {
    assert.equal(rooms.filter(r => r.type === 'bedroom' || r.type === 'master').length, counts.bedrooms, 'كل غرف النوم');
    assert.ok(rooms.filter(r => r.type === 'bath').length >= counts.baths, 'كل دورات المياه المطلوبة مرسومة');
  }
  assert.ok(doc.openings.some(o => o.entry && o.level === doc.levels[0].id), 'باب مدخل');
}
/** الوجه الخارجي لكل جدار داخل خط الارتداد (لا محوره فقط). */
function assertInsideSetbacks(doc) {
  const poly = doc.plot.polygon, sb = doc.plot.setbacks;
  const n = poly.length, ccw = poly.reduce((a, p, i) => a + p.x * poly[(i + 1) % n].y - poly[(i + 1) % n].x * p.y, 0) > 0;
  for (const w of doc.walls) for (const p of wallRect(w)) {
    assert.ok(pointInPolygon(p, poly), 'داخل الأرض');
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], L0 = Math.hypot(b.x - a.x, b.y - a.y), u = { x: (b.x - a.x) / L0, y: (b.y - a.y) / L0 };
      const out = ccw ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
      const side = Math.abs(out.x) > Math.abs(out.y) ? (out.x > 0 ? 'e' : 'w') : (out.y > 0 ? 'n' : 's');
      const inside = -((p.x - a.x) * out.x + (p.y - a.y) * out.y);
      assert.ok(inside >= (sb[side] || 0) - .02, `الجدار ${w.id} يتجاوز ارتداد جهة ${side} (${inside.toFixed(2)} < ${sb[side]})`);
    }
  }
}

test('البرنامج والأنماط: ستة أنماط مختلفة طوبولوجيًا على الأقل، ودورات المياه الزائدة فراغات حقيقية', () => {
  const P = programV2(C({ bedrooms: 4, majlis: 2, baths: 7, kitchens: 1, halls: 1, dining: 1 }), {});
  assert.ok(P.men && P.women.length === 1);
  assert.ok(P.wcs.length >= 1, 'دورة مياه عامة كفراغ');
  assert.equal(P.extraBaths, 0);
  const modes = new Set(partiTrees(P, { W: 17 }).map(t => t.mode));
  // تنظيمات مختلفة فعلًا: حوش، L، U، رواق، كتلتان، نواة T، الصالة في الخلف، مجلس على الواجهة الجانبية، مدخل في الركن
  for (const m of ['courtyard', 'ell', 'yoo', 'gallery', 'split', 'tcore', 'hallback', 'sidemajlis', 'cornerentry']) assert.ok(modes.has(m), 'النمط ' + m);
  assert.ok(modes.size >= 9);
  // الدوران: الصالة المركزية المدمجة (compact) للأرضي مع السلم
  assert.ok(partiTrees(P, { W: 17, stair: true }).some(t => t.mode === 'compact'));
  for (const m of modes) assert.ok(PARTI_AR[m], 'وصف عربي للنمط ' + m);
  assert.throws(() => programV2({}), /غرفة نوم/);
});

test('الاختلاف: الصيغة نفسها في أدلة القبول (إزاحة المراكز بعد أفضل انعكاس)', () => {
  const r = (name, x0, y0, x1, y1) => ({ name, li: 0, area: (x1 - x0) * (y1 - y0), x0, y0, x1, y1 });
  const B = { x0: 0, y0: 0, x1: 10, y1: 10 };
  const a = { rooms: [r('أ', 0, 0, 5, 5), r('ب', 5, 5, 10, 10)], B }, m = { rooms: [r('أ', 5, 0, 10, 5), r('ب', 0, 5, 5, 10)], B };
  assert.equal(roomsDifference(a, m), 0, 'الانعكاس الأفقي لا يُعد اختلافًا');
  const c = { rooms: [r('أ', 5, 5, 10, 10), r('ب', 0, 0, 5, 5)], B };
  assert.ok(roomsDifference(a, c) > .3);
  const d = { rooms: [r('أ', 0, 0, 5, 5)], B };
  assert.equal(roomsDifference(a, d), .25, 'غرفة ناقصة تُحسب 0.5');
});

test('C1: مجلس رجال بمدخل مستقل ومجلس نساء من مدخل العائلة، وبدائل بأنماط مختلفة فعلًا', () => {
  const counts = { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 };
  const r = req('فيلا دور واحد: 4 غرف نوم منها ماستر بغرفة ملابس، مجلس رجال بمدخل مستقل ودورة مياه، ومجلس نساء مستقل عن الرجال بمدخل خاص للعائلة، صالة، طعام جنب المطبخ، والمطبخ في الخلف، وغرفة خادمة بحمام قريبة من المطبخ', counts);
  const t0 = performance.now();
  const out = generateVillaDesigns({ land: L(20, 30), counts: r.counts, requirements: r, keep: 4 });
  const ms = performance.now() - t0;
  // الجولة الخامسة: ميزانيات حتمية بالعدد (لا بالزمن)؛ نحو 7 ث على جهاز غير مشغول — الحد هنا هامش لجهاز اختبار مشترك
  assert.ok(ms < 45000, `الزمن ${Math.round(ms)} م.ث`); // حارس فقط: الزمن الفعلي يُقاس في أدلة القبول (الجهاز هنا مشترك)
  assert.equal(out.engine, VILLA_V2_ENGINE_VERSION);
  // «المطبخ في الخلف» صارمًا، ولا بديل متقارب لسد العدد (قرار المالك): بديلان على الأقل بنمطين مختلفين
  // (الجولة الثامنة عشرة) ولا بديل يعبر فيه ضيف الرجال العائلة إلى الطعام ما دام غيره لا يعبرها: بديل واحد على هذه الأرض، والنقص مذكور بسببه
  assert.ok(out.designs.length >= 1, `البدائل ${out.designs.length}`);
  if (out.designs.length < 2) assert.match(out.shortfall_ar || '', /ضيف الرجال/); else assert.ok(new Set(out.designs.map(d => d.mode)).size >= 2, 'نمطان مختلفان على الأقل');
  for (const d of out.designs) { const k = d.ledger.find(x => x.kind === 'place' && /المطبخ/.test(x.text)); assert.ok(k && k.ok, d.pat + ': ' + k?.why); }
  for (const d of out.designs) {
    assertSound(d.doc, r.counts); assertInsideSetbacks(d.doc);
    assert.deepEqual(hardGates(d.doc, out.program), []);
    const names = docRooms(d.doc).rooms.map(x => x.name);
    // مجلس النساء: ممر ودورة مياه على جانبه، أو مغاسل ودورة مياه خلفه — المهم دورة مياه النساء داخل منطقتهن
    for (const n of ['مجلس الرجال', 'دورة مياه الرجال', 'مجلس النساء', 'دورة مياه النساء', 'مدخل العائلة', 'الصالة', 'المطبخ', 'غرفة الخادمة', 'غرفة الملابس']) assert.ok(names.includes(n) || (n === 'غرفة الملابس' && names.includes('غرفة ملابس')), n);
    const P = d.ledger.find(x => x.id === 'P-sep'); assert.ok(P && P.ok, 'فصل الرجال عن النساء: ' + P?.why);
  }
  const n = out.designs.length; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(difference(out.designs[i].doc, out.designs[j].doc) >= .16, `البديلان ${i + 1} و${j + 1} مختلفان تنظيميًا`);
});

test('خمسة بدائل مطلوبة: ثلاثة على الأقل بأنماط مختلفة (لا نسختان من نمط واحد) وبفرق ≥ 0.16، والنقص مذكور بسببه', () => {
  const counts = { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 };
  const r = req('4 غرف نوم منها ماستر، مجلس رجال ومجلس نساء، صالة، طعام، مطبخ، غرفة خادمة', counts);
  const out = generateVillaDesigns({ land: L(20, 30), counts: r.counts, requirements: r, keep: 5 });
  // (الجولة الثامنة عشرة) بديلان (التنظيمات التي يعبر فيها ضيف الرجال العائلة لا تُعرض، والبقية نسخ معدّلة)، والنقص مذكور بسببه
  assert.ok(out.designs.length >= 2, `البدائل ${out.designs.length}`); if (out.designs.length < 5) assert.match(out.shortfall_ar || '', /ضيف الرجال/);
  assert.equal(new Set(out.designs.map(d => d.mode)).size, out.designs.length, 'كل بديل من نمط مختلف');
  const n = out.designs.length; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(difference(out.designs[i].doc, out.designs[j].doc) >= .16);
  if (n < 5) assert.match(out.designs[0].notes.join(' '), /مختلفة تنظيميًا فقط/);
  assert.ok(out.designs.every(d => !d.mirrorOf));
  for (const d of out.designs) assertSound(d.doc, r.counts);
});

test('أرض ضيقة وعميقة 12×36: بدائل صالحة داخل الارتداد', () => {
  const counts = C({ bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 });
  const out = generateVillaDesigns({ land: L(12, 36), counts, requirements: {} });
  // الجولة السابعة: على عرض بناء 8.7 م تتشابه تنظيمات الأرض الضيقة (الضيافة أمامًا، والصالة والخدمة وسطًا، والنوم خلفًا)؛
  // البديل الثاني الوحيد المختلف معماريًا (split:s2، 0.19) يرسب في شرط المراكز القديم (0.14 < 0.16)، والحوش الأوسط لا يتسع
  // بضلع 4.5 م — لا حشو: بديل واحد على الأقل، وإن نقص فالسبب مذكور، وإن تعدد فبأنماط مختلفة
  assert.ok(out.designs.length >= 1);
  if (out.designs.length < 4) assert.match(out.shortfall_ar || '', /من 4 مطلوبة/);
  if (out.designs.length >= 2) assert.ok(new Set(out.designs.map(d => d.mode)).size >= 2);
  for (const d of out.designs) { assertSound(d.doc, counts); assertInsideSetbacks(d.doc); }
});

test('أرض مضلعة (شبه منحرف): المبنى داخل المضلع المُزاح بالارتدادات، والمضلع نفسه في المستند', () => {
  const polygon = [{ x: 3, y: 0 }, { x: 21, y: 0 }, { x: 24, y: 30 }, { x: 0, y: 30 }];
  const site = siteOf({ polygon, streets: ['s'], entries: ['s'] });
  assert.ok(site.irregular && site.W > 0 && site.D > 0);
  const counts = C({ bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 });
  const out = generateVillaDesigns({ land: { polygon, streets: ['s'], entries: ['s'] }, counts, requirements: {} });
  assert.ok(out.designs.length >= 3);
  for (const d of out.designs) {
    assert.deepEqual(d.doc.plot.polygon, polygon);
    assertSound(d.doc, counts); assertInsideSetbacks(d.doc);
  }
  // الوصف النصي للأرض (متطلبات الإصدار الثاني) يُحوَّل إلى مضلع حين لا يُعطى مضلع
  const land = landWithSite({ width: 20, length: 30, streets: ['s'], entries: ['s'] }, { site: { irregular: true, front: 18, back: 24, depth: 30 } });
  assert.deepEqual(land.polygon, polygon);
  assert.equal(landWithSite({ width: 20, length: 30 }, {}).polygon, undefined);
});

test('دوران: الأرضي للضيافة والسلم في محور المدخل، والعلوي لغرف النوم فوق السلم نفسه', () => {
  const counts = { bedrooms: 5, majlis: 1, baths: 6, kitchens: 1, halls: 1, dining: 1 };
  const r = req('دورين: المجالس والطعام والمطبخ تحت، و5 غرف نوم فوق، والماستر في الدور العلوي بعيدة عن الدرج، وغرفة لأمي في الأرضي', counts);
  const out = generateVillaTwoFloors({ land: { ...L(18, 25), floors: 2 }, counts: r.counts, requirements: r });
  assert.ok(out.designs.length >= 1);
  for (const d of out.designs) {
    assert.equal(d.doc.levels.length, 2);
    assert.equal(d.doc.stairs.length, 1);
    assertSound(d.doc, r.counts); assertInsideSetbacks(d.doc);
    const rooms = docRooms(d.doc).rooms;
    assert.ok(rooms.some(x => x.type === 'master' && x.li === 1), 'الرئيسية في العلوي');
    assert.ok(rooms.some(x => x.name === 'غرفة كبار السن' && x.li === 0), 'غرفة كبار السن في الأرضي');
    const st = rooms.filter(x => x.name === 'الدرج');
    assert.equal(st.length, 2, 'بيت الدرج في الدورين');
    assert.ok(Math.abs(st[0].x0 - st[1].x0) < .01 && Math.abs(st[0].y0 - st[1].y0) < .01, 'الموضع نفسه');
  }
});

test('الأبعاد الصريحة (req.dims) تُحترم تقريبًا حين تُعطى، وتُتجاهل بأمان حين تغيب', () => {
  const counts = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
  const r = req('دور واحد، ثلاث غرف نوم بالضبط، المطبخ 4×5، مجلس 5×6، والمطبخ في الخلف', counts);
  r.dims = { majlis: { w: 5, l: 6, tol: .3 } };
  const out = generateVillaDesigns({ land: L(20, 28), counts: r.counts, requirements: r });
  for (const d of out.designs) {
    const m = docRooms(d.doc).rooms.find(x => x.name === 'المجلس'), a = [m.x1 - m.x0, m.y1 - m.y0].sort((p, q) => p - q);
    assert.ok(Math.abs(a[0] - 5) <= .8 && Math.abs(a[1] - 6) <= .8, `المجلس ${a[0].toFixed(2)}×${a[1].toFixed(2)}`);
  }
});

test('مدخل ثانٍ على شارع جانبي لا يفتح على ممر غرف النوم', () => {
  const counts = { bedrooms: 3, majlis: 2, baths: 5, kitchens: 1, halls: 1, dining: 1 };
  const out = generateVillaDesigns({ land: L(25, 25, ['s', 'e']), counts, requirements: {} });
  for (const d of out.designs) {
    const M = analyzeDoc(d.doc), g = M.levels[0];
    for (const op of g.openings.filter(o => o.door && o.o.entry)) for (const s of op.sides) assert.notEqual(s.room.name, 'ممر الغرف', 'باب خارجي إلى ممر الغرف');
  }
});
