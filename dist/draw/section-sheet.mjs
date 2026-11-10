// لوحة القطاع المعماري (SVG مستقل، نقي): قطاع رأسي يمر بالدرج إن وُجد (موازيًا لاتجاه صعوده ليُظهر القلبات)،
// وإلا يمر بالصالة من الأمام إلى الخلف. يُظهر: البلاطات المقطوعة (الأرضية وكل سقف)، الجدران المقطوعة مصمتة
// والفتحات المقطوعة فيها، الدروة، الدرج المقطوع ودرابزينه، الجدران خلف مستوى القطع بفتحاتها (بخط رفيع)، أسماء
// الفراغات وارتفاعاتها الصافية، المناسيب، والأبعاد الرأسية والأفقية، ومسقطًا مفتاحيًا يبيّن خط القطع.
import { buildingModel } from './building-model.mjs';
import { sheetCanvas, titleStrip, levelMark, dimLine, fitScale, fmtLevel, mm, n1, LW, inkify } from './sheet-frame.mjs';
import { levelMarks } from './elevation-sheet.mjs';
import { fmtDim, approxTextWidth } from './plan-annot.mjs';
import { add, sub, mul, dot, cross, norm, pointInPolygon } from './geom.mjs';
import { checkStairs, stairCheckLines } from './stair-check.mjs';

const perpCCW = a => ({ x: -a.y, y: a.x });

/** تقاطعات الخط p = c0 + a·s مع أضلاع مضلع: قيم s. */
function crossings(poly, c0, a) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], e = sub(q, p), den = cross(a, e);
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(p, c0), s = cross(w, e) / den, t = cross(w, a) / den;
    if (t >= -1e-9 && t <= 1 + 1e-9) out.push(s);
  }
  return out;
}
/** فترات الخط داخل منطقة (مضلع بثقوب) معرّفة بدالة inside. */
function lineIntervals(polys, c0, a, inside) {
  const ss = [...new Set(polys.flatMap(p => crossings(p, c0, a)).map(s => Math.round(s * 1e6) / 1e6))].sort((p, q) => p - q), out = [];
  for (let i = 0; i + 1 < ss.length; i++) { const m = (ss[i] + ss[i + 1]) / 2; if (ss[i + 1] - ss[i] > 1e-4 && inside(add(c0, mul(a, m)))) out.push([ss[i], ss[i + 1]]); }
  return mergeIv(out, 1e-4);
}
function mergeIv(iv, gap) {
  const s = [...iv].sort((p, q) => p[0] - q[0]), out = [];
  for (const v of s) { const l = out[out.length - 1]; if (l && v[0] <= l[1] + gap) l[1] = Math.max(l[1], v[1]); else out.push([...v]); }
  return out;
}
function subtractIv(iv, cut) {
  let cur = iv.map(v => [...v]);
  for (const [c0, c1] of cut) cur = cur.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b]] : [...(c0 > a ? [[a, c0]] : []), ...(c1 < b ? [[c1, b]] : [])]));
  return cur.filter(v => v[1] - v[0] > .02);
}

/** يختار خط القطع: عبر الدرج (موازيًا للصعود) وإلا عبر الصالة من الأمام إلى الخلف. */
export function chooseCut(doc, model) {
  const L1 = model.levels[0];
  const st = model.levels.flatMap(L => L.stairs)[0];
  if (st) {
    const f = st.layout.frame.f, axisY = Math.abs(f.y) >= Math.abs(f.x);
    const a = axisY ? { x: 0, y: 1 } : { x: 1, y: 0 };
    return { through: 'stair', c0: { x: st.stair.x, y: st.stair.y }, a, stairId: st.stair.id, labelAr: 'قطاع أ-أ عبر الدرج' };
  }
  const hall = ['living', 'entrance', 'majlis', 'dining'].map(t => L1.spaces.find(s => s.type === t)).find(Boolean) || [...L1.spaces].sort((p, q) => q.area - p.area)[0];
  const front = [doc.entries?.[0], doc.entry, doc.streets?.[0]].find(Boolean) || 's';
  const a = front === 'e' || front === 'w' ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const p = hall ? hall.inside : { x: 0, y: 0 };
  return { through: 'hall', c0: p, a, spaceName: hall?.name || '', labelAr: 'قطاع أ-أ عبر ' + (hall?.name || 'المبنى') };
}

