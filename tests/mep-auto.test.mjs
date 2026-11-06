// المولّد الأولي لمدخلات الأنظمة: من مخطط مولَّد تخرج أرقام (إنارة، مقابس، دوائر، أحمال تبريد، أجهزة صحية، خزان) بلا أخطاء.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import * as B from '../dist/mep/mep-binding.mjs';
import { autoInputs, autoSummary, ASSUMPTIONS } from '../dist/mep/auto-inputs.mjs';
import { mepSummaryHtml } from '../dist/final-outputs.mjs';

const L = (width, length, floors = 1) => ({ width, length, floors, streets: ['s'], entries: ['s'] });
async function run(doc) {
  let bind = await B.bindArchitecture(doc, { alternativeId: 'test' }); assert.ok(bind.ok, bind.error?.messageAr);
  const { inputs, summary } = autoInputs(doc, bind.project);
  bind = await B.bindArchitecture(doc, { alternativeId: 'test', inputs }); assert.ok(bind.ok, bind.error?.messageAr);
  const result = await B.computeSystems(bind.project);
  return { inputs, summary, result, project: bind.project, S: autoSummary(result, inputs, bind.project) };
}

test('دور واحد: مدخلات كاملة بلا أخطاء وأرقام في كل تخصص', async () => {
  const doc = generateVillaDesigns({ land: L(20, 30), counts: { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }, requirements: {} }).designs[0].doc;
  const { result, S, inputs } = await run(doc);
  assert.equal(result.issues.filter(i => i.severity === 'error').length, 0, JSON.stringify(result.issues.filter(i => i.severity === 'error').slice(0, 3)));
  assert.ok(S.lights >= 40 && S.sockets >= 30 && S.circuits >= 20, JSON.stringify({ l: S.lights, s: S.sockets, c: S.circuits }));
  assert.ok(S.demandW > 5000 && S.panels.length === 1 && S.panels[0].kVA > 5, 'طلب اللوحة بالأرقام');
  assert.ok(S.maxCurrentA > 0 && S.maxCurrentA <= 32, 'تيار الدوائر ضمن القواطع: ' + S.maxCurrentA);
  assert.ok(S.ac.length >= 8 && S.ac.every(z => z.gainW > 0 && z.btu >= 9000 && z.inputW > 0), 'أحمال التبريد وسعات الوحدات');
  assert.ok(S.acSelectedTR >= 8, 'سعات مختارة معقولة لفيلا: ' + S.acSelectedTR);
  assert.ok(S.fixtures.WC >= 5 && S.fixtures.BASIN >= 5 && S.fixtures.WATER_HEATER >= 5, JSON.stringify(S.fixtures));
  assert.equal(S.tankL, S.persons * ASSUMPTIONS.litresPerPersonDay * ASSUMPTIONS.autonomyDays);
  assert.ok(S.hotWaterW > 1000);
  assert.ok(S.fire >= 10 && S.lowCurrent >= 8 && S.pv && S.pv.panels > 0);
  assert.ok(inputs.rules.provenance.some(p => p.id === 'MIZAN-AUTO-INPUTS' && p.classification === 'PROJECT_ASSUMPTION'), 'الافتراضات معلنة');
  // الواجهة الكهربائية للأجهزة: كل جهاز بسعة مدخلة له حمل كهربائي مطابق
  const bad = result.coordination.interfaces.filter(i => i.outcome !== 'MATCHED_SUPPLIED_INPUT');
  assert.equal(bad.length, 0, JSON.stringify(bad.slice(0, 3)));
  const html = mepSummaryHtml(S); assert.ok(html.includes('وحدة إنارة') && html.includes('وحدة حرارية بريطانية/ساعة') && html.includes('طن تبريد'));
  assert.ok(!/BTU\/h|kVA|\bTR\b|\bkW\b|\bkWp\b/.test(html), 'الوحدات بالعربية لا بالإنجليزية');
});

test('دوران: لوحة لكل دور ودوائر لا تعبر الأدوار وأحمال تبريد في الدورين', async () => {
  const doc = generateVillaTwoFloors({ land: L(20, 30, 2), counts: { bedrooms: 5, majlis: 2, baths: 7, kitchens: 1, halls: 1, dining: 1 }, requirements: {} }).designs[0].doc;
  const { result, S } = await run(doc);
  assert.equal(result.issues.filter(i => i.severity === 'error').length, 0);
  assert.equal(S.panels.length, 2);
  assert.ok(!result.issues.some(i => i.code === 'CROSS_FLOOR_CIRCUIT_REQUIRES_RISER'));
  const L2 = doc.levels[1].id;
  assert.ok(S.ac.some(z => doc.labels.some(l => l.level === L2 && l.name === z.room)), 'مناطق تكييف في الدور الأول');
});

test('مبنى U: الحديقة لا تأخذ إنارة ولا تكييفًا، والممرات المطلة عليها بلا تكييف مستقل', async () => {
  const doc = generateVillaDesigns({ land: L(20, 30), counts: { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }, requirements: { prefs: { courtyard: true } } }).designs[0].doc;
  const { inputs, S, project } = await run(doc);
  assert.ok(doc.labels.some(l => l.type === 'courtyard'), 'المخطط فيه حديقة');
  assert.ok(!project.architecture.rooms.some(r => r.type === 'courtyard'), 'الحديقة خارج مشروع الأنظمة (المحوّل يستبعد الفراغات المفتوحة)');
  assert.ok(!Object.keys(inputs.services.electrical.lightingByRoom).some(id => doc.labels.find(l => l.id === id)?.type === 'courtyard'));
  assert.ok(!S.ac.some(z => z.room === 'ممر الحديقة'));
});
