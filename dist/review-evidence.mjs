// (الجولة 21 — 02c/01b، قرار المالك 2026-10-26) أدلة الرفض والحجب وصدق النتيجة. مكيَّف من حزمة المالك
// docs/owner/kit-r21-02b-01/src/review-evidence.mjs (rejection، assertBlocked، classifyRun، clientNotice) على عقد النتائج القائم من الإصلاح 03
// (villa-layout-v3.mjs classifyFailure: SOLVED / PROVEN_INFEASIBLE / SEARCH_INCOMPLETE) — لا عقد ثانٍ: «PROVEN_CONFLICT» في الحزمة هو
// PROVEN_INFEASIBLE عندنا (بشهادة يقبلها المدقق المستقل certificates.mjs وحده).
//
// ثلاث حالات منفصلة (القرار، 01 ثانيًا):
//   CANDIDATE_REJECTED  — مرشح داخلي رُفض أثناء البحث (بوابات الجودة أو المراجعة قبل الحوض): يُسجَّل سببه في السجل الداخلي ولا يُعرض.
//   ALTERNATIVE_HIDDEN  — بديل مكتمل الهندسة حُجب في بوابة القبول لمخالفة إلزامية: لا يُعرض صالحًا أبدًا، ولكل حجب سبب مُهيكل.
//   NO_VALID_ALTERNATIVE — انتهى البحث بلا بديل صالح (لا معروض غير محجوب): «بحث غير مكتمل» ما لم تثبت شهادة الاستحالة؛ لا يُقال للعميل «مستحيل».
// القيم المقيسة والحدود من فاحصات المشروع الحقيقية (قيمة البوابة value وحدها threshold، أو بند السجل)، وفي البوابات غير الرقمية null مع سبب
// صريح — لا رقم مختلق.
import { DESIGN_THRESHOLDS } from './plan-review.mjs';
import { COVERAGE_MAX } from './regulations-sa.mjs';

export const STAGES = Object.freeze(['brief', 'constraints', 'organization', 'dimensions', 'geometry', 'review', 'presentation', 'search']);
const STAGE_SET = new Set(STAGES);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** (الحزمة) سبب رفض/حجب مُهيكل؛ يرمي إن نقص حقل أو كان المقيس/الحد غير رقمي. */
export function rejection({ candidateId, stage, rule, source, reason, measured = null, limit = null, unit = null, ...extra }) {
  if (!candidateId || !STAGE_SET.has(stage) || !rule || !source || !reason) throw Error('Incomplete rejection evidence');
  if (measured !== null && !Number.isFinite(measured)) throw Error('Invalid measured value');
  if (limit !== null && !Number.isFinite(limit)) throw Error('Invalid limit');
  return Object.freeze({ candidateId: String(candidateId), stage, rule, source, reason, measured, limit, unit, ...extra });
}
/** (الحزمة) بديل محجوب بلا دليل خطأ — يُستعمل في الاختبارات والأدوات (لا في مسار العرض كي لا يقلب الحجب إلى عرض). */
export function assertBlocked(candidate) {
  const st = candidate.status ?? candidate.presentation?.status;
  if (st !== 'blocked' && st !== 'hidden') return true;
  const list = candidate.rejections ?? candidate.presentation?.hiddenReasons;
  if (!Array.isArray(list) || list.length === 0) throw Error('Blocked candidate without evidence');
  for (const r of list) rejection(r);
  return true;
}

/**
 * المقيس والحد والوحدة لبوابة مراجعة من قيمتها الفعلية (plan-review.mjs gateResult: value/threshold). البوابة التي لا رقم لها: null وسبب صريح.
 * g: { id, value, threshold?, reasons_ar }.
 */
