// تحويل المستند للقوالب النجدية (مسموح من المالك): الفتحات (حجم/عدد/توزيع)، المدخل (موضع/نوع/ثانٍ)، الجدران (سماكة، بروز/ارتداد/أجنحة)، الأدوار.
// لا يعدّل المستند الأصلي. كل المفاتيح اختيارات منفصلة مستقلة فيصح أي دمج بينها.
import { resolveTemplate } from '../../templates.mjs';
import { facadeGeometry } from '../../../facade-styles.mjs';
import { templates } from './list.mjs';

const clone = d => JSON.parse(JSON.stringify(d)), near = (a, b, e = .03) => Math.abs(a - b) < e, r2 = v => Math.round(v * 100) / 100;
const SIDES = ['s', 'n', 'e', 'w'], HF = { s: p => p.x, n: p => -p.x, e: p => p.y, w: p => -p.y };
const horiz = w => near(w.a.y, w.b.y), vert = w => near(w.a.x, w.b.x), wlen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
const axisOf = w => (horiz(w) ? 'x' : 'y'), sgnOf = w => (w.b[axisOf(w)] >= w.a[axisOf(w)] ? 1 : -1);
const coordAt = (w, at) => w.a[axisOf(w)] + sgnOf(w) * at, atOf = (w, c) => sgnOf(w) * (c - w.a[axisOf(w)]);
const DOORS = { 1: { w: 1.1, h: 2.2, kind: 'door' }, 2: { w: 1.6, h: 2.4, kind: 'door2' }, 3: { w: 2.0, h: 2.6, kind: 'door2' } };
// أنظمة النوافذ: 1 كوّات عالية صغيرة، 2 مثقوبة منتظمة، 3 أزواج رأسية ضيقة، 4 نوافذ مجلس عريضة، 5 شريط عالٍ
const SCH = [null,
  { w: .45, h: .75, sill: 1.85, P: 1.5, kind: 'window' },
  { w: 1.0, h: 1.35, sill: .95, P: 2.6, kind: 'window' },
  { w: .55, h: 1.7, sill: .8, P: 3.4, kind: 'window', group: 2, gap: .3 },
  { w: 2.2, h: 1.5, sill: .8, P: 4.6, kind: 'window2' },
  { w: 1.7, h: .55, sill: 2.2, P: 2.4, kind: 'window2' }];
const SIDE_SCH = { 1: 1, 2: 2, 3: 3, 4: 2, 5: 1 };

function extIds(d) { const G = facadeGeometry(d), out = {}; for (const s of SIDES) out[s] = G.sides[s].pieces.filter(p => p.li === 0); return out; }

/** يقسم جدارًا أفقيًا W عند [xs,xe] ويزيح المقطع الأوسط بمقدار dy مع وصلات وتمديد الجدران الملاقية. يعيد معرّف المقطع الأوسط. */
function shiftSeg(d, W, xs, xe, dy, tag) {
  if (W.a.x > W.b.x) { const t0 = W.a; W.a = W.b; W.b = t0; }
  const y0 = W.a.y, xa = W.a.x, xb = W.b.x, t = W.t, lvl = W.level;
  xs = Math.max(xa, xs); xe = Math.min(xb, xe);
  const hasL = xs > xa + .01, hasR = xe < xb - .01, moved = new Set();
  for (const o of d.walls) { if (o === W || !vert(o)) continue;
    for (const k of ['a', 'b']) if (near(o[k].y, y0, .02) && o[k].x >= xs - .02 && o[k].x <= xe + .02) { o[k] = { x: o[k].x, y: y0 + dy }; moved.add(r2(o[k].x)); } }
  const mk = (id, ax, ay, bx, by) => ({ id, level: lvl, a: { x: ax, y: ay }, b: { x: bx, y: by }, t, h: null, kind: 'wall' });
  const add = [mk('nj' + tag + 'm', xs, y0 + dy, xe, y0 + dy)];
  if (hasL) W.b = { x: xs, y: y0 }; else d.walls.splice(d.walls.indexOf(W), 1);
  if (hasR) add.push(mk('nj' + tag + 'r', xe, y0, xb, y0));
  const conn = x => (dy > 0 || !moved.has(r2(x))) ? [mk('nj' + tag + 'c' + Math.round(x * 10), x, y0, x, y0 + dy)] : [];
  if (hasL) add.push(...conn(xs)); if (hasR) add.push(...conn(xe));
  d.walls.push(...add); return 'nj' + tag + 'm';
}

