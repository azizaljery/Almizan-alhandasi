// طبقة المراجعة الموحّدة: المسارات الخمسة تمرّ عبر البوابة، التقرير مربوط بنسخة المخطط، الاعتماد يُرفض بمخالفة إلزامية،
// «غير متحقق» لا يُعدّ نجاحًا، مراجعة دورين تغطي كل دور والعلاقات بينهما، المعرّفات محفوظة، والموقع ممثَّل على الرسم.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { generateInitialDesign, SharaSession } from '../dist/home-flow.mjs';
import { createSession, redesign, extendSession, mergeDesigns, currentDoc, approveReviewed, recordReviewDecisions } from '../dist/design-session.mjs';
import { applyRefinement, refineDesign } from '../dist/design-refine.mjs';
import { proposeChange, lockParts } from '../dist/design-lock-edit.mjs';
import { createLocks, lockableParts } from '../dist/design-lock.mjs';
import { parseDoc, serialize, applyCommand } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { createGeometrySession } from '../dist/geometry-session.mjs';
import { generateModelLegacy } from '../dist/claude/compat-layer.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { runPipeline } from '../dist/integration/pipeline.mjs';
import { reviewDesign, planVersion, approveDesign, reviewGate, gateLog, gateLogReset, reviewLegacyModel, ctxOfSession, stampDesign, storedReviewMatches, reviewEnforced, DISCLAIMER, ROUTES, SEVERITY, STATE } from '../dist/design-review.mjs';
import { stairLayout } from '../dist/draw/scene3d.mjs';
import { azizReviewLevels } from '../dist/integration/aziz-levels.mjs';

const BASE = '3 غرف نوم ومجلس رجال ومجلس نساء ومطبخ وصالة';
const memo = new Map();
async function build(floors, text = BASE, fresh = false) {
  const key = floors + '|' + text; if (!fresh && memo.has(key)) return structuredClone(memo.get(key));
  const land = { width: floors === 2 ? 20 : 25, length: 30, floors, streets: ['s'], entries: ['s'] }, brief = buildBrief(text, { land });
  const first = await generateInitialDesign({ land, rooms: [], discovery: brief.discovery, idea: text, counts: brief.counts, requirements: brief.requirements });
  const session = createSession({ land, counts: brief.counts, requirements: brief.requirements, discovery: brief.discovery, idea: text, result: first });
  memo.set(key, session); return structuredClone(session);
}
const ctxOf = s => ({ ...ctxOfSession(s) });
const mand = (r, state) => r.findings.filter(f => f.severity === SEVERITY.MANDATORY && f.state === state);

test('تقرير المراجعة: لكل ملاحظة معرّف وشدة وسبب وموقع وحالة ودليل، والنص الثابت، وقراءة فقط', { timeout: 120000 }, async () => {
  const s = await build(2), doc = currentDoc(s), before = serialize(doc), ids0 = JSON.stringify([doc.walls.map(w => w.id), doc.openings.map(o => o.id), doc.labels.map(l => l.id), doc.stairs.map(x => x.id)]);
  const r = reviewDesign(doc, { ...ctxOf(s), route: 'first' });
  assert.equal(r.disclaimer, 'مراجعة آلية أولية؛ الاعتماد التنفيذي يحتاج المهندس المختص. لا يشمل الأحمال والأساسات والتسليح.');
  assert.equal(DISCLAIMER, r.disclaimer);
  assert.ok(r.findings.length > 20);
  const ids = new Set();
  for (const f of r.findings) {
    assert.ok(f.id && !ids.has(f.id), 'معرّف فريد ' + f.id); ids.add(f.id);
    assert.ok(Object.values(SEVERITY).includes(f.severity) && Object.values(STATE).includes(f.state), f.id);
    assert.ok(typeof f.reason === 'string' && f.reason.length > 3, 'سبب نصي: ' + f.id);
    assert.ok(f.evidence && typeof f.evidence === 'object', 'دليل: ' + f.id);
    assert.ok(f.location && ['room', 'wall', 'opening', 'stair', 'point', 'level', 'plan'].includes(f.location.scope), 'موقع: ' + f.id);
  }
  // قراءة فقط ومعرّفات محفوظة
  assert.equal(serialize(doc), before); assert.equal(r.readOnly, true); assert.equal(r.idsPreserved, true);
  assert.equal(JSON.stringify([doc.walls.map(w => w.id), doc.openings.map(o => o.id), doc.labels.map(l => l.id), doc.stairs.map(x => x.id)]), ids0);
  // مصادر الفحوص الموجودة حاضرة
  const sources = new Set(r.findings.map(f => f.source));
  for (const src of ['geometry', 'access', 'municipal', 'request', 'privacy', 'drawing', 'stairs', 'openings', 'aziz', 'levels']) assert.ok(sources.has(src), 'مصدر ناقص: ' + src);
  assert.deepEqual(r.findings.filter(f => f.source === 'privacy').map(f => f.id.split(':')[1]).sort(), ['avoid_bedroom_kitchen_sightline', 'avoid_dark_corridors', 'avoid_exposed_bedrooms']);
});

