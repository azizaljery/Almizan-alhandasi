import test from 'node:test';
import assert from 'node:assert/strict';
import { cityById, regionById, nearestCity } from '../dist/geo-land.mjs';
import { cityFromText } from '../dist/geo-input.mjs';

// الإحداثيات: ويكيبيديا (19°31′59″N 43°30′11″E) — مركز المدينة تقريبيًا.
test('تثليث ضمن منطقة عسير بإحداثياتها', () => {
  const c = cityById('tathlith');
  assert.equal(c.ar, 'تثليث'); assert.equal(c.region, 'asir');
  assert.ok(Math.abs(c.lat - 19.533) < 0.05 && Math.abs(c.lng - 43.503) < 0.05);
  assert.ok(regionById('asir').cities.some(x => x.id === 'tathlith'));
});
test('أقرب مدينة لموقع في تثليث هي تثليث', () => {
  assert.equal(nearestCity(19.54, 43.51).city.id, 'tathlith');
});
test('التعرف على الاسم عربيًا وإنجليزيًا (مرجع Plus Code القصير)', () => {
  for (const t of ['تثليث', 'مدينة تثليث', 'Tathlith', 'tathlith']) assert.equal(cityFromText(t)?.id, 'tathlith', t);
});
