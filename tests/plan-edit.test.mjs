// محرك التعديل الموضعي (dist/plan-edit.mjs): كل تعديل على المستند المعروض نفسه، وكل غرفة لم تُطلب تبقى كما هي مقيسًا.
// المستندات من أدلة r4b (مخططات حقيقية من المولّد، محفوظة في المستودع) فالاختبار حتمي ولا يولّد شيئًا.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDoc, serialize } from '../dist/draw/doc.mjs';
import { extractRequirements, detectConflicts } from '../dist/requirements.mjs';
import { parseEdit, applyEdits, inspect, compareDocs, KEEP } from '../dist/plan-edit.mjs';
import { createSession, redesign, ledgerFor, currentDoc } from '../dist/design-session.mjs';
import { evaluateGates } from '../dist/plan-review.mjs';
import { doorInfo, verifyRules } from '../dist/rules.mjs';

const DOC = (s, n) => parseDoc(readFileSync(new URL(`../evidence/dialog/r4b/sessions/${s}/doc-${n}.json`, import.meta.url), 'utf8'));
const REQ = { counts: { bedrooms: 4, majlis: 1, kitchens: 1, dining: 1 }, entry: 's' };
const edit = (doc, text, opts = {}) => { const more = extractRequirements(text, { counts: {} }); const p = parseEdit(text, doc, { more, ...opts }); return { p, r: applyEdits(doc, p, { req: { ...REQ, ...(opts.req || {}) }, history: opts.history || [] }) }; };
const geom = d => JSON.stringify([d.walls, d.openings, d.labels]);
/** غرف خارج النطاق تغيّرت فوق الحدين (مساحة > 5٪ أو إزاحة > 0.5 م) أو أزيلت/أضيفت. */
const unrequested = (a, b, scopeNames) => {
  const A = inspect(a), B = inspect(b), out = [];
  for (const [id, x] of A.rooms) { if (scopeNames.some(n => x.name === n)) continue; const y = B.rooms.get(id); if (!y) { out.push(x.name + ' أزيلت'); continue; } const pct = 100 * Math.abs(y.area - x.area) / x.area, sh = Math.hypot(y.cx - x.cx, y.cy - x.cy); if (pct > KEEP.areaPct || sh > KEEP.shift) out.push(`${x.name} ${pct.toFixed(1)}٪ ${sh.toFixed(2)}م`); }
  return out;
};
const newGateFails = (a, b) => { const before = new Set(evaluateGates(a, REQ).filter(g => !g.ok).map(g => g.id)); return evaluateGates(b, REQ).filter(g => !g.ok && !before.has(g.id)).map(g => g.id); };

test('الواجهة حجر: حقل في المستند والهندسة نفسها حرفيًا، والمجسّم يقرأ المادة', () => {
  const d = DOC('S1', 4), { p, r } = edit(d, 'غيّر الواجهة حجر');
  assert.deepEqual(p.intents.map(i => i.op), ['facade']);
  assert.equal(r.status, 'local'); assert.equal(geom(r.doc), geom(d), 'لا جدار ولا فتحة ولا تسمية تغيّرت');
  assert.equal(r.doc.finish.facade.base, 'stone'); assert.equal(r.doc.finish.facade.material, 'stone');
  assert.ok(r.geometryIdentical);
  // طراز بلا خامة في المجسّم: محفوظ ومعلَن «بانتظار العرض»
  const s = edit(d, 'خل الواجهة نجدي').r;
  assert.equal(s.doc.finish.facade.style, 'najdi'); assert.equal(s.pending.length, 1); assert.equal(geom(s.doc), geom(d));
});

test('«المجلس أصغر»: أصغر فعلًا (الاتجاه مقيس)، ولا غرفة أخرى تتغير، ولا بوابة جديدة راسبة', () => {
  const d = DOC('S4', 2), { r } = edit(d, 'المجلس أصغر');
  assert.equal(r.status, 'local'); assert.ok(r.results[0].ok, r.results[0].why_ar);
  const a = inspect(d), b = inspect(r.doc), id = [...a.rooms.values()].find(x => x.name === 'المجلس').id;
  assert.ok(b.rooms.get(id).area / a.rooms.get(id).area <= .9, 'تصغير 10٪ على الأقل');
  assert.deepEqual(unrequested(d, r.doc, ['المجلس']), []);
  assert.deepEqual(newGateFails(d, r.doc), []);
});

