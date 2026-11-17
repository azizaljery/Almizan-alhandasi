import { makeSession, buildFacts, buildCases, decide, judge, buildPromptChecks, buildContextChecks } from './shara-eval.mjs';
export async function runEval() {
  const S = await makeSession(), F = buildFacts(S), cases = buildCases(F), rows = [];
  for (const c of cases) { let r; try { r = await decide(S, c.q); } catch (e) { r = { via: 'error', text: String(e), kind: 'error' }; } const j = r.via === 'error' ? { pass: false, why: 'استثناء: ' + r.text } : judge(c, r, F); rows.push({ ...c, via: r.via + (r.escalated ? '→remote' : ''), text: r.text, ...j }); }
  const checks = [...buildPromptChecks(), ...buildContextChecks(F, S)].map(k => { const why = k.test(); return { id: k.id, cat: 'تعليمات/سياق', q: k.desc, pass: !why, why }; });
  return { rows, checks, S, F };
}
if (process.argv[1]?.endsWith('shara-eval-run.mjs')) {
  const { rows, checks } = await runEval(); const all = [...rows, ...checks], pass = all.filter(x => x.pass).length;
  const cats = {}; for (const x of all) { (cats[x.cat] ||= [0, 0])[1]++; if (x.pass) cats[x.cat][0]++; }
  for (const x of all) if (!x.pass) console.log(`FAIL #${x.id} [${x.cat}] ${x.q} (${x.via || ''}) :: ${x.why} :: ${String(x.text).slice(0, 140)}`);
  console.log(JSON.stringify(cats)); console.log(`pass ${pass}/${all.length} = ${Math.round(pass / all.length * 100)}%`);
}
