// الجولة الثالثة عشرة: الاشتراطات النظامية المربوطة (ارتداد الجار 1.5 م، الأمامي خُمس عرض الشارع، نسبة البناء 75%) بطبقتها ومصدرها،
// وعرض الشارع في مدخلات الأرض وسؤاله في الحوار، وملاحظة الزجاج 8% النظامية المحتملة (لا بوابة)، وثغرات الجولة الثانية عشرة.
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns, generateVillaTwoFloors, siteOf } from '../dist/villa-layout-v2.mjs';
import { docRooms } from '../dist/rules.mjs';
import { measureSaudiProgram } from '../dist/saudi-program.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { clientGlazing } from '../dist/glazing.mjs';
import { reviewDesign, regulatoryNotes } from '../dist/plan-review.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { normalizeLand } from '../dist/home-flow.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };
const EV = (c, f) => parseDoc(readFileSync(new URL(`../evidence/acceptance/after-12/${c}/${f}`, import.meta.url), 'utf8'));
const req = C => ({ text: C.text, counts: C.counts, land: { floors: 1, ...C.land } });

test('siteOf: عرض الشارع يحدد الارتداد الأمامي النظامي (25 م ← 5 م، 30 م ← 6 م)، والمجهول 3 م افتراضًا؛ ارتداد الجار 1.5 م', () => {
  const base = { width: 20, length: 30, streets: ['s'], entries: ['s'] };
  const u = siteOf(base); assert.equal(u.setbacks.s, 3); assert.equal(u.front.tier, 'mizan-default'); assert.equal(u.plot.streetWidth, null);
  const a = siteOf({ ...base, streetWidth: 25 }); assert.equal(a.setbacks.s, 5); assert.equal(a.front.tier, 'regulation'); assert.equal(a.plot.streetWidth, 25);
  assert.equal(Math.round((u.D - a.D) * 100) / 100, 2, 'عمق البناء ينقص بفرق الارتداد');
  assert.deepEqual([a.setbacks.e, a.setbacks.w, a.setbacks.n], [1.5, 1.5, 1.5]);
  const b = siteOf({ ...base, streetWidth: 30 }); assert.equal(b.setbacks.s, 6);
  // أرض مضلع: الضلع الأمامي بالارتداد نفسه
  const p = siteOf({ ...base, streetWidth: 25, polygon: [{ x: 3, y: 0 }, { x: 21, y: 0 }, { x: 24, y: 30 }, { x: 0, y: 30 }] }); assert.equal(p.setbacks.s, 5); assert.equal(p.setbacks.e, 1.5);
  // مدخلات الأرض: يمر عرض الشارع ويُرفض غير المعقول
  assert.equal(normalizeLand({ ...base, floors: 1, streetWidth: 20 }).land.streetWidth, 20);
  assert.equal(normalizeLand({ ...base, floors: 1 }).land.streetWidth, undefined);
  assert.throws(() => normalizeLand({ ...base, floors: 1, streetWidth: 2 }), /عرض الشارع/);
});

