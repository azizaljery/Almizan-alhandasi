// نموذج المتطلبات v2: درجات الطلب (إلزام/تفضيل/منع)، الأبعاد الحقيقية، لا إسقاط صامت (التغطية)، التعارضات قبل التوليد،
// التعديلات (نقل المطبخ، الواجهة الحجرية مع إبقاء التوزيع)، وصدق السجل (لا «نُفّذ» لما لم يُقَس).
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRules, rulePenalty, verifyRequest, LEVEL_WEIGHT, SUBJECTS, docStairs, docRooms } from '../dist/rules.mjs';
import { extractRequirements, normalizeAr, coverage, detectConflicts, withAi } from '../dist/requirements.mjs';
import { AI_SUBJECTS, sanitizeAiRequirements } from '../dist/ai-requirements.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign, ledgerFor } from '../dist/design-session.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const RL = t => extractRules(normalizeAr(t)).rules.map(r => [r.kind, r.a, r.b || r.side || r.floor, r.level].join(':'));
const LAND = (o = {}) => ({ width: 20, length: 30, streets: ['s'], entries: ['s'], floors: 1, ...o });
const BASE = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };

// ------------------------------------------------------------------ 1) درجات الطلب
for (const [text, want] of [
  // إلزام: لهجة سعودية وفصحى وإنجليزية، والافتراضي إلزام
  ['لازم المطبخ يكون في الخلف', 'place:kitchen:back:must'],
  ['ضروري المجلس على الشارع', 'place:majlis:front:must'],
  ['ابي الماستر في الدور العلوي', 'floor:master:upper:must'],
  ['ابغى غرفة الخادمة قريبة من المطبخ', 'near:maid:kitchen:must'],
  ['يجب أن يكون المطبخ بجانب الطعام', 'adjacent:kitchen:dining:must'],
  ['The kitchen must be at the back', 'place:kitchen:back:must'],
  ['المطبخ في الخلف', 'place:kitchen:back:must'],
  // تفضيل
  ['يفضل المطبخ يكون في الخلف', 'place:kitchen:back:prefer'],
  ['يفضّل المجلس على الشارع', 'place:majlis:front:prefer'],
  ['لو أمكن الماستر بعيدة عن المجلس', 'far:master:majlis:prefer'],
  ['ياليت غرف العيال جنب بعض', 'cluster:kids::prefer'],
  ['المطبخ في الخلف إذا أمكن', 'place:kitchen:back:prefer'],
  ['مو شرط بس المكتب قرب المدخل', 'near:office:entrance:prefer'],
  ['I prefer the dining room next to the kitchen', 'adjacent:dining:kitchen:prefer'],
  ['ideally the master bedroom upstairs', 'floor:master:upper:prefer'],
  // منع (النفي)
  ['لا تخلي المجلس جنب المطبخ', 'apart:majlis:kitchen:forbid'],
  ['ما ابي غرف النوم على الشارع', 'place:bedrooms:front:forbid'],
  ['ممنوع غرف النوم على الشارع', 'place:bedrooms:front:forbid'],
  ['الماستر ما تكون قريبة من المجلس', 'far:master:majlis:forbid'],
  ['المطبخ ما يكون في الخلف', 'place:kitchen:front:forbid'],
  ["don't put the majlis next to the kitchen", 'apart:majlis:kitchen:forbid'],
  ['the majlis should not be next to the kitchen', 'far:majlis:kitchen:forbid'],
]) test('درجة الطلب: ' + text, () => { assert.ok(RL(text).includes(want), JSON.stringify(RL(text))); });

test('الدرجة لكل قاعدة من نافذتها: «ابي المطبخ في الخلف ويفضل المجلس على الشارع»', () => {
  assert.deepEqual(RL('ابي المطبخ في الخلف ويفضل المجلس على الشارع').sort(), ['place:kitchen:back:must', 'place:majlis:front:prefer']);
  assert.deepEqual(RL('المطبخ في الخلف لو أمكن والمجلس على الشارع').sort(), ['place:kitchen:back:prefer', 'place:majlis:front:must']);
  const r = extractRules(normalizeAr('المطبخ في الخلف')).rules[0];
  assert.equal(r.levelCue, 'default'); assert.equal(extractRules(normalizeAr('لازم المطبخ في الخلف')).rules[0].levelCue, 'explicit');
});

