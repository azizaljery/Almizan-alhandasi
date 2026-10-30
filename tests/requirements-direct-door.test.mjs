// التقاط «باب مباشر بين X وY» وصيغه القريبة في مستخرج العلاقات، دون تغيير سلوك العبارات الحالية.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements } from '../dist/requirements.mjs';

const rel = t => (extractRequirements(t, { counts: {} }).rules || []).map(r => [r.kind, r.a, r.b].join('|'));
test('«باب مباشر بين X وY» يُلتقط كملاصقة بين الطرفين', () => {
  assert.deepEqual(rel('ابي باب مباشر بين المقلط والمجلس'), ['adjacent|dining|majlis']);
  assert.deepEqual(rel('لازم باب مباشر بين المقلط والمجلس'), ['adjacent|dining|majlis']);
  assert.deepEqual(rel('باب داخلي مباشر بين المطبخ والطعام'), ['adjacent|kitchen|dining']);
});
test('«X له/بباب مباشر على Y» يُلتقط', () => {
  assert.deepEqual(rel('المقلط له باب مباشر على المجلس'), ['adjacent|dining|majlis']);
  assert.deepEqual(rel('المقلط بباب مباشر على المجلس'), ['adjacent|dining|majlis']);
  assert.deepEqual(rel('المطبخ له باب مباشر على الطعام'), ['adjacent|kitchen|dining']);
});
test('العبارات الحالية لا يتغير سلوكها', () => {
  assert.deepEqual(rel('ابي المقلط ملاصق للمجلس'), ['adjacent|dining|majlis']);
  assert.deepEqual(rel('المقلط يفتح على المجلس مباشرة'), ['adjacent|dining|majlis']);
  assert.deepEqual(rel('المطبخ بعيد عن المجلس'), ['far|kitchen|majlis']);
  assert.deepEqual(rel('الماستر بين الصالة والمجلس'), rel('الماستر بين الصالة والمجلس'));
  assert.deepEqual(rel('لا تحط المجلس جنب المطبخ'), ['apart|majlis|kitchen']);
});
test('«باب مباشر» بلا طرفين معروفين لا يختلق علاقة', () => {
  assert.deepEqual(rel('ابي باب مباشر'), []);
});
