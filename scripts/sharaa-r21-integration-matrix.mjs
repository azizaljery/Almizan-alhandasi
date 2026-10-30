// (تكامل شرعاء V2 + R21، أداة قياس غير سلوكية) مصفوفة تراجع: نفس الطلب على شيفرة dist مُمرَّرة (شرعاء وحده 429098a / R21 وحده f6d22c7 / المدمج).
// لكل حالة غطاء (C1–C10، H1–H10، D1–D10): الزمن، الخطأ ورمزه وحالة البحث، عدد البدائل الظاهرة والجاهزة والمحجوبة، بنود العميل الإلزامية
// غير المتحققة في البدائل الظاهرة (verifyRequest)، بنود الأبعاد والباب المباشر، وبصمة المخرَج (SHA-256 دون حقول الزمن).
// التشغيل: node scripts/sharaa-r21-integration-matrix.mjs <مجلد-dist> <ملف-الخرج.json> [معرّفات]
// لا يفتح H11–H15 (heldout3) ولا evidence/coverage-r21/SAMPLE.json ولا بذور التقييم؛ الحالات من الملفات العلنية نفسها التي يقرؤها sharaa-v2-engine-compat.mjs.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { HELDOUT } from './heldout-cases.mjs';
import { HELDOUT2 } from './heldout2-cases.mjs';
import { DEV } from './dev-cases-r20.mjs';
const [dist, outFile, only] = process.argv.slice(2);
const imp = p => import(new URL('file://' + dist.replace(/\/$/, '') + '/' + p));
const { generateInitialDesign } = await imp('home-flow.mjs');
const { extractRequirements } = await imp('requirements.mjs');
const { verifyRequest } = await imp('rules.mjs');
const strip = (k, v) => (/^(ms|time|elapsed|duration|seconds|t0|t1)/i.test(k) || /_ms$|Ms$/.test(k) ? undefined : v);
const want = only ? new Set(only.split(',')) : null;
const rows = [];
for (const C of [...CASES, ...HELDOUT, ...HELDOUT2, ...DEV]) {
  if (want && !want.has(C.id)) continue;
  if (/^H1[1-5]$/.test(C.id)) throw Error('H11–H15 مختومة');
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const land = JSON.parse(JSON.stringify(C.land)); const t = Date.now(); let out = null, err = null;
  try { out = await generateInitialDesign({ land, counts: req.counts, requirements: req }); }
  catch (e) { err = { code: String(e.code || ''), status: e.result?.status || e.status || null, reason: e.result?.reason || e.reason || null, msg: String(e.message || e).slice(0, 200), hasReport: !!e.report_ar }; }
  const body = JSON.stringify(err ? { err } : out, strip);
  const alts = out?.alternatives || [], vis = alts.filter(a => a.presentation?.status !== 'hidden');
  const entry = (land.entries || ['s'])[0];
  const items = vis.map(a => { try { return verifyRequest(a.doc, req, { entry }); } catch (e) { return [{ id: 'ERR', ok: false, why: String(e.message).slice(0, 80) }]; } });
  const mandFail = items.map(L => L.filter(x => x.ok === false && x.kind !== 'pref' && !/^P-/.test(x.id || '')).map(x => x.id));
  const dims = items.map(L => L.filter(x => x.kind === 'dims').map(x => `${x.id}:${x.ok === true ? 'ok' : x.status === 'unverified' ? 'unv' : 'fail'}`));
  const doors = items.map(L => L.filter(x => /باب مباشر/.test(x.text || '')).map(x => x.ok));
  const r = { id: C.id, secs: (Date.now() - t) / 1000, err, alts: alts.length, visible: vis.length, ready: vis.filter(a => a.presentation?.status === 'ready').length,
    needsEdits: vis.filter(a => a.presentation?.status === 'needs-edits').length, hiddenAlts: alts.length - vis.length + (out?.hidden || []).length,
    hiddenReason: [...(out?.hidden || []).map(h => (h.reasons_ar || [])[0]), ...alts.filter(a => a.presentation?.status === 'hidden').map(a => (a.presentation.hidden_ar || [])[0])].filter(Boolean).slice(0, 2).map(s => String(s).slice(0, 140)),
    shortfall: out?.alternativesInfo?.shortfall_ar ? String(out.alternativesInfo.shortfall_ar).slice(0, 160) : null, outcome: out?.alternativesInfo?.outcome || null,
    mandFail, dims, doors, doorRules: (req.rules || []).filter(x => x.door).length, sha: createHash('sha256').update(body).digest('hex') };
  rows.push(r);
  console.log(C.id, r.err ? 'ERR ' + r.err.code + ' ' + (r.err.status || '') : `vis=${r.visible} ready=${r.ready} hid=${r.hiddenAlts}`, 'mandFail=' + JSON.stringify(mandFail), r.secs + 's');
  writeFileSync(outFile, JSON.stringify(rows, null, 1));
}
