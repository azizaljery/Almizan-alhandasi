// تحويل مستند المرسم لقوالب الطراز الكلاسيكي (C). يعيد توزيع فتحات الواجهة الأمامية (الجدار الأبعد جنوبًا): العدد والعرض والارتفاع
// والتجميع (مفردة/أزواج/ثلاثية مركزية) والمدخل الرئيسي (موضعه وعرضه)، وقد يُرجِع جزءًا مركزيًا من الواجهة إلى الداخل (لوجيا/رواق) بجدارين عرضيين.
// الواجهة الأمامية = الجنوبية = الجدار ذو أصغر y؛ لا يبرز الجدار إلى الأمام أبدًا (الواجهة عند حد الارتداد). لا يعدّل المستند الأصلي. يُبقي الدور الأول فقط ويترك عدد الأدوار لـfloors.
export const WIN_W = [['window', .9], ['window', 1.2], ['window', 1.5], ['window2', 1.8]];
export const WIN_H = [[1.0, 1.3], [.55, 1.75], [.2, 2.1], [1.3, .9]]; // [sill, h]؛ القاعدة 45 سم تُضاف؛ رأس الفتحة ≤ 2.75 م
export const DOOR = [['door', 1.1, 2.1], ['door2', 1.5, 2.3], ['door2', 1.9, 2.3]];
const GAP = [.7, 1.5, 2.6], MARGIN = .75, EDGE = .2, REC_D = 1.3;
const clone = o => JSON.parse(JSON.stringify(o)), r3 = v => Math.round(v * 1000) / 1000;

