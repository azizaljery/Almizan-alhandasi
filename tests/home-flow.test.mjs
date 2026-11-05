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
test('شرعاء الإرشادي: أسئلة بترتيب الأثر (الأسرة ← الضيوف ← النوم ← المطبخ ← الإضافات) كل سؤال بسببه، والنتيجة جدول البرنامج', () => {
  const s = new SharaSession(); s.start();
  const a = s.answer('mode', 'guided');
  assert.match(a[0].text, /نمط حياتك/); assert.equal(a[1].kind, 'ask'); assert.equal(a[1].id, 'g_family'); assert.match(a[1].reason, /^أسأل/);
  const b = s.answer('g_family', { picks: ['mother'], text: '3 أولاد وبنتين صغار' }); assert.equal(b[0].id, 'g_guests'); assert.ok(b[0].free, 'الكتابة الحرة متاحة في كل خطوة');
  const c = s.answer('g_guests', ['both']); assert.equal(c[0].id, 'g_sleep');
  const d = s.answer('g_sleep', ['ensuite']); assert.equal(d[0].id, 'g_kitchen');
  const e = s.answer('g_kitchen', ['closed', 'maid']); assert.equal(e[0].id, 'g_extras');
  const f = s.answer('g_extras', ['office', 'pool']);
  assert.equal(f[0].kind, 'program', 'النتيجة جدول البرنامج نفسه');
  const by = Object.fromEntries(f[0].rows.map(r => [r.id, r]));
  assert.equal(by.majlis_men.count, 1); assert.equal(by.majlis_women.count, 1); assert.equal(by.bedroom_boys.count, 2); assert.equal(by.bedroom_girls.count, 1); assert.equal(by.elderly_room.count, 1); assert.equal(by.maid.count, 1); assert.equal(by.office.count, 1);
  assert.equal(by.bedroom_boys.source, 'family'); assert.equal(by.master.source, 'custom');
  assert.ok(f.some(m => m.id === 'unsupported' && m.items.some(t => /المسبح/.test(t))), 'المسبح يُقال بصدق أنه لا يُرسم');
  assert.equal(f.at(-1).kind, 'generate');
  assert.deepEqual(s.counts, { bedrooms: 5, majlis: 2, baths: 8, kitchens: 1, halls: 1, dining: 1 });
  assert.deepEqual(s.discovery().life, { seniors: 'موجودون', children: 'جناح هادئ' });
  assert.equal(s.rooms().filter(r => r.type === 'bedroom').length, 5);
  assert.equal(s.requirements.prefs.openKitchen, false); assert.equal(s.requirements.extras.maid.bath, true);
});
test('شرعاء الإرشادي: تخطّي كل الخطوات يعطي برنامجًا افتراضيًا معلنًا لا خطأ', () => {
  const s = new SharaSession(); s.start(); s.answer('mode', 'guided');
  for (const id of ['g_family', 'g_guests', 'g_sleep', 'g_kitchen']) s.answer('skip', id);
  const out = s.answer('skip', 'g_extras');
  assert.equal(out[0].kind, 'program'); assert.ok(out[0].rows.every(r => r.source === 'custom'));
  assert.equal(s.counts.bedrooms, 1);
});
test('شرعاء: ترفض الاختيارات المجهولة والتعديلات خارج المدى والخطوات الخاطئة', () => {
  const s = new SharaSession(); s.start();
  assert.throws(() => s.answer('mode', 'x'), /غير معروف/);
  s.answer('mode', 'free');
  assert.throws(() => s.answer('free', 'ab'), /وصفًا/);
  s.answer('free', 'ثلاث غرف نوم ومجلس');
  assert.throws(() => s.answer('program', { op: 'set', id: 'hall', count: 11 }), /بين 0 و10/);
  assert.throws(() => s.answer('program', { op: 'zap', id: 'hall' }), /غير معروف/);
  assert.throws(() => s.answer('counts', { bedrooms: 0 }), /غرف النوم/);
  assert.throws(() => s.answer('nope', 1), /خطوة غير معروفة/);
});
test('شرعاء: مخرجات الاكتشاف تقبلها normalizeDiscovery (نفس مفردات النظام) في كل المسارات', () => {
  const s = new SharaSession(); s.start(); s.answer('mode', 'free');
  s.answer('free', 'عندي 4 عيال كبار وامي تسكن معنا وضيوفنا كثير، مجلسين ومقلط');
  assert.doesNotThrow(() => normalizeDiscovery(s.discovery()));
  assert.equal(s.discovery().life.guests, 'متكررة'); assert.equal(s.discovery().life.seniors, 'موجودون');
  assert.doesNotThrow(() => normalizeDiscovery(new SharaSession().discovery()));
});
test('شرعاء الحر: الجدول يذكر كل ما قيل (المجلسان والصالتان والغرف الأربع) ولا يعيد سؤاله، والحقول غير المذكورة افتراض معلن', async () => {
  const s = new SharaSession(); s.start(); s.answer('mode', 'free');
  const next = s.answer('free', 'أبغى مجلسين وصالتين وأربع غرف نوم ومطبخ مفتوح وغرفة خادمة');
  const table = next.find(m => m.kind === 'program');
  assert.ok(table, 'جدول البرنامج يظهر');
  assert.ok(!next.some(m => m.kind === 'counts'), 'لا نموذج أعداد يعيد السؤال');
  const by = Object.fromEntries(table.rows.map(r => [r.id, r]));
  assert.equal(by.majlis_men.count + by.majlis_women.count, 2); assert.equal(by.hall.count, 2); assert.equal(by.master.count + by.bedroom.count, 4); assert.equal(by.maid.count, 1);
  assert.equal(by.hall.source, 'said'); assert.equal(by.dining.source, 'custom'); assert.match(by.dining.reason, /العرف/);
  assert.deepEqual(s.counts, { bedrooms: 4, majlis: 2, baths: 7, kitchens: 1, halls: 2, dining: 1 });
  assert.ok(!next.some(m => m.kind === 'ask' && /كم|عدد/.test(m.text)), 'لا سؤال عن أعداد فُهمت');
  assert.equal(next.at(-1).kind, 'generate', 'التوليد متاح فورًا بلا حقل إلزامي');
  assert.equal(s.idea, 'أبغى مجلسين وصالتين وأربع غرف نوم ومطبخ مفتوح وغرفة خادمة');
  // المسار القديم interpretFree ما زال يعمل للذكاء المتصل
  const understood = await interpretFree('ابي 3 غرف نوم ومجلس واحد ومطبخ بدون فناء');
  assert.equal(understood.counts.bedrooms, 3); assert.equal(understood.counts.majlis, 1);
});
test('شرعاء: تعديل الجدول في مكانه (± وحذف وإضافة) ينعكس في الأعداد، والأعداد اليدوية القديمة تحكم بلا خطأ على الفراغ', () => {
  const s = new SharaSession(); s.start(); s.answer('mode', 'free'); s.answer('free', 'مجلس وصالة وثلاث غرف نوم');
  assert.equal(s.counts.bedrooms, 3);
  let m = s.answer('program', { op: 'inc', id: 'bedroom' })[0]; assert.equal(m.kind, 'program'); assert.equal(s.counts.bedrooms, 4);
  assert.equal(m.rows.find(r => r.id === 'bedroom').source, 'edit');
  s.answer('program', { op: 'remove', id: 'dining' }); assert.equal(s.counts.dining, 0);
  s.answer('program', { op: 'add', id: 'maid', count: 1 }); assert.ok(s.requirements.extras.maid);
  s.answer('program', { op: 'dec', id: 'majlis_men' }); assert.equal(s.counts.majlis, 0);
  const g = s.answer('counts', { bedrooms: 5, baths: NaN, majlis: '' }); assert.equal(g[0].kind, 'generate');
  assert.equal(s.counts.bedrooms, 5); assert.equal(s.requirements.counts.bedrooms, 5); assert.equal(s.counts.baths, s.brief.counts.baths, 'الفارغ يبقى كما حُسب');
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
  const s = new SharaSession(); s.start(); s.answer('mode', 'free'); s.answer('free', 'ثلاث غرف نوم ومجلس وصالة ومطبخ وثلاث حمامات ومقلط وضيوفنا كثير');
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
