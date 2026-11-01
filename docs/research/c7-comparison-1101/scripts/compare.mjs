import { readFileSync, writeFileSync } from 'node:fs'; import { createHash } from 'node:crypto';
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const h = v => createHash('sha256').update(JSON.stringify(canon(v))).digest('hex').slice(0, 12);
const rows = [];
for (const t of ['base-r1','base-r2','mep-r1','mep-r2','merge-r1','merge-r2']) {
  const l = JSON.parse(readFileSync(`logs/${t}/run.json`)); const c = l.calls[0], i = c.input, e = c.err || {}, r = e.result || {};
  rows.push({ t, root: l.root.split('/').pop(), caseH: h(l.caseDef), clicksH: h(l.clicks), chatH: h(l.chatBeforeConfirm), inputH: h(i), reqH: h(i.requirements), landH: h(i.land), roomsH: h(i.rooms), countsH: h(i.counts), nCalls: l.calls.length, ms: c.ms, ok: c.ok, code: e.code, msg: e.message, outcome: r.outcome, rej: r.candidatesRejected, status: r.status, reason: r.reason, diag: r.diagnosticId, reportH: h(e.report_ar), finalAttr: l.finalReportOutcomeAttr, repTxtH: h(l.finalReportText), errAll: h(e) });
}
writeFileSync('compare.json', JSON.stringify(rows, null, 1));
console.table(rows.map(({msg, ...r}) => r));
for (const r of rows) console.log(r.t, r.msg);
