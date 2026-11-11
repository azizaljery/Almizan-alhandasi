// فحص الأمانة: هل حافظت «الصورة المعمارية الاحترافية» على هندسة مجسم العميل؟
// وحدة نقية (بلا DOM): تأخذ بكسلات RGBA لصورتين (لقطة المجسم، وناتج النموذج) وتعيد درجة تطابق بنيوي بين 0 و1.
//
// الطريقة:
//   1) تدرج رمادي ثم تصغير بمتوسط المساحة إلى شبكة عمل 192×128 (يزيل ملمس الحجر والنبات الدقيق ويُبقي الخطوط الإنشائية).
//   2) Sobel: حواف رأسية |gx| وحواف أفقية |gy| منفصلتين، ثم تجميع 2×2 بالقيمة العظمى إلى 96×64، ثم تطبيع بالمئين 97.
//   3) «استرجاع الحواف»: كم من خطوط المجسم القوية (حواف الكتلة والفتحات والسور) موجود في الصورة في موضعه (بسماح خلية واحدة)؟
//      «القوية» = أقوى خطوط المجسم، و«موجود» = حافة واضحة لا ملمس خافت (حتى لا تُحتسب تفاصيل تصميم آخر مطابقةً بالمصادفة).
//      يُحسب للرأسي والأفقي كلٌّ على حدة ويؤخذ الأضعف — الإزاحة الأفقية تُسقط الرأسي، والإزاحة الرأسية تُسقط الأفقي.
//   4) «الكتلة»: (أ) حافة المبنى العليا في المجسم (دروة/سقف/قمة سور) ما زالت في موضعها؟ (ب) هل ظهر في سماء المجسم خط أفقي طويل
//      نظيف (دروة دور زائد أو كتلة مضافة)؟ النخيل والأشجار التي تعلو المبنى لا تُحتسب مخالفة (حوافها متشابكة لا خط أفقي طويل).
//      (النسخة الأولى قارنت «خط السماء» عمودًا بعمود فأسقطت صورًا حيّة سليمة أضاف النموذج فيها نخلة عالية؛ بقي للمعلومة فقط.)
//   5) الدرجة = الأضعف بين استرجاع الحواف ومكوّن الكتلة.
//
// تنبيه صادق: عويرت الثوابت على صور اصطناعية وعلى زوج حيّ واحد فقط (لقطة كلاسيكية بدور واحد وناتج FLUX.2 dev، 2026-11-11: 0.84)؛
// ما زالت تحتاج عيّنات حية أكثر (طرز وزوايا وإضاءات أخرى) — scripts/photo-live-check.mjs يطبع المكوّنات للمعايرة.
// الهامش بين «نخيل كثيف» و«كتلة مضافة صغيرة» ضيق؛ كتلة مضافة أقصر من ~10٪ من عرض الصورة أو مختبئة خلف شجر قد لا تُكشف.
// الفحص يكشف الانحراف البنيوي الظاهر (إزاحة، دور زائد، كتلة مضافة) ولا يضمن تطابق كل تفصيلة.

