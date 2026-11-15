// درجة المطابقة المفسَّرة: مؤشرات مقيسة من المخطط، جملتا «لماذا؟» من القياسات، تُحفظ في الجلسة وتدخل في ترتيب العرض.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { scorePlan, rankByScore, SCORE_WEIGHTS } from '../dist/plan-score.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { generateInitialDesign, SharaSession } from '../dist/home-flow.mjs';
import { createSession, rankedIndexes } from '../dist/design-session.mjs';

const land = (w, l, f = 1) => ({ width: w, length: l, streets: ['s'], entries: ['s'], floors: f });
const C = { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 };

test('الأوزان مجموعها 100 والدرجة بين 0 و100 وكل مؤشر معه سببه', () => {
  assert.equal(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const d = generateVillaTwoFloors({ land: land(20, 30, 2), counts: C, requirements: {}, keep: 2 }).designs[0];
  const ledger = verifyRequest(d.doc, {}, { entry: 's' });
  const sc = scorePlan(d.doc, { ledger });
  assert.ok(sc.total >= 0 && sc.total <= 100);
  assert.ok(sc.parts.length >= 5);
  for (const p of sc.parts) { assert.ok(p.score >= 0 && p.score <= 100, p.id); assert.ok(p.good && p.bad, p.id); }
  assert.equal(sc.why.length, 2);
  assert.ok(sc.why.every(s => s.length > 20));
  // «لماذا؟» مبنية من القياسات: الجملة الثانية تسمّي أضعف مؤشر بدرجته
  const weak = sc.parts.find(p => p.id === sc.weak[0]);
  if (weak) assert.ok(sc.why[1].includes(weak.label) && sc.why[1].includes(String(weak.score)));
});

test('غياب سجل الطلب: مؤشر المطابقة يُستبعد ويُعلن ولا يُخترع', () => {
  const d = generateVillaDesigns({ land: land(20, 30), counts: C, requirements: {}, keep: 1 }).designs[0];
  const sc = scorePlan(d.doc, { ledger: [] });
  assert.ok(sc.missing.includes('req'));
  assert.ok(!sc.parts.some(p => p.id === 'req'));
});

test('الدرجة تتأثر بالقياس: مخطط بصالة ممرات واسعة أقل كفاءة مساحة من مخطط مدمج', () => {
  const tight = generateVillaDesigns({ land: land(20, 30), counts: { ...C, bedrooms: 3, baths: 4 }, requirements: {}, keep: 1 }).designs[0];
  const wide = generateVillaTwoFloors({ land: land(12.5, 30, 2), counts: C, requirements: { tweaks: { avoidModes: ['bands'] } }, keep: 1 }).designs[0];
  const e = d => scorePlan(d.doc, { ledger: [] }).parts.find(p => p.id === 'eff').score;
  assert.ok(e(tight) > e(wide), `${e(tight)} مقابل ${e(wide)}`);
});

test('تُخزَّن الدرجة في سجل كل تصميم بالجلسة، ويُرتَّب العرض بالأعلى أولًا', async () => {
  const l = { width: 20, length: 30, streets: ['s'], entries: ['s'] };
  const s = new SharaSession({ land: l }); s.start(); s.answer('mode', 'free'); s.answer('free', 'ابي فيلا دورين 4 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ وغرفة طعام');
  const out = await generateInitialDesign({ land: l, rooms: s.rooms(), discovery: s.discovery(), idea: s.idea, counts: s.counts, requirements: s.requirements });
  const ses = createSession({ land: l, counts: s.counts, requirements: s.requirements, discovery: s.discovery, idea: s.idea, result: out });
  assert.ok(ses.designs.every(d => d.score && Number.isInteger(d.score.total)));
  const order = rankedIndexes(ses), tot = order.map(i => ses.designs[i].score.total);
  assert.deepEqual(tot, [...tot].sort((a, b) => b - a));
  assert.deepEqual(rankByScore([{ total: 50 }, null, { total: 80 }, { total: 50 }]), [2, 0, 3, 1]);
});
