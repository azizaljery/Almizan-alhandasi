// لوحات الواجهات المعمارية الأربع (SVG مستقل، نقي): من النموذج الرأسي للمستند — الجدران بارتفاع كل دور، الفتحات
// بجلساتها وأعتابها، الدراوي فوق الأسطح المكشوفة، الأسوار، خط الأرض الطبيعية، مناسيب (±0.00 وأرضية كل دور
// وسطح المبنى وأعلى الدروة) وأبعاد إجمالية أفقية ورأسية. لوحتان A3: (الأمامية + الخلفية) و(اليمنى + اليسرى)
// بمقياس قياسي واحد للواجهات الأربع. الإطار وجدول العنوان كلوحة المسقط.
import { buildingModel, facadeSides, elevationGeometry } from './building-model.mjs';
import { sheetCanvas, titleStrip, levelMark, dimLine, fitScale, fmtLevel, mm, n1, LW } from './sheet-frame.mjs';
import { fmtDim, approxTextWidth } from './plan-annot.mjs';
import { OPENING_KINDS } from './catalog.mjs';

const CELL = { top: 12, bottom: 30, left: 30, right: 44 }; // هوامش كل واجهة داخل خليتها (مم)

/** هندسة الواجهات الأربع (للاختبار والتصدير) بلا رسم. */
export function elevationData(doc, opts = {}) {
  const model = opts.model || buildingModel(doc, opts);
  return { model, elevations: facadeSides(doc).map(f => elevationGeometry(model, f)) };
}

/** مناسيب الواجهة/القطاع: الأرض الطبيعية، أرضية كل دور، سطح المبنى، أعلى الدروة. */
export function levelMarks(model) {
  const marks = [{ z: model.ground, label: 'الأرض الطبيعية (افتراض)', kind: 'ground' }];
  model.levels.forEach((L, i) => marks.push({ z: L.E, label: i === 0 ? 'أرضية ' + L.name + ' · المدخل' : 'أرضية ' + L.name, kind: 'ffl', level: L.id }));
  marks.push({ z: model.roofTop, label: 'منسوب السطح', kind: 'roof' });
  if (model.parapet > 0) marks.push({ z: model.parapetTop, label: 'أعلى الدروة', kind: 'parapet' });
  return marks;
}

/**
 * لوحة واجهتين.
 * @param {object} doc
 * @param {{ roles?: string[], sheet?, scale?, date?, fingerprint?, owner?, office?, sheetNo?, model? }} opts
 * @returns {{ svg: string, meta: object }}
 */
