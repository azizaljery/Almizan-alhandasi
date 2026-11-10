// أرض ضيقة وشكل L: إن اتسعت الأرض للشكل تُبنى تصاميمه سليمة وموصولة، وإلا يُعلن الفشل مع الحد الأدنى المحسوب بالأرقام،
// والمقاس الذي تذكره الملاحظة يُبنى فعلًا بشكل L.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, checkDoc } from '../dist/villa-layout.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';

const L = (width, length, floors = 1) => ({ width, length, floors, streets: ['s'], entries: ['s'] });
const C = (o = {}) => ({ bedrooms: 0, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0, ...o });
const PROGRAM = C({ bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 });
const shapeL = (w, l) => generateVillaDesigns({ land: L(w, l), counts: PROGRAM, requirements: { prefs: { shape: 'L' } } });
const MIN_RE = /مسطحًا قابلًا للبناء (\d+(?:\.\d+)?) × (\d+(?:\.\d+)?) م على الأقل، أي أرضًا لا تقل عن (\d+(?:\.\d+)?) × (\d+(?:\.\d+)?) م/;

/** كل بديل سليم (checkDoc ونظام الفراغات) مهما كان الشكل؛ ثم: إما كلها L، أو الملاحظة تذكر الحد الأدنى بالأرقام. */
function assertLOrNumericMinimum(out) {
  for (const d of out.designs) {
    const c = checkDoc(d.doc);
    assert.ok(c.ok, c.problems.join(' | '));
    assert.ok(!reviewDoc(d.doc).some(i => i.code === 'UNREACHABLE_ROOM'), 'كل فراغ موصول');
  }
  if (out.designs.every(d => d.mode === 'L')) return null;
  const note = out.designs[0].notes.find(n => n.includes('تعذّر توزيع'));
  assert.ok(note, 'إعلان التعذّر في الملاحظة');
  const m = note.match(MIN_RE);
  assert.ok(m, 'الملاحظة تذكر الحد الأدنى بالأرقام: ' + note);
  return { buildable: [Number(m[1]), Number(m[2])], land: [Number(m[3]), Number(m[4])] };
}

test('18x30 وطلب L: تصاميم L سليمة وموصولة، أو إعلان بالحد الأدنى الرقمي', () => {
  const out = shapeL(18, 30);
  const min = assertLOrNumericMinimum(out);
  assert.ok(out.designs.length >= 1);
  if (!min) for (const d of out.designs) assert.ok(d.notes.some(n => n.includes('شكل L')), 'ملاحظة الشكل');
});

test('15x25 وطلب L: تصاميم L سليمة، أو إعلان بالحد الأدنى الرقمي', () => {
  const out = shapeL(15, 25);
  assert.ok(out.designs.length >= 1);
  assertLOrNumericMinimum(out);
});

test('16x28 وطلب L: تصاميم L سليمة، أو إعلان بالحد الأدنى الرقمي', () => {
  const out = shapeL(16, 28);
  assert.ok(out.designs.length >= 1);
  assertLOrNumericMinimum(out);
});

test('الحد الأدنى المذكور في الملاحظة يُبنى فعلًا بشكل L', () => {
  const out = shapeL(15, 25);
  const min = assertLOrNumericMinimum(out);
  if (!min) return; // الأرض الحالية تتسع للشكل؛ لا حد يُختبر
  const again = shapeL(...min.land);
  assert.ok(again.designs.length >= 1 && again.designs.every(d => d.mode === 'L'), 'L عند الأرض المذكورة ' + min.land.join(' × '));
  for (const d of again.designs) { const c = checkDoc(d.doc); assert.ok(c.ok, c.problems.join(' | ')); }
});

