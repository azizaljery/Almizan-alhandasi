// إطار اللوحة وجدول العنوان المشترك للوحات المخرجات الجديدة (الواجهات، القطاع، الجداول، الموقع العام):
// النمط نفسه الذي تستخدمه لوحة المسقط (plan-sheet): لوحة أفقية، إطار مزدوج، شريط أيمن بعرض 62 مم يحمل الهوية
// وعنوان اللوحة وبيانات المشروع ومفتاح الرموز وسهم الشمال والمقياس الخطي والملاحظات. أسود على أبيض. نقي: لا DOM.
import { LINE_MM, SHEETS, STANDARD_SCALES, fmtDim } from './plan-annot.mjs';
import { frameSvg, brandStrip, sheetDefs, inkify } from './sheet-style.mjs';
export { inkify };

export const PX_PER_MM = 4;
export const FONT = `IBM Plex Sans Arabic, Tahoma, Noto Sans Arabic, Arial, sans-serif`; // بلا اقتباس: يدخل خاصية XML فلا يجوز أن يحوي علامات اقتباس
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const n1 = v => (Math.round(v * 10) / 10).toString();
export const mm = v => v * PX_PER_MM;
export const LW = Object.fromEntries(Object.entries(LINE_MM).map(([k, v]) => [k, n1(mm(v))]));
export const fmtLevel = z => (Math.abs(z) < .005 ? '±0.00' : (z > 0 ? '+' : '−') + Math.abs(z).toFixed(2));

/** أكبر مقياس قياسي (أصغر رقم) يُدخل مجموعة رسومات عرضها/ارتفاعها بالمتر في مساحة بالملّيمتر. */
export function fitScale(wM, hM, availWmm, availHmm) {
  for (const s of STANDARD_SCALES) if (wM * 1000 / s <= availWmm && hM * 1000 / s <= availHmm) return s;
  return STANDARD_SCALES[STANDARD_SCALES.length - 1];
}

/** لوحة فارغة بإطارها: يعيد مساعدات الرسم ومناطق اللوحة (F الإطار، R الشريط الأيمن، P منطقة الرسم). */
export function sheetCanvas({ sheet = 'A3', title = '', cls = 'mizan-sheet', attrs = '' } = {}) {
  const size = SHEETS[sheet] ? sheet : 'A3', S = SHEETS[size], W = mm(S.w), H = mm(S.h);
  const M = mm(10), STRIP = mm(62), GAP = mm(3);
  const F = { x0: M, y0: M, x1: W - M, y1: H - M };
  const R = { x0: F.x1 - STRIP, x1: F.x1 };
  const P = { x0: F.x0 + GAP, y0: F.y0 + GAP, x1: R.x0 - GAP, y1: F.y1 - GAP };
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${S.w}mm" height="${S.h}mm" direction="rtl" font-family='${FONT}' class="${cls}" data-sheet="${size}" ${attrs}>`,
    `<title>${esc(title)}</title>`,
    `<defs>${sheetDefs('sf', mm)}</defs>`,
    ...frameSvg({ W, H, F, R, mm, LW })];
  // ltr: للأرقام ذات الإشارة (+3.20، −0.45) حتى لا يقلبها اتجاه اللوحة؛ المرساة تُعطى بمعنى RTL وتُعكس هنا
  const txt = (x, y, s, { size = 10, weight = 400, anchor = 'middle', rotate = 0, fill = '#000', halo = false, cls: c = '', ltr = false } = {}) =>
    `<text x="${n1(x)}" y="${n1(y)}" font-size="${n1(size)}" font-weight="${weight}" fill="${fill}" text-anchor="${ltr ? ({ start: 'end', end: 'start' }[anchor] || anchor) : anchor}"${ltr ? ' direction="ltr"' : ''}${c ? ` class="${c}"` : ''}${halo ? ' stroke="#fff" stroke-width="3" paint-order="stroke"' : ''}${rotate ? ` transform="rotate(${rotate} ${n1(x)} ${n1(y)})"` : ''}>${esc(s)}</text>`;
  const line = (x1, y1, x2, y2, attrs = '') => `<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}" ${attrs}/>`;
  const rect = (x, y, w, h, attrs = '') => `<rect x="${n1(Math.min(x, x + w))}" y="${n1(Math.min(y, y + h))}" width="${n1(Math.abs(w))}" height="${n1(Math.abs(h))}" ${attrs}/>`;
  const stroke = (w = 'thin', extra = '') => `stroke="#000" stroke-width="${LW[w]}"${extra ? ' ' + extra : ''}`;
  return { sheet: size, S, W, H, F, R, P, out, txt, line, rect, stroke, mm, n1, esc, LW };
}