/** نموذج القطاع (بالمتر، u على خط القطع وz من ±0.00). */
export function sectionModel(doc, opts = {}) {
  const model = opts.model || buildingModel(doc, opts);
  const cut = opts.cut || chooseCut(doc, model);
  let a = norm(cut.a), d = { x: a.y, y: -a.x }; // d نحو الناظر؛ يمين الورقة = a
  const c0 = cut.c0;
  // في قطاع الدرج: يُختار اتجاه النظر بحيث تقع القلبات غير المقطوعة خلف مستوى القطع فتظهر
  if (cut.through === 'stair' && !opts.cut) {
    const st = model.levels.flatMap(L => L.stairs).find(x => x.stair.id === cut.stairId);
    const others = st ? st.layout.steps : []; // المقطوعة تقع على خط القطع (إزاحتها ≈ 0) فتُستبعد أدناه
    const cd = dot(c0, d), off = others.map(sp => dot(sp.poly.reduce((p, q) => add(p, mul(q, .25)), { x: 0, y: 0 }), d) - cd).filter(v => Math.abs(v) > .2);
    if (off.length && off.reduce((p, q) => p + q, 0) > 0) { a = mul(a, -1); d = mul(d, -1); }
  }
  const U = p => dot(p, a), cutDepth = dot(c0, d);
  const at = s => add(c0, mul(a, s)), uOf = s => U(at(s));
  const S = { cut: { ...cut, a, d, depth: cutDepth }, walls: [], slabs: [], stairCut: [], stairSeen: [], rails: [], beyond: [], rooms: [], levels: model.levels.map(L => ({ id: L.id, name: L.name, E: L.E, H: L.H })), model };
  const wallIv = []; // فترات الجدران المقطوعة لكل دور
  for (const L of model.levels) {
    const ivs = [];
    for (const seg of L.solids.segments) {
      const den = cross(seg.dir, a); if (Math.abs(den) < .2) continue; // جدار موازٍ لخط القطع
      // تقاطع محور الجدار مع خط القطع
      const w = sub(seg.a, c0), s = cross(w, seg.dir) / cross(a, seg.dir), t = cross(w, a) / cross(a, seg.dir);
      if (t < -1e-6 || t > seg.length + 1e-6) continue;
      const half = seg.t / 2 / Math.abs(den), uc = uOf(s), x = t;
      const ext = seg.extL !== seg.extR || seg.fence;
      const z0 = L.i === 0 ? (seg.fence || ext ? model.ground : -model.slab) : L.E;
      const top = seg.fence ? L.E + seg.h : L.E + seg.h + (seg.parapet ? model.parapet : 0);
      const o = seg.openings.find(q => x >= q.x0 - 1e-6 && x <= q.x1 + 1e-6);
      const pieces = o ? [[z0, L.E + o.z0], [L.E + o.z1, top]].filter(p => p[1] - p[0] > .01) : [[z0, top]];
      S.walls.push({ level: L.id, segId: seg.id, wallIds: seg.wallIds, u0: uc - half, u1: uc + half, uc, z0, z1: top, pieces, fence: seg.fence, parapet: seg.parapet, exterior: ext,
        opening: o ? { id: o.id, kind: o.kind, z0: L.E + o.z0, z1: L.E + o.z1 } : null });
      ivs.push([uc - half, uc + half]);
    }
    wallIv.push(ivs);
  }
  // الفراغات المقطوعة بكل دور (لأسمائها وللبلاطات وللجدران خلف القطع)
  const spaceIv = model.levels.map(L => L.spaces.map(sp => ({ sp, iv: lineIntervals([sp.polygon, ...sp.holes], c0, a, p => pointInPolygon(p, sp.polygon, 1e-9) && !sp.holes.some(h => pointInPolygon(p, h, 1e-9))).map(([s0, s1]) => [uOf(s0), uOf(s1)]) })).filter(x => x.iv.length));
  const holeIv = L => L.stairs.flatMap(st => lineIntervals([st.layout.hole], c0, a, p => pointInPolygon(p, st.layout.hole, 1e-9)).map(([s0, s1]) => [uOf(s0), uOf(s1)]));
  const extendOverWalls = (iv, li) => mergeIv(iv.map(([u0, u1]) => {
    const wl = wallIv[li] || [];
    const l = wl.find(w => Math.abs(w[1] - u0) < .06 || (w[0] <= u0 && w[1] >= u0)), r = wl.find(w => Math.abs(w[0] - u1) < .06 || (w[0] <= u1 && w[1] >= u1));
    return [l ? Math.min(u0, l[0]) : u0, r ? Math.max(u1, r[1]) : u1];
  }), .45);
  model.levels.forEach((L, i) => {
    const roofed = spaceIv[i].filter(x => !x.sp.open).flatMap(x => x.iv);
    if (i === 0) S.slabs.push({ kind: 'ground', level: L.id, z0: -model.slab, z1: 0, iv: extendOverWalls(roofed, 0) });
    // سقف هذا الدور = أرضية الدور التالي (مع الشرفات المكشوفة فوقه)، ناقص فتحة الدرج
    const next = model.levels[i + 1];
    let iv = extendOverWalls(roofed, i);
    if (next) iv = mergeIv([...iv, ...extendOverWalls(spaceIv[i + 1].filter(x => x.sp.type !== 'courtyard').flatMap(x => x.iv), i + 1)], .05);
    iv = subtractIv(iv, holeIv(L));
    S.slabs.push({ kind: next ? 'floor' : 'roof', level: L.id, z0: L.E + L.H - model.slab, z1: L.E + L.H, iv });
    for (const x of spaceIv[i]) for (const [u0, u1] of x.iv) S.rooms.push({ level: L.id, name: x.sp.name, type: x.sp.type, open: x.sp.open, u0, u1, E: L.E, clear: x.sp.open ? null : L.H - model.slab });
  });
  // الدرج: درجات مقطوعة ودرجات خلف القطع
  for (const L of model.levels) for (const st of L.stairs) {
    const lay = st.layout;
    for (const step of lay.steps) {
      const iv = lineIntervals([step.poly], c0, a, p => pointInPolygon(p, step.poly, 1e-9));
      const z1 = L.E + step.top, z0 = step.type === 'landing' ? z1 - .18 : z1 - lay.riser - .12;
      if (iv.length) for (const [s0, s1] of iv) S.stairCut.push({ stair: st.stair.id, level: L.id, type: step.type, u0: uOf(s0), u1: uOf(s1), z0, z1 });
      else {
        const us = step.poly.map(U), depth = dot(step.poly.reduce((p, q) => add(p, mul(q, .25)), { x: 0, y: 0 }), d);
        if (depth < cutDepth) S.stairSeen.push({ stair: st.stair.id, level: L.id, type: step.type, u0: Math.min(...us), u1: Math.max(...us), z0: z1 - (step.type === 'landing' ? .18 : lay.riser), z1 });
      }
    }
    const cutSteps = S.stairCut.filter(x => x.stair === st.stair.id && x.type === 'tread').sort((p, q) => p.z1 - q.z1);
    if (cutSteps.length > 1) S.rails.push(cutSteps.map(x => ({ u: (x.u0 + x.u1) / 2, z: x.z1 + .9 })));
  }
  // الجدران خلف مستوى القطع المقابلة للناظر داخل كل فراغ مقطوع، بفتحاتها
  model.levels.forEach((L, i) => {
    for (const x of spaceIv[i]) {
      for (const seg of L.solids.segments) {
        for (const [side, n, A, B] of [['L', seg.left, seg.corners.aL, seg.corners.bL], ['R', mul(seg.left, -1), seg.corners.aR, seg.corners.bR]]) {
          if ((side === 'L' ? seg.sideL : seg.sideR) !== x.sp) continue;
          if (dot(n, d) < .5) continue; // الوجه لا يقابل الناظر
          const depth = (dot(A, d) + dot(B, d)) / 2; if (depth >= cutDepth - .02) continue;
          for (const [u0, u1] of x.iv) {
            const fu0 = Math.max(u0, Math.min(U(A), U(B))), fu1 = Math.min(u1, Math.max(U(A), U(B)));
            if (fu1 - fu0 < .05) continue;
            const ops = seg.openings.map(o => { const p0 = U(add(seg.a, mul(seg.dir, o.x0))), p1 = U(add(seg.a, mul(seg.dir, o.x1))); return { id: o.id, kind: o.kind, u0: Math.max(fu0, Math.min(p0, p1)), u1: Math.min(fu1, Math.max(p0, p1)), z0: L.E + o.z0, z1: L.E + o.z1 }; }).filter(o => o.u1 - o.u0 > .05);
            // في الفراغ المكشوف (فناء) يظهر الجدار كاملًا حتى أعلى دروته؛ وفي المسقوف حتى بطن السقف
            const zTop = x.sp.open ? (seg.fence ? L.E + seg.h : L.E + seg.h + (seg.parapet ? model.parapet : 0)) : L.E + L.H - model.slab;
            S.beyond.push({ level: L.id, segId: seg.id, space: x.sp.name, open: x.sp.open, depth, u0: fu0, u1: fu1, z0: L.E, z1: zTop, openings: ops });
          }
        }
      }
    }
  });
  S.beyond.sort((p, q) => p.depth - q.depth);
  const us = [...S.walls.flatMap(w => [w.u0, w.u1]), ...S.slabs.flatMap(s => s.iv.flat())];
  S.extent = us.length ? { u0: Math.min(...us), u1: Math.max(...us), z0: model.ground, z1: Math.max(model.parapetTop, ...S.walls.map(w => w.z1)) } : null;
  return S;
}

