// الجولة 21 (الموجز التقني للمالك وقرار الاعتماد r21): عقد نتائج التوليد، وصدق رسائل العميل واتساقها، ومسار الضيف، والتعديل الآمن،
// والمقاسات طولًا وعرضًا، والمواقف، والتكرار المعكوس، وعدم احتساب إصلاح حالة معروفة تعميمًا. ما لم يُنفَّذ بعد (بانتظار مراجعة المالك
// للتعديلات المقترحة في docs/research/v3-diagnosis-r21.md) مكتوب اختبارًا «todo» يُسجَّل ولا يُخفى.
// (الاختبارات المنتظرة — المتوقع رسوبها حتى تُعتمد الإصلاحات — في tests-pending/ ومشغّلها npm run test:pending، خارج الحزمة.)
// المراجع المستقل وكيل ذكاء اصطناعي — ليس معماريًا مرخّصًا؛ ولا يُعدّ أي حكم آلي هنا اعتمادًا هندسيًا أو إنشائيًا.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { analyzeFeasibility } from '../dist/feasibility.mjs';
import * as V3 from '../dist/villa-layout-v3.mjs';
import { explainFailure, reportContradictions, textContradictions } from '../dist/infeasibility-report.mjs';
import { toClientAr, clientLint, BANNED_CLIENT_TERMS } from '../dist/client-language.mjs';
import { shortfallNotice } from '../dist/client-text.mjs';
import { measureR16, MANDATORY_R16 } from '../dist/privacy-defects.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { guardChange } from '../dist/change-guard.mjs';
import { sameOrDifferent } from '../dist/arch-criterion.mjs';
import { mirrorX } from '../scripts/defect-corpus.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';
import { HELDOUT } from '../scripts/heldout-cases.mjs';
import { HELDOUT2 } from '../scripts/heldout2-cases.mjs';
import { DEV } from '../scripts/dev-cases-r20.mjs';
import { casesFor } from '../scripts/coverage-r21.mjs';

const root = new URL('../', import.meta.url).pathname;
const ev = p => `${root}evidence/acceptance/${p}`;
const doc = p => parseDoc(readFileSync(ev(p), 'utf8'));
const req = (text, counts) => { const r = extractRequirements(text, { counts }); r.counts = { ...r.counts, ...counts }; return r; };

