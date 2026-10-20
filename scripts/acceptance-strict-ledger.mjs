// يعيد التحقق من مستندات مرحلة قبول بسجل المطابقة الحالي (dist/rules.mjs) — لمقارنة مرحلتين بالمعيار نفسه.
// القواعد تُستخرج من نص الطلب من جديد (لا من القواعد المحفوظة في result.json)، ومستندات التعديل بنص التعديل أيضًا.
// الاستعمال: node scripts/acceptance-strict-ledger.mjs <stage> [stage2 ...]  → يطبع جدولًا ويكتب <stage>/strict-ledger.json
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { verifyRequest, verifyRules } from '../dist/rules.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';

const stages = process.argv.slice(2).length ? process.argv.slice(2) : ['after-3'];
for (const stage of stages) {
  const DIR = new URL(`../evidence/acceptance/${stage}/`, import.meta.url).pathname, out = [];
  for (const C of CASES) {
    const dir = DIR + C.id + '/'; if (!existsSync(dir)) continue;
    const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
    const editRules = C.edit ? extractRequirements(C.edit).rules : [];
    const entry = C.land.entries[0];
    const files = readdirSync(dir).filter(f => /^(alt-\d+|edit-.*)\.json$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    for (const f of files) {
      const doc = parseDoc(readFileSync(dir + f, 'utf8'));
      let led = verifyRequest(doc, req, { entry });
      // بعد التعديل: بنود التعديل نفسها أيضًا (المطبخ في الخلف…)
      if (/after/.test(f) && editRules.length) led = [...led, ...verifyRules(doc, editRules, { entry }).map(x => ({ ...x, text: 'تعديل: ' + x.text }))];
      const fails = led.filter(x => !x.ok);
      out.push({ case: C.id, file: f, fails: fails.length, failed: fails.map(x => `${x.text} — ${x.why}`) });
    }
  }
  writeFileSync(DIR + 'strict-ledger.json', JSON.stringify(out, null, 1));
  console.log(`== ${stage}`);
  for (const r of out) console.log(r.case, r.file.padEnd(22), r.fails, r.failed.join(' | '));
}
