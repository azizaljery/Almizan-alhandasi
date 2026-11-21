// نواة المحرك المرجعي: شجرة تقسيم (guillotine) بحدود دنيا/مفضلة/قصوى مطلقة بالأمتار لكل فراغ.
// المكيّف لا يمدّد المخطط نسبيًا: يوزّع الطول المتاح على الفراغات حتى مفضَّلها، ثم يصبّ الفائض في «فراغات ماصّة» مفيدة
// (فناء، مخزن، شرفة)، ثم يرفع الغرف حتى حدّها الأقصى المهني؛ وما زاد عن مجموع الحدود القصوى يبقى ساحة خارج الكتلة.
// نقية: لا DOM ولا شبكة. الإحداثيات قانونية: x عبر الواجهة (0..W)، y من المدخل (0) إلى الخلف (D).

export const GRID = .05;
export const snap = v => Math.round(v / GRID) * GRID;
export const r2 = v => Math.round(v * 100) / 100;
const EPS = 1e-6;

// ------------------------------------------------------------------------------------------ بناء الشجرة
/** تسلسل أفقي (عرض الأبناء يتجمّع؛ العمق مشترك). */
export const X = (...k) => ({ t: 'x', k: k.flat().filter(Boolean) });
/** تسلسل رأسي من الواجهة إلى الخلف (عمق الأبناء يتجمّع؛ العرض مشترك). */
export const Y = (...k) => ({ t: 'y', k: k.flat().filter(Boolean) });
/**
 * ورقة (فراغ). w/h: [أدنى، مفضّل، أقصى] بالأمتار على محاور الجدران؛ sink: فراغ ماصّ للفائض (يأخذ قبل رفع الغرف نحو أقصاها).
 * props تنتقل إلى الغرفة الناتجة (type, name, kind, circ, trees, fenceH...).
 */
export const L = (id, w, h, props = {}) => ({ t: 'leaf', id, w: norm(w), h: norm(h), ...props });
const norm = a => { const [mn, pf = mn, mx = pf] = a; return [mn, Math.min(Math.max(pf, mn), mx), Math.max(mx, mn)]; };

// ------------------------------------------------------------------------------------------ الحدود المركبة
const memo = new WeakMap();
/** حدود العقدة: { w:[mn,pf,mx,sk], h:[...] } حيث sk حصة الفراغات الماصّة من (mx - pf). */
export function iv(n) {
  if (memo.has(n)) return memo.get(n);
  let out;
  if (n.t === 'leaf') {
    const sk = n.sink ? 1 : 0;
    out = { w: [...n.w, sk ? n.w[2] - n.w[1] : 0], h: [...n.h, sk ? n.h[2] - n.h[1] : 0] };
  } else {
    const kids = n.k.map(iv), along = n.t === 'x' ? 'w' : 'h', cross = n.t === 'x' ? 'h' : 'w';
    const a = [0, 0, 0, 0]; for (const c of kids) for (let i = 0; i < 4; i++) a[i] += c[along][i];
    const mn = Math.max(...kids.map(c => c[cross][0])), mx = Math.min(...kids.map(c => c[cross][2]));
    const pf = Math.min(Math.max(Math.max(...kids.map(c => c[cross][1])), mn), Math.max(mx, mn));
    const sk = Math.min(...kids.map(c => c[cross][3]));
    const bad = mn > mx + 1e-6;
    out = { [along]: a, [cross]: [mn, pf, Math.max(mx, mn), Math.min(sk, Math.max(mx, mn) - pf)], bad: bad || kids.some(c => c.bad) };
  }
  memo.set(n, out);
  return out;
}

/** يوزّع الطول L على فترات [mn,pf,mx,sk]: الأدنى، فالمفضَّل، فالماصّات، فبقية الغرف حتى أقصاها. يعيد { sizes, left, short }. */
export function fill(ivs, Ltot) {
  const sizes = ivs.map(i => i[0]); let rem = Ltot - sizes.reduce((a, b) => a + b, 0);
  if (rem < -1e-6) { const f = Ltot / sizes.reduce((a, b) => a + b, 0); return { sizes: sizes.map(s => s * f), left: 0, short: -rem }; }
  const tiers = [i => i[1] - i[0], i => Math.min(i[3], i[2] - i[1]), i => Math.max(0, i[2] - i[1] - Math.min(i[3], i[2] - i[1]))];
  for (const cap of tiers) {
    const c = ivs.map((i, j) => Math.max(0, Math.min(cap(i), i[2] - sizes[j]))), tot = c.reduce((a, b) => a + b, 0);
    if (tot <= 1e-9) continue;
    const take = Math.min(rem, tot);
    for (let j = 0; j < sizes.length; j++) sizes[j] += take * c[j] / tot;
    rem -= take; if (rem <= 1e-9) break;
  }
  return { sizes, left: Math.max(0, rem), short: 0 };
}

