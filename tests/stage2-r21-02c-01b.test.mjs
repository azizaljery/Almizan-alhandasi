// الجولة 21 — 02c (استكمال 02b) و01b (تعديل 01): حزمة المالك الثانية docs/owner/kit-r21-02b-01 مكيَّفة على دوال المستودع، وقرار المالك
// docs/owner/decision-r21-02b-01-2026-10-26.md. اختبارات عقد الحزمة (test/patches.test.mjs) منقولة على وحداتنا، واختبارات القرار الثالث.
// غير معتمد؛ فرع dev/stage2-r21-proposal. فحوص الخصوصية والحمامات والجدران ليست اعتمادًا معماريًا ولا إنشائيًا.
import test from 'node:test';
import assert from 'node:assert/strict';
import { measureClearDims, clearSpanFromCentrelines, toleranceFor, isOrthogonal, DIM_TOL } from '../dist/clear-dims.mjs';
import { segmentHit, screenWindowPrivacy, compareAcceptance, acceptanceSnapshot, windowExposure } from '../dist/privacy-gate.mjs';
import { rejection, assertBlocked, classifyRun, clientNotice, gateEvidence } from '../dist/review-evidence.mjs';
import { evaluateBath, evaluateSuiteBaths, BATH_DEPTH_PREFERENCES } from '../dist/bath-band.mjs';
import { canonicalBrief, assertSharedBrief, briefMajlisDoor, briefGuestDining, briefOf, sharedReviewRequest, RELATIONS } from '../dist/shared-brief.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { clientAsks } from '../dist/saudi-program.mjs';
import { programV2, TREE_KIT, DIMS_KIT } from '../dist/villa-layout-v2.mjs';
import * as V3 from '../dist/villa-layout-v3.mjs';
import { createDoc, applyCommand } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { measureR16 } from '../dist/privacy-defects.mjs';
import { shortfallNotice, internalLeaks } from '../dist/client-text.mjs';
import { lintClientText } from '../dist/client-language.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';
import { HELDOUT } from '../scripts/heldout-cases.mjs';
import { HELDOUT2 } from '../scripts/heldout2-cases.mjs';

const rect = (w, h, x = 0, y = 0) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const M = (net, want, tol, o = {}) => measureClearDims({ net, holes: o.holes || [] }, want, tol, o);
const req = (text, counts) => { const r = extractRequirements(text, { counts }); r.counts = { ...r.counts, ...counts }; return r; };
const memo = new Map();
const genCase = (set, id) => {
  const k = set + id; if (memo.has(k)) return memo.get(k);
  const C = { main: CASES, heldout: HELDOUT, heldout2: HELDOUT2 }[set].find(c => c.id === id), r = req(C.text, C.counts), land = { floors: 1, ...C.land };
  let o = null, e = null; try { o = V3.generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || r.want || 4 }); } catch (x) { e = x; }
  const v = { C, r, land, o, e }; memo.set(k, v); return v;
};
const shown = o => (o?.designs || []).filter(d => d.presentation?.status !== 'hidden');

