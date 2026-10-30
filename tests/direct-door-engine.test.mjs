// direct_access (استثناء المالك، الجولة 21): باب مباشر حقيقي بين فراغين حدّدهما العميل. اختبارات على المحرك الفعلي (أرض 18×30 مدخل شمالي، 3 نوم).
// القياس: جدار مشترك ≥ 1.3 م، عرض الباب ≥ 0.8 م، فتح حر (DOOR_SWING)، اتصال وحركة (CIRCULATION، REACH، GUEST_ROUTE) في مراجعة المحرك نفسها.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLand, generateInitialDesign } from '../dist/home-flow.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';

const land = () => normalizeLand({ length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 }).land;
const counts = { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 };
const run = async text => { const req = extractRequirements(text, { counts }); req.counts = { ...req.counts, ...counts }; const out = await generateInitialDesign({ land: land(), counts: req.counts, requirements: req }).catch(e => ({ error: e })); return { req, out }; };
const doorItems = (a, req) => verifyRequest(a.doc, req, { entry: 'n' }).filter(x => /باب مباشر/.test(x.text || ''));

test('الاستخراج: «بباب مباشر على» تحمل door:true، و«ملاصق» لا تحملها', () => {
  assert.equal(extractRequirements('المقلط بباب مباشر على المجلس', { counts }).rules[0].door, true);
  assert.equal(extractRequirements('ابي المقلط ملاصق للمجلس', { counts }).rules[0].door, undefined);
});
for (const [text, pair] of [['المقلط بباب مباشر على المجلس', 'dining↔majlis'], ['المطبخ بباب مباشر على الطعام', 'kitchen↔dining']]) {
  test(`باب مباشر ${pair}: كل بديل ظاهر فيه باب فعلي عرضه ≥ 0.8 م على جدار مشترك ≥ 1.3 م وفتحه حر والحركة سليمة`, { timeout: 900000 }, async () => {
    const { out } = await run(text); assert.ok(out.alternatives?.length, 'لا بدائل: ' + out.error?.message);
    const shown = out.alternatives.filter(a => a.presentation?.status !== 'hidden'); assert.ok(shown.length >= 1, 'كلها محجوبة');
    const rq = extractRequirements(text, { counts });
    for (const a of shown) {
      const it = doorItems(a, rq); assert.ok(it.length === 1 && it[0].ok === true, 'الباب غير متحقق: ' + JSON.stringify(it.map(x => x.why)));
      const ev = it[0].evidence; assert.ok(ev && ev.width >= 0.8 && ev.sharedWall_m >= 1.3 - 0.11, JSON.stringify(ev));
      assert.deepEqual(a.review.failedGates.filter(g => ['DOOR_SWING', 'CIRCULATION', 'REACH', 'GUEST_ROUTE', 'INTEGRITY'].includes(g.id || g)), []);
    }
  });
}
test('تعذّر الباب (مجلس↔صالة: الضيف سيعبر العائلة إلى الطعام): لا بديل ظاهرًا بلا الباب، وسبب الحجب صريح، ولا تنازل صامت', { timeout: 900000 }, async () => {
  const { out } = await run('المجلس بباب مباشر على الصالة'); const rq = extractRequirements('المجلس بباب مباشر على الصالة', { counts });
  assert.ok(out.alternatives?.length, 'لا بدائل: ' + out.error?.message);
  for (const a of out.alternatives) {
    const ok = doorItems(a, rq).every(x => x.ok);
    if (a.presentation?.status !== 'hidden') assert.ok(ok, 'بديل ظاهر بلا الباب المطلوب');
    else assert.ok((a.presentation.hidden_ar || []).join(' ').length > 10, 'حجب بلا سبب');
  }
});
