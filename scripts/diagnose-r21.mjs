// (الجولة 21 — قرار المالك: التشخيص أولًا من الشيفرة وسجلات التشغيل) سجل تشخيص مرحلي لحالة واحدة، قابل للإعادة على أي نسخة من المحرك:
//   node scripts/diagnose-r21.mjs <set> <id> [--root <مسار نسخة المستودع>] [--label <اسم>]
// set: main | heldout | heldout2 | dev. يكتب evidence/diagnosis-r21/<label>/<id>.json ويطبع الملخص.
// المراحل: فهم الطلب ← بناء القيود ← بحث التنظيم (الشبكة) ← توزيع الغرف وحل الأبعاد (التلدين لكل شجرة) ← التحقق الهندسي (البناء والبوابات
// والمراجعة) ← الاختيار والعرض ← المهلة. غير سلوكي: يقرأ خطافات التشخيص الموجودة في المحرك (__v2dbg، __v2rej، __v2pool، سجل البحث).
// لا يُشغَّل على H11–H15 (المجموعة المختومة): يرفضها صراحة.
import { mkdirSync, writeFileSync } from 'node:fs';
import { reportName, reportPath } from './_report-name.mjs';

const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const [set, id] = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
if (set === 'heldout3' || /^H1[1-5]$/.test(id || '')) throw Error('H11–H15 مختومة: لا تشخيص قبل التجميد');
const root = (opt('root') || new URL('../', import.meta.url).pathname).replace(/\/$/, '') + '/';
const label = opt('label') || (opt('root') ? 'baseline' : 'current');
const SETS = { main: ['scripts/acceptance-cases.mjs', 'CASES'], heldout: ['scripts/heldout-cases.mjs', 'HELDOUT'], heldout2: ['scripts/heldout2-cases.mjs', 'HELDOUT2'], dev: ['scripts/dev-cases-r20.mjs', 'DEV'] };
const here = new URL('../', import.meta.url).pathname;
const C = (await import(here + SETS[set][0]))[SETS[set][1]].find(c => c.id === id);
const { extractRequirements } = await import(root + 'dist/requirements.mjs');
const V3 = await import(root + 'dist/villa-layout-v3.mjs');
const { measureR16, MANDATORY_R16 } = await import(root + 'dist/privacy-defects.mjs');
const { sameOrDifferent } = await import(root + 'dist/arch-criterion.mjs');
const { parseDoc } = await import(root + 'dist/draw/doc.mjs');