test('«الصالة أوسع»: أكبر بـ10٪ على الأقل دون تغيير غرفة أخرى (إزاحة جدار خارجي داخل الارتداد)', () => {
  const d = DOC('S4', 3), { r } = edit(d, 'خل كل شي زي ما هو بس الصالة أوسع');
  assert.ok(r.results[0].ok, r.results[0].why_ar);
  const a = [...inspect(d).rooms.values()].find(x => x.name === 'الصالة'), b = inspect(r.doc).rooms.get(a.id);
  assert.ok(b.area / a.area >= 1.1, `${a.area} ← ${b.area}`);
  assert.deepEqual(unrequested(d, r.doc, ['الصالة']), []);
  assert.deepEqual(newGateFails(d, r.doc), []);
});

test('مقاس صريح «المطبخ ٤×٥» يتحقق مقيسًا، وما تغيّر غيره معلن في الرد', () => {
  const d = DOC('S4', 1), { r } = edit(d, 'المطبخ ٤×٥');
  assert.equal(r.status, 'local');
  const k = [...inspect(r.doc).rooms.values()].find(x => x.name === 'المطبخ'), w = Math.min(k.net.x1 - k.net.x0, k.net.y1 - k.net.y0), l = Math.max(k.net.x1 - k.net.x0, k.net.y1 - k.net.y0);
  if (r.results[0].ok && !r.results[0].already) { assert.ok(Math.abs(w - 4) <= .35 && Math.abs(l - 5) <= .35, `${w}×${l}`); }
  // كل تغيير خارج النطاق مذكور في قائمة التغيّرات المعلنة
  for (const u of unrequested(d, r.doc, ['المطبخ'])) assert.ok(r.changed.some(c => u.startsWith(c.name)), u);
});

test('حذف المكتب: يختفي فعلًا، ولا تتغير غرفة أخرى ولا مدخل', () => {
  const d = DOC('S1', 3), { p, r } = edit(d, 'احذف المكتب');
  assert.equal(p.intents[0].op, 'delete');
  assert.ok(r.results[0].ok, r.results[0].why_ar);
  assert.ok(![...inspect(r.doc).rooms.values()].some(x => x.name === 'المكتب'));
  assert.deepEqual(unrequested(d, r.doc, ['المكتب']), []);
  assert.equal(r.doc.openings.filter(o => o.entry).length, d.openings.filter(o => o.entry).length, 'المداخل كما هي');
  assert.deepEqual(newGateFails(d, r.doc), []);
});

test('إضافة غرفة غسيل وغرفة سائق بحمام: امتداد داخل الارتداد، لا مدخل يُحذف، والسائق بباب خارجي لا ملاصق لجناح النوم', () => {
  const d = DOC('S5', 0);
  const g = edit(d, 'أبي غرفة غسيل').r;
  assert.ok(g.results[0].ok, g.results[0].why_ar);
  assert.ok([...inspect(g.doc).rooms.values()].some(x => x.name === 'غرفة الغسيل'));
  assert.deepEqual(unrequested(d, g.doc, ['غرفة الغسيل']), []);
  const s = edit(d, 'أبي غرفة سائق بحمام').r;
  assert.ok(s.results[0].ok, s.results[0].why_ar);
  const rooms = [...inspect(s.doc).rooms.values()];
  assert.ok(rooms.some(x => x.name === 'غرفة السائق') && rooms.some(x => x.name === 'حمام السائق'));
  assert.ok(doorInfo(s.doc).extDoors('غرفة السائق') > 0, 'باب خارجي للسائق');
  assert.ok(!doorInfo(s.doc).neighbors('غرفة السائق').some(n => /غرفة نوم|الرئيسية|الجناح/.test(n)));
  for (const x of [g, s]) { assert.ok(x.doc.openings.filter(o => o.entry).length >= d.openings.filter(o => o.entry).length); assert.deepEqual(newGateFails(d, x.doc), []); }
});

