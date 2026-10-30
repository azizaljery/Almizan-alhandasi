// (الجولة 21 — مقترح، أداة قياس غير سلوكية) مصفوفة الأثر: الأساس / كل موضوع وحده / الكل / الكل عدا موضوع — على C1–C10 وH1–H10 (سجلات
// scripts/diagnose-r21.mjs) وعلى بذرة التطوير المجمّدة (scripts/coverage-r21.mjs). لا يشغّل المحرك. لا يقرأ بذرة التقييم ولا H11–H15.
//   node scripts/matrix-r21-proposal.mjs → evidence/diagnosis-r21/proposal-matrix/MATRIX.json ويطبع جدولًا (Markdown)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const here = new URL('../', import.meta.url).pathname;
const DD = here + 'evidence/diagnosis-r21/proposal-matrix/', CD = here + 'evidence/coverage-r21/proposal-matrix/';
const CONFIGS = [
  ['base', 'الأساس 3b212e7'], ['mx-a01', '01 وحده'], ['mx-a02', '02 وحده'], ['mx-a03', '03 وحده'], ['mx-a04', '04 وحده'], ['mx-a06', '06 وحده (المعمم)'], ['mx-a07', '07 وحده'],
['mx-a02b', '02+02b وحده'], ['mx-a02b3', '02+02b + العدد من 03'],
    ['all', 'الكل (f108aa1)'], ['mx-all02b', 'الكل + 02b (687e7f2)'], ['mx-m02b', 'الكل + 02b عدا المقاسات (r21dimfix)'], ['mx-m01', 'الكل عدا 01'], ['mx-m02', 'الكل عدا 02'], ['mx-m03', 'الكل عدا 03'], ['mx-m04', 'الكل عدا 04'], ['mx-m06', 'الكل عدا 06'], ['mx-m07', 'الكل عدا 07'],
];
const IDS = [...Array.from({ length: 10 }, (_, i) => ['main', 'C' + (i + 1)]), ...Array.from({ length: 5 }, (_, i) => ['heldout', 'H' + (i + 1)]), ...Array.from({ length: 5 }, (_, i) => ['heldout2', 'H' + (i + 6)])];
const cases = label => IDS.map(([set, id]) => {
  const f = `${DD}${label}/${set}-${id}.json`; if (!existsSync(f)) return null;
  const j = JSON.parse(readFileSync(f, 'utf8')), shown = j.stage6_selection?.shown || [];
  const vis = shown.filter(s => s.status !== 'hidden');
  return { id, ms: j.ms, rss: j.maxRssMB ?? null, visible: vis.length, ready: shown.filter(s => s.status === 'ready').length, mandatoryShown: vis.reduce((a, s) => a + (s.mandatory || []).length, 0),
    hiddenOnly: shown.length > 0 && !vis.length, error: j.error?.code || null, pat: shown.map(s => s.pat + ':' + s.status) };
});
const cov = label => { const f = `${CD}${label}-dev.json`; return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const out = [];
for (const [label, ar] of CONFIGS) {
  const C = cases(label), V = cov(label), ok = C.filter(Boolean);
  const r = { label, ar, n: ok.length,
    cases: { withPlan: ok.filter(c => c.visible).length, visible: ok.reduce((a, c) => a + c.visible, 0), ready: ok.reduce((a, c) => a + c.ready, 0), mandatoryShown: ok.reduce((a, c) => a + c.mandatoryShown, 0),
      hiddenOnly: ok.filter(c => c.hiddenOnly).length, failed: ok.filter(c => c.error).length, sec: Math.round(ok.reduce((a, c) => a + c.ms, 0) / 1000), peakMB: Math.max(0, ...ok.map(c => c.rss || 0)) },
    dev: V ? { n: V.rows.length, sound: V.sound, hiddenOnly: V.hiddenOnly, proven: V.provenInfeasible, claimed: V.claimedInfeasible, incomplete: V.searchIncomplete,
      distinct: V.rows.reduce((a, x) => a + (x.distinctValid || 0), 0), leaks: V.rows.filter(x => x.leaks?.length).length, sec: Math.round(V.rows.reduce((a, x) => a + x.ms, 0) / 1000), peakMB: Math.max(...V.rows.map(x => x.rssMB || 0)) } : null,
    perCase: C };
  out.push(r);
}
mkdirSync(DD, { recursive: true });
writeFileSync(DD + 'MATRIX.json', JSON.stringify({ generated: 'scripts/matrix-r21-proposal.mjs', configs: out }, null, 1));
console.log('| التشكيل | C/H بمخطط صالح (من 20) | معروض صالح | جاهز | مخالفات إلزامية في المعروض | محجوب فقط | بلا بديل | زمن C/H ث | ذروة MB | dev سليم (من 40) | dev مختلف معماريًا (r19) | dev «مستحيل» بلا دليل | dev زمن ث | dev ذروة MB |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of out) { const c = r.cases, d = r.dev || {}; console.log(`| ${r.ar} | ${c.withPlan} | ${c.visible} | ${c.ready} | ${c.mandatoryShown} | ${c.hiddenOnly} | ${c.failed} | ${c.sec} | ${c.peakMB} | ${d.sound ?? '—'} | ${d.distinct ?? '—'} | ${d.claimed ?? '—'} | ${d.sec ?? '—'} | ${d.peakMB ?? '—'} |`); }