export function elevationSheet(doc, opts = {}) {
  const { model, elevations: all } = elevationData(doc, opts);
  const roles = opts.roles || ['front', 'back'];
  const els = roles.map(r => all.find(e => e.facade.role === r)).filter(Boolean);
  const c = sheetCanvas({ sheet: opts.sheet, title: `${doc.title || ''} — ${els.map(e => e.facade.title).join(' و')}`, cls: 'elevation-sheet' });
  const { out, txt, P } = c;
  const cellH = (P.y1 - P.y0) / els.length / PXMM, cellW = (P.x1 - P.x0) / PXMM;
  // مقياس واحد يُدخل أكبر الواجهات الأربع
  const maxW = Math.max(1, ...all.map(e => e.extent ? e.extent.u1 - e.extent.u0 : 1)), maxH = Math.max(1, ...all.map(e => e.extent ? e.extent.z1 - e.extent.z0 : 1));
  const scale = opts.scale || fitScale(maxW + 2, maxH, cellW - CELL.left - CELL.right, cellH - CELL.top - CELL.bottom);
  const k = mm(1000 / scale); c.k = k;
  const metaEls = [], textBoxes = [];
  els.forEach((E, idx) => {
    const cy0 = P.y0 + idx * cellH * PXMM, cy1 = cy0 + cellH * PXMM;
    if (idx) out.push(c.line(P.x0, cy0, P.x1, cy0, c.stroke('thin', `stroke-dasharray="${n1(mm(3))} ${n1(mm(2))}"`)));
    const meta = drawElevation(c, model, E, { x0: P.x0, x1: P.x1, y0: cy0, y1: cy1, k, scale, textBoxes });
    metaEls.push(meta);
  });
  titleStrip(c, {
    doc, heading: 'واجهات معمارية — ' + els.map(e => e.facade.ar.replace('ال', '')).join(' و'),
    rows: [['الأدوار · الارتفاع الكلي', `${model.levels.length} · ${fmtDim(model.parapetTop - model.ground)} م`]],
    scaleText: `1:${scale}`, scaleK: k, sheetNo: opts.sheetNo || 'A-E1', date: opts.date, fingerprint: opts.fingerprint, owner: opts.owner, office: opts.office,
    legend: [
      [`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#fff" stroke="#000" stroke-width="${LW.thick}"/>`, 'كتلة/جدار خارجي'],
      [`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#dfe5e8" stroke="#000" stroke-width="${LW.medium}"/><line x1="${mm(3.5)}" y1="0" x2="${mm(3.5)}" y2="${mm(3)}" stroke="#000" stroke-width="${LW.thin}"/>`, 'نافذة / زجاج'],
      [`<rect x="${mm(1.5)}" y="0" width="${mm(4)}" height="${mm(3)}" fill="#fff" stroke="#000" stroke-width="${LW.medium}"/><circle cx="${mm(4.6)}" cy="${mm(1.6)}" r="${mm(.3)}" fill="#000"/>`, 'باب'],
      [`<rect x="${mm(1.5)}" y="0" width="${mm(4)}" height="${mm(3)}" fill="#555"/>`, 'فتحة مفتوحة بلا باب'],
      [`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#fff" stroke="#000" stroke-width="${LW.thin}" stroke-dasharray="${n1(mm(1))} ${n1(mm(.6))}"/>`, 'سور'],
      [`<path d="M${mm(3.5)} ${mm(2.6)} L${mm(1.9)} ${mm(.4)} L${mm(5.1)} ${mm(.4)} Z" fill="#000"/>`, 'منسوب بالمتر من ±0.00'],
    ],
    notes: ['±0.00 = منسوب أرضية الدور الأرضي التشطيبية عند المدخل.', `الأرض الطبيعية ${fmtLevel(model.ground)} وسماكة البلاطة ${fmtDim(model.slab)} م افتراضان مطابقان للمجسم ثلاثي الأبعاد.`, 'الواجهة مسقطة عموديًا؛ الأقرب يحجب الأبعد. الفتحات بجلساتها وأعتابها من المستند.', 'المواد والألوان لا تظهر في هذه اللوحة الخطية.'],
  });
  out.push('</svg>');
  return { svg: out.join('\n'), meta: { sheet: c.sheet, scale, elevations: metaEls, textOverlaps: overlapsOf(textBoxes) } };
}
const PXMM = 4;

