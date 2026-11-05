// لوحة المسقط المعماري للطباعة (SVG مستقل، نقي: لا DOM). لوحة أفقية A3/A1 بإطار وجدول عنوان على الشريط الأيمن،
// مسقط بمقياس قياسي، جدران خارجية مصمتة وداخلية مهشّرة، أعمدة، أبواب بأقواس ونوافذ بخط مزدوج، أثاث بخط رفيع،
// تسميات بالمساحة مرتّبة بلا تراكب، سلاسل أبعاد ثلاثية المستويات، محاور، سهم شمال، مقياس خطي، ومفتاح رموز.
// أسود على أبيض؛ سماكات الأقلام 0.18/0.35/0.5/0.7 مم بنسب ثابتة. المرجع: ممارسة مهنية عامة.
import { wallRect } from './review.mjs';
import { swingSectors } from './review.mjs';
import { analyzeDoc } from './digest.mjs';
import { exteriorWallIds } from './topology.mjs';
import { docBounds } from './editor/render2d.mjs';
import { sub, add, mul, norm, perp, dist } from './geom.mjs';
import { LINE_MM, SHEETS, pickScale, wallClasses, gridAxes, dimensionChains, layoutLabels, stairInfo, fixtureSymbol, fmtDim, fmtAreaM2, approxTextWidth, countOverlaps } from './plan-annot.mjs';

export const PX_PER_MM = 4;
const FONT = `"IBM Plex Sans Arabic", Tahoma, 'Noto Sans Arabic', Arial, sans-serif`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = v => (Math.round(v * 10) / 10).toString();
const mm = v => v * PX_PER_MM;
const LW = Object.fromEntries(Object.entries(LINE_MM).map(([k, v]) => [k, n1(mm(v))]));
let uid = 0;

/**
 * @param {object} doc مستند المرسم
 * @param {{ levelId?, sheet?: 'A4'|'A3'|'A2'|'A1'|'A0', scale?: number, date?, fingerprint?, owner?, office?, sheetNo?, columns?: object[]|null, withFixtures?: boolean }} [opts]
 * @returns {{ svg: string, meta: object }}
 */