/**
 * @param {object} doc
 * @param {{ sheet?, scale?, date?, fingerprint?, owner?, office?, sheetNo?, cut? }} opts
 * @returns {{ svg: string, meta: object }}
 */
export function sectionSheet(doc, opts = {}) {
  const S = sectionModel(doc, opts), model = S.model, ext = S.extent;
  const c = sheetCanvas({ sheet: opts.sheet, title: `${doc.title || ''} — ${S.cut.labelAr}`, cls: 'section-sheet' });
  const { out, txt, P } = c;
  const keyH = 78, top = { x0: P.x0, x1: P.x1, y0: P.y0, y1: P.y1 - mm(keyH) };
  const M = { top: 14, bottom: 34, left: 32, right: 46 };
  const wM = ext ? ext.u1 - ext.u0 : 1, hM = ext ? ext.z1 - ext.z0 : 1;
  const scale = opts.scale || fitScale(wM + 1, hM + .5, (top.x1 - top.x0) / 4 - M.left - M.right, (top.y1 - top.y0) / 4 - M.top - M.bottom);
  const k = mm(1000 / scale); c.k = k;
  const ox = top.x0 + mm(M.left) + ((top.x1 - top.x0 - mm(M.left + M.right)) - wM * k) / 2, oy = top.y0 + mm(M.top) + ((top.y1 - top.y0 - mm(M.top + M.bottom)) - hM * k) / 2;
  const X = u => ox + (u - ext.u0) * k, Z = z => oy + (ext.z1 - z) * k;
  const R = (u0, z0, u1, z1, attrs) => `<rect x="${n1(X(Math.min(u0, u1)))}" y="${n1(Z(Math.max(z0, z1)))}" width="${n1(Math.abs(u1 - u0) * k)}" height="${n1(Math.abs(z1 - z0) * k)}" ${attrs}/>`;
  const thin = `fill="#fff" stroke="#000" stroke-width="${LW.thin}"`, cutFill = `fill="#000" stroke="#000" stroke-width="${LW.heavy}"`;
  const meta = { scale, through: S.cut.through, cutWalls: S.walls.length, slabs: S.slabs.map(s => ({ kind: s.kind, level: s.level, z0: s.z0, z1: s.z1, spans: s.iv.length })), stairSteps: S.stairCut.length, stairSeen: S.stairSeen.length, beyond: S.beyond.length, rooms: [], cutOpenings: S.walls.filter(w => w.opening).map(w => w.opening.id), marks: [] };
  if (!ext) { out.push(txt((P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2, 'خط القطع لا يمر بجدران.', { size: mm(3) })); out.push('</svg>'); return { svg: inkify(out.join('\n')), meta }; }
  const g = ['<g class="section">'];
  // الأرض الطبيعية وتهشيرها
  const gx0 = X(ext.u0) - mm(10), gx1 = X(ext.u1) + mm(10), gy = Z(model.ground);
  for (let x = gx0; x < gx1; x += mm(2.2)) g.push(`<line x1="${n1(x)}" y1="${n1(gy + mm(2))}" x2="${n1(x + mm(1.6))}" y2="${n1(gy)}" stroke="#000" stroke-width="${LW.thin}"/>`);
  // الجدران خلف القطع (أبعد أولًا) بفتحاتها
  for (const b of S.beyond) {
    g.push(`<g class="beyond" data-seg="${b.segId}">` + R(b.u0, b.z0, b.u1, b.z1, `fill="#fff" stroke="#000" stroke-width="${LW.thin}"`));
    for (const o of b.openings) g.push(R(o.u0, o.z0, o.u1, o.z1, o.kind === 'arch' ? `fill="#eee" stroke="#000" stroke-width="${LW.thin}"` : /window|slider/.test(o.kind) ? `fill="#e8edf0" stroke="#000" stroke-width="${LW.thin}"` : thin));
    g.push('</g>');
  }
  // درجات خلف القطع
  for (const s of S.stairSeen) g.push(R(s.u0, s.z0, s.u1, s.z1, `fill="#fff" stroke="#000" stroke-width="${LW.thin}" class="stair-seen"`));
  // البلاطات المقطوعة (مصمتة رمادية داكنة)
  for (const s of S.slabs) for (const [u0, u1] of s.iv) g.push(R(u0, s.z0, u1, s.z1, `fill="#444" stroke="#000" stroke-width="${LW.thick}" class="slab" data-kind="${s.kind}"`));
  // الجدران المقطوعة
  for (const w of S.walls) {
    for (const [z0, z1] of w.pieces) g.push(R(w.u0, z0, w.u1, z1, (w.fence ? `fill="#fff" stroke="#000" stroke-width="${LW.thick}"` : cutFill) + ` class="wall-cut" data-seg="${w.segId}"`));
    if (w.opening) {
      const o = w.opening;
      if (/window/.test(o.kind)) { g.push(R(w.u0, o.z0, w.u1, o.z1, thin)); const m = (w.u0 + w.u1) / 2; g.push(`<line x1="${n1(X(m))}" y1="${n1(Z(o.z0))}" x2="${n1(X(m))}" y2="${n1(Z(o.z1))}" stroke="#000" stroke-width="${LW.medium}"/>`); }
      else g.push(`<line x1="${n1(X(w.u0))}" y1="${n1(Z(o.z1))}" x2="${n1(X(w.u1))}" y2="${n1(Z(o.z1))}" stroke="#000" stroke-width="${LW.thin}"/>`);
    }
    if (w.parapet) g.push(R(w.u0 - .03, w.z1, w.u1 + .03, w.z1 + model.coping, 'fill="#000"'));
  }
  // الدرج المقطوع ودرابزينه
  for (const s of S.stairCut) g.push(R(s.u0, s.z0, s.u1, s.z1, `fill="#000" stroke="#000" stroke-width="${LW.medium}" class="stair-cut"`));
  for (const r of S.rails) g.push(`<polyline points="${r.map(p => n1(X(p.u)) + ',' + n1(Z(p.z))).join(' ')}" fill="none" stroke="#000" stroke-width="${LW.thin}" class="rail"/>`);
  g.push(`<line x1="${n1(gx0)}" y1="${n1(gy)}" x2="${n1(gx1)}" y2="${n1(gy)}" stroke="#000" stroke-width="${LW.heavy}"/>`);
  g.push('</g>');
  out.push(...g);
  // أسماء الفراغات وارتفاعاتها الصافية
  const boxes = [];
  for (const r of S.rooms) {
    const wpx = (r.u1 - r.u0) * k - mm(2); if (wpx < mm(6)) continue;
    let size = mm(2.6); const tw = approxTextWidth(r.name, size); if (tw > wpx) size = Math.max(mm(1.7), size * wpx / tw);
    if (approxTextWidth(r.name, size) > wpx) continue;
    const x = X((r.u0 + r.u1) / 2), y = Z(r.E + 1.55);
    // اسم يتراكب مع اسم سبق رسمه (فراغان متداخلا المدى على خط القطع): يُترك حتى لا تتراكب النصوص
    { const w0 = approxTextWidth(r.name, size); if (boxes.some(q => Math.abs(q.x - x) < (q.w + w0) / 2 && Math.abs(q.y - y) < (q.h + size) / 2)) continue; }
    out.push(txt(x, y, r.name, { size, weight: 700, halo: true, cls: 'room-name' }));
    if (r.clear) { const t = 'ارتفاع صافٍ ' + fmtDim(r.clear); const s2 = Math.min(mm(2), size * .85); if (approxTextWidth(t, s2) <= wpx) out.push(txt(x, y + s2 * 1.4, t, { size: s2, halo: true })); }
    boxes.push({ x, y, w: approxTextWidth(r.name, size), h: size });
    meta.rooms.push(r.name);
  }
  // المناسيب يمينًا والأبعاد الرأسية يسارًا
  const marks = levelMarks(model); const mx0 = X(ext.u1) + mm(6); let lastY = Infinity, shift = 0;
  for (const m of [...marks].sort((p, q) => p.z - q.z)) { const y = Z(m.z); shift = lastY - y < mm(7.5) ? (shift ? 0 : mm(19)) : 0; lastY = y; levelMark(c, mx0 + shift, y, m.label, fmtLevel(m.z), { lineTo: X(ext.u1) + mm(1) }); meta.marks.push({ kind: m.kind, z: m.z }); }
  const zs = [...new Set(marks.map(m => Math.round(m.z * 1000) / 1000))].sort((p, q) => p - q);
  for (let i = 0; i + 1 < zs.length; i++) dimLine(c, Z(zs[i]), Z(zs[i + 1]), X(ext.u0) - mm(10), { vertical: true, text: fmtDim(zs[i + 1] - zs[i]), size: Math.abs(Z(zs[i]) - Z(zs[i + 1])) < mm(6) ? mm(1.8) : mm(2.1) });
  dimLine(c, Z(zs[0]), Z(zs[zs.length - 1]), X(ext.u0) - mm(20), { vertical: true, text: fmtDim(zs[zs.length - 1] - zs[0]) });
  // أبعاد أفقية: محاور الجدران المقطوعة في الدور الأرضي، ثم الإجمالي
  const L1w = S.walls.filter(w => w.level === model.levels[0].id && !w.fence).sort((p, q) => p.uc - q.uc);
  const ticks = []; for (const w of L1w) if (!ticks.length || w.uc - ticks[ticks.length - 1] > .3) ticks.push(w.uc);
  for (let i = 0; i + 1 < ticks.length; i++) { const a = X(ticks[i]), b = X(ticks[i + 1]); dimLine(c, a, b, gy + mm(7), { text: fmtDim(ticks[i + 1] - ticks[i]), side: 1, size: b - a < mm(9) ? mm(1.7) : mm(2.1) }); }
  if (L1w.length) dimLine(c, X(L1w[0].u0), X(L1w[L1w.length - 1].u1), gy + mm(14), { text: fmtDim(L1w[L1w.length - 1].u1 - L1w[0].u0), side: 1 });
  const tx = (X(ext.u0) + X(ext.u1)) / 2, ty = gy + mm(27);
  out.push(txt(tx, ty, S.cut.labelAr, { size: mm(3.6), weight: 700 }), `<line x1="${n1(tx - approxTextWidth(S.cut.labelAr, mm(3.6)) / 2)}" y1="${n1(ty + mm(1.2))}" x2="${n1(tx + approxTextWidth(S.cut.labelAr, mm(3.6)) / 2)}" y2="${n1(ty + mm(1.2))}" stroke="#000" stroke-width="${LW.medium}"/>`, txt(tx, ty + mm(5), `المقياس 1:${scale} · النظر نحو ${dirAr(S.cut.d, true)}`, { size: mm(2.2) }));
  // المسقط المفتاحي مع خط القطع
  keyPlan(c, doc, model, S, { x0: P.x0 + mm(4), x1: P.x0 + mm(4) + mm(110), y0: P.y1 - mm(keyH) + mm(4), y1: P.y1 - mm(2) });
  titleStrip(c, {
    doc, heading: 'قطاع معماري — ' + S.cut.labelAr.replace('قطاع ', ''), scaleText: `1:${scale}`, scaleK: k, sheetNo: opts.sheetNo || 'A-S1', date: opts.date, fingerprint: opts.fingerprint, owner: opts.owner, office: opts.office,
    rows: [['الأدوار · الارتفاع الكلي', `${model.levels.length} · ${fmtDim(model.parapetTop - model.ground)} م`]],
    legend: [
      [`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#000"/>`, 'جدار مقطوع'],
      [`<rect x="0" y="${mm(.8)}" width="${mm(7)}" height="${mm(1.6)}" fill="#444" stroke="#000" stroke-width="${LW.thick}"/>`, `بلاطة مقطوعة (${fmtDim(model.slab)} م افتراضًا)`],
      [`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#fff" stroke="#000" stroke-width="${LW.thin}"/>`, 'جدار/درجات خلف مستوى القطع'],
      [`<rect x="0" y="0" width="${mm(7)}" height="${mm(3)}" fill="#e8edf0" stroke="#000" stroke-width="${LW.thin}"/>`, 'نافذة خلف مستوى القطع'],
      [`<path d="M${mm(3.5)} ${mm(2.6)} L${mm(1.9)} ${mm(.4)} L${mm(5.1)} ${mm(.4)} Z" fill="#000"/>`, 'منسوب بالمتر من ±0.00'],
    ],
    notes: ['±0.00 = منسوب أرضية الدور الأرضي التشطيبية.', `سماكة البلاطات ${fmtDim(model.slab)} م والأرض الطبيعية ${fmtLevel(model.ground)} افتراضان (مطابقان للمجسم)، لا تصميم إنشائي.`, 'الأساسات والعزل وطبقات الأرضيات غير مرسومة في هذه المرحلة.', S.cut.through === 'stair' ? 'يمر القطع بقلبة الدرج الأولى موازيًا لاتجاه الصعود.' : 'لا يوجد درج؛ يمر القطع بالصالة من الأمام إلى الخلف.', ...stairNotes(doc)],
  });
  out.push('</svg>');
  meta.textOverlaps = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const p = boxes[i], q = boxes[j]; if (Math.abs(p.x - q.x) < (p.w + q.w) / 2 && Math.abs(p.y - q.y) < (p.h + q.h) / 2) meta.textOverlaps++; }
  return { svg: inkify(out.join('\n')), meta };
}

