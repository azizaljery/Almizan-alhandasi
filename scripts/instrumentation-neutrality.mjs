// (الجولة 21 — قرار المالك: أدوات التشخيص محايدة سلوكيًا) يشغّل المحرك على مجموعة حالات مرة بلا سجل تشخيص ومرة بسجل التشخيص الذي تستعمله
// scripts/diagnose-r21.mjs وscripts/coverage-r21.mjs (globalThis.__v2dbg و__v2keepDocs و__v2keepRejDocs)، ويحفظ بصمة كل ناتج: بصمة كل
// مخطط (sha256 للمستند المسلسل) والنتيجة دون الزمن (الأنماط والحالات وسبب النقص ورمز الخطأ ونصه). التشغيلان في عمليتين منفصلتين.
//   node scripts/instrumentation-neutrality.mjs run <off|on> <out.json> [--root <نسخة>] [--sets main,heldout,heldout2,coverage]
//   node scripts/instrumentation-neutrality.mjs compare <off.json> <on.json> <report.json>
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const sha = s => createHash('sha256').update(s).digest('hex');
if (argv[0] === 'compare') {
  const a = JSON.parse(readFileSync(argv[1], 'utf8')), b = JSON.parse(readFileSync(argv[2], 'utf8'));
  const diffs = [];
  for (const [k, v] of Object.entries(a.cases)) if (JSON.stringify(v) !== JSON.stringify(b.cases[k])) diffs.push({ case: k, off: v, on: b.cases[k] });
  const rep = { purpose: 'حياد أدوات التشخيص: النتائج بلا سجل وبالسجل متطابقة حرفيًا (بصمات المخططات والنتيجة دون الزمن)', root: a.root, cases: Object.keys(a.cases).length, identical: diffs.length === 0, diffs, offSha256: sha(JSON.stringify(a.cases)), onSha256: sha(JSON.stringify(b.cases)) };
  writeFileSync(argv[3], JSON.stringify(rep, null, 1)); console.log(rep.identical ? `متطابق: ${rep.cases} حالة` : `مختلف في ${diffs.length}`); process.exit(rep.identical ? 0 : 1);
}
const [, mode, outFile] = argv;
const here = new URL('../', import.meta.url).pathname, root = (opt('root') || here).replace(/\/$/, '') + '/';
const sets = (opt('sets') || 'main,heldout,heldout2,coverage').split(',');
const { extractRequirements } = await import(root + 'dist/requirements.mjs');
const V3 = await import(root + 'dist/villa-layout-v3.mjs');
const { serialize } = await import(root + 'dist/draw/doc.mjs');
const cases = [];
if (sets.includes('main')) cases.push(...(await import(here + 'scripts/acceptance-cases.mjs')).CASES.map(c => ({ ...c, key: 'main/' + c.id })));
if (sets.includes('heldout')) cases.push(...(await import(here + 'scripts/heldout-cases.mjs')).HELDOUT.map(c => ({ ...c, key: 'heldout/' + c.id })));
if (sets.includes('heldout2')) cases.push(...(await import(here + 'scripts/heldout2-cases.mjs')).HELDOUT2.map(c => ({ ...c, key: 'heldout2/' + c.id })));
if (sets.includes('coverage')) { const { casesFor } = await import(here + 'scripts/coverage-r21.mjs'); for (const s of ['dev', 'eval']) cases.push(...casesFor(s, 40).map(c => ({ ...c, key: `coverage-${s}/${c.id}` }))); }
const only = opt('only') ? new RegExp(opt('only')) : null;
const outp = { mode, root, cases: {} };
for (const C of cases) {
  if (only && !only.test(C.key)) continue;
  if (mode === 'on') { globalThis.__v2dbg = { keepSol: false }; globalThis.__v2keepDocs = true; globalThis.__v2keepRejDocs = true; globalThis.__v2rej = null; }
  else { delete globalThis.__v2dbg; delete globalThis.__v2keepDocs; delete globalThis.__v2keepRejDocs; }
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const land = { floors: 1, ...C.land }, two = land.floors >= 2 || req.prefs?.floors === 2;
  let r;
  try { const o = (two ? V3.generateVillaTwoFloors : V3.generateVillaDesigns)({ land, counts: req.counts, requirements: req, keep: C.want || 4 });
    r = { designs: o.designs.map(d => ({ pat: d.pat, status: d.presentation?.status || null, doc: sha(serialize(d.doc)), notes: sha(JSON.stringify(d.notes || [])) })), shortfall: o.shortfall_ar || null, hidden: (o.hidden || []).length, rejected: (o.rejected || []).length }; }
  catch (e) { r = { error: e.code || null, message: String(e.message || e) }; }
  outp.cases[C.key] = r; console.log(C.key, r.error || r.designs.map(d => d.pat).join(' '));
}
writeFileSync(outFile, JSON.stringify(outp, null, 1));