// ------------------------------------------------------------------------------------------ الموقع يصمّم دائمًا (سلّم الاتساع)
// شكوى المالك: أرض 12.5 × 30 بمتطلبات محددة كانت تُرفض. القاعدة: يُصمَّم دائمًا، ثم بيان صادق بما استُبعد وصُغّر ودُمج، وقرارات للعميل.
import { generateInitialDesign, SharaSession, diagnoseFit } from '../dist/home-flow.mjs';
import { createSession, summarizeDoc, ledgerFor, fitFor, currentDoc } from '../dist/design-session.mjs';
import { applyFitDecision, fixProposals } from '../dist/design-fixes.mjs';
import { ladderSteps, applySteps, fitStatement, applyDecision } from '../dist/fit-ladder.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';

const PROGRAMS = [
  'ابي فيلا دور واحد 3 غرف نوم ومجلس رجال وصالة ومطبخ',
  'ابي فيلا دورين 4 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ وغرفة طعام',
  'فيلا دورين 5 غرف نوم ومجلس رجال 6×8 ومجلس نساء وصالة ومطبخ وغرفة سائق وغرفة خادمة ومستودع',
  'فيلا دورين 6 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ ومصعد ومسبح وحديقة',
  'دور واحد 5 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ وغرفة خادمة ومستودع',
  'ابي 4 غرف نوم ومجلس 6×8 وصالة 5×6 ومطبخ 4×5 وغرفة سائق',
  'دور واحد 6 غرف نوم ومجلسين وصالة ومطبخ وغرفة طعام وغرفة خادمة وغرفة سائق ومستودع ومسبح',
];
const LANDS = {
  '12.5×30 شارع': { length: 30, width: 12.5, streets: ['s'], entries: ['s'] },
  '12.5×30 شارعان': { length: 30, width: 12.5, streets: ['s', 'e'], entries: ['s'] },
  '30×12.5 شارع': { length: 12.5, width: 30, streets: ['s'], entries: ['s'] },
  '30×12.5 شارعان': { length: 12.5, width: 30, streets: ['s', 'e'], entries: ['s'] },
  '10×25': { length: 25, width: 10, streets: ['s'], entries: ['s'] },
  '15×20': { length: 20, width: 15, streets: ['s'], entries: ['s'] },
  '12×20': { length: 20, width: 12, streets: ['s'], entries: ['s'] },
};
function ask(land, text) { const s = new SharaSession({ land }); s.start(); s.answer('mode', 'free'); s.answer('free', text); return s; }
const gen = (land, s) => generateInitialDesign({ land, rooms: s.rooms(), discovery: s.discovery(), idea: s.idea, counts: s.counts, requirements: s.requirements });
const EXTRA_NAME = { maid: 'غرفة الخادمة', driver: 'غرفة السائق', office: 'المكتب', prayer: 'المصلى', laundry: 'غرفة الغسيل', storage: 'المخزن', guestRoom: 'غرفة الضيوف' };

