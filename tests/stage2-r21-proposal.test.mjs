// الجولة 21 — المقترح (فرع dev/stage2-r21-proposal، غير معتمد): اختبارات العقود المكيّفة من حزمة المالك kit-r21/tests/r21.test.mjs
// على دوال المستودع الفعلية، مقسمة بالموضوعات نفسها في docs/research/r21-proposal/. المراجع وكيل ذكاء اصطناعي — ليس معماريًا مرخّصًا.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements } from '../dist/requirements.mjs';
import { RELATIONS, buildSharedBrief, briefOf, briefMajlisDoor, parseRequestedCount, sharedReviewRequest } from '../dist/shared-brief.mjs';
import { majlisDiningAsked } from '../dist/plan-review.mjs';
import { programV2 } from '../dist/villa-layout-v2.mjs';

const req = (text, counts = {}) => { const r = extractRequirements(text, { counts }); r.counts = { ...r.counts, ...counts }; return r; };

// ------------------------------------------------------------------------------------------------ 01 عقد الطلب الموحد (H6)
test('01 عدد التصاميم المطلوب بالأرقام والكلمات (kit: Arabic requested count)', () => {
  assert.equal(parseRequestedCount('أبي ثلاثة تصاميم مختلفة'), 3);
  assert.equal(parseRequestedCount('ابغى ٥ بدائل'), 5);
  assert.equal(parseRequestedCount('خمسة مخططات'), 5);
  assert.equal(parseRequestedCount('3 غرف نوم ومجلس'), null);
  assert.equal(req('أبي ثلاثة تصاميم: دور واحد، 4 غرف نوم').want, 3);
});
test('01 العقد نفسه للمولّد والمراجع: النص والعلاقات بمصدرها واقتباسها (kit: shared brief is identical)', () => {
  const r = req('فيلا: 4 غرف نوم، مجلس رجال، طعام قريب من المجلس، مطبخ في الخلف', { bedrooms: 4, majlis: 1 });
  assert.equal(r.text.length > 10, true); assert.ok(r.brief?.version);
  const P = programV2(r.counts, r), rv = sharedReviewRequest(r, {}, r.counts);
  assert.equal(P.brief, r.brief); assert.equal(rv.brief, r.brief); assert.equal(rv.text, r.text);
  const near = r.brief.relations.find(x => x.kind === RELATIONS.NEAR);
  assert.ok(near && near.quote && near.source === 'client', JSON.stringify(r.brief.relations));
});
test('01 «قريب من المجلس» (NEAR) لا يفرض بابًا مباشرًا؛ «مقلط» و«المجلس يفتح على الطعام» يفرضانه — في المولّد والمراجع معًا', () => {
  const near = req('طعام قريب من المجلس'), door = req('المجلس يفتح على الطعام'), guest = req('مجلس رجال بمقلط');
  assert.equal(briefMajlisDoor(near.brief), false); assert.equal(briefMajlisDoor(door.brief), true); assert.equal(briefMajlisDoor(guest.brief), true);
  for (const [r, want] of [[near, false], [door, true], [guest, true]]) {
    assert.equal(majlisDiningAsked(sharedReviewRequest(r, {}, {})), want, r.text);
    assert.equal(programV2({ bedrooms: 3, majlis: 1, kitchens: 1, halls: 1, dining: 1 }, r).majlisDining, want, r.text);
  }
  assert.ok(near.brief.relations.every(x => x.kind !== RELATIONS.DIRECT_DOOR));
});
test('01 الطلب بلا عقد (مستدعٍ قديم) يُبنى عقده من نصه وبنوده بالدالة نفسها', () => {
  const b = briefOf({ text: 'ابي مقلط للضيوف' }); assert.equal(briefMajlisDoor(b), true);
  assert.deepEqual(buildSharedBrief('', {}).relations, []);
});

