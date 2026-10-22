// الجولة العاشرة: هندسة السلم (القوائم والنوائم من ارتفاع الدور، والنوع الذي يتسع في غرفته، والوصول أسفله وأعلاه، والفتحة
// العلوية) بوابةً في المراجع المستقل ومصدرًا واحدًا للمولّد والرسم والمجسّم؛ وخصوصية المجلس (لا يفتح على الطعام العائلي أو
// الصالة أو المطبخ إلا بطلب العميل)؛ وحدود الفراغات الافتراضية (المجلس، الطعام، حمام الرئيسية، الرئيسية العلوية) بطبقاتها.
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns, generateVillaTwoFloors, qualityGates } from '../dist/villa-layout-v2.mjs';
import { reviewDesign, majlisDiningAsked, GATE_TIER, TIER_AR } from '../dist/plan-review.mjs';
import { STAIR_RULES, fitTypes, risersFor, riseOf, checkStair, measureStair, stairClientRules } from '../dist/stair-geometry.mjs';
import { stairLayout } from '../dist/draw/stairs3d.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };
const gen = id => { const { C, r, land } = caseReq(id); return (land.floors >= 2 ? generateVillaTwoFloors : generateVillaDesigns)({ land, counts: r.counts, requirements: r, keep: C.want || 4 }); };
const ev = (stage, id, n) => parseDoc(readFileSync(new URL(`../evidence/acceptance/${stage}/${id}/alt-${n}.json`, import.meta.url), 'utf8'));
const request = id => { const C = CASES.find(c => c.id === id); return { text: C.text, counts: C.counts, land: { floors: 1, ...C.land } }; };

test('قواعد السلم: قائمة ≤ 18 سم ونائمة ≥ 28 سم وعرض ≥ 1.0 م «قيمة تصميمية افتراضية للميزان»، والعدد من ارتفاع الدور', () => {
  for (const k of ['riserMax', 'treadMin', 'widthMin', 'landingMin', 'passMin', 'floorDefault']) { assert.equal(STAIR_RULES[k].tier, 'mizan-default', k); assert.equal(STAIR_RULES[k].verified, false, k); }
  assert.equal(risersFor(3.2), 18); assert.equal(risersFor(3.3), 19); assert.equal(risersFor(3.6), 20);
  assert.deepEqual(riseOf([{ elevation: 0, height: 3.2 }, { elevation: 3.4, height: 3.2 }], 0).rise, 3.4);
  const d = riseOf([{ elevation: 0 }], 0); assert.equal(d.rise, 3.3); assert.match(d.source, /افتراضي/);
  // غرفة 3.32 × 3.58 (C7-3 بعد-9): لا يتسع فيها سلم مستقيم (يحتاج 17 × 0.28 = 4.76 م لدور 3.2 م) ويتسع U
  const t = fitTypes(3.32, 3.58, 3.2).map(x => x.kind);
  assert.ok(!t.includes('straight') && t.includes('U'), t.join());
  assert.ok(fitTypes(1.2, 5.2, 3.2).some(x => x.kind === 'straight'));
  assert.deepEqual(fitTypes(1.8, 2.5, 3.3), []);
  // طلب العميل يغلب الافتراضي
  const c = stairClientRules('ابي درج عرضه 90 سم'); assert.equal(c.widthMin.value, 0.9); assert.equal(c.widthMin.tier, 'client');
});

test('بعد-9: سلالم C7 الثلاثة ترسب في STAIR_GEOMETRY (نائمة 27 سم، وبدء على جدار، ووصول على الفراغ المزدوج، وقطع مسار العائلة)', () => {
  const why = [1, 2, 3].map(n => { const d = ev('after-9', 'C7', n); return checkStair(analyzeDoc(d), d.stairs[0], 0); });
  for (const r of why) { assert.equal(r.ok, false); assert.ok(r.problems.some(p => /النائمة/.test(p)), r.problems.join(' | ')); }
  assert.ok(why[0].problems.some(p => /أول قائمة تواجه جدار/.test(p)));
  assert.ok(why[2].problems.some(p => /فراغ مزدوج/.test(p)));
  // السلم يقطع مسار العائلة في غرفته (C7-2 وC7-3): كل أبواب غرفة السلم متصلة بممر حر ≥ 0.9 م
  assert.ok(why[1].problems.some(p => /يقطع الطريق/.test(p)) && why[2].problems.some(p => /يقطع الطريق/.test(p)));
  const g = reviewDesign(ev('after-9', 'C7', 3), request('C7'), { external: false }).gates.find(x => x.id === 'STAIR_GEOMETRY');
  assert.equal(g.ok, false); assert.equal(g.tier, 'mizan-default');
});