test('المراجع: بوابتا SETBACK_REG وCOVERAGE بطبقة «اشتراط نظامي متحقق» بمصدرهما على بدائل after-12، ومرجع الزجاج 8% لا يُرسب', () => {
  const C1 = CASES.find(c => c.id === 'C1'), d = EV('C1', 'alt-1.json');
  const rv = reviewDesign(d, req(C1), { external: false, heavy: false });
  const sb = rv.gates.find(g => g.id === 'SETBACK_REG'), cv = rv.gates.find(g => g.id === 'COVERAGE');
  assert.ok(sb.ok && cv.ok); assert.equal(sb.tier, 'regulation'); assert.equal(cv.tier, 'regulation'); assert.equal(sb.tier_ar, 'اشتراط نظامي متحقق');
  assert.match(sb.source, /4500943139/); assert.match(cv.source, /4500943139/);
  assert.equal(sb.value.sides.e.required, 1.5); assert.equal(sb.value.sides.e.tier, 'regulation'); assert.ok(sb.value.sides.e.clear >= 1.5);
  assert.equal(sb.value.sides.s.tier, 'mizan-default', 'عرض الشارع مجهول: الأمامي افتراضي'); assert.ok(sb.notes_ar.some(n => /عرض الشارع غير معلوم/.test(n)));
  assert.ok(cv.value.ratioPct > 0 && cv.value.ratioPct <= 75);
  // الزجاج 8%: C1 alt-1 صالتها 4% — ملاحظة نظامية محتملة في مخرجات المراجعة، والبديل ناجح وبوابة WINDOW_SIZE ناجحة
  assert.ok(rv.passed); assert.ok(rv.gates.find(g => g.id === 'WINDOW_SIZE').ok);
  assert.equal(rv.regulatoryNotes_ar.length, 1); assert.equal(rv.regulatoryNotes_ar[0].id, 'GLAZING_REF');
  assert.match(rv.regulatoryNotes_ar[0].text_ar, /مرجع نظامي/); assert.match(rv.regulatoryNotes_ar[0].text_ar, /الصالة/); assert.match(rv.regulatoryNotes_ar[0].text_ar, /ليس بوابة/);
  assert.equal(regulatoryNotes(rv.gates)[0].rooms[0].ratioPct, 4);
  // بديل زجاجه كله ≥ 8%: لا ملاحظة
  const C9 = CASES.find(c => c.id === 'C9'), rv2 = reviewDesign(EV('C9', 'alt-2.json'), req(C9), { external: false, heavy: false });
  assert.deepEqual(rv2.regulatoryNotes_ar, []);
  // مستند مُزاح نحو الجار (أقل من 1.5 م): ترسب بوابة الارتداد النظامية بسبب يذكر الجار
  const m = parseDoc(JSON.stringify(d)); for (const w of m.walls) { w.a.x -= .4; w.b.x -= .4; }
  const bad = reviewDesign(m, req(C1), { external: false, heavy: false }).gates.find(g => g.id === 'SETBACK_REG');
  assert.equal(bad.ok, false); assert.match(bad.reasons_ar[0], /ارتداد الجار/);
  // مستند عرض شارعه معلوم 25 م وارتداده المرسوم 3 م: ترسب (المطلوب 5 م)
  const s25 = parseDoc(JSON.stringify(d)); s25.plot.streetWidth = 25;
  const bad2 = reviewDesign(s25, req(C1), { external: false, heavy: false }).gates.find(g => g.id === 'SETBACK_REG');
  assert.equal(bad2.ok, false); assert.match(bad2.reasons_ar[0], /شارع 25 م/); assert.equal(bad2.value.frontRequired, 5);
});

test('التوليد بعرض شارع 25 م: المبنى خلف ارتداد 5 م، والمستند يحمل عرض الشارع، وبوابة الارتداد النظامية ناجحة بطبقتها', { timeout: 600000 }, () => {
  const { C, r, land } = caseReq('C9');
  const out = generateVillaDesigns({ land: { ...land, streetWidth: 25 }, counts: r.counts, requirements: r, keep: 2 });
  assert.ok(out.designs.length >= 1);
  const d = out.designs[0].doc; assert.equal(d.plot.setbacks.s, 5); assert.equal(d.plot.streetWidth, 25);
  const ys = d.walls.filter(w => w.level === d.levels[0].id).flatMap(w => [w.a.y, w.b.y]);
  assert.ok(Math.min(...ys) >= 5 - .2, `أقرب جدار إلى الشارع ${Math.min(...ys)} م`);
  const g = reviewDesign(d, { text: C.text, counts: r.counts, land: { ...land, streetWidth: 25 } }, { external: false, heavy: false }).gates.find(x => x.id === 'SETBACK_REG');
  assert.ok(g.ok, g.reasons_ar.join(' ')); assert.equal(g.value.sides.s.tier, 'regulation'); assert.equal(g.value.sides.s.required, 5);
  assert.ok(out.designs[0].review.gates.find(x => x.id === 'SETBACK_REG')?.ok);
});

