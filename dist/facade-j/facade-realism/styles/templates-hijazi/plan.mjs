// مولّد المسقط/الواجهة لقوالب الطراز الحجازي (جدة). يُنتج مستند رسم جديدًا (mizan-draw/1) من حدود المستند الأصلي:
// الواجهة الأمامية = الجدار الأصغر y (جنوب). كل شيء حتمي من قيم القالب p (لا عشوائية).
// يغيّر: عرض المبنى، سماكة الجدران، كتلة الواجهة (بروز/ارتداد/جناح)، موضع ونوع الباب، حجم وعدد وتوزيع النوافذ، ارتفاع الدروة.
// ملاحظة: يحذف الجدران الداخلية والأثاث (المسقط الداخلي لا يطابق الواجهة).
const r2 = v => Math.round(v * 100) / 100;
export const WIN = [{ w: .8, h: 1.6, sill: .55 }, { w: 1.2, h: 1.3, sill: .75 }, { w: 1.9, h: 1.3, sill: .75 }, { w: 2.6, h: 1.4, sill: .7 }];
export const DOOR = [{ w: 1.5, h: 2.2, kind: 'door2' }, { w: 1.8, h: 2.7, kind: 'door2' }, { w: 1.0, h: 2.4, kind: 'door' }];
const PARAPET = [.7, .9, 1.2, 1.6], WT = [.25, .35, .5], WF = [1, .72, .55], GAP = [1.0, 1.6, 2.4], EP = [.5, .22, .78, .1, .9];

function bbox(doc) {
  const xs = [], ys = [];
  for (const w of doc.walls || []) { xs.push(w.a.x, w.b.x); ys.push(w.a.y, w.b.y); }
  if (!xs.length) { const P = doc.plot?.polygon || [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 14 }, { x: 0, y: 14 }]; for (const p of P) { xs.push(p.x); ys.push(p.y); } }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
