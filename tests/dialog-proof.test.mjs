// اختبار سريع لأداة إثبات الحوار (scripts/dialog-run.mjs): تعمل على حالتين (طلب طويل + جلسة تعديل بدورين)،
// وأدوات القياس نفسها صادقة (مخطط مقارن بنفسه = صفر مخالفات؛ الفهم الكامل = F1 واحد). لا يحكم على جودة المولّد:
// الأرقام الحقيقية في evidence/dialog/<stage>/ وفي docs/research/dialog-proof-r4.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LONG, SESSIONS } from '../scripts/dialog-cases.mjs';
import { runLong, runSession, preservation, score, expectedItems, roomsOf, FIELDS, THRESHOLDS } from '../scripts/dialog-run.mjs';

test('المدوّنة: 12 طلبًا طويلًا (150–400 كلمة) بفهم متوقع، و6 جلسات تعديل من 4–6 أدوار', () => {
  assert.ok(LONG.length >= 12 && SESSIONS.length >= 6);
  for (const C of LONG) {
    const n = C.text.trim().split(/\s+/).length;
    assert.ok(n >= 150 && n <= 400, `${C.id}: ${n} كلمة`);
    assert.ok(Object.keys(C.expect.counts || {}).length && Array.isArray(C.expect.rules), C.id);
  }
  for (const S of SESSIONS) {
    assert.ok(S.turns.length >= 4 && S.turns.length <= 6, S.id);
    for (const t of S.turns) assert.ok(Array.isArray(t.scope) && t.checks.length, `${S.id}: ${t.text}`);
  }
});

test('القياس صادق: الفهم الكامل F1=1، والمخطط مقارنًا بنفسه بلا مخالفات', () => {
  const E = expectedItems(LONG[0].expect), S = score(E, new Map(E));
  assert.equal(S.f1, 1); assert.equal(S.missed.length, 0); assert.equal(S.wrong.length, 0);
  const half = new Map([...E].slice(0, Math.floor(E.size / 2))), H = score(E, half);
  assert.ok(H.recall < 1 && H.precision === 1);
  assert.deepEqual(THRESHOLDS, { areaPct: 5, shift: .5 });
});

test('إصلاحات المحلل التي كشفتها المدوّنة: الرفض والحذف لا يُقرآن إضافة، والفاصلة العشرية العربية، ونفي «حمام لكل غرفة»', async () => {
  const { extractRequirements } = await import('../dist/requirements.mjs');
  const r = t => extractRequirements(t);
  let q = r('احذف المكتب'); assert.ok(!q.extras.office && q.absent.includes('office'));
  q = r('شيل المصلى'); assert.ok(!q.extras.prayer && q.absent.includes('prayer'));
  q = r('ما نبغى خدامة ساكنة عندنا'); assert.ok(!q.extras.maid && q.absent.includes('maid'));
  q = r('ما فيه داعي لغرفة خادمة ولا سواق، ما نحتاجهم'); assert.ok(!q.extras.maid && !q.extras.driver);
  q = r('أبي غرفة خادمة ومكتب ومصلى'); assert.ok(q.extras.maid && q.extras.office && q.extras.prayer && !q.absent.length);
  q = r('مجلس واحد يكفي، يعني ما نحتاج مجلس نساء'); assert.equal(q.counts.majlis, 1); assert.ok(!q.absent.includes('majlis'));
  q = r('بدون مجلس'); assert.equal(q.counts.majlis, 0);
  q = r('مو لازم كل غرفة بحمام، يتشاركون عادي'); assert.ok(q.prefs.sharedBaths && !q.prefs.allEnsuite);
  q = r('وما يحتاج حمام لكل غرفة'); assert.ok(q.prefs.sharedBaths && !q.prefs.allEnsuite);
  q = r('كل غرفة بحمامها'); assert.ok(q.prefs.allEnsuite);
  q = r('غرفة النوم الرئيسية بعرض ٤ وطول ٥٫٥ م'); assert.deepEqual([q.dims.master.w, q.dims.master.l], [4, 5.5]);
});

test('الأداة تعمل على حالتين: طلب طويل وجلسة تعديل (دوران) مع إثبات الحفظ على المستند', { timeout: 60000 }, async () => {
  const L = await runLong(LONG[0]);
  for (const f of FIELDS) assert.ok(f in L.score.per, f);
  assert.ok(L.score.f1 >= 0 && L.score.f1 <= 1 && Array.isArray(L.score.missed) && Array.isArray(L.score.wrong));
  assert.ok(L.coverage.clauses > 5 && Array.isArray(L.coverage.dropped));

  const S3 = SESSIONS.find(s => s.id === 'S3');
  const sess = await runSession(S3, { maxTurns: 2 });
  assert.equal(sess.turns.length, 2); assert.equal(sess.docs.length, 3);
  const self = preservation(sess.docs[0], sess.docs[0], []);
  assert.equal(self.violations.length, 0); assert.equal(self.difference, 0); assert.ok(self.geometryIdentical);
  assert.equal(self.rows.length, roomsOf(sess.docs[0]).length);
  for (const t of sess.turns) {
    assert.ok(['applied', 'asked', 'unclear', 'error'].includes(t.outcome));
    assert.ok(t.preservation.rows.length > 5 && typeof t.happened === 'boolean');
    // كل مخالفة تحمل اسم الغرفة ونوع التغيّر
    for (const v of t.preservation.violations) assert.ok(v.name && v.kind);
  }
  // «احتفظ بهذا التوزيع وغيّر الواجهة»: المخطط يجب أن يبقى حرفيًا (يُقاس من المستند)
  assert.ok(sess.turns[0].preservation.geometryIdentical);
});
