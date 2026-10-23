// يعيد التحقق من مستندات مرحلة قبول بسجل المطابقة الحالي (dist/rules.mjs) — لمقارنة مرحلتين بالمعيار نفسه.
// القواعد تُستخرج من نص الطلب من جديد (لا من القواعد المحفوظة في result.json)، ومستندات التعديل بنص التعديل أيضًا.
// (الجولة الخامسة عشرة) القراءة الحرفية نفسها التي يرسم بها المولّد (applyLiteralReadings: «5 غرف فوق وغرفة لأمي» = 6 غرف)،
// والتحقق الجزئي («في الخلف» نسبيًا لا حرفيًا) يُكتب بنصه، وفحص التناقض بين السجل ورد التعديل في result.json:
// بند قال الرد إنه «نُفّذ/متحقق» والسجل يقول غير متحقق (أو العكس) = تناقض.
// الاستعمال: node scripts/acceptance-strict-ledger.mjs <stage> [stage2 ...]  → يطبع جدولًا ويكتب <stage>/strict-ledger.json
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { extractRequirements, applyLiteralReadings } from '../dist/requirements.mjs';
import { verifyRequest, verifyRules } from '../dist/rules.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';

const stages = process.argv.slice(2).length ? process.argv.slice(2) : ['after-3'];
for (const stage of stages) {
  const DIR = new URL(`../evidence/acceptance/${stage}/`, import.meta.url).pathname, out = [], contradictions = [];
  for (const C of CASES) {
    const dir = DIR + C.id + '/'; if (!existsSync(dir)) continue;
    const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
    try { applyLiteralReadings(req, C.land); } catch { /* بلا قراءة حرفية */ }
    const editRules = C.edit ? extractRequirements(C.edit).rules : [];
    const entry = C.land.entries[0];
    const res = existsSync(dir + 'result.json') ? JSON.parse(readFileSync(dir + 'result.json', 'utf8')) : null;
    const files = readdirSync(dir).filter(f => /^(alt-\d+|edit-.*)\.json$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    for (const f of files) {
      const doc = parseDoc(readFileSync(dir + f, 'utf8'));
      let led = verifyRequest(doc, req, { entry });
      // بعد التعديل: بنود التعديل نفسها أيضًا (المطبخ في الخلف…)
      const isAfter = /after/.test(f);
      let editLed = [];
      if (isAfter && editRules.length) { editLed = verifyRules(doc, editRules, { entry }); led = [...led, ...editLed.map(x => ({ ...x, text: 'تعديل: ' + x.text }))]; }
      const fails = led.filter(x => !x.ok);
      out.push({ case: C.id, file: f, fails: fails.length, failed: fails.map(x => `${x.text} — ${x.why}`), partial: fails.filter(x => x.partial).map(x => `${x.text} — جزئي: ${x.partial.text_ar}`) });
      // التناقض بين الرد والسجل: ما قال الرد إنه نُفّذ أو متحقق أصلًا يجب أن يكون متحققًا في السجل، وما قال إنه جزئي يجب أن يكون جزئيًا
      const m = /^edit-alt(\d+)-after\.json$/.exec(f), e = m ? (res?.editAll || []).find(x => x.alt === +m[1]) : f === 'edit-after.json' ? res?.edit : null;
      if (e && editLed.length) {
        const okSaid = new Set([...(e.done || []), ...(e.already || []), ...(e.partial?.ok || [])]);
        const partSaid = new Set((e.partial?.partial || []).map(x => x.text));
        for (const x of editLed) {
          if (okSaid.has(x.text) && !x.ok) contradictions.push({ case: C.id, file: f, item: x.text, reply: 'متحقق', ledger: 'غير متحقق', why: x.why });
          if (partSaid.has(x.text) && (x.ok || !x.partial)) contradictions.push({ case: C.id, file: f, item: x.text, reply: 'جزئي', ledger: x.ok ? 'متحقق' : 'غير متحقق بلا قراءة نسبية', why: x.why });
          if (!x.ok && !okSaid.has(x.text) && !partSaid.has(x.text) && x.partial) contradictions.push({ case: C.id, file: f, item: x.text, reply: 'لم يذكر التحقق الجزئي', ledger: 'جزئي', why: x.partial.text_ar });
        }
      }
    }
  }
  writeFileSync(DIR + 'strict-ledger.json', JSON.stringify({ stage, rows: out, contradictions }, null, 1));
  console.log(`== ${stage}`);
  for (const r of out) console.log(r.case, r.file.padEnd(24), r.fails, r.failed.join(' | '), r.partial.length ? ' [جزئي] ' + r.partial.join(' | ') : '');
  console.log('التناقض بين الرد والسجل:', contradictions.length); for (const c of contradictions) console.log(' ', c.case, c.file, c.item, 'الرد:', c.reply, 'السجل:', c.ledger);
}