function frontInfo(doc) {
  const L0 = doc.levels[0].id, hs = doc.walls.filter(w => w.level === L0 && w.kind !== 'fence' && w.kind !== 'parapet' && Math.abs(w.a.y - w.b.y) < .01);
  if (!hs.length) return null; const my = Math.min(...hs.map(w => w.a.y)); // الجنوب = أصغر y (OUT.s = (0,-1))
  const fr = hs.filter(w => Math.abs(w.a.y - my) < .05 && Math.abs(w.a.x - w.b.x) > 2.5).sort((a, b) => Math.min(a.a.x, a.b.x) - Math.min(b.a.x, b.b.x));
  return fr.length ? { L0, my, fr } : null;
}
/** يرجع القطع الأمامية {w,xl,xr,y,mid}؛ إن طُلب الارتداد المركزي وأمكن فتُقسَّم أطول قطعة إلى يمين/وسط مرتد/يسار. */
function carve(doc, info, rec, need = 3.6) {
  let segs = info.fr.map(w => ({ w, xl: Math.min(w.a.x, w.b.x), xr: Math.max(w.a.x, w.b.x), y: w.a.y, mid: false }));
  if (!rec) return { segs, rec: false };
  const big = segs.reduce((a, b) => (b.xr - b.xl > a.xr - a.xl ? b : a)), len = big.xr - big.xl, Wp = Math.min(len * .42, Math.max(need, len * .3));
  if (len < Wp + 4.2 || Wp < need - .01) return { segs, rec: false };
  const y = big.y, others = doc.walls.filter(w => w !== big.w && w.level === info.L0);
  const hit = (p0, p1) => others.some(w => { const x0 = Math.min(w.a.x, w.b.x), x1 = Math.max(w.a.x, w.b.x), y0 = Math.min(w.a.y, w.b.y), y1 = Math.max(w.a.y, w.b.y); return x1 > p0 - .2 && x0 < p1 + .2 && y1 > y - .15 && y0 < y + REC_D + .2; });
  const cx0 = (big.xl + big.xr) / 2; let best = null;
  for (let k = 0; k <= 60 && !best; k++) for (const s of k ? [-1, 1] : [1]) { const c = cx0 + s * k * .25, p0 = c - Wp / 2, p1 = c + Wp / 2; if (p0 < big.xl + 1.8 || p1 > big.xr - 1.8) continue; if (!hit(p0, p1)) { best = [p0, p1]; break; } }
  if (!best) return { segs, rec: false };
  const [p0, p1] = best, rest = segs.filter(s => s !== big), t = big.w.t, yr = y + REC_D, mk = (id, a, b) => ({ ...clone(big.w), id, a, b });
  const L = mk('cwL', { x: big.xl, y }, { x: p0, y }), M = mk('cwM', { x: p0, y: yr }, { x: p1, y: yr }), R = mk('cwR', { x: p1, y }, { x: big.xr, y });
  const RL = mk('cwRL', { x: p0, y }, { x: p0, y: yr }), RR = mk('cwRR', { x: p1, y: yr }, { x: p1, y });
  doc.walls = doc.walls.filter(w => w !== big.w && w.id !== big.w.id).concat([L, M, R, RL, RR]);
  doc.openings = doc.openings.filter(o => o.wall !== big.w.id);
  segs = [...rest, { w: L, xl: big.xl, xr: p0, y, mid: false }, { w: M, xl: p0, xr: p1, y: yr, mid: true }, { w: R, xl: p1, xr: big.xr, y, mid: false }];
  return { segs, rec: true };
}
function unitsFor(P, k) {
  const [kind, w] = WIN_W[P.ww]; const u = [];
  for (let i = 0; i < k; i++) {
    if (P.gr === 1) u.push([[kind, w, -(.15 + w / 2)], [kind, w, .15 + w / 2]]);
    else if (P.gr === 2 && k >= 3 && k % 2 === 1 && i === (k - 1) / 2) u.push([['window', w, -(.3 + 1.8 / 2 + w / 2)], ['window2', 1.8, 0], ['window', w, .3 + 1.8 / 2 + w / 2]]);
    else u.push([[kind, w, 0]]);
  }
  return u;
}
const unitW = u => Math.max(...u.map(o => Math.abs(o[2]) + o[1] / 2)) * 2;
/** يوزّع وحدات الشبابيك في المجال [x0,x1] (مراكز متساوية الشرائح) ويرجع [{kind,w,cx}]. */
function windowsIn(P, x0, x1, g) {
  const A = x1 - x0; if (A < .8) return [];
  let k = 1; const fit = n => { const us = unitsFor(P, n); return us.reduce((s, u) => s + unitW(u), 0) + (n - 1) * g <= A; };
  if (!fit(1)) { const w = Math.min(WIN_W[P.ww][1], A - .1); return w >= .7 ? [{ kind: 'window', w, cx: (x0 + x1) / 2 }] : []; }
  while (k < 12 && fit(k + 1)) k++;
  const us = unitsFor(P, k), slot = A / k, out = [];
  us.forEach((u, i) => { const c = x0 + slot * (i + .5); for (const [kind, w, off] of u) out.push({ kind, w, cx: c + off }); });
  return out;
}
export function docTransform(src, P, q) {
  const doc = clone(src), info = frontInfo(doc); if (!info) return doc;
  const lv0 = doc.levels[0]; doc.levels = [lv0];
  for (const k of ['walls', 'openings', 'labels', 'zones', 'fixtures', 'stairs', 'columns', 'dimensions', 'texts']) if (Array.isArray(doc[k])) doc[k] = doc[k].filter(x => !x.level || x.level === lv0.id);
  const CLEAR = [.5, .5, 1.6, .7, .9][P.ent], { segs, rec } = carve(doc, info, P.rec, Math.max(3.6, DOOR[P.dw][1] + (P.ent === 2 ? 2.7 : 1.8)));
  const fids = new Set(segs.map(s => s.w.id)); doc.openings = doc.openings.filter(o => !fids.has(o.wall));
  const [dk, dw, dh] = DOOR[P.dw], [sill, wh] = WIN_H[P.wh], g = P.giant ? Math.max(GAP[P.sp], 2.8) : GAP[P.sp]; let n = 0;
  const put = (seg, kind, cx, w, h, s, entry, id) => { const x = Math.min(seg.w.a.x, seg.w.b.x) === seg.w.a.x ? cx - seg.w.a.x : seg.w.a.x - cx;
    doc.openings.push({ id: id || 'cw' + (++n), level: lv0.id, wall: seg.w.id, kind, at: r3(x), w: r3(w), h: r3(h), sill: s, swing: 'in', hinge: 'left', entry: !!entry }); };
  const big = segs.filter(s => !s.mid).reduce((a, b) => (b.xr - b.xl > a.xr - a.xl ? b : a));
  const entrySeg = rec ? segs.find(s => s.mid) : big;
  for (const seg of segs) {
    const x0 = seg.xl + MARGIN, x1 = seg.xr - MARGIN;
    if (seg === entrySeg) {
      const A = x1 - x0, fr = rec ? .5 : [.5, .3, .7, 0, 1][P.ep]; let cd = x0 + A * fr; if (fr === 0) cd = x0 + dw / 2; if (fr === 1) cd = x1 - dw / 2; cd = Math.max(x0 + dw / 2, Math.min(x1 - dw / 2, cd));
      if (A < dw + .2) { // جدار ضيق: لا مكان للباب هنا
        for (const o of windowsIn(P, x0, x1, g)) put(seg, o.kind, o.cx, o.w, wh, sill, false); continue; }
      put(seg, dk, cd, dw, dh, 0, true, 'cEnt');
      if (!rec) for (const o of [...windowsIn(P, x0, cd - dw / 2 - CLEAR, g), ...windowsIn(P, cd + dw / 2 + CLEAR, x1, g)]) put(seg, o.kind, o.cx, o.w, wh, sill, false);
    } else for (const o of windowsIn(P, x0, x1, g)) put(seg, o.kind, o.cx, o.w, wh, sill, false);
  }
  if (!doc.openings.some(o => o.entry && o.id === 'cEnt')) { // لا قطعة تتسع للباب: ضع الباب على الأعرض ولو على حساب شباك
    const seg = big, c = (seg.xl + seg.xr) / 2; doc.openings = doc.openings.filter(o => o.wall !== seg.w.id); put(seg, dk, c, dw, dh, 0, true, 'cEnt'); }
  if (P.fl && !q.get('floors')) q.set('floors', String(P.fl));
  return doc;
}
export function validateDoc(doc, orig) {
  const err = [], W = new Map(doc.walls.map(w => [w.id, w])), len = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), by = new Map();
  if (doc.levels.length < 1) err.push('no levels');
  const ids = new Set();
  for (const o of doc.openings) { if (ids.has(o.id)) err.push('dup id ' + o.id); ids.add(o.id); const w = W.get(o.wall); if (!w) { err.push('wall? ' + o.id); continue; }
    if (o.at - o.w / 2 < EDGE - 1e-6 || o.at + o.w / 2 > len(w) - EDGE + 1e-6) err.push('edge ' + o.id); if (o.sill < 0 || o.sill + o.h > 2.8 + 1e-6) err.push('height ' + o.id);
    (by.get(o.wall) || by.set(o.wall, []).get(o.wall)).push(o); }
  for (const [wid, L] of by) { L.sort((a, b) => a.at - b.at); for (let i = 1; i < L.length; i++) if (L[i].at - L[i].w / 2 < L[i - 1].at + L[i - 1].w / 2 + .1) err.push('overlap ' + L[i - 1].id + '/' + L[i].id); }
  const info = frontInfo(doc); if (!info) err.push('no front'); else { const fids = new Set(info.fr.map(w => w.id)); if (!doc.openings.some(o => o.entry && /^door/.test(o.kind) && o.sill === 0 && (fids.has(o.wall) || o.id === 'cEnt'))) err.push('no front entry'); }
  const dang = d => { const E = []; for (const w of d.walls) for (const p of [w.a, w.b]) { const ok = d.walls.some(v => v !== w && (Math.hypot(v.a.x - p.x, v.a.y - p.y) < .06 || Math.hypot(v.b.x - p.x, v.b.y - p.y) < .06 || segDist(p, v) < .06)); if (!ok) E.push(w.id); } return E.length; };
  if (orig && dang(doc) > dang(orig)) err.push('dangling walls ' + dang(doc) + ' > ' + dang(orig));
  return err;
}
function segDist(p, w) { const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, l2 = dx * dx + dy * dy; let t = l2 ? ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (w.a.x + t * dx), p.y - (w.a.y + t * dy)); }