// ------------------------------------------------------------------ (أ) عقد الحزمة: clear-dimensions
test('02c الحزمة: 4×5 «بالضبط» ينجح، وناقص 4 سم يرسب بالضبط وينجح بلا وصف، و«تقريبًا» ±0.30', () => {
  assert.deepEqual({ ...DIM_TOL }, { exact: .03, default: .05, approx: .3 });
  assert.equal(M(rect(4, 5), { s: 4, l: 5 }, toleranceFor('exact')).ok, true);
  assert.equal(M(rect(3.96, 5), { s: 4, l: 5 }, toleranceFor('exact')).ok, false);
  assert.equal(M(rect(3.96, 5), { s: 4, l: 5 }, toleranceFor('unspecified')).ok, true);
  assert.equal(M(rect(3.8, 5), { s: 4, l: 5 }, toleranceFor('approximate')).ok, true);
  assert.equal(M(rect(3.69, 5), { s: 4, l: 5 }, toleranceFor('approximate')).ok, false);
  assert.throws(() => toleranceFor('exact', { exact: -1 })); assert.throws(() => toleranceFor('other'));
});
test('02c الحزمة: التدوير مسموح حين لا يُلزم الاتجاه، ومرفوض حين يُلزم', () => {
  const r = M(rect(5, 4), { s: 4, l: 5 }, .05); assert.equal(r.ok, true); assert.equal(r.clear.rotated, true);
  assert.equal(M(rect(5, 4), { w: 4, l: 5 }, .05, { allowRotation: false }).ok, false);
});
test('02c الحزمة: غرفة L بصندوق 4×5 لا تنجح، والمستطيل الصحيح قد يكون أصغر من الأكبر مساحة، وجزيرة فتحة رأسية تُسقط المستطيل', () => {
  const L = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4.5 }, { x: 3.5, y: 4.5 }, { x: 3.5, y: 5 }, { x: 0, y: 5 }];
  const m = M(L, { s: 4, l: 5 }, .05); assert.equal(m.ok, false); assert.equal(m.envelopeOK, true); assert.equal(m.clearOK, false);
  assert.equal(M([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 5 }, { x: 0, y: 5 }], { s: 3, l: 5 }, .05).ok, false); // الصندوق 6×5
  assert.equal(M(rect(4, 5), { s: 4, l: 5 }, .05, { holes: [rect(.3, .3, 1, 1)] }).ok, false);
});
test('02c الحزمة: ضيق 6.5 سم (درجة سماكة الجدار 0.25/0.12) عند أضيق موضع يُرسب «بالضبط» و«بلا وصف» ويمر «تقريبًا» — الصندوق وحده كان يمرره', () => {
  const notch = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 3.935, y: 2 }, { x: 3.935, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 5 }, { x: 0, y: 5 }];
  for (const [tol, ok] of [[.03, false], [.05, false], [.3, true]]) { const m = M(notch, { s: 4, l: 5 }, tol); assert.equal(m.ok, ok, String(tol)); assert.equal(m.envelope.s, 4); assert.equal(m.clear.s, 3.935); assert.equal(m.narrowing.s, .065); }
});
test('02c الحزمة: المحاور فقط تُخصم منها أنصاف السماكتين المختلفتين، والهندسة غير المتعامدة لا تُفحص (ليست استحالة)', () => {
  assert.ok(Math.abs(clearSpanFromCentrelines(4.185, .25, .12) - 4) < 1e-9);
  const d = M([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: -1, y: 1 }], { s: 1, l: 1 }, .05);
  assert.equal(d.applicable, false); assert.equal(d.ok, null); assert.match(d.reason_ar, /ليس دليل استحالة/);
  assert.equal(isOrthogonal(rect(2, 3)), true);
});

