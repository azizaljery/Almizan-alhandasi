import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLand, SharaSession, interpretFree, generateInitialDesign, modelToStudioDoc, landPreviewSvg, SHARA_NAME, SHARA_WELCOME, ENGINEERING_FIELDS } from '../dist/home-flow.mjs';
import { runMultiEngineDesign } from '../dist/multi-engine.mjs';
import { validateDoc } from '../dist/draw/doc.mjs';
import { defaultRooms } from '../dist/planner.mjs';
import { normalizeDiscovery } from '../dist/client-brief.mjs';

const land = (extra = {}) => ({ length: 30, width: 20, streets: ['s', 'e'], entries: ['s', 'e'], ...extra });

test('الأرض: مدخلان على شارعين، والمدخل الأول هو الأساسي للمحرك', () => {
  const { plot, land: out } = normalizeLand(land());
  assert.equal(plot.entry, 's'); assert.deepEqual(out.entries, ['s', 'e']);
  assert.equal(plot.streets.s, true); assert.equal(plot.streets.e, true); assert.equal(plot.streets.n, false);
  assert.equal(plot.floors, 1);
});
test('الأرض: ثلاثة شوارع ومدخلان وتكرار الجهات يُدمج', () => {
  const { land: out } = normalizeLand(land({ streets: ['s', 'e', 'n', 'n'], entries: ['e', 'e', 'n'] }));
  assert.deepEqual(out.streets, ['s', 'e', 'n']); assert.deepEqual(out.entries, ['e', 'n']);
});
test('الأرض: ترفض مدخلًا لا يطل على شارع، وجهة مجهولة، وقوائم فارغة، وأبعادًا خارج المدى', () => {
  assert.throws(() => normalizeLand(land({ entries: ['w'] })), /يجب أن يطل على شارع/);
  assert.throws(() => normalizeLand(land({ streets: ['x'], entries: ['x'] })), /غير معروف/);
  assert.throws(() => normalizeLand(land({ streets: [] })), /شارعًا واحدًا/);
  assert.throws(() => normalizeLand(land({ entries: [] })), /مدخلًا واحدًا/);
  assert.throws(() => normalizeLand(land({ length: 5 })), /8 و100/);
  assert.throws(() => normalizeLand(land({ width: NaN })), /8 و100/);
});

test('شرعاء: تفتح بالترحيب الحرفي ثم خياران فقط', () => {
  assert.equal(SHARA_NAME, 'شرعاء');
  const s = new SharaSession(), first = s.start();
  assert.equal(first[0].text, 'أهلاً بك، أنا شرعاء، مساعدك الذكي لفهم احتياجاتك في تصميم منزلك.'); assert.equal(first[0].text, SHARA_WELCOME);
  assert.deepEqual(first[1].options.map(o => o.id), ['free', 'guided']);
});
test('شرعاء الموجَّه: توضيح الهدف ثم نمط الحياة متعدد ثم الأسئلة الهندسية ثم التوليد', () => {
  const s = new SharaSession(); s.start();
  const a = s.answer('mode', 'guided');
  assert.match(a[0].text, /نمط حياتك/); assert.equal(a[1].kind, 'multi'); assert.equal(a[1].id, 'household');
  const b = s.answer('household', ['guests', 'children', 'seniors']);
  assert.equal(b[0].id, 'children', 'سؤال فرعي لأن الأطفال اختيروا');
  const c = s.answer('children', 'جناح هادئ'); assert.equal(c[0].id, 'avoids'); assert.equal(c[0].kind, 'multi');
  const d = s.answer('avoids', ['0', '4']); assert.equal(d[0].kind, 'counts'); assert.equal(d[0].fields.length, ENGINEERING_FIELDS.length);
  const e = s.answer('counts', { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 }); assert.equal(e[0].kind, 'generate');
  assert.deepEqual(s.discovery().life, { guests: 'متكررة', seniors: 'موجودون', children: 'جناح هادئ' });
  assert.equal(s.discovery().avoids.length, 2);
  assert.equal(s.rooms().filter(r => r.type === 'bedroom').length, 3);
});
test('شرعاء: لا سؤال فرعي للأطفال إن لم يُختاروا، والاختيار الفارغ مقبول', () => {
  const s = new SharaSession(); s.start(); s.answer('mode', 'guided');
  const next = s.answer('household', []);
  assert.equal(next[0].id, 'avoids');
  assert.deepEqual(s.discovery().life, {});
});
test('شرعاء: ترفض الاختيارات المجهولة والأعداد خارج المدى والخطوات الخاطئة', () => {
  const s = new SharaSession(); s.start();
  assert.throws(() => s.answer('mode', 'x'), /غير معروف/);
  s.answer('mode', 'guided');
  assert.throws(() => s.answer('household', ['pets']), /غير معروف/);
  s.answer('household', []);
  assert.throws(() => s.answer('avoids', ['99']), /غير معروف/);
  s.answer('avoids', []);
  assert.throws(() => s.answer('counts', { bedrooms: 0, majlis: 1, baths: 1, kitchens: 1, halls: 1, dining: 1 }), /غرف النوم/);
  assert.throws(() => s.answer('counts', { bedrooms: 2.5, majlis: 1, baths: 1, kitchens: 1, halls: 1, dining: 1 }), /غرف النوم/);
  assert.throws(() => s.answer('nope', 1), /خطوة غير معروفة/);
});
test('شرعاء: كل مخرجات الاكتشاف تقبلها normalizeDiscovery (نفس مفردات النظام)', () => {
  const s = new SharaSession(); s.start(); s.answer('mode', 'guided');
  s.answer('household', ['guests', 'children', 'seniors', 'future']); s.answer('children', 'قريبون من الصالة');
  s.answer('avoids', ['0', '1', '2', '3', '4', '5']);
  assert.doesNotThrow(() => normalizeDiscovery(s.discovery()));
});
test('شرعاء الحر: يملأ الأعداد المذكورة صراحة فقط ويترك الباقي فارغًا بلا افتراض', async () => {
  const s = new SharaSession(); s.start(); s.answer('mode', 'free');
  const understood = await interpretFree('ابي 3 غرف نوم ومجلس واحد ومطبخ بدون فناء');
  assert.equal(understood.counts.bedrooms, 3); assert.equal(understood.counts.majlis, 1); assert.equal(understood.counts.kitchens, 1);
  assert.equal(understood.counts.baths, undefined, 'لم يُذكر فلا يُخمَّن');
  const next = s.answer('free', understood);
  const form = next.find(m => m.kind === 'counts');
  assert.ok(form, 'نموذج الأعداد يظهر');
  const byId = Object.fromEntries(form.fields.map(f => [f.id, f.value]));
  assert.deepEqual([byId.bedrooms, byId.majlis, byId.kitchens, byId.baths], [3, 1, 1, '']);
  assert.throws(() => s.answer('counts', { bedrooms: 3, majlis: 1, kitchens: 1 }), /دورات المياه/, 'العدد غير المذكور لا يمرّ بلا إدخال');
  assert.equal(s.idea, 'ابي 3 غرف نوم ومجلس واحد ومطبخ بدون فناء');
  assert.throws(() => s.answer('free', 'ab'), /وصفًا/);
});