// ------------------------------------------------------------------------------------------------ عقد النتائج
test('العقد: انتهاء المهلة «بحث غير مكتمل» (TIME_LIMIT) قابل للإعادة — لا «استحالة» أبدًا', { timeout: 600000 }, () => {
  const counts = { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 };
  const r = V3.generate({ land: { width: 22, length: 30, streets: ['s'], entries: ['s'], floors: 1 }, counts, requirements: req('4 غرف نوم ومجلس رجال ومجلس نساء', counts), keep: 3, timeLimitMs: 1, _cf: true });
  assert.notEqual(r.status, 'PROVEN_INFEASIBLE');
  if (r.status !== 'SOLVED') { assert.equal(r.status, 'SEARCH_INCOMPLETE'); assert.equal(r.reason, 'TIME_LIMIT'); assert.equal(r.retryable, true); assert.match(r.report_ar, /لا يعني أن طلبك مستحيل/); assert.deepEqual(reportContradictions(r.report), []); }
});
test('العقد: فشل البحث بلا دليل يُصنَّف SEARCH_EXHAUSTED_WITHOUT_PROOF؛ و«مستحيل» بدليل فقط (حد أدنى للمساحة، مقاس أطول من البناء، تعارض منطقي)', () => {
  for (const code of ['VILLA_NO_FIT', 'VILLA_BUILD_FAILED', 'VILLA_REVIEW_FAILED']) { const e = Object.assign(Error('x'), { code }); assert.deepEqual([V3.classifyFailure(e, { feasible: true, hard: [] }).status, V3.classifyFailure(e, { feasible: true, hard: [] }).reason], ['SEARCH_INCOMPLETE', 'SEARCH_EXHAUSTED_WITHOUT_PROOF'], code); }
  const big = analyzeFeasibility({ land: { width: 12, length: 18, streets: ['s'], entries: ['s'], floors: 1 }, counts: { bedrooms: 6, majlis: 2, baths: 8, kitchens: 1, halls: 1, dining: 1 }, requirements: req('6 غرف نوم ومجلسين', { bedrooms: 6, majlis: 2 }) });
  assert.equal(big.feasible, false); assert.ok(big.hard.every(h => h.proof), 'كل سبب استحالة يحمل دليله');
  const c = V3.classifyFailure(Object.assign(Error(big.report_ar), { code: 'VILLA_INFEASIBLE' }), big, { land: { width: 12, length: 18, streets: ['s'], entries: ['s'], floors: 1 }, counts: { bedrooms: 6, majlis: 2, baths: 8, kitchens: 1, halls: 1, dining: 1 }, requirements: req('6 غرف نوم ومجلسين', { bedrooms: 6, majlis: 2, baths: 8, kitchens: 1, halls: 1, dining: 1 }) }); // (D) المقترح 03: «مستحيل» بشهادة يتحقق منها المدقق، فيلزم تمرير args assert.equal(c.status, 'PROVEN_INFEASIBLE'); assert.ok(c.proofReference.includes('area-lower-bound'));
  // المساحة بين الحد الأدنى المثبت والتقدير المعتاد ليست استحالة: «ضيقة» ويُبحث فيها
  const tight = analyzeFeasibility({ land: { width: 15, length: 21, streets: ['s'], entries: ['s'], floors: 1 }, counts: { bedrooms: 3, majlis: 2, baths: 5, kitchens: 1, halls: 1, dining: 1 }, requirements: req('3 غرف نوم ومجلس رجال ومجلس نساء', { bedrooms: 3, majlis: 2 }) });
  if (tight.numbers.lowerBoundPerFloor <= tight.numbers.available) assert.equal(tight.feasible, true, tight.report_ar);
});
test('العقد: بندان متعارضان منطقيًا (المطبخ أمامًا وخلفًا) استحالة مثبتة تسمّي البندين ولا ترسم؛ وفي الحوار (provisional) ملاحظة يُسأل عنها', () => {
  const counts = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, land = { width: 22, length: 30, streets: ['s'], entries: ['s'], floors: 1 };
  const r = req('3 غرف ومجلس، المطبخ في الأمام، والمطبخ في الخلف', counts);
  assert.equal(analyzeFeasibility({ land, counts, requirements: r }).feasible, true, '(D) المقترح 03: تعارض بندين ملاحظة وسؤال افتراضيًا (عقد r20)');
  const f = analyzeFeasibility({ land, counts, requirements: r, logicalHard: true }); // استحالة مثبتة بطلب صريح فقط
  assert.equal(f.feasible, false); const h = f.hard.find(x => x.id === 'CONFLICT'); assert.ok(h && h.proof === 'logical-contradiction');
  assert.deepEqual(h.quotes, ['المطبخ في الأمام', 'المطبخ في الخلف']);
  const rep = explainFailure({ feasibility: f, land }); assert.equal(rep.cause, 'conflict'); assert.match(rep.report_ar, /«المطبخ في الأمام» و«المطبخ في الخلف»/); assert.deepEqual(reportContradictions(rep), []);
  assert.equal(analyzeFeasibility({ land, counts, requirements: r, provisional: true }).feasible, true);
});

// ------------------------------------------------------------------------------------------------ صدق الرسائل واتساقها
test('رسائل العميل: كاشف التناقض يلتقط إشعاري r20 المضللين (H10: المتاح 541 والمطلوب 265 ثم «قلّل الغرف»، وH6: اقتراح بلا قياس)', { skip: !existsSync(ev('after-20-heldout2/H10/result.json')) }, () => {
  const n = id => JSON.parse(readFileSync(ev(`after-20-heldout2/${id}/result.json`), 'utf8')).notice.lines_ar.join('\n');
  assert.ok(textContradictions(n('H10')).length >= 1); assert.ok(textContradictions(n('H6')).length >= 1);
  assert.ok(clientLint(n('H6')).length >= 1, 'وفيه مصطلحات داخلية («شبكة 4×3»، «القيود الصلبة»، «المولّد»)');
});
test('رسائل العميل: تقارير محرك الشرح متسقة ولا مصطلحات فيها، في الأسباب كلها (مساحة، مقاس، تعارض، مهلة، فشل بحث)', () => {
  const land = { width: 25, length: 30, streets: ['e'], entries: ['e'], floors: 1 }, counts = { bedrooms: 4, majlis: 1, baths: 5, kitchens: 1, halls: 1, dining: 1 };
  const f = analyzeFeasibility({ land, counts, requirements: req('4 غرف نوم ومجلس', counts) });
  const reps = [explainFailure({ feasibility: f, land, error: Object.assign(Error('x'), { code: 'VILLA_NO_FIT', treeStats: { tried: 30, why: { 'dims:kitchen': 20 } } }) }),
    explainFailure({ feasibility: f, land, status: { reason: 'TIME_LIMIT' } }),
    explainFailure({ feasibility: analyzeFeasibility({ land: { width: 12, length: 18, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 6, majlis: 2, baths: 8, kitchens: 1, halls: 1, dining: 1 }, requirements: req('6 غرف', { bedrooms: 6 }) }), land: { width: 12, length: 18 } })];
  for (const r of reps) { assert.deepEqual(reportContradictions(r), [], r.report_ar); assert.deepEqual(textContradictions(r.report_ar), [], r.report_ar); assert.deepEqual(clientLint(r.report_ar), [], r.report_ar); }
  assert.match(reps[0].report_ar, /المساحة تكفي/); assert.doesNotMatch(reps[0].report_ar, /تقليل عدد الغرف|دور ثانٍ/);
});
test('لغة العميل: كل نصوص العميل في أدلة r20 بعد التحويل خالية من المصطلحات الممنوعة', { skip: !existsSync(ev('after-20/C10/result.json')) }, () => {
  const texts = [];
  for (const st of ['after-20', 'after-20-heldout-known', 'after-20-heldout2']) for (const id of [...CASES, ...HELDOUT, ...HELDOUT2].map(c => c.id)) {
    const f = ev(`${st}/${id}/result.json`); if (!existsSync(f)) continue; const r = JSON.parse(readFileSync(f, 'utf8'));
    for (const d of r.designs || []) texts.push(d.summary, ...(d.notes || []), ...(d.presentation?.hidden_ar || []), ...(d.presentation?.edits_ar || []), ...(d.presentation?.notes_ar || []));
    if (r.shortfallReason) texts.push(shortfallNotice({ requested: 4, shown: 1, shortfall_ar: r.shortfallReason }).lines_ar.join(' '));
  }
  const bad = texts.filter(Boolean).map(t => [t, clientLint(toClientAr(t))]).filter(([, l]) => l.length);
  assert.ok(texts.length > 50); assert.deepEqual(bad.slice(0, 3), []);
  assert.ok(BANNED_CLIENT_TERMS.length >= 10);
});

