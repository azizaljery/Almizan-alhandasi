// (الجولة السابعة عشرة) التحقق من قياسي الصالة العائلية (HALL_SMALL وHALL_THROUGH) على مستندات after-16 نفسها (المخططات التي حكم عليها المراجع المستقل r16):
// حالة النظام قبل (المحفوظة في result.json من الجولة 16) وبعد (presentationStatus الحالي بالقياسات الجديدة) مقابل حكم المراجع
// (docs/research/verdicts-r16.json). المراجع وكيل ذكاء اصطناعي (Claude) بدور معماري — ليس معماريًا بشريًا مرخّصًا.
// الاستعمال: node scripts/r17-recalibration.mjs [--stage after-16] [--verdicts docs/research/verdicts-r16.json] [--out evidence/acceptance/after-17/recalibration-vs-r16.json]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDoc } from '../dist/draw/doc.mjs';
import { extractRequirements, applyLiteralReadings } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { CASES } from './acceptance-cases.mjs';

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const OUT = opt('--out', 'evidence/acceptance/after-17/recalibration-vs-r16.json'), STAGE = opt('--stage', 'after-16'), VERD = opt('--verdicts', 'docs/research/verdicts-r16.json');
const root = new URL('../', import.meta.url).pathname;
const V = JSON.parse(readFileSync(root + VERD, 'utf8'));
const rows = [];
for (const C of CASES) {
  const res = JSON.parse(readFileSync(root + `evidence/acceptance/${STAGE}/${C.id}/result.json`, 'utf8'));
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const land = { floors: 1, ...C.land }; applyLiteralReadings(req, land);
  if (!res.designs) continue;
  res.designs.forEach((d, i) => {
    const doc = parseDoc(readFileSync(root + `evidence/acceptance/${STAGE}/${C.id}/${d.file}`, 'utf8'));
    const ledger = verifyRequest(doc, req, { entry: land.entries[0] });
    const rq = { text: req.text || C.text, counts: { ...C.counts, ...req.counts }, land };
    const now = presentationStatus({ doc, ledger, review: d.review }, rq);
    const v = V.find(x => x.case === C.id && x.alt === i + 1);
    const rev = v?.verdict === 'show' ? 'ready' : v?.verdict === 'do-not-show' ? 'hidden' : 'not-ready';
    const bin = s => (s === 'ready' ? 'ready' : 'not-ready');
    rows.push({ alt: `${C.id}-${i + 1}`, reviewer: v?.verdict || null, before: d.presentation?.status, after: now.status,
      agreeBefore: bin(d.presentation?.status) === bin(rev), agreeAfter: bin(now.status) === bin(rev),
      newDefects: now.r16, hidden_ar: now.hidden_ar, edits_ar: now.edits_ar });
  });
}
const n = rows.length, cnt = f => rows.filter(f).length;
const prec = k => { const ready = rows.filter(r => r[k] === 'ready'); return { ready: ready.length, reviewerShow: ready.filter(r => r.reviewer === 'show').length }; };
const summary = {
  note_ar: `المراجع المستقل وكيل ذكاء اصطناعي (Claude) بدور معماري، ليس معماريًا بشريًا مرخّصًا؛ والمخططات هنا مستندات ${STAGE} نفسها، فالمقارنة تقيس القياس وحده لا تحسين التصميم.`, stage: STAGE, verdicts: VERD,
  alternatives: n,
  agreementBefore: cnt(r => r.agreeBefore), agreementAfter: cnt(r => r.agreeAfter),
  readyPrecisionBefore: prec('before'), readyPrecisionAfter: prec('after'),
  statusBefore: { ready: cnt(r => r.before === 'ready'), needsEdits: cnt(r => r.before === 'needs-edits'), hidden: cnt(r => r.before === 'hidden') },
  statusAfter: { ready: cnt(r => r.after === 'ready'), needsEdits: cnt(r => r.after === 'needs-edits'), hidden: cnt(r => r.after === 'hidden') },
  falseReadyAfter: rows.filter(r => r.after === 'ready' && r.reviewer !== 'show').map(r => r.alt),
  stricterThanReviewerAfter: rows.filter(r => r.after !== 'ready' && r.reviewer === 'show').map(r => ({ alt: r.alt, why: [...r.hidden_ar, ...r.edits_ar] })),
};
mkdirSync(dirname(root + OUT), { recursive: true });
writeFileSync(root + OUT, JSON.stringify({ summary, rows }, null, 1));
for (const r of rows) console.log(r.alt.padEnd(6), String(r.reviewer).padEnd(17), String(r.before).padEnd(12), '→', String(r.after).padEnd(12), r.agreeBefore ? '✓' : '✗', r.agreeAfter ? '✓' : '✗', (r.newDefects || []).join(','));
console.log(JSON.stringify(summary, null, 1));