test('الحوار: عرض الشارع مجهول ← سؤال ناعم (لا تعارض)؛ الجواب «الشارع 15 م» يسجَّل بلا تغيير، و«الشارع 25 م» يعيد التوليد بارتداد 5 م', { timeout: 900000 }, async () => {
  const { r, land } = caseReq('C9');
  const first = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 1 });
  const s0 = createSession({ land, counts: r.counts, requirements: r, result: { doc: first.designs[0].doc, pat: first.designs[0].pat, villaEngine: 'v2' }, engine: 'v2' });
  assert.deepEqual(s0.conflicts, []); assert.equal(s0.siteQuestions.length, 1); assert.match(s0.siteQuestions[0].question_ar, /عرض الشارع/);
  const a = await redesign(s0, { text: 'عرض الشارع 15 م' });
  assert.equal(a.reply.mode, 'answered'); assert.equal(a.session.input.land.streetWidth, 15); assert.equal(a.session.siteQuestions.length, 0); assert.equal(a.session.designs.length, 1);
  assert.match(a.reply.summary_ar, /يطابق النظامي/);
  const b = await redesign(s0, { text: 'الشارع 25 متر' });
  assert.equal(b.reply.mode, 'answered-regenerated'); assert.equal(b.session.designs.length, 2);
  const d = JSON.parse(b.session.designs[1].doc); assert.equal(d.plot.setbacks.s, 5); assert.equal(d.plot.streetWidth, 25);
  assert.match(b.reply.summary_ar, /5 م بدل 3 م/);
  // ما ليس جوابًا عن الشارع لا يُقرأ عرضًا
  const c = await redesign(s0, { text: 'المطبخ ٤×٥' }).catch(e => ({ reply: { mode: 'error:' + e.code } }));
  assert.notEqual(c.reply.mode, 'answered-regenerated'); assert.ok(!/عرض الشارع/.test(c.reply.summary_ar || ''));
});

test('الزجاج (قرار المالك): نسبة الزجاج اختيار العميل — تُقرأ من كلامه عامةً أو لغرفة، ولا نطاق افتراضي؛ المراجع يعرض المحقق وبجانبه المطلوب معلومةً؛ بوابة 3% باقية؛ 8% الوزارة مرجع بمستواه', () => {
  const r = extractRequirements('المجلس زجاج 20٪ ونوافذ كبيرة للصالة وغرف النوم نوافذ صغيرة', {});
  assert.deepEqual(r.prefs.glazing, { rooms: { majlis: 20, living: 15, bedroom: 5 } }); assert.deepEqual(r.unclear, []);
  assert.ok(r.understood.some(u => /زجاج المجلس 20٪/.test(u)) && r.understood.some(u => /كبيرة \(قُرئت 15٪\)/.test(u)));
  assert.deepEqual(extractRequirements('الزجاج 12% في كل البيت', {}).prefs.glazing, { rooms: {}, all: 12 });
  assert.equal(extractRequirements('المطبخ في الخلف', {}).prefs.glazing, undefined, 'لا طلب = لا قيمة');
  assert.equal(clientGlazing({ type: 'majlis', name: 'مجلس النساء' }, { rooms: { majlis: 20, women: 10 } }), 10);
  assert.equal(clientGlazing({ type: 'master' }, { rooms: { bedroom: 8 } }), 8); assert.equal(clientGlazing({ type: 'kitchen' }, { rooms: { majlis: 20 } }), null); assert.equal(clientGlazing({ type: 'kitchen' }, { rooms: {}, all: 12 }), 12);
  // المراجع: C1 alt-1 (after-12) صالتها 3.9%: البوابة ناجحة (≥ 3%)، النسبة معلومة بلا طلب (requested null)، والمرجع النظامي 8% مذكور بمستواه لا كبوابة
  const C1 = CASES.find(c => c.id === 'C1'), rv = reviewDesign(EV('C1', 'alt-1.json'), req(C1), { external: false, heavy: false }), g = rv.gates.find(x => x.id === 'WINDOW_SIZE');
  assert.ok(g.ok && rv.passed); assert.equal(g.tier, 'mizan-default'); assert.equal(g.value.requestedRooms, 0); assert.deepEqual(g.notes_ar, []);
  const hall = g.value.ratios.find(x => /الصالة/.test(x.name)); assert.equal(hall.requested, null); assert.equal(hall.pct, 3.92); assert.equal(hall.facing, 'street');
  assert.equal(rv.regulatoryNotes_ar[0].id, 'GLAZING_REF'); assert.match(rv.regulatoryNotes_ar[0].text_ar, /ليس بوابة/); assert.match(rv.regulatoryNotes_ar[0].text_ar, /المستوى ب/); assert.match(rv.regulatoryNotes_ar[0].text_ar, /اختيار العميل/);
  // بطلب العميل: المطلوب بجانب المحقق، وملاحظة (لا رسوب) إن لم يتحقق
  const rv2 = reviewDesign(EV('C1', 'alt-1.json'), { ...req(C1), text: C1.text + '، الصالة زجاج 12٪' }, { external: false, heavy: false }), g2 = rv2.gates.find(x => x.id === 'WINDOW_SIZE');
  assert.ok(g2.ok); assert.equal(g2.value.ratios.find(x => /الصالة/.test(x.name)).requested, 12); assert.equal(g2.value.belowRequest, 1); assert.match(g2.notes_ar[0], /طلب العميل 12٪/);
  assert.match(g2.source, /المستوى ب/);
});