/**
 * يحلّ الشجرة في المستطيل [x0,y0,w,h]. يعيد { leaves:[{node,x0,y0,x1,y1}], viol } حيث viol مجموع تجاوز الحدود (م).
 * القطع تُقرَّب إلى شبكة 5 سم بالتراكم فيبقى الجاران على القطع نفسه.
 */
export function solve(root, w, h, x0 = 0, y0 = 0) {
  const leaves = []; let viol = 0;
  (function go(n, x0, y0, w, h) {
    if (n.t === 'leaf') {
      const dv = (v, [mn, , mx]) => Math.max(0, mn - v - 1e-6, v - mx - 1e-6);
      viol += dv(w, n.w) + dv(h, n.h);
      leaves.push({ node: n, x0, y0, x1: x0 + w, y1: y0 + h }); return;
    }
    const alongX = n.t === 'x', total = alongX ? w : h, ivs = n.k.map(c => iv(c)[alongX ? 'w' : 'h']);
    const f = fill(ivs, total); viol += f.short + f.left;
    let acc = 0, prev = 0;
    n.k.forEach((c, i) => {
      acc += f.sizes[i]; const cut = i === n.k.length - 1 ? total : snap(acc), size = cut - prev;
      if (alongX) go(c, x0 + prev, y0, size, h); else go(c, x0, y0 + prev, w, size);
      prev = cut;
    });
  })(root, x0, y0, w, h);
  return { leaves, viol };
}

/** يقيّد الغلاف المتاح بحدود الشجرة: [w,h] فعلي أو null إن لم يتسع. mode: 'pref' | 'max' | 'mid'. */
export function envelopeFor(root, availW, availH, mode = 'max') {
  const I = iv(root); if (I.bad) return null;
  if (availW < I.w[0] - 1e-6 || availH < I.h[0] - 1e-6) return null;
  const pick = (a, avail) => mode === 'pref' ? Math.min(avail, a[1]) : mode === 'mid' ? Math.min(avail, (a[1] + a[2]) / 2) : Math.min(avail, a[2]);
  return [snap(Math.min(availW, Math.max(I.w[0], pick(I.w, availW)))), snap(Math.min(availH, Math.max(I.h[0], pick(I.h, availH))))];
}

// ------------------------------------------------------------------------------------------ هندسة مشتركة
const opp = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' };
export const W_ = r => r.x1 - r.x0, H_ = r => r.y1 - r.y0, A_ = r => W_(r) * H_(r);
/** الحد المشترك بين مستطيلين متلامسين. */
export function sharedEdge(a, b) {
  for (const s of ['x0', 'x1', 'y0', 'y1']) {
    if (Math.abs(a[s] - b[opp[s]]) > 1e-3) continue;
    const ax = s[0] === 'x', from = Math.max(ax ? a.y0 : a.x0, ax ? b.y0 : b.x0), to = Math.min(ax ? a.y1 : a.x1, ax ? b.y1 : b.x1);
    if (to - from > 1e-3) return { axis: ax ? 'x' : 'y', at: a[s], from, to, side: s };
  }
  return null;
}
/** أضلاع الغرفة الملامسة لحدود الغلاف W×D أو لفراغ خارجي (قائمة مستطيلات). */
export function exposure(r, W, D, voids = []) {
  const out = [];
  if (r.y0 < EPS) out.push({ side: 'y0', len: W_(r), at: 0, from: r.x0, to: r.x1, axis: 'y' });
  if (r.y1 > D - EPS) out.push({ side: 'y1', len: W_(r), at: D, from: r.x0, to: r.x1, axis: 'y' });
  if (r.x0 < EPS) out.push({ side: 'x0', len: H_(r), at: 0, from: r.y0, to: r.y1, axis: 'x' });
  if (r.x1 > W - EPS) out.push({ side: 'x1', len: H_(r), at: W, from: r.y0, to: r.y1, axis: 'x' });
  for (const v of voids) { if (v === r) continue; const e = sharedEdge(r, v); if (e) out.push({ side: e.side, len: e.to - e.from, at: e.at, from: e.from, to: e.to, axis: e.axis, void: true }); }
  return out;
}

// ------------------------------------------------------------------------------------------ الأبواب
/**
 * يشتق الأبواب من روابط مطلوبة. link: { a, b, kind?, w?, bias?, entry? } بين معرّفي غرفتين متلامستين.
 * لكل جدار خط مسجَّل بالفتحات فلا يتداخل بابان. يعيد { doors, missing } حيث missing روابط لم تجد حدًا مشتركًا يتسع لها.
 */