// ------------------------------------------------------------------ (ب) على المستند الحقيقي: أضيق موضع، وسماكات متغيرة، والأعمدة
/** غرفة «المطبخ» محاورها 4.25×5.185: جهتها الشمالية نصفها خارجي (0.25) ونصفها على غرفة داخلية (0.12) ⇐ درجة 6.5 سم في الوجه الصافي. */
function steppedDoc({ column = null } = {}) {
  let d = createDoc({ title: 't' });
  d = applyCommand(d, { type: 'set-plot', polygon: rect(20, 20, -5, -5), north: 0, entry: 's' }).doc;
  d = applyCommand(d, { type: 'add-walls', level: 'L1', points: [{ x: 0, y: 0 }, { x: 4.25, y: 0 }, { x: 4.25, y: 8 }, { x: 2, y: 8 }, { x: 2, y: 5.185 }, { x: 0, y: 5.185 }], closed: true, t: .25 }).doc;
  d = applyCommand(d, { type: 'add-wall', level: 'L1', a: { x: 2, y: 5.185 }, b: { x: 4.25, y: 5.185 }, t: .12 }).doc;
  d = applyCommand(d, { type: 'add-label', level: 'L1', name: 'المطبخ', roomType: 'kitchen', seed: { x: 1, y: 1 } }).doc;
  d = applyCommand(d, { type: 'add-label', level: 'L1', name: 'المخزن', roomType: 'storage', seed: { x: 3, y: 7 } }).doc;
  if (column) d = applyCommand(d, { type: 'add-column', level: 'L1', x: column.x, y: column.y, size: .3 }).doc;
  return d;
}
test('02c القرار: المطبخ المرسوم بدرجة سماكة يُقاس عند أضيق موضع صالح — السجل يحمل المستطيل الصافي والصندوق والانحراف، ويحجب بسببه', () => {
  const doc = steppedDoc(), k = analyzeDoc(doc).levels[0].rooms.find(r => r.name === 'المطبخ');
  assert.ok(k.net.length > 4, 'الوجه الصافي درجة لا مستطيل');
  const x = verifyRequest(doc, { dims: { kitchen: { w: 4, l: 5, tol: .05 } } }).find(i => i.id === 'D-kitchen');
  assert.equal(x.ok, false, x.why); assert.equal(x.measure, 'clear-rectangle');
  assert.deepEqual(x.envelope, { s: 4, l: 5 }); assert.ok(Math.abs(x.actual.l - 4.935) < .006, String(x.actual.l)); // 5.185 − 0.125 − 0.125 = 4.935 عند الجزء الخارجي
  assert.match(x.why, /أضيق موضع صالح/);
  const ok = verifyRequest(doc, { dims: { kitchen: { w: 4, l: 5, tol: .3 } } }).find(i => i.id === 'D-kitchen');
  assert.equal(ok.ok, true); assert.match(ok.deviation_ar || '', /أوسع موضع 5 م/); // يرى العميل الانحراف الفعلي
});
test('02c القرار: عمود مرسوم داخل الغرفة جزيرة تُسقط المستطيل الصافي (الصندوق لا يتغير)', () => {
  const doc = steppedDoc({ column: { x: 2, y: 2.5 } });
  const x = verifyRequest(doc, { dims: { kitchen: { w: 4, l: 5, tol: .3 } } }).find(i => i.id === 'D-kitchen');
  assert.equal(x.ok, false, x.why); assert.deepEqual(x.envelope, { s: 4, l: 5 });
});
test('02c القرار: مقاس مدوَّر (5×4 مرسوم لطلب 4×5 بلا اتجاه) يتحقق', () => {
  let d = createDoc({ title: 't' }); d = applyCommand(d, { type: 'set-plot', polygon: rect(20, 20, -5, -5), north: 0, entry: 's' }).doc;
  d = applyCommand(d, { type: 'add-walls', level: 'L1', points: rect(5.25, 4.25), closed: true, t: .25 }).doc;
  d = applyCommand(d, { type: 'add-label', level: 'L1', name: 'المطبخ', roomType: 'kitchen', seed: { x: 1, y: 1 } }).doc;
  const x = verifyRequest(d, { dims: { kitchen: { w: 4, l: 5, tol: .03 } } }).find(i => i.id === 'D-kitchen');
  assert.equal(x.ok, true, x.why); assert.deepEqual(x.actual, { s: 4, l: 5 });
});

