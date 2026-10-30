// الحزمة المنفصلة (قرار المالك 2026-10-27) — الرقعة C: إحداثيات الستارة (السور) على شبكة 1 سم. تُولَّد C6 بالمحرك وتُفحص كل أسوار الخصوصية المضافة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns } from '../dist/villa-layout-v3.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';
test('الستارة: كل إحداثيات أسوار الخصوصية المضافة (kind=fence) على شبكة 1 سم في C6', () => {
  const C = CASES.find(c => c.id === 'C6'), req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const o = generateVillaDesigns({ land: { floors: 1, ...C.land }, counts: req.counts, requirements: req, keep: 4 });
  let fences = 0;
  for (const d of o.designs) for (const w of d.doc.walls.filter(w => w.kind === 'fence')) { fences++; for (const p of [w.a, w.b]) for (const v of [p.x, p.y]) assert.ok(Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `إحداثي ${v} ليس على 1 سم`); }
  assert.ok(fences >= 1, 'لا سور خصوصية في بدائل C6 المولَّدة: الاختبار بلا موضوع');
});
