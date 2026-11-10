// هوية لوحات المخرجات «العاجي والبرونزي»: ورق عاجي، حبر بنّي داكن بدل الأسود الصرف، وخط برونزي للهوية.
// وحدة نقية (لا DOM): لوحة الألوان، إطار اللوحة، جدول العنوان الموحّد (شعار، بيانات، مفتاح، شمال، مقياس، ختم)،
// تظليل أرضيات الفراغات حسب نوعها، وظل الكتلة. لا تغيّر أي رقم أو نص بيانات: الإخراج فقط.
import { fmtDim } from './plan-annot.mjs';

export const INK = '#2b211b', PAPER = '#fbf8f2', BRONZE = '#a97142', BRONZE_L = '#d4a77c', SOFT = '#6b5c50', HAIR = '#d9cdbb', TINT = '#f4ede4', WARM_GREY = '#8a7b6d';
const WHITE = '#ffffff'; // أبيض حقيقي لا يمسّه inkify (الذي يحوّل ‎#fff‎ القصيرة إلى لون الورق)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = v => (Math.round(v * 10) / 10).toString();

/** تظليل هادئ للأرضية حسب نوع الفراغ (ألوان إخراج لا دلالة هندسية لها). */
export const ROOM_TINT = Object.freeze({
  majlis: '#efe2cc', women_majlis: '#efe2cc', dining: '#f1e8d6', living: '#f3ecdf', hall: '#f3ecdf', family: '#f3ecdf',
  bedroom: '#ebe6dc', master: '#e9e2d6', kitchen: '#e3e8e1', bath: '#dfe7ea', wc: '#dfe7ea', laundry: '#e3e8e1',
  corridor: '#f7f3ea', entrance: '#f5efe2', stair: '#f7f3ea', storage: '#ece8e0', maid: '#ebe6dc', driver: '#ebe6dc',
  office: '#ece6da', courtyard: '#e4ead9', terrace: '#ece9df', garage: '#e9e6e0', dressing: '#ece6da',
});
export const roomTint = type => ROOM_TINT[type] || '#f3eee4';

