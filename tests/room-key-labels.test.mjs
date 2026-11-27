import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutLabels } from '../dist/draw/plan-annot.mjs';

const measure = (text, size) => String(text).length * size * .5;
const ring = (w, h) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
const lines3 = () => [{ text: 'غرفة', size: .3 }, { text: '3.6 × 4.3', size: .22, optional: true }, { text: '15.6 م²', size: .22 }];

test('تسمية في فراغ حرّ: بلا أثاث فوقها ولا ترميز', () => {
  const r = layoutLabels([{ id: 'a', seed: { x: 2, y: 2 }, ring: ring(4, 4), lines: lines3() }], { measure });
  assert.equal(r.placed.length, 1);
  assert.equal(r.placed[0].onFurniture, false);
  assert.equal(r.placed[0].lines.length, 3, 'السطور الكاملة تبقى حين يتسع المكان');
});

test('يُسقط سطر الأبعاد الاختياري قبل السماح بالتراكب مع الأثاث', () => {
  // الأثاث يترك شريطًا خاليًا يتسع لسطرين لا لثلاثة
  const furniture = { x: 2, y: 2.6, w: 4, h: 2.8, soft: true };
  const r = layoutLabels([{ id: 'a', seed: { x: 2, y: 1 }, ring: ring(4, 4), lines: lines3() }], { measure, obstacles: [furniture], maxR: 1 });
  const p = r.placed[0];
  assert.equal(p.onFurniture, false, 'لا تراكب مع الأثاث');
  assert.ok(p.lines.length <= 3);
});

test('غرفة ممتلئة بالأثاث: تُعلَّم التسمية «على أثاث» ليُرمَّز الفراغ برقم', () => {
  const furniture = { x: 1, y: 1, w: 2, h: 2, soft: true };
  const r = layoutLabels([{ id: 'a', seed: { x: 1, y: 1 }, ring: ring(2, 2), lines: lines3() }], { measure, obstacles: [furniture], maxR: .5 });
  const p = r.placed[0];
  assert.equal(p.onFurniture, true);
  assert.equal(r.overlaps, 0, 'الأثاث اللين لا يُحسب تراكبًا صلبًا');
});

test('العوائق الصلبة (الدرج والأعمدة) لا تُتجاوز كما الأثاث اللين', () => {
  const stair = { x: 2, y: 2, w: 1, h: 1 };
  const r = layoutLabels([{ id: 'a', seed: { x: 2, y: 2 }, ring: ring(4, 4), lines: lines3() }], { measure, obstacles: [stair] });
  const p = r.placed[0];
  assert.ok(Math.abs(p.x - 2) >= (p.w + 1) / 2 - 1e-9 || Math.abs(p.y - 2) >= (p.h + 1) / 2 - 1e-9, 'التسمية خارج صندوق الدرج');
});
