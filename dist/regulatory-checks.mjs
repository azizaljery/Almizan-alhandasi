// Shared, reusable shape for presenting a "regulatory check" to the user.
//
// Rule this module exists to enforce in one place: the app may always show a
// computed geometric fact (a measured setback, a measured width, an applied
// coverage ratio) but it may only present that fact as PASSING or FAILING an
// actual building regulation when a real, current, correctly versioned
// source and a verification date are attached to the check. Absent that, the
// check must say so plainly ("لم يتم التحقق") instead of implying compliance.
// This module never invents a code name, section number, edition or date —
// callers cannot construct a 'pass'/'fail' verdict without a complete source.

export const REGULATORY_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  UNVERIFIED: 'unverified',
});

export const UNVERIFIED_LABEL = 'لم يتم التحقق';

const text = value => String(value ?? '').trim();
const isFiniteOrNull = value => value === null || value === undefined || Number.isFinite(value);

export const DEFAULT_VERIFICATION_NOTE = 'يتطلب تأكيد هذا الاشتراط من الكود أو الجهة البلدية المعتمدة لموقع المشروع، بنسخته الحالية وتاريخ تحقق فعلي، أو مراجعة مهندس/جهة مرخّصة.';

function resolveSource(rule, status, source) {
  if (status === REGULATORY_STATUS.UNVERIFIED) return null;
  const required = ['document', 'version', 'verifiedDate'];
  if (!source || required.some(key => !text(source[key]))) {
    throw Error(`لا يمكن اعتماد نتيجة "${status}" لاشتراط "${rule}" بلا مصدر موثّق كامل (الوثيقة، الإصدار، وتاريخ التحقق).`);
  }
  return Object.freeze({ document: text(source.document), version: text(source.version), verifiedDate: text(source.verifiedDate), section: text(source.section) || null });
}

/**
 * Build a regulatory-check record. Every field is required except `source`
 * (only meaningful for a verified pass/fail) and `unit`.
 * @param {{rule:string, measuredLabel:string, measuredValue?:number|null, unit?:string,
 *   status:'pass'|'fail'|'unverified', source?:{document:string,version:string,verifiedDate:string,section?:string}|null,
 *   requiresLicensedSpecialist?:boolean, verificationNote?:string}} input
 */
export function createRegulatoryCheck({
  rule, measuredLabel, measuredValue = null, unit = '', status,
  source = null, requiresLicensedSpecialist = true, verificationNote = '',
} = {}) {
  if (!text(rule)) throw Error('فحص نظامي بلا اسم اشتراط.');
  if (!text(measuredLabel)) throw Error('فحص نظامي بلا وصف للقيمة المحسوبة.');
  if (!isFiniteOrNull(measuredValue)) throw Error(`قيمة محسوبة غير صالحة لاشتراط "${rule}".`);
  if (!Object.values(REGULATORY_STATUS).includes(status)) throw Error(`حالة فحص نظامي غير معروفة لاشتراط "${rule}".`);
  const resolvedSource = resolveSource(rule, status, source);
  const note = text(verificationNote) || (status === REGULATORY_STATUS.UNVERIFIED ? DEFAULT_VERIFICATION_NOTE : '');
  return Object.freeze({
    rule: text(rule),
    measuredLabel: text(measuredLabel),
    measuredValue: measuredValue ?? null,
    unit: text(unit),
    status,
    source: resolvedSource,
    requiresLicensedSpecialist: Boolean(requiresLicensedSpecialist),
    verificationNote: note,
  });
}

/** Convenience for the common, honest case: no genuinely verified source exists yet. */
export function unverifiedCheck({ rule, measuredLabel, measuredValue = null, unit = '', verificationNote, requiresLicensedSpecialist = true } = {}) {
  return createRegulatoryCheck({ rule, measuredLabel, measuredValue, unit, status: REGULATORY_STATUS.UNVERIFIED, source: null, requiresLicensedSpecialist, verificationNote });
}

/** Turns a check into ready-to-render Arabic lines, keeping the computed fact visually/textually separate from the regulatory verdict. */
export function describeRegulatoryCheck(check) {
  const factLine = `${check.measuredLabel}: ${check.measuredValue === null ? '—' : check.measuredValue}${check.unit ? ' ' + check.unit : ''}`;
  const statusLabel = check.status === REGULATORY_STATUS.PASS ? 'مطابق للمصدر المذكور'
    : check.status === REGULATORY_STATUS.FAIL ? 'غير مطابق للمصدر المذكور'
    : UNVERIFIED_LABEL;
  const sourceLine = check.source
    ? `المصدر: ${check.source.document} — الإصدار ${check.source.version}${check.source.section ? '، ' + check.source.section : ''} (تحقق بتاريخ ${check.source.verifiedDate})`
    : 'لا يوجد مصدر نظامي موثّق مرفق بهذا الفحص.';
  const specialistLine = check.requiresLicensedSpecialist
    ? 'قيمة محسوبة من المخطط فقط؛ الاعتماد النظامي الفعلي يتطلب مراجعة مهندس أو جهة مرخّصة.'
    : 'قيمة محسوبة لا تحتاج اعتمادًا مرخّصًا بذاتها.';
  return { rule: check.rule, factLine, statusLabel, sourceLine, specialistLine, note: check.verificationNote };
}

const EVIDENCE_STATUS_BY_CHECK_STATUS = {
  [REGULATORY_STATUS.PASS]: 'ENFORCED',
  [REGULATORY_STATUS.FAIL]: 'NOT_MET',
  [REGULATORY_STATUS.UNVERIFIED]: 'UNVERIFIED',
};

/**
 * Adapts a regulatory check into the {id, title, status, evidence, source, category}
 * row shape used by dist/requirement-evidence.mjs's evidence ledger, so regulatory
 * checks render through the same, already-styled evidence-row UI and summary counts.
 */
export function toEvidenceRow(check, { id, category = 'الاشتراطات النظامية (الكود/البلدية)' } = {}) {
  const d = describeRegulatoryCheck(check);
  return {
    id,
    title: d.rule,
    status: EVIDENCE_STATUS_BY_CHECK_STATUS[check.status] || 'UNVERIFIED',
    evidence: `${d.factLine}. ${d.statusLabel}. ${d.specialistLine} ${d.note}`.replace(/\s+/g, ' ').trim(),
    source: check.source
      ? `${check.source.document} — الإصدار ${check.source.version}${check.source.section ? '، ' + check.source.section : ''} (تحقق ${check.source.verifiedDate})`
      : 'لا يوجد مصدر نظامي موثّق',
    category,
  };
}

export default { REGULATORY_STATUS, UNVERIFIED_LABEL, createRegulatoryCheck, unverifiedCheck, describeRegulatoryCheck, toEvidenceRow };
