// حماية النشر: مقارنة البصمات ترفض حذف ملف حرج ونقص الاختبارات، وتقبل التغيير العادي.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFingerprint, compareFingerprints, countTests, CRITICAL_FILES, FINGERPRINT_SCHEMA } from '../scripts/release-fingerprint.mjs';

const base = () => { const files = {}; for (const f of CRITICAL_FILES) files[f] = 'a'.repeat(64); files['dist/x.mjs'] = 'b'.repeat(64); return { schema: FINGERPRINT_SCHEMA, tests: { declared: 100, run: 120 }, critical: [...CRITICAL_FILES], files, client: {} }; };

test('البصمة الحية: كل الملفات الحرجة موجودة وsha256 سداسي صالح', () => {
  const fp = buildFingerprint({ now: new Date('2026-10-16T00:00:00Z') });
  assert.equal(fp.schema, FINGERPRINT_SCHEMA); assert.ok(fp.tests.declared > 100 && fp.tests.declared === countTests());
  for (const f of CRITICAL_FILES) assert.match(fp.files[f], /^[a-f0-9]{64}$/, f);
  assert.ok(!Object.keys(fp.files).some(k => k.startsWith('dist/client/')));
  assert.deepEqual(compareFingerprints(null, fp).errors, []);
});
test('لا أخطاء عند عدم تغيّر شيء أو تعديل/إضافة ملف', () => {
  const a = base(), b = base(); b.files['dist/x.mjs'] = 'c'.repeat(64); b.files['dist/new.mjs'] = 'd'.repeat(64); b.tests.declared = 101;
  const r = compareFingerprints(a, b); assert.deepEqual(r.errors, []); assert.deepEqual(r.changes, { added: ['dist/new.mjs'], removed: [], modified: ['dist/x.mjs'] });
});
test('رفض: حذف ملف حرج', () => {
  const a = base(), b = base(); delete b.files['dist/draw/doc.mjs'];
  const r = compareFingerprints(a, b); assert.equal(r.errors.length >= 1, true); assert.match(r.errors.join('|'), /dist\/draw\/doc\.mjs/);
});
test('حذف ملف غير حرج لا يُرفض لكنه يُسجَّل', () => {
  const a = base(), b = base(); delete b.files['dist/x.mjs']; const r = compareFingerprints(a, b);
  assert.deepEqual(r.errors, []); assert.deepEqual(r.changes.removed, ['dist/x.mjs']);
});
test('رفض: نقص عدد الاختبارات (المُصرَّح والمُشغَّل)', () => {
  const a = base(), b = base(); b.tests.declared = 99; assert.match(compareFingerprints(a, b).errors[0], /100 ← 99/);
  const c = base(); c.tests.run = 119; assert.match(compareFingerprints(a, c).errors[0], /120 ← 119/);
  const d = base(); d.tests.run = null; assert.deepEqual(compareFingerprints(a, d).errors, []);
});