test('معاينة الأرض: شارعان ومدخلان، وبلا أخطاء مع مدخلات ناقصة', () => {
  const svg = landPreviewSvg(land());
  assert.equal((svg.match(/pv-street/g) || []).length, 2); assert.equal((svg.match(/pv-door/g) || []).length, 2);
  assert.doesNotThrow(() => landPreviewSvg({})); assert.doesNotThrow(() => landPreviewSvg({ length: 'x', width: -3, streets: ['q'] }));
  assert.ok(!/NaN|undefined/.test(landPreviewSvg({})));
});

test('الوصلة: كل نماذج المحرك الفعلية (خرج runMultiEngineDesign) تتحول إلى مستند مرسم صالح', async () => {
  const { plot } = normalizeLand(land());
  const r = await runMultiEngineDesign({ plot, rooms: defaultRooms({ bedrooms: 3, majlis: 1 }), idea: '', discovery: normalizeDiscovery(undefined) });
  assert.ok(r.models.length >= 3, 'عدة بدائل');
  for (const model of r.models) {
    const { doc } = modelToStudioDoc(model, normalizeLand(land()).land);
    assert.deepEqual(validateDoc(doc).filter(i => i.severity === 'error'), [], model.strategy);
    assert.ok(doc.walls.length > 8); assert.deepEqual(doc.entries, ['s', 'e']); assert.deepEqual(doc.streets, ['s', 'e']); assert.equal(doc.entry, 's');
  }
});
test('التوليد: من الأرض والبرنامج إلى مستند، مع ملاحظة صريحة عن المدخل الثاني', async () => {
  const s = new SharaSession(); s.start(); s.answer('mode', 'guided'); s.answer('household', ['guests']); s.answer('avoids', []);
  s.answer('counts', { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 });
  const out = await generateInitialDesign({ land: land(), rooms: s.rooms(), discovery: s.discovery() });
  assert.equal(out.doc.labels.filter(l => l.type === 'bedroom' || l.type === 'master').length, 3);
  assert.ok(out.doc.plot && out.doc.plot.polygon.length === 4);
  // المدخل الثاني يُنفَّذ بباب على جهته، أو يُذكر صراحة أنه لم يُنفَّذ
  assert.ok(out.notes.some(n => n.includes('المدخل الثاني')));
  assert.ok(out.alternativesCount >= 1);
});
test('التوليد: «بدون فناء» في النص الحر لا ينتج فناءً', async () => {
  const out = await generateInitialDesign({ land: land({ entries: ['s'] }), rooms: defaultRooms({ bedrooms: 3, majlis: 1 }), discovery: normalizeDiscovery(undefined), idea: 'ابي بيت بدون فناء' });
  assert.ok(!out.doc.labels.some(l => l.type === 'courtyard'));
  assert.ok(!out.notes.some(n => n.includes('المدخل الأول فقط')), 'مدخل واحد: لا ملاحظة');
});
test('التوليد: أرض غير صالحة تُرفض ولا يُولَّد بديل صامت', async () => {
  await assert.rejects(generateInitialDesign({ land: land({ entries: ['w'] }), rooms: defaultRooms(), discovery: normalizeDiscovery(undefined) }), /يطل على شارع/);
});
