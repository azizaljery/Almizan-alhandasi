// فحص نموذج المتطلبات v2 على نصوص حالات القبول العشر (C1–C10): الفهم، الدرجات، الأبعاد، التغطية، التعارضات،
// ثم التعديلات (C8، C9) على جلسة حقيقية. الاستعمال: node scripts/requirements-v2-probe.mjs [مجلد الإخراج]
import { mkdirSync, writeFileSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { extractRequirements, coverage, detectConflicts } from '../dist/requirements.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';

const outDir = process.argv[2] || null;
const rows = [];
for (const C of CASES) {
  const land = { floors: 1, ...C.land };
  const req = extractRequirements(C.text, { counts: C.counts });
  const cov = coverage(C.text, req), conflicts = detectConflicts(req, land);
  const row = {
    id: C.id, text: C.text,
    understood: req.understood, unsupported: req.unsupported, unclear: req.unclear,
    rules: req.rules.map(r => ({ kind: r.kind, a: r.a, b: r.b, side: r.side, mode: r.mode, floor: r.floor, level: r.level, levelCue: r.levelCue, quote: r.quote })),
    dims: req.dims, areas: req.areas, textCounts: req.textCounts, site: req.site || null,
    coverage: cov.clauses.map(c => ({ quote: c.quote, fate: c.fate, kind: c.kind })), dropped: cov.dropped,
    conflicts: conflicts.map(c => ({ type: c.type, quotes: c.quotes, question_ar: c.question_ar })),
  };
  if (C.edit) {
    const first = await generateInitialDesign({ land, counts: req.counts, requirements: req });
    const s0 = createSession({ land, counts: req.counts, requirements: req, result: first });
    try {
      const { session, reply } = await redesign(s0, { text: C.edit });
      const e = extractRequirements(C.edit, { counts: {} });
      row.edit = {
        text: C.edit, understood: e.understood, unclear: e.unclear, unsupported: e.unsupported, keepLayout: !!e.keepLayout, tweaks: e.tweaks,
        rules: e.rules.map(r => ({ kind: r.kind, a: r.a, b: r.b, side: r.side, level: r.level, quote: r.quote })),
        reply: { done: reply.done, failed: reply.failed, pending: reply.pending, unverified: reply.unverified, unclear: reply.unclear, kept: reply.kept, unchanged: reply.unchanged, reused: reply.reused, conflicts: reply.conflicts },
        sameDoc: session.designs[1].doc === session.designs[0].doc, samePattern: session.designs[1].pat === session.designs[0].pat,
        bedroomsAfter: session.input.requirements.counts.bedrooms,
      };
    } catch (err) { row.edit = { text: C.edit, error: err.message, code: err.code || null }; }
  }
  rows.push(row);
  console.log(`${C.id}: فُهم ${req.understood.length}، غير مدعوم ${req.unsupported.length}، غير مفهوم ${req.unclear.length}، قواعد ${req.rules.length}، أبعاد ${Object.keys(req.dims).length}، تعارضات ${conflicts.length}، ساقط ${cov.dropped.length}${row.edit ? ' | تعديل: ' + (row.edit.error ? 'خطأ ' + row.edit.code : `منفّذ ${row.edit.reply.done.length}، بانتظار العرض ${row.edit.reply.pending.length}، نفس المستند ${row.edit.sameDoc}`) : ''}`);
}
if (outDir) { mkdirSync(outDir, { recursive: true }); writeFileSync(outDir + '/requirements-v2.json', JSON.stringify(rows, null, 1)); }
