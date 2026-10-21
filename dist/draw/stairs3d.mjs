// Stairs: pure layout (steps, landings, rails, stairwell hole, walking height) + a MeshBuilder emitter.
//
// Document stair {x, y, rot, w, run, kind: 'straight'|'L'|'U', flip}.
//   (x, y) is the middle of the FIRST riser line, the stair climbs along local +y (rot turns it clockwise,
//   like fixtures), `w` is the clear width and `run` the length of the footprint along the climb.
//   `steps` (optional) = the number of risers chosen by the generator (dist/stair-geometry.mjs); otherwise the fewest
//   risers not higher than MAX_RISER. The same layout is drawn in 2D (render2d), built in 3D and measured by plan-review.
import { P3 } from './meshbuilder.mjs';

// (الجولة العاشرة) أعلى قائمة 0.18 م — «قيمة تصميمية افتراضية للميزان» غير متحققة نظاميًا (dist/stair-geometry.mjs)
export const MAX_RISER = .18;

export function stairLayout(stair, rise) {
  const w = stair.w ?? 1.1, run = stair.run ?? 3.2, kind = stair.kind || 'straight', r = stair.rot || 0;
  const f = { x: Math.sin(r), y: Math.cos(r) }, q = { x: Math.cos(r), y: -Math.sin(r) };
  const side = stair.flip ? -1 : 1;
  const to = (a, b) => ({ x: stair.x + q.x * a + f.x * b, y: stair.y + q.y * a + f.y * b });
  const rect = (a0, a1, b0, b1) => [to(a0, b0), to(a1, b0), to(a1, b1), to(a0, b1)];
  const N = Number.isInteger(stair.steps) && stair.steps >= 3 ? stair.steps : Math.max(3, Math.ceil(rise / MAX_RISER - 1e-9)), riser = rise / N;   // N risers; N-1 steps; the last riser meets the floor above
  const steps = [];            // {poly, top, type}
  const flights = [];           // for rails and walking: {from:{a,b}, to:{a,b}, h0, h1}
  const hw = w / 2;
  let treadDepth = 0;
  if (kind === 'L' || kind === 'U') {
    const T = N - 1;
    if (kind === 'L') {
      const L1 = Math.max(w, run - w) , L2 = Math.max(w * 1.2, run * .55);
      const n1 = Math.max(1, Math.round((T - 1) * L1 / (L1 + L2))), n2 = Math.max(1, T - 1 - n1);
      const t1 = L1 / n1, t2 = L2 / n2;
      for (let i = 0; i < n1; i++) steps.push({ poly: rect(-hw, hw, i * t1, (i + 1) * t1), top: (i + 1) * riser, type: 'tread' });
      steps.push({ poly: rect(-hw, hw, L1, L1 + w), top: (n1 + 1) * riser, type: 'landing' });
      for (let i = 0; i < n2; i++) {
        const a0 = side * (hw + i * t2), a1 = side * (hw + (i + 1) * t2);
        steps.push({ poly: rect(Math.min(a0, a1), Math.max(a0, a1), L1, L1 + w), top: (n1 + 2 + i) * riser, type: 'tread' });
      }
      flights.push({ a0: 0, b0: 0, a1: 0, b1: L1, h0: riser, h1: n1 * riser, along: 'b' });
      flights.push({ a0: side * hw, b0: L1 + w / 2, a1: side * (hw + L2), b1: L1 + w / 2, h0: (n1 + 2) * riser, h1: (n1 + 1 + n2) * riser, along: 'a' });
      treadDepth = t1;
    } else {
      const gap = .1, L1 = Math.max(w, run - w), n1 = Math.max(1, Math.floor((T - 1) / 2)), n2 = Math.max(1, T - 1 - n1), t1 = L1 / n1, t2 = L1 / n2, off = side * (w + gap);
      for (let i = 0; i < n1; i++) steps.push({ poly: rect(-hw, hw, i * t1, (i + 1) * t1), top: (i + 1) * riser, type: 'tread' });
      const lA0 = Math.min(-hw, -hw + off), lA1 = Math.max(hw, hw + off);
      steps.push({ poly: rect(lA0, lA1, L1, L1 + w), top: (n1 + 1) * riser, type: 'landing' });
      for (let i = 0; i < n2; i++) steps.push({ poly: rect(-hw + off, hw + off, L1 - (i + 1) * t2, L1 - i * t2), top: (n1 + 2 + i) * riser, type: 'tread' });
      flights.push({ a0: 0, b0: 0, a1: 0, b1: L1, h0: riser, h1: n1 * riser, along: 'b' });
      flights.push({ a0: off, b0: L1, a1: off, b1: 0, h0: (n1 + 2) * riser, h1: (n1 + 1 + n2) * riser, along: 'b' });
      treadDepth = t1;
    }
  } else {
    const n = N - 1; treadDepth = run / n;
    for (let i = 0; i < n; i++) steps.push({ poly: rect(-hw, hw, i * treadDepth, (i + 1) * treadDepth), top: (i + 1) * riser, type: 'tread' });
    flights.push({ a0: 0, b0: 0, a1: 0, b1: run, h0: riser, h1: (N - 1) * riser, along: 'b' });
  }
  // footprint = union of step polygons (bounding hull used for the hole); hole excludes the last tread (flush with the upper floor)
  const hole = holeOf(steps, kind, { to, rect, w, run, side, N, treadDepth });
  return { kind, N, riser, steps, flights, w, run, rise, treadDepth, hole, footprint: steps.map(s => s.poly), toWorld: to, frame: { f, q } };
}