const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
const land = { floors: 1, ...C.land }, two = land.floors >= 2 || req.prefs?.floors === 2, keep = C.want || req.want || 4;
globalThis.__v2dbg = { keepSol: false }; globalThis.__v2keepDocs = true; globalThis.__v2keepRejDocs = true;
const t0 = Date.now(); let out = null, err = null;
try { out = (two ? V3.generateVillaTwoFloors : V3.generateVillaDesigns)({ land, counts: req.counts, requirements: req, keep, _cf: true }); } catch (e) { err = e; }
const ms = Date.now() - t0, dbg = globalThis.__v2dbg || {}, search = out?.engine3?.search || err?.search || {};
const top = (o, n = 8) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
const treeWhy = {}, trees = []; for (const [k, v] of Object.entries(dbg)) { if (k.startsWith('ms:')) trees.push([k.slice(3), String(v)]); if (k.startsWith('why:')) for (const w of String(v).split(',').filter(Boolean)) treeWhy[w] = (treeWhy[w] || 0) + 1; }
const rej = out?.rejected || err?.rejected || globalThis.__v2rej || [];
const rejWhy = {}; for (const r of rej) for (const w of new Set([...(r.why || []).map(x => String(x).slice(0, 70)), ...(r.tfWhy || []).map(x => 'tf:' + x)])) rejWhy[w] = (rejWhy[w] || 0) + 1;
// مسار الضيف والمجلس المعزول على البدائل المبنية (الحوض قبل الاختيار) والمعروضة
const pool = globalThis.__v2poolDocs || [];
const guest = d => { try { return measureR16(typeof d === 'string' ? parseDoc(d) : d, { text: C.text, counts: req.counts, rules: req.rules || [] }).filter(g => g.applicable && !g.pass).map(g => g.id); } catch (e) { return ['ERR:' + e.message]; } };
const poolGuest = pool.map(p => ({ pat: p.pat, defects: guest(p.doc) }));
// تنوع الحوض بالمعيار المجمّد: أكبر مجموعة «مختلفة معماريًا» جشعًا
const distinct = []; for (const p of pool) { try { const d = typeof p.doc === 'string' ? parseDoc(p.doc) : p.doc; if (distinct.every(q => sameOrDifferent(q.d, d).different)) distinct.push({ pat: p.pat, d }); } catch { /* */ } }
const rep = {
  case: { set, id, land, text: C.text, keep }, engineRoot: root, ms, maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
  command: `node scripts/diagnose-r21.mjs ${set} ${id}${opt('root') ? ' --root ' + opt('root') : ''}`,
  stage1_brief: { understood: req.understood, unclear: req.unclear, rules: (req.rules || []).map(r => `${r.kind}:${r.a}${r.b ? '/' + r.b : ''}${r.side ? ':' + r.side : ''} «${r.quote || r.text}»`), dims: req.dims, prefs: req.prefs },
  stage2_constraints: search.units ? { units: search.units, hard: (search.rel || []).filter(r => r.hard).map(r => r.ar), soft: (search.rel || []).filter(r => !r.hard).map(r => r.ar) } : null,
  stage3_topology: { grids: search.grids || null, distinctTopologies: search.distinctTopologies ?? null, dimFit: search.dimFit ?? null, dimFail: search.dimFail ?? null, picked: search.picked ?? null, synthTrees: search.synth ?? search.trees ?? null, libraryTrees: search.library ?? null, twoFloors: search.twoFloors || null, groundStair: search.groundStair ? { grids: search.groundStair.grids, picked: search.groundStair.picked } : null },
  stage4_allocation: { treesOptimized: trees.length, treesWithoutSolution: trees.filter(([, v]) => v.endsWith('x')).length, topViolations: top(treeWhy, 14), treeStats: err?.treeStats || null },
  stage5_validation: { rejected: rej.length, topReasons: top(rejWhy, 14), twoFloorWhy: err?.twoFloorWhy || null, pool: (out?.pool || []).length || pool.length, poolGuestDefects: poolGuest, poolDistinctByFrozenCriterion: distinct.map(x => x.pat) },
  stage6_selection: out ? { shown: out.designs.map(d => ({ pat: d.pat, status: d.presentation?.status, mandatory: d.presentation?.mandatory || [], r16: d.r16 || [], hidden_ar: d.presentation?.hidden_ar || [], hiddenReasons: d.presentation?.hiddenReasons || [] })), shortfall_ar: out.shortfall_ar || null, hidden: (out.hidden || []).length } : null,
  stage7_timeout: { timedOut: !!(err?.timedOut || out?.timedOut), note: 'المحرك يعمل بميزانيات حتمية بعدد المحاولات لا بالزمن؛ لا مهلة زمنية ما لم يُطلب timeLimitMs' },
  error: err ? { code: err.code || null, message: String(err.message || err), report_ar: err.report_ar || null, result: err.result || null } : null,
  result: out?.result || null,
};
const dir = here + `evidence/diagnosis-r21/${reportName(label)}/`; mkdirSync(dir, { recursive: true });
writeFileSync(reportPath(dir, [set, id]), JSON.stringify(rep, null, 1));
console.log(JSON.stringify({ id, ms, outcome: out ? out.designs.map(d => d.pat + ':' + d.presentation?.status) : err.code, grids: rep.stage3_topology.grids, trees: rep.stage4_allocation.treesOptimized, noSol: rep.stage4_allocation.treesWithoutSolution, topViol: rep.stage4_allocation.topViolations.slice(0, 5), rejected: rep.stage5_validation.rejected, topRej: rep.stage5_validation.topReasons.slice(0, 5), poolDistinct: rep.stage5_validation.poolDistinctByFrozenCriterion.length, pool: rep.stage5_validation.pool }, null, 0));