/** ملاحظات فحص الدرج (SBC 201 §1011) على لوحة القطاع. */
function stairNotes(doc) {
  if (!doc.stairs?.length) return [];
  const r = checkStairs(doc), bad = stairCheckLines(r).filter(l => !l.includes('غير متحقق'));
  const s0 = r.stairs[0];
  return [`الدرج: ${s0.N} قائمة × ${Math.round(s0.riserM * 1000)} مم، نائمة ${Math.round(s0.treadM * 1000)} مم، عرض ${s0.widthM.toFixed(2)} م.`, ...(bad.length ? bad : ['أبعاد الدرج تحقق الأحكام العامة لـ SBC 201 §1011.']), 'استثناءات المساكن في SBC 201 غير متحقق منها؛ ارتفاع السقف فوق الدرج لم يُقس.'];
}

const dirAr = (v, toward) => { const ax = Math.abs(v.x) > Math.abs(v.y); const s = ax ? (v.x > 0 ? 'الشرق' : 'الغرب') : (v.y > 0 ? 'الشمال' : 'الجنوب'); if (!toward) return s; const opp = { 'الشرق': 'الغرب', 'الغرب': 'الشرق', 'الشمال': 'الجنوب', 'الجنوب': 'الشمال' }; return opp[s] + ' (محاور المخطط)'; };