// ------------------------------------------------------------------ (ج) الصالة بمقاس صريح قيد توليد، والرئيسية وغرف النوم
test('02c القرار خامسًا: مقاس الصالة يُحمل كتلة افتراضية وتُثبَّت به ورقة الصالة على محور قطعها في solve (الصافي + جداران)', () => {
  const r = req('دور واحد، 3 غرف نوم، مجلس، صالة 6×5، مطبخ، طعام', { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 });
  const P = programV2(r.counts, r); assert.deepEqual(P.hallDim.dimNet, { s: 5, l: 6, tol: .05 });
  const { Y, Z, C, solve } = TREE_KIT, { INT } = DIMS_KIT, k = P.blocks.find(b => b.id === 'kitchen1');
  const hall = C('hall', { area: 30 }); hall.dimB = P.hallDim;
  const sol = solve(Y(Z([k], 'y1', 'x'), hall, Z([P.dining[0]], 'y0', 'x')), 6.5, 16);
  assert.ok(sol); const h = sol.circ.find(c => c.id === 'hall').r, dy = Math.round((h.y1 - h.y0) * 100) / 100;
  assert.ok([5 + INT, 6 + INT].includes(dy), `امتداد الصالة ${dy}`);
});
test('02c: الصالة بمقاس صريح في مخطط مولَّد مقيسة بالمستطيل الصافي ضمن السماحية؛ والرئيسية بمقاس صريح لا تُعرض صالحة إلا بمقاسها (وإلا تُحجب بالمقيس)', { timeout: 900000 }, () => {
  const counts = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, land = { width: 22, length: 30, streets: ['s'], entries: ['s'], floors: 1 };
  const r = req('دور واحد، 3 غرف نوم، مجلس، صالة 6×5، مطبخ، طعام', counts);
  const o = V3.generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 2 });
  const ok = shown(o); assert.ok(ok.length >= 1, JSON.stringify(o.designs.map(d => d.presentation?.hidden_ar)));
  for (const d of ok) { const x = verifyRequest(d.doc, r).find(i => i.id === 'D-hall'); assert.equal(x.ok, true, x.why); assert.equal(x.measure, 'clear-rectangle'); assert.ok(x.actual.s <= x.envelope.s + 1e-9 && x.actual.l <= x.envelope.l + 1e-9); }
  const r2 = req('دور واحد، 3 غرف نوم، مجلس، صالة، غرفة النوم الرئيسية 4.5×5، مطبخ، طعام', counts);
  const o2 = V3.generateVillaDesigns({ land, counts: r2.counts, requirements: r2, keep: 2 });
  for (const d of o2.designs) {
    const x = verifyRequest(d.doc, r2).find(i => i.id === 'D-master'); assert.ok(x);
    if (d.presentation.status !== 'hidden') assert.equal(x.ok, true, x.why);
    else if (!x.ok) { const h = d.presentation.hiddenReasons.find(q => q.rule === 'D-master'); assert.ok(h && Number.isFinite(h.measured) && h.limit > 0 && h.stage === 'dimensions'); }
  }
});
test('02c H10: العدد المطلوب 3، والمقاسات الصافية (المجلس والمطبخ وغرف النوم) عند أضيق موضع ضمن السماحية في المعروض', { timeout: 900000 }, () => {
  const { r, o } = genCase('heldout2', 'H10');
  assert.equal(r.want, 3); assert.match(o.shortfall_ar || '', /من 3/);
  const ok = shown(o); assert.ok(ok.length >= 1);
  const ds = verifyRequest(ok[0].doc, r, { entry: 'e' }).filter(i => i.kind === 'dims');
  assert.deepEqual(ds.map(x => x.id).sort(), ['D-bedroom', 'D-kitchen', 'D-majlis']);
  for (const x of ds) { assert.equal(x.ok, true, x.text + ' ' + x.why); assert.equal(x.measure, 'clear-rectangle'); }
});