// ------------------------------------------------------------------------------------------------ 02 المقاسات الصريحة قيد بناء (H10)
import { verifyRequest } from '../dist/rules.mjs';
import * as V3 from '../dist/villa-layout-v3.mjs';
test('02 المقاس الصريح صافيه وسماحيته كما قالهما العميل (لا 0.2 م جدارًا ثابتًا ولا سماحية مصفّرة)', () => {
  const r = req('مجلس 5×6، مطبخ 4×4', { bedrooms: 3, majlis: 1 }), P = programV2({ bedrooms: 3, majlis: 1, kitchens: 1, halls: 1, dining: 1 }, r);
  const k = P.blocks.find(b => b.id === 'kitchen1'); assert.deepEqual([k.dimNet.s, k.dimNet.l, k.dimNet.tol], [4, 4, .05]);
});
test('02 مطبخ 4×4 ومجلس 5×6 على أرض تتسع: يُرسمان بمقاسيهما طولًا وعرضًا (يُعاد القياس من المرسوم بعد التفصيل)', { timeout: 900000 }, () => {
  const counts = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, r = req('دور واحد، 3 غرف نوم، مجلس 5×6، المطبخ 4×4', counts);
  const o = V3.generateVillaDesigns({ land: { width: 22, length: 30, streets: ['s'], entries: ['s'], floors: 1 }, counts: r.counts, requirements: r, keep: 2 });
  const d = o.designs.find(x => x.presentation?.status !== 'hidden'); assert.ok(d, 'بديل غير محجوب');
  const L = verifyRequest(d.doc, r, { entry: 's' }).filter(x => x.kind === 'dims'); assert.equal(L.length, 2);
  for (const x of L) { assert.equal(x.ok, true, x.text + ' ' + JSON.stringify(x.actual)); assert.ok(Math.abs(x.actual.s - x.want.s) <= .05 && Math.abs(x.actual.l - x.want.l) <= .05); }
});