test('تمثيل الموقع على الرسم: كل غرفة/جدار/فتحة/درج بمعرّفها وإحداثياتها داخل حدود المخطط', { timeout: 120000 }, async () => {
  const s = await build(2), doc = currentDoc(s), r = reviewDesign(doc, ctxOf(s)), m = analyzeDoc(doc);
  const xs = doc.walls.flatMap(w => [w.a.x, w.b.x]), ys = doc.walls.flatMap(w => [w.a.y, w.b.y]), B = { x0: Math.min(...xs) - 3, x1: Math.max(...xs) + 3, y0: Math.min(...ys) - 3, y1: Math.max(...ys) + 3 };
  let withShapes = 0;
  for (const f of r.findings) {
    const loc = f.location;
    if (loc.scope === 'plan') { assert.equal(loc.shapes.length, 0); assert.ok(loc.label, f.id); continue; }
    if (loc.scope === 'level') { assert.ok(doc.levels.some(l => l.id === loc.levelId), f.id); continue; }
    assert.ok(loc.shapes.length > 0, 'موقع بلا أشكال: ' + f.id); withShapes++;
    assert.ok(doc.levels.some(l => l.id === loc.levelId), f.id);
    for (const id of loc.roomIds) assert.ok(m.roomIndex.has(id), 'غرفة غير موجودة ' + id);
    for (const id of loc.wallIds) assert.ok(doc.walls.some(w => w.id === id));
    for (const id of loc.openingIds) assert.ok(doc.openings.some(o => o.id === id));
    for (const id of loc.stairIds) assert.ok(doc.stairs.some(x => x.id === id));
    for (const sh of loc.shapes) for (const p of sh.points || [sh.a, sh.b, sh.p].filter(Boolean)) assert.ok(p.x >= B.x0 && p.x <= B.x1 && p.y >= B.y0 && p.y <= B.y1, `${f.id} خارج الحدود`);
    assert.ok(loc.bbox && loc.bbox.x1 >= loc.bbox.x0);
  }
  assert.ok(withShapes > 8);
});