/** صدق البيان: يُقاس المستند باستقلال (summarizeDoc) ويُقارن بكل بند في البيان، وبالعكس: كل نقص عن الطلب مذكور في البيان وفي سجل التنفيذ. */
function assertHonest(doc, req, land, fit, tag) {
  const st = fitStatement(doc, req, { land, fit }), S = summarizeDoc(doc), names = S.rooms.map(r => r.name);
  const beds = S.rooms.filter(r => ['bedroom', 'master'].includes(r.type) && r.name !== 'غرفة الضيوف').length, maj = S.rooms.filter(r => r.type === 'majlis').length;
  for (const i of st.items) {
    assert.ok(i.text && typeof i.why === 'string', `${tag}: لكل بند نص وسبب (${i.id})`);
    if (i.key === 'bedrooms') { assert.equal(i.to, beds, `${tag}: عدد غرف النوم المذكور يطابق المخطط`); assert.ok(i.to < i.from); }
    else if (i.key === 'majlis_w') assert.equal(maj, 1, `${tag}: قيل مجلس واحد`);
    else if (i.key === 'majlis') assert.equal(maj, 0, `${tag}: قيل استُبعد المجلس`);
    else if (i.key === 'dining') assert.ok(!S.rooms.some(r => r.type === 'dining' || /طعام/.test(r.name)), `${tag}: قيل لا غرفة طعام`);
    else if (EXTRA_NAME[i.key]) assert.ok(!names.includes(EXTRA_NAME[i.key]), `${tag}: قيل استُبعد ${EXTRA_NAME[i.key]} وهو غير موجود فعلًا`);
    else if (i.key === 'floors') assert.equal(doc.levels.length, i.to, `${tag}: عدد الأدوار المذكور`);
    else if (i.key === 'baths') assert.equal(S.rooms.filter(r => r.type === 'bath').length, i.to, `${tag}: عدد دورات المياه المذكور`);
    if (i.kind === 'shrink') {
      const room = S.rooms.find(r => r.name === i.room); assert.ok(room, `${tag}: الفراغ المصغَّر «${i.room}» موجود`);
      assert.ok(Math.abs(room.area - i.to) <= .06, `${tag}: مساحة «${i.room}» المذكورة ${i.to} والمقيسة ${room.area}`);
      assert.ok(i.to < i.from, `${tag}: صُغّر فعلًا (${i.to} < ${i.from})`);
    }
  }
  // العكس: لا نقص بلا إعلان
  const c = req.counts || {}, has = k => st.items.some(i => i.key === k);
  if (beds < c.bedrooms) assert.ok(has('bedrooms'), `${tag}: نقص غرف النوم مُعلن`);
  if (c.majlis >= 1 && maj < Math.min(2, c.majlis)) assert.ok(has('majlis') || has('majlis_w'), `${tag}: نقص المجالس مُعلن`);
  for (const [k, n] of Object.entries(EXTRA_NAME)) if (req.extras?.[k] && !names.includes(n)) assert.ok(has(k), `${tag}: غياب ${n} مُعلن`);
  const want = req.prefs?.floors ?? land.floors ?? 1; if (doc.levels.length !== want) assert.ok(has('floors'), `${tag}: اختلاف الأدوار مُعلن`);
  // سجل التنفيذ على الطلب الأصلي لا يدّعي ما لم يتحقق
  const ledger = ledgerFor({ input: { requirements: req, land }, designs: [{}], current: 0 }, doc), bad = id => ledger.some(x => x.id === id && !x.ok);
  if (beds !== c.bedrooms && c.bedrooms > 0) assert.ok(bad('C-bed'), `${tag}: سجل التنفيذ يقول إن عدد غرف النوم لم يتحقق`);
  for (const k of ['maid', 'driver', 'office', 'prayer', 'laundry', 'storage']) if (req.extras?.[k] && !names.includes(EXTRA_NAME[k])) assert.ok(bad('X-' + k), `${tag}: سجل التنفيذ يقول إن ${EXTRA_NAME[k]} لم تتحقق`);
  if (c.majlis >= 1 && maj === 0) assert.ok(bad('C-majlis1'), `${tag}: سجل التنفيذ يقول لا مجلس`);
  if (c.dining >= 1 && has('dining')) assert.ok(bad('C-dining1'), `${tag}: سجل التنفيذ يقول لا غرفة طعام`);
  if (req.prefs?.floors && doc.levels.length !== req.prefs.floors) assert.ok(bad('P-floors'), `${tag}: سجل التنفيذ يقول إن عدد الأدوار لم يتحقق`);
  return st;
}