// ------------------------------------------------------------------------------------------------ 03 عقد النتائج والشهادات ورسائل العميل
import { readFileSync, existsSync } from 'node:fs';
import { analyzeFeasibility } from '../dist/feasibility.mjs';
import { verifyCertificate, areaCertificate, logicalCertificate } from '../dist/certificates.mjs';
import { explainFailure, reportContradictions, textContradictions } from '../dist/infeasibility-report.mjs';
import { clientLint, lintClientText, toClientAr } from '../dist/client-language.mjs';
import { shortfallNotice } from '../dist/client-text.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';
import { HELDOUT } from '../scripts/heldout-cases.mjs';
import { HELDOUT2 } from '../scripts/heldout2-cases.mjs';
const root = new URL('../', import.meta.url).pathname;
test('03 انتهاء المهلة «بحث غير مكتمل» قابل للإعادة، لا استحالة (kit: time limit is not infeasibility)', { timeout: 600000 }, () => {
  const counts = { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 };
  const r = V3.generate({ land: { width: 22, length: 30, streets: ['s'], entries: ['s'], floors: 1 }, counts, requirements: req('4 غرف نوم ومجلس رجال ومجلس نساء', counts), keep: 3, timeLimitMs: 1, _cf: true });
  assert.notEqual(r.status, 'PROVEN_INFEASIBLE');
  if (r.status !== 'SOLVED') { assert.equal(r.reason, 'TIME_LIMIT'); assert.equal(r.retryable, true); assert.deepEqual(reportContradictions(r.report), []); }
});
test('03 الشهادة غير المتحقق منها مرفوضة؛ والتعارض المنطقي بين بندين إلزاميين يُقبل بشهادته (kit: unverified infeasibility is refused)', () => {
  const land = { width: 22, length: 30, streets: ['s'], entries: ['s'], floors: 1 }, counts = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
  const r = req('3 غرف ومجلس، المطبخ في الأمام، والمطبخ في الخلف', counts), f = analyzeFeasibility({ land, counts, requirements: r });
  assert.equal(f.feasible, false); const h = f.hard.find(x => x.id === 'CONFLICT'); assert.ok(h.certificate);
  assert.equal(verifyCertificate(h.certificate, { land, counts, requirements: r }).valid, true);
  assert.equal(verifyCertificate({ ...h.certificate, b: 'R99' }, { land, counts, requirements: r }).valid, false, 'بند غير موجود');
  assert.equal(verifyCertificate(logicalCertificate('place-opposite', 'R1', 'R1'), { land, counts, requirements: r }).valid, false);
  assert.equal(verifyCertificate({ type: 'AREA_LOWER_BOUND', floors: 1, lowerBound: 999, available: 10, table: {} }, { land, counts, requirements: r }).valid, false, 'جدول مختلف');
  assert.equal(V3.classifyFailure(Object.assign(Error('x'), { code: 'VILLA_INFEASIBLE' }), f, { land, counts, requirements: r }).status, 'PROVEN_INFEASIBLE');
  const forged = { ...f, hard: [{ id: 'AREA', proof: 'area-lower-bound', certificate: { type: 'AREA_LOWER_BOUND', floors: 1, lowerBound: 999, available: 1, table: {} } }] };
  assert.equal(V3.classifyFailure(Object.assign(Error('x'), { code: 'VILLA_INFEASIBLE' }), forged, { land, counts, requirements: r }).status, 'SEARCH_INCOMPLETE', 'شهادة مزوّرة لا تُثبت');
});
test('03 مدقق الشهادات لا يصنّف أي حالة معروف لها حل مستحيلةً (C1–C10، H1–H10، وحالات بذرة التطوير التي أنتج لها الأساس مخططًا)', () => {
  const known = [...CASES, ...HELDOUT, ...HELDOUT2].map(c => ({ land: { floors: 1, ...c.land }, text: c.text, counts: c.counts }));
  const f = `${root}evidence/coverage-r21/baseline-3b212e7-dev.json`;
  if (existsSync(f)) for (const r of JSON.parse(readFileSync(f, 'utf8')).rows.filter(x => x.outcome === 'sound')) known.push({ land: r.land, text: r.text, counts: {} });
  assert.ok(known.length >= 30);
  for (const c of known) {
    const r = req(c.text, c.counts), counts = { ...r.counts }, fe = analyzeFeasibility({ land: c.land, counts, requirements: r });
    assert.equal(fe.hard.filter(h => h.certificate && verifyCertificate(h.certificate, { land: c.land, counts, requirements: r }).valid).length, 0, c.text);
    assert.equal(areaCertificate({ land: c.land, counts, requirements: r, floors: c.land.floors >= 2 ? 2 : 1 }), null, c.text);
  }
});
test('03 رسائل العميل: «1 من 5» بالعدد الحقيقي، وبلا مصطلحات ولا نص استثناء، والكاشف يلتقط إشعاري r20 المضللين', () => {
  const n = shortfallNotice({ requested: 5, shown: 1, shortfall_ar: 'عُرض 1 من 5 مطلوبة؛ المرشحون المبنيون من أنماط تنظيمية مختلفة 9، اجتاز البوابات منهم 3' });
  assert.match(n.title_ar, /عُرض 1 من 5/); assert.deepEqual(clientLint(n.lines_ar.join(' ')), []);
  assert.ok(lintClientText('VILLA_NO_FIT: TypeError hardLink').length >= 1); assert.equal(lintClientText(toClientAr('السبب من المولّد: تعذّر')).length, 0);
  const ev = id => `${root}evidence/acceptance/after-20-heldout2/${id}/result.json`;
  if (existsSync(ev('H10'))) { assert.ok(textContradictions(JSON.parse(readFileSync(ev('H10'), 'utf8')).notice.lines_ar.join('\n')).length >= 1); assert.ok(textContradictions(JSON.parse(readFileSync(ev('H6'), 'utf8')).notice.lines_ar.join('\n')).length >= 1); }
  const land = { width: 25, length: 30, streets: ['e'], entries: ['e'], floors: 1 }, counts = { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 };
  const fe = analyzeFeasibility({ land, counts, requirements: req('4 غرف نوم ومجلس', counts) });
  for (const rep of [explainFailure({ feasibility: fe, land, error: Object.assign(Error('VILLA_NO_FIT internal'), { code: 'VILLA_NO_FIT', treeStats: { tried: 30, why: { 'dims:kitchen': 20 } } }) }), explainFailure({ feasibility: fe, land, status: { reason: 'TIME_LIMIT' } })]) {
    assert.deepEqual(reportContradictions(rep), []); assert.deepEqual(textContradictions(rep.report_ar), []); assert.deepEqual(clientLint(rep.report_ar), []); assert.doesNotMatch(rep.report_ar, /VILLA_|internal/);
  }
});

