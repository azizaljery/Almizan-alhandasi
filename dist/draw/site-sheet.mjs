// لوحة الموقع العام (SVG مستقل، نقي): حدود الأرض بأطوال أضلاعها، الشوارع على جهاتها، أثر المبنى (جدران الدور الأرضي
// والفراغات المسقوفة) ومحيط الأدوار العليا، خطوط الارتداد المُدخلة، الارتدادات الفعلية مقيسة من المبنى إلى كل حد،
// المداخل (من الشارع وباب المبنى)، الأسوار، سهم الشمال، ومساحات الأرض والأثر ونسبة التغطية (معلومة لا حكم نظامي).
import { buildingModel, SIDE_VECTORS } from './building-model.mjs';
import { sheetCanvas, titleStrip, fitScale, fmtLevel, mm, n1, LW, inkify } from './sheet-frame.mjs';
import { fmtDim, fixtureSymbol } from './plan-annot.mjs';
import { FIXTURES, fixtureName } from './catalog.mjs';
import { add, sub, mul, dot, norm, area, ccw, insetPolygon, dist } from './geom.mjs';
import { compassOf } from './digest.mjs';

const GARDEN_FILL = { pool: '#cfe3ea', waterfall: '#cfe3ea', fountain: '#cfe3ea', lawn: '#dfe8cf', planter: '#d3e0c0' };
const iso = v => '\u2066' + v + '\u2069'; // عزل اتجاه الأرقام ذات الإشارة داخل النص العربي
const sideOfNormal = n => Object.entries(SIDE_VECTORS).sort((a, b) => dot(b[1], n) - dot(a[1], n))[0][0];
const DOC_SIDE_AR = { n: 'الشمالية', s: 'الجنوبية', e: 'الشرقية', w: 'الغربية' };

/** نموذج الموقع: الأضلاع وجهاتها، الارتدادات الفعلية والمُدخلة، المداخل، والمساحات. */
export function siteModel(doc, opts = {}) {
  const model = opts.model || buildingModel(doc, opts);
  const plot = doc.plot?.polygon?.length >= 3 ? ccw(doc.plot.polygon) : null;
  const L1 = model.levels[0];
  const walls = model.levels.flatMap(L => L.solids.segments.filter(s => !s.fence).map(s => ({ level: L.id, poly: s.quad })));
  const fences = model.levels.flatMap(L => L.solids.segments.filter(s => s.fence).map(s => ({ level: L.id, poly: s.quad })));
  const pts = walls.flatMap(w => w.poly);
  const edges = plot ? plot.map((a, i) => {
    const b = plot[(i + 1) % plot.length], u = norm(sub(b, a)), out = { x: u.y, y: -u.x }; // CCW: الخارج يمين الضلع
    const side = sideOfNormal(out), required = doc.plot?.setbacks?.[side] ?? null;
    // الارتداد الفعلي: أقرب نقطة من جدران المبنى (كل الأدوار) إلى خط الضلع
    let best = null; for (const p of pts) { const v = dot(sub(a, p), out); if (!best || v < best.v) best = { v, p }; } // v = بُعد النقطة داخل الضلع
    const actual = best ? Math.max(0, -dot(sub(best.p, a), out)) : null;
    const foot = best ? sub(best.p, mul(out, dot(sub(best.p, a), out))) : null;
    return { i, a, b, length: dist(a, b), out, side, sideAr: DOC_SIDE_AR[side], compass: compassOf(out, doc.north || 0), street: (doc.streets || []).includes(side), entry: (doc.entries || (doc.entry ? [doc.entry] : [])).includes(side), required, actual, near: best?.p || null, foot };
  }) : [];
  const roofedArea = L1.spaces.filter(s => !s.open).reduce((s, sp) => s + sp.area, 0);
  const outline = L1.analysis.outlines.reduce((s, o) => s + o.area, 0), openArea = L1.spaces.filter(s => s.open).reduce((s, sp) => s + sp.area, 0);
  const footprint = Math.max(0, outline - openArea);
  const plotArea = plot ? area(plot) : null;
  const entries = doc.openings.filter(o => o.entry).map(o => { const w = doc.walls.find(x => x.id === o.wall); if (!w) return null; const u = norm(sub(w.b, w.a)); return { id: o.id, level: o.level, p: add(w.a, mul(u, o.at)) }; }).filter(Boolean);
  return { model, plot, edges, walls, fences, entries, areas: { plot: plotArea, footprint, roofedL1: roofedArea, coverage: plotArea ? footprint / plotArea : null }, streetWidth: doc.plot?.streetWidth ?? doc.streetWidth ?? null };
}

