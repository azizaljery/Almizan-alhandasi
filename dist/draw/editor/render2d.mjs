// Canvas renderer of the plan. Draws the document the way an architectural drawing looks:
// tinted rooms, solid walls, door swings, window symbols, furniture glyphs, stairs, dimensions and live room areas.
// بأسلوب المخطط المهني: سماكات أقلام بنسب 0.18/0.35/0.5/0.7، جدران خارجية مصمتة وداخلية مهشّرة (في وضع اللوحة)،
// أبواب بأقواس ونوافذ بخط مزدوج، سلاسل أبعاد ثلاثية المستويات، محاور، تسميات بالمساحة مرتّبة بلا تراكب، درج بسهم وعدد قوائم.
// flags.sheet = «وضع لوحة»: أسود على أبيض للطباعة، بلا شبكة ولا تلوين، مع مفتاح رموز.
import { ROOM_TYPES } from '../catalog.mjs';
import { swingSectors, wallRect } from '../review.mjs';
import { dist, sub, add, mul, norm, perp } from '../geom.mjs';
import { gridStep } from './snap.mjs';
import { LINE_MM, wallClasses, gridAxes, dimensionChains, layoutLabels, stairInfo, fixtureSymbol, fmtDim, fmtAreaM2 } from '../plan-annot.mjs';

export const THEME = {
  paper: '#fbf9f4', grid: 'rgba(110,100,80,.10)', gridMajor: 'rgba(110,100,80,.22)', wall: '#2a2a2e', wallExt: '#1b1b1f', ink: '#3a3631', inkSoft: '#8b8577',
  accent: '#1f6f6a', accent2: '#c6a15b', select: '#0e7fd6', danger: '#c0392b', warn: '#d68910', ok: '#2e8b57', fixtureFill: '#fffdf8', fixtureLine: '#6b6559', glass: '#7fb7d6',
};
/** ألوان وضع اللوحة: أسود على أبيض للطباعة. */
export const SHEET_THEME = { ...THEME, paper: '#ffffff', wall: '#000', wallExt: '#000', ink: '#000', inkSoft: '#222', accent: '#000', accent2: '#555', fixtureFill: '#fff', fixtureLine: '#000', glass: '#000' };
export const FONT = '"IBM Plex Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif';

export const makeView = (cx = 6, cy = 7, scale = 40) => ({ cx, cy, scale });
export const toScreen = (v, W, H, p) => ({ x: (p.x - v.cx) * v.scale + W / 2, y: H / 2 - (p.y - v.cy) * v.scale });
export const toWorld = (v, W, H, s) => ({ x: (s.x - W / 2) / v.scale + v.cx, y: v.cy - (s.y - H / 2) / v.scale });
export function fitView(bounds, W, H, margin = 60) {
  const w = Math.max(bounds.x1 - bounds.x0, 2), h = Math.max(bounds.y1 - bounds.y0, 2);
  const scale = Math.max(4, Math.min((W - margin * 2) / w, (H - margin * 2) / h));
  return { cx: (bounds.x0 + bounds.x1) / 2, cy: (bounds.y0 + bounds.y1) / 2, scale };
}
export function docBounds(doc, levelId = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
  for (const w of doc.walls) if (!levelId || w.level === levelId) { take(w.a); take(w.b); }
  for (const f of doc.fixtures) if (!levelId || f.level === levelId) take(f);
  for (const s of doc.stairs) if (!levelId || s.level === levelId) take(s);
  if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 12; y1 = 10; }
  return { x0, y0, x1, y1 };
}

const fmtLen = m => m.toFixed(2) + ' م';
const fmtArea = fmtAreaM2;
/** سماكات الأقلام بالبكسل عند مقياس k (بكسل/متر): نسب LINE_MM ثابتة، والأساس يتبع التكبير بهدوء. */
export function pens(k) {
  const base = Math.max(.6, Math.min(2, Math.sqrt(k / 40))) * (.8 / LINE_MM.thin);
  return { thin: LINE_MM.thin * base, medium: LINE_MM.medium * base, thick: LINE_MM.thick * base, heavy: LINE_MM.heavy * base };
}
/** إزاحات سلاسل الأبعاد والمحاور بالبكسل من حد المبنى (فتحات، جدران، إجمالي، فقاعة المحور). */
export const DIM_OFFSETS_PX = Object.freeze([28, 50, 72, 100]);

// ذاكرة مؤقتة لما يُحسب من التحليل نفسه (السلاسل والمحاور والتسميات)، حتى لا تُعاد الحسابات مع كل حركة مؤشر
const chainCache = new WeakMap(), labelCache = new WeakMap();