for (const [ln, land] of Object.entries(LANDS)) {
  test(`الأرض ${ln}: كل برنامج يُصمَّم (لا رفض) وبيان ما تغيّر يطابق المخطط`, async () => {
    let reduced = 0;
    for (const [pi, text] of PROGRAMS.entries()) {
      const s = ask(land, text), out = await gen(land, s), tag = `${ln} / برنامج ${pi + 1}`;
      for (const d of [out, ...(out.alternatives || [])]) { const c = checkDoc(d.doc); assert.ok(c.ok, tag + ': ' + c.problems.join(' | ')); }
      assert.ok(!out.notes.some(n => /المحرك السابق/.test(n)), tag + ': المولّد المهني لا المحرك السابق');
      const st = assertHonest(out.doc, s.requirements, land, out.fit || null, tag);
      for (const a of out.alternatives || []) assertHonest(a.doc, s.requirements, land, a.fit || out.fit || null, tag + ' (بديل)');
      if (out.fit?.applied?.length) { reduced++; assert.ok(st.items.some(i => i.byLadder), tag + ': ما خفّفه السلّم ظاهر في البيان'); assert.ok(st.facts && st.facts.W > 0 && st.items.filter(i => i.byLadder && i.key !== 'floors').every(i => i.why.includes(String(st.facts.W))), tag + ': السبب يذكر عرض البناء الصافي بالأرقام'); }
    }
    if (/^(12\.5×30 شارعان|30×12\.5|10×25|12×20)/.test(ln)) assert.ok(reduced >= 1, 'برنامج واحد على الأقل خُفّف على هذه الأرض (وإلا فالاختبار لا يختبر السلّم)');
  });
}

test('الحالة المعتادة لا تتغير: 20×30 بلا سلّم ولا بيان اتساع', async () => {
  const land = { length: 30, width: 20, streets: ['s'], entries: ['s'] }, s = ask(land, PROGRAMS[0]), out = await gen(land, s);
  assert.equal(out.fit, undefined);
  assert.equal(fitStatement(out.doc, s.requirements, { land, fit: null }).items.filter(i => i.byLadder).length, 0);
});

test('strict يبقي السلوك الدقيق (رفض بلا تخفيف) للتشخيص؛ وبدونه يُصمَّم', async () => {
  const land = { length: 25, width: 10, streets: ['s'], entries: ['s'] }, s = ask(land, PROGRAMS[4]);
  const args = { land, rooms: s.rooms(), discovery: s.discovery(), idea: s.idea, counts: s.counts, requirements: s.requirements };
  await assert.rejects(() => generateInitialDesign({ ...args, strict: true }));
  const out = await generateInitialDesign(args);
  assert.ok(checkDoc(out.doc).ok && out.fit.applied.length > 0);
  assert.deepEqual(s.requirements.counts, args.requirements.counts, 'طلب العميل الأصلي لا يُعدَّل');
  const d = await diagnoseFit({ land, counts: s.counts, discovery: s.discovery(), maxGrow: 1 });
  assert.ok(Array.isArray(d.options));
});

test('ترتيب السلّم: ما لم يطلبه العميل أولًا، ثم المقاسات، ثم الكماليات، ثم الأساسيات؛ والمثبَّت لا يُمسّ', () => {
  const land = LANDS['12.5×30 شارع'], s = ask(land, PROGRAMS[2]), steps = ladderSteps(s.requirements), at = id => steps.findIndex(x => x.id === id);
  assert.equal(steps[0].id, 'shrink:soft');
  assert.ok(at('dining') > 0 && at('dining') < at('size:majlis'), 'الطعام افتراض عرفي لم يُطلب: قبل مقاس المجلس المطلوب');
  assert.ok(at('size:majlis') < at('storage') && at('storage') < at('driver') && at('driver') < at('maid'), 'المقاس ثم الخدمة بترتيبها');
  assert.ok(at('maid') < at('majlis_w') && at('majlis_w') < at('bed:5') && at('bed:5') < at('bed:4') && at('bed:3') < at('majlis') && at('majlis') < at('bed:2'), 'الأساسيات آخرًا');
  assert.equal(steps.find(x => x.id === 'dining').tier, 'unasked'); assert.equal(steps.find(x => x.id === 'driver').tier, 'luxury');
  const pinned = ladderSteps({ ...s.requirements, fit: { keep: ['driver', 'bedrooms'] } });
  assert.ok(!pinned.some(x => x.key === 'driver' || x.key === 'bedrooms'));
  const r = applySteps(s.requirements, ['dining', 'driver', 'bed:5']);
  assert.equal(r.counts.dining, 0); assert.equal(r.extras.driver, undefined); assert.equal(r.counts.bedrooms, 4);
  assert.equal(s.requirements.counts.bedrooms, 5, 'الأصل لا يتغير');
});

