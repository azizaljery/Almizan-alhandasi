/** Truthful, typed result contract. No heuristic gross-area ratio proves infeasibility. */
export const STATUS = Object.freeze({
  SOLVED: 'SOLVED', PROVEN_INFEASIBLE: 'PROVEN_INFEASIBLE', SEARCH_INCOMPLETE: 'SEARCH_INCOMPLETE'
});
export const SEARCH_REASONS = Object.freeze([
  'TIME_LIMIT', 'SEARCH_EXHAUSTED_WITHOUT_PROOF', 'SOLVER_ERROR', 'UNSUPPORTED_CASE', 'NO_VALID_CANDIDATES'
]);
export function solved(alternatives, requestedCount, warnings = []) {
  if (!Array.isArray(alternatives) || !alternatives.length) throw new Error('SOLVED needs alternatives');
  if (!Number.isInteger(requestedCount) || requestedCount < 1) throw new Error('Invalid requested count');
  return { status: STATUS.SOLVED, alternatives, requestedCount, warnings,
    shortfall: Math.max(0, requestedCount - alternatives.length) };
}
/** Proof must be independently verified against actual brief; no generic "solver said impossible". */
export function verifyLogicalContradiction(brief, proof) {
  if (proof?.type !== 'LOGICAL_CONTRADICTION') return false;
  const a = brief.constraints?.find(c => c.id === proof.a);
  const b = brief.constraints?.find(c => c.id === proof.b);
  return !!a && !!b && !!a.subject && !!a.predicate && !!b.subject && !!b.predicate &&
    a.level === 'HARD' && b.level === 'HARD' &&
    a.subject === b.subject && a.predicate === b.predicate &&
    ((a.op === 'REQUIRE' && b.op === 'FORBID') || (a.op === 'FORBID' && b.op === 'REQUIRE'));
}
export function provenInfeasible(brief, proof) {
  if (!verifyLogicalContradiction(brief, proof)) throw new Error('Unverified proof: do not claim infeasibility');
  return { status: STATUS.PROVEN_INFEASIBLE, proof: structuredClone(proof), conflictingConstraintIds: [proof.a, proof.b] };
}
export function searchIncomplete(reason, diagnostics = {}) {
  if (!SEARCH_REASONS.includes(reason)) throw new Error('Invalid search failure reason');
  return { status: STATUS.SEARCH_INCOMPLETE, reason,
    diagnosticId: String(diagnostics.diagnosticId ?? ''), retryable: reason !== 'UNSUPPORTED_CASE',
    requestedCount: diagnostics.requestedCount ?? null };
}
const CLIENT_FORBIDDEN = [
  /\b(?:CSP|stack|hardLink|R14_OFF|TypeError|VILLA_NO_FIT|VILLA_BUILD_FAILED|__v2dbg)\b/iu,
  /(?:شبكة\s*\d+\s*[×x]\s*\d+|القيود الصلبة|شجرة تقسيم|خطأ داخلي|رمز الاستثناء)/iu
];
export function lintClientText(text) {
  return CLIENT_FORBIDDEN.filter(re => re.test(text)).map(re => re.source);
}
export function explainToClient(result, { language = 'ar' } = {}) {
  if (language !== 'ar') throw new Error('Only Arabic client messages supported in this kit');
  let message;
  if (result.status === STATUS.SOLVED) {
    const n = result.alternatives.length, want = result.requestedCount;
    message = n >= want ? `أعددنا لك ${n} تصاميم قابلة للمراجعة.` :
      `أعددنا لك ${n} من أصل ${want} تصاميم طلبتها. لم نجد العدد المتبقي بالشروط الحالية، ولا يعني ذلك استحالة إنتاج بدائل أخرى.`;
  } else if (result.status === STATUS.PROVEN_INFEASIBLE) {
    message = `وجدنا تعارضًا مثبتًا بين شرطين إلزاميين في طلبك. يرجى مراجعة الشرطين المحددين قبل المتابعة.`;
  } else if (result.status === STATUS.SEARCH_INCOMPLETE) {
    const reasons = {
      TIME_LIMIT: 'انتهى الوقت المخصص للبحث', SEARCH_EXHAUSTED_WITHOUT_PROOF: 'لم نجد مخططًا مناسبًا ضمن المحاولات الحالية',
      SOLVER_ERROR: 'تعذر إكمال معالجة الطلب', UNSUPPORTED_CASE: 'هذه الحالة غير مدعومة حاليًا',
      NO_VALID_CANDIDATES: 'لم نجد مخططًا يجتاز جميع الشروط ضمن المحاولات الحالية'
    };
    message = `${reasons[result.reason]}. لم نثبت أن طلبك مستحيل، ويمكن إعادة المحاولة أو مراجعة المتطلبات معك.`;
  } else throw new Error('Unknown generation status');
  if (lintClientText(message).length) throw new Error('Client message contains internal terminology');
  return message;
}
/** Never pass raw exception text to client. */
export function errorToResult(error, diagnosticId = '') {
  return searchIncomplete('SOLVER_ERROR', { diagnosticId });
}
