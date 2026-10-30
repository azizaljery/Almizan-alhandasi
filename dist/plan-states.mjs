// (الجولة 21 — 02c، قرار المالك 2026-10-26 ثانيًا) فصل ثلاث حالات مستقلة في نتائج كل بديل ومخرجاته، لا تتحول إحداها إلى أخرى:
//   1) architectural — صلاحية التوزيع المعماري: حكم بوابات المراجعة وبنود طلب العميل (ready / needs-edits / hidden) قبل اختبارات الموقع.
//   2) tests — نجاح اختبارات الخصوصية والحركة (space-privacy.mjs لكل فراغ بدرجته، vehicle-movement.mjs، وفحص عنصر الموقع الهندسي):
//      passed true / false / null (لا ينطبق: لا مواقف ولا سواتر).
//   3) regulatory — التحقق النظامي: 'unverified' ما لم يوجد مصدر موثّق كامل؛ لا يصير 'pass' بنجاح الاختبارات الهندسية. لا يدخل في Mizan Score
//      (محور «المطابقة النظامية» فيه unavailable دائمًا — اختبار في tests/stage2-r21-rework.test.mjs) فلا يُحتسب «ناجحًا» هناك.
import { spacePrivacy } from './space-privacy.mjs';
import { vehicleMovement } from './vehicle-movement.mjs';
import { siteElementReport } from './site-element-check.mjs';
import { UNVERIFIED_LABEL } from './regulatory-checks.mjs';

export const REG_TAG_AR = 'تصميم مبدئي — المطابقة النظامية لستارة الخصوصية لم تُتحقق بعد';
export const REG_SHORT_AR = 'المطابقة النظامية لستارة الخصوصية لم تُتحقق بعد';
export const SCORE_NOTE_AR = 'درجة الميزان لا تحتسب المطابقة النظامية: محور «المطابقة النظامية» غير مُقيَّم فيها، فلا يظهر الساتر ناجحًا نظاميًا في الدرجة.';

/** اختبارات الخصوصية والحركة وعنصر الموقع لمستند. لا يعدّل المستند. */
export function planTests(doc) {
  const site = siteElementReport(doc), privacy = spacePrivacy(doc), movement = vehicleMovement(doc);
  const hasSite = site.fences.length > 0, hasBays = (doc.zones || []).some(z => z.type === 'garage');
  const failing = [...privacy.failing.map(t => 'خصوصية ' + t), ...(movement.passed === false ? movement.failing.map(t => 'حركة: ' + t) : []), ...(hasSite && !site.geometryOk ? site.failures_ar : [])];
  const applicable = hasBays || hasSite;
  return { applicable, passed: applicable ? failing.length === 0 : null, failing_ar: failing, privacy, movement, site: { fences: site.fences, geometryOk: site.geometryOk, failures_ar: site.failures_ar } , regulatory: site };
}
/** الحالات الثلاث لبديل. archStatus حكم البوابات قبل الاختبارات. */
export function planStates(archStatus, STATUS_AR, tests) {
  const reg = tests?.regulatory;
  return {
    architectural: { status: archStatus, label_ar: STATUS_AR[archStatus], note_ar: 'صلاحية التوزيع المعماري بحكم بوابات المراجعة وبنود الطلب فقط؛ ليست اعتمادًا معماريًا.' },
    tests: tests ? { applicable: tests.applicable, passed: tests.passed, privacyPassed: tests.privacy.passed, movementPassed: tests.movement.passed, failing_ar: tests.failing_ar, privacy: tests.privacy.spaces.map(s => ({ space: s.space, degree: s.degree, verdict: s.verdict, exposedLines: s.exposedLines, minDistance: s.minDistance })), movement: { passed: tests.movement.passed, doors: tests.movement.doors, approach: tests.movement.approach, passengers: tests.movement.passengers?.byCar || null, unverified: tests.movement.unverified } } : { applicable: false, passed: null },
    regulatory: reg && reg.fences.length ? { status: reg.pendingRegulatory ? 'unverified' : 'unknown', label_ar: UNVERIFIED_LABEL, tag_ar: REG_TAG_AR, items: reg.regulatory.map(c => ({ rule: c.rule, status: c.status, measuredValue: c.measuredValue, unit: c.unit, source: c.source, note_ar: c.verificationNote })), scoreNote_ar: SCORE_NOTE_AR } : { status: 'not-applicable', label_ar: 'لا عنصر موقع يحتاج تحققًا نظاميًا', items: [] },
  };
}
export default { planTests, planStates, REG_TAG_AR, REG_SHORT_AR, SCORE_NOTE_AR };
