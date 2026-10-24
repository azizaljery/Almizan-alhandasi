// (الجولة التاسعة عشرة — شرط المالك الأول: إثبات الابتكار المعماري) لكل حالة: كم بديلًا ناجحًا جديدًا في المرحلة الجديدة مقارنة بالسابقة،
// بالمقياس الوظيفي v2 (dist/arch-difference.mjs) لا باسم الملف: البديل «جديد» إن كان «مختلفًا معماريًا» (بعدان جوهريان على الأقل من:
// توزيع الوظائف، والحركة، والخصوصية، وعلاقات الغرف) عن **كل** بديل في المرحلة السابقة للحالة نفسها. الواجهة ومادتها وشكل الغلاف
// وموضع السلم لا تُحتسب بذاتها (المقياس يستبعدها صراحة، وتُذكر في «غير محتسب»). «ناجح» = معروض بحالة غير «محجوب».
// ويُقاس أيضًا التنوع داخل المرحلة الجديدة لكل زوج معروض.
// الاستعمال: node scripts/innovation-r19.mjs --old after-18 --new after-19 [--out evidence/acceptance/after-19/innovation.json]
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseDoc } from '../dist/draw/doc.mjs';
import { archSignatureV2, archDifferenceV2, explainDifference, SUBSTANTIVE_V2 } from '../dist/arch-difference.mjs';
import { ARCH_CRITERION_R19, sameOrDifferent } from '../dist/arch-criterion.mjs';
import { measureR16, MANDATORY_R16 } from '../dist/privacy-defects.mjs';
import { extractRequirements, applyLiteralReadings } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { CASES } from './acceptance-cases.mjs';
import { HELDOUT } from './heldout-cases.mjs'; // المعيار المجمّد (docs/research/arch-difference-criterion-r19.md)

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const OLD = opt('--old', 'after-18'), NEW = opt('--new', 'after-19'), OUT = opt('--out', `evidence/acceptance/${NEW}/innovation.json`);
const root = new URL('../', import.meta.url).pathname, ev = s => `${root}evidence/acceptance/${s}/`;
const load = (stage, id) => { const f = ev(stage) + id + '/result.json'; if (!existsSync(f)) return []; const r = JSON.parse(readFileSync(f, 'utf8')); return (r.designs || []).map((d, i) => ({ i: i + 1, file: d.file, pat: d.pat, status: d.presentation?.status || null, correct: correctNow(id, d, parseDoc(readFileSync(ev(stage) + id + '/' + d.file, 'utf8'))), sig: archSignatureV2(parseDoc(readFileSync(ev(stage) + id + '/' + d.file, 'utf8'))) })); };
// «صحيح» = بالقياس الحالي للمرحلتين معًا: حالة العرض الآن غير «محجوب» (بنود الطلب الصريحة بالسماحيات الحالية، والبوابات، والمخالفات الإلزامية
// في الميزان) ومراجعته المحفوظة ناجحة
function correctNow(id, d, doc) {
  if (!d.presentation || d.review?.passed === false) return false;
  const C = [...CASES, ...HELDOUT].find(c => c.id === id); if (!C) return d.presentation.status !== 'hidden';
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts }; const land = { floors: 1, ...C.land }; applyLiteralReadings(req, land);
  const ledger = verifyRequest(doc, req, { entry: land.entries[0] });
  return presentationStatus({ doc, ledger, review: d.review }, { text: C.text, counts: req.counts, land, rules: req.rules || [] }).status !== 'hidden';
}
// أكبر مجموعة من البدائل الصحيحة كل زوج فيها «مختلف معماريًا» بالمعيار المجمّد (بحث شامل؛ البدائل قليلة)
const maxDistinct = L => { let best = 0; const rec = (k, set) => { best = Math.max(best, set.length); for (let i = k; i < L.length; i++) if (set.every(o => sameOrDifferent(o.sig, L[i].sig).different)) rec(i + 1, [...set, L[i]]); }; rec(0, []); return best; };
const dimsOf = d => ({ zoning: d.zoning, circulation: d.circulation, privacy: d.privacy, relations: d.relations });
const cases = readdirSync(ev(NEW)).filter(x => /^[CH]\d+$/.test(x)).sort((a, b) => +a.slice(1) - +b.slice(1));
const rows = [];
for (const id of cases) {
  const A = load(OLD, id), B = load(NEW, id);
  const alts = B.map(b => {
    const vs = A.map(a => { const d = archDifferenceV2(a.sig, b.sig); return { old: `${id}-${a.i}`, oldPat: a.pat, verdict: d.verdict, substantive: d.substantive, total: d.total, dims: dimsOf(d), ignored: explainDifference(d).ignored }; });
    const isNew = A.every(a => sameOrDifferent(a.sig, b.sig).different), same = vs.find(v => v.verdict === 'variant') || null;
    return { alt: `${id}-${b.i}`, pat: b.pat, status: b.status, successful: b.status && b.status !== 'hidden', new: isNew, successfulNew: isNew && b.correct, correct: b.correct, closestOld: vs.sort((x, y) => x.total - y.total)[0] || null, sameAsOld: same ? same.old : null, vsOld: vs };
  });
  const pairs = [];
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const d = archDifferenceV2(B[i].sig, B[j].sig); pairs.push({ pair: [`${id}-${B[i].i}`, `${id}-${B[j].i}`], verdict: d.verdict, substantive: d.substantive, total: d.total, dims: dimsOf(d), ignored_ar: explainDifference(d).ignored }); }
  rows.push({ case: id, old: A.length, new: B.length, oldShown: A.filter(a => a.status !== 'hidden').length, oldCorrect: A.filter(a => a.correct).length, oldDistinctCorrect: maxDistinct(A.filter(a => a.correct)), correct: B.filter(b => b.correct).length, distinctCorrect: maxDistinct(B.filter(b => b.correct)), successful: alts.filter(a => a.successful).length, newSuccessful: alts.filter(a => a.successfulNew).length, alts, pairs });
}
const summary = {
  note_ar: `البديل «جديد» إن كان مختلفًا معماريًا (بعدان جوهريان ≥ العتبات ${JSON.stringify(SUBSTANTIVE_V2)}) عن كل بديل للحالة نفسها في ${OLD}. الواجهة وشكل الغلاف وموضع السلم لا تُحتسب بذاتها.`,
  old: OLD, new: NEW,
  criterion: ARCH_CRITERION_R19,
  perCase: rows.map(r => ({ case: r.case, [OLD]: r.oldShown, [NEW]: r.successful, correctOld: r.oldCorrect, correctNew: r.correct, distinctCorrectOld: r.oldDistinctCorrect, distinctCorrectNew: r.distinctCorrect, newSuccessful: r.newSuccessful, minPairTotal: r.pairs.length ? Math.min(...r.pairs.map(p => p.total)) : null, allPairsDistinct: r.pairs.every(p => p.verdict === 'distinct') })),
  totalNewSuccessful: rows.reduce((s, r) => s + r.newSuccessful, 0),
  totals: { correctOld: rows.reduce((s, r) => s + r.oldCorrect, 0), correctNew: rows.reduce((s, r) => s + r.correct, 0), distinctCorrectOld: rows.reduce((s, r) => s + r.oldDistinctCorrect, 0), distinctCorrectNew: rows.reduce((s, r) => s + r.distinctCorrect, 0) },
};
const outP = OUT.startsWith('/') ? OUT : root + OUT; mkdirSync(dirname(outP), { recursive: true });
writeFileSync(outP, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