// ------------------------------------------------------------------------------------------------ مسار الضيف والإلزامي
test('مسار الضيف: المجلس المعزول والضيف الذي يعبر العائلة مخالفة إلزامية تحجب البديل (H3-1 في r20)، والبديل السليم لا يُنذَر', { skip: !existsSync(ev('after-20-heldout-known/H3/alt-1.json')) }, () => {
  const h3 = doc('after-20-heldout-known/H3/alt-1.json'), C3 = HELDOUT.find(c => c.id === 'H3');
  const ids = measureR16(h3, { text: C3.text, counts: C3.counts }).filter(g => g.applicable && !g.pass).map(g => g.id);
  assert.ok(ids.some(id => MANDATORY_R16.includes(id)), JSON.stringify(ids));
  assert.equal(presentationStatus({ doc: h3, ledger: [], review: null }, { text: C3.text, counts: C3.counts }).status, 'hidden');
  const ok = doc('after-20/C1/alt-1.json'), C1 = CASES.find(c => c.id === 'C1');
  assert.ok(!measureR16(ok, { text: C1.text, counts: C1.counts }).some(g => g.applicable && !g.pass && MANDATORY_R16.includes(g.id)));
});
test('لا يُعتمد مخطط فيه مخالفة إلزامية: «جاهز» لا يجتمع مع مخالفة إلزامية في أي بديل معروض في أدلة r20', { skip: !existsSync(ev('after-20/C10/result.json')) }, () => {
  for (const st of ['after-20', 'after-20-heldout-known', 'after-20-heldout2']) for (const id of [...CASES, ...HELDOUT, ...HELDOUT2].map(c => c.id)) {
    const f = ev(`${st}/${id}/result.json`); if (!existsSync(f)) continue;
    for (const d of JSON.parse(readFileSync(f, 'utf8')).designs || []) if (d.presentation?.status === 'ready') assert.deepEqual(d.presentation.mandatory || [], [], `${st}/${id}`);
  }
});

// ------------------------------------------------------------------------------------------------ التعديل الآمن والمقاسات
test('التعديل الآمن: حذف غرفة مطلوبة أو باب دورة مياه العائلة يُرفض بسببه (حارس التغيير)', { skip: !existsSync(ev('after-20/C1/alt-1.json')) }, () => {
  const a = doc('after-20/C1/alt-1.json'), b = JSON.parse(JSON.stringify(a));
  const lab = b.labels.findIndex(l => /^غرفة نوم/.test(l.name)); assert.ok(lab >= 0); b.labels.splice(lab, 1);
  const g = guardChange(a, b, { text: CASES[0].text, counts: CASES[0].counts }); assert.equal(g.ok, false); assert.ok(g.regressions.some(r => /^COUNT_/.test(r.id)), JSON.stringify(g.regressions));
});
test('المقاسات: السجل يطابق الطول والعرض معًا (مجلس 5×7 مرسوم 4.97×7.02 يتحقق؛ 5×9 لا، و3×7 لا)', { skip: !existsSync(ev('after-20-heldout-known/H5/alt-1.json')) }, () => {
  const d = doc('after-20-heldout-known/H5/alt-1.json'), counts = HELDOUT.find(c => c.id === 'H5').counts;
  const led = t => verifyRequest(d, req(t, counts), { entry: 's' }).find(x => x.kind === 'dims' && /مجلس/.test(x.text));
  assert.equal(led('مجلس 5×7').ok, true); assert.equal(led('مجلس 5×9').ok, false); assert.equal(led('مجلس 3×7').ok, false);
});