// ------------------------------------------------------------------------------------------------ 04 تصنيف الدرج (ST) منفصلًا
import { isSleepKey, unitsOf, layoutTrees } from '../dist/villa-layout-v3.mjs';
test('04 الدرج «ST» ليس جناح نوم (kit: ST stair not classified as sleeping room)، والتحويل إلى شجرة لا يتعطل بتوزيع أرضي فيه الدرج', () => {
  assert.equal(isSleepKey('ST'), false); assert.equal(isSleepKey('S1'), true); assert.equal(isSleepKey('S12'), true);
  const r = req('مجلس رجال ومجلس نساء والطعام والمطبخ', { bedrooms: 1, majlis: 2 }), P = programV2({ bedrooms: 1, majlis: 2, baths: 3, kitchens: 1, halls: 1, dining: 1 }, r);
  const { units } = unitsOf(P, { stair: true }); assert.ok(units.some(u => u.key === 'ST'));
  const R = { M: { x0: 0, y0: 0, x1: 1, y1: 1 }, F: { x0: 1, y0: 0, x1: 2, y1: 1 }, ST: { x0: 2, y0: 0, x1: 3, y1: 1 }, H: { x0: 1, y0: 1, x1: 3, y1: 2 }, DN: { x0: 0, y0: 1, x1: 1, y1: 2 }, KS: { x0: 0, y0: 2, x1: 1, y1: 3 }, S1: { x0: 1, y0: 2, x1: 3, y1: 3 } };
  const keep = Object.fromEntries(Object.entries(R).filter(([k]) => units.some(u => u.key === k)));
  assert.doesNotThrow(() => layoutTrees({ nc: 3, nr: 3, R: keep }, units, P));
});

// ------------------------------------------------------------------------------------------------ 06 مسار الضيف لكل مصادر الأشجار
import { guestTopology } from '../dist/villa-layout-v2.mjs';
import { measureR16 } from '../dist/privacy-defects.mjs';
import { execFileSync } from 'node:child_process';
const Zt = (ids, along) => ({ t: 'zone', along, b: ids.map(id => ({ id })), w: ids.map(() => 1) });
test('06 الفحص الطوبولوجي قبل حل الأبعاد (kit topologyGuestRoute): متجاوران ممكن، ويفصلهما صف لا، والقطري متفائل، والغائب null', () => {
  assert.equal(guestTopology({ t: 'y', k: [Zt(['M', 'DN'], 'x'), Zt(['H'], 'x')], w: [1, 1] }, 'M', 'DN'), true);
  assert.equal(guestTopology({ t: 'y', k: [Zt(['M', 'K'], 'x'), Zt(['H'], 'x'), Zt(['DN'], 'x')], w: [1, 1, 1] }, 'M', 'DN'), false);
  assert.equal(guestTopology({ t: 'y', k: [Zt(['M', 'K', 'DN'], 'x'), Zt(['H'], 'x')], w: [1, 1] }, 'M', 'DN'), false, 'في المنطقة نفسها يفصلهما المطبخ');
  assert.equal(guestTopology({ t: 'x', k: [{ t: 'y', k: [Zt(['M'], 'x'), Zt(['A'], 'x')], w: [1, 1] }, { t: 'y', k: [Zt(['B'], 'x'), Zt(['DN'], 'x')], w: [1, 1] }], w: [1, 1] }, 'M', 'DN'), true);
  assert.equal(guestTopology({ t: 'y', k: [Zt(['M'], 'x'), { t: 'void', opt: true }, Zt(['DN'], 'x')], w: [1, 1, 1] }, 'M', 'DN'), true, 'فراغ اختياري قد ينطوي');
  assert.equal(guestTopology({ t: 'y', k: [Zt(['M'], 'x'), Zt(['H'], 'x')], w: [1, 1] }, 'M', 'DN'), null);
});

