// قرار المالك 2026-10-31 (إصلاح عقد شرعاء V2 مع R21): direct_access وguest_dining وrequestedDesignCount من ملف شرعاء الموحد
// إلى المولّد والمراجع ومدقق التعديل الآمن — الكائن نفسه (لا مصدر حقيقة ثانٍ)، مع المصدر والأولوية وحالة التأكيد.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLand, generateInitialDesign } from '../dist/home-flow.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { briefOf, briefMajlisDoor, briefGuestDining, sharedReviewRequest, assertSharedBrief, RELATIONS } from '../dist/shared-brief.mjs';
import { programV2 } from '../dist/villa-layout-v2.mjs';
import { clientAsks } from '../dist/saudi-program.mjs';
import { validateEdit } from '../dist/change-guard.mjs';
import * as B from '../dist/sharaa/brief.mjs';
import { SharaFlow } from '../dist/sharaa/flow.mjs';
import { classifyOutcome, OUTCOME } from '../dist/sharaa/alternatives.mjs';

const LAND = { length: 30, width: 18, streets: ['n'], entries: ['n'], floors: 1 };
const COUNTS = { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 };
/** رحلة شرعاء الحقيقية: الحديث الحر ثم نموذج الأعداد ثم تأكيد كل علاقة بأولويتها التي قالها العميل. */
const flowOf = (text, { land = LAND, counts = COUNTS, confirm = true } = {}) => {
  const f = new SharaFlow({ land: normalizeLand(land).land, mode: 'free' });
  f.answer('free', text); f.answer('counts', counts);
  if (confirm) for (const r of f.brief.relations) f.brief = B.decide(f.brief, 'relation:' + r.id, { priority: r.priority });
  return f;
};
const kinds = req => briefOf(req).relations.map(r => `${r.kind}:${r.level}${r.directDoor ? ':' + r.directDoor : ''}`);
const gen = async f => { const e = f.engineInput(); return { e, out: await generateInitialDesign({ land: e.land, rooms: e.rooms, discovery: e.discovery, idea: e.idea, counts: e.counts, requirements: e.requirements }) }; };
const doorItems = (a, req) => verifyRequest(a.doc, req, { entry: 'n' }).filter(x => /باب مباشر/.test(x.text || ''));

test('K1 المولّد والمراجع ومدقق التعديل الآمن يقرؤون العقد نفسه (الكائن ذاته) المبني من ملف شرعاء', () => {
  const f = flowOf('لازم المجلس يفتح على الطعام بباب مباشر'), req = f.engineInput().requirements;
  const gBrief = programV2(req.counts, req).brief, rBrief = sharedReviewRequest(req, {}, req.counts).brief;
  assert.equal(assertSharedBrief(gBrief, rBrief), true); assert.equal(gBrief, req.brief);
  assert.equal(req.brief.origin, 'sharaa-brief');
  assert.equal(briefMajlisDoor(gBrief), true, 'المولّد يرى الباب');
  assert.equal(programV2(req.counts, req).majlisDining, true, 'المولّد: باب المجلس على الطعام بطلب العميل');
  assert.equal(clientAsks(req).MAJLIS_DINING, true, 'المراجع يرى الطلب نفسه');
  const d = req.brief.relations.find(r => r.kind === RELATIONS.DIRECT_DOOR);
  assert.ok(d.briefRef && d.sharaaSource === 'client_confirmed' && d.verification === 'confirmed', 'المصدر وحالة التأكيد محفوظان: ' + JSON.stringify(d));
});

test('K2 باب مباشر موجود ومثبت (رحلة شرعاء، المحرك الفعلي): كل بديل ظاهر بباب حقيقي، ومدقق التعديل الآمن يراه في العقد', { timeout: 900000 }, async () => {
  const f = flowOf('لازم باب مباشر بين المجلس والطعام'); const { e, out } = await gen(f);
  const shown = out.alternatives.filter(a => a.presentation?.status !== 'hidden'); assert.ok(shown.length >= 1, 'لا بديل ظاهر');
  for (const a of shown) {
    const it = doorItems(a, e.requirements); assert.ok(it.length >= 1 && it.every(x => x.ok === true && x.evidence?.width >= 0.8), JSON.stringify(it.map(x => x.why)));
    assert.deepEqual((a.review?.failedGates || []).filter(g => ['DOOR_SWING', 'CIRCULATION', 'REACH', 'GUEST_ROUTE', 'INTEGRITY'].includes(g.id || g)), []);
    const v = validateEdit(a.doc, e.requirements, { entry: 'n' }); assert.ok(v.brief.some(x => x.kind === RELATIONS.DIRECT_DOOR), 'مدقق التعديل لا يرى الباب');
  }
});

test('K3 باب مباشر متعذر (المجلس على الصالة): لا بديل ظاهر بلا الباب، وسبب الحجب صريح للعميل، ولا تنازل صامت', { timeout: 900000 }, async () => {
  const f = flowOf('لازم المجلس بباب مباشر على الصالة'); const { e, out } = await gen(f);
  assert.ok(e.requirements.rules.some(r => r.door && r.level === 'must'));
  for (const a of out.alternatives) {
    const ok = doorItems(a, e.requirements).every(x => x.ok);
    if (a.presentation?.status !== 'hidden') assert.ok(ok, 'بديل ظاهر بلا الباب المطلوب');
  }
  const oc = classifyOutcome(out, f.brief);
  if (oc.kind !== OUTCOME.SOLVED) assert.ok(oc.detail_ar.join(' ').length > 10, 'حجب بلا سبب ظاهر');
  else assert.ok(out.alternatives.filter(a => a.presentation?.status !== 'hidden').every(a => doorItems(a, e.requirements).every(x => x.ok)));
});