test('المولّد يبلغ نسبة الزجاج التي طلبها العميل حيث يتسع الجدار (C9: «المجلس زجاج 20٪»)، وبلا طلب لا يتغيّر شيء؛ والمطبخ المفرط يُقتطع منه غسيل (C7 ≤ 24 م²)، ودورة مياه الصالة في C4', { timeout: 900000 }, () => {
  const { C, r, land } = caseReq('C9'), text = C.text + '، والمجلس زجاج 20٪';
  const rq = extractRequirements(text, { counts: C.counts }); rq.counts = { ...rq.counts, ...C.counts }; assert.deepEqual(rq.prefs.glazing, { rooms: { majlis: 20 } });
  const out = generateVillaDesigns({ land, counts: rq.counts, requirements: rq, keep: 4 }), plain = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
  assert.ok(out.designs.length >= 3);
  for (const d of out.designs) { const g = reviewDesign(d.doc, { text, counts: C.counts, land }, { external: false, heavy: false }).gates.find(x => x.id === 'WINDOW_SIZE'); const m = g.value.ratios.find(x => /المجلس/.test(x.name)); assert.ok(g.ok && d.review.passed); assert.equal(m.requested, 20); assert.ok(m.pct >= 19.5, `${d.pat}: ${m.pct}٪`); }
  // بلا طلب: النوافذ الافتراضية كما كانت (المجلس في after-12 C9 alt-1 نفسه ≈ النسبة نفسها)، ولا ملاحظة
  for (const d of plain.designs) { const g = reviewDesign(d.doc, { text: C.text, counts: C.counts, land }, { external: false, heavy: false }).gates.find(x => x.id === 'WINDOW_SIZE'); assert.equal(g.value.requestedRooms, 0); assert.deepEqual(g.notes_ar, []); }
  // C7: المطبخ كان 31 م² (after-12) — الآن ≤ 24 م² صافيًا وبجانبه غرفة غسيل ومخزن تُفتح منه (قيمة افتراضية معلنة في الملاحظات)
  const c7 = caseReq('C7'), two = generateVillaTwoFloors({ land: c7.land, counts: c7.r.counts, requirements: c7.r, keep: 4 });
  const d7 = two.designs[0], rs = docRooms(d7.doc).rooms, kit = rs.find(x => x.type === 'kitchen' && x.li === 0), ut = rs.find(x => x.name === 'غرفة الغسيل والمخزن');
  assert.ok(kit.area <= 24, `المطبخ ${kit.area}`); assert.ok(ut && ut.area >= 6, 'غرفة الغسيل'); assert.ok(d7.notes.some(n => /اقتُطع من طرفه غرفة غسيل/.test(n))); assert.ok(d7.review.passed);
  // C4 (أرض 12 م): دورة مياه يومية من طرف الصالة بممر إلى الممر الخلفي؛ المطبخ يبقى < 14 م² (الأرض لا تتسع: مذكور في المراجعة ملاحظةً)
  const c4 = caseReq('C4'), o4 = generateVillaDesigns({ land: c4.land, counts: c4.r.counts, requirements: c4.r, keep: 4 }), d4 = o4.designs[0];
  const m4 = measureSaudiProgram(d4.doc, { text: c4.C.text, counts: c4.C.counts }, analyzeDoc(d4.doc));
  assert.equal(m4.find(g => g.id === 'DAY_WC').pass, true); assert.ok(d4.notes.some(n => /طرف الصالة/.test(n))); assert.ok(d4.review.passed);
  assert.equal(m4.find(g => g.id === 'KITCHEN_SERVICE').pass, false);
});
