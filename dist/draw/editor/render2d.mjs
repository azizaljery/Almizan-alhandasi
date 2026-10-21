// Canvas renderer of the plan. Draws the document the way an architectural drawing looks:
// tinted rooms, solid walls, door swings, window symbols, furniture glyphs, stairs, dimensions and live room areas.
import { ROOM_TYPES, FIXTURES, fixtureName } from '../catalog.mjs';
import { swingSectors, wallRect, fixtureRect } from '../review.mjs';
import { dist, sub, add, mul, norm, perp, rotate, len } from '../geom.mjs';
import { stairBox } from './hit.mjs';
import { stairLayout } from '../stairs3d.mjs';
import { gridStep } from './snap.mjs';

export const THEME = {
  paper: '#fbf9f4', grid: 'rgba(110,100,80,.10)', gridMajor: 'rgba(110,100,80,.22)', wall: '#2a2a2e', wallExt: '#1b1b1f', ink: '#3a3631', inkSoft: '#8b8577',
  accent: '#1f6f6a', accent2: '#c6a15b', select: '#0e7fd6', danger: '#c0392b', warn: '#d68910', ok: '#2e8b57', fixtureFill: '#fffdf8', fixtureLine: '#6b6559', glass: '#7fb7d6',
};
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

const fmtLen = m => (m >= 10 ? m.toFixed(2) : m.toFixed(2)) + ' م';
const fmtArea = a => (a >= 100 ? a.toFixed(1) : a.toFixed(2)).replace(/\.?0+$/, m => m) + ' م²';