test('فتح المطبخ على الطعام ثم «رجّعه مقفل» (ضمير يعود على المطبخ): الجدران نفسها، والفتحة فقط تتغير', () => {
  const d = DOC('S3', 2), a = edit(d, 'المطبخ يكون مفتوح على الطعام').r;
  assert.ok(a.results[0].ok, a.results[0].why_ar);
  assert.equal(JSON.stringify(a.doc.walls), JSON.stringify(d.walls));
  const { p, r } = edit(a.doc, 'لا لا رجّعه مقفل', { lastSubject: 'kitchen' });
  assert.deepEqual(p.intents.map(i => [i.op, i.open]), [['kitchenOpen', false]]);
  assert.ok(r.results[0].ok);
  const K = [...inspect(r.doc).rooms.values()].find(x => x.type === 'kitchen'), D = [...inspect(r.doc).rooms.values()].find(x => x.type === 'dining');
  assert.ok(K.links.filter(l => l.to === D.id).every(l => l.kind !== 'arch'));
});

test('غرفة غير محددة («غرفة البنت») أو غير موجودة («غرفة نوم 9»): سؤال، ولا تغيير', () => {
  const d = DOC('S1', 5);
  for (const t of ['خل كل شي مثل ما هو بس كبّر غرفة البنت', 'كبّر غرفة نوم ٩ لتصير ٤×٥']) {
    const { p, r } = edit(d, t);
    assert.ok(p.questions.length, t); assert.equal(r.status, 'clarify'); assert.match(p.questions[0].question_ar, /غرفة نوم/);
  }
});

test('أفعال التعديل: رجّع مثل أول، زيد غرفة، غرفة نوم ٢ بمقاس، الصالة أكبر شوي', () => {
  const d = DOC('S4', 0);
  const it = t => parseEdit(t, d, { more: extractRequirements(t, { counts: {} }) }).intents;
  assert.deepEqual(it('رجّع المطبخ مثل أول').map(i => [i.op, i.to]), [['revertRoom', 'first']]);
  assert.deepEqual(it('زيد غرفة نوم وحدة').map(i => [i.op, i.n - i.from]), [['bedCount', 1]]);
  const r2 = it('ودي غرفة نوم ٢ تكون ٤×٥ والباقي لا تلمسها');
  assert.equal(r2[0].op, 'resize'); assert.equal(r2[0].name, 'غرفة نوم 2'); assert.deepEqual(r2[0].target, { w: 4, l: 5 });
  const h = it('الصالة أكبر شوي'); assert.equal(h[0].op, 'resize'); assert.ok(h[0].factor > 1 && h[0].factor < 1.2);
  assert.ok(it('المجلس أصغر')[0].factor < 1, '«أصغر» تصغير');
  assert.ok(it('صغّر المجلس')[0].factor < 1, '«صغّر» تصغير');
  assert.deepEqual(it('رجّع الماستر مكانها الأول').map(i => i.op), ['revertRoom']);
});

test('«والباقي لا تلمسها»: إن احتاج المقاس تغيير غرفة أخرى يُسأل العميل ولا يُنفَّذ بصمت', () => {
  const d = DOC('S4', 4), { r } = edit(d, 'ودي غرفة نوم ٢ تكون ٤×٥ والباقي لا تلمسها');
  if (r.status === 'clarify') assert.match(r.questions[0].question_ar, /ألا ألمس/);
  else assert.deepEqual(unrequested(d, r.doc, ['غرفة نوم 2', 'حمام غرفة 2']), [], 'نُفّذ دون لمس غيرها');
});

test('المحلل: تصحيح العدد (آخر عدد بعد «لا لا خلها»)، وتكرار ذكر المجلس والمطبخ لا يزيدهما', () => {
  const a = extractRequirements('أبي خمس غرف نوم... لا لا خلها أربع غرف نوم بس، وماستر', { counts: { bedrooms: 9 } });
  assert.equal(a.counts.bedrooms, 4); assert.deepEqual(a.countCorrection.bedrooms, { from: 5, to: 4 });
  assert.ok(!detectConflicts(a, { width: 20, length: 30 }).some(c => c.type === 'count-mismatch'), 'عدد النموذج الذي جمع العددين ليس تعارضًا');
  assert.equal(extractRequirements('بدل خمس غرف خلها ثلاث غرف', {}).counts.bedrooms, 3);
  assert.equal(extractRequirements('مجلس رجال كبير، ومجلس نساء صغير، والمجلس على الشارع، والمجلس له مدخل', { counts: { majlis: 4 } }).counts.majlis, 2);
  assert.equal(extractRequirements('Majlis للرجال with separate entrance، و no women majlis needed', { counts: { majlis: 3 } }).counts.majlis, 1);
  assert.equal(extractRequirements('المطبخ مفتوح على الطعام، والمطبخ يكون في الخلف', { counts: { kitchens: 2 } }).counts.kitchens, 1);
  assert.equal(extractRequirements('مطبخ داخلي ومطبخ تحضيري خارجي', { counts: { kitchens: 2 } }).counts.kitchens, 2);
  assert.equal(extractRequirements('المجلس أصغر', {}).tweaks.majlisScale, .8);
  assert.equal(extractRequirements('صغّر المجلس شوي', {}).tweaks.majlisScale, .8);
  assert.equal(extractRequirements('كبّر المجلس ٦×٧', {}).tweaks.majlisScale, undefined, 'المقاس الصريح يكفي');
});

