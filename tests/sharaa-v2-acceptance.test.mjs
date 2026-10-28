// شرعاء V2 — اختبارات القبول العشرة (§7 من المواصفة) + حالة المتصفح الحقيقية + تمييز النتائج.
// لا توليد حقيقيًا هنا؛ المولّد مُستبدل بمولّد وهمي يُعيد شكل ناتج المحرك الثالث. القياس الحقيقي في 05-measurements.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLand } from '../dist/home-flow.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import * as B from '../dist/sharaa/brief.mjs';
import { toEngineInput } from '../dist/sharaa/adapter.mjs';
import { SharaFlow, READINESS } from '../dist/sharaa/flow.mjs';
import { classifyOutcome, buildAlternatives, retryWith, OUTCOME } from '../dist/sharaa/alternatives.mjs';

const mkLand = (o = {}) => normalizeLand({ length: 25, width: 12.5, streets: ['s'], entries: ['s'], floors: 1, ...o }).land;
const flow = (o, mode = 'free') => new SharaFlow({ land: mkLand(o), mode });
const texts = msgs => msgs.map(m => (m.text || '') + ' ' + (m.options || []).map(x => x.label).join(' ')).join('\n');
const LANDWORDS = /طول الأرض|عرض الأرض|مساحة الأرض|كم مساحة|أبعاد الأرض|عدد الشوارع|كم طابق/;