/**
 * @param {object} doc
 * @param {{ sheet?, scale?, date?, fingerprint?, owner?, office?, sheetNo? }} opts
 */
export function siteSheet(doc, opts = {}) {
  const S = siteModel(doc, opts), model = S.model;
  const c = sheetCanvas({ sheet: opts.sheet, title: `${doc.title || ''} — مخطط الموقع العام`, cls: 'site-sheet' });
  const { out, txt, P } = c;
  const STREET = 6; // عرض الرسم التخطيطي للشارع حين لا يُدخل عرضه (لا يُكتب عليه بُعد)
  const sw = S.streetWidth || STREET;
  const all = [...(S.plot || []), ...S.walls.flatMap(w => w.poly)];
  const bx = all.map(p => p.x), by = all.map(p => p.y);
  let x0 = Math.min(...bx), x1 = Math.max(...bx), y0 = Math.min(...by), y1 = Math.max(...by);
  for (const e of S.edges.filter(e => e.street)) { const q = [add(e.a, mul(e.out, sw)), add(e.b, mul(e.out, sw))]; for (const p of q) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } }
  const marg = 18; // مم للأبعاد حول الأرض
  const scale = opts.scale || fitScale(x1 - x0, y1 - y0, (P.x1 - P.x0) / 4 - marg * 2, (P.y1 - P.y0) / 4 - marg * 2);
  const k = mm(1000 / scale); c.k = k;
  const ox = P.x0 + ((P.x1 - P.x0) - (x1 - x0) * k) / 2, oy = P.y0 + ((P.y1 - P.y0) - (y1 - y0) * k) / 2;
  const X = x => ox + (x - x0) * k, Y = y => oy + (y1 - y) * k, pt = p => n1(X(p.x)) + ',' + n1(Y(p.y));
  const poly = (ps, attrs) => `<polygon points="${ps.map(pt).join(' ')}" ${attrs}/>`;
  const meta = { scale, edges: S.edges.map(e => ({ side: e.side, length: e.length, street: e.street, entry: e.entry, required: e.required, actual: e.actual })), areas: S.areas, entries: S.entries.length, streets: S.edges.filter(e => e.street).length };
  const g = ['<g class="site">'];
  // الشوارع
  for (const e of S.edges.filter(e => e.street)) {
    const q = [e.a, e.b, add(e.b, mul(e.out, sw)), add(e.a, mul(e.out, sw))];
    g.push(poly(q, `fill="#e9e3d8" stroke="none" class="street" data-side="${e.side}"`), `<line x1="${n1(X(q[3].x))}" y1="${n1(Y(q[3].y))}" x2="${n1(X(q[2].x))}" y2="${n1(Y(q[2].y))}" stroke="#000" stroke-width="${LW.thin}"/>`);
    // موضع اسم الشارع: أبعد نقطة على الضلع عن أسهم المداخل
    const ens = S.entries.map(x => x.p), tBest = [.5, .3, .7, .2, .8].map(t => ({ t, d: Math.min(99, ...ens.map(p => dist(p, add(e.a, mul(sub(e.b, e.a), t))))) })).sort((p, q) => q.d - p.d || Math.abs(p.t - .5) - Math.abs(q.t - .5))[0].t;
    const u = norm(sub(e.b, e.a)); let deg = Math.atan2(-u.y, u.x) * 180 / Math.PI; if (deg > 90 || deg < -90) deg += 180;
    const mid = add(add(e.a, mul(sub(e.b, e.a), tBest)), mul(e.out, sw * .5)), m = mid;
    g.push(`<line x1="${n1(X(add(e.a, mul(e.out, sw / 2)).x))}" y1="${n1(Y(add(e.a, mul(e.out, sw / 2)).y))}" x2="${n1(X(add(e.b, mul(e.out, sw / 2)).x))}" y2="${n1(Y(add(e.b, mul(e.out, sw / 2)).y))}" stroke="#000" stroke-width="${LW.thin}" stroke-dasharray="${n1(mm(4))} ${n1(mm(3))}"/>`);
    g.push(txt(X(mid.x), Y(mid.y) - mm(1.2), `شارع — الجهة ${e.sideAr}`, { size: mm(3), weight: 700, rotate: deg, halo: true }), txt(X(m.x), Y(m.y) + mm(3.2), S.streetWidth ? `عرض الشارع ${fmtDim(S.streetWidth)} م` : 'عرض الشارع غير مُدخل (الرسم تخطيطي)', { size: mm(2.1), rotate: deg, halo: true }));
  }
  // أرض الموقع: تظليل رملي هادئ تحت كل شيء
  if (S.plot) g.push(poly(S.plot, `fill="#f6f0e3" stroke="none" class="plot-ground"`));
  // حدود الأرض
  if (S.plot) g.push(poly(S.plot, `fill="none" stroke="#000" stroke-width="${LW.heavy}" stroke-dasharray="${n1(mm(6))} ${n1(mm(1.2))} ${n1(mm(1))} ${n1(mm(1.2))}" class="plot"`));
  // خط الارتداد المُدخل
  const sb = doc.plot?.setbacks; let setLine = null;
  if (S.plot && sb) { setLine = insetPolygon(S.plot, S.edges.map(e => e.required ?? 0)); if (setLine) g.push(poly(setLine, `fill="none" stroke="#000" stroke-width="${LW.thin}" stroke-dasharray="${n1(mm(1.5))} ${n1(mm(1))}" class="setback-line"`)); }
  // الأدوار العليا: محيط متقطع
  for (const L of model.levels.slice(1)) for (const o of L.analysis.outlines) g.push(poly(o.polygon, `fill="none" stroke="#000" stroke-width="${LW.medium}" stroke-dasharray="${n1(mm(2))} ${n1(mm(1))}" class="upper-outline" data-level="${L.id}"`));
  // الدور الأرضي: فراغات مسقوفة رمادية، المكشوفة بيضاء، الجدران سوداء، الأسوار بخط مزدوج
  const L1 = model.levels[0];
  for (const o of L1.analysis.outlines) g.push(poly(o.polygon, `fill="#e6d8c2" stroke="#000" stroke-width="${LW.heavy}" class="footprint" filter="url(#sf-shadow)"`));
  for (const sp of L1.spaces.filter(s => s.open)) g.push(poly(sp.net, `fill="#fff" stroke="#000" stroke-width="${LW.medium}" class="open-space"`));
  // الحديقة: مسبح، شلال، عشب، أحواض (قطع خارجية في المستند)
  const garden = (doc.fixtures || []).filter(f => FIXTURES[f.kind]?.outdoor && f.kind !== 'tree');
  for (const f of garden) {
    const sym = fixtureSymbol(f), fill = GARDEN_FILL[f.kind] || '#efe7da'; // ألوان إخراج هادئة: ماء، عشب، زراعة، منشآت خفيفة
    g.push(`<g class="garden-item" data-kind="${f.kind}" data-id="${f.id}">`, sym.outline ? poly(sym.outline, `fill="${fill}" stroke="#000" stroke-width="${LW.medium}"`) : '');
    for (const r of sym.rects) g.push(poly(r, `fill="none" stroke="#000" stroke-width="${LW.thin}"`));
    for (const [a, b] of sym.lines) g.push(`<line x1="${n1(X(a.x))}" y1="${n1(Y(a.y))}" x2="${n1(X(b.x))}" y2="${n1(Y(b.y))}" stroke="#000" stroke-width="${LW.thin}"${f.kind === 'pool' ? ` stroke-dasharray="${n1(mm(1.2))} ${n1(mm(.8))}"` : ''}/>`);
    for (const e of sym.ellipses) g.push(`<ellipse cx="${n1(X(e.c.x))}" cy="${n1(Y(e.c.y))}" rx="${n1(e.rx * k)}" ry="${n1(e.ry * k)}" fill="none" stroke="#000" stroke-width="${LW.thin}"/>`);
    g.push('</g>');
    if (f.kind !== 'planter') g.push(txt(X(f.x), Y(f.y), `${fixtureName(f.kind)} ${fmtDim(Math.min(f.w, f.d))}×${fmtDim(Math.max(f.w, f.d))}`, { size: mm(2.2), halo: true }));
  }
  for (const f of S.fences) g.push(poly(f.poly, `fill="#fff" stroke="#000" stroke-width="${LW.medium}" class="fence"`));
  for (const sp of L1.spaces.filter(s => s.open && s.area > 6)) g.push(txt(X(sp.inside.x), Y(sp.inside.y), sp.name, { size: mm(2.4), halo: true }));
  g.push('</g>');
  out.push(...g);
  // المبنى: الاسم والمنسوب
  const ground = S.walls.filter(w => w.level === L1.id).flatMap(w => w.poly);
  if (ground.length) {
    const gx = ground.map(p => p.x), gy = ground.map(p => p.y), roofed = L1.spaces.filter(s => !s.open).sort((a, b) => b.area - a.area)[0];
    const cxy = roofed ? roofed.inside : { x: (Math.min(...gx) + Math.max(...gx)) / 2, y: (Math.min(...gy) + Math.max(...gy)) / 2 };
    out.push(txt(X(cxy.x), Y(cxy.y) - mm(1), `المبنى — ${model.levels.length === 1 ? 'دور واحد' : model.levels.length === 2 ? 'دوران' : model.levels.length + ' أدوار'}`, { size: mm(3), weight: 700, halo: true }), txt(X(cxy.x), Y(cxy.y) + mm(3.4), `أرضية الدور الأرضي ${iso('±0.00')} · السطح ${iso(fmtLevel(model.roofTop))}`, { size: mm(2.1), halo: true }));
  }
  // أطوال أضلاع الأرض
  for (const e of S.edges) {
    const off = e.street ? sw + 2.2 : 2.2, a = add(e.a, mul(e.out, off)), b = add(e.b, mul(e.out, off)), u = norm(sub(e.b, e.a));
    out.push(`<line x1="${n1(X(a.x))}" y1="${n1(Y(a.y))}" x2="${n1(X(b.x))}" y2="${n1(Y(b.y))}" stroke="#000" stroke-width="${LW.thin}"/>`);
    for (const p of [a, b]) { const q0 = add(p, mul(add(u, e.out), .25)), q1 = sub(p, mul(add(u, e.out), .25)); out.push(`<line x1="${n1(X(q0.x))}" y1="${n1(Y(q0.y))}" x2="${n1(X(q1.x))}" y2="${n1(Y(q1.y))}" stroke="#000" stroke-width="${LW.medium}"/>`); }
    const m = add(add(a, mul(sub(b, a), .5)), mul(e.out, .5)); let deg = Math.atan2(-u.y, u.x) * 180 / Math.PI; if (deg > 90 || deg < -90) deg += 180;
    out.push(txt(X(m.x), Y(m.y) + mm(.8), `${fmtDim(e.length)} م`, { size: mm(2.4), weight: 700, rotate: deg, cls: 'plot-dim' }));
  }
  // الارتدادات الفعلية: بُعد من الحد إلى أقرب نقطة في المبنى
  for (const e of S.edges) {
    if (!e.near || e.actual === null) continue;
    const a = e.foot, b = e.near, ang = Math.atan2(Y(b.y) - Y(a.y), X(b.x) - X(a.x));
    out.push(`<g class="setback" data-side="${e.side}"><line x1="${n1(X(a.x))}" y1="${n1(Y(a.y))}" x2="${n1(X(b.x))}" y2="${n1(Y(b.y))}" stroke="#000" stroke-width="${LW.thin}"/>`);
    for (const [p, s2] of [[a, 1], [b, -1]]) { const px = X(p.x), py = Y(p.y); out.push(`<path d="M${n1(px)} ${n1(py)} L${n1(px + s2 * mm(1.6) * Math.cos(ang - .35))} ${n1(py + s2 * mm(1.6) * Math.sin(ang - .35))} L${n1(px + s2 * mm(1.6) * Math.cos(ang + .35))} ${n1(py + s2 * mm(1.6) * Math.sin(ang + .35))} Z" fill="#000"/>`); }
    // النص موازٍ للضلع بجانب خط البُعد (سطر فوقه للقيمة الفعلية وسطر تحته للمُدخل)
    const m = add(a, mul(sub(b, a), .5)), u = norm(sub(e.b, e.a)); let deg = Math.atan2(-u.y, u.x) * 180 / Math.PI; if (deg > 90 || deg < -90) deg += 180;
    const rad = deg * Math.PI / 180, nx = Math.sin(rad), ny = -Math.cos(rad); // عمودي على اتجاه النص على الشاشة (نحو أعلاه)
    const t1 = `ارتداد ${fmtDim(e.actual)} م`, t2 = e.required !== null ? `المُدخل ${fmtDim(e.required)} م` : '';
    const mx = X(m.x), my = Y(m.y), along = { x: Math.cos(rad), y: Math.sin(rad) }, shift = mm(1.2) + Math.max(t1.length, t2.length) * mm(2.2) * .55 / 2;
    let cx = mx + along.x * shift, cy = my + along.y * shift;
    if (e.actual * k < mm(9)) { const o = add(e.foot, mul(e.out, 1.1)); cx = X(o.x); cy = Y(o.y); } // فجوة ضيقة: النص خارج حد الأرض
    out.push(txt(cx + nx * mm(.8), cy + ny * mm(.8), t1, { size: mm(2.2), weight: 700, rotate: deg, halo: true }));
    if (t2) out.push(txt(cx - nx * mm(2.6), cy - ny * mm(2.6), t2, { size: mm(1.9), rotate: deg, halo: true }));
    out.push('</g>');
  }
  // المداخل: سهم من الشارع نحو باب المدخل
  for (const en of S.entries.filter(x => x.level === L1.id)) {
    const e = S.edges.filter(e => e.entry || e.street).sort((p, q) => Math.abs(dot(sub(en.p, p.a), p.out)) - Math.abs(dot(sub(en.p, q.a), q.out)))[0];
    if (!e) continue;
    const onEdge = sub(en.p, mul(e.out, dot(sub(en.p, e.a), e.out))), from = add(onEdge, mul(e.out, Math.min(sw * .8, 3.5))), to = add(en.p, mul(e.out, .6));
    const fx = X(from.x), fy = Y(from.y), tx = X(to.x), ty = Y(to.y), ang = Math.atan2(ty - fy, tx - fx);
    out.push(`<g class="entry-arrow"><line x1="${n1(fx)}" y1="${n1(fy)}" x2="${n1(tx)}" y2="${n1(ty)}" stroke="#000" stroke-width="${LW.thick}"/><path d="M${n1(tx)} ${n1(ty)} L${n1(tx - mm(2.4) * Math.cos(ang - .4))} ${n1(ty - mm(2.4) * Math.sin(ang - .4))} L${n1(tx - mm(2.4) * Math.cos(ang + .4))} ${n1(ty - mm(2.4) * Math.sin(ang + .4))} Z" fill="#000"/></g>`,
      txt(fx, fy + (e.out.y < 0 ? mm(3.5) : -mm(1.5)), 'مدخل', { size: mm(2.4), weight: 700, halo: true }));
  }
  const pct = v => (v === null ? '—' : (v * 100).toFixed(1) + '%');
  titleStrip(c, {
    doc, heading: 'مخطط الموقع العام', scaleText: `1:${scale}`, scaleK: k, north: true, sheetNo: opts.sheetNo || 'A-00', date: opts.date, fingerprint: opts.fingerprint, owner: opts.owner, office: opts.office,
    rows: [['مساحة الأرض · أثر المبنى', `${S.areas.plot === null ? '—' : fmtDim(S.areas.plot)} م² · ${fmtDim(S.areas.footprint)} م²`], ['نسبة التغطية (معلومة)', pct(S.areas.coverage)], ['الشوارع · المداخل', `${S.edges.filter(e => e.street).map(e => e.sideAr).join('، ') || 'غير محددة'} · ${S.edges.filter(e => e.entry).map(e => e.sideAr).join('، ') || '—'}`]],
    legend: [
      [`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="none" stroke="#000" stroke-width="${LW.heavy}" stroke-dasharray="${n1(mm(3))} ${n1(mm(.8))}"/>`, 'حد الأرض'],
      [`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#e6d8c2" stroke="#000" stroke-width="${LW.thick}"/>`, 'أثر الدور الأرضي (مسقوف)'],
      [`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="none" stroke="#000" stroke-width="${LW.medium}" stroke-dasharray="${n1(mm(1.2))} ${n1(mm(.6))}"/>`, 'محيط الدور العلوي'],
      [`<line x1="0" y1="${mm(1.5)}" x2="${mm(7)}" y2="${mm(1.5)}" stroke="#000" stroke-width="${LW.thin}" stroke-dasharray="${n1(mm(1.5))} ${n1(mm(1))}"/>`, 'خط الارتداد المُدخل'],
      [`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#e9e3d8"/>`, 'شارع'],
      ...(garden.length ? [[`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#cfe3ea" stroke="#000" stroke-width="${LW.medium}"/>`, 'مسبح / شلال / عشب / أحواض زراعة']] : []),
      [`<line x1="0" y1="${mm(1.5)}" x2="${mm(5)}" y2="${mm(1.5)}" stroke="#000" stroke-width="${LW.thick}"/><path d="M${mm(7)} ${mm(1.5)} L${mm(5)} ${mm(.5)} L${mm(5)} ${mm(2.5)} Z" fill="#000"/>`, 'مدخل'],
    ],
    notes: ['الارتداد الفعلي مقيس من أقرب جدار في أي دور إلى حد الأرض.', 'الارتداد «المُدخل» هو ما أُدخل في المشروع، لا تحقق نظامي؛ اشتراطات البلدية تُراجع من مصدرها.', S.streetWidth ? 'عرض الشارع من المستند.' : 'عرض الشارع غير مُدخل؛ رسمه تخطيطي بلا بُعد.'],
  });
  out.push('</svg>');
  return { svg: inkify(out.join('\n')), meta };
}

export default { siteModel, siteSheet };
