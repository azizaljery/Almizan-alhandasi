// لوحة العرض: صفحة واحدة للعميل تُبنى من النموذج الهندسي نفسه، بلا أي رقم أو ادعاء من خارجه.
// هذه طبقة عرض فقط؛ لا تعدّل المحرك ولا تحسب شيئًا غير ما في النموذج والكميات.
import { buildPlanSVG, escapeXML } from './plan-view.mjs';
import { DIRECTIONS, quantities } from './planner.mjs';

const INK = '#17332a', DEEP = '#143428', BRASS = '#a8814a', SUB = '#5c6e62', LINE = '#e0d6bf', PAPER = '#fffdf8', IVORY = '#f6f2ea';
const FONT = "'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif", SERIF = "Amiri,'Noto Naskh Arabic','IBM Plex Sans Arabic',serif";
const ORDER = ['majlis', 'living', 'dining', 'kitchen', 'bedroom', 'office', 'bath', 'storage', 'service'];
const TYPE_NOUN = { majlis: ['مجلس', 'مجالس'], living: ['صالة معيشة', 'صالات معيشة'], dining: ['صالة طعام', 'صالات طعام'], kitchen: ['مطبخ', 'مطابخ'], bedroom: ['غرفة نوم', 'غرف نوم'], office: ['مكتب', 'مكاتب'], bath: ['دورة مياه', 'دورات مياه'], storage: ['مستودع', 'مستودعات'], service: ['غرفة خدمة', 'غرف خدمة'] };
const num = (n, d = 1) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
const T = (x, y, text, { size = 22, weight = 400, fill = INK, anchor = 'start', family = FONT, dir = 'rtl', extra = '' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" direction="${dir}" font-family="${family}" ${extra}>${escapeXML(text)}</text>`;

export function boardRows(model) {
  const rooms = [...model.rooms].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  if (rooms.length <= 14) return rooms.map(r => ({ name: r.name, area: r.area }));
  const byType = new Map();
  for (const r of rooms) { const g = byType.get(r.type) || { n: 0, area: 0 }; g.n++; g.area += r.area; byType.set(r.type, g); }
  return [...byType].map(([type, g]) => ({ name: g.n > 1 ? `${g.n} ${TYPE_NOUN[type]?.[1] || type}` : (TYPE_NOUN[type]?.[0] || type), area: g.area }));
}

export function boardFeatures(model) {
  const count = type => model.rooms.filter(r => r.type === type).length;
  const out = [];
  for (const type of ['bedroom', 'majlis', 'bath']) { const n = count(type); if (n) out.push(`${n} ${TYPE_NOUN[type][n > 1 ? 1 : 0]}`); }
  for (const type of ['living', 'dining', 'kitchen']) { const n = count(type); if (n) out.push(n > 1 ? `${n} ${TYPE_NOUN[type][1]}` : TYPE_NOUN[type][0]); }
  const entry = DIRECTIONS[model.plot.entry];
  if (entry) out.push(`مدخل المنزل من الجهة ${entry}`);
  out.push('مسقط للدور الأرضي');
  const w = Array.isArray(model.warnings) ? model.warnings.length : 0;
  if (w) out.push(`${w} ${w > 1 ? 'ملاحظات' : 'ملاحظة'} في المراجعة المبدئية`);
  return out;
}

// طبقة السياق فوق المسقط: حدود الأرض وأبعادها وجهات الشوارع (بإحداثيات المتر نفسها).
function context(model) {
  const W = model.plot.width, L = model.plot.length, st = model.plot.streets || {}, bandW = 2.2, f = .62;
  let s = `<g data-board-context="true" font-family="${FONT}" direction="rtl">`;
  const band = (x, y, w, h, tx, ty, rot) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e9e3d2"/>` + `<text x="${tx}" y="${ty}" font-size="${f}" fill="${SUB}" text-anchor="middle" ${rot ? `transform="rotate(${rot} ${tx} ${ty})"` : ''}>الشارع</text>`;
  if (st.s) s += band(-bandW * 3, 0.25, W + bandW * 6, bandW, W / 2, .25 + bandW / 2 + .22, 0);
  if (st.n) s += band(-bandW * 3, -L - bandW - .25, W + bandW * 6, bandW, W / 2, -L - bandW / 2 - .03, 0);
  if (st.e) s += band(W + .25, -L - bandW * 3, bandW, L + bandW * 6, W + .25 + bandW / 2 + .2, -L / 2, 90);
  if (st.w) s += band(-bandW - .25, -L - bandW * 3, bandW, L + bandW * 6, -bandW / 2 - .05, -L / 2, -90);
  const off = st.n ? -L - bandW - 1.4 : -L - 1.2;
  s += `<g stroke="${BRASS}" stroke-width=".05" fill="none"><path d="M0 ${off}H${W}M0 ${off - .25}V${off + .25}M${W} ${off - .25}V${off + .25}"/></g>`;
  s += `<text x="${W / 2}" y="${off - .3}" font-size="${f}" fill="${DEEP}" font-weight="600" text-anchor="middle" direction="ltr">${num(W)} م</text>`;
  const ox = st.w ? -bandW - 1.5 : -1.5;
  s += `<g stroke="${BRASS}" stroke-width=".05" fill="none"><path d="M${ox} ${-L}V0M${ox - .25} ${-L}H${ox + .25}M${ox - .25} 0H${ox + .25}"/></g>`;
  s += `<text x="${ox - .3}" y="${-L / 2}" font-size="${f}" fill="${DEEP}" font-weight="600" text-anchor="middle" direction="ltr" transform="rotate(-90 ${ox - .3} ${-L / 2})">${num(L)} م</text>`;
  return s + '</g>';
}

function planGroup(model, x, y, w, h) {
  const W = model.plot.width, L = model.plot.length, pad = 5.2;
  const vb = { x: -pad, y: -L - pad, w: W + pad * 2, h: L + pad * 2 };
  let svg = buildPlanSVG(model, { mode: 'color' });
  const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))
    .replace(/<rect class="cad-paper"[^>]*\/>/, '')          // نستبدل الورقة بخلفية اللوحة
    .replace(/ tabindex="0"/g, '').replace(/ role="button"/g, '');
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet" overflow="hidden">${context(model)}${inner}</svg>`;
}

