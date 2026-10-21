// (الجولة الثانية عشرة) قياس بنود البرنامج السعودي والموقع والمناخ على مستندات مرحلة (dist/saudi-program.mjs — المقياس نفسه في
// plan-review): لكل بديل هل تحقق البند، وطبقته (شرط العميل/قيمة افتراضية للميزان)، ومجموع كل بند على المرحلة.
// الاستعمال: node scripts/saudi-program-run.mjs <stage> [stage2 للمقارنة]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { measureSaudiProgram, SAUDI_GATES } from '../dist/saudi-program.mjs';

const stages = process.argv.slice(2); if (!stages.length) stages.push('after-12');
const out = {};
for (const stage of stages) {
  const dir = new URL(`../evidence/acceptance/${stage}/`, import.meta.url).pathname; if (!existsSync(dir)) continue;
  const rows = [], tot = Object.fromEntries(SAUDI_GATES.map(g => [g.id, { applicable: 0, pass: 0, client: 0 }]));
  for (const C of CASES) {
    if (!existsSync(dir + C.id)) continue;
    for (const f of readdirSync(dir + C.id).filter(x => /^alt-\d+\.json$/.test(x)).sort()) {
      const doc = parseDoc(readFileSync(dir + C.id + '/' + f, 'utf8')), m = measureSaudiProgram(doc, { text: C.text, counts: C.counts }, analyzeDoc(doc));
      rows.push({ case: C.id, alt: f.replace('.json', ''), items: Object.fromEntries(m.map(g => [g.id, { applicable: g.applicable, pass: g.pass, tier: g.clientAsked ? 'client' : 'mizan-default', value: g.value, why: g.reasons_ar }])) });
      for (const g of m) if (g.applicable) { tot[g.id].applicable++; if (g.pass) tot[g.id].pass++; if (g.clientAsked) tot[g.id].client++; }
    }
  }
  out[stage] = { rows, totals: tot };
  console.log(stage, Object.entries(tot).map(([k, v]) => `${k} ${v.pass}/${v.applicable}${v.client ? ` (عميل ${v.client})` : ''}`).join(' · '));
}
const target = new URL(`../evidence/acceptance/${stages[0]}/saudi-program.json`, import.meta.url).pathname;
if (existsSync(new URL(`../evidence/acceptance/${stages[0]}/`, import.meta.url).pathname)) writeFileSync(target, JSON.stringify(out, null, 1));