/** state: { doc, levelId, analysis (analyzeDoc level), view, W, H, dpr, selection:Set, hover, ghost, snap, selBox, issues, flags } */
export function renderPlan(ctx, st) {
  const { doc, levelId, view: v, W, H } = st, S = p => toScreen(v, W, H, p), k = v.scale;
  const flags = { grid: true, dims: true, areas: true, fixtures: true, underlay: true, ...(st.flags || {}) };
  const sel = st.selection || new Set();
  ctx.save();
  ctx.fillStyle = THEME.paper; ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // ------------------------------------------------------------------ grid
  if (flags.grid) {
    const step = gridStep(k, doc.settings?.grid ?? .1), w0 = toWorld(v, W, H, { x: 0, y: H }), w1 = toWorld(v, W, H, { x: W, y: 0 });
    const major = step * (step < 1 ? (step === .05 ? 20 : step === .1 ? 10 : step === .25 ? 4 : 2) : 5);
    ctx.lineWidth = 1;
    for (let x = Math.floor(w0.x / step) * step; x <= w1.x; x += step) {
      const sx = Math.round((x - v.cx) * k + W / 2) + .5, isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
      ctx.strokeStyle = isMajor ? THEME.gridMajor : THEME.grid; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
    for (let y = Math.floor(w0.y / step) * step; y <= w1.y; y += step) {
      const sy = Math.round(H / 2 - (y - v.cy) * k) + .5, isMajor = Math.abs(y / major - Math.round(y / major)) < 1e-6;
      ctx.strokeStyle = isMajor ? THEME.gridMajor : THEME.grid; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    }
  }

  // ------------------------------------------------------------------ plot
  if (doc.plot?.polygon?.length > 2) {
    ctx.save(); ctx.setLineDash([10, 6]); ctx.strokeStyle = THEME.accent2; ctx.lineWidth = 1.6; ctx.fillStyle = 'rgba(198,161,91,.05)';
    ctx.beginPath(); doc.plot.polygon.forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    // (الجولة الثانية عشرة) الشوارع المحيطة بالأرض (كل جهات doc.streets، لا جهة المدخل وحدها — أرض الزاوية بشارعين): شريط رمادي خارج الحد
    if (flags.streets !== false && levelId === doc.levels[0]?.id) drawStreets(ctx, doc, S, k);
  }
  // (الجولة الثانية عشرة) مواقف السيارات (مناطق «garage» في هذا الدور): مستطيل مخطط بسيارة وكلمة «موقف»
  for (const z of (doc.zones || [])) {
    if (z.level !== levelId || z.type !== 'garage' || (z.polygon || []).length < 3) continue;
    const pts = z.polygon.map(S);
    ctx.save(); ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = 'rgba(150,150,150,.16)'; ctx.fill(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#7d7d7d'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    const xs = z.polygon.map(p => p.x), ys = z.polygon.map(p => p.y), w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), c = S({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
    const long = Math.max(w, h), cw = 1.8 * k, cl = Math.min(4.5, long - .6) * k, horiz = w >= h;
    ctx.translate(c.x, c.y); if (!horiz) ctx.rotate(Math.PI / 2);
    ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-cl / 2, -cw / 2, cl, cw, Math.min(8, cw / 4)) : ctx.rect(-cl / 2, -cw / 2, cl, cw); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-cl / 2 + cl * .28, -cw / 2); ctx.lineTo(-cl / 2 + cl * .28, cw / 2); ctx.moveTo(cl / 2 - cl * .22, -cw / 2); ctx.lineTo(cl / 2 - cl * .22, cw / 2); ctx.stroke();
    if (!horiz) ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#5f5f5f'; ctx.font = `600 ${Math.max(10, Math.min(13, k * .32))}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('موقف', 0, 0);
    ctx.restore();
  }

  // ------------------------------------------------------------------ underlay (level below) as faint lines
  if (flags.underlay) {
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
    ctx.fillStyle = r.unlabelled ? 'rgba(160,160,160,.12)' : (typeof st.roomFill === 'function' && st.roomFill(r)) || type.color; ctx.fill('evenodd');
    if (hover || picked) { ctx.fillStyle = picked ? 'rgba(14,127,214,.18)' : 'rgba(14,127,214,.09)'; ctx.fill('evenodd'); }
  }

  // ------------------------------------------------------------------ walls
  const ends = new Map(), key = p => Math.round(p.x * 200) + ',' + Math.round(p.y * 200);
  const levelWalls = doc.walls.filter(w => w.level === levelId);
  for (const w of levelWalls) for (const e of [w.a, w.b]) ends.set(key(e), (ends.get(key(e)) || 0) + 1);
  const ext = st.analysis?.exteriorWallIds || new Set();
  const wallPath = w => {
    const u = norm(sub(w.b, w.a)), n = mul(perp(u), w.t / 2), ea = ends.get(key(w.a)) > 1 ? w.t / 2 : 0, eb = ends.get(key(w.b)) > 1 ? w.t / 2 : 0;
    const a = sub(w.a, mul(u, ea)), b = add(w.b, mul(u, eb));
    return [add(a, n), add(b, n), sub(b, n), sub(a, n)].map(S);
  };
  for (const w of levelWalls) {
    const q = wallPath(w);
    ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = w.kind === 'fence' ? '#6c7a6a' : w.kind === 'parapet' ? '#555' : (ext.has(w.id) ? THEME.wallExt : THEME.wall); ctx.fill();
  }
  // openings: cut the wall, then draw the symbol
  const wallById = new Map(levelWalls.map(w => [w.id, w]));
  for (const o of doc.openings) {
    if (o.level !== levelId) continue;
    const w = wallById.get(o.wall); if (!w) continue;
    const u = norm(sub(w.b, w.a)), n = perp(u), p0 = add(w.a, mul(u, o.at - o.w / 2)), p1 = add(w.a, mul(u, o.at + o.w / 2)), hw = w.t / 2 + .005;
    const cut = [add(p0, mul(n, hw)), add(p1, mul(n, hw)), sub(p1, mul(n, hw)), sub(p0, mul(n, hw))].map(S);
    ctx.beginPath(); cut.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = THEME.paper; ctx.fill();
    const isWin = o.kind === 'window' || o.kind === 'window2', picked = sel.has(o.id), hov = st.hover?.id === o.id;
    ctx.strokeStyle = picked ? THEME.select : hov ? THEME.accent : THEME.ink; ctx.lineWidth = picked ? 2.4 : 1.4;
    if (isWin) {
      for (const f of [-.5, 0, .5]) { const a = S(add(p0, mul(n, hw * f * 1.6))), b = S(add(p1, mul(n, hw * f * 1.6))); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = f === 0 ? THEME.glass : (picked ? THEME.select : THEME.ink); ctx.lineWidth = f === 0 ? 2 : 1.2; ctx.stroke(); }
      for (const p of [p0, p1]) { const a = S(add(p, mul(n, hw))), b = S(sub(p, mul(n, hw))); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = picked ? THEME.select : THEME.ink; ctx.lineWidth = 1.2; ctx.stroke(); }
    } else {
      for (const p of [p0, p1]) { const a = S(add(p, mul(n, hw))), b = S(sub(p, mul(n, hw))); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      const secs = swingSectors({ o, wall: w });
      for (const sec of secs) {
        const h = S(sec.hinge), leaf = S(add(sec.hinge, mul(sec.side, sec.r))), c0 = S(add(sec.hinge, mul(sec.closed, sec.r)));
        ctx.strokeStyle = picked ? THEME.select : THEME.ink; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(leaf.x, leaf.y); ctx.stroke();
        const a0 = Math.atan2(c0.y - h.y, c0.x - h.x), a1 = Math.atan2(leaf.y - h.y, leaf.x - h.x), R = sec.r * k;
        let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = picked ? THEME.select : THEME.inkSoft; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(h.x, h.y, R, a0, a0 + d, d < 0); ctx.stroke(); ctx.restore();
      }
      if (!secs.length) { // slider / arch / garage: a thin line
        const a = S(add(w.a, mul(u, o.at - o.w / 2))), b = S(add(w.a, mul(u, o.at + o.w / 2)));
        ctx.save(); if (o.kind === 'arch') ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
      }
    }
    if (o.entry) { const c = S(add(w.a, mul(u, o.at))), off = mul(n, -(w.t / 2 + .55)); const t = S(add(add(w.a, mul(u, o.at)), off)); ctx.fillStyle = THEME.accent; ctx.font = `700 ${Math.max(11, k * .28)}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('مدخل', t.x, t.y); }
  }

  // ------------------------------------------------------------------ stairs
  // (الجولة العاشرة) السلم يُرسم من stairLayout نفسه الذي يبني المجسّم ويقيسه المراجع: النوائم والبسطة وخط الصعود بسهمه؛
  // وفي الدور الذي فوقه يُرسم السلم الصاعد إليه بخط خفيف وسهم إلى الوصول (فتحة السلم).
  const lvIdx = id => doc.levels.findIndex(l => l.id === id);
  const riseFor = id => { const i = lvIdx(id), L = doc.levels[i], U = doc.levels[i + 1]; const r = U && Number.isFinite(U.elevation) && Number.isFinite(L?.elevation) ? U.elevation - L.elevation : NaN; return r > .5 ? r : (L?.height > .5 ? L.height : 3.2); };
  for (const s of doc.stairs) {
    const own = s.level === levelId, above = !own && levelId && lvIdx(levelId) === lvIdx(s.level) + 1;
    if (levelId && !own && !above) continue;
    const picked = sel.has(s.id);
    let lay = null; try { lay = stairLayout(s, riseFor(s.level)); } catch { lay = null; }
    if (!lay) { const box = stairBox(s).map(S); ctx.beginPath(); box.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.strokeStyle = THEME.fixtureLine; ctx.lineWidth = 1.3; ctx.stroke(); continue; }
    const poly = (pts, fill, stroke, lw, dash) => { const q = pts.map(S); ctx.save(); if (dash) ctx.setLineDash(dash); ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.restore(); };
    if (own) {
      for (const st of lay.steps) poly(st.poly, st.type === 'landing' ? '#ebe5d8' : '#f6f2ea', picked ? THEME.select : THEME.inkSoft, st.type === 'landing' ? 1.2 : .9);
    } else for (const st of lay.steps) poly(st.poly, null, 'rgba(90,90,90,.55)', .7, [3, 3]);
    // خط الصعود: مراكز القلبات متصلة عبر البسطة، ينتهي بسهم عند آخر نائمة
    const path = [];
    for (const fl of lay.flights) { path.push(lay.toWorld(fl.a0, fl.b0)); path.push(lay.toWorld(fl.a1, fl.b1)); }
    const P = path.map(S);
    ctx.save(); ctx.strokeStyle = own ? THEME.accent : 'rgba(29,42,36,.6)'; ctx.lineWidth = own ? 1.6 : 1.1;
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(P[0].x, P[0].y, 3.2, 0, 7); ctx.fill();
    const b = P[P.length - 1], a = P[P.length - 2], ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - 10 * Math.cos(ang - .45), b.y - 10 * Math.sin(ang - .45)); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - 10 * Math.cos(ang + .45), b.y - 10 * Math.sin(ang + .45)); ctx.stroke();
    if (own && k >= 18) { const c = P[0]; ctx.font = `600 ${Math.max(9, k * .2)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(251,249,244,.9)'; const t = `صعود ${lay.N} قائمة`; const off = mul(norm(sub(P[0], P[1])), 11); ctx.strokeText(t, c.x + off.x, c.y + off.y); ctx.fillStyle = THEME.accent; ctx.fillText(t, c.x + off.x, c.y + off.y); }
    ctx.restore();
  }

  // ------------------------------------------------------------------ fixtures
  if (flags.fixtures) for (const f of doc.fixtures) {
    if (f.level !== levelId) continue;
    drawFixture(ctx, f, S, k, sel.has(f.id), st.hover?.id === f.id);
  }
  for (const c of doc.columns) {
    if (c.level !== levelId) continue;
    const s = S(c), r = c.size * k / 2; ctx.fillStyle = THEME.wall; ctx.strokeStyle = sel.has(c.id) ? THEME.select : THEME.wall; ctx.lineWidth = 2;
    ctx.beginPath(); if (c.round) ctx.arc(s.x, s.y, r, 0, 7); else ctx.rect(s.x - r, s.y - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
  }

  if (typeof st.overlay === 'function') st.overlay(ctx, { S, k, levelId, doc });

  // ------------------------------------------------------------------ room labels + areas
  if (flags.areas) for (const r of rooms) {
    const c = S(r.label ? r.label.seed : r.centroid);
    const px = Math.sqrt(r.area) * k; if (px < 34) continue;
    const maxW = Math.max(30, (r.rect ? Math.max(r.rect.w, r.rect.l) : Math.sqrt(r.area)) * k * .86);
    let big = Math.min(17, Math.max(10, px / 7.5));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${big}px ${FONT}`; while (big > 8.5 && ctx.measureText(r.name).width > maxW) { big -= .5; ctx.font = `600 ${big}px ${FONT}`; }
    const showName = ctx.measureText(r.name).width <= maxW * 1.05;
    const halo = (text, y, font, color) => { ctx.font = font; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(251,249,244,.92)'; ctx.strokeText(text, c.x, y); ctx.fillStyle = color; ctx.fillText(text, c.x, y); };
    if (showName) halo(r.name, c.y - big * .55, `600 ${big}px ${FONT}`, r.unlabelled ? THEME.inkSoft : THEME.ink);
    if (flags.roomDims && r.rect && r.rect.w > .5 && showName) {
      // عرض العرض (للمخططات المعروضة على العميل): الأبعاد ثم المساحة، كما في صفحات المخططات المهنية
      const dims = `${r.rect.l.toFixed(2)} × ${r.rect.w.toFixed(2)}`, fs = Math.max(8.5, big * .72);
      halo(dims, c.y + big * .6, `500 ${fs}px ${FONT}`, THEME.ink);
      halo(fmtArea(r.area), c.y + big * .6 + fs * 1.25, `400 ${fs}px ${FONT}`, THEME.inkSoft);
    } else halo(fmtArea(r.area), showName ? c.y + big * .65 : c.y, `400 ${Math.max(9, big * .8)}px ${FONT}`, THEME.inkSoft);
    if (r.label && sel.has(r.label.id)) { ctx.strokeStyle = THEME.select; ctx.lineWidth = 1.5; const w = Math.min(maxW, ctx.measureText(r.name).width + 16); ctx.strokeRect(c.x - w / 2, c.y - big * 1.3, w, big * 2.6); }
  }
  for (const t of doc.texts) {
    if (t.level !== levelId) continue;
    const s = S(t.at); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(-(t.rot || 0)); ctx.font = `500 ${Math.max(10, (t.size || .3) * k)}px ${FONT}`; ctx.fillStyle = sel.has(t.id) ? THEME.select : THEME.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.text, 0, 0); ctx.restore();
  }

  // ------------------------------------------------------------------ dimensions
  if (flags.dims) for (const d of doc.dimensions) {
    if (d.level !== levelId) continue;
    drawDimension(ctx, d.a, d.b, d.offset ?? .6, d.text || fmtLen(dist(d.a, d.b)), S, k, sel.has(d.id) ? THEME.select : THEME.accent);
  }
  if (flags.autoDims && st.analysis) {
    for (const r of rooms) {
      if (r.area < 3 || !r.rect) continue;
    }
  }

  // ------------------------------------------------------------------ selection highlights for walls
  for (const w of levelWalls) if (sel.has(w.id) || st.hover?.id === w.id) {
    const q = wallPath(w); ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = sel.has(w.id) ? THEME.select : THEME.accent; ctx.lineWidth = sel.has(w.id) ? 2.5 : 1.8; ctx.stroke();
    if (sel.has(w.id)) { ctx.fillStyle = 'rgba(14,127,214,.25)'; ctx.fill();
      for (const e of [w.a, w.b]) { const s = S(e); ctx.fillStyle = '#fff'; ctx.strokeStyle = THEME.select; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 5.5, 0, 7); ctx.fill(); ctx.stroke(); }
      const m = S({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }), L = dist(w.a, w.b); chip(ctx, m.x, m.y - 16, fmtLen(L), THEME.select);
    }
  }

  // ------------------------------------------------------------------ gaps (unclosed rooms)
  for (const g of st.analysis?.gaps || []) {
    const a = S(g.at), b = S(g.point);
    ctx.save(); ctx.strokeStyle = THEME.warn; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.strokeStyle = THEME.warn; ctx.stroke(); }
    ctx.restore();
  }
  // review issue markers
  for (const m of st.markers || []) {
    const s = S(m.at); ctx.save(); ctx.fillStyle = m.severity === 'error' ? THEME.danger : m.severity === 'warning' ? THEME.warn : THEME.accent; ctx.globalAlpha = .92; ctx.beginPath(); ctx.arc(s.x, s.y, 7.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.severity === 'error' ? '!' : m.severity === 'warning' ? '!' : 'i', s.x, s.y + .5); ctx.restore();
  }

  // ------------------------------------------------------------------ guides, ghost, snap marker, selection box
  for (const g of st.snap?.guides || []) {
    ctx.save(); ctx.strokeStyle = 'rgba(214,40,140,.65)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); if (g.axis === 'x') { const sx = S({ x: g.v, y: 0 }).x; ctx.moveTo(sx, 0); ctx.lineTo(sx, H); } else { const sy = S({ x: 0, y: g.v }).y; ctx.moveTo(0, sy); ctx.lineTo(W, sy); } ctx.stroke(); ctx.restore();
  }
  if (st.ghost) drawGhost(ctx, st.ghost, S, k, doc);
  if (st.snap && st.cursor) drawSnapMarker(ctx, S(st.snap.p), st.snap.kind);
  if (st.selBox) {
    const a = S({ x: st.selBox.x0, y: st.selBox.y1 }), b = S({ x: st.selBox.x1, y: st.selBox.y0 });
    ctx.save(); ctx.fillStyle = st.selBox.crossing ? 'rgba(46,139,87,.12)' : 'rgba(14,127,214,.12)'; ctx.strokeStyle = st.selBox.crossing ? THEME.ok : THEME.select; ctx.lineWidth = 1.2; if (st.selBox.crossing) ctx.setLineDash([5, 4]);
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.restore();
  }
  // north arrow + scale bar
  drawCompass(ctx, 48, 54, doc.north || 0);
  drawScaleBar(ctx, 24, H - 34, k);
  ctx.restore();
}

function chip(ctx, x, y, text, color = THEME.select) {
  ctx.save(); ctx.font = `600 12px ${FONT}`; const w = ctx.measureText(text).width + 14; ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 20, 6); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + .5); ctx.restore();
}

function drawDimension(ctx, a, b, offset, text, S, k, color) {
  const u = norm(sub(b, a)), n = { x: -u.y, y: u.x }, A = add(a, mul(n, offset)), B = add(b, mul(n, offset));
  const sa = S(A), sb = S(B), ea = S(add(a, mul(n, offset + Math.sign(offset || 1) * .12))), eb = S(add(b, mul(n, offset + Math.sign(offset || 1) * .12)));
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
  for (const [p, q] of [[S(a), ea], [S(b), eb]]) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
  for (const p of [sa, sb]) { ctx.beginPath(); ctx.moveTo(p.x - 4, p.y + 4); ctx.lineTo(p.x + 4, p.y - 4); ctx.lineWidth = 1.8; ctx.stroke(); }
  const m = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 }; let ang = Math.atan2(sb.y - sa.y, sb.x - sa.x); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
  ctx.translate(m.x, m.y); ctx.rotate(ang); ctx.font = `600 ${Math.max(10, Math.min(13, k * .26))}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3; ctx.strokeStyle = THEME.paper; ctx.strokeText(text, 0, -2); ctx.fillText(text, 0, -2); ctx.restore();
}

function drawFixture(ctx, f, S, k, picked, hover) {
  const poly = fixtureRect(f).map(S);
  ctx.save();
  ctx.beginPath(); poly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
  ctx.fillStyle = f.kind === 'rug' ? 'rgba(160,110,90,.18)' : THEME.fixtureFill; ctx.fill();
  ctx.strokeStyle = picked ? THEME.select : hover ? THEME.accent : THEME.fixtureLine; ctx.lineWidth = picked ? 2.4 : 1.2; ctx.stroke();
  const rot = f.rot || 0, c = S(f), fr = { x: -Math.sin(rot), y: Math.cos(rot) }; // plan-space front direction
  const L = (ax, ay, bx, by, col = THEME.fixtureLine) => { // local coordinates (x right, y front)
    const loc = (x, y) => { const r = rotate({ x, y }, rot); return S({ x: f.x + r.x, y: f.y + r.y }); };
    const a = loc(ax, ay), b = loc(bx, by); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };
  const loc = (x, y) => { const r = rotate({ x, y }, rot); return S({ x: f.x + r.x, y: f.y + r.y }); };
  const w = f.w, d = f.d;
  if (k > 14) switch (f.kind) {
    case 'bed-double': case 'bed-single': {
      const pw = f.kind === 'bed-single' ? w * .7 : w * .4;
      for (const sx of f.kind === 'bed-single' ? [0] : [-1, 1]) { const p = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => loc(sx * w * .24 + a * pw / 2 * (f.kind === 'bed-single' ? 1 : .9), -d / 2 + .25 + b * .14)); ctx.beginPath(); p.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke(); }
      L(-w / 2, d * .12, w / 2, d * .12); break; }
    case 'sofa-3': case 'sofa-2': case 'majlis-sofa': case 'armchair': L(-w / 2, -d / 2 + d * .28, w / 2, -d / 2 + d * .28); if (f.kind !== 'armchair') { L(-w / 2 + .12, -d / 2 + d * .28, -w / 2 + .12, d / 2); L(w / 2 - .12, -d / 2 + d * .28, w / 2 - .12, d / 2); } break;
    case 'wc': { const t = loc(0, d * .15); ctx.beginPath(); ctx.ellipse(t.x, t.y, w * .45 * k, d * .3 * k, -rot + Math.PI, 0, 7); ctx.stroke(); L(-w / 2, -d / 2 + d * .22, w / 2, -d / 2 + d * .22); break; }
    case 'basin': ctx.beginPath(); ctx.ellipse(c.x, c.y, w * .32 * k, d * .3 * k, -rot, 0, 7); ctx.stroke(); break;
    case 'shower': L(-w / 2, -d / 2, w / 2, d / 2); L(-w / 2, d / 2, w / 2, -d / 2); break;
    case 'bathtub': { const p = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => loc(a * w * .38, b * d * .44)); ctx.beginPath(); p.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke(); break; }
    case 'stove': for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const t = loc(a * w * .22, b * d * .22); ctx.beginPath(); ctx.arc(t.x, t.y, w * .13 * k, 0, 7); ctx.stroke(); } break;
    case 'kitchen-run': L(-w / 2, d / 2 - .08, w / 2, d / 2 - .08); { const t = loc(-w * .2, 0); ctx.strokeRect(t.x - .25 * k, t.y - .17 * k, .5 * k, .34 * k); } break;
    case 'fridge': L(-w / 2, 0, w / 2, 0); break;
    case 'washing-machine': { ctx.beginPath(); ctx.arc(c.x, c.y, w * .32 * k, 0, 7); ctx.stroke(); break; }
    case 'tv-unit': L(-w * .35, 0, w * .35, 0, THEME.ink); break;
    case 'dining-table': for (const sx of [-.3, .3]) for (const sy of [-1, 1]) { const t = loc(sx * w, sy * (d / 2 + .22)); ctx.strokeRect(t.x - .2 * k, t.y - .2 * k, .4 * k, .4 * k); } break;
    case 'car': ctx.strokeStyle = THEME.inkSoft; L(-w / 2 + .1, d * .28, w / 2 - .1, d * .28); L(-w / 2 + .1, -d * .18, w / 2 - .1, -d * .18); L(-w / 2 + .1, d * .28, -w / 2 + .1, -d * .18); L(w / 2 - .1, d * .28, w / 2 - .1, -d * .18); break;
    case 'tree': case 'plant': ctx.fillStyle = 'rgba(90,150,90,.35)'; ctx.beginPath(); ctx.arc(c.x, c.y, Math.min(w, d) * k * .5, 0, 7); ctx.fill(); ctx.stroke(); break;
    default: break;
  }
  if (k * Math.min(w, d) > 46 && f.kind !== 'rug' && !['tree', 'plant'].includes(f.kind)) { ctx.fillStyle = THEME.inkSoft; ctx.font = `400 ${Math.min(11, k * .22)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }
  ctx.restore();
}

function drawGhost(ctx, g, S, k, doc) {
  ctx.save(); ctx.strokeStyle = THEME.select; ctx.fillStyle = 'rgba(14,127,214,.16)'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
  if (g.type === 'wall') {
    const w = { a: g.a, b: g.b, t: g.t }, u = norm(sub(g.b, g.a)), n = mul(perp(u), g.t / 2), q = [add(g.a, n), add(g.b, n), sub(g.b, n), sub(g.a, n)].map(S);
    ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.setLineDash([]); ctx.stroke();
    const L = dist(g.a, g.b), m = S({ x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 });
    if (L > .02) { const ang = Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) * 180 / Math.PI; chip(ctx, m.x, m.y - 18, fmtLen(L) + (g.angleLabel ? '  ' + g.angleLabel : ''), THEME.select); }
  } else if (g.type === 'poly') {
    ctx.beginPath(); g.points.forEach((p, i) => { const s = S(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]); for (const [a, b] of g.sides || []) { const m = S({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); chip(ctx, m.x, m.y, fmtLen(dist(a, b)), THEME.select); }
    if (g.label) { const c = S(g.center); chip(ctx, c.x, c.y, g.label, THEME.accent); }
  } else if (g.type === 'opening') {
    const w = g.wall, u = norm(sub(w.b, w.a)), n = perp(u), p0 = add(w.a, mul(u, g.at - g.w / 2)), p1 = add(w.a, mul(u, g.at + g.w / 2)), hw = w.t / 2 + .04;
    const q = [add(p0, mul(n, hw)), add(p1, mul(n, hw)), sub(p1, mul(n, hw)), sub(p0, mul(n, hw))].map(S);
    ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = 'rgba(14,127,214,.35)'; ctx.fill(); ctx.setLineDash([]); ctx.stroke();
    const m = S(add(w.a, mul(u, g.at))); chip(ctx, m.x, m.y - 20, g.w.toFixed(2) + ' م', THEME.select);
  } else if (g.type === 'rect') {
    const poly = g.poly.map(S); ctx.beginPath(); poly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (g.type === 'dim') {
    drawDimension(ctx, g.a, g.b, g.offset ?? .6, fmtLen(dist(g.a, g.b)), S, k, THEME.select);
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
function drawCompass(ctx, x, y, north) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(north * Math.PI / 180); ctx.strokeStyle = THEME.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.stroke();
  ctx.fillStyle = THEME.ink; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(6, 6); ctx.lineTo(0, 2); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
  ctx.rotate(-north * Math.PI / 180); ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('ش', 0, -24); ctx.restore();
}
function drawScaleBar(ctx, x, y, k) {
  const cand = [.5, 1, 2, 5, 10, 20], m = cand.find(c => c * k >= 70) || 20, w = m * k;
  ctx.save(); ctx.strokeStyle = THEME.ink; ctx.fillStyle = THEME.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 5); ctx.stroke();
  ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(m + ' م', x + w / 2, y - 8); ctx.restore();
}

export default { THEME, makeView, toScreen, toWorld, fitView, docBounds, renderPlan };

const STREET_VEC = { s: { x: 0, y: -1 }, n: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };
const STREET_AR = { s: 'الجنوبي', n: 'الشمالي', e: 'الشرقي', w: 'الغربي' };
/** (الجولة الثانية عشرة) شريط الشارع خارج كل حد للأرض يطل على شارع (doc.streets)، باسمه وجهته؛ المدخل الرئيسي بخط أغمق. */
function drawStreets(ctx, doc, S, k) {
  const poly = doc.plot.polygon, sides = [...new Set([...(doc.streets || []), doc.entry || 's'])].filter(x => STREET_VEC[x]);
  for (const sd of sides) {
    const v = STREET_VEC[sd]; let best = null;
    poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < .5) return; const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L; for (const n of [{ x: uy, y: -ux }, { x: -uy, y: ux }]) { const d = n.x * v.x + n.y * v.y; if (d > .7 && (!best || L * d > best.s)) best = { a, b, n, s: L * d }; } });
    if (!best) continue;
    const off = (p, t) => ({ x: p.x + best.n.x * t, y: p.y + best.n.y * t }), q = [best.a, best.b, off(best.b, 7), off(best.a, 7)].map(S);
    ctx.save(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(70,74,80,.10)'; ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill();
    const s0 = S(off(best.a, 1.6)), s1 = S(off(best.b, 1.6)); ctx.strokeStyle = 'rgba(70,74,80,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
    const m = S(off({ x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 }, 1.0)); ctx.fillStyle = sd === (doc.entry || 's') ? '#3d4248' : '#6a6f75';
    ctx.font = `600 ${Math.max(11, Math.min(14, k * .34))}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.translate(m.x, m.y);
    if (Math.abs(best.n.x) > .7) ctx.rotate(-Math.PI / 2); ctx.fillText(`الشارع ${STREET_AR[sd]}${sd === (doc.entry || 's') ? ' (المدخل)' : ''}`, 0, 0); ctx.restore();
  }
}