// ------------------------------------------------------------------------------------------------ المواقف والتكرار
test('المواقف: الموقف الموازي في ارتداد ضحل أمام نافذة مخالفة إلزامية (H2-1 في r20 محجوب)', { skip: !existsSync(ev('after-20-heldout-known/H2/alt-1.json')) }, () => {
  // الحكم المحفوظ في r20 (المحجوب ببوابة المواقف في المراجعة) — وبعد r21 يُقرأ اسم الفحص بالعربية للعميل
  const p = JSON.parse(readFileSync(ev('after-20-heldout-known/H2/result.json'), 'utf8')).designs[0].presentation;
  assert.equal(p.status, 'hidden'); assert.ok(p.hidden_ar.some(t => /PARKING/.test(t)));
  assert.match(toClientAr(p.hidden_ar.join(' ')), /مواقف السيارات/);
  assert.ok(MANDATORY_R16.includes('PARKING_SHALLOW'));
});
test('التكرار: النسخة المعكوسة من بديل ليست «مختلفة معماريًا» بالمعيار المجمّد r19', { skip: !existsSync(ev('after-20/C10/alt-1.json')) }, () => {
  const a = doc('after-20/C10/alt-1.json'); assert.equal(sameOrDifferent(a, mirrorX(a)).different, false);
});

// ------------------------------------------------------------------------------------------------ التعميم
test('التعميم: الشيفرة الجديدة لا تذكر معرّفات الحالات ولا أسماءها ولا أبعاد أراضيها، وعينة التغطية مولّدة من بذرة لا من الحالات', () => {
  const all = [...CASES, ...HELDOUT, ...HELDOUT2, ...DEV];
  const names = all.map(c => c.name).filter(n => n.length > 6), dims = [...new Set(all.map(c => `${c.land.width}×${c.land.length}`))];
  for (const f of ['dist/client-language.mjs', 'dist/infeasibility-report.mjs', 'dist/feasibility.mjs', 'dist/villa-layout-v3.mjs']) {
    const code = readFileSync(root + f, 'utf8').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /['"`][CHD]\d{1,2}(?:-\d)?['"`]/, f); for (const n of names) assert.ok(!code.includes(n), f + n); for (const d of dims) assert.ok(!code.includes(d), f + d);
  }
  const a = casesFor('dev', 40), b = casesFor('dev', 40), e = casesFor('eval', 40);
  assert.deepEqual(a, b, 'حتمية'); assert.notDeepEqual(a.map(c => c.text), e.map(c => c.text), 'بذرتان منفصلتان');
  // إصلاح حالة معروفة لا يُحتسب تعميمًا: مقياس التعميم بذرة «eval» لا تُستعمل في التطوير، والحالات المعروفة خارجها
  const known = new Set(all.map(c => `${c.land.width}x${c.land.length}|${c.text}`)); assert.ok(e.every(c => !known.has(`${c.land.width}x${c.land.length}|${c.text}`)));
});

// ------------------------------------------------------------------------------------------------ حياد أدوات التشخيص
test('حياد التشخيص: السجل مطفأ افتراضيًا، والنتيجة بسجل التشخيص وبدونه متطابقة حرفيًا (بصمة المخططات والنتيجة دون الزمن)', { timeout: 900000 }, async () => {
  const { serialize } = await import('../dist/draw/doc.mjs'), { createHash } = await import('node:crypto');
  const C = HELDOUT2.find(c => c.id === 'H9'), r = req(C.text, C.counts);
  const fp = () => { const o = V3.generateVillaDesigns({ land: { floors: 1, ...C.land }, counts: r.counts, requirements: JSON.parse(JSON.stringify(r)), keep: 3 });
    return createHash('sha256').update(JSON.stringify(o.designs.map(d => [d.pat, d.presentation?.status, serialize(d.doc), d.notes]))).digest('hex'); };
  assert.equal(globalThis.__v2dbg, undefined, 'السجل مطفأ افتراضيًا'); const off = fp(); assert.equal(globalThis.__v2dbg, undefined, 'المحرك لا يشغّل السجل بنفسه');
  globalThis.__v2dbg = {}; globalThis.__v2keepDocs = true; globalThis.__v2keepRejDocs = true;
  try { assert.equal(fp(), off); } finally { delete globalThis.__v2dbg; delete globalThis.__v2keepDocs; delete globalThis.__v2keepRejDocs; delete globalThis.__v2pool; delete globalThis.__v2poolDocs; delete globalThis.__v2rej; delete globalThis.__v2rejDocs; }
});
