// قياس توافق المحرك: لكل حالة غطاء (C1–C10، H1–H10، D1–D10) يُولَّد التصميم بالشيفرة المُمرَّرة ويُخزَّن بصمة SHA-256 لمخرجاته (دون حقول الزمن).
// التشغيل: node scripts/sharaa-v2-engine-compat.mjs <مجلد-dist> <ملف-الخرج.json> [معرّفات-مفصولة-بفاصلة]
// لا يفتح H11–H15 ولا SAMPLE.json.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { CASES } from './acceptance-cases.mjs';
import { HELDOUT } from './heldout-cases.mjs';
import { HELDOUT2 } from './heldout2-cases.mjs';
import { DEV } from './dev-cases-r20.mjs';
const [dist, outFile, only] = process.argv.slice(2);
const { generateInitialDesign } = await import(new URL('file://' + dist.replace(/\/$/, '') + '/home-flow.mjs'));
const { extractRequirements } = await import(new URL('file://' + dist.replace(/\/$/, '') + '/requirements.mjs'));
const strip = (k, v) => (/^(ms|time|elapsed|duration|seconds|t0|t1)/i.test(k) || /_ms$|Ms$/.test(k) ? undefined : v);
const want = only ? new Set(only.split(',')) : null;
const rows = [];
for (const C of [...CASES, ...HELDOUT, ...HELDOUT2, ...DEV]) {
  if (want && !want.has(C.id)) continue;
  const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts };
  const land = JSON.parse(JSON.stringify(C.land)); const t = Date.now(); let out, err = null;
  try { out = await generateInitialDesign({ land, counts: req.counts, requirements: req }); } catch (e) { err = String(e.code || '') + '|' + String(e.message || e).slice(0, 300); }
  const body = JSON.stringify(err ? { err } : out, strip);
  rows.push({ id: C.id, secs: (Date.now() - t) / 1000, err, sha: createHash('sha256').update(body).digest('hex'), bytes: body.length, rules: (req.rules || []).filter(r => r.door).length });
  console.log(C.id, rows.at(-1).sha.slice(0, 12), err ? 'ERR' : 'ok', rows.at(-1).secs + 's');
  writeFileSync(outFile, JSON.stringify(rows, null, 1));
}