test('قرار العميل: «أعِد» يعيد البند ويخفّف غيره، و«أضف دورًا» يعيد التصميم بدورين، والبيان يتحدّث', async () => {
  const land = LANDS['12.5×30 شارعان'], s = ask(land, PROGRAMS[4]), out = await gen(land, s);
  let ses = createSession({ land, counts: s.counts, requirements: s.requirements, discovery: s.discovery(), idea: s.idea, result: out });
  const st0 = fitFor(ses); assert.ok(st0.items.length > 0);
  const maid = st0.items.find(i => i.key === 'maid'); assert.ok(maid && maid.actions.some(a => a.id === 'keep:maid'), 'زر إعادة غرفة الخادمة');
  // ما خفّفه السلّم لا يُعرض ثانيةً في مقترحات الإصلاح بزر لا علاج له
  assert.ok(!fixProposals(ses).some(p => ['L:C-bed', 'L:X-maid'].includes(p.id)));
  const r1 = await applyFitDecision(ses, 'keep:maid');
  if (r1.changed) {
    ses = r1.session; const doc = currentDoc(ses), st = fitFor(ses);
    assert.ok(checkDoc(doc).ok);
    assert.ok(summarizeDoc(doc).rooms.some(r => r.name === 'غرفة الخادمة'), 'غرفة الخادمة عادت فعلًا');
    assert.ok(!st.items.some(i => i.key === 'maid'));
    assert.ok(ses.designs[ses.current].feedback.reply.back.includes('غرفة الخادمة'));
    assertHonest(doc, ses.input.requirements, land, ses.designs[ses.current].fit, 'بعد إعادة الخادمة');
  } else assert.ok(r1.reply.failed.length && r1.reply.failed[0].why, 'إن تعذّر القرار يُذكر السبب ولا يتغير التصميم');
  const before = ses.designs.length, r2 = await applyFitDecision(ses, 'floors:2');
  assert.ok(r2.changed, 'دور ثانٍ'); ses = r2.session;
  assert.equal(ses.designs.length, before + 1); assert.equal(currentDoc(ses).levels.length, 2); assert.ok(checkDoc(currentDoc(ses)).ok);
  assert.equal(ses.input.requirements.prefs.floors, 2);
  assertHonest(currentDoc(ses), ses.input.requirements, land, ses.designs[ses.current].fit, 'بعد إضافة دور');
  const bedsNow = summarizeDoc(currentDoc(ses)).specs.bedrooms; assert.ok(bedsNow >= summarizeDoc(parseDoc(ses.designs[0].doc)).specs.bedrooms, 'الدور الثاني لا ينقص غرف النوم');
  const r3 = await applyFitDecision(ses, 'keep:nothing'); assert.equal(r3.changed, false);
});

test('قرار «استبعد» و«صغّر» يعدّلان الطلب بقرار العميل', () => {
  const land = LANDS['12.5×30 شارع'], s = ask(land, PROGRAMS[2]);
  const a = applyDecision(s.requirements, 'drop:driver'); assert.equal(a.req.extras.driver, undefined); assert.ok(s.requirements.extras.driver, 'الأصل لا يتغير');
  const b = applyDecision(s.requirements, 'shrink:majlis'); assert.equal(b.req.areas.majlis, Math.round(48 * .85));
  const c = applyDecision(s.requirements, 'keep:maid'); assert.deepEqual(c.req.fit.keep, ['maid']);
  assert.throws(() => applyDecision(s.requirements, 'zap:x'), /غير معروف/);
});

test('أرض دون حدّ المولّد: خطأ صريح بالأرقام لا تصميم مزعوم', async () => {
  const land = { length: 8, width: 8, streets: ['s'], entries: ['s'] }, s = ask(land, PROGRAMS[0]);
  await assert.rejects(() => gen(land, s), e => e.code === 'FIT_IMPOSSIBLE' && /حدّ في المولّد/.test(e.message) && /\d/.test(e.message));
});
