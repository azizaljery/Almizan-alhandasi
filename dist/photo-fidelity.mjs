// فحص الأمانة: هل حافظت «الصورة المعمارية الاحترافية» على هندسة مجسم العميل؟
// وحدة نقية (بلا DOM): تأخذ بكسلات RGBA لصورتين (لقطة المجسم، وناتج النموذج) وتعيد درجة تطابق بنيوي بين 0 و1.
//
// الطريقة:
//   1) تدرج رمادي ثم تصغير بمتوسط المساحة إلى شبكة عمل 192×128 (يزيل ملمس الحجر والنبات الدقيق ويُبقي الخطوط الإنشائية).
//   2) Sobel: حواف رأسية |gx| وحواف أفقية |gy| منفصلتين، ثم تجميع 2×2 بالقيمة العظمى إلى 96×64، ثم تطبيع بالمئين 97.
//   3) «استرجاع الحواف»: كم من خطوط المجسم القوية (حواف الكتلة والفتحات والسور) موجود في الصورة في موضعه (بسماح خلية واحدة)؟
//      يُحسب للرأسي والأفقي كلٌّ على حدة ويؤخذ الأضعف — الإزاحة الأفقية تُسقط الرأسي، والإزاحة الرأسية تُسقط الأفقي.
//   4) «خط السماء»: لكل عمود أول صف من الأعلى فيه حافة قوية؛ نسبة الأعمدة التي يتفق فيها الخطان (بسماح ~6٪ من الارتفاع).
//      دور زائد أو كتلة مضافة يرفع خط السماء فوق المبنى فيهبط الاتفاق.
//   5) الدرجة = الأضعف بين استرجاع الحواف واتفاق خط السماء.
//
// تنبيه صادق: العتبة والثوابت وُضعت على صور اصطناعية فقط؛ لم تُعايَر بعد على ناتج نموذج حقيقي
// (قد تحتاج رفعًا أو خفضًا بعد أول تجارب حية — scripts/photo-live-check.mjs يطبع المكوّنات للمعايرة).
// الفحص يكشف الانحراف البنيوي الظاهر (إزاحة، دور زائد، كتلة مضافة) ولا يضمن تطابق كل تفصيلة.

export const FIDELITY = Object.freeze({
  workW: 192, workH: 128, gridW: 96, gridH: 64,
  strongRef: 0.45, // حافة «قوية» في المجسم (بعد التطبيع)
  presentOut: 0.22, // حافة «موجودة» في الصورة
  skyEdge: 0.3, // حافة تُنهي السماء
  skyTolerance: 0.06, // سماح خط السماء كنسبة من الارتفاع
  percentile: 0.97,
  threshold: 0.6, // دون هذه الدرجة تُعلَّم الصورة «قد تختلف عن تصميمك» — يُضبط بعد التجربة الحية
});

/** RGBA أو رمادي → رمادي مصغّر بمتوسط المساحة إلى w×h. */
export function toGray(img, w = FIDELITY.workW, h = FIDELITY.workH) {
  const { data, width: W, height: H } = img, ch = data.length === W * H ? 1 : 4, out = new Float32Array(w * h);
  if (!(W > 0 && H > 0) || data.length < W * H * ch) throw new Error('invalid_image');
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * H / h), y1 = Math.max(y0 + 1, Math.floor((y + 1) * H / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * W / w), x1 = Math.max(x0 + 1, Math.floor((x + 1) * W / w));
      let s = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < H; yy++) for (let xx = x0; xx < x1 && xx < W; xx++) {
        const i = (yy * W + xx) * ch; s += ch === 1 ? data[i] : .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]; n++;
      }
      out[y * w + x] = n ? s / n : 0;
    }
  }
  return out;
}

function normalize(a, p) {
  const s = Float32Array.from(a).sort(), ref = s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0, out = new Float32Array(a.length);
  if (ref > 1e-6) for (let i = 0; i < a.length; i++) out[i] = Math.min(1, a[i] / ref);
  return out;
}

/** خريطتا الحواف الرأسية والأفقية على شبكة gridW×gridH (قيم 0..1) وخط السماء لكل عمود. */
export function edgeMaps(img, F = FIDELITY) {
  const w = F.workW, h = F.workH, g = toGray(img, w, h), gw = F.gridW, gh = F.gridH, fx = w / gw, fy = h / gh;
  const V = new Float32Array(gw * gh), Hh = new Float32Array(gw * gh);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = Math.abs(g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1]);
    const gy = Math.abs(g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1]);
    const c = Math.min(gh - 1, Math.floor(y / fy)) * gw + Math.min(gw - 1, Math.floor(x / fx));
    if (gx > V[c]) V[c] = gx; if (gy > Hh[c]) Hh[c] = gy;
  }
  const v = normalize(V, F.percentile), hz = normalize(Hh, F.percentile), sky = new Int16Array(gw);
  for (let x = 0; x < gw; x++) { let y = 0; while (y < gh && Math.max(v[y * gw + x], hz[y * gw + x]) < F.skyEdge) y++; sky[x] = y; }
  return { v, h: hz, sky, gw, gh };
}

function recall(ref, out, gw, gh, F) {
  let sum = 0, hit = 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const a = ref[y * gw + x]; if (a < F.strongRef) continue;
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= gh || xx >= gw) continue;
      const b = out[yy * gw + xx]; if (b > m) m = b;
    }
    sum += a; if (m >= F.presentOut) hit += a;
  }
  return sum > 0 ? hit / sum : 1;
}

/**
 * درجة التطابق البنيوي بين لقطة المجسم (reference) والصورة الناتجة (output).
 * كلاهما { data, width, height } (RGBA أو رمادي)؛ لا يشترط تساوي المقاسين (يُفترض تساوي النسبة تقريبًا).
 * يعيد { score, edges, vertical, horizontal, skyline, ok, threshold }.
 */
export function fidelityScore(reference, output, F = FIDELITY) {
  const A = edgeMaps(reference, F), B = edgeMaps(output, F), { gw, gh } = A;
  const vertical = recall(A.v, B.v, gw, gh, F), horizontal = recall(A.h, B.h, gw, gh, F);
  const tol = Math.max(1, Math.round(F.skyTolerance * gh)); let agree = 0;
  for (let x = 0; x < gw; x++) if (Math.abs(A.sky[x] - B.sky[x]) <= tol) agree++;
  const skyline = agree / gw, edges = Math.min(vertical, horizontal), score = Math.min(edges, skyline);
  const r3 = v => Math.round(v * 1000) / 1000;
  return { score: r3(score), edges: r3(edges), vertical: r3(vertical), horizontal: r3(horizontal), skyline: r3(skyline), ok: score >= F.threshold, threshold: F.threshold };
}