export function gateEvidence(g) {
  const v = g?.value || {}, id = g?.id;
  const ev = (measured, limit, unit, measure_ar) => ({ measured: num(measured), limit: num(limit), unit: num(measured) !== null ? unit : null, measure_ar });
  switch (id) {
    case 'PARKING': {
      // العدد اشتراط نظامي متحقق: المرسوم مقابل المطلوب؛ وإن رسبت لموقف خارج الأرض أو داخل المبنى (لا عدد) فلا رقم
      if (num(v.bays) !== null && num(v.required) !== null && v.bays < v.required) return ev(v.bays, v.required, 'موقف', `${v.bays} موقف مرسوم من ${v.required} مطلوب نظاميًا`);
      return ev(null, null, null, `بوابة غير رقمية هنا: ${(g.reasons_ar || [])[0] || 'موقف خارج الأرض أو يتداخل مع المبنى'}`);
    }
    case 'REACH': return ev(v.unreachable, 0, 'غرفة', 'غرف لا يُوصل إليها من المدخل');
    case 'DAYLIGHT': return ev(v.withoutWindow, 0, 'غرفة', 'غرف معيشية بلا نافذة خارجية');
    case 'MIN_WIDTH': return v.tightest ? ev(v.tightest.width, v.tightest.min, 'م', `أضيق غرفة عن حدها (${v.tightest.type})`) : ev(v.violations, 0, 'غرفة', 'غرف أضيق من حدها');
    case 'HALL_ASPECT': return ev(v.worst, DESIGN_THRESHOLDS.hallAspectMax.value, 'نسبة', 'نسبة طول الصالة إلى عرضها');
    case 'WET_DOOR': case 'BED_MAJLIS': case 'INTEGRITY': return ev(v.violations, 0, 'مخالفة', g.ar || id);
    case 'DOOR_SWING': return ev(v.blocked, 0, 'باب', 'أبواب يعترض فتحها شيء');
    case 'PLOT': return ev(num(v.maxOverrun), DESIGN_THRESHOLDS.setbackTolerance.value, 'م', num(v.maxOverrun) === null ? 'عنصر خارج حدود الأرض' : 'أكبر تجاوز لخط الارتداد');
    case 'COVERAGE': return ev(v.ratioPct, COVERAGE_MAX.value, '٪', 'نسبة البناء في الدور الأرضي');
    case 'WINDOW_SIZE': return ev(Number.isFinite(v.worst) ? Math.round(v.worst * 1000) / 10 : null, DESIGN_THRESHOLDS.windowToFloorMin.value * 100, '٪', 'أقل نسبة زجاج إلى أرضية');
    case 'PROGRAM': {
      const req = v.requested || {}, got = v.drawn || {}, k = Object.keys(req).find(x => (got[x] ?? 0) < req[x]);
      return k ? ev(got[k] ?? 0, req[k], 'غرفة', `عدد «${k}» المرسوم مقابل المطلوب`) : ev(null, null, null, 'بوابة غير رقمية: أعداد البرنامج');
    }
    default: return ev(null, null, null, `بوابة غير رقمية (منطق وظيفي أو موضع أو مسار): ${(g?.reasons_ar || [])[0] || g?.ar || id}`);
  }
}
/** المقيس والحد لبند سجل راسب (dims: الضلع الأسوأ انحرافًا عند أضيق موضع؛ area: المساحة الصافية؛ count: العدد). */
export function ledgerEvidence(x) {
  if (x.kind === 'dims' && x.want) {
    const f = x.failing || x.actual; if (!f) return { measured: null, limit: null, unit: null, measure_ar: x.why || 'الفراغ غير موجود' };
    const dS = Math.abs(f.s - x.want.s), dL = Math.abs(f.l - x.want.l), side = dL > dS ? 'l' : 's';
    return { measured: num(f[side]), limit: num(x.want[side]), unit: 'م', tol: num(x.tol), side: side === 's' ? 'العرض' : 'الطول', envelope: f.envelope || x.envelope || null, measure_ar: `${side === 's' ? 'العرض' : 'الطول'} الصافي عند أضيق موضع صالح، والسماحية ±${x.tol} م` };
  }
  const m = /([\d.]+) م²/.exec(x.why || ''), a = /([\d.]+) م²/.exec(x.text || '');
  if (x.kind === 'area' && m && a) return { measured: +m[1], limit: +a[1], unit: 'م²', measure_ar: 'المساحة الصافية مقابل المطلوبة' };
  return { measured: null, limit: null, unit: null, measure_ar: `بند غير رقمي: ${x.why || x.text || x.id}` };
}

