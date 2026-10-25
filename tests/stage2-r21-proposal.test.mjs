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
