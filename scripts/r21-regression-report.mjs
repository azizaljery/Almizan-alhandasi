// (الجولة 21 — حزمة القبول) تقرير تراجعات مستقل: كل حالة من C1–C10 وH1–H10 وكل طلب في عينة التطوير (dev seed 2026102501) قبل/بعد، بين تشكيلات
// المصفوفة المقيسة (evidence/diagnosis-r21/proposal-matrix/<label>/ وevidence/coverage-r21/proposal-matrix/<label>-dev.json). يقارن، ولا يشغّل محركًا.
// التراجع = نقص في المعروض الصالح، أو في الجاهز، أو في عدد البدائل المتنوعة، أو انخفاض حالة بديل، أو نتيجة أسوأ، أو خطأ جديد، أو مخالفة إلزامية معروضة.
//   node scripts/r21-regression-report.mjs <قبل:عنوان> <بعد:عنوان> [...مراجع إضافية]  → يطبع JSON في stdout
import { readFileSync, existsSync } from 'node:fs';
const here = new URL('../', import.meta.url).pathname, DD = here + 'evidence/diagnosis-r21/proposal-matrix/', CD = here + 'evidence/coverage-r21/proposal-matrix/';
const IDS = [...Array.from({ length: 10 }, (_, i) => ['main', 'C' + (i + 1)]), ...Array.from({ length: 5 }, (_, i) => ['heldout', 'H' + (i + 1)]), ...Array.from({ length: 5 }, (_, i) => ['heldout2', 'H' + (i + 6)])];
const RANK = { ready: 3, 'needs-edits': 2, hidden: 1 }, OUT = { sound: 3, incomplete: 2, hiddenOnly: 1 };
const caseOf = (label, set, id) => { const f = `${DD}${label}/${set}-${id}.json`; if (!existsSync(f)) return null; const j = JSON.parse(readFileSync(f, 'utf8')), shown = j.stage6_selection?.shown || [], vis = shown.filter(s => s.status !== 'hidden');
  return { id, visible: vis.length, ready: shown.filter(s => s.status === 'ready').length, hidden: shown.length - vis.length, mandatoryShown: vis.reduce((a, s) => a + (s.mandatory || []).length, 0), error: j.error?.code || null, statuses: shown.map(s => s.pat + ':' + s.status).sort() }; };
const devOf = label => { const f = `${CD}${label}-dev.json`; return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const outcomeOf = r => r.outcome || (r.statuses?.length ? 'sound' : 'incomplete');
export function compare(before, after) {
  const cases = IDS.map(([set, id]) => { const a = caseOf(before, set, id), b = caseOf(after, set, id); if (!a || !b) return { id, missing: true };
    const reg = [], imp = [];
    const cmp = (name, x, y, higherBetter = true) => { if (x === y) return; ((higherBetter ? y < x : y > x) ? reg : imp).push(`${name}: ${x} ← ${y}`.replace(/^(.*): (.*) ← (.*)$/, `$1 $2→$3`)); };
    cmp('معروض صالح', a.visible, b.visible); cmp('جاهز', a.ready, b.ready); cmp('مخالفة إلزامية معروضة', a.mandatoryShown, b.mandatoryShown, false);
    if (!a.error && b.error) reg.push(`خطأ جديد ${b.error}`); if (a.error && !b.error) imp.push(`زال الخطأ ${a.error}`);
    return { id, before: a, after: b, regressions: reg, improvements: imp }; });
  const d0 = devOf(before), d1 = devOf(after), dev = [];
  if (d0 && d1) for (const r1 of d1.rows) { const r0 = d0.rows.find(x => x.id === r1.id); if (!r0) continue;
    const s0 = (r0.statuses || []).filter(s => s !== 'hidden').length, s1 = (r1.statuses || []).filter(s => s !== 'hidden').length, rd0 = (r0.statuses || []).filter(s => s === 'ready').length, rd1 = (r1.statuses || []).filter(s => s === 'ready').length;
    const reg = [], imp = [], push = (n, x, y) => { if (x !== y) (y < x ? reg : imp).push(`${n} ${x}→${y}`); };
    push('بدائل متنوعة', r0.distinctValid ?? 0, r1.distinctValid ?? 0); push('بدائل صالحة', s0, s1); push('جاهز', rd0, rd1);
    if ((OUT[outcomeOf(r1)] ?? 0) < (OUT[outcomeOf(r0)] ?? 0)) reg.push(`نتيجة ${outcomeOf(r0)}→${outcomeOf(r1)}`); else if ((OUT[outcomeOf(r1)] ?? 0) > (OUT[outcomeOf(r0)] ?? 0)) imp.push(`نتيجة ${outcomeOf(r0)}→${outcomeOf(r1)}`);
    dev.push({ id: r1.id, want: r1.want, before: { outcome: outcomeOf(r0), valid: s0, ready: rd0, distinct: r0.distinctValid ?? 0, statuses: r0.statuses || null }, after: { outcome: outcomeOf(r1), valid: s1, ready: rd1, distinct: r1.distinctValid ?? 0, statuses: r1.statuses || null }, regressions: reg, improvements: imp }); }
  const sum = list => ({ regressions: list.filter(x => x.regressions?.length).length, improvements: list.filter(x => x.improvements?.length).length, unchanged: list.filter(x => !x.missing && !x.regressions?.length && !x.improvements?.length).length });
  const tot = d => d ? { n: d.n, sound: d.sound, hiddenOnly: d.hiddenOnly, searchIncomplete: d.searchIncomplete, provenInfeasible: d.provenInfeasible, claimedInfeasible: d.claimedInfeasible } : null;
  return { before, after, cases, caseSummary: sum(cases), dev, devSummary: sum(dev), devTotals: { before: tot(d0), after: tot(d1) } };
}
if (process.argv[1] === new URL(import.meta.url).pathname) { const [b, a] = process.argv.slice(2); console.log(JSON.stringify(compare(b, a), null, 1)); }
