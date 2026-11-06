// اتساق الأنظمة الهندسية بين صفحة المخرجات وصفحة الأنظمة: المصدر نفسه، والأرقام نفسها، والنسخة المعروضة مسماة،
// وغياب الحساب يُعلن صراحة بدل صفر صامت «لا توجد دوائر».
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns } from '../dist/villa-layout.mjs';
import * as B from '../dist/mep/mep-binding.mjs';
import { autoInputs, autoSummary } from '../dist/mep/auto-inputs.mjs';
import { computeOutputsMep, outputsSource } from '../dist/mep/outputs-mep.mjs';
import { mepSummaryHtml, mepQuantityRow, applyMepRow, NOT_COMPUTED_AR } from '../dist/final-outputs.mjs';
import { computeDocQuantities } from '../dist/draw/quantities-doc.mjs';
import { parseDoc, serialize } from '../dist/draw/doc.mjs';

const LAND = { width: 20, length: 30, floors: 1, streets: ['s'], entries: ['s'] };
const COUNTS = { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 };
const TAG = 1700000000000; // createdAt الجلسة، وبه تُشتق مفاتيح المصادر

function villaTwoDesigns() {
  const out = generateVillaDesigns({ land: LAND, counts: COUNTS, requirements: {} });
  assert.ok(out.designs.length >= 2, 'يلزم تصميمان على الأقل للاختبار');
  return out.designs.map(d => d.doc);
}
const sessionOf = docs => ({ createdAt: TAG, approved: 0, current: 0, designs: docs.map((doc, i) => ({ version: i + 1, doc: serialize(doc) })), alternatives: [] });

// المسار الذي تسلكه صفحة الأنظمة (systems.mjs: bind ← autoFill ← bind بالمدخلات ← computeSystems)
async function systemsPath(src) {
  const doc = parseDoc(src.docText);
  let b = await B.bindArchitecture(doc, { alternativeId: src.id, revision: src.revision });
  assert.ok(b.ok, b.error?.messageAr);
  const { inputs } = autoInputs(doc, b.project);
  b = await B.bindArchitecture(doc, { alternativeId: src.id, revision: src.revision, inputs });
  assert.ok(b.ok, b.error?.messageAr);
  const result = await B.computeSystems(b.project);
  return { result, inputs, summary: autoSummary(result, inputs, b.project) };
}
const memStore = entities => ({ getItem: k => (k === B.STORE_KEY ? JSON.stringify({ schema: B.SYSTEMS_SCHEMA, entities }) : null) });

test('المخرجات وصفحة الأنظمة تحسبان من المصدر نفسه بالأرقام نفسها، والنسخة المعروضة مسماة', async () => {
  const [d1] = villaTwoDesigns();
  const session = sessionOf([d1]), studioRaw = serialize(d1);
  const src = outputsSource({ session, studioRaw });
  assert.ok(src && src.kind === 'studio', 'المصدر المعروض في المخرجات هو مخطط المرسم');
  const out = await computeOutputsMep({ session, studioRaw, store: null });
  const sys = await systemsPath(src);
  assert.equal(out.notComputed, false, out.reasonAr);
  assert.ok(out.lights > 0, 'عدد الإنارة غير صفري في المخرجات: ' + out.lights);
  assert.equal(out.lights, sys.summary.lights, 'الإنارة متطابقة بين الصفحتين');
  assert.equal(out.circuits, sys.summary.circuits, 'الدوائر متطابقة بين الصفحتين');
  assert.equal(out.sockets, sys.summary.sockets, 'المقابس متطابقة بين الصفحتين');
  assert.ok(out.circuits > 0 && out.panels.length >= 1 && out.ac.length > 0, 'الدوائر واللوحات والتكييف تصل إلى المخرجات');
  assert.equal(out.source.id, src.id);
  const html = mepSummaryHtml(out);
  assert.ok(html.includes(`<b>${out.lights}</b>`) && html.includes('وحدة إنارة'), 'عدد الإنارة يظهر في صفحة المخرجات');
  assert.ok(html.includes('التصميم 1'), 'اسم النسخة المعروضة يظهر في قسم الأنظمة');
  assert.ok(html.includes(out.source.label));
  assert.ok(!html.includes('لا توجد دوائر'));
  const row = mepQuantityRow(out);
  assert.equal(row.value, out.circuits, 'صف الكميات يحمل عدد الدوائر المحسوبة');
  assert.equal(row.grade, 'estimated');
  assert.ok(row.basis.includes('التصميم 1') && !row.basis.includes('لا توجد دوائر'));
  const rows = applyMepRow(computeDocQuantities(parseDoc(src.docText)).rows, out);
  assert.equal(rows.find(r => r.id === 'mep').value, out.circuits, 'صف الكميات في الصفحة يتبع الحساب');
});

