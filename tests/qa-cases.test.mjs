// المجموعة الثابتة للمقارنة (tests/fixtures/qa-cases.json): بنية وسلامة المدخلات وسلوك الحالات المتعارضة.
// لا تُختبر هنا النتائج الجمالية. العيوب المكتشفة (docs/qa-30-cases.md) تظهر كاختبارات todo بالسلوك المرغوب فيه: لا تُفشل المجموعة وتُظهر حالها.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { normalizeLand, generateInitialDesign, diagnoseFit } from '../dist/home-flow.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { reviewDesign } from '../dist/design-review.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { azizPanelModel } from '../dist/aziz-panel.mjs';
import { createSession } from '../dist/design-session.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/qa-cases.json', import.meta.url), 'utf8')), C = id => fx.cases.find(c => c.id === id);
const gen = (c, engine = 'legacy') => { const b = buildBrief(c.text, { land: c.land }), a = { land: c.land, counts: b.counts, requirements: { ...b.requirements, tweaks: { engine } }, keep: 3 }; return { b, out: c.land.floors === 2 ? generateVillaTwoFloors(a) : generateVillaDesigns(a) }; };

test('البنية: 30 حالة بمعرّفات فريدة وكل المجموعات والأحجام المطلوبة', () => {
  assert.equal(fx.cases.length, 30); assert.equal(new Set(fx.cases.map(c => c.id)).size, 30);
  const g = k => fx.cases.filter(c => c.group === k).length;
  assert.deepEqual([g('narrow'), g('normal'), g('large'), g('corner'), g('semisq'), g('conflict')], [8, 11, 2, 3, 2, 4]);
  const sizes = new Set(fx.cases.map(c => `${c.land.width}x${c.land.length}`));
  for (const s of ['10x22', '12.5x25', '12.5x30', '15x25', '20x20', '20x30', '25x30', '30x30']) assert.ok(sizes.has(s), s);
  assert.ok(fx.cases.some(c => c.land.streets.length === 2), 'أرض زاوية');
  assert.ok(fx.cases.some(c => c.land.floors === 1) && fx.cases.some(c => c.land.floors === 2));
  for (const n of [2, 3, 4, 5, 6]) assert.ok(fx.cases.some(c => c.counts.bedrooms === n), n + ' نوم');
  assert.ok(fx.cases.some(c => c.extras.womenEntrance) && fx.cases.some(c => c.counts.majlis === 2 && !c.extras.womenEntrance) && fx.cases.some(c => c.extras.maid) && fx.cases.some(c => c.extras.prepKitchen) && fx.cases.some(c => c.extras.driver));
});
test('كل حالة: دخل صريح كامل، أرض صالحة، والجملة تُفهم بالأعداد الصريحة نفسها', () => {
  for (const c of fx.cases) {
    for (const k of ['id', 'desc', 'text', 'counts', 'extras', 'mandatory', 'preferences']) assert.ok(c[k] !== undefined, `${c.id}.${k}`);
    assert.equal(c.land.floorsExplicit, true, c.id);
    assert.doesNotThrow(() => normalizeLand(c.land), c.id);
    const b = buildBrief(c.text, { land: c.land }).counts, br = buildBrief(c.text, { land: c.land }).requirements;
    assert.equal(b.bedrooms, c.counts.bedrooms, c.id); assert.equal(b.majlis, c.counts.majlis, c.id); assert.equal(b.kitchens, c.counts.kitchens, c.id); assert.equal(b.halls, c.counts.halls, c.id);
    assert.equal(!!br.extras?.maid, c.extras.maid, c.id); assert.equal(!!br.extras?.driver, c.extras.driver, c.id);
    if (c.extras.womenEntrance) assert.equal(!!br.prefs?.womenSeparate, true, c.id);
    assert.equal(!!c.conflict, c.group === 'conflict', c.id);
  }
});
test('حالات متوسطة تنتج تصاميم تحقق سجل الطلب بمراجعة reviewDesign (لا من المولّد)', { timeout: 120000 }, () => {
  for (const id of ['r20x20-f1-b3', 'r25x30-f2-b5m']) {
    const c = C(id), { b, out } = gen(c, 'hybrid'); assert.ok(out.designs.length >= 1, id);
    for (const d of out.designs) { const rep = reviewDesign(parseDoc(typeof d.doc === 'string' ? d.doc : JSON.stringify(d.doc)), { requirements: b.requirements, land: c.land, entry: c.land.entries[0] }); assert.equal(rep.findings.filter(f => f.source === 'request' && f.severity === 'mandatory' && f.state === 'violated').length, 0, id); }
  }
});
test('الحالات المتعارضة: طبقة المحرك لا تُنتج تصميمًا مقلَّصًا بصمت بل ترفض برمز ورقم (المطلوب مقابل المتاح)', () => {
  for (const c of fx.cases.filter(x => x.conflict)) for (const eng of ['legacy', 'hybrid', 'reference']) {
    let err = null; try { gen(c, eng); } catch (e) { err = e; }
    assert.ok(err, `${c.id}/${eng}: كان ينبغي الرفض`); assert.equal(err.code, 'VILLA_NO_FIT', c.id); if (eng !== 'reference') assert.match(err.message, /\d/, 'الرسالة تحمل أرقامًا');
  }
});
test('الموقع في الحالة المتعارضة: يعيد بيان ما تغيّر (fit) ولا يخرج تصميم بلا بيان', { timeout: 120000 }, async () => {
  const c = C('x15x25-f1-b6jmp'), b = buildBrief(c.text, { land: c.land });
  const r = await generateInitialDesign({ land: c.land, rooms: [], discovery: b.discovery, idea: c.text, counts: b.counts, requirements: b.requirements });
  assert.ok(r.fit && Array.isArray(r.fit.applied), 'بيان fit'); assert.ok(r.fit.applied.length > 0 && r.notes.some(n => /بيان ما تغيّر/.test(n)));
});

