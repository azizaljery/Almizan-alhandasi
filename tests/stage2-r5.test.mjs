// الجولة الخامسة: أنماط «الخدمة في الخلف» بالبناء، الخادمة ملاصقة للمطبخ، تنوع الدور الأرضي في الدورين، ونتائج حتمية
// (ميزانيات بالعدد لا بالزمن)، ولا حشو: كل بديل معروض ينفّذ البنود ويختلف فعلًا عن غيره.
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns, generateVillaTwoFloors, partiTrees, programV2, difference, qualityGates } from '../dist/villa-layout-v2.mjs';
import { docRooms } from '../dist/rules.mjs';
import { serialize } from '../dist/draw/doc.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };
const gap = (a, b) => Math.hypot(Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)));
/** بلا ذاكرة المشاركة: تشغيل فعلي للمولّد (لاختبار الحتمية). */
function fresh(fn) { const h = globalThis.__mizanGenCache; globalThis.__mizanGenCache = undefined; try { return fn(); } finally { globalThis.__mizanGenCache = h; } }

test('أنماط «الخدمة في الخلف» تُولَّد فقط حين يطلبها العميل', () => {
  const with_ = caseReq('C1'), without = caseReq('C10');
  const modes = r => new Set(partiTrees(programV2(r.counts, r), { W: 16.7 }).map(t => t.mode));
  const a = modes(with_.r), b = modes(without.r);
  for (const m of ['courtrear', 'rearbar', 'ellfoot', 'splitrear']) { assert.ok(a.has(m), m); assert.ok(!b.has(m), m + ' بلا طلب'); }
});

test('C1: المطبخ في الخلف، والطعام بجواره، وغرفة الخادمة نفسها (لا حمامها) على بعد ≤ 2 م من المطبخ في كل بديل', () => {
  const { C, r, land } = caseReq('C1');
  const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || 4 });
  assert.ok(out.designs.length >= 2);
  for (const d of out.designs) {
    assert.ok(d.ledger.every(x => x.ok), d.pat + ': ' + d.ledger.filter(x => !x.ok).map(x => x.why).join(' | '));
    const { rooms } = docRooms(d.doc), k = rooms.find(x => x.name === 'المطبخ'), m = rooms.find(x => x.name === 'غرفة الخادمة');
    assert.ok(gap(k, m) <= 2.0, `${d.pat}: الخادمة على ${gap(k, m).toFixed(2)} م من المطبخ`);
  }
  for (let i = 0; i < out.designs.length; i++) for (let j = i + 1; j < out.designs.length; j++) assert.ok(difference(out.designs[i].doc, out.designs[j].doc) >= .16);
});

test('C6: كل بديل ينفّذ «المطبخ في الخلف» والمقاسات، ولا مخزن متضخم ولا صالة-ممر', () => {
  const { C, r, land } = caseReq('C6');
  const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || 4 });
  for (const d of out.designs) {
    assert.ok(d.ledger.every(x => x.ok), d.pat);
    assert.deepEqual(qualityGates(d.doc), [], d.pat);
    const { rooms } = docRooms(d.doc), h = rooms.find(x => x.name === 'الصالة'), w = h.x1 - h.x0, dd = h.y1 - h.y0;
    assert.ok(Math.max(w, dd) / Math.min(w, dd) <= 2.15, `${d.pat}: الصالة ${w.toFixed(2)}×${dd.toFixed(2)}`);
    assert.ok(!rooms.some(x => x.name === 'المخزن' && x.area > 10), d.pat);
  }
});

test('C7: أرضي مختلف لكل بديل، والماستر بعيدة عن الدرج المرسوم في كل بديل', () => {
  const { C, r } = caseReq('C7');
  const out = generateVillaTwoFloors({ land: { floors: 2, ...C.land }, counts: r.counts, requirements: r, keep: 4 });
  // الجولة السادسة: الاختيار بالاختلاف المعماري (≥ 0.18) والعلوي لا يبرز فوق حديقة أرضية. في «بعد-5» كان البديل الثالث
  // نسخة شكلية من الأول (اختلاف معماري 0.09) وعلويّه فوق فراغ أرضي؛ قرار المالك: لا حشو للعدد — يكفي بديلان مختلفان فعلًا
  // (والنقص مذكور بسببه في shortfall_ar)
  assert.ok(out.designs.length >= 2, `البدائل ${out.designs.length}`);
  if (out.designs.length < 4) assert.ok(out.shortfall_ar && /من 4 مطلوبة/.test(out.shortfall_ar), 'سبب النقص مذكور');
  const grounds = out.designs.map(d => d.pat.split('/')[0]);
  assert.equal(new Set(grounds).size, grounds.length, grounds.join(' '));
  for (const d of out.designs) { const far = d.ledger.find(x => x.kind === 'far'); assert.ok(far && far.ok, d.pat + ': ' + far?.why); }
});

test('الحتمية: الطلب نفسه مرتين = البدائل نفسها حرفيًا (لا ميزانية زمنية)', () => {
  for (const id of ['C4', 'C6']) {
    const { C, r, land } = caseReq(id);
    const run = () => fresh(() => generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || 4 }));
    const a = run(), b = run();
    assert.deepEqual(a.designs.map(d => d.pat), b.designs.map(d => d.pat), id);
    assert.equal(a.designs.map(d => serialize(d.doc)).join('|'), b.designs.map(d => serialize(d.doc)).join('|'), id);
  }
});