test('وزن العقوبة بالدرجة: التفضيل أخف، والإلزام والمنع كما كانا (توافق رجعي)', () => {
  const placed = [{ block: { id: 'kitchen1', kind: 'kitchen' }, r: { x0: 0, y0: 0, x1: 4, y1: 4 } }];
  const one = level => rulePenalty(placed, [], 20, 30, [{ kind: 'place', a: 'kitchen', side: 'back', mode: 'half', ...(level ? { level } : {}) }], 's').base;
  assert.ok(one() > 0); assert.equal(one('must'), one()); assert.equal(one('forbid'), one());
  assert.ok(Math.abs(one('prefer') - one() * LEVEL_WEIGHT.prefer) < 1e-9);
  assert.ok(LEVEL_WEIGHT.prefer < LEVEL_WEIGHT.must);
});

// ------------------------------------------------------------------ 2) الأبعاد الحقيقية
for (const [text, key, w, l] of [
  ['المطبخ 4×5', 'kitchen', 4, 5], ['المطبخ 4 في 5', 'kitchen', 4, 5], ['المطبخ ٤×٥', 'kitchen', 4, 5], ['المطبخ 4x5 م', 'kitchen', 4, 5],
  ['المطبخ 4 م × 5 م', 'kitchen', 4, 5], ['المطبخ عرض 4 وطول 5', 'kitchen', 4, 5], ['المطبخ بطول 5 وعرض 4', 'kitchen', 4, 5],
  ['مجلس 6×5', 'majlis', 5, 6], ['الماستر 5*6', 'master', 5, 6], ['kitchen 4 by 5', 'kitchen', 4, 5], ['صالة ٦ في ٧', 'hall', 6, 7],
]) test('أبعاد: ' + text, () => {
  const r = extractRequirements(text, {});
  assert.equal(r.dims[key]?.w, w, JSON.stringify(r.dims)); assert.equal(r.dims[key]?.l, l); assert.ok(r.dims[key].tol > 0);
  assert.equal(r.areas[key], w * l, 'المساحة باقية للمستهلكين القدامى');
});
test('سماحية الأبعاد: «بالضبط» أضيق و«تقريبًا» أوسع، ولا تنتقل من عبارة مجاورة', () => {
  assert.equal(extractRequirements('المطبخ 4×5 بالضبط', {}).dims.kitchen.tol, .1);
  assert.equal(extractRequirements('المطبخ تقريبا 4×5', {}).dims.kitchen.tol, .5);
  assert.equal(extractRequirements('ثلاث غرف نوم بالضبط، المطبخ 4×5', {}).dims.kitchen.tol, .3);
});
test('حرف x في الكلمات الإنجليزية لا يتحول إلى ×', () => {
  assert.equal(normalizeAr('next to'), 'next to'); assert.equal(normalizeAr('4x5'), '4×5'); assert.equal(normalizeAr('4 X 5'), '4×5');
});

