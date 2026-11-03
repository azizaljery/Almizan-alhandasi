// قياس الفروق بالبكسل بين لقطتين بنفس الأبعاد. الاستخدام: node diff.cjs <a.png> <b.png> [x0 y0 x1 y1]
const sharp = require('/home/claude/.npm-global/lib/node_modules/sharp');
(async () => {
  const [a, b, ...rest] = process.argv.slice(2);
  const roi = rest.length === 4 ? rest.map(Number) : null;
  const load = async f => { const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
  const A = await load(a), B = await load(b);
  if (A.w !== B.w || A.h !== B.h) throw new Error('size mismatch');
  const [x0, y0, x1, y1] = roi || [0, 0, A.w, A.h];
  let sum = 0, n = 0, over = 0, lumA = 0, lumB = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * A.w + x) * 3;
    const da = (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3, db = (B.data[i] + B.data[i + 1] + B.data[i + 2]) / 3;
    const d = Math.abs(da - db);
    sum += d; n++; if (d > 20) over++; lumA += da; lumB += db;
  }
  console.log(JSON.stringify({ a: a.split('/').pop(), b: b.split('/').pop(), roi: [x0, y0, x1, y1], pixels: n, meanAbsDiff: +(sum / n).toFixed(3), pixelsDiffOver20: over, meanLumA: +(lumA / n).toFixed(2), meanLumB: +(lumB / n).toFixed(2) }));
})().catch(e => { console.error(e.message); process.exit(1); });
