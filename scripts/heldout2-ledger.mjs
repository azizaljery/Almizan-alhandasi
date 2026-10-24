// (الجولة العشرون، بعد التجميد وتوليد H6–H10 مرة واحدة) سجل المطابقة وحالة العرض للحالات المحجوزة الثانية بالشيفرة المجمّدة نفسها
// (verifyRequest وpresentationStatus وmeasureR16 دون تعديل): البنود الصريحة المتحققة وغير المتحققة، والمخالفات الإلزامية، والعيوب، وحالة
// العرض المقيسة الآن مقابل المحفوظة (اتساق)، ولا حكم مراجع (غير متحقق حتى المراجعة العمياء). لا يغيّر أي ملف مجمّد.
// الاستعمال: node scripts/heldout2-ledger.mjs [stage=after-20-heldout2] → evidence/acceptance/<stage>/ledger.json
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { extractRequirements, applyLiteralReadings } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { measureR16, MANDATORY_R16 } from '../dist/privacy-defects.mjs';

const stage = process.argv[2] || 'after-20-heldout2', ROOT = new URL('../', import.meta.url).pathname, DIR = `${ROOT}evidence/acceptance/${stage}/`;
const m = await import('./heldout2-cases.mjs'), CASES = Object.values(m).find(v => Array.isArray(v) && v.every(c => c && c.id && c.land && c.text));
const rows = []; let contradictions = 0;
for (const C of CASES) {
  if (!existsSync(DIR + C.id + '/result.json')) continue;
  const res = JSON.parse(readFileSync(DIR + C.id + '/result.json', 'utf8'));
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const land = { floors: 1, ...C.land }; try { applyLiteralReadings(req, land); } catch { /* */ }
  if (!res.designs.length) { rows.push({ alt: `${C.id}`, designs: 0, error: res.error, report_ar: res.report_ar || null }); continue; }
  res.designs.forEach((d, i) => {
    const doc = parseDoc(readFileSync(DIR + C.id + '/' + d.file, 'utf8'));
    const ledger = verifyRequest(doc, req, { entry: land.entries[0] });
    const st = presentationStatus({ doc, ledger, review: d.review }, { text: C.text, counts: req.counts, land, rules: req.rules || [] });
    const mand = measureR16(doc, { text: C.text }).filter(g => g.applicable && !g.pass && !g.clientAsked && MANDATORY_R16.includes(g.id)).map(g => g.id);
    if (st.status !== d.presentation?.status) contradictions++;
    rows.push({ alt: `${C.id}-${i + 1}`, pat: d.pat, saved: d.presentation?.status, measured: st.status, clientPassed: ledger.filter(x => x.ok).map(x => x.text), clientViolated: ledger.filter(x => !x.ok).map(x => `${x.text}: ${x.why}`), mizanMandatory: mand, major: st.major, notes: (st.notes_ar || []).length, reviewer: 'غير متحقق' });
  });
}
const out = { note_ar: 'سجل الحالات المحجوزة الثانية بالشيفرة المجمّدة. حكم المراجع وغير «جاهز» الصحيح: غير متحقق حتى المراجعة العمياء. المراجع وكيل ذكاء اصطناعي، ليس معماريًا مرخّصًا.', stage, savedVsMeasuredMismatch: contradictions, rows };
writeFileSync(DIR + 'ledger.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ stage, rows: rows.length, mismatch: contradictions }), rows.map(r => `${r.alt} ${r.saved || 'لا مخطط'} ${r.measured || ''} عميل✗${(r.clientViolated || []).length} إلزامي${JSON.stringify(r.mizanMandatory || [])}`).join(' | '));
