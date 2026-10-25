import { unsupportedUpperWallSegments, isSleepKey } from './geometry.mjs';
/**
 * Candidate gate for the EXISTING two-floor solver, not a replacement solver.
 * Must run after ground geometry is fixed and before final review.
 */
export function upperCandidatePrecheck({ ground, upper, limits = {} }) {
  const problems = [];
  const tolerance = limits.alignmentTolerance ?? 0.05;
  const groundLines = ground?.supportLines ?? [];
  const upperWalls = upper?.wallSegments ?? [];
  const unsupported = unsupportedUpperWallSegments(upperWalls, groundLines, tolerance);
  if (unsupported.length) problems.push({id:'UNSUPPORTED_UPPER_WALL', count:unsupported.length,
    segments:unsupported});
  const stairs = (ground?.rooms ?? []).filter(r => r.type === 'stair');
  const upstairs = (upper?.rooms ?? []).filter(r => r.type === 'stair');
  if (!stairs.length || !upstairs.length) problems.push({id:'STAIR_MISSING'});
  else if (!stairs.some(g => upstairs.some(u => rectanglesOverlap(g,u))) ) problems.push({id:'STAIR_NOT_ALIGNED'});
  // No requirement that every ground-floor built cell must be covered upstairs.
  return { validPreliminary: problems.length===0, problems, structuralApproval:false };
}
function rectanglesOverlap(a,b) {
  const w=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
  const h=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
  return w>0.05 && h>0.05;
}
/** Correct v3 sleepKeys extraction; ST must never be treated as S1, S2, ... */
export function extractSleepKeys(R) { return Object.keys(R ?? {}).filter(isSleepKey); }
/** Filter proposed layouts without forcing ground-floor coverage. */
export function filterUpperCandidates(ground, proposals, limits) {
  return proposals.map(upper => ({upper, check:upperCandidatePrecheck({ground,upper,limits})}))
    .filter(x=>x.check.validPreliminary);
}
