// (الجولة 21) ملخص التغطية من ملفات scripts/coverage-r21.mjs: النسب، والبدائل المختلفة معماريًا، والزمن والذاكرة، وأكثر أسباب الفشل حسب المرحلة.
//   node scripts/coverage-report-r21.mjs <label> → evidence/coverage-r21/<label>-report.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { analyzeFeasibility } from '../dist/feasibility.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
// أدوات الفحص اختيارية (قد لا توجد في نسخة الأساس)
let clientLint = () => [], textContradictions = () => [];
try { ({ clientLint } = await import('../dist/client-language.mjs')); } catch { /* */ }
try { ({ textContradictions } = await import('../dist/infeasibility-report.mjs')); } catch { /* */ }
const label = process.argv[2], dir = new URL('../evidence/coverage-r21/', import.meta.url).pathname;
const load = s => [`${dir}${label}-${s}.json`, `${dir}${label}-${s}-p0of2.json`, `${dir}${label}-${s}-p1of2.json`].filter(existsSync).flatMap(f => JSON.parse(readFileSync(f, 'utf8')).rows);
const pct = (a, b) => Math.round(1000 * a / Math.max(1, b)) / 10;
const rep = { label, seeds: {} };
for (const s of ['dev', 'eval']) {
  const rows = load(s); if (!rows.length) continue;
  const n = rows.length, by = k => rows.filter(r => r.outcome === k).length;
  // «مرفوض مستحيلًا» في الأساس: هل له دليل بالحد الأدنى المثبت؟ (يُحسب الآن بالأداة نفسها، للتصنيف فقط)
  const claimed = rows.filter(r => r.outcome === 'claimed-infeasible').map(r => { const req = extractRequirements(r.text, { counts: {} }); const f = analyzeFeasibility({ land: r.land, counts: { ...req.counts }, requirements: req }); return { id: r.id, proofNow: !f.feasible && f.hard.every(h => h.proof), lowerBound: f.numbers?.lowerBoundPerFloor, available: f.numbers?.available }; });
  const fail = {}, stage = {};
  for (const r of rows.filter(r => r.outcome !== 'sound')) {
    const st = r.outcome === 'hidden-only' ? 'selection (all shown hidden)' : r.stages?.validation?.rejected ? 'validation' : r.stages?.allocation?.treesTried ? 'allocation' : r.outcome.includes('infeasible') ? 'feasibility' : 'topology';
    stage[st] = (stage[st] || 0) + 1;
    for (const [w, c] of [...(r.stages?.validation?.topReasons || []), ...(r.stages?.allocation?.topViolations || []).map(([k, v]) => ['tree:' + k, v])]) fail[w] = (fail[w] || 0) + c;
  }
  const one = rows.filter(r => r.floors === 1), two = rows.filter(r => r.floors === 2);
  rep.seeds[s] = { n, valid: by('sound'), validPct: pct(by('sound'), n), hiddenOnly: by('hidden-only'), claimedInfeasible: by('claimed-infeasible'), provenInfeasible: by('proven-infeasible'), searchIncomplete: by('search-incomplete'),
    claimedWithProofNow: claimed.filter(c => c.proofNow).length, claimed,
    oneFloor: { n: one.length, valid: one.filter(r => r.outcome === 'sound').length }, twoFloors: { n: two.length, valid: two.filter(r => r.outcome === 'sound').length },
    distinctValidPerCase: { mean: Math.round(100 * rows.reduce((a, r) => a + (r.distinctValid || 0), 0) / n) / 100, histogram: [0, 1, 2, 3, 4, 5].map(k => rows.filter(r => (r.distinctValid || 0) === k).length) },
    requestedTotal: rows.reduce((a, r) => a + r.want, 0), distinctTotal: rows.reduce((a, r) => a + (r.distinctValid || 0), 0),
    ms: { mean: Math.round(rows.reduce((a, r) => a + r.ms, 0) / n), max: Math.max(...rows.map(r => r.ms)) }, rssMBmax: Math.max(...rows.map(r => r.rssMB || 0)),
    failureStage: stage, topFailureCauses: Object.entries(fail).sort((a, b) => b[1] - a[1]).slice(0, 15), leaks: rows.filter(r => (r.leaks || []).length).length,
    // نص الإشعار كما ظهر للعميل في هذا التشغيل، مفحوصًا بقائمة المصطلحات الممنوعة وكاشف التناقض الحاليين
    noticesWithBannedTerms: rows.filter(r => r.notice && clientLint((r.notice.lines_ar || []).join('\n') + ' ' + (r.notice.title_ar || '')).length).map(r => r.id), noticesWithContradictions: rows.filter(r => r.notice && textContradictions((r.notice.lines_ar || []).join('\n')).length).map(r => r.id) };
}
writeFileSync(`${dir}${label}-report.json`, JSON.stringify(rep, null, 1)); console.log(JSON.stringify(rep.seeds, (k, v) => (k === 'claimed' ? undefined : v), 1).slice(0, 4000));
