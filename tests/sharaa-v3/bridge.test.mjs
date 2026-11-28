import test from 'node:test';
import assert from 'node:assert/strict';
import { SharaSession, interpretFree, normalizeLand } from '../../dist/home-flow.mjs';
import { generateVillaDesigns } from '../../dist/villa-layout.mjs';
import { createBrief, answer, nextQuestion, retract, readiness } from '../../dist/sharaa-v3/core.mjs';
import { toV3Land, toSharaText, canSend, expectedCounts } from '../../dist/sharaa-v3/native-bridge.mjs';
import { analyzeDesign } from '../../dist/sharaa-v3/relations.mjs';

const { land } = normalizeLand({ width: 20, length: 30, streets: ['s'], entries: ['s'], floors: 1, geo: { city: 'riyadh' } });
const mk = facts => { let b = createBrief(toV3Land(land)); for (const [id, v, extra] of facts) b = answer(b, id, v, { source: 'client_confirmed', ...(extra || {}) }); return b; };
const CORE = [['household.adults', 2], ['household.children', 0], ['household.parents', 'none'], ['household.bedrooms', 4], ['hospitality.men', true], ['hospitality.women', true], ['services.kitchens', 1], ['living.count', 1], ['living.diningCount', 1], ['living.baths', 6]];

test('أرض شرعاء المؤكدة تتحول إلى أرض V3 كاملة، والمدينة المعروفة لا تُسأل', () => {
  const v = toV3Land(land);
  assert.equal(v.widthM, 20); assert.equal(v.depthM, 30); assert.deepEqual(v.entries, ['s']); assert.deepEqual(v.streets, [{ side: 's' }]); assert.equal(v.city, 'riyadh');
  assert.throws(() => toV3Land(null)); assert.throws(() => toV3Land({ width: 0, length: 5 }));
  let b = createBrief(v), asked = [];
  for (let i = 0; i < 200; i++) { const q = nextQuestion(b, { depth: 'full' }); if (!q) break; if (q.kind === 'conflict') break; asked.push(q.id); b = answer(b, q.id, q.type === 'b' ? false : q.type === 'n' ? 1 : q.type === 't' ? 'لا' : q.type === 'decimal' ? 3 : q.type.split('|')[0]); }
  assert.ok(!asked.includes('site.city'), 'سُئل عن المدينة وهي معروفة');
  const noCity = createBrief({ ...v, city: undefined }); assert.ok(nextQuestion(noCity, { depth: 'full' }) !== null);
});
test('ذهاب وإياب: النص المصوغ يفهمه شرعاء الحالي بأعداد مطابقة (126 تركيبة)', async () => {
  let n = 0;
  for (const beds of [1, 2, 3, 4, 5, 6, 8]) for (const k of [1, 2]) for (const h of [1, 2, 3]) for (const d of [0, 1, 2, 3]) for (const men of [false, true]) {
    const b = mk([['household.bedrooms', beds], ['services.kitchens', k], ['living.count', h], ['living.diningCount', d], ['living.baths', beds + 1], ['hospitality.men', men], ['hospitality.women', beds > 4]]);
    const s = toSharaText(b), sess = new SharaSession({ land }); sess.start(); sess.answer('mode', 'free'); sess.answer('free', await interpretFree(s.text));
    for (const [key, v] of Object.entries(s.expectedCounts)) assert.equal(sess.counts[key], v, `${key}: ${s.text}`); n++;
  }
  assert.equal(n, 336);
});
test('لا إسقاط صامت: كل معلومة مؤكدة غير منقولة تظهر بسببها، والإلزامي غير المدعوم يمنع الإرسال', () => {
  const b = mk([...CORE, ['household.children', 3, { revise: true }], ['privacy.entrySight', true, { priority: 'mandatory' }], ['architecture.concept', 'courtyard']]);
  const s = toSharaText(b), by = Object.fromEntries(s.notApplied.map(x => [x.id, x]));
  assert.equal(by['household.children'].support, 'not_applied'); assert.equal(by['architecture.concept'].support, 'not_applied');
  assert.equal(by['privacy.entrySight'].mandatory, true); assert.ok(s.blocking.some(x => x.id === 'privacy.entrySight'));
  const c = canSend(b); assert.equal(c.ok, false); assert.ok(c.reasons.some(r => r.includes('إلزامية')));
  const relaxed = answer(b, 'privacy.entrySight', true, { source: 'client_confirmed', priority: 'preferred', revise: true });
  assert.equal(canSend(relaxed).ok, true);
  const all = new Set([...s.applied, ...s.notApplied.map(x => x.id)]); for (const id of Object.keys(b.facts)) assert.ok(all.has(id), id + ' اختفت');
});
test('الإرسال محجوب عند التعارض أو نقص الأسئلة الأساسية أو غياب المعلومات', () => {
  assert.equal(canSend(createBrief(toV3Land(land))).ok, false);
  const conflict = mk([...CORE, ['hospitality.typical', 10], ['hospitality.peak', 5]]);
  assert.ok(canSend(conflict).reasons.some(r => r.includes('تعارض')));
  const partial = mk([['household.bedrooms', 3]]); assert.ok(canSend(partial).reasons.some(r => r.includes('أساسية')));
});
test('استنتاج غير مؤكد لا يُرسل؛ ويمكن سحبه، ولا يُسحب المؤكد', () => {
  let b = mk(CORE); b = answer(b, 'household.children', 0, { source: 'client_confirmed', revise: true });
  const inferred = answer(createBrief(toV3Land(land)), 'household.bedrooms', 7, { source: 'ai_inference' });
  assert.equal(toSharaText(inferred).applied.includes('household.bedrooms'), false);
  assert.equal(retract(inferred, 'household.bedrooms').facts['household.bedrooms'], undefined);
  assert.throws(() => retract(b, 'household.bedrooms')); assert.throws(() => retract(b, 'nope'));
});
test('من المقابلة إلى مخطط فعلي: أعداد الفراغات داخل المخطط الناتج تطابق ما أكّده العميل', async () => {
  const b = mk([...CORE, ['household.bedrooms', 4]]), s = toSharaText(b), sess = new SharaSession({ land }); sess.start(); sess.answer('mode', 'free'); sess.answer('free', await interpretFree(s.text));
  const out = generateVillaDesigns({ land: { width: 20, length: 30, entries: ['s'], streets: ['s'], floors: 1 }, counts: sess.counts, requirements: {}, keep: 2 });
  assert.ok(out.designs.length >= 1);
  for (const d of out.designs) {
    const m = analyzeDesign(d.doc), n = t => m.rooms.filter(r => r.type === t).length;
    assert.equal(n('bedroom') + n('master'), expectedCounts(b).bedrooms, 'غرف النوم');
    assert.equal(n('majlis'), expectedCounts(b).majlis, 'المجالس'); assert.equal(n('kitchen'), expectedCounts(b).kitchens, 'المطابخ'); assert.equal(n('dining'), expectedCounts(b).dining, 'الطعام');
    assert.equal(n('bath'), expectedCounts(b).baths, 'الحمامات');
  }
});
test('جاهزية V3 لا تتجاوز الجسر: الحقائق الصفرية لا تُعد إسقاطًا', () => {
  const b = mk(CORE), s = toSharaText(b), kids = s.notApplied.find(x => x.id === 'household.children');
  assert.equal(kids.support, 'no_action_needed'); assert.ok(readiness(b).missing.length === 0);
});