test('لا توجد مدخلات أو لا يوجد مخطط: يُعلن أن الأنظمة لم تُحسب بعد بدل صفر صامت', async () => {
  const [d1] = villaTwoDesigns();
  const out = await computeOutputsMep({ session: null, studioRaw: null, store: null });
  assert.equal(out.notComputed, true);
  const html = mepSummaryHtml(out);
  assert.ok(html.includes(NOT_COMPUTED_AR) && !html.includes('لا توجد دوائر'));
  assert.ok(mepSummaryHtml(null).includes(NOT_COMPUTED_AR));
  const row = mepQuantityRow(null);
  assert.equal(row.value, null);
  assert.equal(row.grade, 'unavailable');
  assert.ok(row.basis.includes('لم تُحسب') && !row.basis.includes('لا توجد دوائر'));
  const rows = applyMepRow(computeDocQuantities(d1).rows, null);
  assert.ok(!rows.some(r => String(r.basis).includes('لا توجد دوائر')), 'لا يبقى النص الثابت في صف الكهرباء');
});

test('مدخلات صفحة الأنظمة المحفوظة تُستعمل، وحساب بديل آخر يُذكر كملاحظة مسماة فقط', async () => {
  const [d1, d2] = villaTwoDesigns();
  const session = sessionOf([d1, d2]), studioRaw = serialize(d1);
  const src = outputsSource({ session, studioRaw });
  const sysStudio = await systemsPath(src);
  const other = (await B.listSources({ session, studioRaw })).find(s => s.kind === 'design' && s.label.includes('التصميم 2'));
  assert.ok(other, 'التصميم 2 مدرج في المصادر');
  const sysOther = await systemsPath(other);
  const store = memStore({
    [src.id]: { schema: B.SYSTEMS_SCHEMA, alternativeId: src.id, sessionKey: String(TAG), kind: 'studio', revision: src.revision, inputs: sysStudio.inputs, result: sysStudio.result },
    [other.id]: { schema: B.SYSTEMS_SCHEMA, alternativeId: other.id, sessionKey: String(TAG), kind: 'design', revision: other.revision, inputs: sysOther.inputs, result: sysOther.result },
  });
  const out = await computeOutputsMep({ session, studioRaw, store });
  assert.equal(out.source.origin, 'systems-edited', 'المدخلات المحفوظة في صفحة الأنظمة تُستعمل');
  assert.equal(out.lights, sysStudio.summary.lights);
  assert.equal(out.others.length, 1, 'البديل الآخر يظهر مرة واحدة كملاحظة');
  assert.equal(out.others[0].id, other.id);
  const html = mepSummaryHtml(out);
  assert.ok(html.includes('صفحة الأنظمة المعدّلة'), 'تُعلن أن المدخلات معدّلة');
  assert.ok(html.includes('التصميم 2') && html.includes('غير معروض هنا'), 'الحساب الآخر مسمّى كملاحظة فقط');
  assert.ok(html.includes(`<b>${out.lights}</b>`), 'الأرقام المعروضة للنسخة الحالية لا للأخرى');
});