export function buildPresentationBoard(model, { title = 'مشروع سكني', subtitle = '', date = '' } = {}) {
  if (!model?.rooms?.length || !model.plot) throw Error('لا يوجد مخطط صالح لبناء اللوحة.');
  const q = quantities(model), W = model.plot.width, L = model.plot.length;
  const portrait = L > W * 1.25;
  const BW = portrait ? 1300 : 1600, BH = portrait ? 1760 : 1120, M = 44;
  const panelW = portrait ? 360 : 440, planX = M, planW = BW - M * 2 - panelW - 28, planY = 214, planH = BH - planY - 92;
  const px = BW - M - panelW, rows = boardRows(model), feats = boardFeatures(model);
  const featH = 64 + feats.length * 34, tableY = planY, tableH = planH - featH - 22, featY = planY + tableH + 22;
  const base = [
    ['مساحة الأرض', `${num(W * L, 0)} م²`], ['أبعاد الأرض', `${num(W)} × ${num(L)} م`],
    ['مسطح الدور الأرضي', `${num(q.footprint, 0)} م²`],
  ];
  const lines = base.length + rows.length + 1;
  const rowH = Math.max(22, Math.min(46, (tableH - 76) / lines));
  const fs = Math.max(15, Math.min(22, rowH * .58));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BW} ${BH}" width="${BW}" height="${BH}" direction="rtl" data-mizan-board="true">`;
  s += `<rect width="${BW}" height="${BH}" fill="${IVORY}"/><rect x="14" y="14" width="${BW - 28}" height="${BH - 28}" fill="none" stroke="${BRASS}" stroke-width="1.4"/>`;
  // الترويسة
  s += `<rect x="${BW - M - 56}" y="56" width="56" height="3" fill="${BRASS}"/>`;
  s += T(BW - M, 138, title, { size: 64, weight: 700, fill: DEEP, family: SERIF });
  s += T(BW - M, 178, subtitle || `مسقط تصوري للدور الأرضي · أرض ${num(W)} × ${num(L)} م`, { size: 24, fill: SUB });
  s += T(M, 100, 'الميزان الهندسي', { size: 26, weight: 700, fill: DEEP, family: SERIF, anchor: 'start', dir: 'ltr', extra: 'direction="rtl"' });
  s += `<line x1="${M}" y1="${planY - 14}" x2="${BW - M}" y2="${planY - 14}" stroke="${LINE}" stroke-width="1.5"/>`;
  // المسقط
  s += `<rect x="${planX}" y="${planY}" width="${planW}" height="${planH}" rx="18" fill="${PAPER}" stroke="${LINE}" stroke-width="1.5"/>`;
  s += planGroup(model, planX + 8, planY + 8, planW - 16, planH - 16);
  // جدول المساحات
  s += `<rect x="${px}" y="${tableY}" width="${panelW}" height="${tableH}" rx="18" fill="${DEEP}"/>`;
  s += T(px + panelW - 26, tableY + 46, 'المساحات التقريبية', { size: 26, weight: 700, fill: '#ecd9ab', family: SERIF });
  let y = tableY + 82;
  const row = (name, area, strong) => {
    let t = T(px + panelW - 26, y, name, { size: fs, fill: strong ? '#ecd9ab' : '#f3efe2', weight: strong ? 700 : 400 });
    t += T(px + 26, y, area, { size: fs, fill: strong ? '#ecd9ab' : '#f3efe2', weight: strong ? 700 : 500, dir: 'ltr', anchor: 'start' });
    t += `<line x1="${px + 22}" y1="${y + rowH * .32}" x2="${px + panelW - 22}" y2="${y + rowH * .32}" stroke="#ffffff22" stroke-width="1"/>`;
    y += rowH; return t;
  };
  for (const [a, b] of base) s += row(a, b, false);
  s += `<line x1="${px + 22}" y1="${y - rowH * .5}" x2="${px + panelW - 22}" y2="${y - rowH * .5}" stroke="${BRASS}" stroke-width="1.5"/>`;
  for (const r of rows) s += row(r.name, `${num(r.area)} م²`, false);
  s += row('مجموع مساحات الغرف', `${num(q.rooms)} م²`, true);
  // المميزات
  s += `<rect x="${px}" y="${featY}" width="${panelW}" height="${featH}" rx="18" fill="${PAPER}" stroke="${LINE}" stroke-width="1.5"/>`;
  s += T(px + panelW - 26, featY + 44, 'ملخص البرنامج', { size: 26, weight: 700, fill: DEEP, family: SERIF });
  feats.forEach((f, i) => { s += `<circle cx="${px + panelW - 32}" cy="${featY + 82 + i * 34 - 7}" r="4" fill="${BRASS}"/>` + T(px + panelW - 48, featY + 82 + i * 34, f, { size: 20, fill: INK }); });
  // التذييل
  s += `<line x1="${M}" y1="${BH - 76}" x2="${BW - M}" y2="${BH - 76}" stroke="${LINE}" stroke-width="1.5"/>`;
  s += T(BW - M, BH - 40, 'مخطط مبدئي قابل للتعديل والمراجعة؛ ليس اعتمادًا هندسيًا أو نظاميًا ولا مخططًا تنفيذيًا.', { size: 18, fill: SUB });
  if (date) s += T(M, BH - 40, date, { size: 18, fill: SUB, dir: 'ltr', anchor: 'start' });
  return s + '</svg>';
}