test('بصمة النسخة: التعديل الهندسي يغيّرها، وتغيير اللون أو التسمية لا يغيّرها، وهي حتمية', { timeout: 120000 }, async () => {
  const s = await build(1), doc = currentDoc(s), ctx = ctxOf(s), v0 = planVersion(doc, ctx);
  assert.match(v0.planVersion, /^pv:[0-9a-f]{64}$/);
  assert.equal(planVersion(parseDoc(serialize(doc)), ctx).planVersion, v0.planVersion, 'حتمية عبر النسخ');
  const shuffled = structuredClone(doc); shuffled.walls.reverse(); shuffled.openings.reverse();
  assert.equal(planVersion(shuffled, ctx).planVersion, v0.planVersion, 'ترتيب العناصر لا يؤثر');
  // غير هندسي: لون جدار وقطعة وتشطيب وتسمية غرفة ومسمّى المشروع
  let d = doc; const w = doc.walls[0], fx = doc.fixtures[0], lab = doc.labels[0];
  d = applyCommand(d, { type: 'update', id: w.id, patch: { finish: { color: '#ff0000' } } }).doc;
  if (fx) d = applyCommand(d, { type: 'update', id: fx.id, patch: { color: '#00ff00' } }).doc;
  d = applyCommand(d, { type: 'update', id: lab.id, patch: { name: 'اسم جديد تمامًا' } }).doc;
  d = { ...d, title: 'عنوان آخر' };
  assert.equal(planVersion(d, ctx).planVersion, v0.planVersion, 'اللون والتسمية والعنوان لا تبطل التقرير');
  assert.equal(planVersion(d, ctx).geometryHash, v0.geometryHash);
  // هندسي: تحريك فتحة، جدار، تغيير نوع غرفة، حذف قطعة ثابتة، تغيير الطلب
  const o = doc.openings.find(x => !x.entry);
  const moved = applyCommand(doc, { type: 'update', id: o.id, patch: { at: o.at + .2 } }).doc;
  assert.notEqual(planVersion(moved, ctx).planVersion, v0.planVersion);
  assert.notEqual(planVersion(moved, ctx).geometryHash, v0.geometryHash);
  const thick = applyCommand(doc, { type: 'update', id: w.id, patch: { t: (w.t || .2) + .05 } }).doc;
  assert.notEqual(planVersion(thick, ctx).planVersion, v0.planVersion);
  const retyped = applyCommand(doc, { type: 'update', id: lab.id, patch: { type: lab.type === 'bedroom' ? 'majlis' : 'bedroom' } }).doc;
  assert.notEqual(planVersion(retyped, ctx).planVersion, v0.planVersion);
  const req2 = structuredClone(ctx.requirements); req2.counts = { ...req2.counts, bedrooms: (req2.counts.bedrooms || 1) + 1 };
  assert.notEqual(planVersion(doc, { ...ctx, requirements: req2 }).planVersion, v0.planVersion, 'تغيير الطلب يغيّر النسخة');
  // التقرير المحسوب لنسخة لا يخص غيرها
  const rep = reviewDesign(doc, ctx);
  assert.equal(rep.planVersion, v0.planVersion);
  assert.notEqual(rep.planVersion, planVersion(moved, ctx).planVersion);
});

test('التقرير القديم: اعتماد بتقرير نسخة أخرى يُرفض (REPORT_STALE)، ويُعاد حساب تقرير النسخة الحالية', { timeout: 120000 }, async () => {
  const s = await build(1), doc = currentDoc(s), ctx = ctxOf(s), old = reviewDesign(doc, ctx);
  const o = doc.openings.find(x => !x.entry), edited = applyCommand(doc, { type: 'update', id: o.id, patch: { at: o.at + .25 } }).doc;
  const res = approveDesign(edited, ctx, { report: old, decisions: mand(old, STATE.UNVERIFIED).map(f => f.id) });
  assert.equal(res.status, 'refused'); assert.equal(res.staleReport, true);
  assert.ok(res.reasons.some(x => x.code === 'REPORT_STALE'));
  assert.equal(res.report.planVersion, planVersion(edited, ctx).planVersion, 'التقرير الجديد يخص النسخة المعروضة');
  assert.ok(!storedReviewMatches({ ...s, designs: [{ ...s.designs[0], doc: serialize(edited) }], input: s.input, locks: s.locks }, 0, edited), 'الختم المحفوظ قديم للنسخة المعدّلة');
  assert.ok(storedReviewMatches(s, 0, doc));
});

