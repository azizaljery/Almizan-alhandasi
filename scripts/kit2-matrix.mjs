// (الجولة 21 — 02c/01b، أداة قياس غير سلوكية) ملخص مصفوفة حزمة المالك الثانية بالمقاييس نفسها لـ scripts/matrix-r21-proposal.mjs، ومعها
// اكتمال أسباب الحجب (كل محجوب: سبب بقاعدة ومرحلة ومصدر، والمقيس رقم أو null مع سبب) وحالات C6/H2/H3/H10. لا يشغّل المحرك.
//   node scripts/kit2-matrix.mjs label1:عنوان1 label2:عنوان2 … → evidence/diagnosis-r21/proposal-matrix/KIT2-MATRIX.json وجدول Markdown
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const here = new URL('../', import.meta.url).pathname;
const DD = here + 'evidence/diagnosis-r21/proposal-matrix/', CD = here + 'evidence/coverage-r21/proposal-matrix/';
const IDS = [...Array.from({ length: 10 }, (_, i) => ['main', 'C' + (i + 1)]), ...Array.from({ length: 5 }, (_, i) => ['heldout', 'H' + (i + 1)]), ...Array.from({ length: 5 }, (_, i) => ['heldout2', 'H' + (i + 6)])];
const configs = process.argv.slice(2).map(a => { const i = a.indexOf(':'); return i > 0 ? [a.slice(0, i), a.slice(i + 1)] : [a, a]; });
const complete = h => !!(h.rule && h.stage && h.source && (h.reason_ar || h.reason) && (h.measured === null || h.measured === undefined ? !!h.measure_ar : Number.isFinite(h.measured)));
const out = [];
for (const [label, ar] of configs) {
  const C = IDS.map(([set, id]) => {
    const f = `${DD}${label}/${set}-${id}.json`; if (!existsSync(f)) return null;
    const j = JSON.parse(readFileSync(f, 'utf8')), shown = j.stage6_selection?.shown || [], vis = shown.filter(s => s.status !== 'hidden'), hid = shown.filter(s => s.status === 'hidden');
    return { id, ms: j.ms, rss: j.maxRssMB ?? null, visible: vis.length, ready: shown.filter(s => s.status === 'ready').length, mandatoryShown: vis.reduce((a, s) => a + (s.mandatory || []).length, 0),
      hiddenOnly: shown.length > 0 && !vis.length, hidden: hid.length, hiddenComplete: hid.filter(s => (s.hiddenReasons || []).length && s.hiddenReasons.every(complete)).length,
      error: j.error?.code || null, pat: shown.map(s => s.pat + ':' + s.status), treesNoSol: j.stage4_allocation?.treesWithoutSolution ?? null, trees: j.stage4_allocation?.treesOptimized ?? null };
  });
  const ok = C.filter(Boolean), Vf = `${CD}${label}-dev.json`, V = existsSync(Vf) ? JSON.parse(readFileSync(Vf, 'utf8')) : null;
  out.push({ label, ar, n: ok.length,
    cases: { withPlan: ok.filter(c => c.visible).length, visible: ok.reduce((a, c) => a + c.visible, 0), ready: ok.reduce((a, c) => a + c.ready, 0), mandatoryShown: ok.reduce((a, c) => a + c.mandatoryShown, 0),
      hiddenOnly: ok.filter(c => c.hiddenOnly).length, failed: ok.filter(c => c.error).length, hidden: ok.reduce((a, c) => a + c.hidden, 0), hiddenComplete: ok.reduce((a, c) => a + c.hiddenComplete, 0),
      sec: Math.round(ok.reduce((a, c) => a + c.ms, 0) / 1000), peakMB: Math.max(0, ...ok.map(c => c.rss || 0)) },
    dev: V ? { n: V.rows.length, sound: V.sound, hiddenOnly: V.hiddenOnly, incomplete: V.searchIncomplete, claimed: V.claimedInfeasible, proven: V.provenInfeasible, validShown: V.rows.reduce((a, x) => a + (x.validShown || 0), 0), ready: V.rows.reduce((a, x) => a + (x.statuses || []).filter(s => s === 'ready').length, 0),
      distinct: V.rows.reduce((a, x) => a + (x.distinctValid || 0), 0), leaks: V.rows.filter(x => x.leaks?.length).length, sec: Math.round(V.rows.reduce((a, x) => a + x.ms, 0) / 1000), peakMB: Math.max(...V.rows.map(x => x.rssMB || 0)),
      rows: V.rows.map(x => ({ id: x.id, outcome: x.outcome, statuses: x.statuses || x.code, distinct: x.distinctValid })) } : null,
    perCase: C });
}
writeFileSync(DD + 'KIT2-MATRIX.json', JSON.stringify({ generated: 'scripts/kit2-matrix.mjs', configs: out }, null, 1));
console.log('| التشكيل | C/H بمخطط صالح (20) | معروض صالح | جاهز | مخالفات إلزامية في المعروض | محجوب فقط | بلا بديل | محجوب: بسبب مكتمل | زمن C/H ث | ذروة MB | بذرة: سليم (40) | بذرة: معروض صالح | بذرة: جاهز | بذرة: مختلف r19 | بذرة: محجوب فقط | بذرة زمن ث | بذرة ذروة MB |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of out) { const c = r.cases, d = r.dev || {}; console.log(`| ${r.ar} | ${c.withPlan} | ${c.visible} | ${c.ready} | ${c.mandatoryShown} | ${c.hiddenOnly} | ${c.failed} | ${c.hiddenComplete}/${c.hidden} | ${c.sec} | ${c.peakMB} | ${d.sound ?? '—'} | ${d.validShown ?? '—'} | ${d.ready ?? '—'} | ${d.distinct ?? '—'} | ${d.hiddenOnly ?? '—'} | ${d.sec ?? '—'} | ${d.peakMB ?? '—'} |`); }
console.log('\n| الحالة | ' + out.map(r => r.ar).join(' | ') + ' |'); console.log('|---|' + out.map(() => '---').join('|') + '|');
const cell = c => !c ? '—' : c.error ? '✗ ' + c.error.replace('VILLA_', '') : c.hiddenOnly ? 'م' : `${c.visible}/${c.ready}`;
for (let i = 0; i < IDS.length; i++) { const row = out.map(r => cell(r.perCase[i])); if (new Set(row).size > 1 || ['C6', 'H2', 'H3', 'H10'].includes(IDS[i][1])) console.log(`| ${IDS[i][1]} | ${row.join(' | ')} |`); }
const devIds = out[0]?.dev?.rows.map(x => x.id) || [];
for (const id of devIds) { const row = out.map(r => { const x = r.dev?.rows.find(y => y.id === id); return x ? (x.outcome === 'sound' ? `سليم ${x.distinct}` : x.outcome === 'hidden-only' ? 'م' : 'غير مكتمل') : '—'; }); if (new Set(row).size > 1) console.log(`| ${id} (بذرة) | ${row.join(' | ')} |`); }
