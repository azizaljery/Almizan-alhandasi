import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns } from '../../dist/villa-layout.mjs';
import { analyzeDesign, walkPath } from '../../dist/sharaa-v3/relations.mjs';
import { CAPABILITIES, proportionAnalyzer, evidenceFromDesign, hospitalityReview, furnitureFit, glazingByOrientation, environmentalPerformance, designSignature, signatureDistance, diversityReport, architecturalCritic } from '../../dist/sharaa-v3/design-quality.mjs';

const land = { width: 20, length: 30, entries: ['s'], streets: ['s'], floors: 1 };
const out = generateVillaDesigns({ land, counts: { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }, requirements: {}, keep: 4 });
const docs = out.designs.map(d => d.doc), doc = docs[0], model = analyzeDesign(doc);
const clone = o => JSON.parse(JSON.stringify(o));
const rect = (w, h) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

test('الاستطالة: مستطيل 4×12 يحتاج مراجعة، 5×6 يمر، وL غير مستطيل NOT_EVALUATED', () => {
  const m = { rooms: [{ id: 'a', type: 'living', net: rect(4, 12), name: 'طويلة' }, { id: 'b', type: 'living', net: rect(5, 6), name: 'متزنة' },
    { id: 'c', type: 'living', net: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 8 }, { x: 0, y: 8 }], name: 'L' }] };
  const f = Object.fromEntries(proportionAnalyzer(m).map(x => [x.room, x]));
  assert.equal(f.a.status, 'REVIEW_REQUIRED'); assert.equal(f.a.measured.ratio, 3); assert.equal(f.b.status, 'PASS'); assert.equal(f.c.status, 'NOT_EVALUATED');
  assert.equal(proportionAnalyzer(m, { ratio: { living: 3.5 } }).find(x => x.room === 'a').status, 'PASS');
});
test('الاستطالة على تصاميم فعلية: كل فراغ رئيسي له قياس بالمتر ونسبة', () => {
  const f = proportionAnalyzer(model);
  assert.ok(f.length >= 6);
  for (const x of f.filter(y => y.status !== 'NOT_EVALUATED')) assert.ok(x.measured.shortM > 0 && x.measured.longM >= x.measured.shortM && x.measured.ratio >= 1);
});
test('أدلة الضيافة مأخوذة من قياس المسار الفعلي لا من إدخال خارجي', () => {
  const ev = evidenceFromDesign(model), k = model.rooms.find(r => r.type === 'kitchen'), d = model.rooms.find(r => r.type === 'dining');
  assert.equal(ev.source, 'relations-engine');
  assert.equal(ev.paths.kitchenDining.lengthM, walkPath(model, k.id, d.id).lengthM);
  assert.equal(ev.paths.kitchenDining.verified, true);
  const h = hospitalityReview(model);
  assert.ok(['PASS', 'REVIEW_REQUIRED', 'NOT_EVALUATED'].includes(h.review.status));
  assert.equal(h.review.engineeringApproval, false);
  assert.equal(h.review.findings.find(x => x.id === 'kitchenDining').status, 'PASS');
});
test('حساسية الضيافة: خفض حد مسار المطبخ إلى 1 م يجعل الفحص يحتاج مراجعة', () => {
  const r = hospitalityReview(model, { serviceWalkM: 1 }).review.findings.find(x => x.id === 'kitchenDining');
  assert.equal(r.status, 'REVIEW_REQUIRED');
});
test('الأثاث: مجسّم المستند بلا تداخل صلب؛ السجاد لا يُحسب تداخلًا', () => {
  const f = furnitureFit(doc, model);
  assert.ok(!f.some(x => x.id.startsWith('furniture-overlap') && /rug/.test(x.reason)));
  for (const x of f.filter(y => y.id.startsWith('furniture-spill'))) assert.ok(x.measured.protrusionM > 0.03);
});
test('الأثاث: نقل قطعة خارج الفراغ، وتداخل قطعتين صلبتين، يُكشفان (طفرة على نسخة)', () => {
  const sofa = doc.fixtures.find(f => f.kind === 'sofa-3');
  const m1 = clone(doc); m1.fixtures.find(f => f.id === sofa.id).x += 40;
  assert.ok(furnitureFit(m1, model).some(x => x.id === 'furniture-outside:' + sofa.id));
  const room = model.rooms.find(r => r.type === 'living'), solid = doc.fixtures.filter(f => f.kind !== 'rug' && Math.abs(f.x - room.inside.x) < 5 && Math.abs(f.y - room.inside.y) < 5).slice(0, 2);
  assert.equal(solid.length, 2);
  const m2 = clone(doc); const a = m2.fixtures.find(f => f.id === solid[0].id), b = m2.fixtures.find(f => f.id === solid[1].id); b.x = a.x; b.y = a.y; b.rot = a.rot;
  assert.ok(furnitureFit(m2, model).some(x => x.id.startsWith('furniture-overlap')));
  assert.equal(furnitureFit({ ...doc, fixtures: [] }, model)[0].status, 'NOT_EVALUATED');
});
test('الزجاج حسب الجهة: يطابق عدد النوافذ الخارجية، وتدوير north بـ180 يبدّل الشمال والجنوب', () => {
  const g = glazingByOrientation(model), total = Object.values(g.sides).reduce((s, x) => s + x.count, 0);
  assert.equal(total, model.windows.length); assert.ok(total >= 10);
  const flipped = glazingByOrientation({ ...model, north: 180 });
  for (const [k, opp] of [['n', 's'], ['e', 'w']]) { assert.deepEqual(flipped.sides[opp] || null, g.sides[k] || null); assert.deepEqual(flipped.sides[k] || null, g.sides[opp] || null); }
});
test('الأداء البيئي NOT_EVALUATED مع السبب والقياس الهندسي المتاح', () => {
  const e = environmentalPerformance(model, { climate: 'dry' });
  assert.equal(e.status, 'NOT_EVALUATED'); assert.ok(e.reason.length > 10); assert.equal(e.measured.status, 'MEASURED');
});
test('التنوع: الانعكاس لا يُعد تنوعًا (مسافة 0 وتكرار)، وتغيير البرنامج يُعد تنوعًا', () => {
  const W = Math.max(...doc.walls.flatMap(w => [w.a.x, w.b.x])), f = p => ({ ...p, x: W - p.x });
  const mirror = { ...doc, walls: doc.walls.map(w => ({ ...w, a: f(w.a), b: f(w.b) })), labels: doc.labels.map(l => ({ ...l, seed: f(l.seed) })) };
  const rep = diversityReport([doc, mirror]);
  assert.equal(rep.pairs[0].distance, 0); assert.equal(rep.pairs[0].duplicate, true); assert.ok(rep.notCountedAsDiversity.includes('الانعكاس'));
  const other = generateVillaDesigns({ land: { ...land, width: 26 }, counts: { bedrooms: 6, majlis: 1, baths: 5, kitchens: 2, halls: 2, dining: 1 }, requirements: {}, keep: 1 }).designs[0].doc;
  const d = signatureDistance(designSignature(analyzeDesign(doc)), designSignature(analyzeDesign(other)));
  assert.ok(d > 0.2, 'مسافة ' + d);
});
test('بدائل المولّد: تُحسب مصفوفة المسافات لكل زوج وتُعلن التكرارات', () => {
  const rep = diversityReport(docs);
  assert.equal(rep.pairs.length, docs.length * (docs.length - 1) / 2);
  for (const p of rep.pairs) assert.ok(p.distance >= 0 && p.distance <= 1);
});
test('الناقد: لا حكم نهائي، ويعلن القدرات غير المنفذة، ويرتب المراجعات أولًا', () => {
  const c = architecturalCritic(doc);
  assert.equal(c.verdict, null); assert.equal(c.finalAuthority, 'Mizan Score'); assert.equal(c.engineeringApproval, false);
  assert.equal(c.capabilities.conceptGenerator.status, 'NOT_IMPLEMENTED'); assert.equal(c.capabilities.refinementLoop.status, 'NOT_IMPLEMENTED'); assert.equal(c.capabilities.environmentalPerformance.status, 'NOT_EVALUATED');
  assert.equal(c.summary.review + c.summary.notEvaluated + c.summary.pass, c.notes.length);
  const order = c.notes.map(n => n.status), firstPass = order.indexOf('PASS'), lastReview = order.lastIndexOf('REVIEW_REQUIRED');
  assert.ok(firstPass === -1 || lastReview < firstPass);
  assert.deepEqual(c.notes, architecturalCritic(doc).notes);
  assert.ok(Object.keys(CAPABILITIES).length >= 10);
});