function holeOf(steps, kind, c) {
  // the stairwell hole is the bounding rectangle of all steps except the last one (which is level with the upper floor)
  const used = steps.slice(0, -1);
  const pts = used.flatMap(s => s.poly);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  if (kind === 'straight') { const last = steps[steps.length - 1]; const p = last ? last.poly : []; void p; }
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  if (kind === 'straight') {
    // oriented rectangle (not axis aligned): use the polygon of the used steps
    const first = used[0]?.poly, lastU = used[used.length - 1]?.poly;
    if (first && lastU) return [first[0], first[1], lastU[2], lastU[3]];
  }
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

/** Position of a plan point along the stair: {inside, t (0..1 up the stair), h (metres above the lower floor)} */
export function stairHeightAt(layout, p, grow = 0) {
  let best = null;
  const polys = layout.steps;
  for (let i = 0; i < polys.length; i++) {
    const s = polys[i];
    if (!insideQuad(p, s.poly, grow)) continue;
    // linear ramp inside the tread so that walking is smooth
    const prev = i ? polys[i - 1].top : 0, k = tread01(p, s.poly);
    const h = s.type === 'landing' ? s.top : prev + (s.top - prev) * k;
    best = { inside: true, t: Math.min(1, h / layout.rise), h, step: i };
  }
  return best || { inside: false, t: 0, h: 0, step: -1 };
}
function tread01(p, poly) { // 0 at the lower edge, 1 at the upper edge of a tread quad (a b c d: a-b lower edge)
  const a = poly[0], d = poly[3], dx = d.x - a.x, dy = d.y - a.y, l2 = dx * dx + dy * dy || 1;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
}
function insideQuad(p, q, grow) {
  let pos = 0, neg = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, dist = c / len;
    if (dist > -grow) pos++; if (dist < grow) neg++;
  }
  return pos === 4 || neg === 4;
}

/**
 * Emit the stair solid (monolithic steps from the floor), risers and a metal / wood balustrade into `b`.
 * keys: tread, riser, rail, post, glass. `E` = lower floor height, `rail` = false to skip the balustrade.
 */
export function emitStair(b, layout, E, keys = {}, { rail = true } = {}) {
  const k = { tread: 'stairTread', riser: 'stairRiser', rail: 'metal', post: 'metal', wood: 'f:woodMid', glass: 'glass', ...keys };
  for (const s of layout.steps) {
    // a monolithic block from the floor to the step top: sides (risers) in stone, tread on top
    b.prism({ top: k.tread, side: k.riser, bottom: 'none' }, s.poly, E, E + s.top);
  }
  if (!rail) return;
  const h = .92, post = .025;
  for (const fl of layout.flights) {
    const A = layout.toWorld(fl.a0, fl.b0), B = layout.toWorld(fl.a1, fl.b1);
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, hw = layout.w / 2;
    for (const sd of [-1, 1]) {
      const ofs = hw - .035;
      const a = { x: A.x + nx * ofs * sd, y: A.y + ny * ofs * sd }, bb = { x: B.x + nx * ofs * sd, y: B.y + ny * ofs * sd };
      const y0 = E + fl.h0 + h, y1 = E + fl.h1 + h;
      b.beam(k.wood, P3(a.x, a.y, y0), P3(bb.x, bb.y, y1), .05, .035);
      const n = Math.max(2, Math.ceil(len / .9));
      for (let i = 0; i <= n; i++) {
        const t = i / n, px = a.x + (bb.x - a.x) * t, py = a.y + (bb.y - a.y) * t, top = y0 + (y1 - y0) * t, base = E + fl.h0 + (fl.h1 - fl.h0) * t;
        b.beam(k.post, P3(px, py, base), P3(px, py, top), post, post);
      }
      b.beam(k.rail, P3(a.x, a.y, y0 - .3), P3(bb.x, bb.y, y1 - .3), .014, .014);
    }
  }
}

export default { stairLayout, stairHeightAt, emitStair, MAX_RISER };
