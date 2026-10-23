// Builds a complete, good looking 3D building from a `mizan-draw/1` document.
//
//   const built = buildBuildingScene(doc, THREE, options);
//   scene.add(built.group);
//
// Plan (x, y up) -> three (x, up, -y).  Everything static is merged per material and per level part, so a
// villa costs well under a hundred draw calls.  The returned object also carries the data the viewer
// needs: rooms, levels (with their own groups and wall solids for collisions), the site and statistics.
import { buildWallSolids, blockingPolygons } from './wall-geometry.mjs';
import { analyzeWalls } from './topology.mjs';
import { ROOM_TYPES, roomTypeName, FIXTURES } from './catalog.mjs';
import { pointInPolygon, bounds as boundsOf, ccw, dist, sub, add, mul, dot, norm, centroid, insetPolygon } from './geom.mjs';
import { MeshBuilder, P3 } from './meshbuilder.mjs';
import { createMaterialLibrary } from './materials3d.mjs';
import { buildFixture, fixtureMatrix } from './fixtures3d.mjs';
import { stairLayout, emitStair, stairHeightAt } from './stairs3d.mjs';
import { emitOpening, archProfile } from './openings3d.mjs';
import { buildSite } from './site3d.mjs';

export { stairLayout, stairHeightAt };

export const DEFAULTS = Object.freeze({
  doors: 'ajar',            // interior door leaves: 'ajar' | 'closed' | 'open'   (entry doors stay closed)
  plinth: .45,              // finished floor above the ground, metres
  slab: .2,                 // floor / roof slab thickness
  skirting: true, cornice: true, ao: true, fixtures: true, site: true, car: true,
  stoneAccent: 'entry',     // stone cladding on the façade that holds the entry door ('entry' | 'none')
  textures: true, maxAnisotropy: 4, quality: 1,
  materials: null,          // supply a material library to share textures between scenes
});

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const hexRgb = c => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const PAINT_MIX = .5;
const tintOf = type => { const rgb = hexRgb((ROOM_TYPES[type] || ROOM_TYPES.other).color); return rgb.map(v => 1 - (1 - v) * PAINT_MIX); };
const sign = v => v < 0 ? -1 : 1;

