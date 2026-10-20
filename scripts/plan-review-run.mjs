// يشغّل محرك المراجعة المستقل (dist/plan-review.mjs) على أدلة القبول ويكتب review.json في مجلد المرحلة،
// مع قياس ارتباط AZIZ وMizan Score بالبوابات وبالمكوّنات المستقلة. الاستعمال: node scripts/plan-review-run.mjs [before]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { reviewDesigns, rejectionTable, pearson, spearman, SCORE_WEIGHTS, GATES, SET_GATES, EXTERNAL_WEIGHTS, PLAN_REVIEW_VERSION } from '../dist/plan-review.mjs';

// --distinct: بوابة المجموعة DISTINCT على بدائل كل حالة معًا (reviewDesigns مع distinct:true)؛ مستندات التعديل تُراجع وحدها
const distinct = process.argv.includes('--distinct');
const stage = process.argv.slice(2).find(a => !a.startsWith('--')) || 'before';
const DIR = new URL(`../evidence/acceptance/${stage}/`, import.meta.url).pathname;
const r2 = v => Math.round(v * 100) / 100;
const INTERNAL = Object.keys(SCORE_WEIGHTS).filter(k => !(k in EXTERNAL_WEIGHTS));

const cases = [], pool = [];
for (const C of CASES) {
  const dir = DIR + C.id + '/';
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).filter(f => /^(alt-\d+|edit-(before|after))\.json$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const docs = files.map(f => JSON.parse(readFileSync(dir + f, 'utf8')));
  const request = { text: C.text, counts: C.counts, land: { floors: 1, ...C.land } };
  const altIdx = files.map((f, i) => (f.startsWith('alt-') ? i : -1)).filter(i => i >= 0), editIdx = files.map((f, i) => (f.startsWith('alt-') ? -1 : i)).filter(i => i >= 0);
  const reviews = distinct
    ? [...reviewDesigns(altIdx.map(i => docs[i]), request, { distinct: true }).map(r => ({ ...r, index: altIdx[r.index] })), ...reviewDesigns(editIdx.map(i => docs[i]), request).map(r => ({ ...r, index: editIdx[r.index] }))]
        .map(r => ({ file: files[r.index], label: files[r.index].replace('.json', ''), ...r }))
    : reviewDesigns(docs, request).map(r => ({ file: files[r.index], label: files[r.index].replace('.json', ''), ...r }));
  for (const r of reviews) {
    const base = (() => { let s = 0, w = 0; for (const b of r.breakdown) if (INTERNAL.includes(b.id) && b.value !== null) { s += b.value * b.weight; w += b.weight; } return w ? s / w : null; })();
    r.internalScore = base === null ? null : r2(base);
    if (r.file.startsWith('alt-')) pool.push({ case: C.id, file: r.file, aziz: r.external.aziz, mizan: r.external.mizan, fails: r.failedGates.length, passed: r.passed ? 1 : 0, failsNoPlot: r.failedGates.filter(g => g !== 'PLOT').length, passedNoPlot: r.failedGates.every(g => g === 'PLOT') ? 1 : 0, internal: base, comps: Object.fromEntries(r.breakdown.map(b => [b.id, b.value])), gates: Object.fromEntries(r.gates.map(g => [g.id, g.ok ? 1 : 0])) });
  }
  const perGate = Object.fromEntries([...GATES, ...(distinct ? SET_GATES : [])].map(g => [g.id, reviews.filter(r => r.file.startsWith('alt-') && r.failedGates.includes(g.id)).length]));
  cases.push({ id: C.id, name: C.name, request, alternatives: reviews.filter(r => r.file.startsWith('alt-')).length, rejected: reviews.filter(r => r.file.startsWith('alt-') && !r.passed).length, perGate, reviews, table: rejectionTable(reviews) });
}

// الارتباط: على كل البدائل معًا، ثم داخل الحالة (بعد طرح متوسط كل حالة) لأن الحالات تختلف في مستواها
function demean(rows, key) { const by = new Map(); for (const r of rows) { if (!by.has(r.case)) by.set(r.case, []); by.get(r.case).push(r[key]); } const mean = new Map([...by].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])); return rows.map(r => r[key] - mean.get(r.case)); }
const col = k => pool.map(r => r[k]);
const corr = {};
for (const ext of ['aziz', 'mizan']) {
  const c = { n: pool.length };
  for (const target of ['fails', 'failsNoPlot', 'passedNoPlot', 'internal']) c[target] = { pearson: pearson(col(ext), col(target)), spearman: spearman(col(ext), col(target)), withinCase: pearson(demean(pool, ext), demean(pool, target)) };
  c.components = Object.fromEntries(['circulation', 'daylight', 'privacy', 'zoning', 'proportion', 'furniture'].map(k => [k, pearson(col(ext), pool.map(r => r.comps[k]))]));
  c.gates = Object.fromEntries(GATES.map(g => [g.id, pearson(col(ext), pool.map(r => r.gates[g.id]))]));
  c.spread = { min: Math.min(...col(ext)), max: Math.max(...col(ext)) };
  corr[ext] = c;
}
corr.azizVsMizan = pearson(col('aziz'), col('mizan'));
corr.reading = 'معامل سالب مع fails وموجب مع passed وinternal = متسق مع البوابات. قرب الصفر أو الإشارة المعاكسة = غير متسق، فيُوزن منخفضًا.';

const totals = { alternatives: pool.length, rejected: pool.filter(r => !r.passed).length, perGate: Object.fromEntries(GATES.map(g => [g.id, pool.filter(r => !r.gates[g.id]).length])) };
writeFileSync(DIR + 'review.json', JSON.stringify({ version: PLAN_REVIEW_VERSION, stage, distinct, weights: SCORE_WEIGHTS, totals, correlation: corr, cases }, null, 1));
console.log(JSON.stringify({ totals, correlation: corr }, null, 1));
for (const c of cases) console.log(c.id, `${c.rejected}/${c.alternatives}`, JSON.stringify(c.perGate), c.reviews.map(r => `${r.label}:${r.passed ? 'OK' : r.failedGates.join('+')}:${r.score}`).join(' | '));