/**
 * تصنيف التشغيل بالحالات الثلاث مع عقد النتائج القائم. designs: المعروض بحالة عرضه؛ rejected: مرشحو البحث المرفوضون؛ failure: نتيجة الفشل
 * (e.result من classifyFailure) إن لم يُنتج بديل.
 */
export function classifyRun({ designs = [], rejected = [], failure = null } = {}) {
  const visible = designs.filter(d => d.presentation?.status !== 'hidden'), hidden = designs.filter(d => d.presentation?.status === 'hidden');
  const base = { candidatesRejected: rejected.length, hiddenAlternatives: hidden.map(d => ({ candidateId: d.pat || d.id || null, rejections: d.presentation?.hiddenReasons || [] })), validShown: visible.length };
  if (visible.length) return { ...base, status: 'SOLVED', outcome: 'VALID_ALTERNATIVES' };
  if (failure?.status === 'PROVEN_INFEASIBLE') return { ...base, status: 'PROVEN_INFEASIBLE', outcome: 'NO_VALID_ALTERNATIVE' };
  return { ...base, status: 'SEARCH_INCOMPLETE', reason: failure?.reason || (hidden.length ? 'ONLY_HIDDEN_ALTERNATIVES' : 'SEARCH_EXHAUSTED_WITHOUT_PROOF'), outcome: hidden.length ? 'ALTERNATIVE_HIDDEN' : 'NO_VALID_ALTERNATIVE' };
}
/** (الحزمة) رسالة العميل بلا مصطلحات بحث: العدد، ومعنى «لم يُعثر» (لا يثبت الاستحالة)، وسبب الحجب بلغته. */
export function clientNotice(result, { requested, shown } = {}) {
  const count = Number.isInteger(requested) && requested > 0 && Number.isInteger(shown) && shown >= 0 ? `عُرض ${shown} من ${requested} ${requested === 1 ? 'تصميم' : 'تصاميم'} طلبتها. ` : '';
  if (result.status === 'SOLVED') return count + 'المخططات اجتازت الفحص الأولي، وتحتاج مراجعة هندسية قبل التنفيذ.';
  if (result.status === 'PROVEN_INFEASIBLE') return count + 'هناك تعارض مثبت بين متطلبين في طلبك؛ نحتاج توضيح أيهما تفضّل.';
  if (result.outcome === 'ALTERNATIVE_HIDDEN') return count + 'أقرب التصاميم التي وصلتُ إليها تخالف شرطًا أساسيًا في طلبك، فلم أعرضها. هذا لا يثبت أن طلبك مستحيل.';
  return count + 'لم أصل إلى مخطط صالح لطلبك في هذه المحاولة. هذا لا يثبت أن طلبك مستحيل.';
}
/** أسباب رفض مرشح أثناء البحث (CANDIDATE_REJECTED) مُهيكلة من سجل الرفض الموجود (why/gates/gateEv). */
export function candidateRejections(r) {
  const id = r.pat || '*';
  if (Array.isArray(r.gateEv) && r.gateEv.length) return r.gateEv.map(g => ({ candidateId: id, stage: 'review', rule: 'GATE:' + g.id, source: g.tier || 'review', reason: (g.reasons_ar || [])[0] || g.ar || g.id, ...gateEvidence(g) }));
  const why = (r.why || []).map(String);
  return (why.length ? why : ['سبب غير مسجل']).slice(0, 6).map(w => ({ candidateId: id, stage: r.by === 'plan-review' ? 'review' : /لا دور علوي|لا ترتيب|Error|TypeError/.test(w) ? 'search' : 'geometry', rule: r.by === 'plan-review' ? 'REVIEW' : 'QUALITY_GATE', source: 'mizan-default', reason: w, measured: null, limit: null, unit: null, measure_ar: 'نص فحص الجودة كما سُجّل (لا قيمة رقمية مخزنة)' }));
}
export default { STAGES, rejection, assertBlocked, gateEvidence, ledgerEvidence, classifyRun, clientNotice, candidateRejections };