/** مواضع نوافذ داخل مجال [a,b] (محلي): مجموعات من grp نافذة بعرض ww، مركّزة بهوامش m. */
function groups(a, b, ww, grp, gapG, m = .5) {
  const gi = ww >= 1.9 ? .7 : .55, gw = grp * ww + (grp - 1) * gi, L = b - a, n = Math.max(0, Math.floor((L - 2 * m + gapG) / (gw + gapG)));
  if (!n) return []; const total = n * gw + (n - 1) * gapG, s = a + (L - total) / 2, out = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < grp; k++) out.push(s + i * (gw + gapG) + k * (ww + gi) + ww / 2);
  return out;
}
export function genDoc(doc, P) {
  const B = bbox(doc), W0 = B.x1 - B.x0, D0 = B.y1 - B.y0, cx = (B.x0 + B.x1) / 2;
  const Wf = r2(Math.min(W0, Math.max(W0 * WF[P.wf ?? 0], Math.min(W0, 8)))), xl = r2(cx - Wf / 2), xr = r2(xl + Wf), Df = r2(Math.min(D0, Math.max(Math.min(D0, 15), Math.min(D0, 8)))), yb = r2(B.y0 + Df);
  const t = WT[P.wt ?? 0], fm = P.fm ?? 0, ww = WIN[P.wsz ?? 1], dd = DOOR[P.dk ?? 0], gapG = GAP[P.rg ?? 0], grp = P.grp ?? 1;
  // مقاطع الواجهة (يسار إلى يمين): y = موضع محور الجدار. البروز نحو الشارع = y أصغر.
  let segs;
  const third = r2(Wf / 3), mid0 = r2(xl + Wf * .3), mid1 = r2(xr - Wf * .3), y0 = r2(B.y0);
  if (fm === 1 && Wf >= 9) segs = [{ x0: xl, x1: mid0, y: r2(y0 + .6), role: 'wing' }, { x0: mid0, x1: mid1, y: y0, role: 'bay' }, { x0: mid1, x1: xr, y: r2(y0 + .6), role: 'wing' }];
  else if (fm === 2 && Wf >= 10) segs = [{ x0: xl, x1: mid0, y: y0, role: 'wing' }, { x0: mid0, x1: mid1, y: r2(y0 + 1.2), role: 'recess' }, { x0: mid1, x1: xr, y: y0, role: 'wing' }];
  else if (fm === 3 && Wf >= 9) segs = [{ x0: xl, x1: r2(xl + third), y: y0, role: 'bay' }, { x0: r2(xl + third), x1: xr, y: r2(y0 + .8), role: 'wing' }];
  else if (fm === 4 && Wf >= 10) { const wl = r2(Wf * .26); segs = [{ x0: xl, x1: r2(xl + wl), y: y0, role: 'bay' }, { x0: r2(xl + wl), x1: r2(xr - wl), y: r2(y0 + .8), role: 'wing' }, { x0: r2(xr - wl), x1: xr, y: y0, role: 'bay' }]; }
  else segs = [{ x0: xl, x1: xr, y: y0, role: 'flat' }];
  // المضلع (حول المبنى): أمامي من اليسار لليمين ثم الشرقي ثم الخلفي ثم الغربي
  const V = []; const first = segs[0], last = segs[segs.length - 1];
  for (const [i, s] of segs.entries()) { V.push({ x: s.x0, y: s.y }); V.push({ x: s.x1, y: s.y }); }
  V.push({ x: xr, y: yb }, { x: xl, y: yb });
  const dv = []; for (const p of V) { const l = dv[dv.length - 1]; if (!l || Math.hypot(l.x - p.x, l.y - p.y) > .01) dv.push(p); }
  const walls = [], wid = () => 'w' + (walls.length + 1);
  for (let i = 0; i < dv.length; i++) { const a = dv[i], b = dv[(i + 1) % dv.length]; if (Math.hypot(a.x - b.x, a.y - b.y) < .3) continue; walls.push({ id: wid(), level: 'L1', a: { ...a }, b: { ...b }, t, h: null, kind: 'wall' }); }
  const ops = []; const oid = () => 'o' + (ops.length + 1);
  const wallOf = (x, y, horizontal) => walls.find(w => horizontal ? Math.abs(w.a.y - w.b.y) < .01 && Math.abs(w.a.y - y) < .01 && Math.min(w.a.x, w.b.x) <= x + .001 && Math.max(w.a.x, w.b.x) >= x - .001 : false);
  // الباب الرئيسي: المقطع الأقرب للموضع المطلوب مع مجال كافٍ
  const tx = xl + Wf * EP[P.ep ?? 0], need = dd.w + 1.8;
  let ent = segs.filter(s => s.x1 - s.x0 >= need).sort((a, b) => (Math.abs((a.x0 + a.x1) / 2 - tx) - Math.abs((b.x0 + b.x1) / 2 - tx)))[0] || segs.slice().sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
  const clampDoor = (s, x, w) => Math.max(s.x0 + w / 2 + .9, Math.min(s.x1 - w / 2 - .9, x));
  const doors = []; // {seg, c, w}
  const dc = clampDoor(ent, tx, dd.w); doors.push({ seg: ent, c: r2(dc), w: dd.w, h: dd.h, kind: dd.kind, entry: true });
  if (P.d2) { const f2 = (P.ep ?? 0) === 0 ? .12 : 1 - EP[P.ep], x2 = xl + Wf * f2; const s2 = segs.filter(s => s.x1 - s.x0 >= 2.8).sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - x2) - Math.abs((b.x0 + b.x1) / 2 - x2))[0];
    if (s2) { const c2 = clampDoor(s2, x2, 1.0); if (Math.abs(c2 - dc) > dd.w / 2 + .5 + 1.6) doors.push({ seg: s2, c: r2(c2), w: 1.0, h: 2.2, kind: 'door', entry: false }); } }
  for (const s of segs) {
    const w = wallOf((s.x0 + s.x1) / 2, s.y, true); if (!w) continue; const along = x => r2(x - w.a.x);
    const ds = doors.filter(d => d.seg === s).sort((a, b) => a.c - b.c);
    for (const d of ds) ops.push({ id: oid(), level: 'L1', wall: w.id, kind: d.kind, at: along(d.c), w: d.w, h: d.h, sill: 0, swing: 'in', hinge: 'left', entry: d.entry });
    // نوافذ: مجالات بين الأبواب
    let cur = s.x0; const cuts = [];
    for (const d of ds) { cuts.push([cur, d.c - d.w / 2 - .75]); cur = d.c + d.w / 2 + .75; } cuts.push([cur, s.x1]);
    for (const [a, b] of cuts) for (const c of groups(a, b, ww.w, grp, gapG, .5)) ops.push({ id: oid(), level: 'L1', wall: w.id, kind: ww.w >= 2 ? 'window2' : 'window', at: along(c), w: ww.w, h: ww.h, sill: ww.sill, swing: null, hinge: 'left', entry: false });
  }
  // جدران جانبية وخلفية: نوافذ بحسب sw (0 لا شيء، 1 رأسية قليلة، 2 منتظمة)
  const sw = P.sw ?? 0;
  if (sw) {
    const sd = (P.wsz ?? 1) === 0 ? { w: .8, h: 1.6, sill: .55 } : { w: 1.0, h: 1.3, sill: .75 };
    for (const w of walls) { const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy); if (Math.abs(dy) < .01 && Math.abs(w.a.y - yb) > .01) continue; // أمامي: تمّ
      if (L < 3) continue; const pts = groups(0, L, sd.w, 1, sw === 1 ? 3.4 : 1.8, .8);
      for (const c of pts) ops.push({ id: oid(), level: 'L1', wall: w.id, kind: 'window', at: r2(c), w: sd.w, h: sd.h, sill: sd.sill, swing: null, hinge: 'left', entry: false }); }
  }
  const out = { ...doc, levels: [{ id: 'L1', name: 'الدور الأرضي', elevation: 0, height: 3.2 }], walls, openings: ops, labels: [], zones: [], fixtures: [], stairs: [], columns: [], dimensions: [], texts: [], entry: 's',
    roof: { ...(doc.roof || {}), parapet: PARAPET[P.pr ?? 1], overhang: 0 }, counters: { levels: 1, walls: walls.length, openings: ops.length } };
  return out;
}
/** تحقق ذاتي: يعيد قائمة مخالفات (فارغة = سليم). */
export function validateDoc(doc, floors) {
  const bad = []; const W = new Map((doc.walls || []).map(w => [w.id, w]));
  if (!(floors >= 1 && floors <= 3)) bad.push('floors');
  if ((doc.levels || []).length !== 1) bad.push('levels');
  // اتصال الجدران: كل طرف يلتقي بطرف آخر بالضبط (حلقة مغلقة)
  const key = p => p.x.toFixed(2) + ',' + p.y.toFixed(2), cnt = new Map();
  for (const w of W.values()) { if (Math.hypot(w.a.x - w.b.x, w.a.y - w.b.y) < .3) bad.push('zero:' + w.id); for (const p of [w.a, w.b]) cnt.set(key(p), (cnt.get(key(p)) || 0) + 1); }
  for (const [k, n] of cnt) if (n !== 2) bad.push('gap:' + k);
  // مضلع للتحقق من الواجهة الأمامية
  const poly = []; { const ws = [...W.values()]; let cur = ws[0], used = new Set([cur.id]); poly.push(cur.a); let p = cur.b; while (used.size < ws.length) { poly.push(p); const nx = ws.find(w => !used.has(w.id) && (key(w.a) === key(p) || key(w.b) === key(p))); if (!nx) break; used.add(nx.id); p = key(nx.a) === key(p) ? nx.b : nx.a; } }
  const inP = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
  const by = new Map();
  for (const o of doc.openings || []) {
    const w = W.get(o.wall); if (!w) { bad.push('orphan:' + o.id); continue; }
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (o.at - o.w / 2 < .2 - 1e-6 || o.at + o.w / 2 > L - .2 + 1e-6) bad.push('margin:' + o.id);
    if (o.sill < 0 || o.h <= 0 || o.sill + o.h > 2.72) bad.push('size:' + o.id);
    (by.get(o.wall) || by.set(o.wall, []).get(o.wall)).push(o);
  }
  for (const list of by.values()) { list.sort((a, b) => a.at - b.at); for (let i = 1; i < list.length; i++) if (list[i].at - list[i].w / 2 - (list[i - 1].at + list[i - 1].w / 2) < .3 - 1e-6) bad.push('overlap:' + list[i].id); }
  const ent = (doc.openings || []).filter(o => o.entry && /^door/.test(o.kind));
  if (ent.length !== 1) bad.push('entry-count:' + ent.length);
  for (const o of ent) { const w = W.get(o.wall); if (!w) continue; if (o.sill !== 0) bad.push('door-ground'); const mx = (w.a.x + w.b.x) / 2, my = (w.a.y + w.b.y) / 2;
    if (Math.abs(w.a.y - w.b.y) > .01 || inP(mx, my - .05) || !inP(mx, my + .05)) bad.push('entry-not-front'); }
  return bad;
}
