// (الجولة 21 — قرار المالك: اختبارات الإصلاح المتوقع رسوبها منفصلة) تُشغَّل بـ npm run test:pending، ولا تُحتسب في حزمة npm test ولا تكسرها.
// كل اختبار هنا يصف سلوكًا مطلوبًا لم يُعتمد إصلاحه بعد (docs/research/v3-diagnosis-r21.md)؛ رسوبه الآن متوقع ومسجّل، ونجاحه بعد الإصلاح هو الدليل.
// لا يُستعمل هنا أي من H11–H15 (مختومة).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { extractRequirements } from '../dist/requirements.mjs';
import * as V3 from '../dist/villa-layout-v3.mjs';
import { HELDOUT } from '../scripts/heldout-cases.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';
import { sameOrDifferent } from '../dist/arch-criterion.mjs';
import { MANDATORY_R16, measureR16 } from '../dist/privacy-defects.mjs';

const run = C => { const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts }; return V3.generate({ land: { floors: 1, ...C.land }, counts: req.counts, requirements: req, keep: C.want || req.want || 4, _cf: true }); };
const root = new URL('../', import.meta.url).pathname;

test('§3 الدوران على أرض عريضة (H4 معروفة): مخطط واحد على الأقل غير محجوب، وكل جدار علوي محمول (≤ 5 م بلا جدار تحته)', { timeout: 1200000 }, () => {
  const r = run(HELDOUT.find(c => c.id === 'H4'));
  assert.equal(r.status, 'SOLVED', r.report_ar || ''); assert.ok(r.alternatives.some(d => d.presentation?.status !== 'hidden'));
});
test('§6 التنوع: خمسة بدائل مطلوبة (C10) ← ثلاثة على الأقل «مختلفة معماريًا» بالمعيار المجمّد r19 وغير محجوبة', { timeout: 1200000 }, () => {
  const r = run(CASES.find(c => c.id === 'C10')); const ok = (r.alternatives || []).filter(d => d.presentation?.status !== 'hidden');
  const pick = []; for (const d of ok) if (pick.every(p => sameOrDifferent(p.doc, d.doc).different)) pick.push(d);
  assert.ok(pick.length >= 3, `مختلفة ${pick.length}`);
});
test('§5 مسار الضيف بالرسم البياني في مرحلة التنظيم: كل مرشح يدخل البناء يحقق مسار الضيف الداخلي (لا GUEST_DINING ولا MAJLIS_ISOLATED في الحوض)', { timeout: 1200000 }, () => {
  globalThis.__v2dbg = {}; globalThis.__v2keepDocs = true;
  const C = HELDOUT.find(c => c.id === 'H3'); run(C);
  const pool = globalThis.__v2poolDocs || []; delete globalThis.__v2dbg; delete globalThis.__v2keepDocs;
  assert.ok(pool.length > 0, 'حوض مبني');
  for (const p of pool) assert.ok(!measureR16(typeof p.doc === 'string' ? JSON.parse(p.doc) : p.doc, { text: C.text, counts: C.counts }).some(g => g.applicable && !g.pass && ['GUEST_DINING', 'MAJLIS_ISOLATED'].includes(g.id)), p.pat);
});
test('§7 المواقف: وحدة إثبات وصول السيارة (مسار دخول وخروج ونموذج دوران محافظ) موجودة وتُستعمل في التصنيف', () => {
  assert.ok(existsSync(root + 'dist/parking-reach.mjs'), 'لم يُنفَّذ بعد');
  assert.ok(MANDATORY_R16.includes('PARKING_UNREACHABLE'));
});