// --- عيوب مكتشفة (docs/qa-30-cases.md): السلوك المرغوب فيه، todo حتى تُعالج ---
test('D1 طبقة المحرك تنتج تصميمًا لأرض 12.5×25 بدور واحد و3 غرف نوم', { todo: 'D1: VILLA_NO_FIT في المحركات الثلاثة' }, () => { assert.ok(gen(C('n12.5x25-f1-b3')).out.designs.length >= 1); });
test('D4 الموقع لا يخفض 6 غرف نوم بصمت: التخفيض يُعلن للعميل بسببه بالأرقام (قرار المالك: شفافية لا موافقة مسبقة)', { timeout: 120000 }, async () => {
  const c = C('x12.5x25-f1-b6j'), b = buildBrief(c.text, { land: c.land });
  const r = await generateInitialDesign({ land: c.land, rooms: [], discovery: b.discovery, idea: c.text, counts: b.counts, requirements: b.requirements });
  const beds = r.doc.labels.filter(l => l.type === 'bedroom' || l.type === 'master').length;
  assert.ok(beds < 6, 'الأرض لا تتسع لستٍّ: يُخفَّض العدد');
  const m = azizPanelModel(createSession({ land: c.land, counts: b.counts, requirements: b.requirements, discovery: b.discovery, idea: c.text, result: r }), parseDoc(JSON.stringify(r.doc)), {});
  const row = m.rows.find(x => x.key === 'bedrooms');
  assert.ok(row && row.asked === 6 && row.got === beds && row.status === 'cut' && /\d+ م²/.test(row.reason), 'لوحة عزيز تعلن التخفيض بالأرقام');
});
test('D5 تشخيص الحالة المتعارضة يقدّم خيارًا واحدًا على الأقل ينجح فعلًا', { todo: 'D5: كل الخيارات لا تنجح', timeout: 300000 }, async () => {
  const c = C('x15x25-f1-b6jmp'), b = buildBrief(c.text, { land: c.land }), dg = await diagnoseFit({ land: c.land, counts: b.counts, discovery: b.discovery, idea: c.text });
  assert.ok(dg.options.some(o => o.ok));
});
test('D8 تصميم مرجعي بدورين: الوصول إلى الدور الأول قابل للقياس (مرتكز الدرج داخل غرفته)', { todo: 'D8: no-seed على الدور الأول' }, () => {
  const c = C('c20x25-f2-b4we'), { b, out } = gen(c, 'reference'), rep = reviewDesign(parseDoc(typeof out.designs[0].doc === 'string' ? out.designs[0].doc : JSON.stringify(out.designs[0].doc)), { requirements: b.requirements, land: c.land });
  assert.ok(!rep.findings.some(f => /^access:no-seed/.test(f.id)));
});
test('D7 تصاميم legacy بلا مخالفة عزيز INVALID_SCHEMA (جدران بفارق 1 سم)', { todo: 'D7: خزانة ملابس بمضلع منحرف' }, () => {
  const c = C('r15x25-f1-b3'), { b, out } = gen(c, 'legacy');
  for (const d of out.designs) { const rep = reviewDesign(parseDoc(typeof d.doc === 'string' ? d.doc : JSON.stringify(d.doc)), { requirements: b.requirements, land: c.land }); assert.ok(!rep.findings.some(f => /aziz:INVALID_SCHEMA/.test(f.id) && f.state === 'violated')); }
});
