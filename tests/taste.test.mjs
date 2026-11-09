// ذوق العميل: الكلمات الوصفية تتحول إلى روافع تصميم معلنة، ولا تُعدّ «غير مفهومة».
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements, TASTE_SPACIOUS_SCALE } from '../dist/requirements.mjs';
import { buildBrief, TASTE_OPTIONS, STYLE_OPTIONS, answerToText, TASTE_QUESTION } from '../dist/shara/brief-engine.mjs';
import { parseWish } from '../dist/facade-j/facade-realism/choose-style.mjs';

test('الذوق: «مودرن فخمة وواسعة، إضاءة طبيعية وخصوصية ومساحات مفتوحة» كله مفهوم وله روافع', () => {
  const r = extractRequirements('ابي فيلا مودرن فخمة وواسعة دورين 4 غرف نوم ومجلس، احب الاضاءة الطبيعية والخصوصية والمساحات المفتوحة', {});
  assert.deepEqual(r.unclear, []);
  assert.deepEqual(r.prefs.taste, ['spacious', 'light', 'privacy', 'open']);
  assert.equal(r.tweaks.envScale, TASTE_SPACIOUS_SCALE); assert.deepEqual(r.tweaks.preferModes, ['court', 'L', 'tee']);
  assert.equal(r.prefs.openKitchen, true); assert.equal(r.prefs.style, 'modern');
  for (const w of ['بيت أرحب', 'إضاءة وتهوية', 'خصوصية', 'مساحات مفتوحة', 'الطراز حديث']) assert.ok(r.understood.some(u => u.includes(w)), w);
});
test('الذوق: طلب صريح يتقدم — المطبخ المغلق يبقى مغلقًا، والاقتصادي لا يُكبَّر، وحجم فراغ بعينه ليس ذوقًا للبيت', () => {
  const a = extractRequirements('3 غرف والمطبخ مغلق واحب الفراغات المفتوحة', {}); assert.equal(a.prefs.openKitchen, false); assert.deepEqual(a.prefs.taste, ['open']);
  const b = extractRequirements('بيت اقتصادي وفخم 3 غرف', {}); assert.equal(b.tweaks.envScale, .9);
  const c = extractRequirements('ابي مجلس واسع وصالة واسعة و3 غرف نوم', {}); assert.equal(c.prefs.taste, undefined); assert.equal(c.tweaks.envScale, undefined);
  const d = extractRequirements('بيت بسيط وهادي 3 غرف', {}); assert.deepEqual(d.tweaks.preferModes, ['center', 'side']);
});
test('الذوق: الطراز يصل إلى اختيار الواجهة بمفرداتها', () => {
  for (const [text, id, style] of [['فيلا مودرن', 'modern', 'M'], ['ستايل كلاسيك', 'classic', 'C'], ['بيت نجدي تراثي', 'najdi', 'N'], ['واجهة حجازية برواشين', 'hijazi', 'H'], ['طراز سلماني', 'salmani', 'S']]) {
    const r = extractRequirements(text + ' 3 غرف', {}); assert.equal(r.prefs.style, id, text);
    assert.equal(parseWish(r.prefs.styleWish)[0], style, text + ' ← ' + r.prefs.styleWish);
  }
  assert.equal(extractRequirements('3 غرف ومجلس', {}).prefs.style, undefined);
});
test('الذوق: كل خيار في سؤال الذوق والطراز يُفهم كما كُتب، والسؤال يختفي بعد الجواب', () => {
  for (const o of TASTE_OPTIONS) assert.deepEqual(extractRequirements(o.text, {}).prefs.taste, [o.id], o.label);
  for (const o of STYLE_OPTIONS) assert.equal(extractRequirements(o.text, {}).prefs.style, o.id, o.label);
  const b = buildBrief('3 غرف نوم ومجلس، ' + answerToText(TASTE_QUESTION, ['light', 'calm']));
  assert.ok(!b.questions.some(q => q.id === 'taste')); assert.deepEqual(b.requirements.prefs.taste, ['light', 'calm']);
});