test('الجلسة: التعديل الموضعي أولًا (الواجهة ثم الحذف)، والرد يعدّد ما نُفّذ وما تغيّر، والسجل يقيس الواجهة من المستند', async () => {
  const d0 = DOC('S1', 3), land = { width: 20, length: 30, streets: ['s'], entries: ['s'], floors: 1 };
  const req = extractRequirements('4 غرف نوم منها ماستر، ومجلس رجال، وصالة، ومطبخ وطعام، ومكتب', { counts: { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 } });
  const s0 = createSession({ land, counts: req.counts, requirements: req, result: { doc: d0, pat: 'test:p', summary: '', notes: [] } });
  const noGen = async () => { throw Error('لا إعادة توليد في تعديل موضعي'); };
  const a = await redesign(s0, { text: 'غيّر الواجهة حجر' }, { generate: noGen });
  assert.equal(a.reply.mode, 'local'); assert.ok(a.reply.geometryIdentical); assert.deepEqual(a.reply.unrequested, []);
  assert.equal(geom(currentDoc(a.session)), geom(d0));
  assert.equal(ledgerFor(a.session).find(x => x.id === 'F-facade').status, 'done');
  const b = await redesign(a.session, { text: 'احذف المكتب' }, { generate: noGen });
  assert.equal(b.reply.mode, 'local'); assert.deepEqual(b.reply.failed, []); assert.ok(b.reply.done.length);
  assert.ok(!inspect(currentDoc(b.session)).rooms.has([...inspect(d0).rooms.values()].find(x => x.name === 'المكتب').id) || ![...inspect(currentDoc(b.session)).rooms.values()].some(x => x.name === 'المكتب'));
  assert.deepEqual(b.reply.unrequested, []); assert.match(b.reply.summary_ar, /بقية الغرف/);
  assert.equal(currentDoc(b.session).finish.facade.base, 'stone', 'تعديل الواجهة السابق باقٍ');
  // التراجع: «ارجع للتصميم السابق» يعيد المستند السابق حرفيًا
  const c = await redesign(b.session, { text: 'ارجع للتصميم السابق' }, { generate: noGen });
  assert.equal(c.reply.mode, 'restore'); assert.equal(serialize(currentDoc(c.session)), b.session.designs[1].doc);
});

test('سؤال الإذن: مقاس يحتاج تصغير غرفة لم يذكرها العميل يُسأل أولًا، و«نعم» تنفّذه معلنًا، و«لا» تبقيه حرفيًا', async () => {
  const d0 = DOC('S4', 1), land = { width: 22, length: 30, streets: ['s'], entries: ['s'], floors: 1 };
  const req = extractRequirements('4 غرف نوم منها ماستر ومجلس وصالة ومطبخ وطعام وغرفة غسيل', { counts: { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 } });
  const s0 = createSession({ land, counts: req.counts, requirements: req, result: { doc: d0, pat: 'test:p', summary: '', notes: [] } });
  const noGen = async () => { throw Error('لا إعادة توليد'); };
  const a = await redesign(s0, { text: 'المطبخ ٤×٥' }, { generate: noGen });
  const ask = a.reply.conflicts.find(c => c.type === 'needs-consent');
  if (!ask) { assert.deepEqual(a.reply.unrequested.filter(c => !['corridor', 'entrance', 'storage', 'laundry'].includes(c.type)), [], 'لا مانح من الغرف الرئيسية بلا إذن'); return; }
  assert.match(ask.question_ar, /أنفّذه/); assert.equal(currentDoc(a.session).walls.length, d0.walls.length); assert.equal(serialize(currentDoc(a.session)), a.session.designs[0].doc);
  const no = await redesign(a.session, { text: 'لا' }, { generate: noGen });
  assert.equal(no.reply.mode, 'declined'); assert.equal(no.session.designs.length, 1);
  const yes = await redesign(a.session, { text: 'نعم' }, { generate: noGen });
  assert.equal(yes.reply.mode, 'local'); assert.ok(yes.reply.done.length, JSON.stringify(yes.reply.failed));
  const k = [...inspect(currentDoc(yes.session)).rooms.values()].find(x => x.name === 'المطبخ'), w = Math.min(k.net.x1 - k.net.x0, k.net.y1 - k.net.y0), l = Math.max(k.net.x1 - k.net.x0, k.net.y1 - k.net.y0);
  assert.ok(Math.abs(w - 4) <= .35 && Math.abs(l - 5) <= .35, `${w}×${l}`);
  assert.ok(yes.reply.unrequested.length >= 1, 'المانح معلن في الرد'); assert.match(yes.reply.summary_ar, /تغيّر أيضًا/);
});

