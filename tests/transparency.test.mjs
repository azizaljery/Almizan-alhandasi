import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTransparency, renderTransparencyPanel, escapeHTML } from '../dist/transparency.mjs';

test('normalizeTransparency fills every one of the six required fields with honest defaults', () => {
  const t = normalizeTransparency({});
  assert.equal(t.name, 'مؤشر غير مُسمّى');
  assert.deepEqual(t.inputs, []);
  assert.equal(t.formula, '');
  assert.equal(t.formulaVersion, 'غير مُسجَّلة');
  assert.equal(t.hasResult, false);
  assert.deepEqual(t.assumptions, []);
  assert.deepEqual(t.missingData, []);
  assert.deepEqual(t.limits, []);
  assert.deepEqual(t.testedCases, []);
});

test('normalizeTransparency accepts plain-string and object input rows alike', () => {
  const t = normalizeTransparency({ inputs: ['عدد الغرف', { label: 'مساحة الأرض', value: 420, unit: 'م²' }] });
  assert.deepEqual(t.inputs, [
    { label: 'عدد الغرف', value: undefined, unit: undefined },
    { label: 'مساحة الأرض', value: 420, unit: 'م²' },
  ]);
});

test('renderTransparencyPanel renders all six fields and never fabricates a result', () => {
  const html = renderTransparencyPanel({
    name: 'مؤشر تجريبي',
    inputs: [{ label: 'الكتلة المبنية', value: 180, unit: 'م²' }],
    formula: 'جمع موزون لمحاور الفحص.',
    formulaVersion: 'test/1.0.0',
    result: '72 / 100',
    effect: 'يغيّر ترتيب البدائل المعروضة فقط.',
    assumptions: ['كل غرفة مذكورة في البرنامج موجودة في المخطط.'],
    missingData: ['لا توجد قياسات ميدانية للموقع.'],
    limits: ['لا يحسب العزل الصوتي الفعلي.'],
    testedCases: ['نموذج مستطيل بغرفتي نوم.'],
  });
  assert.match(html, /<details class="review-notes transparency-panel">/);
  assert.match(html, /كيف حُسب «مؤشر تجريبي»؟/);
  assert.match(html, /الكتلة المبنية.*180.*م²/);
  assert.match(html, /جمع موزون لمحاور الفحص\./);
  assert.match(html, /test\/1\.0\.0/);
  assert.match(html, /72 \/ 100/);
  assert.match(html, /يغيّر ترتيب البدائل المعروضة فقط\./);
  assert.match(html, /كل غرفة مذكورة في البرنامج موجودة في المخطط\./);
  assert.match(html, /لا توجد قياسات ميدانية للموقع\./);
  assert.match(html, /لا يحسب العزل الصوتي الفعلي\./);
  assert.match(html, /نموذج مستطيل بغرفتي نوم\./);
});

test('renderTransparencyPanel shows an explicit empty message instead of fabricating missing sections', () => {
  const html = renderTransparencyPanel({ name: 'بدون بيانات' });
  assert.match(html, /لا تتوفر مدخلات رقمية مباشرة مسجّلة لهذا المؤشر\./);
  assert.match(html, /لم تُسجَّل صيغة نصية لهذا المؤشر\./);
  assert.ok(!html.includes('النتيجة:'));
  assert.match(html, /لا افتراضات أو بيانات ناقصة مسجّلة لهذا الفحص\./);
  assert.match(html, /لم تُسجَّل حدود أو حالات اختبار صريحة لهذا المؤشر بعد\./);
});

test('renderTransparencyPanel escapes HTML in every field to stay XSS-safe', () => {
  const html = renderTransparencyPanel({
    name: '<script>alert(1)</script>',
    inputs: [{ label: '<img onerror=1>', value: '<b>x</b>' }],
    formula: '<i>f</i>',
    effect: '<u>e</u>',
    assumptions: ['<svg onload=1>'],
    limits: ['<a>l</a>'],
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<svg'));
  assert.match(html, /&lt;script&gt;/);
});

test('escapeHTML neutralizes the five HTML-sensitive characters', () => {
  assert.equal(escapeHTML(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  assert.equal(escapeHTML(null), '');
  assert.equal(escapeHTML(0), '0');
});
