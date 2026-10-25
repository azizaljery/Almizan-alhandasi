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