/** state: { doc, levelId, analysis (analyzeDoc level: rooms/gaps/exteriorWallIds), analysisRaw (analyzeWalls), columns, view, W, H, dpr, selection:Set, hover, ghost, snap, selBox, issues, flags } */
export function renderPlan(ctx, st) {
  const { doc, levelId, view: v, W, H } = st, S = p => toScreen(v, W, H, p), k = v.scale;
  const flags = { grid: true, dims: true, areas: true, fixtures: true, underlay: true, autoDims: true, axes: true, sheet: false, ...(st.flags || {}) };
  const sheet = !!flags.sheet, T = sheet ? SHEET_THEME : THEME, pen = pens(k);
  const sel = st.selection || new Set();
  ctx.save();
  ctx.fillStyle = T.paper; ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // ------------------------------------------------------------------ grid
  if (flags.grid && !sheet) {
    const step = gridStep(k, doc.settings?.grid ?? .1), w0 = toWorld(v, W, H, { x: 0, y: H }), w1 = toWorld(v, W, H, { x: W, y: 0 });
    const major = step * (step < 1 ? (step === .05 ? 20 : step === .1 ? 10 : step === .25 ? 4 : 2) : 5);
    ctx.lineWidth = 1;
    for (let x = Math.floor(w0.x / step) * step; x <= w1.x; x += step) {
      const sx = Math.round((x - v.cx) * k + W / 2) + .5, isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
      ctx.strokeStyle = isMajor ? T.gridMajor : T.grid; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
    for (let y = Math.floor(w0.y / step) * step; y <= w1.y; y += step) {
      const sy = Math.round(H / 2 - (y - v.cy) * k) + .5, isMajor = Math.abs(y / major - Math.round(y / major)) < 1e-6;
      ctx.strokeStyle = isMajor ? T.gridMajor : T.grid; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    }
  }

  // ------------------------------------------------------------------ plot
  if (doc.plot?.polygon?.length > 2) {
    ctx.save(); ctx.setLineDash([10, 6]); ctx.strokeStyle = T.accent2; ctx.lineWidth = sheet ? pen.medium : 1.6; ctx.fillStyle = sheet ? 'transparent' : 'rgba(198,161,91,.05)';
    ctx.beginPath(); doc.plot.polygon.forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath(); if (!sheet) ctx.fill(); ctx.stroke(); ctx.restore();
  }

  // ------------------------------------------------------------------ underlay (level below) as faint lines
  if (flags.underlay && !sheet) {
    const idx = doc.levels.findIndex(l => l.id === levelId);
    const other = idx > 0 ? doc.levels[idx - 1].id : (doc.levels[idx + 1]?.id || null);
    if (other) {
      ctx.save(); ctx.strokeStyle = 'rgba(80,110,140,.35)'; ctx.setLineDash([6, 5]);
      for (const w of doc.walls) if (w.level === other) { const r = wallRect(w).map(S); ctx.lineWidth = 1; ctx.beginPath(); r.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke(); }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ rooms
  const rooms = st.analysis?.rooms || [];
  for (const r of rooms) {
    const type = ROOM_TYPES[r.type] || ROOM_TYPES.other, hover = st.hover?.roomId === r.id, picked = sel.has(r.id);
    ctx.beginPath();
    for (const ring of [r.net, ...(r.space.holes || [])]) { ring.forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath(); }
    if (!sheet) { ctx.fillStyle = r.unlabelled ? 'rgba(160,160,160,.12)' : (typeof st.roomFill === 'function' && st.roomFill(r)) || type.color; ctx.fill('evenodd'); }
    if (hover || picked) { ctx.fillStyle = picked ? 'rgba(14,127,214,.18)' : 'rgba(14,127,214,.09)'; ctx.fill('evenodd'); }
  }

  // ------------------------------------------------------------------ walls: exterior solid, interior hatched in sheet mode; heavy cut line
  const ends = new Map(), key = p => Math.round(p.x * 200) + ',' + Math.round(p.y * 200);
  const levelWalls = doc.walls.filter(w => w.level === levelId);
  for (const w of levelWalls) for (const e of [w.a, w.b]) ends.set(key(e), (ends.get(key(e)) || 0) + 1);
  const ext = st.analysis?.exteriorWallIds || new Set();
  const classes = wallClasses(doc, levelId, ext);
  const wallPath = w => {
    const u = norm(sub(w.b, w.a)), n = mul(perp(u), w.t / 2), ea = ends.get(key(w.a)) > 1 ? w.t / 2 : 0, eb = ends.get(key(w.b)) > 1 ? w.t / 2 : 0;
    const a = sub(w.a, mul(u, ea)), b = add(w.b, mul(u, eb));
    return [add(a, n), add(b, n), sub(b, n), sub(a, n)].map(S);
  };
  const tracePoly = q => { ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); };
  for (const w of levelWalls) {
    const q = wallPath(w), cls = classes.byId.get(w.id);
    tracePoly(q);
    if (sheet && cls === 'interior') { hatchFill(ctx, q, pen.thin); tracePoly(q); ctx.lineWidth = pen.thick; ctx.strokeStyle = '#000'; ctx.lineJoin = 'miter'; ctx.stroke(); ctx.lineJoin = 'round'; }
    else { ctx.fillStyle = w.kind === 'fence' ? (sheet ? '#777' : '#6c7a6a') : w.kind === 'parapet' ? '#555' : (cls === 'exterior' ? T.wallExt : T.wall); ctx.fill(); }
  }
  // openings: cut the wall, then draw the symbol
  const wallById = new Map(levelWalls.map(w => [w.id, w]));
  let entrySeen = false;
  for (const o of doc.openings) {
    if (o.level !== levelId) continue;
    const w = wallById.get(o.wall); if (!w) continue;
    const u = norm(sub(w.b, w.a)), n = perp(u), p0 = add(w.a, mul(u, o.at - o.w / 2)), p1 = add(w.a, mul(u, o.at + o.w / 2)), hw = w.t / 2 + .005;
    const cut = [add(p0, mul(n, hw)), add(p1, mul(n, hw)), sub(p1, mul(n, hw)), sub(p0, mul(n, hw))].map(S);
    tracePoly(cut); ctx.fillStyle = T.paper; ctx.fill();
    const isWin = o.kind === 'window' || o.kind === 'window2', picked = sel.has(o.id), hov = st.hover?.id === o.id;
    const col = picked ? T.select : hov ? T.accent : T.ink;
    const seg = (a, b, width, color = col, dash = null) => { const A = S(a), B = S(b); ctx.save(); if (dash) ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.restore(); };
    for (const p of [p0, p1]) seg(add(p, mul(n, hw)), sub(p, mul(n, hw)), pen.medium); // الأكتاف
    if (isWin) { // نافذة: خط مزدوج (الزجاج) بين الكتفين
      if (!sheet) { const g = [add(p0, mul(n, hw * .35)), add(p1, mul(n, hw * .35)), sub(p1, mul(n, hw * .35)), sub(p0, mul(n, hw * .35))].map(S); tracePoly(g); ctx.fillStyle = 'rgba(127,183,214,.35)'; ctx.fill(); }
      for (const f of [-.35, .35]) seg(add(p0, mul(n, hw * f)), add(p1, mul(n, hw * f)), pen.thin, picked ? T.select : T.ink);
    } else {
      const secs = swingSectors({ o, wall: w });
      for (const sec of secs) { // الضلفة بخط متوسط والقوس بخط رفيع
        const h = S(sec.hinge), leaf = S(add(sec.hinge, mul(sec.side, sec.r))), c0 = S(add(sec.hinge, mul(sec.closed, sec.r)));
        ctx.strokeStyle = col; ctx.lineWidth = pen.medium; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(leaf.x, leaf.y); ctx.stroke();
        const a0 = Math.atan2(c0.y - h.y, c0.x - h.x), a1 = Math.atan2(leaf.y - h.y, leaf.x - h.x), R = sec.r * k;
        let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        ctx.save(); ctx.strokeStyle = picked ? T.select : T.inkSoft; ctx.lineWidth = pen.thin; ctx.beginPath(); ctx.arc(h.x, h.y, R, a0, a0 + d, d < 0); ctx.stroke(); ctx.restore();
      }
      if (!secs.length) {
        if (o.kind === 'slider') { const m = add(w.a, mul(u, o.at)), d1 = mul(n, hw * .35); seg(add(p0, d1), add(add(m, mul(u, .1)), d1), pen.medium); seg(sub(sub(m, mul(u, .1)), d1), sub(p1, d1), pen.medium); }
        else seg(p0, p1, pen.thin, col, o.kind === 'arch' ? [5, 4] : null);
      }
    }
    if (o.entry) {
      const t = S(add(add(w.a, mul(u, o.at)), mul(n, o.swing === 'out' ? -(w.t / 2 + .75) : w.t / 2 + .75)));
      ctx.fillStyle = T.accent; ctx.font = `700 ${Math.max(11, k * .28)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(entrySeen ? 'مدخل' : 'مدخل ±0.00', t.x, t.y); entrySeen = true; // منسوب أرضية الدور عند المدخل الرئيسي
    }
  }

  // ------------------------------------------------------------------ stairs: treads, climb arrow and riser count
  const stairBoxes = [];
  { const li = doc.levels.findIndex(l => l.id === levelId), below = li > 0 ? doc.levels[li - 1] : null;
    if (below) for (const s of doc.stairs.filter(x => x.level === below.id)) {
      // فتحة السلم القادم من الدور الأسفل: متقطع
      const info = stairInfo(s, below.height || 3.2), all = [...info.treads, ...info.landings], pts = all.flatMap(t => t.poly);
      ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = pen.thin; ctx.strokeStyle = T.fixtureLine;
      for (const t of all.slice(-Math.min(6, all.length))) { tracePoly(t.poly.map(S)); ctx.stroke(); }
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y), p0 = S({ x: Math.min(...xs), y: Math.max(...ys) }), p1 = S({ x: Math.max(...xs), y: Math.min(...ys) });
      ctx.strokeRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
      ctx.restore();
      if (k > 14) { ctx.save(); ctx.fillStyle = T.ink; ctx.font = `600 ${Math.max(9, Math.min(12, k * .22))}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`فتحة السلم · هبوط ${info.N} قائمة`, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2); ctx.restore(); }
      stairBoxes.push({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
    } }
  for (const s of doc.stairs) {
    if (s.level !== levelId) continue;
    const info = stairInfo(s, (doc.levels.find(l => l.id === levelId) || {}).height || 3.2), picked = sel.has(s.id);
    ctx.lineWidth = pen.thin; ctx.strokeStyle = picked ? T.select : T.fixtureLine; ctx.fillStyle = sheet ? '#fff' : '#f3efe6';
    const pts = [];
    for (const t of [...info.treads, ...info.landings]) { tracePoly(t.poly.map(S)); ctx.fill(); ctx.stroke(); pts.push(...t.poly); }
    const a = S(info.arrow.from), b = S(info.arrow.to);
    ctx.strokeStyle = picked ? T.select : T.accent; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = pen.medium; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, 7); ctx.fill();
    const ang = Math.atan2(b.y - a.y, b.x - a.x); ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - 9 * Math.cos(ang - .4), b.y - 9 * Math.sin(ang - .4)); ctx.lineTo(b.x - 9 * Math.cos(ang + .4), b.y - 9 * Math.sin(ang + .4)); ctx.closePath(); ctx.fill();
    if (k > 14) { let deg = ang; if (deg > Math.PI / 2 || deg < -Math.PI / 2) deg += Math.PI; ctx.save(); ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.rotate(deg); ctx.font = `600 ${Math.max(9, Math.min(12, k * .22))}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 3; ctx.strokeStyle = T.paper; ctx.strokeText(info.text, 0, -4); ctx.fillStyle = T.ink; ctx.fillText(info.text, 0, -4); ctx.restore(); }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y); stairBoxes.push({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  }

  // ------------------------------------------------------------------ fixtures (thin lines) and columns (solid)
  const fixBoxes = [];
  if (flags.fixtures) for (const f of doc.fixtures) {
    if (f.level !== levelId) continue;
    drawFixture(ctx, f, S, k, sel.has(f.id), st.hover?.id === f.id, T, pen);
    if (!['rug', 'tree', 'plant', 'pool', 'waterfall', 'lawn', 'planter', 'carport', 'pergola', 'bbq', 'fountain'].includes(f.kind)) fixBoxes.push({ x: f.x, y: f.y, w: Math.max(f.w, f.d), h: Math.max(f.w, f.d), soft: true });
  }
  const colBoxes = [];
  const drawCol = (c, proposed) => { const s = S(c), r = (c.size || .3) * k / 2; ctx.fillStyle = T.wall; ctx.strokeStyle = sel.has(c.id) ? T.select : proposed ? T.accent2 : T.wall; ctx.lineWidth = pen.thick; ctx.beginPath(); if (c.round) ctx.arc(s.x, s.y, r, 0, 7); else ctx.rect(s.x - r, s.y - r, r * 2, r * 2); ctx.fill(); ctx.stroke(); colBoxes.push({ x: c.x, y: c.y, w: c.size || .3, h: c.size || .3 }); };
  for (const c of doc.columns) if (c.level === levelId) drawCol(c, false);
  if (sheet && st.columns) for (const c of st.columns) if (!doc.columns.some(q => q.level === levelId && dist(q, c) < .5)) drawCol(c, true);

  if (typeof st.overlay === 'function') st.overlay(ctx, { S, k, levelId, doc });

  // ------------------------------------------------------------------ room labels: name, (rectangle dims), area — placed without overlaps
  if (flags.areas && rooms.length) {
    const kb = Math.round(k * 4) / 4, cacheKey = `${levelId}|${kb}|${sheet ? 1 : 0}|${flags.roomDims ? 1 : 0}|${fixBoxes.length}|${stairBoxes.length}`;
    let lay = labelCache.get(rooms)?.[cacheKey];
    if (!lay) {
      const nameSize = Math.min(17, Math.max(10, 13 * Math.sqrt(k / 40))) / k, subSize = Math.max(9, nameSize * k * .74) / k; // بالمتر
      const measure = (text, size) => { ctx.font = `600 ${size * k}px ${FONT}`; return ctx.measureText(text).width / k; };
      const items = rooms.filter(r => Math.sqrt(r.area) * k >= 30).map(r => {
        const lines = [{ text: r.name, size: nameSize }];
        if (r.rect && r.rect.w > .5 && r.shape === 'rectangle' && (flags.roomDims || r.area >= 9)) lines.push({ text: `${fmtDim(r.rect.l)} × ${fmtDim(r.rect.w)}`, size: subSize });
        lines.push({ text: fmtArea(r.area), size: subSize });
        return { id: r.id, seed: r.label ? r.label.seed : (r.inside || r.centroid), ring: r.net, holes: r.space.holes || [], lines, areaHint: r.area };
      });
      lay = layoutLabels(items, { measure, obstacles: [...stairBoxes, ...colBoxes, ...fixBoxes], pad: 4 / k });
      lay.items = new Map(items.map(i => [i.id, i]));
      const slot = labelCache.get(rooms) || {}; slot[cacheKey] = lay; labelCache.set(rooms, slot);
    }
    st.labelLayout = lay; // للاختبارات الحية: عدد التراكبات
    const roomById = new Map(rooms.map(r => [r.id, r]));
    for (const p of lay.placed) {
      const it = lay.items.get(p.id), r = roomById.get(p.id); if (!it || !r) continue;
      const c = S({ x: p.x, y: p.y }); let y = c.y - (p.h * k) / 2 + it.lines[0].size * p.scale * k * .55;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      it.lines.forEach((t, i) => {
        const px = t.size * p.scale * k, font = `${i === 0 ? 700 : i === it.lines.length - 1 ? 400 : 500} ${px}px ${FONT}`;
        ctx.font = font; ctx.lineWidth = 4; ctx.strokeStyle = sheet ? '#fff' : 'rgba(251,249,244,.92)'; ctx.strokeText(t.text, c.x, y);
        ctx.fillStyle = i === 0 ? (r.unlabelled ? T.inkSoft : T.ink) : (sheet ? '#000' : i === it.lines.length - 1 ? T.inkSoft : T.ink); ctx.fillText(t.text, c.x, y);
        y += px * 1.25;
      });
      if (r.label && sel.has(r.label.id)) { ctx.strokeStyle = T.select; ctx.lineWidth = 1.5; ctx.strokeRect(c.x - p.w * k / 2, c.y - p.h * k / 2, p.w * k, p.h * k); }
    }
  }
  for (const t of doc.texts) {
    if (t.level !== levelId) continue;
    const s = S(t.at); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(-(t.rot || 0)); ctx.font = `500 ${Math.max(10, (t.size || .3) * k)}px ${FONT}`; ctx.fillStyle = sel.has(t.id) ? T.select : T.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.text, 0, 0); ctx.restore();
  }

  // ------------------------------------------------------------------ dimensions: automatic 3-level exterior chains + grid axes, then the document's own
  let chains = [], axes = null;
  const raw = st.analysisRaw || st.analysis?.raw || null;
  if (raw && (flags.autoDims || flags.axes) && k >= 10) {
    let rec = chainCache.get(raw); if (!rec) { rec = { chains: dimensionChains(doc, levelId, raw), axes: gridAxes(doc, levelId, { columns: st.columns || null, analysis: raw }) }; chainCache.set(raw, rec); }
    chains = rec.chains; axes = rec.axes;
    if (st.columns && rec.columns !== st.columns) { rec.axes = gridAxes(doc, levelId, { columns: st.columns, analysis: raw }); rec.columns = st.columns; axes = rec.axes; }
    if (flags.autoDims) drawChains(ctx, chains, S, k, T, pen);
    if (flags.axes && k >= 14) drawAxes(ctx, axes, chains, docBounds(doc, levelId), S, T, pen, flags.autoDims);
  }
  if (flags.dims) for (const d of doc.dimensions) {
    if (d.level !== levelId) continue;
    if (chains.length && duplicatesChain(d, chains)) continue; // لا يُكرَّر بُعد تحمله السلسلة التلقائية
    drawDimension(ctx, d.a, d.b, d.offset ?? .6, d.text || fmtLen(dist(d.a, d.b)), S, k, sel.has(d.id) ? T.select : T.accent, T);
  }

  // ------------------------------------------------------------------ selection highlights for walls
  for (const w of levelWalls) if (sel.has(w.id) || st.hover?.id === w.id) {
    const q = wallPath(w); tracePoly(q);
    ctx.strokeStyle = sel.has(w.id) ? T.select : T.accent; ctx.lineWidth = sel.has(w.id) ? 2.5 : 1.8; ctx.stroke();
    if (sel.has(w.id)) { ctx.fillStyle = 'rgba(14,127,214,.25)'; ctx.fill();
      for (const e of [w.a, w.b]) { const s = S(e); ctx.fillStyle = '#fff'; ctx.strokeStyle = T.select; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 5.5, 0, 7); ctx.fill(); ctx.stroke(); }
      const m = S({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }), L = dist(w.a, w.b); chip(ctx, m.x, m.y - 16, fmtLen(L), T.select);
    }
  }

  // ------------------------------------------------------------------ gaps (unclosed rooms)
  for (const g of st.analysis?.gaps || []) {
    const a = S(g.at), b = S(g.point);
    ctx.save(); ctx.strokeStyle = T.warn; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.strokeStyle = T.warn; ctx.stroke(); }
    ctx.restore();
  }
  // review issue markers
  for (const m of st.markers || []) {
    const s = S(m.at); ctx.save(); ctx.fillStyle = m.severity === 'error' ? T.danger : m.severity === 'warning' ? T.warn : T.accent; ctx.globalAlpha = .92; ctx.beginPath(); ctx.arc(s.x, s.y, 7.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.severity === 'error' ? '!' : m.severity === 'warning' ? '!' : 'i', s.x, s.y + .5); ctx.restore();
  }

  // ------------------------------------------------------------------ guides, ghost, snap marker, selection box
  for (const g of st.snap?.guides || []) {
    ctx.save(); ctx.strokeStyle = 'rgba(214,40,140,.65)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); if (g.axis === 'x') { const sx = S({ x: g.v, y: 0 }).x; ctx.moveTo(sx, 0); ctx.lineTo(sx, H); } else { const sy = S({ x: 0, y: g.v }).y; ctx.moveTo(0, sy); ctx.lineTo(W, sy); } ctx.stroke(); ctx.restore();
  }
  if (st.ghost) drawGhost(ctx, st.ghost, S, k, doc, T);
  if (st.snap && st.cursor) drawSnapMarker(ctx, S(st.snap.p), st.snap.kind);
  if (st.selBox) {
    const a = S({ x: st.selBox.x0, y: st.selBox.y1 }), b = S({ x: st.selBox.x1, y: st.selBox.y0 });
    ctx.save(); ctx.fillStyle = st.selBox.crossing ? 'rgba(46,139,87,.12)' : 'rgba(14,127,214,.12)'; ctx.strokeStyle = st.selBox.crossing ? T.ok : T.select; ctx.lineWidth = 1.2; if (st.selBox.crossing) ctx.setLineDash([5, 4]);
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.restore();
  }
  // north arrow + scale bar (+ legend in sheet mode)
  drawCompass(ctx, 48, 54, doc.north || 0, T);
  drawScaleBar(ctx, 24, H - 34, k, T);
  if (sheet) drawLegend(ctx, W - 16, H - 16, classes.legend, !!st.columns, pen);
  ctx.restore();
}

/** تهشير 45° داخل مضلع (للجدران الداخلية في وضع اللوحة). */
function hatchFill(ctx, q, lw) {
  ctx.save(); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fill();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of q) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const step = 5; ctx.strokeStyle = '#000'; ctx.lineWidth = lw; ctx.beginPath();
  for (let s = x0 - (y1 - y0); s <= x1; s += step) { ctx.moveTo(s, y1); ctx.lineTo(s + (y1 - y0), y0); }
  ctx.stroke(); ctx.restore();
}

/** هل يكرر بُعد المستند بُعدًا في السلاسل التلقائية (طرفاه على علامتين ومحوره موازٍ لجهتها)؟ */
export function duplicatesChain(d, chains, tol = .06) {
  const horizontal = Math.abs(d.b.y - d.a.y) <= Math.abs(d.b.x - d.a.x);
  for (const side of chains) {
    if ((side.axis === 'x') !== horizontal) continue;
    const A = p => side.axis === 'x' ? p.x : p.y, C = p => side.axis === 'x' ? p.y : p.x;
    if (Math.abs(C(d.a) - side.extent) > 1.5) continue; // بعيد عن تلك الجهة
    const ticks = side.chains.flatMap(c => c.ticks.map(t => t.pos));
    if (ticks.some(t => Math.abs(t - A(d.a)) <= tol) && ticks.some(t => Math.abs(t - A(d.b)) <= tol)) return true;
  }
  return false;
}

/** سلاسل الأبعاد الثلاثية على الجهات الأربع (علامات مائلة، خطوط امتداد، نص فوق الخط). */
function drawChains(ctx, chains, S, k, T, pen) {
  const fs = Math.max(9.5, Math.min(12, k * .26));
  ctx.save(); ctx.strokeStyle = T.ink; ctx.fillStyle = T.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const side of chains) {
    const vertical = side.axis === 'y', dirPx = vertical ? side.sign : -side.sign;
    const across0 = vertical ? S({ x: side.extent, y: 0 }).x : S({ x: 0, y: side.extent }).y;
    const along = v => vertical ? S({ x: 0, y: v }).y : S({ x: v, y: 0 }).x;
    side.chains.forEach((c, i) => {
      const at = across0 + dirPx * DIM_OFFSETS_PX[Math.min(i, 2)], A0 = along(c.ticks[0].pos), A1 = along(c.ticks[c.ticks.length - 1].pos);
      ctx.lineWidth = pen.thin; ctx.beginPath(); if (vertical) { ctx.moveTo(at, A0); ctx.lineTo(at, A1); } else { ctx.moveTo(A0, at); ctx.lineTo(A1, at); } ctx.stroke();
      for (const t of c.ticks) {
        const a = along(t.pos), face = vertical ? S({ x: t.face, y: 0 }).x : S({ x: 0, y: t.face }).y, from = face + dirPx * 5, to = at + dirPx * 7;
        ctx.lineWidth = pen.thin; ctx.beginPath(); if (vertical) { ctx.moveTo(from, a); ctx.lineTo(to, a); } else { ctx.moveTo(a, from); ctx.lineTo(a, to); } ctx.stroke();
        ctx.lineWidth = pen.medium; ctx.beginPath(); if (vertical) { ctx.moveTo(at - 4, a + 4); ctx.lineTo(at + 4, a - 4); } else { ctx.moveTo(a - 4, at + 4); ctx.lineTo(a + 4, at - 4); } ctx.stroke();
      }
      let shortRun = 0; // المقاطع القصيرة المتتالية تتناوب على صفّين حتى لا تتراكب نصوصها
      for (const s of c.segments) {
        const m = (along(s.a) + along(s.b)) / 2, text = fmtDim(s.len); ctx.font = `600 ${fs}px ${FONT}`;
        const tw = ctx.measureText(text).width, segPx = Math.abs(along(s.b) - along(s.a)), short = tw > segPx - 3; shortRun = short ? shortRun + 1 : 0;
        const off = short ? 14 + (shortRun % 2) * fs * .95 : 3, size = short ? fs * .85 : fs;
        if (short) ctx.font = `600 ${size}px ${FONT}`;
        ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = T.paper;
        if (vertical) { const x = at + dirPx * (off + size * .5); ctx.translate(x, m); ctx.rotate(-Math.PI / 2); ctx.strokeText(text, 0, 0); ctx.fillText(text, 0, 0); }
        else { const y = at + dirPx * (off + size * .5); ctx.strokeText(text, m, y); ctx.fillText(text, m, y); }
        ctx.restore();
      }
    });
  }
  ctx.restore();
}

/** المحاور: خطوط نقطة-شرطة عبر المسقط وفقاعات أعلى (أرقام) ويسار (حروف) خلف سلاسل الأبعاد. */
function drawAxes(ctx, axes, chains, b, S, T, pen, withChains) {
  if (!axes || (!axes.x.length && !axes.y.length)) return;
  const far = side => { const c = chains.find(x => x.side === side); return c && withChains ? DIM_OFFSETS_PX[Math.min(c.chains.length - 1, 2)] : 0; };
  const top = S({ x: 0, y: b.y1 }).y - far('n') - 26, left = S({ x: b.x0, y: 0 }).x - far('w') - 26, bottom = S({ x: 0, y: b.y0 }).y + far('s') + 6, right = S({ x: b.x1, y: 0 }).x + far('e') + 6;
  ctx.save(); ctx.strokeStyle = T.inkSoft; ctx.fillStyle = T.ink; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const bubble = (x, y, label) => { ctx.save(); ctx.setLineDash([]); ctx.fillStyle = T.paper; ctx.strokeStyle = T.ink; ctx.lineWidth = pen.medium; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = T.ink; ctx.fillText(label, x, y + .5); ctx.restore(); };
  ctx.lineWidth = pen.thin; ctx.setLineDash([14, 4, 2, 4]);
  for (const a of axes.x) { const x = S({ x: a.pos, y: 0 }).x; ctx.beginPath(); ctx.moveTo(x, top + 10); ctx.lineTo(x, bottom); ctx.stroke(); bubble(x, top, a.label); }
  for (const a of axes.y) { const y = S({ x: 0, y: a.pos }).y; ctx.beginPath(); ctx.moveTo(left + 10, y); ctx.lineTo(right, y); ctx.stroke(); bubble(left, y, a.label); }
  ctx.restore();
}

/** مفتاح الرموز (وضع اللوحة) في الزاوية السفلية اليمنى للوحة الرسم. */
function drawLegend(ctx, x1, y1, legend, withColumns, pen) {
  const rows = [...legend.map(g => ({ kind: g.kind, label: g.label })), ...(withColumns ? [{ kind: 'column', label: 'عمود (مقترح — تحجيم أولي)' }] : []), { kind: 'door', label: 'باب مع قوس الفتح' }, { kind: 'window', label: 'نافذة (خط مزدوج)' }, { kind: 'dim', label: 'بُعد بالمتر: فتحات / جدران / إجمالي' }];
  const h = rows.length * 18 + 30, w = 236, x0 = x1 - w, y0 = y1 - h;
  ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = pen.medium; ctx.fillRect(x0, y0, w, h); ctx.strokeRect(x0, y0, w, h);
  ctx.fillStyle = '#000'; ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('مفتاح الرموز', x1 - 8, y0 + 14);
  ctx.font = `400 11px ${FONT}`;
  rows.forEach((r, i) => {
    const y = y0 + 32 + i * 18, sx = x1 - 10;
    ctx.save(); ctx.lineWidth = pen.thin; ctx.strokeStyle = '#000'; ctx.fillStyle = '#000';
    if (r.kind === 'exterior') ctx.fillRect(sx - 26, y - 5, 26, 10);
    else if (r.kind === 'interior') { ctx.beginPath(); ctx.rect(sx - 26, y - 5, 26, 10); hatchFill(ctx, [{ x: sx - 26, y: y - 5 }, { x: sx, y: y - 5 }, { x: sx, y: y + 5 }, { x: sx - 26, y: y + 5 }], pen.thin); ctx.strokeRect(sx - 26, y - 5, 26, 10); }
    else if (r.kind === 'column') ctx.fillRect(sx - 18, y - 5, 10, 10);
    else if (r.kind === 'door') { ctx.lineWidth = pen.medium; ctx.beginPath(); ctx.moveTo(sx - 24, y + 6); ctx.lineTo(sx - 24, y - 6); ctx.stroke(); ctx.lineWidth = pen.thin; ctx.beginPath(); ctx.arc(sx - 24, y + 6, 12, -Math.PI / 2, 0); ctx.stroke(); }
    else if (r.kind === 'window') { ctx.beginPath(); ctx.moveTo(sx - 26, y - 2); ctx.lineTo(sx, y - 2); ctx.moveTo(sx - 26, y + 2); ctx.lineTo(sx, y + 2); ctx.stroke(); }
    else if (r.kind === 'dim') { ctx.beginPath(); ctx.moveTo(sx - 26, y); ctx.lineTo(sx, y); ctx.stroke(); ctx.lineWidth = pen.medium; ctx.beginPath(); ctx.moveTo(sx - 23, y + 3); ctx.lineTo(sx - 19, y - 3); ctx.moveTo(sx - 7, y + 3); ctx.lineTo(sx - 3, y - 3); ctx.stroke(); }
    else { ctx.fillStyle = '#777'; ctx.fillRect(sx - 26, y - 5, 26, 10); }
    ctx.restore();
    ctx.fillStyle = '#000'; ctx.fillText(r.label, sx - 34, y);
  });
  ctx.restore();
}

function chip(ctx, x, y, text, color = THEME.select) {
  ctx.save(); ctx.font = `600 12px ${FONT}`; const w = ctx.measureText(text).width + 14; ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 20, 6); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + .5); ctx.restore();
}

function drawDimension(ctx, a, b, offset, text, S, k, color, T = THEME) {
  const u = norm(sub(b, a)), n = { x: -u.y, y: u.x }, A = add(a, mul(n, offset)), B = add(b, mul(n, offset));
  const sa = S(A), sb = S(B), ea = S(add(a, mul(n, offset + Math.sign(offset || 1) * .12))), eb = S(add(b, mul(n, offset + Math.sign(offset || 1) * .12)));
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
  for (const [p, q] of [[S(a), ea], [S(b), eb]]) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
  for (const p of [sa, sb]) { ctx.beginPath(); ctx.moveTo(p.x - 4, p.y + 4); ctx.lineTo(p.x + 4, p.y - 4); ctx.lineWidth = 1.8; ctx.stroke(); }
  const m = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 }; let ang = Math.atan2(sb.y - sa.y, sb.x - sa.x); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
  ctx.translate(m.x, m.y); ctx.rotate(ang); ctx.font = `600 ${Math.max(10, Math.min(13, k * .26))}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3; ctx.strokeStyle = T.paper; ctx.strokeText(text, 0, -2); ctx.fillText(text, 0, -2); ctx.restore();
}

/** الأثاث بخط رفيع من الرمز المشترك (نفس الهندسة في لوحة الكتاب). */
function drawFixture(ctx, f, S, k, picked, hover, T = THEME, pen = pens(k)) {
  const sym = fixtureSymbol(f);
  ctx.save();
  const trace = q => { ctx.beginPath(); q.forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath(); };
  ctx.strokeStyle = picked ? T.select : hover ? T.accent : T.fixtureLine; ctx.lineWidth = picked ? 2.4 : pen.thin;
  if (sym.outline) { trace(sym.outline); ctx.fillStyle = f.kind === 'rug' ? 'rgba(160,110,90,.18)' : f.kind === 'pool' || f.kind === 'waterfall' || f.kind === 'fountain' ? 'rgba(56,182,207,.30)' : f.kind === 'lawn' ? 'rgba(95,159,69,.22)' : T.fixtureFill; ctx.fill(); ctx.stroke(); }
  if (k > 14) {
    ctx.lineWidth = pen.thin;
    for (const r of sym.rects) { trace(r); ctx.stroke(); }
    for (const [a, b] of sym.lines) { const A = S(a), B = S(b); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
    for (const e of sym.ellipses) { const c = S(e.c); if (f.kind === 'tree' || f.kind === 'plant' || f.kind === 'planter') ctx.fillStyle = 'rgba(90,150,90,.35)'; ctx.beginPath(); ctx.ellipse(c.x, c.y, e.rx * k, e.ry * k, -e.rot, 0, 7); if (f.kind === 'tree' || f.kind === 'plant' || f.kind === 'planter') ctx.fill(); ctx.stroke(); }
  }
  ctx.restore();
}

function drawGhost(ctx, g, S, k, doc, T = THEME) {
  ctx.save(); ctx.strokeStyle = T.select; ctx.fillStyle = 'rgba(14,127,214,.16)'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
  if (g.type === 'wall') {
    const u = norm(sub(g.b, g.a)), n = mul(perp(u), g.t / 2), q = [add(g.a, n), add(g.b, n), sub(g.b, n), sub(g.a, n)].map(S);
    ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.setLineDash([]); ctx.stroke();
    const L = dist(g.a, g.b), m = S({ x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 });
    if (L > .02) chip(ctx, m.x, m.y - 18, fmtLen(L) + (g.angleLabel ? '  ' + g.angleLabel : ''), T.select);
  } else if (g.type === 'poly') {
    ctx.beginPath(); g.points.forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]); for (const [a, b] of g.sides || []) { const m = S({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); chip(ctx, m.x, m.y, fmtLen(dist(a, b)), T.select); }
    if (g.label) { const c = S(g.center); chip(ctx, c.x, c.y, g.label, T.accent); }
  } else if (g.type === 'opening') {
    const w = g.wall, u = norm(sub(w.b, w.a)), n = perp(u), p0 = add(w.a, mul(u, g.at - g.w / 2)), p1 = add(w.a, mul(u, g.at + g.w / 2)), hw = w.t / 2 + .04;
    const q = [add(p0, mul(n, hw)), add(p1, mul(n, hw)), sub(p1, mul(n, hw)), sub(p0, mul(n, hw))].map(S);
    ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = 'rgba(14,127,214,.35)'; ctx.fill(); ctx.setLineDash([]); ctx.stroke();
    const m = S(add(w.a, mul(u, g.at))); chip(ctx, m.x, m.y - 20, g.w.toFixed(2) + ' م', T.select);
  } else if (g.type === 'rect') {
    const poly = g.poly.map(S); ctx.beginPath(); poly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (g.type === 'dim') {
    drawDimension(ctx, g.a, g.b, g.offset ?? .6, fmtLen(dist(g.a, g.b)), S, k, T.select, T);
  } else if (g.type === 'point') {
    const s = S(g.p); ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, 7); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawSnapMarker(ctx, s, kind) {
  ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = kind === 'node' ? '#e67e22' : kind === 'grid' || kind === 'free' ? 'rgba(14,127,214,.7)' : '#d6288c';
  if (kind === 'node') ctx.strokeRect(s.x - 6, s.y - 6, 12, 12);
  else if (kind === 'mid') { ctx.beginPath(); ctx.moveTo(s.x - 7, s.y + 6); ctx.lineTo(s.x, s.y - 7); ctx.lineTo(s.x + 7, s.y + 6); ctx.closePath(); ctx.stroke(); }
  else if (kind === 'inter') { ctx.beginPath(); ctx.moveTo(s.x - 6, s.y - 6); ctx.lineTo(s.x + 6, s.y + 6); ctx.moveTo(s.x + 6, s.y - 6); ctx.lineTo(s.x - 6, s.y + 6); ctx.stroke(); }
  else if (kind === 'edge') { ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, 7); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(s.x - 8, s.y); ctx.lineTo(s.x + 8, s.y); ctx.moveTo(s.x, s.y - 8); ctx.lineTo(s.x, s.y + 8); ctx.stroke(); }
  ctx.restore();
}
function drawCompass(ctx, x, y, north, T = THEME) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(north * Math.PI / 180); ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.stroke();
  ctx.fillStyle = T.ink; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(6, 6); ctx.lineTo(0, 2); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
  ctx.rotate(-north * Math.PI / 180); ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('ش', 0, -24); ctx.restore();
}
function drawScaleBar(ctx, x, y, k, T = THEME) {
  const cand = [.5, 1, 2, 5, 10, 20], m = cand.find(c => c * k >= 70) || 20, w = m * k, n = m >= 2 ? 4 : 2;
  ctx.save(); ctx.strokeStyle = T.ink; ctx.fillStyle = T.ink; ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? T.paper : T.ink; ctx.fillRect(x + i * w / n, y - 5, w / n, 5); ctx.strokeRect(x + i * w / n, y - 5, w / n, 5); }
  ctx.fillStyle = T.ink; ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('0', x, y - 8); ctx.fillText(m + ' م', x + w, y - 8); ctx.restore();
}

export default { THEME, SHEET_THEME, makeView, toScreen, toWorld, fitView, docBounds, renderPlan, pens, duplicatesChain };