/** مواضع التقاء جدران أخرى بجدار w: مجالات at المحجوزة. */
function junctions(d, w, pad = .3) { const out = [];
  for (const o of d.walls) { if (o === w) continue; for (const k of ['a', 'b']) { const p = o[k]; const onSeg = horiz(w) ? near(p.y, w.a.y, .06) && p.x >= Math.min(w.a.x, w.b.x) - .06 && p.x <= Math.max(w.a.x, w.b.x) + .06 : near(p.x, w.a.x, .06) && p.y >= Math.min(w.a.y, w.b.y) - .06 && p.y <= Math.max(w.a.y, w.b.y) + .06;
    if (onSeg) { const at = atOf(w, horiz(w) ? p.x : p.y); out.push([at - o.t / 2 - pad, at + o.t / 2 + pad]); } } } return out; }

export function docTransform(doc, q) {
  const tpl = resolveTemplate(templates, q); if (!tpl) return doc;
  let nid = 0; const P = tpl.p, d = clone(doc), V = (k, def = 0) => (k in P ? P[k] : def);
  if ((d.entry || 's') !== 's' || !d.walls?.length) return doc;
  if (V('flr') && !q.get('floors')) q.set('floors', String(V('flr')));
  const L1 = d.levels?.[0]?.id || 'L1';
  // ───── الجدران: أجنحة/بروز/ارتداد في الواجهة الأمامية ─────
  const entryOp = d.openings.find(o => o.entry && d.walls.find(w => w.id === o.wall && horiz(w)));
  let W = entryOp ? d.walls.find(w => w.id === entryOp.wall) : null;
  if (!W) { const ys = d.walls.filter(horiz).map(w => w.a.y), y0 = Math.min(...ys); W = d.walls.filter(w => horiz(w) && near(w.a.y, y0)).sort((a, b) => wlen(b) - wlen(a))[0]; }
  if (!W) return doc;
  const bay = V('bay'), xa = Math.min(W.a.x, W.b.x), xb = Math.max(W.a.x, W.b.x), Lw = xb - xa;
  const frontWallIds = new Set([W.id]);
  let mainRange = [xa, xb];
  // أزل كل فتحات جدار الواجهة الأمامية (تُعاد عند الحاجة)
  const keepFront = bay === 0 && V('epos') === 0 && V('etyp') === 0 && !V('e2');
  const frontOps = d.openings.filter(o => o.wall === W.id), origEntry = frontOps.filter(o => o.entry);
  if (bay && Lw > 6) {
    const sn = (x) => { // التصاق بأقرب جدار عمودي يلاقي الخط
      const c = d.walls.filter(w => vert(w) && (near(w.a.y, W.a.y, .02) || near(w.b.y, W.a.y, .02))).map(w => w.a.x); let best = x, bd = 1.0; for (const cx of c) if (Math.abs(cx - x) < bd && cx > xa + 1.2 && cx < xb - 1.2) { best = cx; bd = Math.abs(cx - x); } return best; };
    d.openings = d.openings.filter(o => o.wall !== W.id); const y0 = W.a.y, id0 = W.id;
    if (bay === 1) { const xs = sn(xa + Lw * .32), xe = sn(xa + Lw * .68); const mid = shiftSeg(d, W, xs, xe, -.9, 'a'); frontWallIds.add(mid); mainRange = [xs, xe]; }
    else if (bay === 2) { const xs = sn(xa + Lw * .36), xe = sn(xa + Lw * .64); const mid = shiftSeg(d, W, xs, xe, 1.3, 'a'); frontWallIds.add(mid); mainRange = [xs, xe]; }
    else if (bay === 3) { const xe1 = sn(xa + Lw * .24), xs2 = sn(xa + Lw * .76);
      const m1 = shiftSeg(d, d.walls.find(w => w.id === id0), xa, xe1, -.9, 'a'); const R = d.walls.find(w => horiz(w) && near(w.a.y, y0, .02) && Math.max(w.a.x, w.b.x) >= xb - .02 && Math.min(w.a.x, w.b.x) >= xe1 - .02) || d.walls.find(w => w.id === id0);
      const m2 = shiftSeg(d, R, xs2, xb, -.9, 'b'); frontWallIds.add(m1); frontWallIds.add(m2); mainRange = [xe1, xs2]; }
  }
  // ───── المدخل ─────
  const ed = V('etyp'), ep = bay && !V('epos') ? 1 : V('epos');
  const front = () => extIds(d).s;                    // قطع الواجهة الأمامية الحالية
  const wallsById = () => new Map(d.walls.map(w => [w.id, w]));
  if (!keepFront) {
    // أزل الفتحات القديمة من كل جدران الواجهة الأمامية (أبواب ونوافذ)
    const fids = new Set(front().flatMap(p => p.wallIds)); const protectedOps = [];
    const spec0 = origEntry[0] ? { w: origEntry[0].w, h: origEntry[0].h || 2.1, kind: origEntry[0].kind } : DOORS[1];
    d.openings = d.openings.filter(o => !fids.has(o.wall));
    const spec = ed ? DOORS[ed] : spec0;
    const WB = wallsById(); const cand = [...fids].map(i => WB.get(i)).filter(w => w && horiz(w));
    // مقطع المدخل الرئيسي: ضمن mainRange إن وُجد بروز/ارتداد وإلا أطول جدار
    let seg = bay ? cand.filter(w => { const m = (w.a.x + w.b.x) / 2; return m >= mainRange[0] - .01 && m <= mainRange[1] + .01; }).sort((a, b) => wlen(b) - wlen(a))[0] : null;
    const longest = cand.sort((a, b) => wlen(b) - wlen(a))[0]; seg = seg || longest;
    const place = (w, frac, sp, entry) => { const len = wlen(w), mg = sp.w / 2 + .5; if (len < sp.w + 1.0) return null; const tgt = Math.max(mg, Math.min(len - mg, len * frac)), bl = [...junctions(d, w, sp.w / 2 + .12), ...d.openings.filter(o => o.wall === w.id).map(o => [o.at - o.w / 2 - sp.w / 2 - .3, o.at + o.w / 2 + sp.w / 2 + .3])];
      let at = null; for (let k = 0; k <= len * 20 && at === null; k++) for (const sg of k ? [1, -1] : [1]) { const c = tgt + sg * k * .05; if (c >= mg && c <= len - mg && !bl.some(([x, y]) => c > x && c < y)) { at = c; break; } }
      if (at === null) return null;
      const o = { id: 'nj' + (++nid) + (entry ? 'd' : 'x'), level: L1, wall: w.id, kind: sp.kind, at: r2(at), w: sp.w, h: sp.h, sill: 0, swing: 'in', hinge: 'left', entry }; d.openings.push(o); return o; };
    const frac = [.5, .5, .27, .73, .13][Math.min(4, ep)];
    let main = place(seg, bay ? (ep === 2 ? .3 : ep === 3 ? .7 : .5) : frac, spec, true);
    for (const sp2 of [spec, DOORS[2], DOORS[1]]) for (const w of [seg, ...cand.filter(w => w !== seg)]) { if (main) break; main = place(w, w === seg ? .5 : frac, sp2, true); if (main) seg = w; }
    if (V('e2') && main) { const sd = DOORS[1], others = cand.filter(w => w !== seg); let done = false;
      for (const w of others) if (wlen(w) > sd.w + 1.6) { place(w, .5, sd, true); done = true; break; }
      if (!done) { const len = wlen(seg), o = place(seg, main.at < len / 2 ? .86 : .14, sd, true); if (o && Math.abs(o.at - main.at) < main.w / 2 + sd.w / 2 + 1.2) d.openings.pop(); } }
  }
  // ───── نوافذ ─────
  const scheme = V('owin') || (bay ? 2 : 0);
  const WB2 = wallsById();
  const G = extIds(d);
  if (scheme) for (const side of SIDES) {
    const sc0 = SCH[scheme], sc = side === 's' ? sc0 : { ...SCH[SIDE_SCH[scheme]], P: SCH[SIDE_SCH[scheme]].P * 1.3 };
    for (const pc of G[side]) for (const wid of pc.wallIds) {
      const w = WB2.get(wid); if (!w) continue;
      // أزل النوافذ القديمة على هذا الجدار
      d.openings = d.openings.filter(o => !(o.wall === wid && /^window/.test(o.kind)));
      const len = wlen(w), a0 = 0, a1 = len; if (len < 1.2) continue;
      const blocked = [[-9, .45], [len - .45, len + 9]];
      for (const o of d.openings) if (o.wall === wid) blocked.push([o.at - o.w / 2 - .3, o.at + o.w / 2 + .3]);
      blocked.push(...junctions(d, w));
      blocked.sort((x, y) => x[0] - y[0]);
      const free = []; let cur = a0; for (const [b0, b1] of blocked) { if (b0 > cur) free.push([cur, Math.min(b0, a1)]); cur = Math.max(cur, b1); } if (cur < a1) free.push([cur, a1]);
      const gw = sc.group ? sc.w * sc.group + sc.gap * (sc.group - 1) : sc.w;
      for (const [f0, f1] of free) { const Lf = f1 - f0; if (Lf < gw + .1) continue; let k = Math.max(1, Math.round(Lf / sc.P)); while (k > 1 && Lf / k < gw + .5) k--;
        const sp = Lf / k;
        for (let i = 0; i < k; i++) { const c = f0 + sp * (i + .5);
          for (let g = 0; g < (sc.group || 1); g++) { const at = c + (g - ((sc.group || 1) - 1) / 2) * (sc.w + (sc.gap || 0));
            d.openings.push({ id: 'nj' + (++nid) + 'w', level: L1, wall: wid, kind: sc.kind, at: r2(at), w: sc.w, h: sc.h, sill: sc.sill, swing: null, hinge: 'left', entry: false }); } } }
    }
  }
  // احذف أي نافذة مولَّدة لم تقع على جهة خارجية (جزء داخلي من جدار)
  try { const placed = new Set(facadeGeometry(d).exteriorOpenings); d.openings = d.openings.filter(o => !/^nj\d+w$/.test(o.id) || placed.has(o.id)); } catch {}
  // ───── سماكة الجدران الخارجية ─────
  const wt = [0, .4, .55][V('wt')];
  if (wt) { const ids = new Set(Object.values(extIds(d)).flat().flatMap(p => p.wallIds)); for (const w of d.walls) if (ids.has(w.id)) w.t = Math.max(w.t || 0, wt); }
  if (d.counters) { d.counters.walls = d.walls.length; d.counters.openings = d.openings.length; }
  return d;
}