export function deriveDoors(rooms, links, { W, D } = {}) {
  const byId = new Map(rooms.map(r => [r.id, r])), used = new Map(), doors = [], missing = [];
  const lineKey = (axis, at) => axis + ':' + Math.round(at * 100);
  const free = (axis, at, lo, hi) => !(used.get(lineKey(axis, at)) || []).some(([a, b]) => lo < b - 1e-3 && hi > a + 1e-3);
  const take = (axis, at, lo, hi) => { const k = lineKey(axis, at); (used.get(k) || used.set(k, []).get(k)).push([lo, hi]); };
  const place = (e, w, bias, edgeMin = .25) => {
    const span = e.to - e.from, half = w / 2, lo = e.from + edgeMin + half, hi = e.to - edgeMin - half;
    if (hi < lo - 1e-6) return null;
    const fr = bias === 'near' ? [.22, .5, .78] : bias === 'far' ? [.78, .5, .22] : bias === 'start' ? [.2, .35, .5, .65] : bias === 'end' ? [.8, .65, .5, .35] : [.5, .36, .64, .24, .76, .12, .88];
    for (const f of fr) { const p = snap(Math.min(hi, Math.max(lo, e.from + span * f))); if (free(e.axis, e.at, p - half - .05, p + half + .05)) { take(e.axis, e.at, p - half - .05, p + half + .05); return p; } }
    return null;
  };
  for (const l of links) {
    const a = byId.get(l.a); if (!a) { missing.push(l); continue; }
    const w = l.w ?? ({ arch: 1.6, door2: 1.6, slider: 2.2 }[l.kind] ?? .95);
    if (l.entry) {
      // باب خارجي: على ضلع الغلاف المطلوب (الواجهة y0 افتراضيًا)
      const sides = l.sides || (l.side ? [l.side] : ['y0', 'x0', 'x1', 'y1']);
      let done = false;
      for (const s of sides) {
        const ex = exposure(a, W, D).find(x => x.side === s); if (!ex || ex.len < w + .7) continue;
        const p = place({ axis: ex.axis, at: ex.at, from: ex.from, to: ex.to }, w, l.bias);
        if (p === null) continue;
        doors.push({ a: a.id, edge: { axis: ex.axis, at: ex.at, from: ex.from, to: ex.to }, pos: p, kind: l.kind || 'door', w, entry: true, ...(l.flags || {}) }); done = true; break;
      }
      if (!done) missing.push(l);
      continue;
    }
    const b = byId.get(l.b); if (!b) { missing.push(l); continue; }
    const e = sharedEdge(a, b); if (!e) { missing.push(l); continue; }
    let w2 = w; if (e.to - e.from < w2 + .5) w2 = Math.max(.75, e.to - e.from - .5);
    const p = place(e, w2, l.bias); if (p === null) { missing.push(l); continue; }
    doors.push({ a: a.id, b: b.id, edge: { axis: e.axis, at: e.at, from: e.from, to: e.to }, pos: p, kind: l.kind || (w2 >= 1.5 ? 'arch' : 'door'), w: w2, ...(l.flags || {}) });
  }
  return { doors, missing };
}

/** يضيف خاصية door (جهة الباب الرئيسي) لكل غرفة من أبوابها: يستعملها الأثاث لوضع السرير بعيدًا عن الباب. */
export function tagDoorSides(rooms, doors) {
  const byId = new Map(rooms.map(r => [r.id, r]));
  for (const d of doors) {
    const r = byId.get(d.a); if (!r || r.door) continue;
    const e = d.edge; r.door = e.axis === 'x' ? (Math.abs(r.x0 - e.at) < 1e-3 ? 'x0' : 'x1') : (Math.abs(r.y0 - e.at) < 1e-3 ? 'y0' : 'y1');
  }
}

/** تشخيص: أعمق عقدة متعارضة الحدود (للرسائل). */
export function badPath(n) {
  if (n.t === 'leaf') return null;
  for (const k of n.k) { const p = badPath(k); if (p) return p; }
  if (iv(n).bad) { const d = k => k.t === 'leaf' ? k.id : (k.t + '(' + k.k.map(d).join(',') + ')'); const I = iv(n); return n.t + ':' + n.k.map(k => { const q = iv(k); return d(k) + '[w' + q.w.slice(0, 3).map(x => +x.toFixed(1)) + ' h' + q.h.slice(0, 3).map(x => +x.toFixed(1)) + ']'; }).join(' '); }
  return null;
}
