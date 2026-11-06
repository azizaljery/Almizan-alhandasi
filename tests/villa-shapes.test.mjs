// أشكال المسقط عند الطلب: L (جناح أمامي وذراع خلفي)، T (صالة مركزية وممر خلفي)، وعدّ المثنى («غرفتا نوم»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, checkDoc } from '../dist/villa-layout.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';

const L = (width, length, floors = 1) => ({ width, length, floors, streets: ['s'], entries: ['s'] });
const C = (o = {}) => ({ bedrooms: 0, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0, ...o });
const sound = doc => { const c = checkDoc(doc); assert.ok(c.ok, c.problems.join(' | ')); assert.ok(!reviewDoc(doc).some(i => i.code === 'UNREACHABLE_ROOM'), 'كل فراغ موصول'); };

test('النص الحر: «شكل L» و«شكل T» يُفهمان نمطين، و«غرفتا نوم» تُعدّ غرفتين', () => {
  assert.equal(extractRequirements('ابي مبنى على شكل L، 4 غرف نوم ومجلس', { counts: {} }).prefs.shape, 'L');
  assert.equal(extractRequirements('ابي بيت على شكل T', { counts: {} }).prefs.shape, 'T');
  assert.equal(extractRequirements('ابي مبنى على شكل U والمنتصف حديقة', { counts: {} }).prefs.shape, undefined);
  assert.equal(extractRequirements('غرفتا نوم، الرئيسية بحمام خاص', { counts: {} }).counts.bedrooms, 2);
  assert.equal(extractRequirements('الماستر وغرفتين للعيال', { counts: {} }).counts.bedrooms, 3);
});

test('طلب L: التصاميم كلها L، سليمة وموصولة، وفيها ذراع خلفي والزاوية الباقية ساحة', () => {
  const out = generateVillaDesigns({ land: L(20, 30), counts: C({ bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }), requirements: { prefs: { shape: 'L' } } });
  assert.ok(out.designs.length >= 1);
  for (const d of out.designs) {
    assert.equal(d.mode, 'L');
    sound(d.doc);
    assert.ok(d.notes.some(n => n.includes('شكل L')), 'ملاحظة الشكل');
    assert.ok(d.doc.labels.filter(l => ['bedroom', 'master'].includes(l.type)).length >= 4);
  }
});

test('طلب T: التصاميم كلها T أو أقرب بديل معلن', () => {
  const out = generateVillaDesigns({ land: L(18, 30), counts: C({ bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }), requirements: { prefs: { shape: 'T' } } });
  for (const d of out.designs) sound(d.doc);
  const fell = out.designs.some(d => d.notes.some(n => n.includes('تعذّر توزيع')));
  assert.ok(out.designs.every(d => d.mode === 'tee') || fell, 'T أو إعلان التعذّر');
});

test('طلب L على أرض ضيقة: إن تعذّر يُعلن ذلك ولا يُعرض صمتًا', () => {
  const out = generateVillaDesigns({ land: L(15, 25), counts: C({ bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }), requirements: { prefs: { shape: 'L' } } });
  const n = out.designs.length;
  assert.ok(n >= 1);
  if (out.designs.some(d => d.mode !== 'L')) assert.ok(out.designs[0].notes.some(x => x.includes('تعذّر توزيع')), 'إعلان التعذّر');
});
