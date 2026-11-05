import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateFacade, facadeSvg, PROJECTION_OPTIONS_CM } from '../dist/facade-engine/facade-engine.mjs';

const model = { building: { w: 16, h: 14 } };

test('المولّد يُحمَّل بلا خطأ نحوي ويعيد مواصفات كاملة', () => {
  const f = generateFacade(model, 'MODERN_TRAVERTINE_MASHRABIYA', { projectionCm: 20, floors: 2 });
  assert.equal(f.protrudingFrame.dimensions.projectionM, 0.2);
  assert.equal(f.privacyScreen.perforation, 0.45);
  assert.equal(f.entranceCanopy.dimensions.projectionM, 1.2);
});

test('البروز يقبل فقط 15 أو 20 أو 25 سم، ولا قيمة ثابتة 50 سم', () => {
  assert.deepEqual(PROJECTION_OPTIONS_CM, [15, 20, 25]);
  for (const cm of [15, 20, 25]) assert.equal(generateFacade(model, undefined, { projectionCm: cm }).protrudingFrame.dimensions.projectionM, cm / 100);
  assert.throws(() => generateFacade(model, undefined, { projectionCm: 50 }), /invalid_projection_cm/);
});

test('الأدوار 2 أو 3 فقط', () => {
  assert.equal(generateFacade(model, undefined, { floors: 9 }).floors, 3);
  assert.equal(generateFacade(model, undefined, { floors: 1 }).floors, 2);
});

test('لا توجد أرقام بلا مصدر في المخرجات (كفاءة التظليل، اللومن)', () => {
  const s = JSON.stringify(generateFacade(model));
  assert.ok(!/shadingEfficiency|lumensPerMeter|38/.test(s));
});

test('الإضاءة الخطية بلا مشربية', () => {
  const f = generateFacade(model, 'MODERN_LINEAR_LIGHTING');
  assert.equal(f.privacyScreen, null);
  assert.equal(f.lighting.colorTempK, 3200);
});

test('المولّد لا يستورد three.js ولا يتطلب DOM', () => {
  const src = readFileSync(new URL('../dist/facade-engine/facade-engine.mjs', import.meta.url), 'utf8');
  assert.ok(!/from\s+['"]three['"]/.test(src));
  assert.ok(!/document\./.test(src));
});

test('SVG المعاينة يحتوي على الإطار والمظلة ونص الطراز', () => {
  const svg = facadeSvg(generateFacade(model, 'MODERN_TRAVERTINE_MASHRABIYA', { projectionCm: 25 }));
  assert.match(svg, /<svg/);
  assert.match(svg, /بروز الإطار 25 سم/);
});

test('إدخال خاطئ يُرفض', () => {
  assert.throws(() => generateFacade({ building: { w: 0 } }), /invalid_facade_width/);
});