/** تحقق ذاتي: يعيد مصفوفة رسائل مخالفات (فارغة = صالح). base = المستند الأصلي (لتجاهل مخالفات موروثة). */
export function validateDoc(doc, base, q) {
  const errs = [], WB = new Map(doc.walls.map(w => [w.id, w])), baseOps = new Set((base?.openings || []).map(o => o.id));
  const n = Number(q?.get?.('floors') || (doc.levels || []).length || 1); if (n < 1 || n > 3) errs.push('floors ' + n);
  // اتصال الجدران
  for (const w of doc.walls) for (const k of ['a', 'b']) { const p = w[k]; let ok = false;
    for (const o of doc.walls) { if (o === w) continue; const ax = o.a.x, ay = o.a.y, bx = o.b.x, by = o.b.y, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2));
      if (Math.hypot(ax + t * dx - p.x, ay + t * dy - p.y) < .03) { ok = true; break; } }
    if (!ok) errs.push(`جدار ${w.id} طرفه ${k} غير متصل`); }
  const byWall = new Map(); for (const o of doc.openings) { if (!byWall.has(o.wall)) byWall.set(o.wall, []); byWall.get(o.wall).push(o); }
  for (const [wid, ops] of byWall) { const w = WB.get(wid); if (!w) { errs.push('فتحة على جدار مفقود ' + wid); continue; } const len = wlen(w);
    ops.sort((a, b) => a.at - b.at);
    ops.forEach((o, i) => { const isNew = !baseOps.has(o.id), mg = isNew ? .2 : 0;
      if (o.at - o.w / 2 < mg - 1e-6 || o.at + o.w / 2 > len - mg + 1e-6) errs.push(`فتحة ${o.id} خارج حدود/هامش الجدار ${wid}`);
      if (i && o.at - o.w / 2 < ops[i - 1].at + ops[i - 1].w / 2 + .05 && (isNew || !baseOps.has(ops[i - 1].id))) errs.push(`تقاطع فتحتين ${ops[i - 1].id}/${o.id}`);
      if (/^door|arch/.test(o.kind) && (o.sill || 0) > 0) errs.push('باب لا يصل الأرض ' + o.id);
      if ((o.sill || 0) + (o.h || 0) > 3.1) errs.push('فتحة أعلى من الدور ' + o.id);
      if (isNew) for (const x of doc.walls) { if (x === w) continue; for (const k of ['a', 'b']) { const p = x[k]; const on = horiz(w) ? near(p.y, w.a.y, .06) && p.x > Math.min(w.a.x, w.b.x) + .06 && p.x < Math.max(w.a.x, w.b.x) - .06 : near(p.x, w.a.x, .06) && p.y > Math.min(w.a.y, w.b.y) + .06 && p.y < Math.max(w.a.y, w.b.y) - .06;
        if (on && Math.abs(atOf(w, horiz(w) ? p.x : p.y) - o.at) < o.w / 2 + .1) errs.push(`فتحة ${o.id} تقطع جدارًا ملاقيًا ${x.id}`); } } }); }
  // وضع الفتحات الخارجية + باب رئيسي في الواجهة الأمامية
  let G; try { G = facadeGeometry(doc); } catch (e) { errs.push('facadeGeometry ' + e.message); return errs; }
  const placed = new Set(G.exteriorOpenings), extWalls = new Set(SIDES.flatMap(s => G.sides[s].pieces.flatMap(p => p.wallIds)));
  for (const o of doc.openings) if (extWalls.has(o.wall) && !placed.has(o.id) && !baseOps.has(o.id)) errs.push('فتحة خارجية لم تُوضع ' + o.id);
  const fe = G.sides.s.pieces.flatMap(p => p.openings).filter(o => o.entry && o.z0 <= .46);
  if (!fe.length) errs.push('لا باب رئيسي على الواجهة الأمامية');
  // لا فتحة أصغر من الجدار الحامل لها بعد الإزاحة
  return errs;
}
