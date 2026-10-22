// (الجولة الثالثة عشرة، قرار المالك) قياس الزجاج لكل غرفة في بدائل مرحلة: النسبة المحققة معلومةً (وما طلبه العميل بجانبها إن طلب؛ حالات
// القبول لا تطلب شيئًا)، وبوابة الرفض 3%، ومرجع الوزارة 8% (المستوى ب) كمعلومة لا بوابة. الاستعمال: node scripts/glazing-run.mjs <stage> [stage2…]
// → evidence/acceptance/<stage>/glazing.json ويطبع ملخصًا لكل مرحلة.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { evaluateGates, regulatoryNotes } from '../dist/plan-review.mjs';

const stages = process.argv.slice(2); if (!stages.length) stages.push('after-13');
const out = {};
for (const stage of stages) {
  const dir = new URL(`../evidence/acceptance/${stage}/`, import.meta.url).pathname; if (!existsSync(dir)) continue;
  const rows = []; let rooms = 0, requested = 0, belowRequest = 0, below8 = 0, failAt3 = 0, alts = 0;
  for (const C of CASES) {
    if (!existsSync(dir + C.id)) continue;
    for (const f of readdirSync(dir + C.id).filter(x => /^alt-\d+\.json$/.test(x)).sort()) {
      const doc = parseDoc(readFileSync(dir + C.id + '/' + f, 'utf8'));
      const gates = evaluateGates(doc, { text: C.text, counts: C.counts, land: { floors: 1, ...C.land } }), g = gates.find(x => x.id === 'WINDOW_SIZE');
      alts++; rooms += g.value.ratios.length; requested += g.value.requestedRooms; belowRequest += g.value.belowRequest; below8 += g.value.ratios.filter(x => x.pct < 8).length; if (!g.ok) failAt3++;
      rows.push({ case: C.id, file: f, passAt3: g.ok, rooms: g.value.ratios.map(x => ({ name: x.name, pct: x.pct, requested: x.requested, facing: x.facing, exteriorLength: x.exteriorLength })), notes_ar: g.notes_ar, reference_ar: regulatoryNotes(gates).map(n => n.text_ar) });
    }
  }
  out[stage] = { note: 'نسبة الزجاج اختيار العميل (لا قيمة افتراضية): المحقق لكل غرفة معلومة وما طلبه بجانبه؛ بوابة الرفض 3% كما هي؛ 8% الوزارة (المستوى ب) مرجع', alternatives: alts, rooms, requestedRooms: requested, belowRequest, below8, failAt3, rows };
  console.log(stage, `بدائل ${alts} · غرف ${rooms} · بطلب عميل ${requested} · دون المطلوب ${belowRequest} · دون 8% (مرجع) ${below8} · ترسب عند 3%: ${failAt3}`);
}
const target = new URL(`../evidence/acceptance/${stages[0]}/glazing.json`, import.meta.url).pathname;
if (existsSync(new URL(`../evidence/acceptance/${stages[0]}/`, import.meta.url).pathname)) writeFileSync(target, JSON.stringify(out, null, 1));