/** أسود اللوحات القديم يصير حبرًا بنّيًا، والأبيض ورقًا عاجيًا، والرماديات دافئة. يُطبَّق على SVG اللوحة كاملًا. */
export function inkify(svg) {
  return String(svg).replace(/#000(?=["' ;)])/g, INK).replace(/#fff(?=["' ;)])/g, PAPER).replace(/#(?:444|333)(?=["' ;)])/g, SOFT).replace(/#777(?=["' ;)])/g, WARM_GREY);
}

/** تعريفات مشتركة: ظل الكتلة، وتهشير الجدار الداخلي. */
export function sheetDefs(id, mm) {
  return `<filter id="${id}-shadow" x="-10%" y="-10%" width="125%" height="125%"><feGaussianBlur in="SourceAlpha" stdDeviation="${n1(mm(1.1))}"/><feOffset dx="${n1(mm(1.4))}" dy="${n1(mm(1.6))}"/><feComponentTransfer><feFuncA type="linear" slope=".2"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

/** ورق اللوحة وإطارها: حد حبر ثقيل، خط برونزي رفيع داخله، علامات زوايا، وخلفية هادئة للشريط الأيمن. */
export function frameSvg({ W, H, F, R, mm, LW }) {
  const o = [`<rect width="${W}" height="${H}" fill="${PAPER}"/>`,
    `<rect x="${n1(R.x0)}" y="${n1(F.y0)}" width="${n1(F.x1 - R.x0)}" height="${n1(F.y1 - F.y0)}" fill="${TINT}"/>`,
    `<rect x="${F.x0}" y="${F.y0}" width="${F.x1 - F.x0}" height="${F.y1 - F.y0}" fill="none" stroke="${INK}" stroke-width="${LW.heavy}"/>`,
    `<rect x="${F.x0 + mm(1.5)}" y="${F.y0 + mm(1.5)}" width="${F.x1 - F.x0 - mm(3)}" height="${F.y1 - F.y0 - mm(3)}" fill="none" stroke="${BRONZE}" stroke-width="${LW.thin}"/>`,
    `<line x1="${R.x0}" y1="${F.y0}" x2="${R.x0}" y2="${F.y1}" stroke="${INK}" stroke-width="${LW.heavy}"/>`];
  const t = mm(4); // علامات الزوايا خارج الإطار (علامات قص هادئة)
  for (const [x, y, sx, sy] of [[F.x0, F.y0, -1, -1], [F.x1, F.y0, 1, -1], [F.x0, F.y1, -1, 1], [F.x1, F.y1, 1, 1]])
    o.push(`<path d="M${n1(x + sx * mm(2))} ${n1(y)} h${n1(sx * t)} M${n1(x)} ${n1(y + sy * mm(2))} v${n1(sy * t)}" stroke="${BRONZE}" stroke-width="${LW.thin}" fill="none"/>`);
  return o;
}

/** شارة الميزان: مربع مستدير بحد برونزي وحرف «م». */
export function logoMark(x, y, s) {
  return `<g class="mizan-mark"><rect x="${n1(x)}" y="${n1(y)}" width="${n1(s)}" height="${n1(s)}" rx="${n1(s * .22)}" fill="none" stroke="${BRONZE_L}" stroke-width="${n1(s * .06)}"/><text x="${n1(x + s / 2)}" y="${n1(y + s * .7)}" font-size="${n1(s * .62)}" font-weight="700" fill="${BRONZE_L}" text-anchor="middle">م</text></g>`;
}

/** سهم شمال مصمَّم: حلقتان ونصف سهم ممتلئ ونصف مفرغ وحرف «ش». */
export function northArrow(nx, ny, r, deg, LW) {
  return `<g class="north" transform="rotate(${n1(deg || 0)} ${n1(nx)} ${n1(ny)})"><circle cx="${n1(nx)}" cy="${n1(ny)}" r="${n1(r)}" fill="${PAPER}" stroke="${INK}" stroke-width="${LW.medium}"/><circle cx="${n1(nx)}" cy="${n1(ny)}" r="${n1(r * .8)}" fill="none" stroke="${BRONZE}" stroke-width="${LW.thin}"/>`
    + `<path d="M${n1(nx)} ${n1(ny - r * .92)} L${n1(nx + r * .34)} ${n1(ny + r * .5)} L${n1(nx)} ${n1(ny + r * .22)} Z" fill="${INK}"/><path d="M${n1(nx)} ${n1(ny - r * .92)} L${n1(nx - r * .34)} ${n1(ny + r * .5)} L${n1(nx)} ${n1(ny + r * .22)} Z" fill="${PAPER}" stroke="${INK}" stroke-width="${LW.thin}" stroke-linejoin="round"/>`
    + `<text x="${n1(nx)}" y="${n1(ny - r - r * .22)}" font-size="${n1(r * .5)}" font-weight="700" fill="${BRONZE}" text-anchor="middle">ش</text></g>`;
}

/** مقياس خطي بصفين متعاكسين. k = بكسل لكل متر. */
export function scaleBar(x, y, k, maxW, mm, LW, txt) {
  const segs = Math.max(1, Math.min(5, Math.floor(maxW / k))), h = mm(1.1), o = [];
  for (let i = 0; i < segs; i++) {
    o.push(`<rect x="${n1(x + i * k)}" y="${n1(y)}" width="${n1(k)}" height="${n1(h)}" fill="${i % 2 ? PAPER : INK}" stroke="${INK}" stroke-width="${LW.thin}"/>`,
      `<rect x="${n1(x + i * k)}" y="${n1(y + h)}" width="${n1(k)}" height="${n1(h)}" fill="${i % 2 ? INK : PAPER}" stroke="${INK}" stroke-width="${LW.thin}"/>`, txt(x + i * k, y - mm(1), String(i), { size: mm(1.8), fill: SOFT }));
  }
  o.push(txt(x + segs * k, y - mm(1), segs + ' م', { size: mm(1.8), fill: SOFT }));
  return o;
}

function wrap(text, n) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur); return lines;
}

/**
 * جدول العنوان الموحّد على الشريط الأيمن. ترتيب ثابت: ترويسة الهوية، عنوان اللوحة، بيانات المشروع، المفتاح،
 * الشمال والمقياس، الملاحظات، ثم (مثبتة أسفل الشريط) شارة رقم اللوحة وختم «مخطط مبدئي».
 * @param {{ out: string[], txt: Function, F: object, R: object, mm: Function, LW: object, sheet: string }} c
 */
export function brandStrip(c, { doc, heading, rows = [], legend = [], notes = [], north = false, scaleK = null, sheetNo = '', date = '', fingerprint = '', owner = null, office = null, scaleText = '' }) {
  const { out, txt, R, F, mm, LW } = c, sx0 = R.x0, sx1 = R.x1, cx = (sx0 + sx1) / 2, pad = mm(3);
  // ---- ترويسة الهوية: شريط داكن بالشارة والاسم
  const hh = mm(19);
  out.push(`<rect x="${n1(sx0)}" y="${n1(F.y0)}" width="${n1(sx1 - sx0)}" height="${n1(hh)}" fill="${INK}"/>`, `<rect x="${n1(sx0)}" y="${n1(F.y0 + hh)}" width="${n1(sx1 - sx0)}" height="${n1(mm(.7))}" fill="${BRONZE}"/>`,
    logoMark(sx1 - pad - mm(11), F.y0 + mm(4), mm(11)),
    txt(sx1 - pad - mm(14), F.y0 + mm(9.2), 'الميزان الهندسي', { size: mm(4.6), weight: 700, anchor: 'start', fill: PAPER }),
    txt(sx1 - pad - mm(14), F.y0 + mm(14), 'AL MIZAN AL HANDASI · نحو منزلك', { size: mm(1.9), anchor: 'start', fill: BRONZE_L }));
  let y = F.y0 + hh + mm(3.5);
  const hr = (col = HAIR) => out.push(`<line x1="${n1(sx0 + pad)}" y1="${n1(y)}" x2="${n1(sx1 - pad)}" y2="${n1(y)}" stroke="${col}" stroke-width="${LW.thin}"/>`);
  // ---- عنوان اللوحة
  out.push(txt(sx1 - pad, y + mm(1.6), 'عنوان اللوحة', { size: mm(1.8), anchor: 'start', fill: BRONZE, weight: 600 })); y += mm(3.2);
  for (const h of wrap(heading, 24)) { out.push(txt(sx1 - pad, y + mm(4), h, { size: mm(3.7), weight: 700, anchor: 'start', fill: INK })); y += mm(5); }
  y += mm(.6); out.push(`<rect x="${n1(sx1 - pad - mm(14))}" y="${n1(y)}" width="${n1(mm(14))}" height="${n1(mm(.8))}" fill="${BRONZE}"/>`); y += mm(3.2);
  // ---- بيانات المشروع
  const row = (label, value, { big = false } = {}) => {
    out.push(txt(sx1 - pad, y + mm(2.2), label, { size: mm(1.8), anchor: 'start', fill: BRONZE, weight: 600 })); y += mm(2.6);
    out.push(txt(sx1 - pad, y + mm(3.1), value, { size: mm(big ? 3.3 : 2.6), weight: 600, anchor: 'start', fill: INK })); y += mm(big ? 5 : 4.2); hr(); y += mm(.5);
  };
  const plot = doc.plot?.polygon?.length ? (() => { const xs = doc.plot.polygon.map(p => p.x), ys = doc.plot.polygon.map(p => p.y); return `${fmtDim(Math.max(...xs) - Math.min(...xs))} × ${fmtDim(Math.max(...ys) - Math.min(...ys))} م`; })() : 'غير محددة';
  row('المشروع', doc.title || 'مشروع بلا اسم', { big: true });
  row('المالك', owner || 'غير مُدخل');
  row('الأرض', plot);
  for (const [l, v] of rows) row(l, v);
  if (scaleText) row('المقياس عند الطباعة على ' + c.sheet, scaleText);
  row('رقم اللوحة · التاريخ', `${sheetNo || '—'} · ${date || ''}`);
  row('بصمة الهندسة', fingerprint || '—');
  row('إعداد', office || 'الميزان الهندسي — تصميم أولي');
  y += mm(1.5);
  const sectionHead = t => { out.push(`<rect x="${n1(sx1 - pad - mm(1.6))}" y="${n1(y + mm(.9))}" width="${n1(mm(1.6))}" height="${n1(mm(1.6))}" fill="${BRONZE}"/>`, txt(sx1 - pad - mm(3), y + mm(2.6), t, { size: mm(2.5), weight: 700, anchor: 'start', fill: INK })); y += mm(5); };
  // ---- مفتاح الرموز
  if (legend.length) {
    sectionHead('مفتاح الرموز');
    for (const [sym, label] of legend) { out.push(`<g transform="translate(${n1(sx1 - pad - mm(7.5))} ${n1(y)})">${sym}</g>`, txt(sx1 - pad - mm(10), y + mm(2.6), label, { size: mm(1.95), anchor: 'start', fill: INK })); y += mm(4.4); }
    y += mm(1.5);
  }
  // ---- الشمال والمقياس الخطي
  if (north || scaleK) {
    hr(); y += mm(2);
    if (north) out.push(northArrow(sx1 - pad - mm(6.5), y + mm(9.5), mm(6), doc.north || 0, LW));
    if (scaleK) out.push(...scaleBar(sx0 + pad, y + mm(9), scaleK, sx1 - mm(north ? 22 : 6) - (sx0 + pad), mm, LW, txt), txt(sx0 + pad, y + mm(15.5), 'مقياس خطي بالمتر', { size: mm(1.7), anchor: 'end', fill: SOFT }));
    y += mm(19);
  }
  // ---- أسفل الشريط (مثبت): شارة رقم اللوحة وختم المخطط المبدئي
  const by = F.y1 - mm(24);
  out.push(`<rect x="${n1(sx0)}" y="${n1(by)}" width="${n1(sx1 - sx0)}" height="${n1(F.y1 - by)}" fill="${PAPER}"/>`, `<line x1="${n1(sx0)}" y1="${n1(by)}" x2="${n1(sx1)}" y2="${n1(by)}" stroke="${INK}" stroke-width="${LW.medium}"/>`,
    `<rect x="${n1(sx1 - pad - mm(24))}" y="${n1(by + mm(3))}" width="${n1(mm(24))}" height="${n1(mm(18))}" rx="${n1(mm(1.2))}" fill="${INK}"/>`,
    txt(sx1 - pad - mm(12), by + mm(7.4), 'لوحة', { size: mm(1.9), fill: BRONZE_L }),
    `<text x="${n1(sx1 - pad - mm(12))}" y="${n1(by + mm(16))}" font-size="${n1(mm(6.2))}" font-weight="700" fill="${PAPER}" text-anchor="middle" direction="ltr" class="sheet-no">${esc(sheetNo || '—')}</text>`,
    `<rect x="${n1(sx0 + pad)}" y="${n1(by + mm(3))}" width="${n1(sx1 - sx0 - pad * 3 - mm(24))}" height="${n1(mm(18))}" rx="${n1(mm(1.2))}" fill="none" stroke="${BRONZE}" stroke-width="${LW.medium}" stroke-dasharray="${n1(mm(1.6))} ${n1(mm(.8))}"/>`);
  const stx = sx0 + pad + (sx1 - sx0 - pad * 3 - mm(24)) / 2;
  out.push(txt(stx, by + mm(9.6), 'مخطط مبدئي', { size: mm(3.2), weight: 700, fill: BRONZE }), txt(stx, by + mm(14), 'ليس للترخيص أو التنفيذ', { size: mm(2.1), fill: BRONZE }), txt(stx, by + mm(18.2), date || '', { size: mm(1.8), fill: SOFT }));
  // ---- الملاحظات (ما اتسع فوق الشارة)
  const all = [...notes, 'مخطط أولي للتصميم والتسعير؛ ليس مخططًا معتمدًا للترخيص أو التنفيذ.'];
  if (y < by - mm(8)) { hr(); y += mm(1.5); sectionHead('ملاحظات'); }
  for (const n of all) for (const w of wrap('• ' + n, 36)) { if (y > by - mm(3.4)) break; out.push(txt(sx1 - pad, y + mm(2.6), w, { size: mm(1.85), anchor: 'start', fill: SOFT })); y += mm(3); }
  return y;
}

export default { INK, PAPER, BRONZE, BRONZE_L, SOFT, HAIR, TINT, WARM_GREY, ROOM_TINT, roomTint, inkify, sheetDefs, frameSvg, logoMark, northArrow, scaleBar, brandStrip };