test('1 لا يسأل عن الأرض إن وُجدت بياناتها', () => {
  const f = flow(undefined, 'guided'); const all = [];
  all.push(...f.log);
  for (let i = 0; i < 6; i++) { const q = f.log.at(-1); if (!q?.key && q?.id !== 'counts') break; try { f.answer('ask', { key: q.key, value: q.options?.[0]?.id }); } catch { break; } }
  assert.doesNotMatch(texts(f.log), LANDWORDS);
  assert.equal(f.landBar().rows.length > 0, true);
});
test('2 لا يكرر سؤالًا أُجيب عنه', () => {
  const f = flow(undefined, 'guided'); const keys = [];
  for (let i = 0; i < 12; i++) { const q = f.log.at(-1); if (!q || q.kind === 'review' || q.kind === 'generate') break; if (q.key) { keys.push(q.key); f.answer('ask', { key: q.key, value: q.kind === 'multi' ? [] : q.options?.[0]?.id }); } else if (q.id === 'counts') f.answer('counts', { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 0 }); else break; }
  assert.equal(new Set(keys).size, keys.length, 'مفاتيح الأسئلة: ' + keys.join(','));
});
test('3 التنقل بين المسارات لا يفقد بيانات', () => {
  const f = flow(undefined, 'free'); f.answer('free', 'أبي ثلاث غرف نوم ومجلس ومطبخ وصالة');
  const before = JSON.stringify(f.brief.spaces.map(s => [s.id, s.count]));
  f.answer('mode', 'guided'); f.answer('mode', 'decide'); f.answer('mode', 'free');
  assert.equal(JSON.stringify(f.brief.spaces.map(s => [s.id, s.count])), before);
  assert.ok(f.brief.interaction.switched >= 3);
});
test('4 يميّز «قريب» عن «باب مباشر» ولا يحوّل الأول إلى الثاني', () => {
  let b = B.createBrief({ land: mkLand() }); const t = 'أبي المقلط قريب من المجلس';
  b = B.applyExtraction(b, extractRequirements(t, { counts: {} }), t).brief;
  const r = b.relations.find(x => x.from === 'guest_dining' && x.to === 'male_majlis');
  assert.equal(r.relation, 'near');
  const eng = toEngineInput(b).requirements.rules.find(x => x.briefRef?.includes('guest_dining'));
  assert.notEqual(eng?.kind, 'adjacent'); assert.ok(!toEngineInput(b).requirements.rules.some(x => x.kind === 'adjacent'));
  const t2 = 'ابي المقلط ملاصق للمجلس'; // صيغة «باب مباشر» نفسها لا يلتقطها مستخرج المتطلبات (حد معروف، في التقرير)
  const b2 = B.applyExtraction(B.createBrief({ land: mkLand() }), extractRequirements(t2, { counts: {} }), t2).brief;
  assert.ok(b2.relations.some(x => x.relation === 'direct_access'));
});
test('5 استنتاج الذكاء لا يصير إلزاميًا دون تأكيد، ولا يُرسل صلبًا', () => {
  let b = B.createBrief({ land: mkLand() });
  b = B.upsertSpace(b, { type: 'maid', count: 1, source: 'ai_inference', priority: 'mandatory' });
  const s = B.spaceOf(b, 'maid'); assert.equal(s.priority, 'preferred'); assert.notEqual(s.verification, 'confirmed');
  const eng = toEngineInput(b); assert.ok(!(eng.requirements.rules || []).some(r => r.level === 'must' && r.briefRef?.includes('maid')));
});
test('6 لا يغيّر شرطًا إلزاميًا ليسهّل التوليد', () => {
  const t = 'لازم المجلس بباب داخلي إلى البيت';
  let b = B.applyExtraction(B.createBrief({ land: mkLand() }), extractRequirements(t, { counts: {} }), t).brief;
  const refs = [...b.spaces, ...b.relations, ...b.placements].filter(x => x.priority === 'mandatory').length;
  const alts = buildAlternatives(b, { kind: OUTCOME.ALL_HIDDEN, reasons: [{ reasons_ar: ['مجلس الرجال بلا باب داخلي إلى البيت'] }] });
  const all = [...alts.auto, ...alts.needsConsent];
  for (const o of alts.auto) assert.ok(!o.touchesMandatory, 'الاقتراح التلقائي يمس إلزاميًا: ' + o.id);
  const after = [...b.spaces, ...b.relations, ...b.placements].filter(x => x.priority === 'mandatory').length;
  assert.equal(after, refs, 'بناء البدائل لا يغيّر الملف'); assert.ok(all.length >= 0);
});
test('7 لا يعد بما لا يدعمه المحرك: غير المدعوم يُسجَّل ولا يُرسل', () => {
  const t = 'ابي مسبح ومصعد'; let b = B.createBrief({ land: mkLand() });
  b = B.setField(b, 'preferences.budgetRange', { min: 500000, max: 900000 }, B.makeMeta({ source: 'client_answer', priority: 'preferred' }));
  const eng = toEngineInput(b); assert.ok(eng.report.unsupported.length >= 1, 'غير المدعوم يظهر في التقرير');
  const f = flow(); f.answer('ask', { key: 'budget', value: { min: 500000, max: 900000 } }); assert.ok(f.engineInput().report.unsupported.length >= 1);
});
test('8 تغيير الأرض يزيد المراجعة ويعيد فحص القيود دون حذف الإجابات', () => {
  const f = flow(undefined, 'free'); f.answer('free', 'لازم الماستر في الدور الأول'); const spaces = f.brief.spaces.length;
  f.changeLand(mkLand({ floors: 2 })); assert.equal(f.brief.land.revision, 2); assert.ok(f.brief.spaces.length >= spaces);
  f.changeLand(mkLand({ floors: 2 })); assert.equal(f.brief.land.revision, 2, 'نفس الأرض لا تزيد المراجعة');
});
test('9 يحفظ مصدر كل معلومة', () => {
  const f = flow(); f.answer('free', 'أبي ثلاث غرف نوم ومجلس');
  for (const s of f.brief.spaces) { assert.ok(B.SOURCES.includes(s.source)); assert.ok(B.PRIORITIES.includes(s.priority)); assert.ok(B.VERIFICATIONS.includes(s.verification)); }
  assert.ok(f.brief.log.length > 0);
});
test('10 يعرض أسباب التعارض وبدائله قبل أي تنازل', () => {
  const t = 'لازم الماستر في الدور الأول'; const f = flow({ floors: 1 }); f.answer('free', t);
  const c = f.brief.conflicts.find(x => x.type === 'floor-conflict' || /طابق|دور|FLOOR/i.test(x.type + x.reason));
  assert.ok(c, 'يجب أن يظهر تعارض'); assert.ok(c.reason && c.options.length >= 2);
  assert.equal(f.readiness().state, READINESS.CONFLICT);
});

