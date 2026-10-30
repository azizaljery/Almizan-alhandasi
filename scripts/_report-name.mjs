// (الجولة 21 — أدوات القياس فقط) اسم ملف تقرير/قياس من مقاطع: يرفض أي مقطع غير صالح (undefined/null/فارغ/NaN/«undefined»/«null»/«NaN»
// نصًا/فيه فاصل مسار). السبب: scripts/coverage-report-r21.mjs شُغّل مرة بلا اسم قياس (process.argv[2] غير معرّف) فبُني المسار
// `${label}-report.json` = «undefined-report.json» — المسار نفسه صحيح البناء، والخطأ معامل لم يُمرَّر ولا تحقق منه.
const BAD = new Set(['undefined', 'null', 'nan', '']);
export function checkSegment(s) {
  if (s === undefined || s === null) throw Error(`مقطع اسم غير صالح: ${s}`);
  if (typeof s === 'number' && !Number.isFinite(s)) throw Error(`مقطع اسم غير صالح: ${s}`);
  const v = String(s).trim();
  if (BAD.has(v.toLowerCase()) || /[\\/]|\.\./.test(v) || /(^|[-_.])(undefined|null|NaN)([-_.]|$)/i.test(v)) throw Error(`مقطع اسم غير صالح: «${v}»`);
  return v;
}
/** reportName('proposal-final', 'dev') → 'proposal-final-dev'؛ ويرمي عند أي مقطع غير صالح. */
export const reportName = (...segs) => segs.map(checkSegment).join('-');
/** مسار ملف في مجلد: dir بنهاية «/»، والمقاطع تُضم بـ«-»، ثم الامتداد. */
export const reportPath = (dir, segs, ext = '.json') => dir + reportName(...segs) + ext;