function drawElevation(c, model, E, box) {
  const { out, txt } = c, { k } = box, ext = E.extent;
  const meta = { role: E.facade.role, side: E.facade.side, title: E.facade.title, faces: E.faces.length, openings: [], hidden: [], marks: [] };
  if (!ext) { out.push(txt((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, 'لا توجد جدران خارجية لهذه الواجهة.', { size: mm(3) })); return meta; }
  const wM = ext.u1 - ext.u0, hM = ext.z1 - ext.z0;
  const ox = box.x0 + mm(CELL.left) + ((box.x1 - box.x0 - mm(CELL.left + CELL.right)) - wM * k) / 2;
  const oy = box.y0 + mm(CELL.top) + ((box.y1 - box.y0 - mm(CELL.top + CELL.bottom)) - hM * k) / 2;
  const X = u => ox + (u - ext.u0) * k, Z = z => oy + (ext.z1 - z) * k;
  const g = [`<g class="elevation" data-role="${E.facade.role}" data-side="${E.facade.side}">`];
  // الأرض الطبيعية: خط ثقيل وتهشير تحته
  const gx0 = X(ext.u0) - mm(8), gx1 = X(ext.u1) + mm(8), gy = Z(model.ground);
  for (let x = gx0; x < gx1; x += mm(2.2)) g.push(`<line x1="${n1(x)}" y1="${n1(gy + mm(2))}" x2="${n1(x + mm(1.6))}" y2="${n1(gy)}" stroke="#000" stroke-width="${LW.thin}"/>`);
  // الوجوه من الأبعد إلى الأقرب
  for (const f of E.faces) {
    const fx0 = X(f.u0), fx1 = X(f.u1), fy0 = Z(f.z1), fy1 = Z(f.z0);
    const attrs = f.kind === 'fence' ? `fill="#fff" stroke="#000" stroke-width="${LW.thin}" stroke-dasharray="${n1(mm(1.2))} ${n1(mm(.6))}"` : `fill="#fff" stroke="#000" stroke-width="${LW.thick}"`;
    g.push(`<g class="face" data-kind="${f.kind}" data-level="${f.level}" data-seg="${f.segId}">`);
    g.push(`<rect x="${n1(fx0)}" y="${n1(fy0)}" width="${n1(fx1 - fx0)}" height="${n1(fy1 - fy0)}" ${attrs}/>`);
    if (f.parapet) g.push(`<rect x="${n1(fx0 - mm(.4))}" y="${n1(fy0 - model.coping * k)}" width="${n1(fx1 - fx0 + mm(.8))}" height="${n1(model.coping * k)}" fill="#000"/>`); // غطاء الدروة
    for (const o of f.openings) { g.push(openingSvg(o, X, Z, k, model)); (o.hidden ? meta.hidden : meta.openings).push(o.id); }
    g.push('</g>');
  }
  // الأرض فوق كل شيء
  g.push(`<line x1="${n1(gx0)}" y1="${n1(gy)}" x2="${n1(gx1)}" y2="${n1(gy)}" stroke="#000" stroke-width="${LW.heavy}"/>`);
  g.push('</g>');
  out.push(...g);
  // المناسيب على يمين الواجهة، مع إزاحة المتقاربة
  const marks = levelMarks(model).filter(m => m.z <= ext.z1 + 1e-6 || m.kind === 'parapet');
  const mx0 = X(ext.u1) + mm(6); let lastY = Infinity, shift = 0;
  for (const m of [...marks].sort((a, b) => a.z - b.z)) {
    const y = Z(m.z); shift = lastY - y < mm(7.5) ? (shift ? 0 : mm(19)) : 0; lastY = y;
    levelMark(c, mx0 + shift, y, m.label, fmtLevel(m.z), { lineTo: X(ext.u1) + mm(1) });
    box.textBoxes.push({ x: mx0 + shift + mm(9), y: y + mm(.5), w: mm(17), h: mm(5.5) });
    meta.marks.push({ kind: m.kind, z: m.z, text: fmtLevel(m.z) });
  }
  // أبعاد رأسية على اليسار: سلسلة المناسيب، ثم الارتفاع الكلي
  const zs = [...new Set(marks.map(m => Math.round(m.z * 1000) / 1000))].sort((a, b) => a - b);
  const vx1 = X(ext.u0) - mm(9), vx2 = X(ext.u0) - mm(19);
  for (let i = 0; i + 1 < zs.length; i++) {
    const a = Z(zs[i]), b = Z(zs[i + 1]), small = Math.abs(a - b) < mm(6);
    dimLine(c, a, b, vx1, { vertical: true, text: fmtDim(zs[i + 1] - zs[i]), size: small ? mm(1.8) : mm(2.1) });
  }
  dimLine(c, Z(zs[0]), Z(zs[zs.length - 1]), vx2, { vertical: true, text: fmtDim(zs[zs.length - 1] - zs[0]) });
  // بُعد أفقي إجمالي لكتلة المبنى (بلا الأسوار) تحت خط الأرض
  const be = E.buildingExtent || ext;
  dimLine(c, X(be.u0), X(be.u1), gy + mm(7), { text: fmtDim(be.u1 - be.u0), side: 1 });
  meta.width = be.u1 - be.u0; meta.height = zs[zs.length - 1] - zs[0];
  // العنوان
  const tx = (X(ext.u0) + X(ext.u1)) / 2, ty = gy + mm(20);
  out.push(txt(tx, ty, E.facade.title, { size: mm(3.6), weight: 700 }), `<line x1="${n1(tx - approxTextWidth(E.facade.title, mm(3.6)) / 2)}" y1="${n1(ty + mm(1.2))}" x2="${n1(tx + approxTextWidth(E.facade.title, mm(3.6)) / 2)}" y2="${n1(ty + mm(1.2))}" stroke="#000" stroke-width="${LW.medium}"/>`,
    txt(tx, ty + mm(5), `المقياس 1:${box.scale} · فتحات هذه الجهة: ${meta.openings.length}`, { size: mm(2.2) }));
  return meta;
}

function openingSvg(o, X, Z, k, model) {
  const x0 = X(o.u0), x1 = X(o.u1), y0 = Z(o.z1), y1 = Z(o.z0), w = x1 - x0, h = y1 - y0;
  const r = (x, y, ww, hh, a) => `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(ww)}" height="${n1(hh)}" ${a}/>`;
  const ln = (a, b, c2, d, sw = LW.thin) => `<line x1="${n1(a)}" y1="${n1(b)}" x2="${n1(c2)}" y2="${n1(d)}" stroke="#000" stroke-width="${sw}"/>`;
  const parts = [`<g class="opening" data-id="${o.id}" data-kind="${o.kind}">`];
  if (o.kind === 'window' || o.kind === 'window2') {
    parts.push(r(x0, y0, w, h, `fill="#dfe5e8" stroke="#000" stroke-width="${LW.medium}"`));
    const n = o.kind === 'window2' ? 3 : (o.u1 - o.u0 > 1.1 ? 2 : 1);
    for (let i = 1; i < n; i++) parts.push(ln(x0 + w * i / n, y0, x0 + w * i / n, y1));
    parts.push(r(x0 - mm(.6), y1, w + mm(1.2), Math.max(mm(.6), .04 * k), 'fill="#000"')); // الجلسة
  } else if (o.kind === 'arch') {
    parts.push(r(x0, y0, w, h, `fill="#555" stroke="#000" stroke-width="${LW.medium}"`));
  } else if (o.kind === 'garage') {
    parts.push(r(x0, y0, w, h, `fill="#fff" stroke="#000" stroke-width="${LW.medium}"`));
    for (let z = o.z0 + .3; z < o.z1 - .05; z += .3) parts.push(ln(x0, Z(z), x1, Z(z)));
  } else if (o.kind === 'slider') {
    parts.push(r(x0, y0, w, h, `fill="#dfe5e8" stroke="#000" stroke-width="${LW.medium}"`), ln(x0 + w / 2, y0, x0 + w / 2, y1, LW.medium));
  } else { // door / door2
    parts.push(r(x0, y0, w, h, `fill="#fff" stroke="#000" stroke-width="${LW.medium}"`));
    const inset = Math.min(mm(1.2), w * .12);
    if (o.kind === 'door2') { parts.push(ln(x0 + w / 2, y0, x0 + w / 2, y1, LW.medium)); for (const xx of [x0 + w / 2 - mm(1), x0 + w / 2 + mm(1)]) parts.push(`<circle cx="${n1(xx)}" cy="${n1(Z(o.z0 + 1.05))}" r="${n1(mm(.35))}" fill="#000"/>`); }
    else { const hx = (o.hinge === 'right') !== o.flip ? x0 + inset * 1.6 : x1 - inset * 1.6; parts.push(`<circle cx="${n1(hx)}" cy="${n1(Z(o.z0 + 1.05))}" r="${n1(mm(.35))}" fill="#000"/>`); }
    parts.push(r(x0 + inset, y0 + inset, w - inset * 2, Math.max(1, (h - inset * 2) * .45), `fill="none" stroke="#000" stroke-width="${LW.thin}"`));
  }
  // درجات أمام الأبواب الأرضية (الأرض الطبيعية أدنى من الأرضية)
  if (o.sill < .01 && o.z0 < .01 && o.z0 > -.01 && o.kind !== 'window' && o.kind !== 'window2' && model.ground < 0) {
    const n = Math.max(1, Math.round(-model.ground / .15)), sx0 = x0 - .3 * k, sw = w + .6 * k;
    for (let i = 0; i < n; i++) { const zt = -i * (-model.ground / n), zb = zt - (-model.ground / n), ins = i * .0; parts.push(r(sx0 - ins, Z(zt), sw + ins * 2, Z(zb) - Z(zt), `fill="#fff" stroke="#000" stroke-width="${LW.thin}" class="step"`)); }
  }
  if (o.entry) parts.push(`<text x="${n1((x0 + x1) / 2)}" y="${n1(y0 - mm(1.2))}" font-size="${n1(mm(2))}" text-anchor="middle" font-weight="700" stroke="#fff" stroke-width="3" paint-order="stroke">المدخل</text>`);
  parts.push('</g>');
  return parts.join('');
}

function overlapsOf(boxes) { let n = 0; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) n++; } return n; }

/** اللوحتان: (الأمامية + الخلفية) ثم (اليمنى + اليسرى) بمقياس موحّد. */
export function elevationSheets(doc, opts = {}) {
  const model = buildingModel(doc, opts);
  return [
    elevationSheet(doc, { ...opts, model, roles: ['front', 'back'], sheetNo: (opts.sheetNoPrefix || 'A-E') + '1' }),
    elevationSheet(doc, { ...opts, model, roles: ['right', 'left'], sheetNo: (opts.sheetNoPrefix || 'A-E') + '2' }),
  ];
}

export const OPENING_AR = Object.fromEntries(Object.entries(OPENING_KINDS).map(([k, v]) => [k, v.ar]));
export default { elevationData, elevationSheet, elevationSheets, levelMarks };