test('K4 مقلط قريب من المجلس دون باب: GUEST_ACCESS بلا DIRECT_DOOR، ولا غرفة طعام ثانية، والتوليد ينجح', { timeout: 900000 }, async () => {
  const f = flowOf('أبي مقلط قريب من المجلس'); const e = f.engineInput();
  assert.ok(B.spaceOf(f.brief, 'guest_dining'));
  assert.ok(kinds(e.requirements).some(k => k.startsWith('GUEST_ACCESS') && k.endsWith(':unspecified')), kinds(e.requirements).join());
  assert.ok(!kinds(e.requirements).some(k => k.startsWith('DIRECT_DOOR')));
  assert.equal(briefMajlisDoor(e.requirements.brief), false); assert.equal(briefGuestDining(e.requirements.brief), true);
  assert.equal(e.counts.dining, 1, 'المقلط وظيفة لا غرفة إضافية');
  const { out } = await gen(f); assert.ok(out.alternatives.some(a => a.presentation?.status !== 'hidden'), 'لا بديل ظاهر');
});

test('K5 مقلط بباب مباشر بطلب صريح: DIRECT_DOOR + GUEST_ACCESS(required)، وكل بديل ظاهر بباب حقيقي محقق', { timeout: 900000 }, async () => {
  const f = flowOf('لازم المقلط بباب مباشر على المجلس'); const e = f.engineInput();
  assert.ok(kinds(e.requirements).includes('DIRECT_DOOR:HARD:required'), kinds(e.requirements).join());
  assert.ok(kinds(e.requirements).some(k => k.startsWith('GUEST_ACCESS') && k.endsWith(':required')));
  const { out } = await gen(f); const shown = out.alternatives.filter(a => a.presentation?.status !== 'hidden');
  assert.ok(shown.length >= 1 || classifyOutcome(out, f.brief).detail_ar.length, 'لا بديل ولا سبب');
  for (const a of shown) assert.ok(doorItems(a, e.requirements).every(x => x.ok === true && x.evidence), 'باب غير محقق');
});

test('K6 عدد تصاميم أكبر من الممكن: want يصل المحرك، ويُعرض العدد الفعلي بصدق مع سبب النقص، بلا بدائل مكررة', { timeout: 900000 }, async () => {
  const f = flowOf('أبي ستة تصاميم، ومجلس رجال');
  assert.equal(f.brief.preferences.requestedDesignCount, 6); assert.equal(B.fieldMeta(f.brief, 'preferences.requestedDesignCount').source, 'client_free_text');
  const { e, out } = await gen(f); assert.equal(e.requirements.want, 6); assert.equal(e.requirements.brief.requestedCount, 6);
  const info = out.alternativesInfo; assert.equal(info.requested, 6);
  const shown = out.alternatives.filter(a => a.presentation?.status !== 'hidden').length;
  assert.ok(out.alternatives.length <= 6);
  if (shown < 6) assert.ok(info.shortfall_ar || info.hidden.length || info.rejectedCount, 'نقص بلا سبب');
  const fp = out.alternatives.map(a => JSON.stringify(a.doc?.levels?.map(l => l.id)) + JSON.stringify((a.doc?.walls || []).map(w => [w.a.x, w.a.y, w.b.x, w.b.y])));
  assert.equal(new Set(fp).size, fp.length, 'بدائل مكررة');
});

test('K7 التبديل بين الحديث الحر والأسئلة الموجهة لا يضيّع أي متطلب (الباب، المقلط، العدد) ويصل المحوّل كما هو', () => {
  const f = new SharaFlow({ land: normalizeLand(LAND).land, mode: 'free' });
  f.answer('free', 'لازم المجلس بباب مباشر على الطعام، وأبي مقلط، وأبي ثلاثة تصاميم');
  f.answer('mode', 'guided'); f.answer('counts', COUNTS);
  for (let i = 0; i < 6; i++) { const q = f.log.at(-1); if (!q?.key) break; try { f.answer('ask', { key: q.key, value: q.kind === 'multi' ? [] : q.options?.[0]?.id }); } catch { break; } }
  f.answer('mode', 'free'); f.answer('free', 'وأبي المطبخ مغلق');
  for (const r of f.brief.relations) f.brief = B.decide(f.brief, 'relation:' + r.id, { priority: r.priority });
  const b = f.brief, e = f.engineInput();
  assert.ok(b.relations.some(r => r.relation === 'direct_access' && r.detail === 'door'), 'ضاع الباب');
  assert.ok(B.spaceOf(b, 'guest_dining'), 'ضاع المقلط'); assert.equal(b.preferences.requestedDesignCount, 3, 'ضاع العدد');
  assert.equal(e.requirements.want, 3);
  assert.ok(kinds(e.requirements).includes('DIRECT_DOOR:HARD:required') && kinds(e.requirements).some(k => k.startsWith('GUEST_ACCESS')), kinds(e.requirements).join());
  assert.ok(b.interaction.switched >= 2);
});

test('K8 عدد التصاميم بصيغة المثنى («تصميمين») يُقرأ 2 ويصل want من ملف شرعاء بمصدره', async () => {
  const { parseRequestedCount } = await import('../dist/shared-brief.mjs');
  assert.equal(parseRequestedCount('أبي تصميمين فقط'), 2); assert.equal(parseRequestedCount('بديلين'), 2);
  assert.equal(parseRequestedCount('غرفتين ومجلسين'), null, 'المثنى لغير التصاميم لا يُعدّ');
  const f = flowOf('أبي تصميمين فقط'); assert.equal(f.brief.preferences.requestedDesignCount, 2); assert.equal(f.engineInput().requirements.want, 2);
});