// ------------------------------------------------------------------ (د) C6: الخصوصية والضوء والتهوية دون إفساد المقاسات
test('02c الحزمة: خط الرؤية، والجلسة العالية، والساتر قبل النافذة، وجدار المبنى يحجب', () => {
  const win = { a: { x: 2, y: -1 }, b: { x: 2, y: 1 }, sillHeight: .8, headHeight: 2.2 }, P = [{ x: 0, y: 0 }], I = [{ x: 4, y: 0 }];
  assert.ok(segmentHit({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 }));
  assert.equal(screenWindowPrivacy({ window: win, parkingPoints: P, interiorPoints: I }).potentialExposure, true);
  assert.equal(screenWindowPrivacy({ window: { ...win, sillHeight: 1.8, headHeight: 2.4 }, parkingPoints: P, interiorPoints: I }).potentialExposure, false);
  assert.equal(screenWindowPrivacy({ window: win, parkingPoints: P, interiorPoints: I, opaqueScreens: [{ a: { x: 1, y: -1 }, b: { x: 1, y: 1 }, height: 2 }] }).potentialExposure, false);
  assert.equal(screenWindowPrivacy({ window: win, parkingPoints: P, interiorPoints: I, opaqueScreens: [{ a: { x: 1, y: -1 }, b: { x: 1, y: 1 }, height: 1.2 }] }).potentialExposure, true); // أوطأ من العين
  assert.equal(screenWindowPrivacy({ window: win, parkingPoints: P, interiorPoints: I, blockers: [{ a: { x: 1, y: -1 }, b: { x: 1, y: 1 } }] }).potentialExposure, false);
  assert.equal(compareAcceptance({ checks: { 'privacy:X': { category: 'privacy', passed: true } } }, { checks: { 'privacy:X': { category: 'privacy', passed: false } } }, { protect: ['privacy'] }).pass, false);
  assert.equal(compareAcceptance({ checks: { 'privacy:X': { category: 'privacy', passed: true } } }, { checks: { 'privacy:X': { category: 'privacy', passed: true }, dims: { passed: true } } }, { mandatory: ['dims'], protect: ['privacy'] }).pass, true);
});
test('02c C6: نافذة الصالة الوحيدة بجلستها وساتر خصوصية خارجي — خطوط الرؤية من المواقف محجوبة بعينات متعددة، وWINDOW_PARKING الأصلي ناجح، والضوء والتهوية والحركة بلا تراجع، والمقاسات محققة', { timeout: 900000 }, () => {
  const { r, o } = genCase('main', 'C6');
  const d = shown(o)[0]; assert.ok(d, 'بديل معروض');
  assert.notEqual(d.presentation.status, 'hidden');
  assert.ok(!(d.presentation.edits_ar || []).some(t => /نافذة «الصالة»[^]*المواقف|ساحة المواقف/.test(t)), JSON.stringify(d.presentation.edits_ar));
  for (const x of verifyRequest(d.doc, r).filter(i => i.kind === 'dims')) assert.equal(x.ok, true, x.text + ' ' + x.why);
  const doc = d.doc, G = analyzeDoc(doc).levels[0], bays = doc.zones.filter(z => z.type === 'garage');
  const fences = doc.walls.filter(w => w.kind === 'fence'); assert.ok(fences.length >= 1, 'ساتر مرسوم');
  assert.ok(fences.every(w => (w.h ?? 0) >= 1.6));
  const hall = G.rooms.find(x => x.name === 'الصالة'), wins = G.openings.filter(op => op.window && op.sides.some(s => s.room.id === hall.id && s.other === 'outside'));
  assert.ok(wins.some(op => (op.o.sill ?? 0) < 1.5), 'نافذة الصالة عادية (لا علوية فقط)');
  for (const op of wins) assert.equal(windowExposure(doc, G, op, op.sides.find(s => s.room.id === hall.id), bays).potentialExposure, false);
  assert.equal(measureR16(doc, {}).find(g => g.id === 'WINDOW_PARKING').pass, true);
  // قبل/بعد: المستند نفسه بلا الساتر يرسب في الخصوصية، ومعه لا تراجع في الضوء والتهوية والحركة
  const bare = { ...doc, walls: doc.walls.filter(w => w.kind !== 'fence') };
  assert.equal(measureR16(bare, {}).find(g => g.id === 'WINDOW_PARKING').pass, false);
  const cmp = compareAcceptance(acceptanceSnapshot(bare), acceptanceSnapshot(doc), { protect: ['privacy', 'daylight', 'ventilation', 'circulation'] });
  assert.equal(cmp.pass, true, JSON.stringify(cmp.violations));
});

// ------------------------------------------------------------------ (هـ) حمام الجناح
test('02c الحزمة: عمق الحمام تفضيل بحث لا يكفي وحده، وخارجه قد يصح وظيفيًا', () => {
  assert.deepEqual([BATH_DEPTH_PREFERENCES.deep.min, BATH_DEPTH_PREFERENCES.deep.max, BATH_DEPTH_PREFERENCES.side.min, BATH_DEPTH_PREFERENCES.side.max], [1.95, 2.9, 1.5, 2.4]);
  const a = evaluateBath({ type: 'deep', depth: 2.2 }); assert.equal(a.preferred, true); assert.equal(a.preliminaryAccept, false);
  const b = evaluateBath({ type: 'side', depth: 2.5, fixturesFit: true, doorClearance: true, ventilation: true }); assert.equal(b.preferred, false); assert.equal(b.preliminaryAccept, true);
});
test('02c: حمامات الأجنحة في C6 بفاحصات المشروع — الأجهزة وفتح الباب والعرض الصافي، والسباكة «لم يُتحقق»، وما لم يتسع ملاحظة صريحة', { timeout: 900000 }, () => {
  const d = shown(genCase('main', 'C6').o)[0], baths = evaluateSuiteBaths(d.doc);
  assert.ok(baths.length >= 2);
  for (const b of baths) { assert.equal(b.plumbing, 'unverified'); assert.ok(['window', 'mechanical'].includes(b.ventilation)); assert.equal(typeof b.doorClearance, 'boolean'); }
  for (const b of baths.filter(x => !x.preliminaryAccept)) assert.ok((d.presentation.notes_ar || []).some(t => t.includes(b.name)), b.name);
});