test('المولّد: سلم كل بديل بدورين يجتاز STAIR_GEOMETRY، ونوعه مما يتسع في غرفته، وعدد قوائمه من ارتفاع الدور، والرسم والمجسّم من التخطيط نفسه', () => {
  const out = gen('C7');
  assert.ok(out.designs.length >= 1);
  for (const d of out.designs) {
    const s = d.doc.stairs[0], M = analyzeDoc(d.doc), r = checkStair(M, s, 0);
    assert.ok(r.ok, `${d.pat}: ${r.problems.join(' | ')}`);
    assert.ok(r.value.fits.includes(s.kind), `${s.kind} في ${r.value.fits}`);
    assert.equal(s.steps, risersFor(riseOf(d.doc.levels, 0).rise));
    const lay = stairLayout(s, d.doc.levels[1].elevation - d.doc.levels[0].elevation), m = measureStair(s, 3.2);
    assert.equal(lay.N, s.steps); assert.ok(lay.riser <= .18 + 1e-9 && m.tread >= .28 - 1e-3 && m.width >= 1 - 1e-9);
    if (s.kind !== 'straight') assert.ok(m.landing >= m.width - 1e-6);
  }
});

test('خصوصية المجلس: بعد-9 C7-3 يفتح المجلس على الطعام العائلي فيرسب؛ و«مقلط» أو «المجلس على الطعام» يجعل الطعام مقبولًا', () => {
  const d = ev('after-9', 'C7', 3), g = reviewDesign(d, request('C7'), { external: false }).gates.find(x => x.id === 'MAJLIS_PRIVACY');
  assert.equal(g.ok, false); assert.match(g.reasons_ar[0], /صالة الطعام/);
  const asked = reviewDesign(d, { ...request('C7'), text: request('C7').text + '، والمجلس على الطعام' }, { external: false }).gates.find(x => x.id === 'MAJLIS_PRIVACY');
  assert.equal(asked.ok, true); assert.equal(asked.value.clientAskedDining, true);
  assert.equal(majlisDiningAsked({ text: 'ابي مقلط للضيوف' }), true);
  assert.equal(majlisDiningAsked({ text: 'الطعام بجانب المجلس' }), true);
  assert.equal(majlisDiningAsked({ text: 'طعام جنب المطبخ' }), false);
});

test('المولّد: لا مجلس يفتح على الطعام العائلي أو الصالة أو المطبخ ما لم يطلبه العميل (C4 وC9)', () => {
  for (const id of ['C4', 'C9']) for (const d of gen(id).designs) {
    const g = d.review.gates.find(x => x.id === 'MAJLIS_PRIVACY'); assert.ok(g.ok, `${id} ${d.pat}: ${g.reasons_ar.join(' | ')}`);
  }
});

test('حدود الفراغات الافتراضية على المرسوم (ما لم يطلب العميل غيرها): المجلس عرضًا وسقفًا، والطعام، وحمام الرئيسية، والرئيسية العلوية', () => {
  const has = (doc, re, o) => qualityGates(doc, null, o).some(w => re.test(w));
  assert.ok(has(ev('after-9', 'C3', 3), /«مجلس الرجال» 39\.2\d? م² متضخم/));
  assert.ok(!has(ev('after-9', 'C3', 3), /متضخم \(> 38/, { majlisAsked: true }));
  assert.ok(has(ev('after-9', 'C8', 1), /«المجلس» عرضه الصافي 3\.81 م أقل من 4\.2 م/));
  assert.ok(has(ev('after-9', 'C3', 2), /«حمام الرئيسية» 8\.98 م² متضخم/));
  assert.ok(has(ev('after-9', 'C7', 3), /الدور العلوي 16\.74 م² أصغر من 18/));
  assert.ok(has(ev('after-9', 'C7', 3), /«صالة الطعام» 23\.55 م² متضخم/));
  assert.ok(!has(ev('after-9', 'C7', 3), /أصغر من 18|حمام الرئيسية/, { masterAsked: true }));
});

test('طبقة كل بوابة في مخرج المراجع: شرط العميل / قيمة افتراضية للميزان / منطق وظيفي — ولا شيء «نظامي» بلا مصدر متحقق', () => {
  const r = reviewDesign(ev('after-9', 'C1', 1), request('C1'), { external: false });
  // (الجولة الثانية عشرة) «نظامي» لعدد المواقف وحده، بمصدره المتحقق (اشتراطات إنشاء المباني السكنية 1446هـ)
  for (const g of r.gates) { assert.ok(['client', 'mizan-default', 'functional', 'regulation'].includes(g.tier), g.id); assert.equal(g.tier_ar, TIER_AR[g.tier]); if (g.tier === 'regulation') { assert.ok(['PARKING', 'SETBACK_REG', 'COVERAGE'].includes(g.id), g.id); assert.match(g.source, /اشتراطات إنشاء المباني السكنية/); } } // (الجولة الثالثة عشرة) + الارتدادات ونسبة البناء بمصدرها
  assert.equal(GATE_TIER.PROGRAM, 'client'); assert.equal(GATE_TIER.STAIR_GEOMETRY, 'mizan-default'); assert.equal(GATE_TIER.MAJLIS_PRIVACY, 'mizan-default');
});
