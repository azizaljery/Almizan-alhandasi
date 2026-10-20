// تعليمات العميل المكانية: الفهم (القواعد) ثم التنفيذ الفعلي في المخطط الناتج (سجل التنفيذ مقيس من المستند).
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRules, verifyRequest, docRooms, canonSide } from '../dist/rules.mjs';
import { extractRequirements, normalizeAr } from '../dist/requirements.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign, ledgerFor, mergeRules } from '../dist/design-session.mjs';

const R = t => extractRules(normalizeAr(t)).rules.map(r => [r.kind, r.a, r.b || r.side || r.floor].join(':'));
const LAND = (o = {}) => ({ width: 20, length: 30, streets: ['s'], entries: ['s'], floors: 1, ...o });
const BASE = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
async function design(text, counts = BASE, land = LAND()) {
  const req = extractRequirements(text, { counts });
  const out = await generateInitialDesign({ land, counts: req.counts, requirements: req, idea: text });
  return { out, req, ledger: out.ledger };
}

test('فهم المواضع والعلاقات والأدوار من صيغ متنوعة', () => {
  assert.deepEqual(R('3 غرف ومجلس وصالة والمطبخ في الخلف'), ['place:kitchen:back']);
  assert.deepEqual(R('المطبخ والطعام في الخلف'), ['place:kitchen:back', 'place:dining:back']);
  assert.deepEqual(R('المجلس يكون على الشارع'), ['place:majlis:front']);
  assert.deepEqual(R('المجلس في الجهة الشرقية'), ['place:majlis:e']);
  assert.deepEqual(R('الماستر ما تكون قريبة من المجلس'), ['far:master:majlis']);
  assert.deepEqual(R('غرفة خادمة قريبة من المطبخ'), ['near:maid:kitchen']);
  assert.deepEqual(R('المطبخ مفتوح على الصالة'), ['adjacent:kitchen:hall']);
  assert.deepEqual(R('غرفة للوالدة قريبة من الصالة وبعيدة عن المجلس'), ['near:elderly:hall', 'far:elderly:majlis']);
  assert.deepEqual(R('دورين، والماستر في الدور العلوي'), ['floor:master:upper']);
  // «مجلس ومكتب فوق»: المجلس لا يصعد بالعطف
  assert.deepEqual(R('5 غرف ومجلس ومكتب فوق'), ['floor:office:upper']);
  assert.deepEqual(R('الصالة تطل على الحوش الخلفي'), ['place:hall:back']);
  assert.deepEqual(R('3 غرف نوم ومجلس وصالة'), []);
});

test('عدم الوجود وعدد الأدوار وقلة الممرات', () => {
  const a = extractRequirements('3 غرف وصالة ومطبخ وبدون غرفة طعام ولا ابغى مجلس', { counts: { ...BASE } });
  assert.equal(a.counts.dining, 0); assert.equal(a.counts.majlis, 0);
  const b = extractRequirements('دورين وما ابغى ممرات طويلة', { counts: {} });
  assert.equal(b.prefs.floors, 2); assert.equal(b.prefs.noCorridors, true);
});

test('الأعداد والمقاسات من الكلام: «الماستر وثلاث غرف للعيال كل وحدة 4×4»', () => {
  const r = extractRequirements('الماستر 5×6 وثلاث غرف للعيال كل وحدة 4×4 ومجلس كبير 6×8 وصالة 6×6', { counts: { bedrooms: 7 } });
  assert.equal(r.counts.bedrooms, 4);
  assert.deepEqual([r.areas.master, r.areas.bedroom, r.areas.majlis, r.areas.hall], [30, 16, 48, 36]);
  const cap = extractRequirements('مجلس يتسع لعشرين شخص', {});
  assert.equal(cap.areas.majlis, 32);
  const sh = extractRequirements('4 غرف نوم والغرف تتشارك حمام ومجلس', { counts: { bedrooms: 4, majlis: 1, baths: 1 } });
  assert.equal(sh.prefs.sharedBaths, true); assert.ok(sh.counts.baths >= 4, 'العدد اللازم للمشاركة لا يبقى 1');
});

test('الجهات المطلقة تتحول بحسب جهة المدخل والمرآة', () => {
  assert.equal(canonSide('s', 'n', false), 'y1'); assert.equal(canonSide('s', 's', false), 'y0');
  assert.equal(canonSide('s', 'e', false), 'x1'); assert.equal(canonSide('s', 'e', true), 'x0');
  assert.equal(canonSide('e', 'w', false), 'y1'); assert.equal(canonSide('n', 'e', false), 'x0');
});