// ------------------------------------------------------------------ 3) لا إسقاط صامت
test('الدرج فراغ معروف في الفهم المحلي ومفردات Claude', () => {
  assert.ok(SUBJECTS.some(s => s.id === 'stairs')); assert.ok(AI_SUBJECTS.includes('stairs'));
  assert.ok(RL('الماستر بعيدة عن الدرج').includes('far:master:stairs:must'));
  assert.ok(RL('غرف النوم بعيدة عن السلم').includes('far:bedrooms:stairs:must'));
  assert.ok(RL('المكتب قريب من الدرج الداخلي').includes('near:office:stairs:must'));
  assert.ok(RL('the master bedroom far from the stairs').includes('far:master:stairs:must'));
});
test('C7: «بعيدة عن الدرج» لا تختفي، و«المجالس والطعام والمطبخ تحت» كلها في الأرضي', () => {
  const C = CASES.find(c => c.id === 'C7'), r = extractRequirements(C.text, { counts: C.counts });
  assert.ok(r.rules.some(x => x.kind === 'far' && x.a === 'master' && x.b === 'stairs'));
  for (const a of ['majlis', 'dining', 'kitchen']) assert.ok(r.rules.some(x => x.kind === 'floor' && x.a === a && x.floor === 'ground'), a);
  // القائمة النكرة بعدد قبلها تبقى برنامجًا (لا يُعطف عليها الموضع)
  assert.deepEqual(RL('3 غرف ومجلس وصالة والمطبخ في الخلف'), ['place:kitchen:back:must']);
});
test('علاقة بلا طرف معروف تُعرض «غير مفهومة» باقتباسها بدل أن تسقط', () => {
  const r = extractRequirements('غرفة لأمي، قريبة من الصالة', {});
  assert.ok(r.unclear.some(u => /قريبة من الصالة/.test(u)), JSON.stringify(r.unclear));
  const s = extractRequirements('الماستر في الدور العلوي بعيدة عن الحديقة', {});
  assert.ok(s.rules.some(x => x.kind === 'floor' && x.a === 'master'));
  assert.ok(s.unclear.some(u => /بعيدة عن الحديقة/.test(u)), JSON.stringify(s.unclear));
  const cov = coverage('الماستر في الدور العلوي بعيدة عن الحديقة');
  assert.ok(cov.clauses.some(c => c.fate === 'understood') && cov.clauses.some(c => c.fate === 'unclear' && c.kind === 'orphan'));
  assert.equal(cov.dropped.length, 0);
});
test('التغطية: لا عبارة ساقطة في نصوص حالات القبول العشر (والتعديلات)', () => {
  const FATES = new Set(['understood', 'unsupported', 'unclear']);
  for (const C of CASES) for (const text of [C.text, C.edit].filter(Boolean)) {
    const req = extractRequirements(text, { counts: C.counts || {} }), cov = coverage(text, req);
    assert.equal(cov.dropped.length, 0, C.id + ': ' + JSON.stringify(cov.dropped));
    const pieces = text.split(/[،,.؛;\n!?؟]+/).map(x => x.trim()).filter(x => x.replace(/[^\p{L}\p{N}]/gu, ''));
    for (const p of pieces) assert.ok(cov.clauses.some(c => p.includes(c.quote.replace(/^و/, '')) || c.quote.includes(p.replace(/^و/, ''))), `${C.id}: «${p}» بلا مصير`);
    for (const c of cov.clauses) { assert.ok(FATES.has(c.fate), c.fate); assert.ok(c.quote.length > 0); }
    for (const c of cov.clauses.filter(c => c.fate === 'unclear')) assert.ok(req.unclear.some(u => u.includes(c.quote) || c.quote.includes(u)), C.id + ' unclear مفقود: ' + c.quote);
  }
});
test('حالات قبل التطوير كانت «غير مفهومة» خطأً: C6 «بالضبط» و C10 «منها ماستر» و C5 شكل الأرض', () => {
  const by = id => { const C = CASES.find(c => c.id === id); return extractRequirements(C.text, { counts: C.counts }); };
  assert.deepEqual(by('C6').unclear, []); assert.ok(by('C6').understood.includes('3 غرف نوم (بالضبط)'));
  assert.deepEqual(by('C10').unclear, []); assert.ok(by('C10').understood.includes('4 غرف نوم'));
  const c5 = by('C5'); assert.deepEqual(c5.unclear, []); assert.equal(c5.site.shape, 'trapezoid'); assert.deepEqual([c5.site.front, c5.site.back, c5.site.depth], [18, 24, 30]);
  assert.ok(c5.unsupported.some(u => /شكل الأرض/.test(u)));
});
test('ما كان يُفهم سابقًا يبقى غير مفهوم حين لا يحمل طلبًا معروفًا', () => {
  assert.deepEqual(extractRequirements('خل التصميم عصري ومريح', {}).understood, []);
  assert.deepEqual(extractRequirements('الدرج يكون عريض', {}).rules, []);
  assert.ok(coverage('السلام عليكم، ابي بيت').clauses.every(c => c.fate === 'understood' && c.kind === 'filler'));
});
test('دمج Claude: عبارة علاقة ساقطة محليًا لا تختفي إلا إن غطّتها قاعدة من Claude', () => {
  const local = extractRequirements('الماستر في الدور العلوي بعيدة عن الحديقة', {});
  assert.ok(withAi(local, sanitizeAiRequirements({ rules: [], unclear: [] })).unclear.some(u => /الحديقة/.test(u)));
  const covered = withAi(local, sanitizeAiRequirements({ rules: [{ kind: 'place', a: 'master', side: 'front', mode: 'half', quote: 'بعيدة عن الحديقة' }], unclear: [] }));
  assert.ok(!covered.unclear.some(u => /الحديقة/.test(u)));
  assert.equal(sanitizeAiRequirements({ rules: [{ kind: 'near', a: 'maid', b: 'kitchen', level: 'prefer', quote: 'x' }], unclear: [] }).rules[0].level, 'prefer');
});