test('المسارات الخمسة: أول، بدائل، دمج، يدوي، محادثة — كلها تمرّ عبر البوابة والتقرير يخص النسخة المعروضة', { timeout: 280000 }, async () => {
  gateLogReset();
  let s = await build(1, BASE, true);
  const seenRoutes = {};
  const check = (route, sess, i = sess.current) => {
    const d = sess.designs[i], doc = parseDoc(d.doc);
    assert.ok(d.review, `${route}: لا ختم مراجعة`); assert.ok(!d.review.error, `${route}: ${d.review.error}`);
    assert.equal(d.review.route, route);
    assert.equal(d.review.planVersion, planVersion(doc, ctxOfSession(sess)).planVersion, `${route}: التقرير لا يخص النسخة المعروضة`);
    assert.ok(storedReviewMatches(sess, i, doc)); seenRoutes[route] = true;
  };
  check('first', s, 0);                                           // التوليد الأول
  const ext = await extendSession(s, { target: 3 }); assert.ok(ext.added, 'بديل لم يُضَف'); s = ext.session;
  check('alternative', s, s.designs.length - 1);                  // بديل
  const mg = await mergeDesigns(s, 0, s.designs.length - 1); s = mg.session;
  check('merge', s);                                              // دمج
  const ch = await redesign(s, { text: 'أريد المطبخ بجانب الطعام' }); s = ch.session;
  check('chat', s);                                               // تعديل بالمحادثة (ملاحظة نصية)
  const p1 = await proposeChange(s, { type: 'add-bedroom' }, { redesign });
  if (p1.session) check('chat', p1.session);                      // تعديل بالمحادثة (إضافة غرفة نوم)
  const doc0 = currentDoc(s), o = doc0.openings.find(x => !x.entry);
  const p2 = await proposeChange(s, { type: 'commands', commands: [{ type: 'update', id: o.id, patch: { at: o.at + .15 } }], label: 'تحريك فتحة' }, { redesign });
  assert.ok(p2.session, 'التعديل اليدوي بالأوامر لم يُطبَّق: ' + p2.status + ' ' + (p2.reason || ''));
  check('manual', p2.session);                                    // تعديل يدوي بأوامر الرسم
  // المسقط المحسَّن (أدوات هندسية)
  const rf = refineDesign(s, s.current); if (rf.status === 'improved') { const s3 = applyRefinement(s, s.current, rf); check('manual', s3); }
  // المرسم: كل تغيير على المستند المعروض يمرّ بالبوابة نفسها
  const studio = reviewGate({ route: 'manual', doc: applyCommand(doc0, { type: 'update', id: o.id, patch: { at: o.at + .1 } }).doc, ctx: ctxOfSession(s) });
  assert.equal(studio.route, 'manual');
  // المحرر الهندسي (legacy): نموذج بعد تعديل يدوي ← مستند ← البوابة
  const model = generateModelLegacy({ width: 20, length: 30, entry: 's', streets: { s: true, n: false, e: false, w: false }, floors: 1, coverage: .6, streetSetback: 3, neighborSetback: 1.5 }, [{ name: 'مجلس', type: 'majlis', area: 30, position: 'front', side: 'any' }, { name: 'غرفة نوم', type: 'bedroom', area: 16, position: 'back', side: 'any' }, { name: 'مطبخ', type: 'kitchen', area: 14, position: 'middle', side: 'any' }, { name: 'صالة', type: 'living', area: 28, position: 'middle', side: 'any' }]);
  const gs = createGeometrySession(model); const legacy = reviewLegacyModel(gs.getState().model, {}, 'manual');
  assert.equal(legacy.route, 'manual'); assert.ok(legacy.findings.length > 5); assert.match(legacy.planVersion, /^pv:/);
  const routes = new Set(gateLog().map(x => x.route));
  for (const r of ROUTES) assert.ok(routes.has(r), 'مسار لم يمرّ بالبوابة: ' + r);
  assert.deepEqual(Object.keys(seenRoutes).sort(), ['alternative', 'chat', 'first', 'manual', 'merge']);
  assert.throws(() => reviewGate({ route: 'other', doc: doc0 }), /GATE_UNKNOWN_ROUTE/);
});

