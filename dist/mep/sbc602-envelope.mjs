// الحد الأقصى لمعامل انتقال الحرارة (U، واط/م²·°م للتجميعة) لغلاف المبنى السكني المكيف بحسب المنطقة المناخية —
// الكود السعودي لترشيد الطاقة للمباني السكنية SBC 602 (إصدار 2018)، المسار الإلزامي (prescriptive)، جداول
// «متطلبات غلاف البناء للمنطقة 1/2/3» (الجدول 5.2 وما يليه في النسخة العربية).
//
// المصادر (اطُّلع عليها 2026-11-08):
//  [A] نص SBC 602-AR-18 (نسخة PDF منشورة، غير صادرة من sbc.gov.sa):
//      https://docs.wixstatic.com/ugd/4069ce_f5d13b0847e043e49426f15593fa5e02.pdf
//      https://kh.aquaenergyexpo.com/wp-content/uploads/2023/08/602-الكود-السعودي-لترشيد-الطاقة.pdf
//      أعمدة الجدول: «مبنى سكني مكيف» و«مبنى سكني غير مكيف»، ولكلٍّ «قيمة (U) القصوى للتجميعات» و«قيمة (R) الدنيا للعزل».
//      البند 5.4.1: الغلاف حول المساحة المكيفة يتوافق مع متطلبات المساحة المكيفة. والجدول 11.1 يضع الرياض في المنطقة 1.
//  [B] F. A. AlFaraidy, S. Azzam, "Residential Buildings Thermal Performance to Comply With the Energy Conservation Code
//      of Saudi Arabia", Engineering, Technology & Applied Science Research 9(2), 2019, pp. 3949–3954, Table III:
//      جدار 0.342/0.387/0.453 وسقف 0.202/0.238/0.273 للمناطق 1/2/3، نافذة U = 2.668 وSHGC ≤ 0.25 لكل المناطق؛ الرياض المنطقة I.
//      https://pdfs.semanticscholar.org/4aac/ec000f8cce6da035e89a714e77ac4aad014e.pdf
//
// قاعدة التحقق: تُعتمد القيمة «متحققة» فقط إن اتفق عليها [A] و[B] رقمًا. نص [A] مستخرج من PDF عربي اختلط فيه ترتيب
// الأعمدة؛ نُسب العمود الأشد (U الأصغر) إلى «المكيف» لأن [B] يقدّمه بوصفه اشتراط الكود للمسكن، ولأن U = 1/R يطابق
// عمود العزل المقابل (R-2.92 → 0.342، R-5.0 → 0.202). ما اختلف فيه المصدران يبقى «غير متحقق» ولا يُستعمل.
// يجب مراجعة هذه القيم مع النسخة الرسمية من بوابة الكود السعودي قبل أي استخدام نظامي.

export const SBC602_SOURCE = Object.freeze({
  code: 'SBC 602-2018 (الكود السعودي لترشيد الطاقة للمباني السكنية)', path: 'المسار الإلزامي — مبنى سكني مكيف',
  refs: [
    'SBC 602-AR-18، جداول متطلبات غلاف البناء للمناطق 1–3 (نسخة PDF غير رسمية)',
    'AlFaraidy & Azzam, ETASR 9(2) 2019, Table III',
  ],
  checked: '2026-11-08', units: 'W/m²·K (U للتجميعة كاملة)',
});

/** حالة القيمة: 'verified' اتفق عليها المصدران، 'unverified' اختلفا أو تعذّرت القراءة (لا تُستعمل). */
export const SBC602_ENVELOPE = Object.freeze({
  1: Object.freeze({ zone: 1, ar: 'المنطقة 1 (حارة للغاية، CDD > 5000؛ منها الرياض)',
    wallU: { value: .342, status: 'verified', note: '[A] R-2.92 C.I · U-0.342؛ [B] 0.342' },
    roofU: { value: .202, status: 'verified', note: '[A] R-5.0 C.I · U-0.202؛ [B] 0.202' },
    glassU: { value: 2.668, status: 'verified', note: '[A] U-2.668 مع SHGC-0.25؛ [B] 2.668 لكل المناطق' },
    shgc: { value: .25, status: 'verified', note: '[A] و[B] ≤ 0.25' } }),
  2: Object.freeze({ zone: 2, ar: 'المنطقة 2 (حارة جدًا، CDD > 3500)',
    wallU: { value: null, status: 'unverified', note: '[A] يقرأ U-0.397 (R-2.5) و[B] يذكر 0.387 — المصدران مختلفان' },
    roofU: { value: .238, status: 'verified', note: '[A] R-4.2 C.I · U-0.238؛ [B] 0.238' },
    glassU: { value: 2.668, status: 'verified', note: '[A] U-2.668؛ [B] 2.668 لكل المناطق' },
    shgc: { value: .25, status: 'verified', note: '[A] و[B] ≤ 0.25' } }),
  3: Object.freeze({ zone: 3, ar: 'المنطقة 3 (حارة)',
    wallU: { value: .453, status: 'verified', note: '[A] U-0.453؛ [B] 0.453' },
    roofU: { value: .273, status: 'verified', note: '[A] R-3.5 C.I · U-0.273؛ [B] 0.273' },
    glassU: { value: 2.668, status: 'verified', note: '[A] U-2.668؛ [B] 2.668 لكل المناطق' },
    shgc: { value: .25, status: 'verified', note: '[A] و[B] ≤ 0.25' } }),
});

/** المنطقة الافتراضية للمشروع: افتراضات الأنظمة الحالية مبنية على الرياض، والرياض في المنطقة 1 ([A] الجدول 11.1، [B]). */
export const DEFAULT_ZONE = 1;
export const UNVERIFIED_AR = 'غير متحقق';

/**
 * قيم الغلاف لمنطقة: القيمة المتحققة من الكود، وإلا الافتراض الاحتياطي معلَّمًا «غير متحقق».
 * @param {1|2|3} zone
 * @param {{wallU:number, roofU:number, glassU:number}} fallback افتراضات المشروع السابقة
 */
export function envelopeFor(zone = DEFAULT_ZONE, fallback = { wallU: .57, roofU: .4, glassU: 2.8 }) {
  const z = SBC602_ENVELOPE[zone] || SBC602_ENVELOPE[DEFAULT_ZONE];
  const pick = k => (z[k].status === 'verified' ? { value: z[k].value, status: 'verified', source: `SBC 602-2018 ${z.ar.split(' (')[0]} — ${z[k].note}` }
    : { value: fallback[k], status: 'unverified', source: `${UNVERIFIED_AR}: ${z[k].note}؛ استُعمل افتراض المشروع ${fallback[k]}` });
  return { zone: z.zone, zoneAr: z.ar, wallU: pick('wallU'), roofU: pick('roofU'), glassU: pick('glassU'), shgc: z.shgc.status === 'verified' ? z.shgc.value : null };
}

export default { SBC602_SOURCE, SBC602_ENVELOPE, DEFAULT_ZONE, UNVERIFIED_AR, envelopeFor };