// ------------------------------------------------------------------------------------------------ 07 التنوع قبل الهندسة ومحوّل r19
import { diversifyTopologies, r19Different, r19DifferentOf, layoutFingerprint } from '../dist/diversity-r21.mjs';
import { archSignatureV2, archDifferenceV2 } from '../dist/arch-difference.mjs';
import { sameOrDifferent } from '../dist/arch-criterion.mjs';
test('07 المعيار المجمّد r19 لم يُمس: dist/arch-criterion.mjs ووثيقته كما في الأساس 3b212e7', () => {
  for (const f of ['dist/arch-criterion.mjs', 'dist/arch-difference.mjs', 'docs/research/arch-difference-criterion-r19.md']) {
    const base = execFileSync('git', ['show', '3b212e7:' + f], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.equal(readFileSync(root + f, 'utf8'), base, f);
  }
});
test('07 diversifyTopologies أول ظهور لكل بصمة بالترتيب حتى الحد، والبصمة الوظيفية مستقلة عن الانعكاس', () => {
  assert.deepEqual(diversifyTopologies([1, 2, 3, 4, 5, 6], 2, x => x % 3), [1, 2]);
  assert.deepEqual(diversifyTopologies(['a1', 'a2', 'b1', 'c1'], 9, x => x[0]), ['a1', 'b1', 'c1']);
  const L = { nc: 3, nr: 3, R: { M: { x0: 0, y0: 0, x1: 1, y1: 1 }, F: { x0: 1, y0: 0, x1: 2, y1: 1 }, DN: { x0: 2, y0: 0, x1: 3, y1: 1 }, H: { x0: 0, y0: 1, x1: 2, y1: 2 }, KS: { x0: 2, y0: 1, x1: 3, y1: 2 }, S1: { x0: 0, y0: 2, x1: 3, y1: 3 } } };
  const mir = { nc: 3, nr: 3, R: Object.fromEntries(Object.entries(L.R).map(([k, r]) => [k, { x0: 3 - r.x1, x1: 3 - r.x0, y0: r.y0, y1: r.y1 }])) };
  assert.equal(layoutFingerprint(L), layoutFingerprint(mir));
  const moved = { nc: 3, nr: 3, R: { ...L.R, M: { x0: 0, y0: 1, x1: 1, y1: 2 }, H: { x0: 0, y0: 0, x1: 2, y1: 1 }, F: { x0: 1, y0: 1, x1: 2, y1: 2 } } };
  assert.notEqual(layoutFingerprint(L), layoutFingerprint(moved), 'المجلس من الأمام إلى الوسط تنظيم آخر');
});

// ------------------------------------------------------------------------------------------------ 08 التعديل الآمن في طبقة المعاملة
import { applySafeEdit, validateEdit } from '../dist/change-guard.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
let gen = null;
const genMD = () => {
  if (gen) return gen;
  const counts = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, r = req('دور واحد، 3 غرف نوم، مجلس رجال، والمجلس يفتح على الطعام، صالة، مطبخ', counts);
  const o = V3.generateVillaDesigns({ land: { width: 22, length: 30, streets: ['s'], entries: ['s'], floors: 1 }, counts: r.counts, requirements: r, keep: 4 });
  return (gen = { r, o });
};
test('06+07 على بديل مولَّد بطلب «المجلس يفتح على الطعام»: كل معروض غير محجوب فيه باب فعلي بين المجلس والطعام ومسار ضيف بلا عبور العائلة (بعد التفصيل)، وحكم «مختلف» بالمحوّل = المعيار المجمّد', { timeout: 900000 }, () => {
  const { r, o } = genMD(), shown = o.designs.filter(d => d.presentation?.status !== 'hidden');
  assert.ok(shown.length >= 1);
  for (const d of shown) {
    const v = validateEdit(d.doc, r);
    assert.ok(v.brief.some(b => b.kind === RELATIONS.DIRECT_DOOR), 'العقد فيه DIRECT_DOOR');
    for (const b of v.brief) assert.equal(b.ok, true, b.kind);
    const g = measureR16(d.doc, { text: r.text, counts: r.counts, rules: r.rules || [] }).find(x => x.id === 'GUEST_DINING'); assert.ok(!g || !g.applicable || g.pass);
  }
  const docs = o.designs.map(d => d.doc);
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const d = archDifferenceV2(archSignatureV2(docs[i]), archSignatureV2(docs[j])), f = sameOrDifferent(docs[i], docs[j]).different;
    assert.equal(r19DifferentOf(d), f); assert.equal(r19Different(docs[i], docs[j]), f); assert.equal(d.verdict === 'distinct', f);
  }
});
test('08 applySafeEdit: حذف الباب المباشر المطلوب يُرفض والأصل لا يُمس؛ تعديل لا يُسقط شرطًا يُقبل؛ وما طلبه العميل في الدور يُعفى', { timeout: 900000 }, () => {
  const { r, o } = genMD(), d = o.designs.find(x => x.presentation?.status !== 'hidden'), doc = d.doc;
  const model = analyzeDoc(doc), ids = [];
  for (const lv of model.levels) for (const op of lv.openings) { if (!op.door) continue; const all = op.sides.flatMap(s => [s.room, s.other && s.other !== 'outside' ? lv.roomsById.get(s.other) : null]).filter(Boolean); if (all.some(x => x.type === 'majlis') && all.some(x => x.type === 'dining')) ids.push(op.id); }
  assert.ok(ids.length, 'باب بين المجلس والطعام في المولَّد');
  const snap = JSON.stringify(doc);
  const cut = applySafeEdit(doc, x => { x.openings = x.openings.filter(op => !ids.includes(op.id)); }, r);
  assert.equal(cut.accepted, false); assert.equal(cut.reason, 'HARD_CONSTRAINT_VIOLATION'); assert.equal(JSON.stringify(doc), snap, 'الأصل لم يتغير');
  assert.ok(cut.violations.some(v => /^BRIEF:/.test(v.id)), JSON.stringify(cut.violations));
  for (const v of cut.violations) assert.deepEqual(lintClientText(v.ar), [], v.ar);
  const ok = applySafeEdit(doc, x => { x.title = 'نسخة'; }, r);
  assert.equal(ok.accepted, true); assert.equal(ok.doc.title, 'نسخة'); assert.notEqual(ok.doc, doc);
  const exempt = applySafeEdit(doc, x => { x.openings = x.openings.filter(op => !ids.includes(op.id)); }, r, { exempt: cut.violations.map(v => v.id) });
  assert.equal(exempt.accepted, true);
});
test('08 طبقة المعاملة نفسها (design-session): مع تعطيل حارس التعديل القديم يرفض applySafeEdit سد الباب المطلوب ويبقى الباب؛ ومع تعطيله أيضًا يُعتمد السد (الطبقة هي التي ترفض)', { timeout: 1200000 }, () => {
  const run = off => JSON.parse(execFileSync(process.execPath, [root + 'tests/_r21-safe-edit-probe.mjs'], { cwd: root, env: { ...process.env, R14_OFF: off, NODE_TEST_CONTEXT: '' }, encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split('\n').pop());
  const withLayer = run('r20guard'), without = run('r20guard,r21safe');
  assert.deepEqual(withLayer, { local: false, generated: true, doorKept: true });
  assert.deepEqual(without, { local: true, generated: false, doorKept: false });
});