/** مسقط مفتاحي صغير: محيط كل دور وخط القطع بسهمَي اتجاه النظر. */
function keyPlan(c, doc, model, S, box) {
  const { out, txt } = c;
  const outlines = model.levels.flatMap((L, i) => L.analysis.outlines.map(o => ({ i, poly: o.polygon })));
  const pts = [...outlines.flatMap(o => o.poly), ...(doc.plot?.polygon || [])]; if (!pts.length) return;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = Math.min((box.x1 - box.x0 - mm(16)) / Math.max(1, x1 - x0), (box.y1 - box.y0 - mm(16)) / Math.max(1, y1 - y0));
  const X = x => box.x0 + mm(8) + (x - x0) * s, Y = y => box.y0 + mm(10) + (y1 - y) * s;
  out.push(`<g class="key-plan">`, txt((box.x0 + box.x1) / 2, box.y0 + mm(3), 'مسقط مفتاحي — موضع القطع', { size: mm(2.4), weight: 700 }));
  if (doc.plot?.polygon?.length) out.push(`<polygon points="${doc.plot.polygon.map(p => n1(X(p.x)) + ',' + n1(Y(p.y))).join(' ')}" fill="none" stroke="#000" stroke-width="${LW.thin}" stroke-dasharray="${n1(mm(2))} ${n1(mm(1))}"/>`);
  for (const o of outlines.filter(o => o.i)) out.push(`<polygon points="${o.poly.map(p => n1(X(p.x)) + ',' + n1(Y(p.y))).join(' ')}" fill="none" stroke="#000" stroke-width="${LW.thin}" stroke-dasharray="${n1(mm(1))} ${n1(mm(.6))}"/>`);
  for (const w of model.levels[0].solids.polygons) out.push(`<polygon points="${w.poly.map(p => n1(X(p.x)) + ',' + n1(Y(p.y))).join(' ')}" fill="#000" stroke="#000" stroke-width="${LW.thin}"/>`); // جدران الدور الأرضي
  // خط القطع عبر حدود الرسم
  const a = S.cut.a, d = S.cut.d, c0 = S.cut.c0, ss = pts.map(p => dot(sub(p, c0), a)), sMin = Math.min(...ss) - 1.5, sMax = Math.max(...ss) + 1.5;
  const A = add(c0, mul(a, sMin)), B = add(c0, mul(a, sMax));
  out.push(`<line class="cut-line" x1="${n1(X(A.x))}" y1="${n1(Y(A.y))}" x2="${n1(X(B.x))}" y2="${n1(Y(B.y))}" stroke="#000" stroke-width="${LW.medium}" stroke-dasharray="${n1(mm(4))} ${n1(mm(1))} ${n1(mm(.6))} ${n1(mm(1))}"/>`);
  for (const P0 of [A, B]) {
    const tip = add(P0, mul(d, -1.6)), px = X(P0.x), py = Y(P0.y), tx = X(tip.x), ty = Y(tip.y), ang = Math.atan2(ty - py, tx - px);
    out.push(`<line x1="${n1(px)}" y1="${n1(py)}" x2="${n1(tx)}" y2="${n1(ty)}" stroke="#000" stroke-width="${LW.thick}"/>`, `<path d="M${n1(tx)} ${n1(ty)} L${n1(tx - mm(1.8) * Math.cos(ang - .45))} ${n1(ty - mm(1.8) * Math.sin(ang - .45))} L${n1(tx - mm(1.8) * Math.cos(ang + .45))} ${n1(ty - mm(1.8) * Math.sin(ang + .45))} Z" fill="#000"/>`, txt(X(add(P0, mul(d, -2.4)).x), Y(add(P0, mul(d, -2.4)).y) + mm(1.1), 'أ', { size: mm(3.2), weight: 700, halo: true, cls: 'cut-label' }));
  }
  out.push('</g>');
}

export default { chooseCut, sectionModel, sectionSheet };