export function buildBuildingScene(doc, THREE, options = {}) {
  const fin = doc.finish || {}, fac = fin.facade || {};
  const opt = { ...DEFAULTS, ...(fac.accent ? { stoneAccent: fac.accent } : {}), ...options };
  const ownLib = !opt.materials;
  const lib = opt.materials || createMaterialLibrary(THREE, { textures: opt.textures, maxAnisotropy: opt.maxAnisotropy, quality: opt.quality });
  const group = new THREE.Group(); group.name = 'mizan-building';
  if (ownLib) { // façade / material choices of the project
    const m = lib.m, paint = (mat, c) => { if (mat && c) mat.color.set(c); };
    paint(m.render, fac.color); paint(m.accent, fac.accentColor); paint(m.plinth, fac.plinthColor || fac.accentColor); paint(m.coping, fac.copingColor || fin.roof);
    paint(m.aluminium, fin.aluminium); paint(m.doorEntry, fin.entryDoor); paint(m.fence, fin.fence);
    if (fac.base === 'stone') { m.render.map = m.accent.map; m.render.bumpMap = m.accent.bumpMap; m.render.bumpScale = m.accent.bumpScale; m.render.needsUpdate = true; if (!fac.color) m.render.color.copy(m.accent.color); }
    if (fac.base === 'paint') { m.render.map = null; m.render.bumpMap = null; m.render.needsUpdate = true; }
  }
  const T = opt.slab, PL = opt.plinth;
  const result = { group, rooms: new Map(), levels: [], site: null, stats: {}, lib, options: opt, doc };
  const levelsDoc = doc.levels?.length ? doc.levels : [{ id: 'L1', name: 'الدور الأرضي', elevation: 0, height: 3.2 }];
  let acc = 0;
  const lvData = levelsDoc.map((lv, i) => {
    const E = Number.isFinite(lv.elevation) && (i === 0 || lv.elevation > 0) ? lv.elevation : acc, H = lv.height || 3.2; acc = E + H;
    const walls = doc.walls.filter(w => w.level === lv.id), openings = doc.openings.filter(o => o.level === lv.id || walls.some(w => w.id === o.wall));
    const solids = buildWallSolids(walls, openings, { levelHeight: H, defaultThickness: doc.settings?.defaultThickness });
    // (Round 11) fail loudly: an opening the model drops or moves is reported, never hidden
    if (solids.issues.length) { (result.openingIssues ||= []).push(...solids.issues.map(i => ({ ...i, level: lv.id }))); if (solids.issues.some(i => i.code === 'DROPPED') && typeof console !== 'undefined') console.warn('[mizan 3D] openings not built:', solids.issues.filter(i => i.code === 'DROPPED').map(i => `${i.id}: ${i.reason}`).join('; ')); }
    const analysis = analyzeWalls(walls);
    return { i, lv, id: lv.id, name: lv.name, E, H, walls, openings, solids, analysis };
  });
  const top = lvData.length - 1;

  // ---- spaces: labels, types, tints, coverage -------------------------------------------------------------------
  const inSpace = (p, s) => s.polygon && pointInPolygon(p, s.polygon, 1e-9) && !s.holes.some(h => pointInPolygon(p, h, 1e-9));
  for (const L of lvData) {
    const labels = doc.labels.filter(l => l.level === L.id);
    L.spaces = L.analysis.spaces.filter(s => s.net).map(s => {
      const label = labels.find(l => inSpace(l.seed, s)) || null;
      const type = label?.type || 'other', def = ROOM_TYPES[type] || ROOM_TYPES.other;
      return Object.assign(s, { key: L.id + ':' + s.id, levelId: L.id, label, type, name: label?.name || roomTypeName(type), floorKind: def.floor, open: !!def.open, tint: tintOf(type), levelIndex: L.i });
    });
    const next = lvData[L.i + 1];
    for (const s of L.spaces) s.covered = !!next && next.analysis.outlines.some(o => pointInPolygon(s.inside, o.polygon, 1e-9));
    L.locate = p => L.spaces.find(s => inSpace(p, s)) || null;
  }
  const outlineAll = lvData.flatMap(L => L.analysis.outlines.map(o => o.polygon));
  const groundOutline = lvData[0].analysis.outlines.length ? lvData[0].analysis.outlines.reduce((a, b) => b.area > a.area ? b : a).polygon : null;

  // ---- stairs (layouts first: stairwell holes are needed by floors, ceilings and roofs) -------------------------------
  for (const L of lvData) {
    const next = lvData[L.i + 1], rise = next ? next.E - L.E : L.H;
    L.stairs = doc.stairs.filter(s => s.level === L.id).map(s => ({ stair: s, layout: stairLayout(s, rise), E: L.E, toE: L.E + rise, levelIndex: L.i, toRoof: !next }));
  }
  const holesFor = (L, space) => { // holes of stairs below (floor of L) and own stairs (ceiling / roof of L) that lie fully inside `space`
    const fits = hole => hole.every(p => inSpace(p, space)) && true;
    const below = (lvData[L.i - 1]?.stairs || []).filter(s => !s.toRoof).map(s => s.layout.hole).filter(fits);
    const own = L.stairs.map(s => s.layout.hole).filter(fits);
    return { below, own };
  };

  // ---- build each level -----------------------------------------------------------------------------------------------
  const rooms = result.rooms;
  const fixtureBoxes = [];
  for (const L of lvData) {
    const lg = new THREE.Group(); lg.name = 'level:' + L.id; lg.userData = { levelId: L.id, index: L.i };
    const parts = {};
    const mk = name => { const g = new THREE.Group(); g.name = name; lg.add(g); parts[name] = g; return g; };
    for (const n of ['walls', 'floors', 'ceilings', 'roof', 'parapet', 'openings', 'fixtures', 'stairs', 'decals']) mk(n);
    const E = L.E, H = L.H, ceilZ = H - T, isTop = L.i === top, ground = L.i === 0;
    const parapetH = doc.roof?.parapet ?? .9;
    const W = new MeshBuilder(THREE);   // walls
    const O = new MeshBuilder(THREE);   // frames, leaves, glass
    const C = new MeshBuilder(THREE);   // ceilings
    const R = new MeshBuilder(THREE);   // roof
    const PA = new MeshBuilder(THREE);  // parapet + coping
    const F = new MeshBuilder(THREE);   // fixtures
    const S = new MeshBuilder(THREE);   // stairs
    // (Round 11) the guard rail around a stairwell hole belongs to the level whose floor has the hole: built with that level,
    // so isolating the ground floor no longer shows the upper rail floating above it
    for (const job of L.railJobs || []) job(S);
    const D = new MeshBuilder(THREE);   // decals
    for (const key of ['paint', 'render', 'plinth', 'accent', 'reveal']) W.bucket(key, { color: true });
    D.bucket('aoDecal', { alpha: true });

    // classify wall sides
    for (const seg of L.solids.segments) {
      const mid = add(seg.a, mul(seg.dir, seg.length / 2)), off = seg.t / 2 + .09;
      seg.sideL = L.locate(add(mid, mul(seg.left, off))); seg.sideR = L.locate(add(mid, mul(seg.left, -off)));
      const extL = !seg.sideL || seg.sideL.open, extR = !seg.sideR || seg.sideR.open;
      seg.ext = extL === extR ? 0 : (extL ? 1 : -1);
    }
    // stone accent on the façade that carries the entry door
    const accentSegs = new Set();
    if (opt.stoneAccent === 'entry' && ground) for (const seg of L.solids.segments) if (seg.ext !== 0 && seg.openings.some(o => o.entry)) accentSegs.add(seg.id);
    if (opt.stoneAccent === 'all' && ground) for (const seg of L.solids.segments) if (seg.ext !== 0) accentSegs.add(seg.id);

    const groundExt = ground ? PL + .08 : 0, plinthTop = .9;
    const colRows = (len, jS, jE) => ({ cols: [...(jS ? [.12, .5] : []), ...(jE ? [len - .5, len - .12] : [])] });
    const rowsInterior = [.05, .2, .5, .9, ceilZ - .55, ceilZ - .18];

    // ---- walls ------------------------------------------------------------------------------------------------------
    const faceGrid = (key, A, Bp, nrm, z0, z1, uOff, colorAt, extraCols, extraRows) => {
      const len = Math.hypot(Bp.x - A.x, Bp.y - A.y);
      if (len < 1e-5 || z1 - z0 < 1e-5) return;
      const ux = (Bp.x - A.x) / len, uy = (Bp.y - A.y) / len;
      const uniq = (arr, lo, hi) => { const a = [lo, ...arr.filter(v => v > lo + .03 && v < hi - .03).sort((p, q) => p - q), hi]; return a.filter((v, i) => !i || v - a[i - 1] > 1e-4); };
      const cols = uniq(extraCols, 0, len), rows = uniq(extraRows, z0, z1);
      const n3 = [nrm.x, 0, -nrm.y];
      const pt = (u, z) => [A.x + ux * u, E + z, -(A.y + uy * u)];
      for (let i = 0; i + 1 < cols.length; i++) for (let j = 0; j + 1 < rows.length; j++) {
        const u0 = cols[i], u1 = cols[i + 1], v0 = rows[j], v1 = rows[j + 1];
        W.quad(key, pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1), n3, [[uOff + u0, v0], [uOff + u1, v0], [uOff + u1, v1], [uOff + u0, v1]], [colorAt(u0, v0), colorAt(u1, v0), colorAt(u1, v1), colorAt(u0, v1)]);
      }
    };
    const WHITE = [1, 1, 1];
    for (const seg of L.solids.segments) {
      for (const key of ['paint', 'render', 'plinth', 'accent', 'reveal']) W.mark(key, { kind: 'wall', wallId: seg.wallId, segId: seg.id, level: L.id });
      const fence = seg.kind === 'fence' || seg.kind === 'parapet';
      for (const piece of seg.pieces) {
        const c = piece.corners, uStart = dot(sub(c.sL, seg.a), seg.dir), uStartR = dot(sub(c.sR, seg.a), seg.dir);
        for (const side of ['L', 'R']) {
          const A = side === 'L' ? c.sL : c.sR, Bp = side === 'L' ? c.eL : c.eR, nrm = side === 'L' ? seg.left : mul(seg.left, -1);
          const space = side === 'L' ? seg.sideL : seg.sideR, interior = !!space && !space.open && !fence;
          const len = dist(A, Bp), uOff = side === 'L' ? uStart : uStartR;
          const z1 = piece.z1;
          if (interior) {
            const tint = space.tint, jS = piece.startCap && seg.joint[0], jE = piece.endCap && seg.joint[1];
            const colorAt = opt.ao ? (u, z) => {
              let a = z < .9 ? .72 + .28 * smooth(z / .9) : 1;
              const zt = ceilZ - z; if (zt < .55) a *= .86 + .14 * smooth(zt / .55);
              if (jS && u < .5) a *= .8 + .2 * smooth(u / .5);
              if (jE && len - u < .5) a *= .8 + .2 * smooth((len - u) / .5);
              return [tint[0] * a, tint[1] * a, tint[2] * a];
            } : () => tint;
            faceGrid('paint', A, Bp, nrm, piece.z0, z1, uOff, colorAt, colRows(len, jS, jE).cols, rowsInterior);
          } else {
            const z0 = (piece.z0 <= 1e-9) ? -groundExt : piece.z0;
            const accent = accentSegs.has(seg.id) && !fence;
            const colorAt = opt.ao ? (u, z) => { const zz = z + (ground ? PL : 0); const a = zz < .5 ? .84 + .16 * smooth(zz / .5) : 1; return [a, a, a]; } : () => WHITE;
            if (accent) faceGrid('accent', A, Bp, nrm, z0, z1, uOff, colorAt, [], [0, .5, 1, 1.5, 2, 2.5, 3]);
            else if (z0 < plinthTop && !fence && fac.plinth !== false) {
              faceGrid('plinth', A, Bp, nrm, z0, Math.min(z1, plinthTop), uOff, colorAt, [], [0]);
              if (z1 > plinthTop) faceGrid('render', A, Bp, nrm, plinthTop, z1, uOff, colorAt, [], []);
            } else faceGrid('render', A, Bp, nrm, z0, z1, uOff, colorAt, [], []);
          }
        }
        // top / bottom / reveals
        const topKey = piece.z1 >= seg.h - 1e-6 ? 'cap' : 'reveal';
        W.flatPoly(topKey, piece.poly, [], E + piece.z1, 1, p => [p.x, -p.y]);
        if (piece.z0 > 1e-6) W.flatPoly('reveal', piece.poly, [], E + piece.z0, -1, p => [p.x, -p.y]);
        const endFace = (A, Bp, n, z0, z1) => faceGrid('reveal', A, Bp, n, z0, z1, 0, () => WHITE, [], []);
        if (piece.kind === 'pier') {
          if (!piece.startCap) endFace(c.sR, c.sL, mul(seg.dir, -1), piece.z0, piece.z1);
          if (!piece.endCap) endFace(c.eL, c.eR, seg.dir, piece.z0, piece.z1);
        }
        if (piece.startCap && seg.deg[0] === 1) endFace(c.sR, c.sL, mul(seg.dir, -1), piece.z0, piece.z1);
        if (piece.endCap && seg.deg[1] === 1) endFace(c.eL, c.eR, seg.dir, piece.z0, piece.z1);
        // skirting boards and ceiling cornice on room faces
        for (const side of ['L', 'R']) {
          const space = side === 'L' ? seg.sideL : seg.sideR; if (!space || space.open || fence) continue;
          const A = side === 'L' ? c.sL : c.sR, Bp = side === 'L' ? c.eL : c.eR, nrm = side === 'L' ? seg.left : mul(seg.left, -1);
          const len = dist(A, Bp); if (len < .05) continue;
          const mid = { x: (A.x + Bp.x) / 2 + nrm.x * .007, y: (A.y + Bp.y) / 2 + nrm.y * .007 }, ry = Math.atan2(Bp.y - A.y, Bp.x - A.x);
          if (opt.skirting && piece.z0 <= 1e-6 && (piece.kind === 'full' || piece.kind === 'pier' || piece.kind === 'sill')) W.box('skirting', mid.x, E + .055, -mid.y, len, .11, .014, ry);
          if (opt.cornice && piece.z1 >= ceilZ - 1e-6 && piece.kind !== 'sill') { const m2 = { x: (A.x + Bp.x) / 2 + nrm.x * .02, y: (A.y + Bp.y) / 2 + nrm.y * .02 }; W.box('ceiling', m2.x, E + ceilZ - .04, -m2.y, len, .08, .04, ry); }
        }
      }
      // arch spandrels
      for (const o of seg.openings) if (o.kind === 'arch') {
        const prof = archProfile(o);
        const at = (u, ln, z) => { const p = add(add(o.center, mul(seg.dir, u)), mul(seg.left, ln)); return [p.x, E + z, -p.y]; };
        for (const side of ['L', 'R']) {
          const ln = (side === 'L' ? 1 : -1) * seg.t / 2, space = side === 'L' ? seg.sideL : seg.sideR, interior = !!space && !space.open;
          const key = interior ? 'paint' : 'render', col = interior ? space.tint : WHITE, n3 = [(side === 'L' ? seg.left.x : -seg.left.x), 0, -(side === 'L' ? seg.left.y : -seg.left.y)];
          for (const poly of [prof.left, prof.right]) W.fan(key, poly.map(p => at(p.u, ln, p.z)), n3, p => [p[0], p[1]], undefined, col);
        }
        for (let i = 0; i + 1 < prof.arc.length; i++) {
          const a = prof.arc[i], b = prof.arc[i + 1], mu = (a.u + b.u) / 2, mz = (a.z + b.z) / 2 - (o.z1 - prof.R);
          const nl = Math.hypot(mu, mz) || 1, np = add(mul(seg.dir, -mu / nl), { x: 0, y: 0 });
          void np;
          W.quad('reveal', at(a.u, seg.t / 2, a.z), at(b.u, seg.t / 2, b.z), at(b.u, -seg.t / 2, b.z), at(a.u, -seg.t / 2, a.z), [-(mu / nl) * seg.dir.x, -mz / nl, (mu / nl) * seg.dir.y], null, [WHITE, WHITE, WHITE, WHITE]);
        }
      }
    }

    // ---- parapet + coping on roofs ----------------------------------------------------------------------------------
    const parapetWalls = [];
    if (parapetH > 0) for (const seg of L.solids.segments) {
      if (seg.kind === 'fence' || seg.kind === 'parapet') continue;
      const sp = seg.sideL || seg.sideR;
      if (!(!seg.sideL || !seg.sideR) || !sp || sp.open || sp.covered) continue;
      // wall between a roofed room and the outdoors
      const c = seg.corners;
      for (const [A, Bp, nrm] of [[c.aL, c.bL, seg.left], [c.aR, c.bR, mul(seg.left, -1)]]) {
        const len = dist(A, Bp), ux = (Bp.x - A.x) / len, uy = (Bp.y - A.y) / len, n3 = [nrm.x, 0, -nrm.y];
        const pt = (u, y) => [A.x + ux * u, E + y, -(A.y + uy * u)];
        PA.quad('fence', pt(0, H), pt(len, H), pt(len, H + parapetH), pt(0, H + parapetH), n3, [[0, H], [len, H], [len, H + parapetH], [0, H + parapetH]]);
      }
      // (Round 14) projecting cornice band at roof level on the outer face (a classic stone cornice under the parapet)
      if (opt.cornice !== false) { const outerL = !seg.sideL, A0 = outerL ? c.aL : c.aR, B0 = outerL ? c.bL : c.bR, nn = outerL ? seg.left : mul(seg.left, -1), dd = norm(sub(B0, A0));
        const a0 = sub(A0, mul(dd, .16)), b0 = add(B0, mul(dd, .16)); PA.prism({ top: 'cap', side: 'cap', bottom: 'cap' }, [a0, b0, add(b0, mul(nn, .16)), add(a0, mul(nn, .16))], E + H - .04, E + H + .2); }
      parapetWalls.push({ id: seg.wallId + '#' + seg.id, level: L.id, a: seg.a, b: seg.b, t: seg.t + .1, h: .07, kind: 'wall' });
    }
    if (parapetWalls.length) {
      const cop = buildWallSolids(parapetWalls, [], { levelHeight: .07 });
      for (const s of cop.segments) PA.prism({ top: 'cap', side: 'cap', bottom: 'none' }, s.quad, E + H + parapetH, E + H + parapetH + .07);
      for (const j of cop.joints) PA.prism({ top: 'cap', side: 'cap', bottom: 'none' }, j.poly, E + H + parapetH, E + H + parapetH + .07);
    }

    // ---- rooms: floors, ceilings, roofs, slabs ----------------------------------------------------------------------
    // فراغ مزدوج الارتفاع (نوع «void» في الدور الذي فوقه): لا أرضية له في دوره، والفراغ الذي تحته بلا سقف ولا سطح هناك
    const isVoid = sp => !!ROOM_TYPES[sp.type]?.void;
    const voidsAbove = (lvData[L.i + 1]?.spaces || []).filter(isVoid);
    for (const sp of L.spaces) {
      const holes = holesFor(L, sp), net = sp.net, polyHoles = sp.holes;
      if (isVoid(sp)) {
        rooms.set(sp.key, { key: sp.key, id: sp.key, spaceId: sp.id, levelId: L.id, levelIndex: L.i, name: sp.name, type: sp.type, label: sp.label, floorKind: null, area: sp.area, polygon: net, holes: polyHoles, bounds: boundsOf(net), centroid: sp.centroid, inside: sp.inside, elevation: E, height: H, open: false, floor: null, edges: sp.edges, void: true });
        C.flatPoly('ceiling', net, [...polyHoles, ...holes.own], E + ceilZ, -1, p => [p.x, p.y]);
        if (!sp.covered) R.flatPoly('roof', net, [...polyHoles, ...holes.own], E + H, 1, p => [p.x, -p.y]);
        continue;
      }
      // فراغ تحت فراغ مزدوج: يُترك السقف (والسطح) مفتوحًا بقدر الفراغ العلوي — كله إن غطّاه، أو ثقبًا إن كان داخله
      const vAll = voidsAbove.some(v => pointInPolygon(sp.inside, v.net, 1e-9) && sp.net.every(p => pointInPolygon(p, v.net, .12)));
      const vHoles = vAll ? [] : voidsAbove.filter(v => v.net.every(p => pointInPolygon(p, sp.net, .12))).map(v => v.net);
      const floorKey = (doc.finish?.floors || {})[sp.type] || ROOM_TYPES[sp.type]?.floor || 'tile';
      const floorMat = lib.get(floorKey) || lib.get('tile');
      const fb = new MeshBuilder(THREE);
      fb.flatPoly(floorKey, net, [...polyHoles, ...holes.below], E, 1, p => [p.x, -p.y]);
      const geo = fb.toGeometries().get(floorKey);
      const mesh = new THREE.Mesh(geo, floorMat); mesh.receiveShadow = true; mesh.name = 'floor:' + sp.key;
      mesh.userData = { kind: 'room', room: sp.key, spaceId: sp.id, levelId: L.id };
      parts.floors.add(mesh);
      holes.below.forEach(h => { // slab edge around a stairwell
        for (let i = 0; i < 4; i++) { const a = h[i], b = h[(i + 1) % 4]; S.quad('slabEdge', P3(a.x, a.y, E - T), P3(b.x, b.y, E - T), P3(b.x, b.y, E), P3(a.x, a.y, E), null, [[0, 0], [dist(a, b), 0], [dist(a, b), T], [0, T]]); }
      });
      const bnds = boundsOf(net);
      const room = { key: sp.key, id: sp.key, spaceId: sp.id, levelId: L.id, levelIndex: L.i, name: sp.name, type: sp.type, label: sp.label, floorKind: floorKey, area: sp.area, polygon: net, holes: polyHoles, bounds: bnds, centroid: sp.centroid, inside: sp.inside, elevation: E, height: H, open: sp.open, floor: mesh, edges: sp.edges };
      rooms.set(sp.key, room);
      if (!sp.open && !vAll) {
        C.flatPoly('ceiling', net, [...polyHoles, ...holes.own, ...vHoles], E + ceilZ, -1, p => [p.x, p.y]);
        if (!sp.covered) R.flatPoly('roof', net, [...polyHoles, ...holes.own, ...vHoles], E + H, 1, p => [p.x, -p.y]);
      }
      holes.own.forEach(h => { // the hole's edge in the slab above
        for (let i = 0; i < 4; i++) { const a = h[i], b = h[(i + 1) % 4]; S.quad('slabEdge', P3(a.x, a.y, E + ceilZ), P3(b.x, b.y, E + ceilZ), P3(b.x, b.y, E + H), P3(a.x, a.y, E + H), null, [[0, 0], [dist(a, b), 0], [dist(a, b), T], [0, T]]); }
      });
    }
    // AO strips come from the wall pieces (they already know their room face and the door gaps)
    if (opt.ao) {
      const strip = (A, Bp, nrm, wdt, a0, y, down) => {
        const q0 = [A.x, y, -A.y], q1 = [Bp.x, y, -Bp.y], q2 = [Bp.x + nrm.x * wdt, y, -(Bp.y + nrm.y * wdt)], q3 = [A.x + nrm.x * wdt, y, -(A.y + nrm.y * wdt)];
        D.quad('aoDecal', q0, q1, q2, q3, [0, down ? -1 : 1, 0], null, [[0, 0, 0, a0], [0, 0, 0, a0], [0, 0, 0, 0], [0, 0, 0, 0]]);
      };
      for (const seg of L.solids.segments) {
        if (seg.kind === 'fence' || seg.kind === 'parapet') continue;
        for (const piece of seg.pieces) {
          const c = piece.corners;
          for (const side of ['L', 'R']) {
            const space = side === 'L' ? seg.sideL : seg.sideR; if (!space || space.open) continue;
            const A = side === 'L' ? c.sL : c.sR, Bp = side === 'L' ? c.eL : c.eR, nrm = side === 'L' ? seg.left : mul(seg.left, -1);
            if (piece.z0 <= 1e-6 && piece.kind !== 'lintel') strip(A, Bp, nrm, .5, .34, E + .006, false);
            if (piece.z1 >= ceilZ - 1e-6) strip(A, Bp, nrm, .45, .2, E + ceilZ - .004, true);
          }
        }
      }
      // outdoors: dark contact band around the ground floor walls
      if (ground) for (const seg of L.solids.segments) {
        if (seg.kind === 'fence' || seg.kind === 'parapet') continue;
        for (const piece of seg.pieces) {
          if (piece.z0 > 1e-6) continue; const c = piece.corners;
          for (const side of ['L', 'R']) {
            const space = side === 'L' ? seg.sideL : seg.sideR; if (space && !space.open) continue;
            const A = side === 'L' ? c.sL : c.sR, Bp = side === 'L' ? c.eL : c.eR, nrm = side === 'L' ? seg.left : mul(seg.left, -1);
            strip(A, Bp, nrm, .7, .3, E - PL + .012, false);
          }
        }
      }
    }

    // ---- openings (frames, doors, glass) ----------------------------------------------------------------------------
    for (const seg of L.solids.segments) for (const o of seg.openings) {
      const door = o.entry ? 'closed' : opt.doors;
      emitOpening(O, o, { E, ext: seg.ext, door: seg.ext !== 0 ? 'closed' : door });
      // entry steps, landing and canopy
      if (ground && seg.ext !== 0 && ['door', 'door2', 'slider', 'arch'].includes(o.kind) && o.entry) {
        const out = mul(seg.left, seg.ext), side = { x: -out.y, y: out.x }, hw = o.w / 2 + .55, face = seg.t / 2;
        const tops = [-.02, -.02 - PL * .3, -.02 - PL * .62];
        const depth = [1.25, .32, .32];
        let d0 = face;
        tops.forEach((top, idx) => {
          const d1 = d0 + depth[idx], grow = idx * .22, a = hw + grow;
          const p0 = add(add(o.center, mul(out, d0)), mul(side, -a)), p1 = add(add(o.center, mul(out, d0)), mul(side, a)), p2 = add(add(o.center, mul(out, d1)), mul(side, a)), p3 = add(add(o.center, mul(out, d1)), mul(side, -a));
          O.prism({ top: 'stairTread', side: 'stairRiser', bottom: 'none' }, [p0, p1, p2, p3], E - PL, E + top);
          d0 = d1;
        });
        // canopy
        const proj = 1.55, cw = o.w + 1.7, cz = o.z1 + .52, ch = .16;
        const q0 = add(add(o.center, mul(out, face - .02)), mul(side, -cw / 2)), q1 = add(add(o.center, mul(out, face - .02)), mul(side, cw / 2));
        const q2 = add(q1, mul(out, proj)), q3 = add(q0, mul(out, proj));
        O.prism({ top: 'cap', side: 'trim', bottom: 'trim' }, [q0, q1, q2, q3], E + cz, E + cz + ch);
        result.entry = { levelId: L.id, point: o.center, normal: out, width: o.w, wallId: seg.wallId, opening: o.id, steps: 1.25 + .64 };
      }
    }

    // ---- (Round 12) window shading: a horizontal overhang over every exterior window, and vertical fins on windows that face
    //      east or west (low sun) — Mizan default façade detail; doc.finish.facade.shading === false turns it off
    if (opt.shading !== false && fac.shading !== false) {
      const north = (Number(doc.north) || 0) * Math.PI / 180;
      for (const seg of L.solids.segments) {
        if (seg.ext === 0 || seg.kind === 'fence' || seg.kind === 'parapet') continue;
        const out = mul(seg.left, seg.ext), side = { x: -out.y, y: out.x }, face = seg.t / 2;
        // true compass of the outward normal (plan +y = north when doc.north = 0)
        const bx = out.x * Math.cos(north) + out.y * Math.sin(north), eastWest = Math.abs(bx) > .7;
        for (const o of seg.openings) {
          if (!['window', 'window2'].includes(o.kind) || !(o.w >= .5)) continue;
          // (Round 14) deeper shading on the south and west (hot sun) — Mizan default; compass of the outward normal
          const byC = out.y * Math.cos(north) - out.x * Math.sin(north), compass = eastWest ? (bx > 0 ? 'e' : 'w') : (byC > 0 ? 'n' : 's');
          const hot = compass === 's' || compass === 'w';
          const proj = hot ? (o.w >= 2 ? .95 : .8) : o.w >= 2 ? .6 : .45, ow = o.w + (hot ? .5 : .3), z = o.z1 + .1;
          const q0 = add(add(o.center, mul(out, face - .01)), mul(side, -ow / 2)), q1 = add(add(o.center, mul(out, face - .01)), mul(side, ow / 2));
          O.prism({ top: 'cap', side: 'trim', bottom: 'trim' }, [q0, q1, add(q1, mul(out, proj)), add(q0, mul(out, proj))], E + z, E + z + .1);
          // (Round 14) stone surround around every exterior window (head, jambs, sill band) — reads as cut-stone framing
          { const fz0 = E + (o.z0 ?? o.z1 - (o.h || 1.2)) - .12, fz1 = E + o.z1 + .02, fw = .12, fo = .05;
            for (const sg of [-1, 1]) { const j0 = add(add(o.center, mul(out, face - .01)), mul(side, sg * (o.w / 2))), j1 = add(j0, mul(side, sg * fw)); O.prism({ top: 'sillStone', side: 'sillStone', bottom: 'sillStone' }, [j0, j1, add(j1, mul(out, fo)), add(j0, mul(out, fo))], fz0, fz1); }
            const h0 = add(add(o.center, mul(out, face - .01)), mul(side, -(o.w / 2 + fw))), h1 = add(add(o.center, mul(out, face - .01)), mul(side, o.w / 2 + fw));
            O.prism({ top: 'sillStone', side: 'sillStone', bottom: 'sillStone' }, [h0, h1, add(h1, mul(out, fo + .02)), add(h0, mul(out, fo + .02))], fz0 - .06, fz0 + .06); }
          // (Round 14) privacy screen (mashrabiya) on street-facing windows of a majlis or a dining room — Mizan default;
          // doc.finish.facade.privacy === false turns it off (the client's choice wins)
          const inner = seg.ext === 1 ? seg.sideR : seg.sideL, streets = new Set([doc.entry || 's', ...(doc.streets || [])]);
          if (fac.privacy !== false && inner && ['majlis', 'dining'].includes(inner.type) && streets.has(compass)) {
            const z0 = E + (o.z0 ?? o.z1 - (o.h || 1.2)) - .02, z1 = E + o.z1 + .02, off = face + .07, hw = o.w / 2 + .04, n = Math.max(6, Math.round(o.w / .07));
            const at = (u, d) => add(add(o.center, mul(out, off + d)), mul(side, u));
            for (const [u0, u1] of [[-hw - .05, -hw], [hw, hw + .05]]) O.prism({ top: 'wood', side: 'wood', bottom: 'wood' }, [at(u0, 0), at(u1, 0), at(u1, .05), at(u0, .05)], z0, z1);
            for (const zz of [z0, z1 - .05]) O.prism({ top: 'wood', side: 'wood', bottom: 'wood' }, [at(-hw - .05, 0), at(hw + .05, 0), at(hw + .05, .05), at(-hw - .05, .05)], zz, zz + .05);
            for (let k = 1; k < n; k++) { const u = -hw + 2 * hw * k / n; O.prism({ top: 'wood', side: 'wood', bottom: 'wood' }, [at(u - .012, .005), at(u + .012, .005), at(u + .012, .04), at(u - .012, .04)], z0 + .05, z1 - .05); }
            for (let zz = z0 + .3; zz < z1 - .15; zz += .16) O.prism({ top: 'wood', side: 'wood', bottom: 'wood' }, [at(-hw, .005), at(hw, .005), at(hw, .04), at(-hw, .04)], zz, zz + .025);
            (result.privacyScreens ||= []).push({ level: L.id, opening: o.id, room: inner.name, compass });
          }
          if (eastWest) for (const sg of [-1, 1]) {
            const c0 = add(add(o.center, mul(out, face - .01)), mul(side, sg * (o.w / 2 + .1))), c1 = add(c0, mul(side, sg * .06)), fp = Math.min(proj, .35);
            O.prism({ top: 'cap', side: 'trim', bottom: 'trim' }, [c0, c1, add(c1, mul(out, fp)), add(c0, mul(out, fp))], E + (o.z0 ?? o.z1 - (o.h || 1.2)), E + z);
          }
        }
      }
    }

    // ---- stairs -----------------------------------------------------------------------------------------------------
    for (const st of L.stairs) emitStair(S, st.layout, E, { glass: 'glass' });
    // guard rail around the stairwell hole in the floor above
    const upper = lvData[L.i + 1];
    for (const st of L.stairs) {
      const lay = st.layout, holeInUse = upper ? upper.spaces.some(s => lay.hole.every(p => inSpace(p, s))) : L.spaces.some(s => lay.hole.every(p => inSpace(p, s)));
      if (!holeInUse) continue;
      const lastStep = lay.steps[lay.steps.length - 1], lc = lastStep ? centroid(lastStep.poly) : lay.hole[2];
      const yFloor = E + (st.toE - E);
      // skip the hole edge nearest to the arrival (top) step
      let skip = 0, best = Infinity;
      for (let i = 0; i < 4; i++) { const a = lay.hole[i], b = lay.hole[(i + 1) % 4], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d = dist(m, lc); if (d < best) { best = d; skip = i; } }
      const rail = B => {
        for (let i = 0; i < 4; i++) {
          if (i === skip) continue;
          const a = lay.hole[i], b = lay.hole[(i + 1) % 4], len = dist(a, b), n = Math.max(1, Math.ceil(len / 1.2));
          B.beam('metal', P3(a.x, a.y, yFloor + .96), P3(b.x, b.y, yFloor + .96), .05, .04);
          B.beam('metal', P3(a.x, a.y, yFloor + .5), P3(b.x, b.y, yFloor + .5), .02, .02);
          for (let k = 0; k <= n; k++) { const t = k / n, px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t; B.beam('metal', P3(px, py, yFloor), P3(px, py, yFloor + .96), .04, .04); }
        }
      };
      if (upper) (upper.railJobs ||= []).push(rail); else rail(S); // roof hatch (no upper level): stays with this level
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------
    if (opt.fixtures) {
      const keyOf = mat => lib.reverse(mat);
      for (const fx of doc.fixtures.filter(f => f.level === L.id)) {
        const def = FIXTURES[fx.kind]; if (!def) continue;
        const dims = { w: fx.w ?? def.w, d: fx.d ?? def.d, h: fx.h ?? def.h, seed: fx.x * 3.1 + fx.y };
        const grp = buildFixture(THREE, fx.kind, dims, lib.fixtures);
        const m = fixtureMatrix(THREE, fx.x, fx.y, E, fx.rot || 0, fx.kind);
        F.addObject(grp, keyOf, m);
        if (opt.ao && fx.kind !== 'rug' && fx.kind !== 'car' && fx.kind !== 'tree') { // contact shadow
          const ry = Math.PI - (fx.rot || 0), cs = Math.cos(ry), sn = Math.sin(ry);
          const hw = dims.w / 2 * 1.28 + .08, hd = dims.d / 2 * 1.28 + .08;
          const cor = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [fx.x + x * cs + z * sn, E + .005, -fx.y - x * sn + z * cs]);
          F.quad('shadowBlob', cor[0], cor[1], cor[2], cor[3], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        }
        const rot = fx.rot || 0, ca = Math.cos(rot), sa = Math.sin(rot);
        if (fx.kind !== 'rug') fixtureBoxes.push({ level: L.id, id: fx.id, kind: fx.kind, x: fx.x, y: fx.y, hw: dims.w / 2, hd: dims.d / 2, rot, poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const lx = sx * dims.w / 2, ly = sy * dims.d / 2; return { x: fx.x + lx * ca + ly * sa, y: fx.y - lx * sa + ly * ca }; }) });
      }
    }

    // ---- meshes from builders ---------------------------------------------------------------------------------------
    const toMeshes = (builder, part, { cast = true, receive = true, order = 0, tagged = false } = {}) => {
      for (const [key, geo] of builder.toGeometries()) {
        const mat = lib.get(key); if (!mat) continue;
        const mesh = new THREE.Mesh(geo, mat); mesh.name = L.id + ':' + part.name + ':' + key;
        mesh.castShadow = cast && !mat.transparent; mesh.receiveShadow = receive; mesh.renderOrder = order || (mat.transparent ? 3 : 0);
        if (tagged || geo.userData.tags) { mesh.userData.tags = geo.userData.tags; mesh.userData.levelId = L.id; }
        part.add(mesh);
      }
    };
    toMeshes(W, parts.walls, { tagged: true });
    toMeshes(O, parts.openings);
    toMeshes(C, parts.ceilings, { cast: false });
    toMeshes(R, parts.roof);
    toMeshes(PA, parts.parapet);
    toMeshes(F, parts.fixtures);
    toMeshes(S, parts.stairs);
    toMeshes(D, parts.decals, { cast: false, receive: false, order: 1 });
    // doc roof flag: the roof of the top level may be hidden by the viewer
    L.group = lg; L.parts = parts;
    const triangles = [W, O, C, R, PA, F, S, D].reduce((n, b) => n + b.triangleCount, 0);
    // collision data for walking
    L.colliders = blockingPolygons(L.solids);
    group.add(lg);
    const eps = .001;
    result.levels.push({ id: L.id, name: L.name, index: L.i, elevation: E, height: H, top: E + H, group: lg, parts, solids: L.solids, analysis: L.analysis, spaces: L.spaces, locate: L.locate, colliders: L.colliders, stairs: L.stairs, triangles, topLevel: isTop, eps });
  }
  result.fixtureBoxes = fixtureBoxes;

  // ---- site ---------------------------------------------------------------------------------------------------------
  let bbox = boundsOf(outlineAll.flat().length ? outlineAll.flat() : doc.walls.flatMap(w => [w.a, w.b]));
  if (opt.site) {
    const entry = result.entry;
    result.site = buildSite(THREE, doc, lib, { y: -PL, outline: groundOutline, entryPoint: entry?.point || null, entryNormal: entry?.normal || null, stepsOut: entry?.steps, skipCar: !opt.car });
    group.add(result.site.group);
    result.site.group.position.y = 0;
  }
  const plotB = doc.plot?.polygon?.length ? boundsOf(doc.plot.polygon) : null;
  const topY = lvData[top].E + lvData[top].H + (doc.roof?.parapet ?? .9) + .1;
  result.bounds = { x0: bbox.x0, y0: bbox.y0, x1: bbox.x1, y1: bbox.y1, minY: -PL, maxY: topY, w: bbox.w, h: bbox.h };
  result.plotBounds = plotB;
  result.footprint = groundOutline;
  result.groundY = -PL;

  // ---- statistics ---------------------------------------------------------------------------------------------------
  let meshes = 0, triangles = 0;
  group.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  result.stats = { meshes, triangles, rooms: rooms.size, levels: lvData.length, openingIssues: (result.openingIssues || []).length, openingsDropped: (result.openingIssues || []).filter(i => i.code === 'DROPPED').length };

  /** Which room contains a plan point on a level (id or index)? */
  result.roomAt = (x, y, levelRef = 0) => {
    const lv = typeof levelRef === 'number' ? result.levels[levelRef] : result.levels.find(l => l.id === levelRef);
    const sp = lv?.locate({ x, y }); return sp ? rooms.get(sp.key) : null;
  };
  result.dispose = () => {
    const geos = new Set();
    group.traverse(o => { if (o.isMesh) geos.add(o.geometry); });
    geos.forEach(g => g.dispose());
    if (ownLib) lib.dispose();
    group.removeFromParent();
  };
  return result;
}

/** Flat dark "poché" polygons where walls are cut by a horizontal plane at `height` (metres above the datum). */
export function buildSectionCap(THREE, built, height, material) {
  const B = new MeshBuilder(THREE), g = new THREE.Group(); g.name = 'section-cap';
  for (const lv of built.levels) {
    const zr = height - lv.elevation; if (zr < 0 || zr > lv.height) continue;
    for (const seg of lv.solids.segments) for (const p of seg.pieces) if (p.z0 <= zr && p.z1 >= zr) B.flatPoly('section', p.poly, [], height + .002, 1, q => [q.x, -q.y]);
    for (const j of lv.solids.joints) B.flatPoly('section', j.poly, [], height + .002, 1);
  }
  for (const [, geo] of B.toGeometries()) { const m = new THREE.Mesh(geo, material); m.renderOrder = 2; g.add(m); }
  return g;
}

export default { buildBuildingScene, buildSectionCap, stairLayout, stairHeightAt, DEFAULTS };