/** جدول العنوان على الشريط الأيمن، بنفس ترتيب لوحة المسقط. */
export function titleStrip(c, o) { return brandStrip({ ...c, mm, LW }, o); }

/** رمز منسوب: مثلث فوق خط أفقي مع النص، x موضع المثلث، y المنسوب بالبكسل. side=1 النص يمين المثلث. */
export function levelMark(c, x, y, label, value, { side = 1, size = mm(2.2), lineTo = null } = {}) {
  const { out, txt } = c, t = mm(1.6);
  if (lineTo !== null) out.push(`<line x1="${n1(Math.min(x, lineTo))}" y1="${n1(y)}" x2="${n1(Math.max(x, lineTo))}" y2="${n1(y)}" stroke="#000" stroke-width="${LW.thin}" stroke-dasharray="${n1(mm(2))} ${n1(mm(1))}"/>`);
  out.push(`<path class="level-mark" d="M${n1(x)} ${n1(y)} L${n1(x - t)} ${n1(y - t * 1.4)} L${n1(x + t)} ${n1(y - t * 1.4)} Z" fill="#000"/>`);
  out.push(`<line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x + side * mm(16))}" y2="${n1(y)}" stroke="#000" stroke-width="${LW.thin}"/>`);
  out.push(txt(x + side * mm(3), y - mm(.9), value, { size, weight: 700, anchor: side > 0 ? 'end' : 'start', ltr: true, cls: 'level-value' }));
  if (label) out.push(txt(x + side * mm(3), y + size + mm(.2), label, { size: size * .85, anchor: side > 0 ? 'end' : 'start', fill: '#333' }));
}

/** خط بُعد أفقي أو رأسي بشرطات مائلة ونص القيمة (بالمتر). */
export function dimLine(c, a, b, at, { vertical = false, text = null, size = mm(2.2), side = -1 } = {}) {
  const { out, txt } = c, tk = mm(1.1), st = `stroke="#000" stroke-width="${LW.thin}"`, stM = `stroke="#000" stroke-width="${LW.medium}"`;
  const v = text ?? fmtDim(Math.abs(b - a) / (c.k || 1));
  if (!vertical) {
    out.push(`<line x1="${n1(a)}" y1="${n1(at)}" x2="${n1(b)}" y2="${n1(at)}" ${st}/>`);
    for (const p of [a, b]) out.push(`<line x1="${n1(p - tk)}" y1="${n1(at + tk)}" x2="${n1(p + tk)}" y2="${n1(at - tk)}" ${stM}/>`, `<line x1="${n1(p)}" y1="${n1(at - mm(1.6))}" x2="${n1(p)}" y2="${n1(at + mm(1.6))}" ${st}/>`);
    out.push(txt((a + b) / 2, at + (side < 0 ? -mm(1) : size + mm(.6)), v, { size }));
  } else {
    out.push(`<line x1="${n1(at)}" y1="${n1(a)}" x2="${n1(at)}" y2="${n1(b)}" ${st}/>`);
    for (const p of [a, b]) out.push(`<line x1="${n1(at - tk)}" y1="${n1(p + tk)}" x2="${n1(at + tk)}" y2="${n1(p - tk)}" ${stM}/>`, `<line x1="${n1(at - mm(1.6))}" y1="${n1(p)}" x2="${n1(at + mm(1.6))}" y2="${n1(p)}" ${st}/>`);
    const x = at + (side < 0 ? -mm(1) : size + mm(.2)); out.push(txt(x, (a + b) / 2, v, { size, rotate: -90 }));
  }
}

export function wrap(text, n) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur); return lines;
}

export default { PX_PER_MM, FONT, esc, n1, mm, LW, fmtLevel, fitScale, sheetCanvas, titleStrip, levelMark, dimLine, wrap };
