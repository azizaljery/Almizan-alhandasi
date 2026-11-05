// حوار شرعاء من طرف إلى طرف: كلام العميل ← جدول البرنامج ← أسئلة معلَّلة ← المولّد ← مستند المرسم.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SharaSession, generateInitialDesign, MAX_QUESTIONS_PER_ROUND } from '../dist/home-flow.mjs';
import { validateDoc } from '../dist/draw/doc.mjs';

const LAND = { length: 30, width: 20, streets: ['s', 'e'], entries: ['s', 'e'], floors: 1 };
const free = (text, land = LAND) => { const s = new SharaSession({ land }); s.start(); s.answer('mode', 'free'); return { s, out: s.answer('free', text) }; };
const kinds = out => out.map(m => m.kind || 'msg');

test('«أبغى اثنين مجلس واثنين صالة» يصل إلى المرسم بمجلسين وصالتين دون أي حقل إلزامي', async () => {
  const { s, out } = free('أبغى اثنين مجلس واثنين صالة');
  assert.equal(out[0].kind, 'program'); assert.equal(out.at(-1).kind, 'generate');
  assert.ok(!out.some(m => m.kind === 'counts'), 'لا نموذج أعداد');
  assert.ok(!out.some(m => /كم صالة|كم مجلس|لم أستخرج/.test(m.text)));
  const res = await generateInitialDesign({ land: LAND, rooms: s.rooms(), discovery: s.discovery(), idea: s.idea, counts: s.counts, requirements: s.requirements });
  const types = res.doc.labels.map(l => l.type);
  assert.equal(types.filter(t => t === 'majlis').length, 2, 'مجلسان في الرسم');
  assert.equal(types.filter(t => t === 'living').length, 2, 'صالتان في الرسم (الصالة والصالة العائلية)');
  assert.deepEqual(validateDoc(res.doc).filter(i => i.severity === 'error'), []);
  const names = res.doc.labels.map(l => l.name);
  assert.ok(names.includes('مجلس الرجال') && names.includes('مجلس النساء') && names.includes('الصالة العائلية'), names.join('، '));
});

test('جملة المالك الأولى: الجدول كامل ولا إعادة سؤال، والمولّد يرسم 4 نوم و2 مجلس و2 صالة وخادمة', async () => {
  const { s, out } = free('أبغى مجلسين وصالتين وأربع غرف نوم ومطبخ مفتوح وغرفة خادمة');
  const table = out[0]; assert.equal(table.kind, 'program');
  const labels = table.rows.map(r => r.label).join(' ');
  for (const w of ['مجلس الرجال', 'مجلس النساء', 'الصالة العائلية', 'غرفة الخادمة', 'المطبخ الرئيسي', 'غرفة نوم']) assert.ok(labels.includes(w), w);
  assert.ok(table.rows.every(r => r.reason && r.sourceLabel && r.floorLabel && r.areaLabel));
  assert.ok(!out.some(m => m.kind === 'ask' && /كم |عدد/.test(m.text)), 'لا يُسأل عن عدد فُهم');
  assert.ok(out.some(m => m.id === 'understood' && m.items.includes('مطبخ مفتوح على الطعام')));
  const res = await generateInitialDesign({ land: LAND, rooms: s.rooms(), discovery: s.discovery(), idea: s.idea, counts: s.counts, requirements: s.requirements });
  const t = res.doc.labels.map(l => l.type);
  assert.equal(t.filter(x => x === 'bedroom' || x === 'master').length, 4); assert.equal(t.filter(x => x === 'majlis').length, 2); assert.equal(t.filter(x => x === 'living').length, 2); assert.ok(t.includes('service'));
});

test('«عائلة فيها 6 أولاد وأمي تسكن معنا»: برنامج مستنتج معلَّل، ثلاثة أسئلة كحد أقصى واحدًا واحدًا، والتوليد ممكن في أي لحظة', async () => {
  const { s, out } = free('عائلة فيها 6 أولاد وأمي تسكن معنا');
  assert.ok(!out.some(m => /لم أستخرج غرفًا/.test(m.text)));
  const by = Object.fromEntries(out[0].rows.map(r => [r.id, r]));
  assert.equal(by.bedroom_boys.sourceLabel, 'استنتاج من الأسرة'); assert.equal(by.elderly_room.sourceLabel, 'استنتاج من الأسرة'); assert.equal(by.elderly_room.floorLabel, 'الأرضي');
  assert.equal(out.filter(m => m.kind === 'ask').length, 1, 'سؤال واحد في الرسالة');
  assert.equal(out.find(m => m.kind === 'ask').id, 'kids_gender');
  // الإجابة بالكتابة الحرة تحدّث الجدول وتنتقل للسؤال التالي، ثم التخطّي، ثم لا أسئلة بعد الحد
  const a1 = s.answer('kids_gender', { picks: [], text: '4 بنين و2 بنات' });
  assert.equal(a1[0].kind, 'program'); const b1 = Object.fromEntries(a1[0].rows.map(r => [r.id, r.count]));
  assert.equal(b1.bedroom_boys, 2); assert.equal(b1.bedroom_girls, 1);
  assert.equal(a1.find(m => m.kind === 'ask')?.id, 'kids_ages');
  const a2 = s.answer('skip', 'kids_ages');
  assert.equal(a2.find(m => m.kind === 'ask')?.id, 'women_majlis');
  const a3 = s.answer('women_majlis', 'yes');
  assert.ok(!a3.some(m => m.kind === 'ask'), `بعد ${MAX_QUESTIONS_PER_ROUND} أسئلة في الدور لا سؤال رابع`);
  assert.equal(s.counts.majlis, 2); assert.equal(s.counts.bedrooms, 5);
  assert.equal(a3.at(-1).kind, 'generate');
  const res = await generateInitialDesign({ land: LAND, rooms: s.rooms(), discovery: s.discovery(), idea: s.idea, counts: s.counts, requirements: s.requirements });
  assert.ok(res.doc.labels.some(l => l.name === 'غرفة كبار السن'), 'غرفة الوالدة في الرسم');
  assert.equal(res.doc.labels.filter(l => l.type === 'majlis').length, 2);
});