// ------------------------------------------------------------------ 4) التعارضات قبل التوليد
const types = (text, land = {}, counts = {}) => detectConflicts(extractRequirements(text, { counts }), land).map(c => c.type);
test('تعارض: نفس الفراغ في الأمام والخلف', () => {
  const c = detectConflicts(extractRequirements('المطبخ في الأمام، والمطبخ في الخلف', {}), {});
  assert.equal(c[0].type, 'place-opposite'); assert.match(c[0].question_ar, /وين تبيه/); assert.equal(c[0].quotes.length, 2);
});
test('تعارض: جنب وبعيد لنفس الزوج', () => {
  assert.ok(types('المجلس جنب المطبخ، والمجلس بعيد عن المطبخ').includes('relation-contradiction'));
  assert.ok(types('المجلس جنب المطبخ، ولا تخلي المجلس جنب المطبخ').includes('relation-contradiction'));
});
test('تعارض: دور واحد مع طلبات تحتاج دورين (C7 على أرض بدور واحد)', () => {
  assert.ok(types('دور واحد، والماستر في الدور العلوي').includes('single-floor-two-floor-features'));
  const C = CASES.find(c => c.id === 'C7');
  assert.ok(types(C.text, LAND({ floors: 1 }), C.counts).includes('floors-mismatch'));
  assert.ok(!types(C.text, LAND({ floors: 2 }), C.counts).includes('floors-mismatch'));
  assert.ok(types('الماستر بعيدة عن الدرج', LAND({ floors: 1 })).includes('single-floor-two-floor-features'));
});
test('تعارض: غرف النوم فوق وغرفة الوالدة في الأرضي (هل هي منها؟) — C7', () => {
  const C = CASES.find(c => c.id === 'C7'), c = detectConflicts(extractRequirements(C.text, { counts: C.counts }), LAND({ floors: 2 }));
  const g = c.find(x => x.type === 'floor-group-member'); assert.ok(g); assert.match(g.question_ar, /من ضمن/);
});
test('تعارض: نفس الفراغ في الأرضي والعلوي، و«بدون مجلس» مع مكان المجلس', () => {
  assert.ok(types('المكتب في الدور الأرضي، والمكتب فوق').includes('floor-both'));
  assert.ok(types('بدون مجلس، والمجلس على الشارع').includes('absent-but-placed'));
});
test('تعارض: المساحات أكبر من الأرض، والبُعد أكبر من الأرض', () => {
  assert.ok(types('المجلس 10×14 والصالة 10×14 والمطبخ 8×10', { width: 12, length: 15, floors: 1 }).includes('area-exceeds-land'));
  assert.ok(types('المجلس 10×14', { width: 9, length: 30, floors: 1 }).includes('dims-exceed-land'));
  assert.deepEqual(types('المجلس 5×6', LAND()), []);
});
test('تعارض: العدد في الكلام غير العدد في النموذج', () => {
  const c = detectConflicts(extractRequirements('ثلاث غرف نوم بالضبط', { counts: { bedrooms: 4 } }), {});
  assert.equal(c[0].type, 'count-mismatch'); assert.match(c[0].question_ar, /كم غرفة نوم/);
  assert.deepEqual(detectConflicts(extractRequirements('ثلاث غرف نوم', { counts: { bedrooms: 3 } }), {}), []);
});
test('لا تعارضات وهمية في حالات القبول عدا ما يستحق السؤال', () => {
  for (const C of CASES) {
    const c = detectConflicts(extractRequirements(C.text, { counts: C.counts }), { floors: 1, ...C.land });
    if (C.id === 'C7') assert.deepEqual(c.map(x => x.type), ['floor-group-member']);
    else assert.deepEqual(c.map(x => x.type), [], C.id + ': ' + JSON.stringify(c));
  }
});
test('الجلسة: تعارض عند الإنشاء يُرفق بسؤال، وتعارض في الملاحظة يرد بسؤال بلا رمي وبلا تصميم جديد', async () => {
  const req = extractRequirements('3 غرف ومجلس والمطبخ في الخلف', { counts: BASE });
  const first = await generateInitialDesign({ land: LAND(), counts: req.counts, requirements: req });
  const s0 = createSession({ land: LAND(), counts: req.counts, requirements: req, result: first });
  assert.deepEqual(s0.conflicts, []); assert.equal(s0.reply, null);
  const { session, reply } = await redesign(s0, { text: 'المجلس جنب المطبخ، والمجلس بعيد عن المطبخ' });
  assert.equal(reply.conflicts[0].type, 'relation-contradiction'); assert.ok(reply.questions[0].length > 10);
  assert.equal(session.designs.length, 1, 'لا تصميم جديد قبل الجواب'); assert.deepEqual(session.input.requirements.rules.map(r => r.kind), ['place']);
  const sC = createSession({ land: LAND(), counts: req.counts, requirements: extractRequirements('دور واحد، والماستر في الدور العلوي', { counts: BASE }), result: first });
  assert.equal(sC.conflicts[0].type, 'single-floor-two-floor-features'); assert.ok(sC.reply.questions.length);
});

