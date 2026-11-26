// جودة الصورة ≠ صحة المخطط ≠ واقعية فوتوغرافية. لا يثبت أي منها الآخر.
import { edgeMaps, FIDELITY } from '../photo-fidelity.mjs';

export const IMAGE_QUALITY_SCHEMA = 'architect-image-quality/1';
export const IMAGE_TARGETS = Object.freeze({ minLong: 768, minShort: 512, minStdDev: 5, minReferenceEdges: 12, aspectTolerance: .04 });
function stats(img) {
  if (!img?.data || !(img.width > 0 && img.height > 0) || img.data.length !== img.width * img.height * 4) throw Error('invalid_rgba_image');
  let s = 0, s2 = 0, low = 0, high = 0, opaque = 0;
  const n = img.width * img.height;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = .299 * img.data[i] + .587 * img.data[i + 1] + .114 * img.data[i + 2];
    s += v; s2 += v * v; if (v < 8) low++; if (v > 247) high++; if (img.data[i + 3] > 250) opaque++;
  }
  const mean = s / n;
  return { mean, stdDev: Math.sqrt(Math.max(0, s2 / n - mean * mean)), shadowFraction: low / n, highlightFraction: high / n, opaqueFraction: opaque / n };
}
export function imageEvidenceReport({ reference, output, referenceSize = reference, outputSize = output, fidelity = null, kind = 'exterior', capturedDesignKey = '', currentDesignKey = '' }, targets = IMAGE_TARGETS) {
  const checks = [], add = (id, state, message, evidence = {}) => checks.push({ id, state, message, evidence });
  const a = stats(reference), b = stats(output), refEdges = edgeMaps(reference), strongEdges = refEdges.v.reduce((s, v, i) => s + (Math.max(v, refEdges.h[i]) >= FIDELITY.strongRef ? 1 : 0), 0);
  const ratioA = referenceSize.width / referenceSize.height, ratioB = outputSize.width / outputSize.height;
  add('resolution', Math.max(outputSize.width, outputSize.height) >= targets.minLong && Math.min(outputSize.width, outputSize.height) >= targets.minShort ? 'pass' : 'fail', 'دقة الصورة الناتجة', { width: outputSize.width, height: outputSize.height, minLong: targets.minLong, minShort: targets.minShort });
  add('framing-aspect', Math.abs(ratioB / ratioA - 1) <= targets.aspectTolerance ? 'pass' : 'fail', 'حفظ نسبة إطار اللقطة', { reference: ratioA, output: ratioB });
  add('image-information', b.stdDev >= targets.minStdDev && b.opaqueFraction >= .95 ? 'pass' : 'fail', 'الصورة تحمل تفاصيل وليست مسطحًا فارغًا أو شفافًا', b);
  add('reference-evidence', a.stdDev >= targets.minStdDev && strongEdges >= targets.minReferenceEdges ? 'pass' : 'unknown', 'وجود خطوط هندسية كافية في لقطة المجسم قبل الحكم على المطابقة', { strongEdges, stdDev: a.stdDev });
  add('design-version', capturedDesignKey && currentDesignKey ? capturedDesignKey === currentDesignKey ? 'pass' : 'fail' : 'unknown', 'الصورة مرتبطة بنسخة التصميم الحالية', { capturedDesignKey, currentDesignKey });
  const sufficient = checks.find(c => c.id === 'reference-evidence').state === 'pass';
  const measuredOpenings = (fidelity?.doors?.n || 0) + (fidelity?.windows?.n || 0), unknown = fidelity?.unknown || [];
  add('preserved-geometry', !sufficient || !fidelity ? 'unknown' : fidelity.ok === false ? 'fail' : kind === 'interior' && (!measuredOpenings || unknown.some(l => l.kind === 'door' || l.kind === 'window')) ? 'unknown' : 'pass',
    'حفظ الخطوط والمعالم التي أمكن قياسها', { score: fidelity?.score ?? null, measuredOpenings, unknown });
  add('added-elements', 'unknown', 'إضافة نافذة أو باب جديد لا يثبتها استرجاع الحواف؛ قارن الصورة بالمجسم بصريًا.');
  add('photorealism', 'unknown', 'الواقعية وجودة الخامات تحتاجان حكمًا بصريًا على عينة حقيقية؛ لا تُستنتجان من عدد المثلثات أو دقة الصورة.');
  return { schema: IMAGE_QUALITY_SCHEMA, status: checks.some(c => c.state === 'fail') ? 'needs-revision' : 'requires-visual-review', checks,
    technicalPass: checks.filter(c => ['resolution', 'framing-aspect', 'image-information'].includes(c.id)).every(c => c.state === 'pass'),
    geometryMeasured: checks.find(c => c.id === 'preserved-geometry').state === 'pass', photorealism: 'unverified' };
}
const load = src => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(Error('image_quality_load_failed')); i.src = src; });
function pixels(i) {
  const scale = Math.min(1, 384 / Math.max(i.naturalWidth, i.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(i.naturalWidth * scale)); c.height = Math.max(1, Math.round(i.naturalHeight * scale));
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0, c.width, c.height); return x.getImageData(0, 0, c.width, c.height);
}
export async function auditImageUrls(before, after, context = {}) {
  const [a, b] = await Promise.all([load(before), load(after)]);
  return imageEvidenceReport({ ...context, reference: pixels(a), output: pixels(b), referenceSize: { width: a.naturalWidth, height: a.naturalHeight }, outputSize: { width: b.naturalWidth, height: b.naturalHeight } });
}
export function imageQualityMessage(report) {
  if (!report) return 'تعذّر فحص جودة الصورة؛ يلزم التحقق البصري.';
  const issues = report.checks.filter(c => c.state === 'fail' || (c.state === 'unknown' && ['reference-evidence', 'preserved-geometry', 'design-version'].includes(c.id)));
  return issues.length ? issues.map(c => c.message).join('؛ ') + '. يلزم مراجعة اللقطة.' : 'اجتازت الفحوص التقنية وحفظ المعالم المقاسة. الواقعية والعناصر المضافة تحتاجان مقارنة بصرية بالمجسم.';
}