test('«مجلس رجال ومجلس نساء ومقلط وصالة وخمس غرف نوم»: كلها «قلتَ»، والأسئلة المتبقية للخدمة والمطبخ فقط', () => {
  const { out } = free('ابي بيت فيه مجلس رجال ومجلس نساء ومقلط وصالة وخمس غرف نوم');
  const said = out[0].rows.filter(r => r.source === 'said').map(r => r.id);
  for (const id of ['majlis_men', 'majlis_women', 'dining', 'hall', 'bedroom']) assert.ok(said.includes(id), id);
  assert.ok(!out.some(m => m.id === 'unclear'), 'لا «لم أفهم» لجملة فُهمت كاملة');
  const ask = out.find(m => m.kind === 'ask'); assert.ok(ask.id !== 'bedrooms' && ask.id !== 'women_majlis'); assert.match(ask.reason, /^أسأل/);
});

test('كل دور حديث حر جديد يعيد ضبط عدّاد الأسئلة، و«أضف تفصيلًا» يكمل الكلام السابق', () => {
  const { s } = free('مجلس وصالة');
  assert.equal(s.brief.questions[0].id, 'bedrooms');
  const more = s.answer('more', 'عندنا 3 اولاد صغار وامي تسكن معنا');
  assert.equal(more[0].kind, 'program');
  const by = Object.fromEntries(more[0].rows.map(r => [r.id, r.count]));
  assert.equal(by.bedroom_boys, 2); assert.equal(by.elderly_room, 1); assert.equal(s.counts.majlis, 1);
  assert.ok(!more.some(m => m.kind === 'ask' && m.id === 'bedrooms'));
  assert.match(s.idea, /مجلس وصالة، عندنا 3 اولاد/);
});

test('الأعراف تُعطَّل من الجدول وتنعكس في المتطلبات، والافتراضات العرفية تظهر بوسمها', () => {
  const { s, out } = free('مجلس وثلاث غرف نوم ومطبخ');
  const customs = out[0].customs; assert.ok(customs.length >= 5 && customs.every(c => c.on && c.why));
  assert.ok(out[0].rows.some(r => r.sourceLabel === 'افتراض عرفي'));
  assert.equal(s.requirements.prefs.openKitchen, false);
  const t = s.answer('custom', { id: 'kitchen_closed', on: false });
  assert.equal(t[0].kind, 'program'); assert.equal(s.requirements.prefs.openKitchen, undefined);
  assert.equal(t[0].customs.find(c => c.id === 'kitchen_closed').on, false);
});

test('الدوران: «بيت دورين» يصل للمولّد بدورين والدور المقترح في الجدول علوي للنوم', async () => {
  const { s, out } = free('بيت دورين، مجلس وصالة واربع غرف نوم', { ...LAND, entries: ['s'], streets: ['s'] });
  assert.equal(s.requirements.prefs.floors, 2);
  assert.ok(out[0].rows.filter(r => r.id === 'master' || r.id === 'bedroom').every(r => r.floorLabel === 'العلوي'));
  assert.ok(out.some(m => m.kind === 'note' && /بدورين/.test(m.text)));
  const res = await generateInitialDesign({ land: { ...LAND, entries: ['s'], streets: ['s'] }, rooms: s.rooms(), discovery: s.discovery(), idea: s.idea, counts: s.counts, requirements: s.requirements });
  assert.equal(res.floors, 2);
});

test('الصدق: لا رسالة تدّعي فهمًا لم يحدث، ولا «لم أستخرج» حين يوجد ما يُستنتج', () => {
  for (const text of ['عائلة فيها 6 أولاد وأمي تسكن معنا', 'انا وزوجتي بس', 'نستقبل ضيوف كل اسبوع', 'عندي ولدين وبنت']) {
    const { out } = free(text);
    assert.ok(!out.some(m => /لم أستخرج غرفًا/.test(m.text)), text);
    assert.equal(out[0].kind, 'program');
    assert.ok(out[0].rows.every(r => r.reason.length > 4), 'كل صف بتعليل');
  }
});