export const FIDELITY = Object.freeze({
  workW: 192, workH: 128, gridW: 96, gridH: 64,
  // صارمان عمدًا: خطوط المجسم الأقوى يجب أن تظهر قوية في موضعها. بقيمتين متساهلتين (0.45/0.22) كانت واجهة تصميم آخر كثيرة التفاصيل
  // «تسترجع» حواف المجسم بالمصادفة (0.83 مقابل 0.86 للناتج الحي الصحيح)؛ بهاتين القيمتين: الصحيح 0.84 والتصميم الآخر ≤ 0.67.
  strongRef: 0.7, // حافة «قوية» في المجسم (بعد التطبيع)
  presentOut: 0.5, // حافة «موجودة بوضوح» في الصورة
  roofPresent: 0.22, // حافة السقف ما زالت موجودة (أي حافة أفقية في موضعها)
  skyEdge: 0.3, // حافة تُنهي السماء
  skyTolerance: 0.06, // سماح خط السماء كنسبة من الارتفاع
  percentile: 0.97,
  roofMinCols: 0.08, // أقل نسبة أعمدة لها حافة علوية أفقية ليُحسب مكوّن السقف
  addedEdge: 0.25, // حافة أفقية قوية في سماء المجسم
  addedFree: 0.12, addedSpan: 0.15, // خط أفقي جديد حتى 12٪ من العرض مقبول، وعند 27٪ تسقط الدرجة إلى الصفر
  threshold: 0.75, // دون هذه الدرجة تُعلَّم الصورة «قد تختلف عن تصميمك». معايرة 2026-11-11: الناتج الحي الصحيح 0.84، وواجهة تصميم آخر ≤ 0.67
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
 * مكوّن الكتلة (بديل «خط السماء» القديم الذي كان يعاقب نخلة أو شجرة تعلو المبنى في الصورة):
 *   roof  : حافة المبنى العليا في المجسم (حيث ينتهي خط السماء بحافة أفقية قوية: دروة، سقف، قمة سور) — هل بقيت في موضعها في الصورة؟
 *   added : هل ظهر في سماء المجسم خط أفقي طويل متصل (دروة دور زائد أو كتلة مضافة)؟ النخيل والأشجار لا تصنع خطًا أفقيًا طويلًا فلا تُحتسب.
 */
function massing(A, B, F) {
  const { gw, gh } = A, tol = Math.max(1, Math.round(F.skyTolerance * gh));
  let cols = 0, kept = 0;
  for (let x = 0; x < gw; x++) {
    const y = A.sky[x]; if (y >= gh || y < 1) continue;
    const top = Math.max(A.h[y * gw + x], y + 1 < gh ? A.h[(y + 1) * gw + x] : 0);
    if (top < F.skyEdge || top < Math.max(A.v[y * gw + x], y + 1 < gh ? A.v[(y + 1) * gw + x] : 0)) continue; // حافة عليا أفقية (لا شجرة ولا حافة جانبية)
    cols++; let m = 0;
    for (let yy = Math.max(0, y - tol); yy <= Math.min(gh - 1, y + 1 + tol); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(gw - 1, x + 1); xx++) m = Math.max(m, B.h[yy * gw + xx]);
    if (m >= F.roofPresent) kept++;
  }
  const roof = cols >= gw * F.roofMinCols ? kept / cols : 1;
  // أطول خط أفقي متصل (بسماح فجوة خلية وانحراف صف) في سماء المجسم
  let run = 0;
  const lim = x => A.sky[x] - tol - 1; // الصفوف الأعلى من هذا الحد سماء في المجسم
  // حافة «نظيفة» = قمة كتلة: فوقها سماء هادئة، وحولها لا حواف رأسية (سعف النخيل وأغصان الشجر متشابكة الاتجاهات فلا تُحتسب)
  const clean = (y, x) => {
    for (let yy = y - 3; yy <= y - 2; yy++) if (yy >= 0 && Math.max(B.v[yy * gw + x], B.h[yy * gw + x]) >= F.addedEdge) return false;
    for (let yy = y - 1; yy <= y + 2; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) { const v = B.v[yy * gw + xx]; if (v >= F.addedEdge && v >= B.h[yy * gw + xx]) return false; }
    return true;
  };
  for (let y = 1; y < gh; y++) {
    let cur = 0, gap = 0;
    for (let x = 0; x < gw; x++) {
      let on = false;
      if (y <= lim(x)) for (let yy = y - 1; yy <= y + 1 && !on; yy++) if (yy >= 0 && yy <= lim(x) && B.h[yy * gw + x] >= F.addedEdge && B.h[yy * gw + x] > B.v[yy * gw + x] && clean(yy, x)) on = true;
      if (on) { cur += 1 + gap; gap = 0; if (cur > run) run = cur; } else if (cur && gap < 1 && y <= lim(x)) gap++; else { cur = 0; gap = 0; }
    }
  }
  const added = run / gw, penalty = Math.min(1, Math.max(0, (added - F.addedFree) / F.addedSpan));
  return { roof, added, value: roof * (1 - penalty) };
}

/**
 * درجة التطابق البنيوي بين لقطة المجسم (reference) والصورة الناتجة (output).
 * كلاهما { data, width, height } (RGBA أو رمادي)؛ لا يشترط تساوي المقاسين (يُفترض تساوي النسبة تقريبًا).
 * يعيد { score, edges, vertical, horizontal, massing, roof, added, skyline, ok, threshold } — skyline للمعلومة فقط (لا يدخل الدرجة).
 */
export function fidelityScore(reference, output, F = FIDELITY) {
  const A = edgeMaps(reference, F), B = edgeMaps(output, F), { gw, gh } = A;
  const vertical = recall(A.v, B.v, gw, gh, F), horizontal = recall(A.h, B.h, gw, gh, F);
  const tol = Math.max(1, Math.round(F.skyTolerance * gh)); let agree = 0;
  for (let x = 0; x < gw; x++) if (Math.abs(A.sky[x] - B.sky[x]) <= tol) agree++;
  const M = massing(A, B, F), skyline = agree / gw, edges = Math.min(vertical, horizontal), score = Math.min(edges, M.value);
  const r3 = v => Math.round(v * 1000) / 1000;
  return { score: r3(score), edges: r3(edges), vertical: r3(vertical), horizontal: r3(horizontal), massing: r3(M.value), roof: r3(M.roof), added: r3(M.added), skyline: r3(skyline), ok: score >= F.threshold, threshold: F.threshold };
}