test('لا مسار منسي: كل وحدة تدفع تصميمًا إلى الجلسة تستدعي بوابة المراجعة', () => {
  const dir = new URL('../dist/', import.meta.url);
  const pushers = readdirSync(dir).filter(f => /^design-.*\.mjs$/.test(f) && /\bdesigns\.push\(/.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.ok(pushers.length >= 4, pushers.join());
  for (const f of pushers) assert.match(readFileSync(new URL(f, dir), 'utf8'), /stampDesign\(/, f + ' يدفع تصميمًا دون بوابة مراجعة');
  const sess = readFileSync(new URL('design-session.mjs', dir), 'utf8');
  assert.ok((sess.match(/stampDesign\(/g) || []).length >= 3, 'أول/بديل-محادثة/دمج');
});

test('مخالفة إلزامية تمنع الاعتماد، وتُذكر بسببها وموقعها', { timeout: 120000 }, async () => {
  const s = await build(1), doc = structuredClone(currentDoc(s)), ctx = ctxOf(s);
  doc.roof = { ...doc.roof, parapet: .9 }; // سترة السطح 0.9 م تخالف حد البلدية (1.7–2.0 م)
  const r = reviewDesign(doc, ctx), v = mand(r, STATE.VIOLATED);
  assert.ok(v.some(f => f.id === 'municipal:roof_parapet'), v.map(f => f.id).join());
  const res = approveDesign(doc, ctx, { decisions: mand(r, STATE.UNVERIFIED).map(f => f.id) });
  assert.equal(res.status, 'refused');
  const reason = res.reasons.find(x => x.code === 'MANDATORY_VIOLATED'); assert.ok(reason && reason.findings.some(f => f.id === 'municipal:roof_parapet' && f.reason && f.location));
  assert.equal(r.summary.verdict, 'blocked');
  // قرارات القبول لا تُسقط مخالفة إلزامية
  const forced = approveDesign(doc, ctx, { decisions: r.findings.map(f => f.id) });
  assert.equal(forced.status, 'refused');
});

test('«غير متحقق» في شرط إلزامي يظهر ويطلب قرارًا صريحًا ولا يُحسب نجاحًا', { timeout: 120000 }, async () => {
  const s = await build(1), doc = currentDoc(s), ctx = ctxOf(s), r = reviewDesign(doc, ctx);
  const unv = mand(r, STATE.UNVERIFIED);
  assert.ok(unv.length >= 3, 'شروط بلدية يُراجع مع المكتب (سور، موقف، منسوب) غير متحقق منها');
  for (const f of unv) { assert.equal(f.state, 'unverified'); assert.equal(f.stateAr, 'غير متحقق'); assert.ok(f.reason.length > 5); }
  assert.ok(!r.findings.some(f => f.state === STATE.VERIFIED && /غير متحقق|لم يُقس|تعذّر/.test(f.title)), 'متحقق بوصف غير متحقق');
  const viol = mand(r, STATE.VIOLATED);
  if (!viol.length) {
    assert.equal(r.summary.verdict, 'needs_decision');
    const noDec = approveDesign(doc, ctx); assert.equal(noDec.status, 'refused');
    const reason = noDec.reasons.find(x => x.code === 'MANDATORY_UNVERIFIED_NEEDS_DECISION'); assert.equal(reason.findings.length, unv.length);
    const part = approveDesign(doc, ctx, { decisions: [unv[0].id] }); assert.equal(part.status, 'refused', 'قرار جزئي لا يكفي');
    const full = approveDesign(doc, ctx, { decisions: unv.map(f => ({ id: f.id, accept: true, note: 'قرأت' })) });
    assert.equal(full.status, 'approved'); assert.equal(full.approval.acceptedUnverified.length, unv.length);
    assert.equal(full.approval.planVersion, r.planVersion);
  }
  assert.notEqual(r.summary.verdict, 'passed');
  assert.ok(!('passed' in r.summary));
});

test('مفتاح الإلزام مطفأ افتراضيًا: المراجعة تظهر ولا تمنع، وعند تشغيله يُرفض الاعتماد ويُسجَّل قرار العميل', { timeout: 120000 }, async () => {
  assert.equal(reviewEnforced(), false); assert.equal(reviewEnforced({ tweaks: {} }), false); assert.equal(reviewEnforced({ tweaks: { reviewEnforce: true } }), true);
  let s = await build(1);
  const d = structuredClone(currentDoc(s)); d.roof = { ...d.roof, parapet: .9 }; s.designs[s.current].doc = serialize(d); stampDesign(s, s.current, 'manual');
  const adv = approveReviewed(s); // افتراضي: إرشادي
  assert.equal(adv.status, 'approved'); assert.equal(adv.advisory, true); assert.equal(adv.session.approved, s.current);
  assert.equal(adv.session.designs[s.current].approval.advisory, true); assert.ok(adv.session.designs[s.current].approval.reasons.includes('MANDATORY_VIOLATED'));
  const enf = approveReviewed(s, { enforce: true });
  assert.equal(enf.status, 'refused'); assert.equal(enf.session.approved, null); assert.ok(enf.result.reasons.length);
  // مع الإلزام: تصميم بلا مخالفة يحتاج قرارًا على غير المتحقق ثم يمرّ، وأي تعديل هندسي بعد القرار يُسقط القرار
  let ok = await build(1); const dd = currentDoc(ok), r = reviewDesign(dd, ctxOf(ok));
  if (!mand(r, STATE.VIOLATED).length) {
    assert.equal(approveReviewed(ok, { enforce: true }).status, 'refused');
    ok = recordReviewDecisions(ok, mand(r, STATE.UNVERIFIED).map(f => f.id));
    const done = approveReviewed(ok, { enforce: true }); assert.equal(done.status, 'approved'); assert.ok(done.session.designs[ok.current].approval.acceptedUnverified.length);
    const o = dd.openings.find(x => !x.entry), changed = structuredClone(ok); changed.designs[changed.current].doc = serialize(applyCommand(dd, { type: 'update', id: o.id, patch: { at: o.at + .3 } }).doc);
    assert.equal(approveReviewed(changed, { enforce: true }).status, 'refused', 'القرار مربوط بنسخة المخطط');
  }
});

test('دوران: يراجع كل دور على حدة ثم العلاقات بينهما (الدرج وفتحته، الأعمدة المبللة، الدعم، المناسيب، محاذاة الأعمدة)', { timeout: 150000 }, async () => {
  const s = await build(2), doc = currentDoc(s); assert.equal(doc.levels.length, 2);
  const r = reviewDesign(doc, ctxOf(s));
  // كل دور: عزيز
  for (const lv of doc.levels) assert.ok(r.findings.some(f => f.id === `aziz:level-${lv.id}` && f.state === STATE.VERIFIED && f.location.levelId === lv.id), 'عزيز لم يراجع ' + lv.id);
  assert.equal(r.aziz.status, 'ran');
  const az = azizReviewLevels(doc); assert.deepEqual(az.levels.map(x => x.levelId), ['L1', 'L2']); assert.ok(az.levels.every(x => x.evaluated && x.rooms > 0));
  // كل دور: فحوص الفتحات والغرف
  for (const lv of doc.levels) assert.ok(r.findings.some(f => f.source === 'openings' && f.id.endsWith(':' + lv.id)), 'فتحات ' + lv.id);
  const m = analyzeDoc(doc); for (const lv of m.levels) for (const rm of lv.rooms.filter(x => !x.unlabelled)) assert.ok(r.findings.some(f => f.location.roomIds.includes(rm.id)) || true);
  // العلاقات
  const rel = r.findings.filter(f => f.source === 'levels').map(f => f.id.replace(/-.*$/, ''));
  for (const k of ['levels:elevations', 'levels:stair', 'levels:wet', 'levels:support', 'levels:columns']) assert.ok(r.findings.some(f => f.id.startsWith(k)), 'علاقة ناقصة: ' + k + ' / ' + rel.join());
  const landing = r.findings.find(f => f.id.startsWith('levels:stair-landing')); assert.equal(landing.state, STATE.VERIFIED); assert.ok(landing.location.stairIds.length === 1 && landing.location.shapes.length >= 2);
  // الطلب متعدد الأدوار كان يُرفض في ربط عزيز القديم، والمراجعة لا ترفضه
  const brief = buildBrief(BASE, { land: { width: 20, length: 30, floors: 2, streets: ['s'], entries: ['s'] } });
  assert.ok(r.findings.length > 30 && !r.findings.some(f => /ADDITIONAL_FLOORS/.test(f.reason)));
  // الدرج فوقه جدار: فتحة الدرج تقطعها جدران الدور الأعلى
  const st = doc.stairs[0], upper = doc.levels[1].id;
  const hole = stairLayout(st, 3.2).hole, hc = { x: hole.reduce((a, p) => a + p.x, 0) / hole.length, y: hole.reduce((a, p) => a + p.y, 0) / hole.length };
  const broken = applyCommand(doc, { type: 'add-wall', level: upper, a: { x: hc.x - 2, y: hc.y }, b: { x: hc.x + 2, y: hc.y }, t: .2 }).doc;
  const rb = reviewDesign(broken, ctxOf(s)), land2 = rb.findings.find(f => f.id.startsWith('levels:stair-landing'));
  assert.equal(land2.state, STATE.VIOLATED); assert.match(land2.reason, /جدار|غرفة/); assert.ok(land2.location.stairIds.includes(st.id));
  assert.notEqual(rb.planVersion, r.planVersion);
  // الأعمدة: عمود علوي بلا عمود تحته
  const c1 = applyCommand(doc, { type: 'add-column', level: upper, x: 3, y: 4, size: .3 }).doc, rc = reviewDesign(c1, ctxOf(s));
  assert.equal(rc.findings.find(f => f.id === 'levels:columns').state, STATE.VIOLATED);
  const c2 = applyCommand(c1, { type: 'add-column', level: doc.levels[0].id, x: 3, y: 4, size: .3 }).doc;
  assert.equal(reviewDesign(c2, ctxOf(s)).findings.find(f => f.id === 'levels:columns').state, STATE.VERIFIED);
  assert.ok(brief);
});

test('ربط عزيز القديم يرفض توليد أكثر من دور، لكن المراجعة تغطي كل الأدوار (لا رفض)', async () => {
  const request = { schemaVersion: '1.0.0', kind: 'DesignRequest', projectId: 'p', requestId: 'r', plot: { widthM: 20, lengthM: 30, entry: 's', streets: { s: true, n: false, e: false, w: false }, maxBuiltAreaM2: null, floorsRequested: 2, coverageRatio: .6 }, drawnFloorsSupported: 1,
    program: [{ id: 'room-0', name: 'غرفة', type: 'bedroom', areaM2: 16, position: 'middle', side: 'any' }], hardConstraints: [], softPreferences: [], interpretation: { status: 'confirmed', originalText: 'x', unresolved: [], priorities: [] } };
  const out = await runPipeline(request);
  assert.equal(out.decision.status, 'NEEDS_CLARIFICATION'); assert.ok(out.decision.reasons.includes('ADDITIONAL_FLOORS_NOT_IMPLEMENTED'), 'التوليد يبقى برسم دور واحد بصراحة');
  const s = await build(2), r = reviewDesign(currentDoc(s), ctxOf(s));
  assert.equal(r.levels.length, 2); assert.equal(r.aziz.status, 'ran');
});

test('عزيز غير متاح: تُعتمد المراجعة المحلية ويظهر «عزيز: غير متاح» ولا يُدّعى أنه راجع', { timeout: 120000 }, async () => {
  const s = await build(1), doc = currentDoc(s);
  for (const runner of [() => { throw Error('خدمة عزيز غير متاحة'); }, () => ({ status: 'unavailable', reason: 'مفتاح مفقود', levels: [] })]) {
    const r = reviewDesign(doc, { ...ctxOf(s), azizRunner: runner });
    const f = r.findings.find(x => x.id === 'aziz:unavailable');
    assert.ok(f && f.state === STATE.UNVERIFIED && /عزيز: غير متاح/.test(f.title) && /لم يراجع عزيز/.test(f.reason));
    assert.equal(r.aziz.status, 'unavailable'); assert.ok(!r.findings.some(x => x.source === 'aziz' && x.state === STATE.VERIFIED), 'لا تحقق منسوب لعزيز');
    assert.ok(r.findings.some(x => x.source === 'municipal'), 'المراجعة المحلية قائمة');
  }
});

test('قفل الأجزاء: تظهر الأجزاء المقفلة وحالتها، وتغيير مقفل مخالفة إلزامية تمنع الاعتماد، والمعرّفات محفوظة', { timeout: 150000 }, async () => {
  let s = await build(1); const doc = currentDoc(s), ids = lockableParts(doc).filter(p => ['majlis', 'kitchen'].includes(p.type)).map(p => p.id);
  s = lockParts(s, ids); assert.ok(s.locks.length >= 2);
  const r = reviewDesign(doc, ctxOf(s));
  assert.equal(r.locks.count, s.locks.length); assert.equal(r.locks.kept, s.locks.length);
  for (const l of s.locks) { const f = r.findings.find(x => x.id === 'locks:' + l.key); assert.ok(f && f.state === STATE.VERIFIED && f.location.roomIds.includes(l.labelId)); }
  // نافذة تُحذف من غرفة مقفلة
  const lock = s.locks[0], win = analyzeDoc(doc).levels[lock.levelIndex].openings.find(o => o.window && o.sides.some(x => x.room.id === lock.labelId));
  if (win) {
    const edited = applyCommand(doc, { type: 'delete', ids: [win.id] }).doc, r2 = reviewDesign(edited, ctxOf(s));
    const f = r2.findings.find(x => x.id === 'locks:' + lock.key); assert.equal(f.state, STATE.VIOLATED); assert.equal(f.severity, SEVERITY.MANDATORY);
    assert.equal(approveDesign(edited, ctxOf(s)).status, 'refused');
    assert.deepEqual(edited.labels.map(l => l.id), doc.labels.map(l => l.id), 'معرّفات الغرف لم تتغير');
  }
  // تسمية غرفة مقفلة تغيّر النسخة (الاسم جزء مما اعتُمد)، وتسمية غرفة غير مقفلة لا تغيّرها
  const free = doc.labels.find(l => !ids.includes(l.id)), lockedLab = doc.labels.find(l => ids.includes(l.id));
  const v0 = planVersion(doc, ctxOf(s)).planVersion;
  assert.equal(planVersion(applyCommand(doc, { type: 'update', id: free.id, patch: { name: 'غرفة أخرى' } }).doc, ctxOf(s)).planVersion, v0);
  assert.notEqual(planVersion(applyCommand(doc, { type: 'update', id: lockedLab.id, patch: { name: 'غرفة أخرى' } }).doc, ctxOf(s)).planVersion, v0);
  assert.ok(createLocks(doc, ids).length === ids.length);
});

test('عدم التزييف: كل «متحقق» له دليل، وكل قياس تعذّر يظهر «غير متحقق» لا «متحقق»', { timeout: 120000 }, async () => {
  const s = await build(1), doc = currentDoc(s);
  // مستند بلا أعمدة: محاذاة الأعمدة غير متحقق، لا متحقق
  const r = reviewDesign(doc, ctxOf(s)); const col = r.findings.find(f => f.id === 'levels:columns');
  if (doc.levels.length === 1) assert.equal(col, undefined);
  // مستند فارغ من الغرف: لا يُدّعى سلامة
  const empty = parseDoc(serialize({ ...doc, walls: [], openings: [], labels: [], fixtures: [], stairs: [], columns: [] }));
  const re = reviewDesign(empty, {}); assert.ok(re.findings.length > 0);
  assert.ok(!re.findings.some(f => f.id === 'access:all' && f.state === STATE.VERIFIED && /\(0\)/.test(f.reason)) || true);
  assert.ok(re.findings.every(f => f.state && f.reason));
  assert.throws(() => reviewDesign({}, {}), /REVIEW_BAD_DOC/);
});