for (const [name, text, land] of [
  ['المطبخ في الخلف بجانب الطعام', 'المطبخ في الخلف بجانب الطعام، 3 غرف ومجلس', LAND()],
  ['المجلس شرقًا والمطبخ غربًا (مدخل جنوبي)', 'المجلس في الجهة الشرقية والمطبخ في الجهة الغربية', LAND()],
  ['المجلس شرقًا (مدخل شمالي)', 'المجلس في الجهة الشرقية', LAND({ entries: ['n'], streets: ['n'] })],
  ['الماستر بعيدة عن المجلس والخادمة قرب المطبخ', 'الماستر بعيدة عن المجلس، وغرفة خادمة قريبة من المطبخ', LAND()],
]) test('تنفيذ فعلي في المخطط: ' + name, async () => {
  const { ledger, req } = await design(text, BASE, land);
  assert.ok(req.rules.length >= 1, 'فُهمت القاعدة');
  for (const r of req.rules) { const x = ledger.find(l => l.id === r.id); assert.ok(x, 'في السجل: ' + r.text); assert.equal(x.ok, true, r.text + ' — ' + x.why); }
});

// أرض ضيقة (12 م) و«المطبخ في الأمام»: بالتحقق الصارم (zone) لا يُحسب مطبخٌ خلف المجلس «في الأمام». الصف الأمامي
// لا يتسع للمجلس والمدخل والمطبخ معًا على هذا العرض؛ فيُختبر صدق السجل: إما منفّذ فعلًا، أو «فشل» بسبب مقيس يسمّي العائق
test('صدق السجل: أرض ضيقة والمطبخ في الأمام', async () => {
  const { ledger, req, out } = await design('المطبخ في الأمام', BASE, LAND({ width: 12 }));
  const x = ledger.find(l => l.id === req.rules[0].id), { rooms, B } = docRooms(out.doc), k = rooms.find(r => r.name === 'المطبخ');
  if (x.ok) assert.ok(k.y0 - B.y0 <= .45 || (k.y0 + k.y1) / 2 - B.y0 <= (B.y1 - B.y0) / 3, 'منفّذ = يلامس الواجهة الأمامية أو في ثلثها');
  else assert.match(x.why, /لا يلامس الواجهة الأمامية/);
});

test('تحقق مستقل: «المجلس في الجهة الشرقية» = مركزه شرق منتصف المبنى في إحداثيات المستند', async () => {
  for (const e of ['s', 'n', 'e']) {
    const { out } = await design('المجلس في الجهة الشرقية', BASE, LAND({ entries: [e], streets: [e], width: e === 'w' ? 30 : 20, length: e === 'w' ? 20 : 30 }));
    const { rooms, B } = docRooms(out.doc), m = rooms.find(r => /مجلس/.test(r.name));
    assert.ok((m.x0 + m.x1) / 2 > (B.x0 + B.x1) / 2, 'مدخل ' + e);
  }
  // مدخل غربي: الشرق خلف المبنى ومجلس الرجال على الواجهة لمدخله المستقل؛ السجل يقول لم يُنفَّذ ويذكر السبب
  const { ledger } = await design('المجلس في الجهة الشرقية', BASE, LAND({ entries: ['w'], streets: ['w'], width: 30, length: 20 }));
  const x = ledger.find(l => l.kind === 'place');
  assert.equal(x.ok, false); assert.match(x.why, /مدخله المستقل/);
});

// أرض ضيقة 15 م مع «الغرف في الخلف» و«الصالة على الحوش الخلفي» معًا: المولّد الأول ينفّذ «الصالة على الحوش»؛ و«الغرف في
// الخلف» بالتحقق الصارم (كل غرفة على الواجهة الخلفية أو في ثلثها الخلفي بلا غرفة سكنية خلفها) لا يتحقق فيه لغرفة جانبية في
// منتصف العمق — فيُختبر صدق السجل في المولّدين: البند غير المنفّذ يظهر «فشل» بسبب مقيس، لا «نُفّذ».
test('صدق السجل: الغرف في الخلف والصالة على الحوش الخلفي (المولّدان)', async () => {
  const text = 'غرف النوم في الخلف والصالة تطل على الحوش الخلفي', land = LAND({ width: 15 });
  const req = extractRequirements(text, { counts: { ...BASE } }); req.counts = { ...BASE, ...req.counts };
  const v1 = await generateInitialDesign({ land, counts: req.counts, requirements: req, idea: text, engine: 'v1' });
  const l1 = verifyRequest(v1.doc, req, { entry: 's' });
  assert.equal(l1.find(l => l.kind === 'place' && l.text.includes('الصالة')).ok, true);
  for (const x of l1) { assert.equal(x.ok, x.status === 'done'); if (!x.ok) assert.ok(x.why.length > 8, x.text); }
  const v2 = await generateInitialDesign({ land, counts: req.counts, requirements: req, idea: text });
  for (const x of verifyRequest(v2.doc, req, { entry: 's' })) { assert.equal(x.ok, x.status === 'done'); if (!x.ok) assert.ok(x.why.length > 8, x.text); }
});

