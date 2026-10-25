import { validatePlan } from './constraints.mjs';
import { solved, searchIncomplete, provenInfeasible } from './results.mjs';
import { selectDiverse } from './diversity.mjs';
/**
 * Production integration adapter, NOT a replacement generator.
 * hooks.enumerate: async (brief, {pass, budget}) => array of topologies
 * hooks.solve: async (topology, brief) => plan|null
 * hooks.review: async (plan, brief) => {valid:boolean,score:number,violations:[]}
 * hooks.frozenDifferent: (planA,planB) => boolean, true only when r19 says DIFFERENT
 * hooks.prove: async brief => proof|null, verified again here
 * hooks.additionalValidators: array of existing AZIZ/Mizan hard gates
 */
export async function generateR21(brief, hooks, { firstBudget = 100, secondBudget = 100 } = {}) {
  for (const key of ['enumerate', 'solve', 'review', 'frozenDifferent']) {
    if (typeof hooks[key] !== 'function') throw new Error(`Missing integration hook: ${key}`);
  }
  if (hooks.prove) {
    const proof = await hooks.prove(brief);
    if (proof) return provenInfeasible(brief, proof); // fails closed for unverified certificates
  }
  const accepted = [], stats = { passes: 0, topologies: 0, solved: 0, rejected: 0, errors: 0 };
  for (const [pass, budget] of [[1, firstBudget], [2, secondBudget]]) {
    stats.passes++;
    let topologies;
    try { topologies = await hooks.enumerate(brief, { pass, budget }); }
    catch { return searchIncomplete('SOLVER_ERROR', { diagnosticId: `enumerate-pass-${pass}`, requestedCount: brief.requestedCount }); }
    if (!Array.isArray(topologies)) throw new Error('enumerate must return array');
    stats.topologies += topologies.length;
    for (const topology of topologies) {
      let plan;
      try { plan = await hooks.solve(topology, brief); }
      catch { stats.errors++; continue; }
      if (!plan) continue;
      stats.solved++;
      const local = validatePlan(plan, brief, { extraValidators: hooks.additionalValidators ?? [] });
      if (!local.valid) { stats.rejected++; continue; }
      let review;
      try { review = await hooks.review(plan, brief); }
      catch { stats.errors++; continue; }
      if (!review?.valid || !Number.isFinite(review.score)) { stats.rejected++; continue; }
      accepted.push({ plan, valid: true, score: review.score });
    }
    const chosen = selectDiverse(accepted, brief.requestedCount, { frozenDifferent: hooks.frozenDifferent });
    if (chosen.length >= brief.requestedCount) return solved(chosen.map(x => x.plan), brief.requestedCount);
    // Even if 0 built in pass 1, ALWAYS try pass 2 before reporting failure.
  }
  const chosen = selectDiverse(accepted, brief.requestedCount, { frozenDifferent: hooks.frozenDifferent });
  if (chosen.length) return solved(chosen.map(x => x.plan), brief.requestedCount,
    ['ALTERNATIVE_SHORTFALL']);
  return searchIncomplete('NO_VALID_CANDIDATES', { diagnosticId: hooks.diagnosticId ?? 'r21-search',
    requestedCount: brief.requestedCount });
}
