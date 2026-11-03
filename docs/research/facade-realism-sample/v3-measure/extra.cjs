// قياس تدرج الانعكاس داخل الزجاج (الانعكاس السماوي يتدرج رأسيًا) وخريطة فرق مكبّرة لفحص موضع الظل
const sharp = require('/home/claude/.npm-global/lib/node_modules/sharp');
const [,, mode, a, b, x0s, y0s, x1s, y1s, outp] = process.argv;
const [x0, y0, x1, y1] = [x0s, y0s, x1s, y1s].map(Number);
const load = async f => { const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width }; };
(async () => {
  if (mode === 'grad') {
    for (const f of [a, b]) {
      const I = await load(f); const rows = [];
      for (const [ya, yb] of [[y0, y0 + (y1 - y0) / 3], [y0 + (y1 - y0) / 3, y0 + 2 * (y1 - y0) / 3], [y0 + 2 * (y1 - y0) / 3, y1]]) {
        let s = 0, n = 0; for (let y = Math.round(ya); y < yb; y++) for (let x = x0; x < x1; x++) { const i = (y * I.w + x) * 3; s += (I.data[i] + I.data[i + 1] + I.data[i + 2]) / 3; n++; }
        rows.push(+(s / n).toFixed(1));
      }
      console.log(JSON.stringify({ f: f.split('/').pop(), topThirdMidThirdBottomThird: rows }));
    }
  } else if (mode === 'heat') {
    const A = await load(a), B = await load(b); const w = A.w, h = A.data.length / 3 / w;
    const out = Buffer.alloc(w * h * 3); let cnt = 0;
    for (let i = 0; i < w * h; i++) { const la = (A.data[i * 3] + A.data[i * 3 + 1] + A.data[i * 3 + 2]) / 3, lb = (B.data[i * 3] + B.data[i * 3 + 1] + B.data[i * 3 + 2]) / 3; const d = Math.min(255, Math.abs(la - lb) * 8); out[i * 3] = d; out[i * 3 + 1] = 0; out[i * 3 + 2] = 0; if (Math.abs(la - lb) > 3) cnt++; }
    await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(outp);
    console.log(JSON.stringify({ heat: outp.split('/').pop(), pixelsDiffOver3: cnt }));
  }
})().catch(e => { console.error(e.stack); process.exit(1); });