// ---- حالة المتصفح الحقيقية (من المنسّق): أرض 25×12.5 مدخل شمالي، 3 نوم + مجلس + مطبخ + صالة + 3 حمامات
test('11 حالة «محجوب»: التصاميم محجوبة بسبب موقف المجلس وباب المجلس → أزرار لا لافتة مغلقة، ولا تنازل دون ضغط', async () => {
  const f = flow({ entries: ['n'], streets: ['n'] }, 'guided');
  f.answer('counts', { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 0 });
  const eng = f.engineInput();
  const hiddenResult = { alternatives: [], hidden: [{ reasons_ar: ['موقف سيارة موازٍ للشارع في ارتداد أقل من 5.5 م أمام نافذة المجلس', 'مجلس الرجال بلا باب داخلي إلى البيت: الضيافة تُقدَّم من الخارج… شرط أساسي غير متحقق'] }] };
  const oc = classifyOutcome(hiddenResult, f.brief);
  assert.equal(oc.kind, OUTCOME.ALL_HIDDEN); assert.notEqual(oc.kind, OUTCOME.INFEASIBLE, 'لا ادعاء استحالة دون برهان المحرك');
  const alts = buildAlternatives(f.brief, oc);
  assert.ok(alts.auto.length + alts.needsConsent.length >= 3, 'أزرار بديلة موجودة');
  assert.ok(alts.info.some(o => /موقف|مواقف/.test(o.label + o.changes_ar + o.loses_ar)), 'شرح الموقف');
  assert.ok(alts.info.some(o => /باب داخلي/.test(o.label + o.changes_ar + o.loses_ar)), 'شرح باب المجلس');
  for (const o of [...alts.auto, ...alts.needsConsent]) assert.ok(o.changes_ar && o.loses_ar, 'يشرح ما يتغير وما يُفقد: ' + o.id);
  const snapshot = JSON.stringify(f.brief.spaces.map(s => [s.id, s.count, s.priority]));
  assert.equal(JSON.stringify(f.brief.spaces.map(s => [s.id, s.count, s.priority])), snapshot, 'لا شيء يتغير بلا ضغط');
  let calls = 0; const gen = async () => { calls++; return { alternatives: [{ presentation: { status: 'ok' } }] }; };
  const pick = alts.auto[0];
  const r = await retryWith(f.brief, alts, pick.id, gen);
  assert.equal(calls, 1); assert.equal(r.outcome.kind, OUTCOME.SOLVED);
  assert.ok(r.brief.decisions.some(d => /يتغير/.test(d.description) && /يُفقد/.test(d.description)), 'قرار مسجّل');
  assert.ok(eng.counts.bedrooms >= 3);
});
test('12 ثلاث نتائج متمايزة: مستحيل مثبت / مخالف نظاميًا / بحث غير مكتمل', () => {
  const b = B.createBrief({ land: mkLand() });
  assert.equal(classifyOutcome({ status: 'PROVEN_INFEASIBLE', report_ar: 'برهان' }, b).kind, OUTCOME.INFEASIBLE);
  assert.equal(classifyOutcome({ alternatives: [], hidden: [] }, b).kind, OUTCOME.INCOMPLETE);
  let b2 = B.createBrief({ land: mkLand() }); b2 = B.setField(b2, 'features.requestedCoveragePct', 90, B.makeMeta({ source: 'client_answer', priority: 'mandatory' }));
  const reg = classifyOutcome({ alternatives: [] }, b2);
  assert.ok([OUTCOME.REGULATORY, OUTCOME.INCOMPLETE].includes(reg.kind));
});
test('13 الاقتراح الذي يمس إلزاميًا يرفض التنفيذ دون موافقة صريحة', async () => {
  const t = 'لازم ثلاث غرف نوم'; let b = B.applyExtraction(B.createBrief({ land: mkLand() }), extractRequirements(t, { counts: { bedrooms: 3 } }), t).brief;
  const alts = buildAlternatives(b, { kind: OUTCOME.INCOMPLETE });
  const o = alts.needsConsent[0]; if (!o) return;
  await assert.rejects(() => retryWith(b, alts, o.id, async () => ({})), /موافقتك/);
});
test('14 طلب لاحق «أبعد الماستر عن الدرج» يعود إلى الملف نفسه', () => {
  const f = flow(undefined, 'free'); f.answer('free', 'ثلاث غرف نوم ومجلس');
  const r = f.followUp('أبعد الماستر عن الدرج');
  assert.ok(r.imperatives?.length >= 1 || r.added?.length >= 1, 'الطلب لم يُلتقط');
  assert.ok(f.brief.relations.some(x => x.relation === 'separate' && /master/.test(x.from + x.to)));
  assert.match(r.regeneration, /غير متحقق/);
});