// ------------------------------------------------------------------ 5) التعديلات C8 و C9
test('C8: «انقل المطبخ بجوار الطعام وخل المطبخ في الخلف» — قاعدتان باقتباسهما، على التوزيع نفسه', async () => {
  const C = CASES.find(c => c.id === 'C8'), land = { floors: 1, ...C.land };
  const e = extractRequirements(C.edit, { counts: {} });
  assert.deepEqual(e.rules.map(r => [r.kind, r.a, r.b || r.side, r.quote]), [['adjacent', 'kitchen', 'dining', 'المطبخ بجوار الطعام'], ['place', 'kitchen', 'back', 'المطبخ في الخلف']]);
  const req = extractRequirements(C.text, { counts: C.counts }), first = await generateInitialDesign({ land, counts: req.counts, requirements: req });
  const { session, reply } = await redesign(createSession({ land, counts: req.counts, requirements: req, result: first }), { text: C.edit });
  assert.equal(session.input.requirements.counts.bedrooms, 4, 'عدد الغرف لا يتغير');
  // النمط نفسه إن حقق الطلب، وإلا أقرب نمط يحققه — والرد يقول ذلك صراحة
  if (session.designs[1].pat !== session.designs[0].pat) { assert.ok(reply.patternChanged, 'الرد يذكر تغيّر التوزيع'); assert.equal(reply.patternChanged.from, session.designs[0].pat); }
  assert.deepEqual(reply.done.sort(), ['«المطبخ» بجوار «الطعام»', '«المطبخ» في الخلف'].sort(), JSON.stringify(reply.failed));
  // غرف البرنامج كلها باقية بعد التعديل
  const prog = d => docRooms(JSON.parse(d)).rooms.filter(r => ['bedroom', 'master', 'majlis', 'living', 'dining', 'kitchen'].includes(r.type)).map(r => r.name).sort();
  assert.deepEqual(prog(session.designs[1].doc), prog(session.designs[0].doc));
});
test('C9: «احتفظ بهذا التوزيع وغيّر الواجهة إلى حجر» — facade {material:stone} وkeepLayout، والمخطط نفسه، والبند «بانتظار العرض» لا «نُفّذ»', async () => {
  const C = CASES.find(c => c.id === 'C9'), land = { floors: 1, ...C.land };
  const e = extractRequirements(C.edit, { counts: {} });
  assert.equal(e.keepLayout, true); assert.equal(e.tweaks.facade.material, 'stone'); assert.equal(e.tweaks.facade.keepLayout, true);
  assert.deepEqual(e.unsupported, []); assert.deepEqual(e.unclear, []);
  const req = extractRequirements(C.text, { counts: C.counts }), first = await generateInitialDesign({ land, counts: req.counts, requirements: req });
  const s0 = createSession({ land, counts: req.counts, requirements: req, result: first });
  const { session, reply } = await redesign(s0, { text: C.edit });
  assert.equal(session.designs[1].doc, session.designs[0].doc, 'المخطط نفسه حرفيًا'); assert.ok(reply.reused && reply.unchanged);
  assert.deepEqual(reply.done, []); assert.equal(reply.pending.length, 1); assert.match(reply.pending[0].text, /حجر/);
  const led = ledgerFor(session), f = led.find(x => x.id === 'F-facade');
  assert.equal(f.status, 'pending-render'); assert.equal(f.ok, false);
  // معامل عددي لاحق لا يتلف بنية الواجهة
  const { session: s2 } = await redesign(session, { text: 'المجلس أكبر' });
  assert.equal(s2.input.requirements.tweaks.facade.material, 'stone'); assert.equal(s2.input.requirements.tweaks.majlisScale, 1.25);
});
for (const [text, mat] of [['الواجهة رخام', 'marble'], ['ابي واجهة حجرية', 'stone'], ['خل الواجهه خشب وزجاج', 'wood'], ['stone facade please', 'stone'], ['facade in brick', 'brick']]) test('الواجهة: ' + text, () => {
  assert.equal(extractRequirements(text, {}).tweaks.facade?.material, mat);
});
test('طراز الواجهة وحده (نجدي) يُحمل، و«تصميم عصري» بلا ذكر للواجهة لا يُفهم واجهة', () => {
  assert.equal(extractRequirements('الواجهة نجدية', {}).tweaks.facade?.style, 'najdi');
  assert.equal(extractRequirements('خل التصميم عصري', {}).tweaks.facade, undefined);
});
test('ملاحظة تذكر «الماستر» لا تُنزل عدد غرف النوم إلى واحدة', async () => {
  const req = extractRequirements('4 غرف ومجلس', { counts: { ...BASE, bedrooms: 4, baths: 5 } });
  const first = await generateInitialDesign({ land: LAND(), counts: req.counts, requirements: req });
  const { session } = await redesign(createSession({ land: LAND(), counts: req.counts, requirements: req, result: first }), { text: 'الماستر بعيدة عن المجلس' });
  assert.equal(session.input.requirements.counts.bedrooms, 4);
});

