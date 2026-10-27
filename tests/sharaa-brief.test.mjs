// شرعاء V2 — اختبارات وحدة الملف (brief.mjs) والمحوّل (adapter.mjs). لا توليد هنا: أسرع من القبول.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLand } from '../dist/home-flow.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import * as B from '../dist/sharaa/brief.mjs';
import { toEngineInput } from '../dist/sharaa/adapter.mjs';

const land = (o = {}) => normalizeLand({ length: 25, width: 12.5, streets: ['s'], entries: ['s'], floors: 1, ...o }).land;
const fresh = o => B.createBrief({ land: land(o) });
const ex = (b, text, counts = {}) => B.applyExtraction(b, extractRequirements(text, { counts }), text);

test('الأرض: الطول شمال/جنوب = depthM والعرض شرق/غرب = widthM، والارتدادات من اللائحة فقط', () => {
  const b = fresh();
  assert.equal(b.land.depthM, 25); assert.equal(b.land.widthM, 12.5); assert.equal(b.land.areaM2, 312.5);
  assert.equal(b.land.revision, 1); assert.equal(b.land.setbacks.front, 3); assert.equal(b.land.setbacks.left, 1.5);
  assert.equal(b.land.setbacks.verified, false, 'عرض الشارع مجهول: الأمامي قيمة افتراضية لا نظامية');
  const b2 = fresh({ streetWidth: 20 });
  assert.equal(b2.land.setbacks.front, 4); assert.equal(b2.land.setbacks.verified, true);
  assert.equal(b2.land.orientation, undefined, 'الاتجاه غير مدعوم: لا يُملأ');
});
test('makeMeta: استنتاج الذكاء والافتراض لا يصيران إلزاميين ولا مؤكدين', () => {
  const m = B.makeMeta({ source: 'ai_inference', priority: 'mandatory', verification: 'confirmed' });
  assert.equal(m.priority, 'preferred'); assert.equal(m.verification, 'needs_confirmation'); assert.equal(m.priorityCapped, true);
  assert.equal(B.makeMeta({ source: 'design_default', priority: 'mandatory' }).priority, 'preferred');
  assert.equal(B.makeMeta({ source: 'client_answer', priority: 'mandatory' }).verification, 'confirmed');
  assert.throws(() => B.makeMeta({ source: 'x' }));
});
test('تأكيد العميل وحده يرفع الاستنتاج؛ مصدر أدنى لا يستبدل أعلى', () => {
  let b = fresh();
  b = B.upsertSpace(b, { type: 'maid', count: 1, source: 'ai_inference', priority: 'mandatory' });
  assert.equal(B.spaceOf(b, 'maid').priority, 'preferred');
  b = B.decide(b, 'space:maid', { priority: 'mandatory' });
  assert.equal(B.spaceOf(b, 'maid').source, 'client_confirmed'); assert.equal(B.spaceOf(b, 'maid').priority, 'mandatory');
  const b2 = B.upsertSpace(b, { type: 'maid', count: 0, source: 'ai_inference' });
  assert.equal(B.spaceOf(b2, 'maid').count, 1, 'الاستنتاج لا يغيّر ما أكده العميل');
});
test('«قريب» لا يتحول إلى «باب مباشر» (استخراج المواصفة: المقلط قريب من المجلس)', () => {
  const b = ex(fresh(), 'أبي المقلط قريب من المجلس').brief;
  const r = b.relations.find(x => x.from === 'guest_dining' && x.to === 'male_majlis');
  assert.ok(r, JSON.stringify(b.relations)); assert.equal(r.relation, 'near'); assert.equal(r.priority, 'preferred'); assert.equal(r.verification, 'needs_confirmation'); assert.equal(r.source, 'client_free_text');
  assert.match(r.originalText, /قريب/);
  const e = toEngineInput(b);
  const rule = e.requirements.rules.find(x => x.briefRef.startsWith('relation:'));
  assert.equal(rule.kind, 'near'); assert.notEqual(rule.kind, 'adjacent'); assert.equal(rule.level, 'prefer');
  assert.ok(e.report.assumptions.some(a => a.id === 'near-measure' && a.needsApproval), 'معيار القرب يُعرض للموافقة لا يُخترع');
});
test('«باب مباشر» علاقة مستقلة وتُعلن محدودة الدعم', () => {
  let b = fresh();
  b = B.upsertSpace(b, { type: 'kitchen', count: 1, source: 'client_answer' }); b = B.upsertSpace(b, { type: 'dining', count: 1, source: 'client_answer' });
  b = B.addRelation(b, { from: 'kitchen', to: 'dining', relation: 'direct_access', source: 'client_answer', priority: 'mandatory' });
  const e = toEngineInput(b);
  assert.equal(e.requirements.rules[0].kind, 'adjacent'); assert.equal(e.requirements.rules[0].level, 'must');
  assert.ok(e.report.limited.some(l => /الملاصقة/.test(l.text_ar)));
});
test('تجنب الانكشاف غير مدعوم: يُسجَّل ولا يُرسل', () => {
  let b = fresh();
  b = B.upsertSpace(b, { type: 'master', count: 1, source: 'client_answer' }); b = B.upsertSpace(b, { type: 'male_majlis', count: 1, source: 'client_answer' });
  b = B.addRelation(b, { from: 'master', to: 'male_majlis', relation: 'avoid_visibility', source: 'client_answer', priority: 'mandatory' });
  assert.equal(b.relations[0].verification, 'unsupported');
  const e = toEngineInput(b);
  assert.equal(e.requirements.rules.length, 0); assert.equal(e.report.unsupported.length, 1);
});
test('إلزامي غير مؤكد لا يُرسل صلبًا أبدًا (يُرسل تفضيلًا ويمنع الجاهزية)', () => {
  const b = ex(fresh(), 'المطبخ في الخلف لازم').brief;
  assert.equal(b.placements[0].priority, 'mandatory'); assert.equal(b.placements[0].verification, 'needs_confirmation');
  const e = toEngineInput(b);
  assert.equal(e.requirements.rules[0].level, 'prefer'); assert.ok(e.blockers.some(x => x.type === 'UNCONFIRMED_MANDATORY'));
  const b2 = B.decide(b, 'placement:kitchen@back', { priority: 'mandatory' });
  const e2 = toEngineInput(b2);
  assert.equal(e2.requirements.rules[0].level, 'must'); assert.ok(!e2.blockers.some(x => x.type === 'UNCONFIRMED_MANDATORY'));
});
test('تغيير الإجابة يحفظ التاريخ والنص الأصلي ويسجل القرار ويعطّل العلاقات المتأثرة ولا يحذفها', () => {
  let b = fresh();
  b = B.upsertSpace(b, { type: 'male_majlis', count: 1, source: 'client_answer', originalText: 'أبي مجلس' });
  b = B.upsertSpace(b, { type: 'kitchen', count: 1, source: 'client_answer' });
  b = B.addRelation(b, { from: 'kitchen', to: 'male_majlis', relation: 'separate', detail: 'far', source: 'client_answer', priority: 'preferred', originalText: 'المطبخ بعيد عن المجلس' });
  assert.equal(b.relations[0].active, true);
  b = B.upsertSpace(b, { type: 'male_majlis', count: 0, source: 'client_answer', originalText: 'لا، بدون مجلس' });
  const s = B.spaceOf(b, 'male_majlis');
  assert.equal(s.count, 0); assert.equal(s.history.length, 1); assert.equal(s.history[0].originalText, 'أبي مجلس'); assert.equal(s.originalText, 'لا، بدون مجلس');
  assert.ok(b.decisions.some(d => /1 ← 0/.test(d.description)));
  assert.equal(b.relations.length, 1); assert.equal(b.relations[0].active, false);
  assert.equal(b.relations[0].originalText, 'المطبخ بعيد عن المجلس');
  b = B.upsertSpace(b, { type: 'male_majlis', count: 1, source: 'client_answer' });
  assert.equal(b.relations[0].active, true);
});
test('تعارض أمام/خلف وقريب/منفصل يُكشف ولا يُحسم تلقائيًا؛ الحسم قرار العميل', () => {
  let b = fresh();
  b = B.upsertSpace(b, { type: 'kitchen', count: 1, source: 'client_answer' });
  b = B.addPlacement(b, { space: 'kitchen', side: 'front', source: 'client_free_text', priority: 'mandatory' });
  b = B.addPlacement(b, { space: 'kitchen', side: 'back', source: 'client_free_text', priority: 'mandatory' });
  assert.equal(b.conflicts.length, 1); assert.equal(b.conflicts[0].type, 'place-opposite');
  assert.ok(toEngineInput(b).blockers.some(x => x.type === 'CONFLICT'));
  const c = b.conflicts[0];
  b = B.resolveConflict(b, c.id, c.options[1].id);
  assert.equal(b.conflicts.length, 0); assert.equal(b.placements.filter(p => p.active).length, 1);
  assert.equal(b.placements.length, 2, 'البند المتنازل عنه محفوظ لا محذوف');
});
test('دور علوي على أرض بدور واحد تعارض؛ خياراه: أرضي أو تعديل الأرض من مرحلتها', () => {
  let b = fresh();
  b = B.upsertSpace(b, { type: 'bedroom', count: 3, floorPreference: 1, source: 'client_answer', priority: 'mandatory' });
  assert.equal(b.conflicts[0].type, 'single-floor-two-floor-features');
  assert.ok(b.conflicts[0].options.some(o => o.needsLandStep));
  const b2 = B.resolveConflict(b, b.conflicts[0].id, 'ground:bedroom');
  assert.equal(b2.conflicts.length, 0); assert.equal(B.spaceOf(b2, 'bedroom').floorPreference, 0);
});
test('تغيّر الأرض: تزداد المراجعة وتُراجع القيود المتأثرة وتبقى الإجابات', () => {
  let b = fresh();
  b = B.upsertSpace(b, { type: 'male_majlis', count: 1, minClearWidthM: 4, minClearDepthM: 6, source: 'client_confirmed', priority: 'mandatory' });
  b = B.addPlacement(b, { space: 'kitchen', side: 'back', source: 'client_answer' });
  const b2 = B.reviseLand(b, land({ width: 15 }));
  assert.equal(b2.land.revision, 2); assert.equal(b2.land.widthM, 15);
  assert.ok(b2.recheck.some(r => r.id === 'space:male_majlis')); assert.ok(b2.recheck.some(r => /^placement:/.test(r.id)));
  assert.equal(B.spaceOf(b2, 'male_majlis').minClearWidthM, 4, 'إجابات العميل لا تُحذف');
  assert.equal(B.reviseLand(b2, land({ width: 15 })), b2, 'لا تغيير = لا زيادة');
  const b3 = B.clearRecheck(b2, 'space:male_majlis');
  assert.ok(!b3.recheck.some(r => r.id === 'space:male_majlis'));
});
test('المحوّل: الأعداد والإضافات والمقاسات المؤكدة فقط', () => {
  let b = fresh();
  for (const [t, c] of [['bedroom', 4], ['male_majlis', 1], ['female_majlis', 1], ['kitchen', 1], ['living', 1], ['dining', 1], ['bath', 5]]) b = B.upsertSpace(b, { type: t, count: c, source: 'client_answer' });
  b = B.upsertSpace(b, { type: 'maid', count: 1, source: 'client_answer', options: { bath: true } });
  b = B.upsertSpace(b, { type: 'kitchen', count: 1, minClearWidthM: 4, minClearDepthM: 5, source: 'client_free_text', priority: 'mandatory' });
  let e = toEngineInput(b);
  assert.deepEqual(e.counts, { bedrooms: 4, majlis: 2, baths: 5, kitchens: 1, halls: 1, dining: 1 });
  assert.deepEqual(e.requirements.extras.maid, { bath: true, ext: false });
  assert.equal(e.requirements.dims.kitchen, undefined, 'مقاس غير مؤكد لا يُرسل');
  assert.ok(e.report.withheld.some(w => /غير مؤكد/.test(w.text_ar)));
  b = B.decide(b, 'space:kitchen', {});
  e = toEngineInput(b);
  assert.deepEqual(e.requirements.dims.kitchen, { w: 4, l: 5, tol: 0.05, quote: e.requirements.dims.kitchen.quote }); assert.equal(e.requirements.areas.kitchen, 20);
});
test('غير المدعوم: الميزانية والخصوصية والإضاءة تُسجَّل وتُعلن ولا تُرسل', () => {
  let b = fresh();
  b = B.setField(b, 'preferences.budgetRange', { min: 1, max: 2, currency: 'SAR' }, { source: 'client_answer' });
  b = B.setField(b, 'preferences.privacy', 'عالية', { source: 'client_answer' });
  assert.equal(B.fieldMeta(b, 'preferences.budgetRange').verification, 'unsupported');
  assert.equal(B.fieldMeta(b, 'preferences.privacy').verification, 'unsupported');
  const e = toEngineInput(b);
  assert.equal(e.report.unsupported.length, 2); assert.ok(e.report.unsupported.every(u => /لن يُطبَّق|لا يستعمله/.test(u.text_ar)));
});
test('engineReadiness: التصنيف ثلاثي ويطابق جدول الدعم', () => {
  const r = B.engineReadiness();
  assert.ok(r.supported.includes('land.rect') && r.partiallySupported.includes('relation.direct_access') && r.unsupported.includes('pref.budget'));
  assert.equal(r.supported.length + r.partiallySupported.length + r.unsupported.length, Object.keys(B.ENGINE_SUPPORT).length);
});
