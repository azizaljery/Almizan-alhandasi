// فحص أمانة الصورة الداخلية: هل بقيت الفتحات (أبواب ونوافذ) والقطع الرئيسية في مواضعها، دون حذف ولا إضافة؟
// وحدة نقية (بلا DOM). المدخل: بكسلات لقطة المجسم الداخلي والصورة الناتجة + معالم اللقطة (camera.mjs: projectLandmarks) التي تعرف أين تقع كل فتحة وقطعة.
//
// الطريقة: خريطتا الحواف نفسهما في photo-fidelity (Sobel رأسي/أفقي على شبكة 96×64). لكل معلم يُؤخذ إطاره (حلقة بعرض خلية على محيط مستطيله؛ وللصغير كل خلاياه):
// حواف المجسم القوية في الإطار يجب أن تظهر في الصورة في موضعها (بسماح خلية). النسبة < 0.55 = «المعلم فُقد أو تحرك». الحذف الصامت لنافذة أو باب
// يُسقط الفحص مهما كانت درجة الحواف العامة. ثوابت الفحص معايَرة على مشاهد اصطناعية فقط؛ لا عيّنة حية داخلية بعد («غير متحقق»).
import { edgeMaps, recall, FIDELITY } from '../photo-fidelity.mjs';

export const INTERIOR_FIDELITY = Object.freeze({
  ...FIDELITY,
  strongRef: .55, presentOut: .38, // حافة قوية في المجسم / موجودة في الصورة (الداخل أقل تباينًا من الواجهة)
  elStrong: .4, elPresent: .3, elMinCells: 3, elKept: .55, // حدود المعلم الواحد
  pieceKept: .7, // أقل نسبة قطع رئيسية محفوظة
  threshold: .7,
});

function band(rect, gw, gh) {
  const x0 = Math.max(0, Math.floor(rect.u0 * gw)), x1 = Math.min(gw - 1, Math.max(x0, Math.ceil(rect.u1 * gw) - 1)), y0 = Math.max(0, Math.floor(rect.v0 * gh)), y1 = Math.min(gh - 1, Math.max(y0, Math.ceil(rect.v1 * gh) - 1));
  const cells = [], small = x1 - x0 < 3 || y1 - y0 < 3;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (small || x === x0 || x === x1 || y === y0 || y === y1 || x === x0 + 1 || x === x1 - 1 || y === y0 + 1 || y === y1 - 1) cells.push([x, y]);
  return cells;
}
function elementRecall(A, B, rect, F) {
  const { gw, gh } = A, cells = band(rect, gw, gh); let n = 0, hit = 0;
  for (const [x, y] of cells) {
    const a = Math.max(A.v[y * gw + x], A.h[y * gw + x]); if (a < F.elStrong) continue; n++;
    let m = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= gh || xx >= gw) continue; m = Math.max(m, B.v[yy * gw + xx], B.h[yy * gw + xx]); }
    if (m >= F.elPresent) hit++;
  }
  return { n, recall: n >= F.elMinCells ? hit / n : null };
}
/**
 * @param reference بكسلات لقطة المجسم {data,width,height}  @param output بكسلات الصورة الناتجة  @param landmarks معالم اللقطة (kind: door|window|piece، u0..v1)
 * يعيد { score, edges, doors:{n,kept}, windows:{n,kept}, pieces:{n,kept}, lost:[{kind,name,recall}], unknown, ok, threshold }.
 */
export function interiorFidelity(reference, output, landmarks = [], F = INTERIOR_FIDELITY) {
  const A = edgeMaps(reference, F), B = edgeMaps(output, F), { gw, gh } = A;
  const edges = Math.min(recall(A.v, B.v, gw, gh, F), recall(A.h, B.h, gw, gh, F));
  const tally = { door: { n: 0, kept: 0 }, window: { n: 0, kept: 0 }, piece: { n: 0, kept: 0 } }, lost = []; let unknown = 0;
  for (const l of landmarks) {
    const r = elementRecall(A, B, l, F); if (r.recall === null) { unknown++; continue; }
    const t = tally[l.kind]; if (!t) continue; t.n++;
    if (r.recall >= F.elKept) t.kept++; else lost.push({ kind: l.kind, name: l.name, recall: Math.round(r.recall * 1000) / 1000 });
  }
  const ratio = t => t.n ? t.kept / t.n : 1, openN = tally.door.n + tally.window.n, openKept = tally.door.kept + tally.window.kept;
  const openings = openN ? openKept / openN : 1, pieces = ratio(tally.piece);
  const r3 = v => Math.round(v * 1000) / 1000, score = Math.min(edges, openings, Math.min(1, pieces / F.pieceKept));
  const openingLost = tally.door.kept < tally.door.n || tally.window.kept < tally.window.n;
  return { score: r3(score), edges: r3(edges), doors: tally.door, windows: tally.window, pieces: tally.piece, lost, unknown, openingLost, ok: score >= F.threshold && !openingLost && pieces >= F.pieceKept, threshold: F.threshold };
}
const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('تعذّر قراءة الصورة')); i.src = src; });
const px = (img, w = 384, h = 256) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h); return x.getImageData(0, 0, w, h); };
/** نسخة المتصفح: تقارن لقطة المجسم الداخلي بالناتج بمعالم اللقطة. */
export async function checkInteriorFidelity(beforeUrl, afterUrl, landmarks) { const [a, b] = await Promise.all([loadImage(beforeUrl), loadImage(afterUrl)]); return interiorFidelity(px(a), px(b), landmarks); }