// ------------------------------------------------------------------ 6) صدق السجل
test('السجل: مدخل النساء وشكل الأرض «لم يُتحقق» بسبب، لا «نُفّذ»؛ وكل بند له حالة', async () => {
  const C1 = CASES.find(c => c.id === 'C1'), land = { floors: 1, ...C1.land };
  const req = extractRequirements(C1.text, { counts: C1.counts }); req.counts = { ...req.counts, ...C1.counts };
  const out = await generateInitialDesign({ land, counts: req.counts, requirements: req });
  const led = verifyRequest(out.doc, req, { entry: 's' });
  for (const x of led) { assert.ok(['done', 'failed', 'unverified', 'pending-render'].includes(x.status), x.id); assert.equal(x.ok, x.status === 'done', x.id); }
  const fam = led.find(x => x.id === 'P-fam'); assert.ok(fam, 'بند مدخل العائلة موجود');
  if (fam.status !== 'done') { assert.equal(fam.status, 'unverified'); assert.ok(fam.why.length > 10); }
  const C5 = CASES.find(c => c.id === 'C5'), r5 = extractRequirements(C5.text, { counts: C5.counts });
  const o5 = await generateInitialDesign({ land: { floors: 1, ...C5.land }, counts: r5.counts, requirements: r5 });
  const s = verifyRequest(o5.doc, r5, { entry: 's' }).find(x => x.id === 'S-shape');
  // المولّد الثاني يمثّل المضلع فعلًا: البند يُقاس من مضلع الأرض في المستند (الواجهة والخلف والعمق واحتواء الجدران)
  assert.equal(s.status, 'done', s.why); assert.equal(s.ok, true); assert.match(s.why, /الواجهة 18 م، الخلف 24 م، العمق 30 م/);
  // ومستند بأرض مستطيلة لا يُعد منفّذًا أبدًا
  const v1 = await generateInitialDesign({ land: { floors: 1, ...C5.land }, counts: r5.counts, requirements: r5, engine: 'v1' });
  const s1 = verifyRequest(v1.doc, r5, { entry: 's' }).find(x => x.id === 'S-shape');
  assert.equal(s1.ok, false); assert.match(s1.why, /مستطيل/);
});
test('السجل: الأبعاد مقيسة من المستطيل الصافي، والدرج مقيس من سلالم المستند', async () => {
  const C6 = CASES.find(c => c.id === 'C6'), req = extractRequirements(C6.text, { counts: C6.counts });
  const out = await generateInitialDesign({ land: { floors: 1, ...C6.land }, counts: req.counts, requirements: req });
  const d = verifyRequest(out.doc, req, { entry: 's' }).filter(x => x.kind === 'dims');
  assert.equal(d.length, 2); for (const x of d) { assert.ok(['done', 'failed'].includes(x.status)); assert.match(x.why, /×/); }
  const C7 = CASES.find(c => c.id === 'C7'), r7 = extractRequirements(C7.text, { counts: C7.counts }), land7 = { floors: 2, ...C7.land };
  const o7 = await generateInitialDesign({ land: land7, counts: r7.counts, requirements: r7 });
  assert.ok(docStairs(o7.doc).length >= 2, 'الدرج في دوره وفي الدور الذي يصعد إليه');
  const st = verifyRequest(o7.doc, r7, { entry: 's' }).find(x => x.kind === 'far' && /الدرج/.test(x.text));
  assert.ok(st && ['done', 'failed'].includes(st.status), JSON.stringify(st)); assert.equal(st.level, 'must');
  if (st.status === 'failed') assert.match(st.why, /الدرج/);
});
