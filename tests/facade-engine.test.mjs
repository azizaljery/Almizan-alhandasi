import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateFacade, facadeSvg } from '../dist/facade-engine/facade-engine.mjs';

const model = { building: { w: 16, h: 14 } };

test('المولّد يُحمَّل بلا خطأ نحوي ويعيد القيم كما وردت', () => {
  const f = generateFacade(model);
  assert.equal(f.protrudingFrame.dimensions.projectionDepthM, 0.5);
  assert.equal(f.privacyMashrabiya.perforationRatio, 0.45);
  assert.equal(f.entranceCanopy.dimensions.projectionM, 1.2);
  assert.equal(f.metrics.shadingEfficiencyPercent, 78);
  assert.equal(f.linearLighting.lumensPerMeter, 900);
  assert.equal(f.linearLighting.colorTemperature, '3000K Warm White');
});

test('عرض الإطار مقيّد بـ 11 م، والأدوار 2 أو 3', () => {
  assert.equal(generateFacade({ building: { w: 30, h: 14 } }).protrudingFrame.dimensions.widthM, 11);
  assert.equal(generateFacade(model, undefined, { floors: 9 }).floors, 3);
  assert.equal(generateFacade(model, undefined, { floors: 1 }).floors, 2);
});

test('الإضاءة الخطية بلا مشربية وبحرارة 3200K', () => {
  const f = generateFacade(model, 'MODERN_LINEAR_LIGHTING');
  assert.equal(f.privacyMashrabiya, null);
  assert.equal(f.linearLighting.colorTemperature, '3200K Warm White');
  assert.equal(f.protrudingFrame.dimensions.projectionDepthM, 0.45);
});

test('المولّد لا يستورد three.js ولا يتطلب DOM', () => {
  const src = readFileSync(new URL('../dist/facade-engine/facade-engine.mjs', import.meta.url), 'utf8');
  assert.ok(!/from\s+['"]three['"]/.test(src));
  assert.ok(!/document\./.test(src));
});

test('SVG المعاينة يعرض الطراز وبروز الإطار', () => {
  const svg = facadeSvg(generateFacade(model));
  assert.match(svg, /<svg/);
  assert.match(svg, /بروز الإطار 500 مم/);
});

test('إدخال عرض خاطئ يُرفض', () => {
  assert.throws(() => generateFacade({ building: { w: 0 } }), /invalid_facade_width/);
});
