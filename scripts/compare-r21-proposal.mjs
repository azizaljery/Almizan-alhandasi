// (الجولة 21 — مقترح، أداة قياس غير سلوكية) يقارن سجلات التشخيص لحالات C1–C10 وH1–H10 بين نسختين (الأساس 3b212e7 ورأس المقترح):
// الزمن، وذروة الذاكرة، والمعروض غير المحجوب، والجاهز، والمختلف معماريًا بالمعيار المجمّد بين المعروض، وحوض البدائل، وتصنيف النتيجة.
//   node scripts/compare-r21-proposal.mjs <labelA> <labelB>   → يكتب evidence/diagnosis-r21/compare-<A>-vs-<B>.json ويطبع جدولًا
// لا يشغّل المحرك. لا يقرأ H11–H15.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [A = 'base-3b212e7', B = 'proposal-head'] = process.argv.slice(2);
const dir = new URL('../evidence/diagnosis-r21/', import.meta.url).pathname;
const ids = [...Array.from({ length: 10 }, (_, i) => ['main', 'C' + (i + 1)]), ...Array.from({ length: 5 }, (_, i) => ['heldout', 'H' + (i + 1)]), ...Array.from({ length: 5 }, (_, i) => ['heldout2', 'H' + (i + 6)])];
const row = (label, set, id) => {
  const f = `${dir}${label}/${set}-${id}.json`; if (!existsSync(f)) return null;
  const j = JSON.parse(readFileSync(f, 'utf8')), shown = j.stage6_selection?.shown || [];
  const vis = shown.filter(s => s.status !== 'hidden');
  return { ms: j.ms, maxRssMB: j.maxRssMB ?? null, shown: shown.length, visible: vis.length, ready: shown.filter(s => s.status === 'ready').length,
    mandatory: shown.filter(s => (s.mandatory || []).length).length, distinctPool: Array.isArray(j.stage5_validation?.poolDistinctByFrozenCriterion) ? j.stage5_validation.poolDistinctByFrozenCriterion.length : null,
    pool: j.stage5_validation?.pool ?? null, error: j.error?.code || null, result: j.result?.kind || j.result?.status || j.error?.result?.kind || null, keep: j.case?.keep };
};
const out = ids.map(([set, id]) => ({ id, a: row(A, set, id), b: row(B, set, id) }));
const sum = (k, side) => out.reduce((s, r) => s + (r[side]?.[k] || 0), 0);
const tot = { a: { ms: sum('ms', 'a'), visible: sum('visible', 'a'), ready: sum('ready', 'a'), withVisible: out.filter(r => r.a?.visible).length }, b: { ms: sum('ms', 'b'), visible: sum('visible', 'b'), ready: sum('ready', 'b'), withVisible: out.filter(r => r.b?.visible).length },
  peakRssMB: { a: Math.max(0, ...out.map(r => r.a?.maxRssMB || 0)), b: Math.max(0, ...out.map(r => r.b?.maxRssMB || 0)) } };
writeFileSync(`${dir}compare-${A}-vs-${B}.json`, JSON.stringify({ A, B, rows: out, totals: tot }, null, 1));
const fmt = r => (r ? `${(r.ms / 1000).toFixed(0)}s ${r.maxRssMB ?? '?'}MB vis${r.visible}/${r.keep} ready${r.ready} poolD${r.distinctPool}${r.error ? ' ' + r.error : ''}` : '—');
for (const r of out) console.log(r.id.padEnd(4), fmt(r.a).padEnd(40), fmt(r.b));
console.log(JSON.stringify(tot));