// ------------------------------------------------------------------ (و) أدلة الحجب والحالات الثلاث
test('02c الحزمة: لا محجوب بلا دليل، ولا رقم مختلق، والتصنيف والرسالة بلا مصطلحات بحث', () => {
  assert.throws(() => assertBlocked({ status: 'blocked', rejections: [] }));
  const r = rejection({ candidateId: 'X', stage: 'review', rule: 'GATE:PARKING', source: 'regulation', reason: 'x', measured: 1, limit: 2, unit: 'موقف' });
  assert.equal(assertBlocked({ status: 'blocked', rejections: [r] }), true);
  assert.throws(() => rejection({ candidateId: 'a', stage: 'review', rule: 'r', source: 's', reason: 'x', measured: NaN }));
  assert.equal(classifyRun({ designs: [] }).status, 'SEARCH_INCOMPLETE'); assert.equal(classifyRun({ designs: [] }).outcome, 'NO_VALID_ALTERNATIVE');
  assert.equal(classifyRun({ designs: [{ presentation: { status: 'hidden', hiddenReasons: [r] } }] }).outcome, 'ALTERNATIVE_HIDDEN');
  assert.equal(classifyRun({ designs: [{ presentation: { status: 'ready' } }], rejected: [{}, {}] }).candidatesRejected, 2);
  assert.equal(classifyRun({ failure: { status: 'PROVEN_INFEASIBLE' } }).status, 'PROVEN_INFEASIBLE');
  const s = clientNotice(classifyRun({}), { requested: 3, shown: 1 }); assert.match(s, /1 من 3/); assert.doesNotMatch(s, /شبكة|القيود الصلبة/); assert.match(s, /لا يثبت/);
  assert.deepEqual(gateEvidence({ id: 'GUEST_ROUTE', value: { routes: [] }, reasons_ar: ['س'] }).measured, null);
});
test('02c H2: البديل المحجوب يحمل سبب بوابة المواقف بالمقيس والحد من الفاحص الحقيقي (المرسوم مقابل المطلوب نظاميًا)، والنتيجة «بديل محجوب» لا نجاح', { timeout: 900000 }, () => {
  const { o } = genCase('heldout', 'H2');
  assert.ok(o, 'بديل مكتمل'); const hid = o.designs.filter(d => d.presentation?.status === 'hidden');
  assert.ok(hid.length >= 1 && !shown(o).length);
  for (const d of hid) assertBlocked(d);
  const pk = hid.flatMap(d => d.presentation.hiddenReasons).find(h => h.rule === 'GATE:PARKING'); assert.ok(pk);
  const g = hid[0].review.gates.find(x => x.id === 'PARKING');
  assert.equal(pk.measured, g.value.bays); assert.equal(pk.limit, g.value.required); assert.equal(pk.unit, 'موقف'); assert.ok(pk.measured < pk.limit);
  assert.equal(o.result.status, 'SEARCH_INCOMPLETE'); assert.equal(o.result.outcome, 'ALTERNATIVE_HIDDEN'); assert.equal(o.result.shownCount, 0);
  for (const r of o.rejected) assert.ok(r.rejections?.length > 0, 'سبب رفض المرشح مسجل');
  const n = shortfallNotice({ requested: 4, shown: 0, shortfall_ar: o.shortfall_ar, hidden: hid.map(d => ({ reasons_ar: d.presentation.hidden_ar })) });
  assert.doesNotMatch(n.lines_ar.join(' '), /عُرض 1 من 4/); assert.match(n.lines_ar.join(' '), /لا يثبت أن طلبك مستحيل/);
  assert.deepEqual(internalLeaks(JSON.stringify(n)), []);
});
test('02c: كل محجوب في كل الحالات المولدة هنا يحمل الحقول الموحدة، والمقيس رقم أو null مع سبب صريح', { timeout: 900000 }, () => {
  for (const { o } of memo.values()) for (const d of o?.designs || []) {
    if (d.presentation?.status !== 'hidden') continue;
    assertBlocked(d);
    for (const h of d.presentation.hiddenReasons) { assert.ok(h.measured === null || Number.isFinite(h.measured)); if (h.measured === null) assert.ok(h.measure_ar && h.measure_ar.length > 5, h.rule); }
  }
});

