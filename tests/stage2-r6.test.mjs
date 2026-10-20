// الجولة السادسة: الاختيار بالاختلاف المعماري (لا بمقياس المراكز وحده)، وبوابة DISTINCT في المراجعة النهائية، وحدود مهنية
// على المخطط المرسوم (ممر الغرف، غرفة النوم، المطبخ، المداخل الفرعية)، والعلوي لا يبرز فوق فراغ أرضي، وسبب النقص مكتوب.
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns, generateVillaTwoFloors, planCorridors, qualityGates } from '../dist/villa-layout-v2.mjs';
import { archDifference, THRESHOLDS } from '../dist/arch-difference.mjs';
import { reviewDesigns } from '../dist/plan-review.mjs';
import { docRooms } from '../dist/rules.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };
const one = id => { const { C, r, land } = caseReq(id); return { C, r, land, out: generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || 4 }) }; };

/** حدود الجولة السادسة على مخطط مرسوم واحد. */
function assertProfessional(doc, tag) {
  const { rooms } = docRooms(doc);
  for (const b of rooms.filter(x => x.type === 'bedroom' || x.type === 'master')) assert.ok(b.area >= (b.type === 'master' ? 16 : 12) - .05, `${tag}: «${b.name}» ${b.area.toFixed(2)} م²`);
  const k = rooms.find(x => x.type === 'kitchen' && x.name === 'المطبخ');
  if (k) { assert.ok(Math.min(k.x1 - k.x0, k.y1 - k.y0) >= 2.95, `${tag}: عرض المطبخ`); assert.ok(k.area >= 9.95, `${tag}: المطبخ ${k.area.toFixed(2)} م²`); }
  for (const c of rooms.filter(x => ['corridor', 'entrance'].includes(x.type))) assert.ok(Math.min(c.x1 - c.x0, c.y1 - c.y0) >= 1.195, `${tag}: «${c.name}» أضيق من 1.2 م`);
  for (const c of planCorridors(rooms)) assert.ok(c.len <= 12.5 + 1e-6, `${tag}: «${c.name}» ${c.len} م`);
}

for (const id of ['C1', 'C8', 'C10']) {
  test(`${id}: كل زوج من البدائل المعروضة مختلف معماريًا (≥ ${THRESHOLDS.cosmetic})، والمراجعة النهائية ببوابة DISTINCT ناجحة، والحدود المهنية محققة`, () => {
    const { C, r, land, out } = one(id);
    assert.ok(out.designs.length >= 2, `البدائل ${out.designs.length}`);
    for (let i = 0; i < out.designs.length; i++) for (let j = i + 1; j < out.designs.length; j++) {
      const d = archDifference(out.designs[i].doc, out.designs[j].doc).total;
      assert.ok(d >= THRESHOLDS.cosmetic, `${out.designs[i].pat} ↔ ${out.designs[j].pat}: ${d}`);
    }
    for (const d of out.designs) {
      assertProfessional(d.doc, d.pat);
      assert.deepEqual(qualityGates(d.doc), [], d.pat);
      assert.ok(d.review && d.review.passed && Array.isArray(d.review.setGates) && d.review.setGates.every(g => g.id === 'DISTINCT' && g.ok), d.pat);
    }
    // مستقل: المراجعة نفسها على المستندات وحدها
    const rows = reviewDesigns(out.designs.map(d => d.doc), { counts: r.counts, land }, { external: false, distinct: true });
    assert.ok(rows.every(x => x.passed), rows.map(x => x.rejectReasons_ar.join(' | ')).join(' || '));
    if (out.designs.length < (C.want || 4)) assert.match(out.shortfall_ar || '', /مطلوبة/);
    else assert.equal(out.shortfall_ar, null);
  });
}

test('C2 (خمس غرف ودور واحد): لا ممر غرف أطول من 12.5 م، وكبار السن على الصالة، والصالة على الخلف', () => {
  const { r, out } = one('C2');
  assert.ok(out.designs.length >= 1);
  for (const d of out.designs) {
    assertProfessional(d.doc, d.pat);
    assert.deepEqual(d.ledger.filter(x => !x.ok && ['place', 'far', 'near'].includes(x.kind)).map(x => x.text), [], d.pat);
  }
  void r;
});

test('C7 (دوران): العلوي لا يبرز فوق فراغ أرضي، وبديلان مختلفان معماريًا بأرضي مختلف وعلوي مختلف ما أمكن', () => {
  const { C, r } = caseReq('C7');
  const out = generateVillaTwoFloors({ land: { floors: 2, ...C.land }, counts: r.counts, requirements: r, keep: 4 });
  for (const d of out.designs) {
    assertProfessional(d.doc, d.pat);
    const { rooms } = docRooms(d.doc), g = rooms.filter(x => x.li === 0), u = rooms.filter(x => x.li === 1);
    // كل غرفة علوية فوق فراغ أرضي مبني (بسماحية الجدران)
    const cover = q => g.reduce((s, o) => s + Math.max(0, Math.min(q.x1, o.x1 + .3) - Math.max(q.x0, o.x0 - .3)) * Math.max(0, Math.min(q.y1, o.y1 + .3) - Math.max(q.y0, o.y0 - .3)), 0);
    const over = u.reduce((s, q) => s + Math.max(0, q.area - cover(q)), 0);
    assert.ok(over <= 3, `${d.pat}: بروز علوي ${over.toFixed(1)} م²`);
  }
  for (let i = 0; i < out.designs.length; i++) for (let j = i + 1; j < out.designs.length; j++) assert.ok(archDifference(out.designs[i].doc, out.designs[j].doc).total >= THRESHOLDS.cosmetic);
});