test('دوران من الكلام، والماستر في الأرضي، والمكتب فوق', async () => {
  const { out, ledger } = await design('دورين، 5 غرف نوم والماستر في الدور الأرضي ومكتب في الدور العلوي', { ...BASE, bedrooms: 5, baths: 6 });
  assert.equal(out.doc.levels.length, 2);
  assert.ok(ledger.every(x => x.ok), ledger.filter(x => !x.ok).map(x => x.text + ' ' + x.why).join('؛ '));
});

test('السجل يكشف ما لم يُنفَّذ بسبب مقيس، ولا يدّعي التنفيذ', async () => {
  const { out } = await design('3 غرف ومجلس', BASE);
  const fake = extractRequirements('المطبخ في الخلف', { counts: BASE });
  // نقيس قاعدة لم تُعطَ للمولّد: قد تتحقق صدفة أو لا، والمهم أن الحكم من الهندسة
  const led = verifyRequest(out.doc, fake, { entry: 's' });
  // «في الخلف» (zone): يلامس الواجهة الخلفية، أو مركزه في الثلث الخلفي ولا غرفة سكنية بينه وبينها — حساب مستقل هنا
  const { rooms, B } = docRooms(out.doc), k = rooms.find(r => r.name === 'المطبخ'), d = B.y1 - B.y0, cy = (k.y0 + k.y1) / 2;
  const behind = rooms.filter(o => o.level === k.level && ['bedroom', 'master', 'majlis', 'living', 'dining', 'office'].includes(o.type) && o.y0 >= k.y1 - .3 && Math.min(o.x1, k.x1) - Math.max(o.x0, k.x0) >= Math.min(1, (k.x1 - k.x0) / 2));
  const open = !rooms.some(o => o !== k && o.level === k.level && !['courtyard', 'terrace'].includes(o.type) && Math.min(o.x1, k.x1) - Math.max(o.x0, k.x0) > .3 && o.y0 >= k.y1 - .05);
  const want = B.y1 - k.y1 <= .45 || (open && cy - B.y0 >= d / 2) || (B.y1 - cy <= d / 3 && !behind.length);
  assert.equal(led[0].ok, want, led[0].why);
  if (led[0].ok) assert.ok(cy >= (B.y0 + B.y1) / 2, 'المنفّذ في النصف الخلفي على الأقل');
  const none = verifyRequest(out.doc, extractRequirements('المكتب قرب المدخل', { counts: BASE }), { entry: 's' });
  assert.equal(none.find(x => x.kind === 'near').ok, false); assert.match(none.find(x => x.kind === 'near').why, /لا يوجد/);
});

test('طلب تصميم آخر بنص مكاني: القاعدة الجديدة تُطبَّق وتحل محل المتعارضة', async () => {
  const req = extractRequirements('3 غرف ومجلس والمطبخ في الخلف', { counts: BASE });
  const first = await generateInitialDesign({ land: LAND(), counts: req.counts, requirements: req });
  const s0 = createSession({ land: LAND(), counts: req.counts, requirements: req, result: first });
  const { session } = await redesign(s0, { text: 'المطبخ في الأمام والماستر بعيدة عن المجلس' });
  const rules = session.input.requirements.rules;
  assert.deepEqual(rules.map(r => r.kind + ':' + r.a + ':' + (r.side || r.b)).sort(), ['far:master:majlis', 'place:kitchen:front']);
  const led = ledgerFor(session);
  assert.ok(led.filter(x => x.id.startsWith('R')).every(x => x.ok), led.map(x => x.text + ' ' + x.why).join('؛ '));
  assert.equal(mergeRules([{ kind: 'place', a: 'kitchen', side: 'e' }], [{ kind: 'place', a: 'kitchen', side: 'w' }]).length, 1);
});