// ------------------------------------------------------------------ (ز) 01b: المقلط والعقد الواحد والحالات الثلاث في H3
test('01b: «مجلس رجال بمقلط» مفهوم في المحلل (لا unclear) وظيفة طعام للضيوف مرتبطة بالمجلس بلا باب مفروض؛ «قريب» ليس بابًا؛ والباب من نص صريح', () => {
  const a = extractRequirements('5 غرف نوم، مجلس رجال بمقلط، مجلس نساء');
  assert.deepEqual(a.unclear, []); assert.ok(a.understood.some(t => /مقلط/.test(t)));
  const g = a.relations.find(x => x.kind === RELATIONS.GUEST_ACCESS); assert.equal(g.directDoor, 'unspecified'); assert.equal(g.separateRoom, 'unspecified'); assert.equal(g.source, 'client'); assert.equal(g.quote, 'مقلط');
  assert.equal(briefGuestDining(a.brief), true); assert.equal(briefMajlisDoor(a.brief), false);
  assert.equal(clientAsks({ text: a.text, brief: a.brief }).MAJLIS_DINING, false); assert.equal(clientAsks({ text: a.text, brief: a.brief }).SERVE_ROUTE, false);
  const n = extractRequirements('مجلس رجال، طعام قريب من المجلس'); assert.equal(briefMajlisDoor(n.brief), false); assert.equal(briefGuestDining(n.brief), false);
  const dd = extractRequirements('مجلس، المجلس يفتح على الطعام'); assert.equal(briefMajlisDoor(dd.brief), true); assert.equal(clientAsks({ text: dd.text, brief: dd.brief }).MAJLIS_DINING, true);
});
test('01b الحزمة: العقد الواحد للمولّد والمراجع — الكائن نفسه، والقيود المهيكلة محفوظة، ومستدعٍ قديم بلا عقد يأخذ عقدًا واحدًا لكل طلب', () => {
  const r = extractRequirements('مجلس رجال بمقلط، 3 غرف'); r.counts = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
  const P = programV2(r.counts, r), rv = sharedReviewRequest(r, {}, r.counts);
  assert.equal(assertSharedBrief(P.brief, rv.brief), true); assert.equal(canonicalBrief(r), P.brief);
  assert.throws(() => assertSharedBrief(P.brief, { ...P.brief }));
  const legacy = { text: 'مجلس رجال بمقلط', rules: [] }; assert.equal(briefOf(legacy), briefOf(legacy));
  assert.ok(Object.isFrozen(P.brief.relations[0]));
});
test('01b H3: بلا مخطط صالح — البديل المكتمل الذي يخالف شرطًا أساسيًا محجوب بأسبابه (لا يُعرض صالحًا)، والنتيجة «بديل محجوب» لا «مستحيل»، ونص العميل صادق بلا مصطلحات', { timeout: 900000 }, () => {
  const { o, e } = genCase('heldout', 'H3');
  const designs = o?.designs || [];
  assert.equal(shown(o).length, 0, 'لا بديل صالح معروض');
  const result = o ? o.result : e.result;
  assert.notEqual(result.status, 'PROVEN_INFEASIBLE'); assert.equal(result.status, 'SEARCH_INCOMPLETE');
  assert.ok(['ALTERNATIVE_HIDDEN', 'NO_VALID_ALTERNATIVE'].includes(result.outcome));
  for (const d of designs) { assertBlocked(d); assert.ok(d.presentation.hiddenReasons.some(h => ['GUEST_DINING', 'MAJLIS_ISOLATED'].includes(h.rule) || /^GATE:|^R\d/.test(h.rule))); }
  const n = shortfallNotice(o ? { requested: 4, shown: 0, shortfall_ar: o.shortfall_ar, hidden: designs.map(d => ({ reasons_ar: d.presentation.hidden_ar })) } : { requested: 4, shown: 0, report_ar: e.report_ar });
  const txt = n.lines_ar.join(' '); assert.match(txt, /لا يثبت أن طلبك مستحيل|لا يعني/); for (const l of n.lines_ar) if (/مستحيل/.test(l)) assert.match(l, /لا يثبت|لا يعني/, l);
  assert.deepEqual(internalLeaks(JSON.stringify(n)), []); assert.deepEqual(lintClientText(txt), []);
});
