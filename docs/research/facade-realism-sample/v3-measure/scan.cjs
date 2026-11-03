// قطاع أفقي بالبكسل عبر الفتحة: قيمة اللون الرمادي لكل بكسل في الصفوف المحددة (لتحديد عرض الظل داخل الارتداد)
const sharp = require('/home/claude/.npm-global/lib/node_modules/sharp');
const [,, f, y, xa, xb] = process.argv;
(async () => {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const row = []; for (let x = +xa; x <= +xb; x++) { const i = (+y * info.width + x) * 3; row.push(Math.round((data[i] + data[i + 1] + data[i + 2]) / 3)); }
  console.log(f.split('/').pop(), 'y=' + y, 'x' + xa + '..' + xb, row.join(' '));
})();