// ---- الجولة السابعة
const FIX = n => parseDoc(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));
test('(r7) «أضف مصلى قريب من المجلس» بجوار امتداد سابق (غرفة الغسيل): مصلى مدمج ملاصق للمجلس يُدخل إليه منه، بلا شق ولا جدار مكرر', () => {
  const d = FIX('r7-s5-after-laundry'), more = extractRequirements('أضف مصلى قريب من المجلس', { counts: {} });
  const p = parseEdit('أضف مصلى قريب من المجلس', d, { more }), r = applyEdits(d, p, { req: { counts: { bedrooms: 3, majlis: 1, kitchens: 1, dining: 1 }, entry: 's' } });
  assert.equal(r.status, 'local', JSON.stringify(r.results.map(x => x.why_ar)));
  const I = inspect(r.doc), pr = [...I.rooms.values()].find(x => x.name === 'المصلى'), mj = [...I.rooms.values()].find(x => x.name === 'المجلس');
  assert.ok(pr && pr.area >= 5.5, `المصلى ${pr?.area}`);
  assert.ok(pr.links.some(l => l.to === mj.id), 'باب المصلى إلى المجلس (مسار الضيف لا يعبر القسم العائلي)');
  assert.deepEqual(unrequested(d, r.doc, ['المصلى']), []);
  const key = w => [w.a.x, w.a.y, w.b.x, w.b.y].map(v => v.toFixed(2)).sort().join(',');
  const keys = r.doc.walls.map(key); assert.equal(new Set(keys).size, keys.length, 'لا جدار مكرر');
  assert.match(r.results[0].how_ar, /مقاس مدمج/);
});
test('(r7) التعديل الموضعي لا يكسر بندًا سابقًا متحققًا: «المكتب ورى» لا يُنفَّذ بتبادل يبعد الخادمة عن المطبخ', () => {
  const d = FIX('r7-maid-kitchen-back'), text = 'خل المكتب ورى';
  const more = extractRequirements('ابي مكتب في الخلف', { counts: {} }); more.extras = { office: {} };
  const rules = [{ id: 'R1', kind: 'near', a: 'maid', b: 'kitchen', text: '«غرفة الخادمة» قرب «المطبخ»', level: 'must' }, { id: 'R2', kind: 'place', a: 'kitchen', side: 'back', mode: 'half', text: '«المطبخ» في الخلف', level: 'must' }];
  // بإذن العميل («نعم») أيضًا: بلا هذا الحارس كان التبادل يُنفَّذ («تبادلت المكتب وغرفة الخادمة») فتبعد الخادمة عن المطبخ
  const p = parseEdit(text, d, { more }), r = applyEdits(d, p, { req: { counts: { bedrooms: 3, majlis: 1, kitchens: 1, dining: 1 }, rules, entry: 's', consent: true } });
  const after = r.status === 'local' ? r.doc : d;
  const v = verifyRules(after, rules, { entry: 's' });
  assert.ok(v.every(x => x.ok), v.map(x => x.why).join(' | '));
  assert.ok(!r.results.some(x => /تبادلت/.test(x.how_ar || '') && /الخادمة/.test(x.how_ar || '')));
  // ولا سؤال إذن يعرض تبادلًا مع غرفة الخادمة
  for (const x of r.results) assert.ok(!/غرفة الخادمة/.test(x.ask || ''), x.ask);
});
