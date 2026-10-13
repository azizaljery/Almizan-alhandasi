import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGULATORY_STATUS, UNVERIFIED_LABEL, DEFAULT_VERIFICATION_NOTE,
  createRegulatoryCheck, unverifiedCheck, describeRegulatoryCheck, toEvidenceRow,
} from '../dist/regulatory-checks.mjs';

test('a regulatory check cannot be constructed as pass/fail without a complete, real source', () => {
  assert.throws(() => createRegulatoryCheck({ rule: 'ارتداد الشارع', measuredLabel: 'القيمة', measuredValue: 3, status: REGULATORY_STATUS.PASS }));
  assert.throws(() => createRegulatoryCheck({ rule: 'ارتداد الشارع', measuredLabel: 'القيمة', measuredValue: 3, status: REGULATORY_STATUS.FAIL, source: { document: 'كود البناء', version: '', verifiedDate: '2026-01-01' } }));
  assert.throws(() => createRegulatoryCheck({ rule: 'ارتداد الشارع', measuredLabel: 'القيمة', measuredValue: 3, status: REGULATORY_STATUS.PASS, source: null }));
  // A complete source is accepted and preserved faithfully.
  const check = createRegulatoryCheck({
    rule: 'ارتداد الشارع', measuredLabel: 'الارتداد المرسوم', measuredValue: 3, unit: 'م',
    status: REGULATORY_STATUS.PASS,
    source: { document: 'كود البناء السعودي SBC 101', version: '2024', verifiedDate: '2026-01-01', section: 'الفصل 3' },
  });
  assert.equal(check.status, REGULATORY_STATUS.PASS);
  assert.equal(check.source.document, 'كود البناء السعودي SBC 101');
  assert.equal(check.source.section, 'الفصل 3');
  assert.ok(Object.isFrozen(check));
  assert.ok(Object.isFrozen(check.source));
});

test('required fields and sane measured values are enforced', () => {
  assert.throws(() => createRegulatoryCheck({ rule: '', measuredLabel: 'x', status: REGULATORY_STATUS.UNVERIFIED }));
  assert.throws(() => createRegulatoryCheck({ rule: 'x', measuredLabel: '', status: REGULATORY_STATUS.UNVERIFIED }));
  assert.throws(() => createRegulatoryCheck({ rule: 'x', measuredLabel: 'y', measuredValue: NaN, status: REGULATORY_STATUS.UNVERIFIED }));
  assert.throws(() => createRegulatoryCheck({ rule: 'x', measuredLabel: 'y', measuredValue: Infinity, status: REGULATORY_STATUS.UNVERIFIED }));
  assert.throws(() => createRegulatoryCheck({ rule: 'x', measuredLabel: 'y', status: 'approved' }));
  // null/undefined measured values are allowed (the fact itself may be unknown).
  assert.equal(createRegulatoryCheck({ rule: 'x', measuredLabel: 'y', measuredValue: null, status: REGULATORY_STATUS.UNVERIFIED }).measuredValue, null);
});

test('unverifiedCheck is the honest default: no source, UNVERIFIED status, a stated verification requirement', () => {
  const check = unverifiedCheck({ rule: 'نسبة البناء', measuredLabel: 'نسبة التغطية المحسوبة', measuredValue: 62.4, unit: '%' });
  assert.equal(check.status, REGULATORY_STATUS.UNVERIFIED);
  assert.equal(check.source, null);
  assert.equal(check.measuredValue, 62.4);
  assert.equal(check.verificationNote, DEFAULT_VERIFICATION_NOTE);
  assert.equal(check.requiresLicensedSpecialist, true);
  const custom = unverifiedCheck({ rule: 'x', measuredLabel: 'y', verificationNote: 'ملاحظة خاصة بهذا الفحص.' });
  assert.equal(custom.verificationNote, 'ملاحظة خاصة بهذا الفحص.');
});

test('describeRegulatoryCheck keeps the computed fact textually separate from the regulatory verdict', () => {
  const unverified = unverifiedCheck({ rule: 'ارتداد الجيران', measuredLabel: 'الارتداد المستخدم', measuredValue: 1.5, unit: 'م' });
  const described = describeRegulatoryCheck(unverified);
  assert.equal(described.factLine, 'الارتداد المستخدم: 1.5 م');
  assert.equal(described.statusLabel, UNVERIFIED_LABEL);
  assert.match(described.sourceLine, /لا يوجد مصدر نظامي موثّق/);
  assert.match(described.specialistLine, /مهندس أو جهة مرخّصة/);
  const noMeasured = unverifiedCheck({ rule: 'x', measuredLabel: 'y' });
  assert.equal(describeRegulatoryCheck(noMeasured).factLine, 'y: —');
  const verified = createRegulatoryCheck({
    rule: 'ارتفاع السقف', measuredLabel: 'الارتفاع المرسوم', measuredValue: 2.9, unit: 'م', status: REGULATORY_STATUS.FAIL,
    source: { document: 'كود البناء السكني', version: '2024', verifiedDate: '2026-02-01', section: 'R305.1' },
  });
  const describedVerified = describeRegulatoryCheck(verified);
  assert.equal(describedVerified.statusLabel, 'غير مطابق للمصدر المذكور');
  assert.match(describedVerified.sourceLine, /كود البناء السكني/);
  assert.match(describedVerified.sourceLine, /2026-02-01/);
});

test('toEvidenceRow maps check status onto the requirement-evidence row shape without ever producing a false pass', () => {
  const unverified = unverifiedCheck({ rule: 'ارتداد الشارع', measuredLabel: 'الارتداد', measuredValue: 3, unit: 'م' });
  const row = toEvidenceRow(unverified, { id: 'reg-x' });
  assert.equal(row.id, 'reg-x');
  assert.equal(row.status, 'UNVERIFIED');
  assert.equal(row.title, 'ارتداد الشارع');
  assert.match(row.evidence, /لم يتم التحقق/);
  assert.match(row.source, /لا يوجد مصدر نظامي موثّق/);
  assert.equal(row.category, 'الاشتراطات النظامية (الكود/البلدية)');

  const pass = createRegulatoryCheck({
    rule: 'ارتداد الشارع', measuredLabel: 'الارتداد', measuredValue: 3, unit: 'م', status: REGULATORY_STATUS.PASS,
    source: { document: 'كود البناء', version: '2024', verifiedDate: '2026-01-01' },
  });
  assert.equal(toEvidenceRow(pass, { id: 'reg-y' }).status, 'ENFORCED');
  const fail = createRegulatoryCheck({
    rule: 'ارتداد الشارع', measuredLabel: 'الارتداد', measuredValue: 1, unit: 'م', status: REGULATORY_STATUS.FAIL,
    source: { document: 'كود البناء', version: '2024', verifiedDate: '2026-01-01' },
  });
  assert.equal(toEvidenceRow(fail, { id: 'reg-z' }).status, 'NOT_MET');
  const customCategory = toEvidenceRow(unverified, { id: 'reg-w', category: 'فئة أخرى' });
  assert.equal(customCategory.category, 'فئة أخرى');
});
