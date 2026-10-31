// تكامل شرعاء V2 (429098a) + مرشح R21 (f6d22c7): عقود الواجهة بين dist/home.mjs ↔ dist/sharaa/* ↔ dist/home-flow.mjs ↔ المحرك بعد الجمع.
// كل اختبار هنا يثبت قرار حلّ موثّقًا في docs/research/sharaa-r21-integration/REPORT.md؛ لا يغيّر معيارًا قائمًا ولا يعطّل اختبارًا.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLand, generateInitialDesign } from '../dist/home-flow.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { verifyRequest, extractRules } from '../dist/rules.mjs';
import { clientLint } from '../dist/client-language.mjs';
import { classifyFailure } from '../dist/villa-layout-v3.mjs';
import { briefOf, RELATIONS } from '../dist/shared-brief.mjs';
import * as B from '../dist/sharaa/brief.mjs';
import { toEngineInput } from '../dist/sharaa/adapter.mjs';
import { classifyOutcome, OUTCOME } from '../dist/sharaa/alternatives.mjs';

const LATIN = /[A-Za-z]{4,}/;

test('I1 (تعارض rules.mjs) الاستيرادان معًا: الباب المباشر (swingBlockers) والمستطيل الصافي (measureClearDims) يعملان في verifyRequest نفسها', () => {
  // قاعدة الباب من شرعاء، والمقاس الصريح من R21، في طلب واحد: كلاهما يُقرأ دون خطأ مرجعي
  const req = extractRequirements('لازم باب مباشر بين المجلس والطعام، والمطبخ 4×5', { counts: { bedrooms: 3, majlis: 1, kitchens: 1, dining: 1 } });
  assert.equal(req.rules.find(r => r.kind === 'adjacent')?.door, true);
  assert.ok(req.dims.kitchen, 'المقاس الصريح مقروء');
  assert.ok(extractRules('المقلط بباب مباشر على المجلس').rules.some(r => r.door));
});

test('I2 (عقد النتائج R21 ← شرعاء) فشل SEARCH_INCOMPLETE من classifyFailure يُعرض «لم يجد حلًا بعد» لا «مستحيل»، بسبب مقروء', () => {
  for (const code of ['VILLA_NO_FIT', 'VILLA_TIME_LIMIT', 'VILLA_BUILD_FAILED']) {
    const e = Object.assign(new Error('x'), { code }); e.result = classifyFailure(e, null, { land: {}, counts: {} });
    const oc = classifyOutcome(e, null);
    assert.equal(oc.kind, OUTCOME.INCOMPLETE, code);
    assert.notEqual(oc.kind, OUTCOME.INFEASIBLE);
    assert.ok(oc.detail_ar.join(' ').length > 10);
    assert.equal(LATIN.test(oc.detail_ar.join(' ')), false, 'لا رمز داخلي إنجليزي: ' + oc.detail_ar);
  }
});

test('I3 (قاعدة R21 «لا نص استثناء للعميل» في مسار شرعاء) خطأ برمجي غير مصنّف لا يظهر نصه الداخلي للعميل', () => {
  const oc = classifyOutcome(new TypeError("Cannot read properties of undefined (reading 'rooms')"), null);
  assert.equal(oc.kind, OUTCOME.INCOMPLETE); assert.equal(oc.reason, 'SOLVER_ERROR');
  const txt = oc.detail_ar.join(' ');
  assert.equal(LATIN.test(txt), false, 'نص استثناء ظهر للعميل: ' + txt);
  assert.deepEqual(clientLint(txt), []);
  // رسالة المحرك العربية المعروفة (VILLA_*) تبقى مفهومة للعميل بلغته
  const ar = classifyOutcome(Object.assign(new Error('البرنامج أكبر مما تتسع له الأرض'), { code: 'VILLA_NO_FIT' }), null);
  assert.match(ar.detail_ar.join(' '), /الأرض/);
});

test('I4 (أسباب الحجب) نتيجة R21 كل بدائلها محجوبة ← ALL_HIDDEN بأسباب ظاهرة، لا «مستحيل» ولا شاشة فارغة', () => {
  const out = { alternatives: [{ presentation: { status: 'hidden', hidden_ar: ['شرط أساسي غير متحقق — موقف موازٍ للشارع'] } }], hidden: [{ reasons_ar: ['مجلس الرجال بلا باب داخلي إلى البيت'] }] };
  const oc = classifyOutcome(out, null);
  assert.equal(oc.kind, OUTCOME.ALL_HIDDEN);
  assert.ok(oc.detail_ar.length === 2 && oc.detail_ar.every(t => t.length > 10));
  assert.match(oc.note_ar, /لم يُثبت المحرك استحالة/);
});

test('I5 (عقد المحوّل ↔ العقد الموحد R21، بعد إصلاح 2026-10-31) الباب المؤكد الإلزامي يصل DIRECT_DOOR صلبًا، وغير المؤكد لا يصل صلبًا', () => {
  const land = normalizeLand({ length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 }).land, t = 'لازم باب مباشر بين المجلس والطعام';
  let b = B.applyExtraction(B.createBrief({ land }), extractRequirements(t, { counts: {} }), t).brief;
  const rel = b.relations.find(x => x.relation === 'direct_access');
  assert.ok(!briefOf(toEngineInput(b).requirements).relations.some(r => r.kind === RELATIONS.DIRECT_DOOR && r.level === 'HARD'), 'غير مؤكد: لا علاقة صلبة');
  b = B.decide(b, 'relation:' + rel.id, { priority: 'mandatory' });
  const req = toEngineInput(b).requirements, rule = req.rules.find(r => r.kind === 'adjacent');
  assert.equal(rule.door, true); assert.equal(rule.level, 'must');
  assert.ok(briefOf(req).relations.some(r => r.kind === RELATIONS.DIRECT_DOOR && r.level === 'HARD' && r.briefRef === rule.briefRef));
});

test('I6 (المحرك الفعلي بعد الجمع) باب مباشر مؤكد عبر محوّل شرعاء: كل بديل ظاهر فيه باب حقيقي محقق وحركته سليمة', { timeout: 900000 }, async () => {
  const land = normalizeLand({ length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 }).land, t = 'لازم باب مباشر بين المجلس والطعام';
  const counts = { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 };
  let b = B.applyExtraction(B.createBrief({ land }), extractRequirements(t, { counts: {} }), t).brief;
  const rel = b.relations.find(x => x.relation === 'direct_access'); b = B.decide(b, 'relation:' + rel.id, { priority: 'mandatory' });
  const e = toEngineInput(b), req = { ...e.requirements, counts };
  const out = await generateInitialDesign({ land: e.land, counts, requirements: req });
  const shown = (out.alternatives || []).filter(a => a.presentation?.status !== 'hidden');
  assert.ok(shown.length >= 1, 'لا بديل ظاهر');
  for (const a of shown) {
    const it = verifyRequest(a.doc, req, { entry: 'n' }).filter(x => /باب مباشر/.test(x.text || ''));
    assert.ok(it.length === 1 && it[0].ok === true && it[0].evidence?.width >= 0.8, JSON.stringify(it.map(x => x.why)));
    assert.deepEqual((a.review?.failedGates || []).filter(g => ['DOOR_SWING', 'CIRCULATION', 'REACH', 'GUEST_ROUTE', 'INTEGRITY'].includes(g.id || g)), []);
  }
});
