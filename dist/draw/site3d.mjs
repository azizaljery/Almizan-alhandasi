// The plot around the building: ground, paving, boundary wall with gates, street, trees, shrubs, a parked car.
import { MeshBuilder, P3 } from './meshbuilder.mjs';
import { buildFixture, fixtureMatrix } from './fixtures3d.mjs';
import { ccw, insetPolygon, bounds as boundsOf, pointInPolygon, signedArea, norm, sub, add, mul, dot, dist } from './geom.mjs';

const ENTRY_VEC = { s: { x: 0, y: -1 }, n: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };

export function buildSite(THREE, doc, lib, ctx) {
  const g0 = ctx.y; // ground height
  const B = new MeshBuilder(THREE);
  const out = { gates: [], parking: null, trees: 0, entryEdge: null, path: null, plotBounds: null, street: null };
  const plot = doc.plot?.polygon?.length >= 3 ? ccw(doc.plot.polygon) : null;
  const outline = ctx.outline;
  const bb = boundsOf(plot || outline || [{ x: 0, y: 0 }]);
  out.plotBounds = bb;
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, size = 2600; // far beyond the fog (ends at 420 m): the ground has no visible edge, it dissolves into the horizon colour
  // terrain
  B.flatPoly('terrain', [{ x: cx - size / 2, y: cy - size / 2 }, { x: cx + size / 2, y: cy - size / 2 }, { x: cx + size / 2, y: cy + size / 2 }, { x: cx - size / 2, y: cy + size / 2 }], [], g0 - .12, 1, p => [p.x / 3, -p.y / 3]);
  const R = seed => { let a = seed >>> 0 || 1; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
  const rnd = R((doc.title || 'x').length * 977 + (doc.walls?.length || 1) * 31);

  if (!plot) {
    // no plot: a paved apron + lawn around the building so it does not float on sand
    if (outline) {
      const lawn = insetPolygon(ccw(outline), -5, { grow: true });
      if (lawn) B.flatPoly('grass', lawn, [], g0 - .04, 1);
      const apron = insetPolygon(ccw(outline), -1.0, { grow: true });
      if (apron) B.flatPoly('paving', apron, [ccw(outline)], g0, 1);
    }
    return finish(B, THREE, lib, out, g0);
  }

  // ---- lawn + paving ring -------------------------------------------------------------------------------
  B.flatPoly('grass', plot, [], g0 - .05, 1);
  const buildingPoly = outline ? ccw(outline) : null;
  let ring = null;
  if (buildingPoly) {
    ring = insetPolygon(buildingPoly, -.9, { grow: true });
    if (ring) B.flatPoly('paving', ring, [buildingPoly], g0 + .004, 1, p => [p.x, -p.y]);
  }

  // ---- entry edge & gates -------------------------------------------------------------------------------
  const vec = ENTRY_VEC[doc.entry] || (ctx.entryNormal ? norm(ctx.entryNormal) : ENTRY_VEC.s);
  let best = -1, entryEdge = 0;
  plot.forEach((p, i) => {
    const q = plot[(i + 1) % plot.length], len = dist(p, q), d = norm(sub(q, p)), n = { x: d.y, y: -d.x }, s = dot(n, vec);
    if (s > .7 && len * s > best) { best = len * s; entryEdge = i; }
  });
  const E0 = plot[entryEdge], E1 = plot[(entryEdge + 1) % plot.length], eLen = dist(E0, E1), eDir = norm(sub(E1, E0)), eOut = { x: eDir.y, y: -eDir.x };
  const along = p => dot(sub(p, E0), eDir);
  const doorS = ctx.entryPoint ? Math.max(1.2, Math.min(eLen - 1.2, along(ctx.entryPoint))) : eLen / 2;
  const pedW = 1.1, carW = 4.2;
  let carS = doorS + pedW / 2 + .6 + carW / 2;
  if (carS + carW / 2 > eLen - .5) carS = doorS - pedW / 2 - .6 - carW / 2;
  const hasCarGate = carS - carW / 2 > .4 && carS + carW / 2 < eLen - .4;
  const gates = [{ kind: 'ped', s: doorS, w: pedW }]; if (hasCarGate) gates.push({ kind: 'car', s: carS, w: carW });
  out.entryEdge = entryEdge; out.gates = gates.map(gt => ({ ...gt, pos: add(E0, mul(eDir, gt.s)), normal: eOut }));

  // ---- boundary wall ------------------------------------------------------------------------------------
  const wallH = 1.9, wallT = .22, postS = .46, postH = 2.2;
  const wallBox = (key, a, b, y0, h, t) => { // box along plan segment a-b
    const d = sub(b, a), l = Math.hypot(d.x, d.y); if (l < .01) return;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    B.box(key, mid.x, g0 + y0 + h / 2, -mid.y, l, h, t, Math.atan2(d.y, d.x));
  };
  plot.forEach((p, i) => {
    const q = plot[(i + 1) % plot.length], len = dist(p, q), d = norm(sub(q, p));
    const pts = (s) => add(p, mul(d, s));
    let cuts = [];
    if (i === entryEdge) for (const gt of gates) cuts.push([gt.s - gt.w / 2, gt.s + gt.w / 2]);
    cuts.sort((a, b) => a[0] - b[0]);
    let cursor = 0; const spans = [];
    for (const [a, b] of cuts) { spans.push([cursor, a]); cursor = b; }
    spans.push([cursor, len]);
    for (const [a, b] of spans) {
      if (b - a < .05) continue;
      wallBox('fence', pts(a), pts(b), 0, wallH, wallT);
      wallBox('cap', pts(a), pts(b), wallH, .07, wallT + .1);
      // stone base band + an inset panel line for rhythm
      wallBox('fenceStone', pts(a), pts(b), 0, .55, wallT + .03);
      const n = Math.max(1, Math.round((b - a) / 4.2));
      for (let k = 1; k < n; k++) postAt(pts(a + (b - a) * k / n), d, false);
    }
    postAt(p, d, true);
    for (const [a, b] of cuts) { postAt(pts(a), d, true); postAt(pts(b), d, true); }
  });
  function postAt(c, d, tall) {
    const h = tall ? postH : wallH + .12, ry = Math.atan2(d.y, d.x);
    B.box('fence', c.x, g0 + h / 2, -c.y, postS, h, postS, ry);
    B.box('fenceStone', c.x, g0 + .3, -c.y, postS + .04, .6, postS + .04, ry);
    B.box('cap', c.x, g0 + h + .04, -c.y, postS + .12, .08, postS + .12, ry);
    if (tall) B.box('laneLine', c.x, g0 + h + .1, -c.y, .18, .05, .18, ry);
  }
  // gate leaves: dark metal frame with slats
  for (const gt of gates) {
    const c = add(E0, mul(eDir, gt.s)), ry = Math.atan2(eDir.y, eDir.x);
    const at = (u, y, sx, sy, sz) => { const p = add(c, mul(eDir, u)); B.box('metal', p.x, g0 + y, -p.y, sx, sy, sz, ry); };
    const w = gt.w - .1, h = gt.kind === 'car' ? 1.75 : 1.85, y0 = .12;
    at(0, y0 + .04, w, .08, .06); at(0, y0 + h - .04, w, .08, .06); at(0, y0 + h * .55, w, .05, .05);
    at(-w / 2 + .03, y0 + h / 2, .06, h, .06); at(w / 2 - .03, y0 + h / 2, .06, h, .06);
    if (gt.kind === 'car') at(0, y0 + h / 2, .06, h, .06);
    const n = Math.floor(w / .13);
    for (let i = 1; i < n; i++) at(-w / 2 + (w * i) / n, y0 + h / 2, .022, h - .1, .022);
    if (gt.kind === 'car') { at(-w / 2 + .35, y0 + h * .7, .1, .1, .07); }
    // paved threshold under the gate
    const half = gt.w / 2, o = mul(eOut, .5);
    const a = add(c, add(mul(eDir, -half), mul(eOut, -1.2))), b2 = add(c, add(mul(eDir, half), mul(eOut, -1.2)));
    const c2 = add(c, add(mul(eDir, half), o)), d2 = add(c, add(mul(eDir, -half), o));
    B.flatPoly(gt.kind === 'car' ? 'concrete' : 'paving', [a, b2, c2, d2], [], g0 + .006, 1, p => [p.x, -p.y]);
  }

  // ---- paths --------------------------------------------------------------------------------------------
  const ped = out.gates[0];
  if (ctx.entryPoint && ctx.entryNormal && ped) {
    const from = add(ped.pos, mul(eOut, -.2)), to = add(ctx.entryPoint, mul(ctx.entryNormal, ctx.stepsOut ?? 1.8));
    const d = norm(sub(to, from)), nrm = { x: -d.y, y: d.x }, hw = .8;
    const quad = [add(from, mul(nrm, -hw)), add(from, mul(nrm, hw)), add(to, mul(nrm, hw)), add(to, mul(nrm, -hw))];
    B.flatPoly('paving', ccw(quad), [], g0 + .007, 1, p => [p.x, -p.y]);
    out.path = { from, to };
  }

  // ---- street (outside the entry edge) ------------------------------------------------------------------
  {
    const ext = 18, sw = 1.8, road = 7.4;
    const s0 = -ext, s1 = eLen + ext;
    const P = (s, o) => add(add(E0, mul(eDir, s)), mul(eOut, o));
    const quad = (s0_, s1_, o0, o1) => [P(s0_, o0), P(s1_, o0), P(s1_, o1), P(s0_, o1)];
    B.flatPoly('sidewalk', ccw(quad(s0, s1, .1, sw)), [], g0 - .0, 1, p => [p.x, -p.y]);
    B.flatPoly('asphalt', ccw(quad(s0, s1, sw, sw + road)), [], g0 - .03, 1);
    for (let s = s0; s < s1; s += 5) B.flatPoly('laneLine', ccw(quad(s, s + 2.6, sw + road / 2 - .08, sw + road / 2 + .08)), [], g0 - .028, 1);
    B.flatPoly('sidewalk', ccw(quad(s0, s1, sw + road, sw + road + 1.6)), [], g0 - .0, 1, p => [p.x, -p.y]);
    out.street = { edge: entryEdge };
  }

  // ---- trees, shrubs, car -------------------------------------------------------------------------------
  const keep = buildingPoly ? insetPolygon(buildingPoly, -.8, { grow: true }) : null;
  const inside = p => pointInPolygon(p, plot, 0) && (!keep || !pointInPolygon(p, keep, 0));
  const clearOfGates = p => out.gates.every(gt => dist(p, gt.pos) > 3.2) && !(ctx.entryPoint && dist(p, ctx.entryPoint) < 3.4);
  const placed = [];
  const place = (kind, p, dims, rotY = 0) => {
    const grp = buildFixture(THREE, kind, dims, lib.fixtures);
    const m = fixtureMatrix(THREE, p.x, p.y, g0, rotY, kind);
    B.addObject(grp, mat => lib.reverse(mat), m); placed.push({ kind, p });
  };
  const inset = plot ? insetPolygon(plot, .9) : null;
  if (inset) {
    // palms near two corners, shrubs along the walls
    inset.forEach((c, i) => {
      const q = inset[(i + 1) % inset.length], d = norm(sub(q, c)), len = dist(c, q);
      if (i % 2 === 0 || inset.length > 4) { const p = add(c, mul(norm(sub({ x: cx, y: cy }, c)), .4)); if (inside(p) && clearOfGates(p)) { place('palm', p, { w: 2.4, d: 2.4, h: 5.2 + rnd() * 1.8, seed: i + 2 }); out.trees++; } }
      for (let s = 2.2; s < len - 1.6; s += 2.1 + rnd() * .5) {
        const p = add(add(c, mul(d, s)), mul({ x: -d.y, y: d.x }, .0 * 0));
        if (inside(p) && clearOfGates(p) && (!keep || !pointInPolygon(p, keep, 0))) { place('shrub', p, { w: 1.1 + rnd() * .4, d: 1, h: 1, seed: s }); }
      }
    });
    // a couple of trees in the yard when there is space
    for (let k = 0; k < 40 && out.trees < 6; k++) {
      const p = { x: bb.x0 + 1.5 + rnd() * (bb.w - 3), y: bb.y0 + 1.5 + rnd() * (bb.h - 3) };
      if (!inside(p) || !clearOfGates(p)) continue;
      if (buildingPoly && dist(p, closest(buildingPoly, p)) < 2.2) continue;
      if (placed.some(o => dist(o.p, p) < 3.2)) continue;
      place('tree', p, { w: 2.3, d: 2.3, h: 3.6, seed: k }); out.trees++;
    }
  }
  // parked car: free rectangle nearest to the vehicle gate (or the pedestrian gate)
  if (!ctx.skipCar && plot) {
    const anchor = (out.gates[1] || out.gates[0])?.pos || { x: cx, y: cy };
    const cars = [];
    for (let x = bb.x0 + 1; x <= bb.x1 - 1; x += .4) for (let y = bb.y0 + 1; y <= bb.y1 - 1; y += .4) for (const heading of [0, Math.PI / 2]) {
      const hw = heading ? 2.45 : 1.15, hh = heading ? 1.15 : 2.45;
      const corners = [{ x: x - hw, y: y - hh }, { x: x + hw, y: y - hh }, { x: x + hw, y: y + hh }, { x: x - hw, y: y + hh }];
      if (!corners.every(c => pointInPolygon(c, plot, 0))) continue;
      if (keep && (corners.some(c => pointInPolygon(c, keep, 0)) || pointInPolygon({ x, y }, keep, 0))) continue;
      if (!insetOK(plot, corners)) continue;
      if (placed.some(o => dist(o.p, { x, y }) < 1.9)) continue;
      cars.push({ x, y, heading, score: dist({ x, y }, anchor) });
    }
    cars.sort((a, b) => a.score - b.score);
    const spot = cars[0];
    if (spot) {
      // the nose points away from the street (into the plot); a car parked along the street faces the plot middle
      const noseDir = spot.heading ? { x: Math.abs(eOut.x) > .5 ? -Math.sign(eOut.x) : (spot.x > cx ? -1 : 1), y: 0 } : { x: 0, y: Math.abs(eOut.y) > .5 ? -Math.sign(eOut.y) : (spot.y > cy ? -1 : 1) };
      place('car', spot, { w: 1.9, d: 4.6, h: 1.5 }, Math.atan2(noseDir.x, noseDir.y));
      out.parking = spot;
      // blob + parking pad
      const pad = spot.heading ? { hw: 2.7, hh: 1.4 } : { hw: 1.4, hh: 2.7 };
      B.flatPoly('concrete', [{ x: spot.x - pad.hw, y: spot.y - pad.hh }, { x: spot.x + pad.hw, y: spot.y - pad.hh }, { x: spot.x + pad.hw, y: spot.y + pad.hh }, { x: spot.x - pad.hw, y: spot.y + pad.hh }], [], g0 + .006, 1);
    }
  }
  return finish(B, THREE, lib, out, g0);
}

function closest(poly, p) {
  let best = poly[0], bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ab = sub(b, a), l2 = dot(ab, ab) || 1, t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)), q = add(a, mul(ab, t)), d = dist(p, q);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function insetOK(plot, corners) { // corners keep .35 m from the boundary
  for (const c of corners) for (let i = 0; i < plot.length; i++) { const a = plot[i], b = plot[(i + 1) % plot.length]; if (dist(c, closest([a, b], c)) < .35) return false; }
  return true;
}

function finish(B, THREE, lib, out, g0) {
  const group = new THREE.Group(); group.name = 'site';
  const geos = B.toGeometries();
  for (const [key, geo] of geos) {
    const mat = lib.get(key); if (!mat) continue;
    const mesh = new THREE.Mesh(geo, mat); mesh.name = 'site:' + key;
    mesh.receiveShadow = true; mesh.castShadow = !['terrain', 'grass', 'paving', 'concrete', 'asphalt', 'sidewalk', 'laneLine'].includes(key);
    group.add(mesh);
  }
  out.group = group; out.triangles = B.triangleCount; out.ground = g0;
  return out;
}

export default { buildSite };
