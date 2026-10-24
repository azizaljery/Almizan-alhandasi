// الجولة السابعة: الحوش فناء لا شق (ضلع أقصر ≥ 4.5 م صافيًا ونسبة ≤ 2)، ولا غرفة نوم على واجهة الشارع في البدائل ما لم
// يطلبها العميل، والمجلس الرئيسي ≥ 24 م² صافيًا (حيث يتسع البرنامج)، والطعام ≥ 3.3 م والخادمة ≥ 2.7 م صافيًا — مقيسة كلها من
// المخطط المرسوم كما يُعرض للعميل، وبوابة الجودة نفسها ترفض المخالف.
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns, qualityGates } from '../dist/villa-layout-v2.mjs';
import { docRooms } from '../dist/rules.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { readFileSync } from 'node:fs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };
const one = id => { const { C, r, land } = caseReq(id); return generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || 4 }); };
const dims = r => { const w = r.x1 - r.x0, d = r.y1 - r.y0; return { s: Math.min(w, d), l: Math.max(w, d) }; };
/** غرف نوم أرضية «على الشارع» (المدخل جنوبي): جهتها الأمامية لا يحجبها فراغ مبني وبُعدها عن الواجهة < 3 م. */
function streetBeds(doc) {
  const { rooms, B } = docRooms(doc);
  const ov = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  return rooms.filter(r => r.li === 0 && ['bedroom', 'master'].includes(r.type) && r.name !== 'غرفة الضيوف' && r.y0 - B.y0 < 3 && !rooms.some(o => o !== r && o.li === 0 && o.type !== 'courtyard' && ov(o, r) > .6 && o.y0 < r.y0 - .1)).map(r => r.name);
}
function assertR7(doc, tag) {
  const { rooms } = docRooms(doc);
  for (const c of rooms.filter(r => r.type === 'courtyard')) { const d = dims(c); assert.ok(d.s >= 4.45 && d.l / d.s <= 2.05, `${tag}: الحوش ${d.s.toFixed(2)}×${d.l.toFixed(2)}`); }
  const din = rooms.find(r => r.type === 'dining'); if (din) assert.ok(dims(din).s >= 3.25, `${tag}: عرض الطعام ${dims(din).s.toFixed(2)}`);
  for (const m of rooms.filter(r => r.name === 'غرفة الخادمة')) assert.ok(dims(m).s >= 2.65, `${tag}: عرض الخادمة ${dims(m).s.toFixed(2)}`);
}

test('بوابة الجودة على المخطط المرسوم ترفض حوش «بعد-6» الشقي (3.35 × 9.3 م في C2 البديل الأول)', () => {
  const doc = parseDoc(readFileSync(new URL('../evidence/acceptance/after-6/C2/alt-1.json', import.meta.url), 'utf8'));
  assert.ok(qualityGates(doc).some(w => /الحوش/.test(w) && /شق/.test(w)), qualityGates(doc).join(' | '));
});

test('بوابة الجودة ترفض غرفة خادمة أضيق من 2.7 م وطعامًا أضيق من 3.3 م (C10 بعد-6: خادمة 2.52 م، وطعام 2.98 م)', () => {
  const at = n => parseDoc(readFileSync(new URL(`../evidence/acceptance/after-6/C10/alt-${n}.json`, import.meta.url), 'utf8'));
  assert.ok(qualityGates(at(2)).some(w => /«غرفة الخادمة» عرضها الصافي 2.52/.test(w)), qualityGates(at(2)).join(' | '));
  assert.ok(qualityGates(at(4)).some(w => /الطعام عرضه الصافي 2.98/.test(w)), qualityGates(at(4)).join(' | '));
});

for (const id of ['C6', 'C8', 'C10']) {
  test(`${id}: لا حوش شقي، ولا غرفة نوم على الشارع في أي بديل، والطعام والخادمة بعرض مهني، والمجلس ≥ 24 م²`, () => {
    const out = one(id);
    assert.ok(out.designs.length >= 2 || /جزئي|نسخة معدّلة|لا بعد جوهري|تنويع على تنظيم|تخالف بندًا صريحًا من الطلب/.test(out.shortfall_ar || '') /* (الجولة السادسة عشرة) «في الخلف» حرفيًا: C6 بديل واحد لا حشو، والسبب المقيس مذكور */, `البدائل ${out.designs.length}: ${out.shortfall_ar}`); // (الجولة الحادية عشرة) v2
    for (const d of out.designs) {
      assertR7(d.doc, `${id} ${d.pat}`);
      assert.deepEqual(streetBeds(d.doc), [], `${id} ${d.pat}: غرف نوم على الشارع`);
      assert.deepEqual(qualityGates(d.doc), [], `${id} ${d.pat}`);
      const { rooms } = docRooms(d.doc), m = rooms.find(r => r.name === 'مجلس الرجال') || rooms.find(r => r.name === 'المجلس');
      assert.ok(m && m.area >= 24 - .05, `${id} ${d.pat}: المجلس ${m?.area.toFixed(2)} م²`);
    }
  });
}

test('غرفة نوم على الشارع بطلب العميل لا تُجازى: «غرف النوم على الشارع» تبقى ممكنة', () => {
  const r = extractRequirements('3 غرف نوم ومجلس وصالة ومطبخ وطعام، وغرف النوم على الشارع', { counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 } });
  assert.ok((r.rules || []).some(x => x.kind === 'place' && x.side === 'front' && ['bedrooms', 'onebed', 'kids'].includes(x.a)), JSON.stringify(r.rules));
  const out = generateVillaDesigns({ land: { width: 20, length: 30, streets: ['s'], entries: ['s'], floors: 1 }, counts: r.counts, requirements: r, keep: 2 });
  assert.ok(out.designs.length >= 1);
  assert.ok(out.designs.every(d => Array.isArray(d.streetBeds) && d.streetBeds.length === 0), 'لا تُحسب «على الشارع» مخالفة حين يطلبها العميل');
});