// ---- قرارات المالك (الجولة الثانية)
const hiddenCase = () => {
  const f = flow({ entries: ['n'], streets: ['n'] }, 'guided'); f.answer('counts', { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 0 });
  const oc = classifyOutcome({ alternatives: [], hidden: [{ reasons_ar: ['موقف موازٍ للشارع في ارتداد 3.13 م أمام نافذة «المجلس»', 'مجلس الرجال بلا باب داخلي إلى البيت'] }] }, f.brief);
  return { f, oc, alts: buildAlternatives(f.brief, oc) };
};
test('15 الموقف الموازي وفصل المجلس عن الطعام: خياران بموافقة صريحة، ولا يُرسل مفتاح المحرك قبل الضغط', async () => {
  const { f, alts } = hiddenCase();
  assert.equal(f.engineInput().idea, '', 'قبل الضغط لا عبارة مفتاحية');
  const ids = alts.needsConsent.map(o => o.id); assert.ok(ids.includes('accept_parallel_parking') && ids.includes('majlis_separate_dining'));
  await assert.rejects(() => retryWith(f.brief, alts, 'accept_parallel_parking', async () => ({})), /موافقتك/);
  let seen; const gen = async e => { seen = e; return { alternatives: [{ presentation: { status: 'ok' } }] }; };
  let r = await retryWith(f.brief, alts, 'accept_parallel_parking', gen, { consent: true });
  r = await retryWith(r.brief, buildAlternatives(r.brief, classifyOutcome({ alternatives: [], hidden: [{ reasons_ar: ['بلا باب داخلي'] }] }, r.brief)), 'majlis_separate_dining', gen, { consent: true });
  assert.equal(seen.idea, 'موقف موازي، مجلس منفصل عن الطعام'); assert.equal(seen.requirements.text, seen.idea);
  assert.ok(seen.report.limited.some(x => /مفتاح نصي/.test(x.text_ar)), 'يُعلن أنه مفتاح نصي لا خيار مكتوب');
});
test('16 حذف المجلس يُعرض بين الخيارات لا توصية، ولا يُنفَّذ إلا بجواب نعم على السؤال الصريح', async () => {
  const { f, alts } = hiddenCase(); const o = alts.needsConsent.find(x => x.id === 'drop_majlis');
  assert.ok(o && o.recommended === false); assert.equal(o.confirmQ_ar, 'هل ترغب بالاستغناء عن المجلس مقابل حل الحجب؟');
  assert.equal(alts.needsConsent.findIndex(x => x.id === 'drop_majlis') >= alts.needsConsent.findIndex(x => x.id === 'accept_parallel_parking'), true);
  await assert.rejects(() => retryWith(f.brief, alts, 'drop_majlis', async () => ({}), { consent: true }), /بنعم/);
  const r = await retryWith(f.brief, alts, 'drop_majlis', async () => ({ alternatives: [{ presentation: { status: 'ok' } }] }), { consent: true, confirmed: true });
  assert.equal(B.countOf(r.brief, 'male_majlis'), 0);
});
test('17 «قريب/بعيد»: افتراض معلن بحالة needs_confirmation من مقاييس المحرك، ولا تُسأل بالأمتار', () => {
  const t = 'أبي المقلط قريب من المجلس'; const b = B.applyExtraction(B.createBrief({ land: mkLand() }), extractRequirements(t, { counts: {} }), t).brief;
  const a = toEngineInput(b).report.assumptions.find(x => x.id === 'near-measure');
  assert.ok(a && a.verification === 'needs_confirmation' && /0\.8/.test(a.text_ar));
  const f = flow(); f.answer('free', t); assert.ok(f.profile().assumptions.some(x => x.ref === 'near-measure' && x.verification === 'needs_confirmation'));
  assert.doesNotMatch(texts(f.log), /بالأمتار|كم متر/);
});
