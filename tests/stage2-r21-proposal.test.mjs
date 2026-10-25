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
