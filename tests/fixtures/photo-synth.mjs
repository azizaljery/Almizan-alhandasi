// مشاهد اصطناعية لاختبار فحص الأمانة: فيلا بسيطة (سماء، أرض، كتلة بدورين، فتحات، سور وبوابة) تُرسم إلى RGBA.
// الخيارات: dx/dy إزاحة المبنى، extraFloor دور زائد، real «تصيير واقعي» (ألوان أخرى + ملمس + نبات + سحب) للهندسة نفسها.
function rnd(seed) { let a = seed | 0 || 1; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function villaScene({ W = 600, H = 400, dx = 0, dy = 0, extraFloor = false, real = false, seed = 7, other = false, palms = false, annex = false } = {}) {
  const data = new Uint8ClampedArray(W * H * 4), R = rnd(seed);
  const px = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) px(x, y, c); };
  const P = real ? { skyT: [70, 120, 190], skyB: [240, 200, 160], ground: [120, 110, 100], wall: [214, 190, 150], win: [40, 55, 70], fence: [190, 170, 135], door: [90, 60, 40] }
    : { skyT: [150, 190, 230], skyB: [215, 228, 240], ground: [170, 170, 165], wall: [232, 226, 214], win: [70, 90, 110], fence: [205, 200, 190], door: [120, 90, 60] };
  const gy = H * .78;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = y / gy; px(x, y, y < gy ? P.skyT.map((v, k) => v + (P.skyB[k] - v) * t) : P.ground); }
  if (real) for (let k = 0; k < 5; k++) { const cx = R() * W, cy = R() * H * .25, r = 30 + R() * 40; for (let y = -r; y < r; y++) for (let x = -r * 2; x < r * 2; x++) { const d = (x / 2) ** 2 + y ** 2; if (d < r * r) { const i = ((cy + y | 0) * W + (cx + x | 0)) * 4; if (i >= 0 && i < data.length && cx + x >= 0 && cx + x < W) { const a = .18 * (1 - d / (r * r)); data[i] += (255 - data[i]) * a; data[i + 1] += (255 - data[i + 1]) * a; data[i + 2] += (255 - data[i + 2]) * a; } } } }
  // المبنى
  const fh = H * .2, floors = other ? 1 : extraFloor ? 3 : 2, bx0 = (other ? W * .1 : W * .25) + dx, bx1 = (other ? W * .55 : W * .75) + dx, by1 = gy + dy, by0 = by1 - floors * fh;
  rect(bx0, by0, bx1, by1, P.wall);
  if (!other) rect(bx0 + (bx1 - bx0) * .62, by0 - (extraFloor ? 0 : 0), bx1, by1, P.wall.map(v => v - 22)); // كتلة جانبية أغمق
  for (let f = 0; f < floors; f++) for (let k = 0; k < (other ? 2 : 4); k++) {
    const wx = bx0 + (bx1 - bx0) * (.08 + k * (other ? .45 : .235)), wy = by0 + f * fh + fh * .25;
    if (f === floors - 1 && k === 1 && !other) rect(wx, wy + fh * .1, wx + (bx1 - bx0) * .1, by1, P.door); else rect(wx, wy, wx + (bx1 - bx0) * .13, wy + fh * .5, P.win);
  }
  rect(bx0 - 4, by0 - 6, bx1 + 4, by0, P.wall.map(v => v - 40)); // دروة
  if (annex) { rect(bx0 + (bx1 - bx0) * .15, by0 - fh * .8, bx0 + (bx1 - bx0) * .6, by0, P.wall); rect(bx0 + (bx1 - bx0) * .15 - 3, by0 - fh * .8 - 5, bx0 + (bx1 - bx0) * .6 + 3, by0 - fh * .8, P.wall.map(v => v - 40)); } // ملحق مضاف فوق السطح
  // السور والبوابة
  const fy0 = gy - H * .09 + dy; rect(W * .04 + dx, fy0, W * .96 + dx, gy + dy, P.fence); rect(W * .46 + dx, fy0 - 8, W * .54 + dx, gy + dy, P.door);
  if (real) {
    // ملمس: حبيبات على كل الصورة + مداميك حجر خافتة على الجدران + شجيرات أمام السور
    for (let i = 0; i < data.length; i += 4) { const n = (R() - .5) * 14; data[i] += n; data[i + 1] += n; data[i + 2] += n; }
    for (let y = Math.round(by0); y < by1; y += 9) for (let x = Math.round(bx0); x < bx1; x++) { const i = (y * W + x) * 4; if (data[i] > 150) { data[i] -= 9; data[i + 1] -= 9; data[i + 2] -= 9; } }
    for (let k = 0; k < 7; k++) { const cx = W * (.08 + .13 * k) + dx, cy = gy - 6 + dy, r = 9 + R() * 6; for (let y = -r; y < r; y++) for (let x = -r; x < r; x++) if (x * x + y * y < r * r) px(cx + x | 0, cy + y | 0, [50 + R() * 30, 95 + R() * 30, 45]); }
  }
  if (palms) for (const [cx, top] of [[W * .16, H * .1], [W * .84, H * .2], [W * .52, H * .16]]) { // نخيل عالٍ يعلو خط المبنى (كما يضيف النموذج الحقيقي)
    rect(cx - 4, top, cx + 4, gy, [70, 50, 35]);
    for (let k = 0; k < 14; k++) { const a = Math.PI * (k / 13) * 1.2 - .3, len = 55 + R() * 20; for (let t = 0; t < len; t++) { const x = cx + Math.cos(a) * t * (k % 2 ? 1 : -1), y = top - Math.sin(a) * t * .5 + (t / len) ** 2 * 40; for (let d = -1; d <= 1; d++) px(x | 0, (y + d) | 0, [40 + R() * 20, 80 + R() * 30, 35]); if (t % 4 === 0) for (let d = 0; d < 9; d++) { px(x | 0, (y + d) | 0, [35, 75 + R() * 30, 30]); px((x + 1) | 0, (y + d) | 0, [35, 75, 30]); } } } // سعف بخوص متدلٍّ
  }
  return { data, width: W, height: H };
}