export function planSheet(doc, opts = {}) {
  const levelId = opts.levelId || doc.levels[0].id, lvl = doc.levels.find(l => l.id === levelId) || doc.levels[0];
  const sheet = SHEETS[opts.sheet] ? opts.sheet : 'A3', S = SHEETS[sheet], W = mm(S.w), H = mm(S.h);
  const model = analyzeDoc(doc), lv = model.levelById.get(levelId), analysis = lv?.analysis, rooms = lv?.rooms || [];
  const ext = analysis ? exteriorWallIds(analysis) : new Set();
  const classes = wallClasses(doc, levelId, ext);
  const columns = opts.columns || null;
  const axes = gridAxes(doc, levelId, { columns, analysis });
  const chains = dimensionChains(doc, levelId, analysis);
  const id = 'ps' + (++uid);
  // ------------------------------------------------------------------ تخطيط اللوحة: إطار، شريط أيمن، منطقة المسقط
  const M = mm(10), STRIP = mm(62), GAP = mm(3);
  const F = { x0: M, y0: M, x1: W - M, y1: H - M };
  const R = { x0: F.x1 - STRIP, x1: F.x1 };                       // الشريط الأيمن (جدول العنوان والمفتاح)
  const P = { x0: F.x0 + GAP, y0: F.y0 + GAP, x1: R.x0 - GAP, y1: F.y1 - GAP }; // منطقة المسقط
  const DIM_OFF = [8, 15, 22], AXIS_OFF = 31;                     // مم من حد المبنى
  const margin = { top: mm(AXIS_OFF + 7), left: mm(AXIS_OFF + 7), bottom: mm(DIM_OFF[2] + 6), right: mm(DIM_OFF[2] + 6) };
  const b = docBounds(doc, levelId), wM = Math.max(.5, b.x1 - b.x0), hM = Math.max(.5, b.y1 - b.y0);
  const availW = (P.x1 - P.x0 - margin.left - margin.right) / PX_PER_MM, availH = (P.y1 - P.y0 - margin.top - margin.bottom) / PX_PER_MM;
  const scale = opts.scale || pickScale(wM, hM, availW, availH);
  const k = mm(1000 / scale); // بكسل لكل متر
  const ox = P.x0 + margin.left + ((P.x1 - P.x0 - margin.left - margin.right) - wM * k) / 2, oy = P.y0 + margin.top + ((P.y1 - P.y0 - margin.top - margin.bottom) - hM * k) / 2;
  const X = x => ox + (x - b.x0) * k, Y = y => oy + (b.y1 - y) * k;
  const pt = p => n1(X(p.x)) + ',' + n1(Y(p.y));
  const poly = (pts, attrs) => `<polygon points="${pts.map(pt).join(' ')}" ${attrs}/>`;
  const line = (a, c, attrs) => `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(c.x)}" y2="${n1(c.y)}" ${attrs}/>`;
  const txt = (x, y, s, { size = 10, weight = 400, anchor = 'middle', rotate = 0, fill = '#000', halo = false } = {}) =>
    `<text x="${n1(x)}" y="${n1(y)}" font-size="${n1(size)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${halo ? ' stroke="#fff" stroke-width="3" paint-order="stroke"' : ''}${rotate ? ` transform="rotate(${rotate} ${n1(x)} ${n1(y)})"` : ''}>${esc(s)}</text>`;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${S.w}mm" height="${S.h}mm" direction="rtl" font-family='${FONT}' class="plan-sheet" data-sheet="${sheet}" data-scale="${scale}">`,
    `<title>${esc(doc.title)} — ${esc(lvl.name)} — مسقط معماري 1:${scale}</title>`,
    `<defs><pattern id="${id}-hatch" patternUnits="userSpaceOnUse" width="${n1(mm(1.2))}" height="${n1(mm(1.2))}" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${n1(mm(1.2))}" stroke="#000" stroke-width="${LW.thin}"/></pattern></defs>`,
    `<rect width="${W}" height="${H}" fill="#fff"/>`,
    `<rect x="${F.x0}" y="${F.y0}" width="${F.x1 - F.x0}" height="${F.y1 - F.y0}" fill="none" stroke="#000" stroke-width="${LW.heavy}"/>`,
    `<rect x="${F.x0 + mm(1.5)}" y="${F.y0 + mm(1.5)}" width="${F.x1 - F.x0 - mm(3)}" height="${F.y1 - F.y0 - mm(3)}" fill="none" stroke="#000" stroke-width="${LW.thin}"/>`,
    `<line x1="${R.x0}" y1="${F.y0}" x2="${R.x0}" y2="${F.y1}" stroke="#000" stroke-width="${LW.heavy}"/>`];

  // ------------------------------------------------------------------ الجدران: الخارجي مصمت والداخلي مهشّر، بخط قطع ثقيل
  const levelWalls = doc.walls.filter(w => w.level === levelId);
  const ends = new Map(), key = p => Math.round(p.x * 200) + ',' + Math.round(p.y * 200);
  for (const w of levelWalls) for (const e of [w.a, w.b]) ends.set(key(e), (ends.get(key(e)) || 0) + 1);
  const wallPoly = w => { const u = norm(sub(w.b, w.a)), n = mul(perp(u), w.t / 2), ea = ends.get(key(w.a)) > 1 ? w.t / 2 : 0, eb = ends.get(key(w.b)) > 1 ? w.t / 2 : 0; const a = sub(w.a, mul(u, ea)), c = add(w.b, mul(u, eb)); return [add(a, n), add(c, n), sub(c, n), sub(a, n)]; };
  const wallG = [];
  for (const w of levelWalls) {
    const cls = classes.byId.get(w.id);
    const fill = cls === 'exterior' ? '#000' : cls === 'interior' ? `url(#${id}-hatch)` : '#777';
    wallG.push(poly(wallPoly(w), `fill="${fill}" stroke="#000" stroke-width="${cls === 'interior' ? LW.thick : LW.heavy}" stroke-linejoin="miter"`));
  }
  out.push(`<g class="walls">${wallG.join('')}</g>`);
  // ------------------------------------------------------------------ الفتحات: قطع الجدار، باب بقوس، نافذة بخط مزدوج
  const wallById = new Map(levelWalls.map(w => [w.id, w])), openG = [];
  let entryMark = null;
  for (const o of doc.openings) {
    if (o.level !== levelId) continue; const w = wallById.get(o.wall); if (!w) continue;
    const u = norm(sub(w.b, w.a)), n = perp(u), p0 = add(w.a, mul(u, o.at - o.w / 2)), p1 = add(w.a, mul(u, o.at + o.w / 2)), hw = w.t / 2;
    openG.push(poly([add(p0, mul(n, hw + .004)), add(p1, mul(n, hw + .004)), sub(p1, mul(n, hw + .004)), sub(p0, mul(n, hw + .004))], 'fill="#fff" stroke="none"'));
    const jamb = `stroke="#000" stroke-width="${LW.medium}"`;
    for (const p of [p0, p1]) openG.push(line({ x: X(add(p, mul(n, hw)).x), y: Y(add(p, mul(n, hw)).y) }, { x: X(sub(p, mul(n, hw)).x), y: Y(sub(p, mul(n, hw)).y) }, jamb));
    const isWin = o.kind === 'window' || o.kind === 'window2';
    if (isWin) {
      for (const f of [-.35, .35]) { const a = add(p0, mul(n, hw * f)), c = add(p1, mul(n, hw * f)); openG.push(line({ x: X(a.x), y: Y(a.y) }, { x: X(c.x), y: Y(c.y) }, `stroke="#000" stroke-width="${LW.thin}"`)); }
      continue;
    }
    const secs = swingSectors({ o, wall: w });
    for (const sec of secs) {
      const h = sec.hinge, leaf = add(h, mul(sec.side, sec.r)), c0 = add(h, mul(sec.closed, sec.r));
      openG.push(line({ x: X(h.x), y: Y(h.y) }, { x: X(leaf.x), y: Y(leaf.y) }, `stroke="#000" stroke-width="${LW.medium}"`));
      const sw = (sec.closed.x * sec.side.y - sec.closed.y * sec.side.x) > 0 ? 1 : 0; // دوران موجب في العالم = بعقارب الساعة على الشاشة (y مقلوب)
      openG.push(`<path d="M${pt(c0)} A${n1(sec.r * k)} ${n1(sec.r * k)} 0 0 ${sw} ${pt(leaf)}" fill="none" stroke="#000" stroke-width="${LW.thin}"/>`);
    }
    if (!secs.length) { // منزلق/قوس/مرآب: خط رفيع (متقطع للفتحة المفتوحة)
      const seg = (a, c, attrs) => openG.push(line({ x: X(a.x), y: Y(a.y) }, { x: X(c.x), y: Y(c.y) }, attrs));
      if (o.kind === 'slider') { // ضلفتان متداخلتان على خطين متوازيين
        const m = add(w.a, mul(u, o.at)), d1 = mul(n, hw * .35);
        seg(add(p0, d1), add(add(m, mul(u, .1)), d1), `stroke="#000" stroke-width="${LW.medium}"`); seg(sub(sub(m, mul(u, .1)), d1), sub(p1, d1), `stroke="#000" stroke-width="${LW.medium}"`);
      } else seg(p0, p1, `stroke="#000" stroke-width="${LW.thin}"${o.kind === 'arch' ? ' stroke-dasharray="6 4"' : ''}`);
    }
    if (o.entry && !entryMark) entryMark = { p: add(add(w.a, mul(u, o.at)), mul(n, o.swing === 'out' ? -(hw + .9) : hw + .9)), u };
  }
  out.push(`<g class="openings">${openG.join('')}</g>`);
  // ------------------------------------------------------------------ الأعمدة (مقترحة من التحجيم الأولي أو مرسومة)
  const colG = [], colBoxes = [];
  for (const c of [...(columns || []), ...doc.columns.filter(c => c.level === levelId && !(columns || []).some(q => dist(q, c) < .5))]) {
    const s = c.size || .3, r = s / 2; colBoxes.push({ x: c.x, y: c.y, w: s, h: s });
    colG.push(`<rect x="${n1(X(c.x - r))}" y="${n1(Y(c.y + r))}" width="${n1(s * k)}" height="${n1(s * k)}" fill="#000" stroke="#000" stroke-width="${LW.thick}"/>`);
  }
  if (colG.length) out.push(`<g class="columns">${colG.join('')}</g>`);
  // ------------------------------------------------------------------ الدرج: درجات، سهم الصعود، عدد القوائم
  const stairG = [], stairBoxes = [];
  for (const s of doc.stairs) {
    if (s.level !== levelId) continue;
    const info = stairInfo(s, lvl.height || 3.2);
    for (const t of [...info.treads, ...info.landings]) stairG.push(poly(t.poly, `fill="#fff" stroke="#000" stroke-width="${LW.thin}"`));
    const a = { x: X(info.arrow.from.x), y: Y(info.arrow.from.y) }, c = { x: X(info.arrow.to.x), y: Y(info.arrow.to.y) }, ang = Math.atan2(c.y - a.y, c.x - a.x);
    stairG.push(line(a, c, `stroke="#000" stroke-width="${LW.medium}"`), `<circle cx="${n1(a.x)}" cy="${n1(a.y)}" r="${n1(mm(.7))}" fill="#000"/>`,
      `<path d="M${n1(c.x)} ${n1(c.y)} L${n1(c.x - mm(2) * Math.cos(ang - .4))} ${n1(c.y - mm(2) * Math.sin(ang - .4))} L${n1(c.x - mm(2) * Math.cos(ang + .4))} ${n1(c.y - mm(2) * Math.sin(ang + .4))} Z" fill="#000"/>`);
    const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }; let deg = ang * 180 / Math.PI; if (deg > 90 || deg < -90) deg += 180;
    stairG.push(txt(mid.x, mid.y - mm(1.2), info.text, { size: mm(2.2), rotate: deg, halo: true }));
    const pts = [...info.treads, ...info.landings].flatMap(t => t.poly), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    stairBoxes.push({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  }
  if (stairG.length) out.push(`<g class="stairs">${stairG.join('')}</g>`);
  // ------------------------------------------------------------------ الأثاث بخط رفيع
  const fixG = [], fixBoxes = [];
  if (opts.withFixtures !== false) for (const f of doc.fixtures) {
    if (f.level !== levelId) continue;
    const sym = fixtureSymbol(f), thin = `fill="none" stroke="#000" stroke-width="${LW.thin}"`;
    if (sym.outline) fixG.push(poly(sym.outline, `fill="#fff" stroke="#000" stroke-width="${LW.thin}"`));
    for (const r of sym.rects) fixG.push(poly(r, thin));
    for (const [a, c] of sym.lines) fixG.push(line({ x: X(a.x), y: Y(a.y) }, { x: X(c.x), y: Y(c.y) }, thin));
    for (const e of sym.ellipses) fixG.push(`<ellipse cx="${n1(X(e.c.x))}" cy="${n1(Y(e.c.y))}" rx="${n1(e.rx * k)}" ry="${n1(e.ry * k)}" transform="rotate(${n1(-e.rot * 180 / Math.PI)} ${n1(X(e.c.x))} ${n1(Y(e.c.y))})" ${thin}/>`);
    if (!sym.soft) fixBoxes.push({ x: f.x, y: f.y, w: Math.max(f.w, f.d), h: Math.max(f.w, f.d), soft: true });
  }
  if (fixG.length) out.push(`<g class="fixtures">${fixG.join('')}</g>`);
  // ------------------------------------------------------------------ تسميات الفراغات: الاسم ثم المساحة (وأبعاد المستطيل إن اتسع)
  const nameSize = mm(3.2) / k, subSize = mm(2.3) / k; // بالمتر
  const measure = (t, size) => approxTextWidth(t, size);
  const labelsIn = rooms.filter(r => !r.unlabelled || r.area >= 2).map(r => {
    const lines = [{ text: r.name, size: nameSize }, { text: fmtAreaM2(r.area), size: subSize }];
    if (r.rect && r.area >= 9 && r.shape === 'rectangle') lines.splice(1, 0, { text: `${fmtDim(r.rect.l)} × ${fmtDim(r.rect.w)}`, size: subSize });
    return { id: r.id, seed: r.label ? r.label.seed : (r.inside || r.centroid), ring: r.net, holes: r.space.holes || [], lines, areaHint: r.area };
  });
  if (entryMark) labelsIn.push({ id: '__entry', seed: entryMark.p, ring: null, lines: [{ text: 'المدخل الرئيسي  ±0.00', size: subSize }], areaHint: 1e9 });
  const lay = layoutLabels(labelsIn, { measure, obstacles: [...stairBoxes, ...colBoxes, ...fixBoxes] });
  const labG = [];
  for (const p of lay.placed) {
    const l = labelsIn.find(x => x.id === p.id); let y = Y(p.y) - (p.h * k) / 2 + l.lines[0].size * p.scale * k * .95;
    l.lines.forEach((t, i) => { labG.push(txt(X(p.x), y, t.text, { size: t.size * p.scale * k, weight: i === 0 ? 700 : 400, halo: true })); y += t.size * p.scale * k * 1.25; });
    if (l.id === '__entry') { const ex = X(p.x), ey = Y(p.y) + p.h * k / 2 + mm(.5); labG.push(`<path d="M${n1(ex - mm(2))} ${n1(ey + mm(2.4))} L${n1(ex)} ${n1(ey)} L${n1(ex + mm(2))} ${n1(ey + mm(2.4))} Z" fill="#000"/>`); } // سهم المدخل
  }
  out.push(`<g class="labels">${labG.join('')}</g>`);
  // ------------------------------------------------------------------ سلاسل الأبعاد (3 مستويات) على الجهات الأربع
  const dimG = [], dimBoxes = [], tick = mm(1.2), tsz = mm(2.3);
  const dimPx = chains.map(side => {
    const vertical = side.axis === 'y', across0 = vertical ? X(side.extent) : Y(side.extent), dirPx = vertical ? side.sign : -side.sign; // اتجاه الابتعاد عن المبنى بالبكسل
    const lines = side.chains.map((c, i) => ({ ...c, at: across0 + dirPx * mm(DIM_OFF[Math.min(i, 2)]) }));
    return { side, vertical, dirPx, lines, far: across0 + dirPx * mm(DIM_OFF[Math.min(lines.length - 1, 2)]) };
  });
  for (const d of dimPx) {
    const { vertical, dirPx } = d;
    for (const c of d.lines) {
      const along = v => vertical ? Y(v) : X(v), A0 = along(c.ticks[0].pos), A1 = along(c.ticks[c.ticks.length - 1].pos);
      dimG.push(vertical ? line({ x: c.at, y: A0 }, { x: c.at, y: A1 }, `stroke="#000" stroke-width="${LW.thin}"`) : line({ x: A0, y: c.at }, { x: A1, y: c.at }, `stroke="#000" stroke-width="${LW.thin}"`));
      for (const t of c.ticks) {
        const a = along(t.pos), face = vertical ? X(t.face) : Y(t.face), from = face + dirPx * mm(1.5), to = c.at + dirPx * mm(2);
        dimG.push(vertical ? line({ x: from, y: a }, { x: to, y: a }, `stroke="#000" stroke-width="${LW.thin}"`) : line({ x: a, y: from }, { x: a, y: to }, `stroke="#000" stroke-width="${LW.thin}"`));
        dimG.push(vertical ? line({ x: c.at - tick, y: a + tick }, { x: c.at + tick, y: a - tick }, `stroke="#000" stroke-width="${LW.medium}"`) : line({ x: a - tick, y: c.at + tick }, { x: a + tick, y: c.at - tick }, `stroke="#000" stroke-width="${LW.medium}"`));
      }
      let shortRun = 0; // المقاطع القصيرة المتتالية تتناوب على صفّين حتى لا تتراكب نصوصها
      for (const s of c.segments) {
        const m = (along(s.a) + along(s.b)) / 2, text = fmtDim(s.len), tw = approxTextWidth(text, tsz) * .9, segPx = Math.abs(along(s.b) - along(s.a));
        const short = tw > segPx - mm(.6), size = short ? tsz * .85 : tsz; shortRun = short ? shortRun + 1 : 0;
        const off = short ? mm(3.4) + (shortRun % 2) * size * .95 : mm(.9);
        if (vertical) { const x = c.at + dirPx * off + (dirPx > 0 ? size * .85 : 0); dimG.push(txt(x, m, text, { size, rotate: -90 })); dimBoxes.push({ x: x - size * .4, y: m, w: size, h: tw }); }
        else { const cy = c.at + dirPx * (off + size * .5); dimG.push(txt(m, cy + size * .35, text, { size })); dimBoxes.push({ x: m, y: cy, w: tw, h: size }); }
      }
    }
  }
  out.push(`<g class="dims">${dimG.join('')}</g>`);
  // ------------------------------------------------------------------ المحاور: خطوط نقطة-شرطة وفقاعات أعلى (أرقام) ويسار (حروف)
  const axG = [], rb = mm(3.2);
  const top = dimPx.find(d => d.side.side === 'n'), left = dimPx.find(d => d.side.side === 'w');
  const topY = (top ? top.far : Y(b.y1)) - mm(9), leftX = (left ? left.far : X(b.x0)) - mm(9);
  const bottomY = (dimPx.find(d => d.side.side === 's')?.far ?? Y(b.y0)) + mm(2), rightX = (dimPx.find(d => d.side.side === 'e')?.far ?? X(b.x1)) + mm(2);
  const dash = `stroke="#000" stroke-width="${LW.thin}" stroke-dasharray="${n1(mm(4))} ${n1(mm(1))} ${n1(mm(.6))} ${n1(mm(1))}"`;
  for (const a of axes.x) axG.push(line({ x: X(a.pos), y: topY + rb }, { x: X(a.pos), y: bottomY }, dash), `<circle cx="${n1(X(a.pos))}" cy="${n1(topY)}" r="${n1(rb)}" fill="#fff" stroke="#000" stroke-width="${LW.medium}"/>`, txt(X(a.pos), topY + mm(1), a.label, { size: mm(2.8), weight: 700 }));
  for (const a of axes.y) axG.push(line({ x: leftX + rb, y: Y(a.pos) }, { x: rightX, y: Y(a.pos) }, dash), `<circle cx="${n1(leftX)}" cy="${n1(Y(a.pos))}" r="${n1(rb)}" fill="#fff" stroke="#000" stroke-width="${LW.medium}"/>`, txt(leftX, Y(a.pos) + mm(1), a.label, { size: mm(2.8), weight: 700 }));
  out.push(`<g class="axes">${axG.join('')}</g>`);

  // ------------------------------------------------------------------ الشريط الأيمن: جدول العنوان، المفتاح، الشمال، المقياس، ملاحظات
  const sx0 = R.x0, sx1 = R.x1, cx = (sx0 + sx1) / 2; let y = F.y0 + mm(4);
  const hr = () => { out.push(`<line x1="${sx0}" y1="${n1(y)}" x2="${sx1}" y2="${n1(y)}" stroke="#000" stroke-width="${LW.medium}"/>`); };
  const row = (label, value, { big = false } = {}) => { out.push(txt(sx1 - mm(2), y + mm(2.6), label, { size: mm(2), anchor: 'start', fill: '#444' })); y += mm(2.8); out.push(txt(sx1 - mm(2), y + mm(3.2), value, { size: mm(big ? 3.4 : 2.7), weight: 600, anchor: 'start' })); y += mm(big ? 5.4 : 4.6); };
  out.push(txt(cx, y + mm(5.5), 'الميزان الهندسي', { size: mm(5), weight: 700 }), txt(cx, y + mm(9.5), 'AL MIZAN AL HANDASI · نحو منزلك', { size: mm(2), fill: '#444' }));
  y += mm(12); hr(); y += mm(1);
  out.push(txt(cx, y + mm(4), 'مسقط معماري — ' + lvl.name, { size: mm(3.4), weight: 700 })); y += mm(6); hr(); y += mm(1);
  const plot = doc.plot?.polygon?.length ? (() => { const xs = doc.plot.polygon.map(p => p.x), ys = doc.plot.polygon.map(p => p.y); return `${fmtDim(Math.max(...xs) - Math.min(...xs))} × ${fmtDim(Math.max(...ys) - Math.min(...ys))} م`; })() : 'غير محددة';
  row('المشروع', doc.title || 'مشروع بلا اسم', { big: true });
  row('المالك', opts.owner || 'غير مُدخل');
  row('الأرض', plot);
  row('الدور / المنسوب', `${lvl.name} · ${(lvl.elevation || 0) >= 0 ? '+' : ''}${(lvl.elevation || 0).toFixed(2)}`);
  row('المقياس عند الطباعة على ' + sheet, `1:${scale}`);
  row('رقم اللوحة · التاريخ', `${opts.sheetNo || 'A-01'} · ${opts.date || ''}`);
  row('بصمة الهندسة', opts.fingerprint || '—');
  row('إعداد', opts.office || 'الميزان الهندسي — تصميم أولي');
  hr(); y += mm(1);
  // المفتاح
  out.push(txt(sx1 - mm(2), y + mm(3.2), 'مفتاح الرموز', { size: mm(2.6), weight: 700, anchor: 'start' })); y += mm(5);
  const legendItems = [];
  for (const g of classes.legend) legendItems.push([g.kind === 'exterior' ? `<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#000"/>` : g.kind === 'interior' ? `<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="url(#${id}-hatch)" stroke="#000" stroke-width="${LW.thick}"/>` : `<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#777"/>`, g.label]);
  if (colG.length) legendItems.push([`<rect x="${mm(2)}" y="0" width="${mm(3)}" height="${mm(3)}" fill="#000"/>`, columns ? 'عمود خرساني (مقترح — تحجيم أولي)' : 'عمود مرسوم']);
  legendItems.push([`<line x1="${mm(1)}" y1="${mm(3)}" x2="${mm(1)}" y2="${mm(-1)}" stroke="#000" stroke-width="${LW.medium}"/><path d="M${mm(1)} ${mm(-1)} A${mm(4)} ${mm(4)} 0 0 1 ${mm(5)} ${mm(3)}" fill="none" stroke="#000" stroke-width="${LW.thin}"/>`, 'باب مع قوس الفتح']);
  legendItems.push([`<line x1="0" y1="${mm(1)}" x2="${mm(7)}" y2="${mm(1)}" stroke="#000" stroke-width="${LW.thin}"/><line x1="0" y1="${mm(2.2)}" x2="${mm(7)}" y2="${mm(2.2)}" stroke="#000" stroke-width="${LW.thin}"/>`, 'نافذة (خط مزدوج)']);
  legendItems.push([`<circle cx="${mm(3.5)}" cy="${mm(1.6)}" r="${mm(1.5)}" fill="#fff" stroke="#000" stroke-width="${LW.medium}"/><text x="${mm(3.5)}" y="${mm(2.3)}" font-size="${mm(1.8)}" text-anchor="middle" font-weight="700">A</text>`, 'محور (من ' + (axes.source === 'columns' ? 'الأعمدة' : axes.source === 'outline' ? 'محيط المبنى' : 'أعمدتك') + ')']);
  legendItems.push([`<line x1="0" y1="${mm(1.6)}" x2="${mm(7)}" y2="${mm(1.6)}" stroke="#000" stroke-width="${LW.thin}"/><line x1="${mm(.5)}" y1="${mm(2.4)}" x2="${mm(1.5)}" y2="${mm(.8)}" stroke="#000" stroke-width="${LW.medium}"/><line x1="${mm(5.5)}" y1="${mm(2.4)}" x2="${mm(6.5)}" y2="${mm(.8)}" stroke="#000" stroke-width="${LW.medium}"/>`, 'بُعد بالمتر (الفتحات / الجدران / الإجمالي)']);
  for (const [sym, label] of legendItems) { out.push(`<g transform="translate(${n1(sx1 - mm(10))} ${n1(y)})">${sym}</g>`, txt(sx1 - mm(12), y + mm(2.6), label, { size: mm(2), anchor: 'start' })); y += mm(4.6); }
  hr(); y += mm(2);
  // الشمال والمقياس الخطي
  const nx = sx1 - mm(10), ny = y + mm(8);
  out.push(`<g transform="rotate(${n1(doc.north || 0)} ${n1(nx)} ${n1(ny)})"><circle cx="${n1(nx)}" cy="${n1(ny)}" r="${n1(mm(6))}" fill="#fff" stroke="#000" stroke-width="${LW.medium}"/><path d="M${n1(nx)} ${n1(ny - mm(5))} L${n1(nx + mm(2))} ${n1(ny + mm(2))} L${n1(nx)} ${n1(ny + mm(.5))} L${n1(nx - mm(2))} ${n1(ny + mm(2))} Z" fill="#000"/></g>`, txt(nx, ny - mm(7), 'ش', { size: mm(2.6), weight: 700 }));
  const sb = { x: sx0 + mm(3), y: y + mm(10), seg: k }, segs = Math.max(1, Math.min(5, Math.floor((sx1 - mm(22) - sb.x) / k)));
  for (let i = 0; i < segs; i++) out.push(`<rect x="${n1(sb.x + i * k)}" y="${n1(sb.y)}" width="${n1(k)}" height="${n1(mm(1.5))}" fill="${i % 2 ? '#fff' : '#000'}" stroke="#000" stroke-width="${LW.thin}"/>`, txt(sb.x + i * k, sb.y - mm(1), String(i), { size: mm(1.8) }));
  out.push(txt(sb.x + segs * k, sb.y - mm(1), segs + ' م', { size: mm(1.8) }));
  y += mm(17); hr(); y += mm(1);
  // ملاحظات
  const notes = ['الأبعاد بالمتر والمساحات صافية داخل الجدران.', 'تسلسل الأبعاد: فتحات، ثم محاور الجدران، ثم الإجمالي.',
    columns ? 'الأعمدة مقترحة من تحجيم أولي؛ النظام الإنشائي افتراض: هيكل خرساني وبلوك غير حامل.' : 'نوع الجدار (حامل/قاطع) افتراض: الجدران بلوك غير حامل.',
    'مخطط أولي للتصميم والتسعير؛ ليس مخططًا معتمدًا للترخيص أو التنفيذ.'];
  for (const n of notes) for (const w of wrap('• ' + n, 34)) { if (y > F.y1 - mm(4)) break; out.push(txt(sx1 - mm(2), y + mm(2.8), w, { size: mm(1.9), anchor: 'start' })); y += mm(3.1); }
  out.push('</svg>');
  const meta = { sheet, scale, pxPerMm: PX_PER_MM, axes, chains, labels: lay, labelOverlaps: lay.overlaps, dimTextOverlaps: countOverlaps(dimBoxes), columns: colG.length, rooms: rooms.length };
  return { svg: out.join('\n'), meta };
}

/** SVG فقط. */
export const planSheetSvg = (doc, opts) => planSheet(doc, opts).svg;

function wrap(text, n) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur); return lines;
}

export default { planSheet, planSheetSvg, PX_PER_MM };
